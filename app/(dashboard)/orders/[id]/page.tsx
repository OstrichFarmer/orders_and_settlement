'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { v4 as uuidv4 } from 'uuid';
import { fetchOrder, createPayment, ApiError } from '@/lib/api-client';
import { formatMinor, majorToMinor } from '@/lib/money';

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['order', id],
    queryFn: () => fetchOrder(id),
  });

  const [amount, setAmount] = useState('');
  const [paidDate, setPaidDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => uuidv4());

  const mutation = useMutation({
    mutationFn: () =>
      createPayment(
        id,
        { amountMinor: majorToMinor(amount), paidDate, note: note || undefined },
        idempotencyKey
      ),
    onSuccess: () => {
      setAmount('');
      setNote('');
      setIdempotencyKey(uuidv4()); // fresh key for the next distinct attempt
      queryClient.invalidateQueries({ queryKey: ['order', id] });
    },
  });

  if (isLoading) return <p>Loading…</p>;
  if (error) return <p className="error-text">{(error as Error).message}</p>;
  if (!data) return null;

  const { order, payments } = data;
  const locked = order.amountPaidMinor > 0;

  return (
    <div className="stack" style={{ gap: '1.75rem' }}>
      <div>
        <Link href="/orders" style={{ fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.75rem' }}>
          ← Back to orders
        </Link>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>{order.customer}</h1>
            <p className="hint" style={{ marginTop: '0.25rem' }}>
              Due date: <strong style={{ color: 'var(--text-main)' }}>{new Date(order.dueDate).toLocaleDateString()}</strong>
            </p>
          </div>
          <span className={`badge badge-${order.displayStatus}`} style={{ fontSize: '0.85rem', padding: '0.35rem 0.85rem' }}>
            {order.displayStatus.replace('_', ' ')}
          </span>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">Total Amount</span>
          <span className="stat-value">${formatMinor(order.totalMinor)}</span>
        </div>
        <div className="stat-card" style={{ borderColor: 'rgba(52, 211, 153, 0.25)' }}>
          <span className="stat-label" style={{ color: 'var(--accent-emerald)' }}>Amount Paid</span>
          <span className="stat-value" style={{ color: 'var(--accent-emerald)' }}>${formatMinor(order.amountPaidMinor)}</span>
        </div>
        <div className="stat-card" style={{ borderColor: order.amountDueMinor > 0 ? 'rgba(251, 113, 133, 0.25)' : 'var(--border-subtle)' }}>
          <span className="stat-label" style={{ color: order.amountDueMinor > 0 ? 'var(--accent-rose)' : 'var(--text-muted)' }}>Amount Due</span>
          <span className="stat-value" style={{ color: order.amountDueMinor > 0 ? 'var(--accent-rose)' : 'var(--text-main)' }}>
            ${formatMinor(order.amountDueMinor)}
          </span>
        </div>
      </div>

      <section className="card stack" style={{ gap: '1rem' }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Line Items</h2>
          {locked && <span className="hint" style={{ fontSize: '0.8125rem' }}>🔒 Order locked (payment recorded)</span>}
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th style={{ textAlign: 'center' }}>Qty</th>
                <th style={{ textAlign: 'right' }}>Unit price</th>
                <th style={{ textAlign: 'right' }}>Line total</th>
              </tr>
            </thead>
            <tbody>
              {order.lineItems.map((item, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{item.description}</td>
                  <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>${formatMinor(item.unitPriceMinor)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>${formatMinor(item.quantity * item.unitPriceMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card stack" style={{ gap: '1rem' }}>
        <h2>Payment History</h2>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date Paid</th>
                <th>Amount</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p._id}>
                  <td style={{ color: 'var(--text-muted)' }}>{new Date(p.paidDate).toLocaleDateString()}</td>
                  <td style={{ fontWeight: 600, color: 'var(--accent-emerald)' }}>+${formatMinor(p.amountMinor)}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{p.note || '—'}</td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                    No payments recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {order.displayStatus !== 'paid' && (
        <section className="card stack" style={{ gap: '1rem', borderColor: 'rgba(99, 102, 241, 0.3)' }}>
          <div>
            <h2>Record a Settlement Payment</h2>
            <p className="hint" style={{ marginTop: '0.2rem' }}>
              Amount remaining due is <strong style={{ color: 'var(--text-main)' }}>${formatMinor(order.amountDueMinor)}</strong>. Payments exceeding this will be rejected.
            </p>
          </div>
          <form
            className="row"
            style={{ alignItems: 'flex-end', gap: '0.875rem' }}
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
          >
            <div className="field" style={{ flex: 1.2, minWidth: 140 }}>
              <label htmlFor="payment-amount">Amount paid ($)</label>
              <input
                id="payment-amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="field" style={{ flex: 1.2, minWidth: 150 }}>
              <label htmlFor="payment-date">Date paid</label>
              <input
                id="payment-date"
                type="date"
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
                required
              />
            </div>
            <div className="field" style={{ flex: 2, minWidth: 180 }}>
              <label htmlFor="payment-note">Note (optional)</label>
              <input
                id="payment-note"
                placeholder="e.g. Wire transfer ref #123"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <button type="submit" disabled={mutation.isPending} style={{ whiteSpace: 'nowrap' }}>
              {mutation.isPending ? 'Recording…' : 'Record payment'}
            </button>
          </form>
          {mutation.isError && (
            <p className="error-text">
              {mutation.error instanceof ApiError ? mutation.error.message : 'Something went wrong'}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
