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
    <div className="stack" style={{ gap: '1.5rem' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Orders</h1>
          <p className="hint" style={{ marginTop: '0.25rem' }}>Manage customer orders, view balances, and record payment settlements</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ New order'}
        </button>
      </div>

      {showForm && (
        <NewOrderForm
          onCreated={() => {
            setShowForm(false);
            queryClient.invalidateQueries({ queryKey: ['orders'] });
          }}
        />
      )}

      <div className="row" style={{ alignItems: 'center', gap: '0.75rem' }}>
        <label htmlFor="status-filter" style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>Filter status:</label>
        <select id="status-filter" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 'auto', minWidth: 160 }}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p className="hint">Loading orders…</p>}
      {error && <p className="error-text">{(error as Error).message}</p>}

      {orders && (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Status</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Amount due</th>
                <th>Due date</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o._id}>
                  <td style={{ fontWeight: 600 }}>
                    <Link href={`/orders/${o._id}`}>{o.customer}</Link>
                  </td>
                  <td>
                    <span className={`badge badge-${o.displayStatus}`}>{o.displayStatus.replace('_', ' ')}</span>
                  </td>
                  <td style={{ fontWeight: 600 }}>${formatMinor(o.totalMinor)}</td>
                  <td style={{ color: 'var(--text-muted)' }}>${formatMinor(o.amountPaidMinor)}</td>
                  <td style={{ fontWeight: o.amountDueMinor > 0 ? 600 : 400, color: o.amountDueMinor > 0 ? 'var(--accent-rose)' : 'var(--text-muted)' }}>
                    ${formatMinor(o.amountDueMinor)}
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{new Date(o.dueDate).toLocaleDateString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Link href={`/orders/${o._id}`} style={{ fontSize: '0.8125rem' }}>
                      View / record payment →
                    </Link>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No orders found matching the selected filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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

  function removeLineItem(index: number) {
    if (lineItems.length > 1) {
      setLineItems((items) => items.filter((_, i) => i !== index));
    }
  }

  return (
    <form
      className="card stack"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <div>
        <h2 style={{ fontSize: '1.1rem' }}>Create New Order</h2>
        <p className="hint" style={{ marginTop: '0.2rem' }}>Fill in customer details and line items. Order total will be calculated automatically.</p>
      </div>

      <div className="row">
        <div className="field">
          <label htmlFor="new-order-customer">Customer name</label>
          <input
            id="new-order-customer"
            placeholder="e.g. Acme Corporation"
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

      <div className="stack" style={{ gap: '0.75rem' }}>
        <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>LINE ITEMS</label>
        {lineItems.map((item, i) => (
          <div className="row" key={i} style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: 3 }}>
              {i === 0 && <label>Description</label>}
              <input
                placeholder="e.g. Software License"
                value={item.description}
                onChange={(e) => updateLineItem(i, { description: e.target.value })}
                required
              />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 90 }}>
              {i === 0 && <label>Qty</label>}
              <input
                type="number"
                min={1}
                step={1}
                value={item.quantity}
                onChange={(e) => updateLineItem(i, { quantity: Number(e.target.value) })}
              />
            </div>
            <div className="field" style={{ flex: 1.5, minWidth: 120 }}>
              {i === 0 && <label>Unit price ($)</label>}
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder="0.00"
                value={item.unitPrice}
                onChange={(e) => updateLineItem(i, { unitPrice: e.target.value })}
                required
              />
            </div>
            {lineItems.length > 1 && (
              <button
                type="button"
                className="secondary"
                style={{ padding: '0.625rem 0.75rem', color: 'var(--accent-rose)' }}
                onClick={() => removeLineItem(i)}
                title="Remove item"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <div>
          <button
            type="button"
            className="secondary"
            style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}
            onClick={() => setLineItems((items) => [...items, { description: '', quantity: 1, unitPrice: '' }])}
          >
            + Add line item
          </button>
        </div>
      </div>

      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
        <button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Creating order…' : 'Create order'}
        </button>
      </div>
      {mutation.isError && (
        <p className="error-text">
          {mutation.error instanceof ApiError ? mutation.error.message : 'Something went wrong'}
        </p>
      )}
    </form>
  );
}
