'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchOrders, createOrder, ApiError, type LineItemInput } from '@/lib/api-client';
import { formatMinor } from '@/lib/money';

const STATUS_OPTIONS = ['all', 'pending', 'partially_paid', 'paid', 'overdue'] as const;

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
            <option key={s} value={s}>
              {s}
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
                <td>{formatMinor(o.totalMinor)}</td>
                <td>{formatMinor(o.amountPaidMinor)}</td>
                <td>{formatMinor(o.amountDueMinor)}</td>
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

function NewOrderForm({ onCreated }: { onCreated: () => void }) {
  const [customer, setCustomer] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [lineItems, setLineItems] = useState<LineItemInput[]>([
    { description: '', quantity: 1, unitPriceMinor: 0 },
  ]);

  const mutation = useMutation({
    mutationFn: () => createOrder({ customer, dueDate, lineItems }),
    onSuccess: onCreated,
  });

  function updateLineItem(index: number, patch: Partial<LineItemInput>) {
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
      <div className="row">
        <input placeholder="Customer" value={customer} onChange={(e) => setCustomer(e.target.value)} required />
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
      </div>

      {lineItems.map((item, i) => (
        <div className="row" key={i}>
          <input
            placeholder="Description"
            value={item.description}
            onChange={(e) => updateLineItem(i, { description: e.target.value })}
            required
          />
          <input
            type="number"
            min={1}
            step={1}
            placeholder="Qty"
            style={{ width: 80 }}
            value={item.quantity}
            onChange={(e) => updateLineItem(i, { quantity: Number(e.target.value) })}
          />
          <input
            type="number"
            min={0}
            step={1}
            placeholder="Unit price (minor units)"
            style={{ width: 160 }}
            value={item.unitPriceMinor}
            onChange={(e) => updateLineItem(i, { unitPriceMinor: Number(e.target.value) })}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() => setLineItems((items) => [...items, { description: '', quantity: 1, unitPriceMinor: 0 }])}
      >
        + Add line item
      </button>

      <button type="submit" disabled={mutation.isPending}>
        Create order
      </button>
      {mutation.isError && (
        <p className="error-text">
          {mutation.error instanceof ApiError ? mutation.error.message : 'Something went wrong'}
        </p>
      )}
    </form>
  );
}
