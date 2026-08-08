'use client';

import { useState } from 'react';
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
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>{order.customer}</h1>
        <span className={`badge badge-${order.displayStatus}`}>{order.displayStatus}</span>
      </div>
      <p>Due {new Date(order.dueDate).toLocaleDateString()}</p>

      <section className="stack">
        <h2>Line items {locked && <small>(locked — payment recorded)</small>}</h2>
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit price</th>
              <th>Line total</th>
            </tr>
          </thead>
          <tbody>
            {order.lineItems.map((item, i) => (
              <tr key={i}>
                <td>{item.description}</td>
                <td>{item.quantity}</td>
                <td>{formatMinor(item.unitPriceMinor)}</td>
                <td>{formatMinor(item.quantity * item.unitPriceMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ gap: '2rem' }}>
          <span>Total: {formatMinor(order.totalMinor)}</span>
          <span>Paid: {formatMinor(order.amountPaidMinor)}</span>
          <span>Due: {formatMinor(order.amountDueMinor)}</span>
        </div>
      </section>

      <section className="stack">
        <h2>Payment history</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Amount</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p._id}>
                <td>{new Date(p.paidDate).toLocaleDateString()}</td>
                <td>{formatMinor(p.amountMinor)}</td>
                <td>{p.note ?? ''}</td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={3}>No payments yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {order.displayStatus !== 'paid' && (
        <section className="stack" style={{ border: '1px solid #8884', borderRadius: 8, padding: '1rem' }}>
          <h2>Record a payment</h2>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
          >
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} required />
            <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button type="submit" disabled={mutation.isPending}>
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
