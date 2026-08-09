'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchOrders, createOrder, ApiError } from '@/lib/api-client';
import { formatMinor, majorToMinor } from '@/lib/money';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'partially_paid', label: 'Partially paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
] as const;

export default function OrdersListPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <OrdersListContent />
    </Suspense>
  );
}

function OrdersListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const status = searchParams.get('status') ?? 'all';
  const queryClient = useQueryClient();

  const { data: orders, isLoading, error } = useQuery({
    queryKey: ['orders', status],
    queryFn: () => fetchOrders(status === 'all' ? undefined : status),
  });

  const [showForm, setShowForm] = useState(false);

  function setStatus(next: string) {
    const params = new URLSearchParams(searchParams);
    if (next === 'all') params.delete('status');
    else params.set('status', next);
    router.push(`/orders?${params.toString()}`);
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Orders</h1>
        <button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : 'New order'}</button>
      </div>

      {showForm && (
        <NewOrderForm
          onCreated={() => {
            setShowForm(false);
            queryClient.invalidateQueries({ queryKey: ['orders'] });
          }}
        />
      )}

      <div className="row">
        <label htmlFor="status-filter">Status:</label>
        <select id="status-filter" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p>Loading…</p>}
      {error && <p className="error-text">{(error as Error).message}</p>}

      {orders && (
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Status</th>
              <th>Total</th>
              <th>Paid</th>
              <th>Amount due</th>
              <th>Due date</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o._id}>
                <td>
                  <Link href={`/orders/${o._id}`}>{o.customer}</Link>
                </td>
                <td>
                  <span className={`badge badge-${o.displayStatus}`}>{o.displayStatus}</span>
                </td>
                <td>${formatMinor(o.totalMinor)}</td>
                <td>${formatMinor(o.amountPaidMinor)}</td>
                <td>${formatMinor(o.amountDueMinor)}</td>
                <td>{new Date(o.dueDate).toLocaleDateString()}</td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={6}>No orders.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

interface FormLineItem {
  description: string;
  quantity: number;
  /** Kept as a dollar-amount string while editing; converted to unitPriceMinor at submit. */
  unitPrice: string;
}

function NewOrderForm({ onCreated }: { onCreated: () => void }) {
  const [customer, setCustomer] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [lineItems, setLineItems] = useState<FormLineItem[]>([
    { description: '', quantity: 1, unitPrice: '' },
  ]);

  const mutation = useMutation({
    mutationFn: () =>
      createOrder({
        customer,
        dueDate,
        lineItems: lineItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPriceMinor: majorToMinor(item.unitPrice || '0'),
        })),
      }),
    onSuccess: onCreated,
  });

  function updateLineItem(index: number, patch: Partial<FormLineItem>) {
    setLineItems((items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  return (
    <form
      className="stack"
      style={{ border: '1px solid #8884', borderRadius: 8, padding: '1rem' }}
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <p className="hint">Create an order by listing what was sold. Total is calculated automatically.</p>

      <div className="row">
        <div className="field">
          <label htmlFor="new-order-customer">Customer name</label>
          <input
            id="new-order-customer"
            placeholder="e.g. Acme Co"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="new-order-due-date">Due date</label>
          <input
            id="new-order-due-date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="stack">
        <label style={{ fontSize: '0.9rem', fontWeight: 600 }}>Line items</label>
        {lineItems.map((item, i) => (
          <div className="row" key={i}>
            <div className="field">
              {i === 0 && <label>Description</label>}
              <input
                placeholder="e.g. Widget"
                value={item.description}
                onChange={(e) => updateLineItem(i, { description: e.target.value })}
                required
              />
            </div>
            <div className="field">
              {i === 0 && <label>Quantity</label>}
              <input
                type="number"
                min={1}
                step={1}
                style={{ width: 80 }}
                value={item.quantity}
                onChange={(e) => updateLineItem(i, { quantity: Number(e.target.value) })}
              />
            </div>
            <div className="field">
              {i === 0 && <label>Price per unit ($)</label>}
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder="0.00"
                style={{ width: 120 }}
                value={item.unitPrice}
                onChange={(e) => updateLineItem(i, { unitPrice: e.target.value })}
                required
              />
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setLineItems((items) => [...items, { description: '', quantity: 1, unitPrice: '' }])}
        >
          + Add line item
        </button>
      </div>

      <button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Creating…' : 'Create order'}
      </button>
      {mutation.isError && (
        <p className="error-text">
          {mutation.error instanceof ApiError ? mutation.error.message : 'Something went wrong'}
        </p>
      )}
    </form>
  );
}
