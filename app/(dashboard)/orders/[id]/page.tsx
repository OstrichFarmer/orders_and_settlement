'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { v4 as uuidv4 } from 'uuid';
import {
  fetchOrder,
  createPayment,
  createRefund,
  updateOrder,
  deleteOrder,
  ApiError,
  type OrderWithDerived,
  type AuditLogEntry,
} from '@/lib/api-client';
import { formatMinor, majorToMinor, minorToMajor } from '@/lib/money';
import { DatePicker } from '@/components/DatePicker';
import { ConfirmModal } from '@/components/ConfirmModal';
import { useToast } from '@/components/Toast';

function describeAuditEvent(entry: AuditLogEntry): string {
  switch (entry.event) {
    case 'order.created':
      return `Order created — total $${formatMinor(entry.data.totalMinor as number)}`;
    case 'payment.recorded':
      return `Payment of $${formatMinor(entry.data.amountMinor as number)} recorded`;
    case 'refund.recorded':
      return `Refund of $${formatMinor(entry.data.amountMinor as number)} recorded`;
    case 'status.changed':
      return `Status changed from ${entry.data.from} to ${entry.data.to}`;
    default:
      return entry.event;
  }
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data, isLoading, error } = useQuery({
    queryKey: ['order', id],
    queryFn: () => fetchOrder(id),
  });

  const [amount, setAmount] = useState('');
  const [paidDate, setPaidDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => uuidv4());

  const [refundAmount, setRefundAmount] = useState('');
  const [refundDate, setRefundDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [refundNote, setRefundNote] = useState('');
  const [refundIdempotencyKey, setRefundIdempotencyKey] = useState(() => uuidv4());

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => deleteOrder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order deleted');
      router.push('/orders');
    },
    onError: (err) => {
      setConfirmDeleteOpen(false);
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong');
    },
  });

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
      toast.success('Payment recorded');
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong');
    },
  });

  const refundMutation = useMutation({
    mutationFn: () =>
      createRefund(
        id,
        { amountMinor: majorToMinor(refundAmount), refundDate, note: refundNote || undefined },
        refundIdempotencyKey
      ),
    onSuccess: () => {
      setRefundAmount('');
      setRefundNote('');
      setRefundIdempotencyKey(uuidv4());
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      toast.success('Refund recorded');
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong');
    },
  });

  if (isLoading)
    return (
      <div className="loading-container">
        <span className="spinner" />
        <span>Loading order details…</span>
      </div>
    );
  if (error) return <p className="error-text">{(error as Error).message}</p>;
  if (!data) return null;

  const { order, payments, auditLog } = data;
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
          <div className="row" style={{ gap: '0.75rem' }}>
            <span className={`badge badge-${order.displayStatus}`} style={{ fontSize: '0.85rem', padding: '0.35rem 0.85rem' }}>
              {order.displayStatus.replace('_', ' ')}
            </span>
            <button type="button" className="secondary" onClick={() => setEditOpen(true)}>
              Edit order
            </button>
            {!locked && (
              <button type="button" className="danger" onClick={() => setConfirmDeleteOpen(true)}>
                Delete order
              </button>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirmDeleteOpen}
        title="Delete this order?"
        message={`This will permanently delete the order for "${order.customer}". This cannot be undone.`}
        confirmLabel="Delete order"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setConfirmDeleteOpen(false)}
      />

      {editOpen && (
        <EditOrderModal
          order={order}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            queryClient.invalidateQueries({ queryKey: ['order', id] });
            queryClient.invalidateQueries({ queryKey: ['orders'] });
          }}
        />
      )}

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">Total Amount</span>
          <span className="stat-value">${formatMinor(order.totalMinor)}</span>
        </div>
        <div className="stat-card" style={{ borderColor: '#a7f3d0' }}>
          <span className="stat-label" style={{ color: 'var(--accent-emerald)' }}>Amount Paid</span>
          <span className="stat-value" style={{ color: 'var(--accent-emerald)' }}>${formatMinor(order.amountPaidMinor)}</span>
        </div>
        <div className="stat-card" style={{ borderColor: order.amountDueMinor > 0 ? '#fecdd3' : 'var(--border-subtle)' }}>
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
                <th>Date</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p._id}>
                  <td style={{ color: 'var(--text-muted)' }}>{new Date(p.paidDate).toLocaleDateString()}</td>
                  <td>
                    <span className={`badge badge-${p.type === 'refund' ? 'overdue' : 'paid'}`}>{p.type}</span>
                  </td>
                  <td
                    style={{
                      fontWeight: 600,
                      color: p.type === 'refund' ? 'var(--accent-rose)' : 'var(--accent-emerald)',
                    }}
                  >
                    {p.type === 'refund' ? '−' : '+'}${formatMinor(p.amountMinor)}
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{p.note || '—'}</td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                    No payments recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {order.displayStatus !== 'paid' && (
        <section className="card stack" style={{ gap: '1rem', borderColor: '#c7d2fe' }}>
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
              if (!paidDate) {
                toast.error('Please select the date paid');
                return;
              }
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
              <DatePicker id="payment-date" value={paidDate} onChange={setPaidDate} placeholder="When was this paid?" />
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
        </section>
      )}

      {order.amountPaidMinor > 0 && (
        <section className="card stack" style={{ gap: '1rem', borderColor: '#fecdd3' }}>
          <div>
            <h2>Record a Refund</h2>
            <p className="hint" style={{ marginTop: '0.2rem' }}>
              Amount available to refund is <strong style={{ color: 'var(--text-main)' }}>${formatMinor(order.amountPaidMinor)}</strong>. Refunds exceeding this will be rejected.
            </p>
          </div>
          <form
            className="row"
            style={{ alignItems: 'flex-end', gap: '0.875rem' }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!refundDate) {
                toast.error('Please select the refund date');
                return;
              }
              refundMutation.mutate();
            }}
          >
            <div className="field" style={{ flex: 1.2, minWidth: 140 }}>
              <label htmlFor="refund-amount">Refund amount ($)</label>
              <input
                id="refund-amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                required
              />
            </div>
            <div className="field" style={{ flex: 1.2, minWidth: 150 }}>
              <label htmlFor="refund-date">Refund date</label>
              <DatePicker id="refund-date" value={refundDate} onChange={setRefundDate} placeholder="When was this refunded?" />
            </div>
            <div className="field" style={{ flex: 2, minWidth: 180 }}>
              <label htmlFor="refund-note">Note (optional)</label>
              <input
                id="refund-note"
                placeholder="e.g. Customer requested partial refund"
                value={refundNote}
                onChange={(e) => setRefundNote(e.target.value)}
              />
            </div>
            <button type="submit" className="danger" disabled={refundMutation.isPending} style={{ whiteSpace: 'nowrap' }}>
              {refundMutation.isPending ? 'Recording…' : 'Record refund'}
            </button>
          </form>
        </section>
      )}

      <section className="card stack" style={{ gap: '0.75rem' }}>
        <h2>Activity</h2>
        <div className="stack" style={{ gap: '0.5rem' }}>
          {auditLog.map((entry) => (
            <div key={entry._id} className="row" style={{ justifyContent: 'space-between', gap: '1rem' }}>
              <span style={{ fontSize: '0.875rem' }}>{describeAuditEvent(entry)}</span>
              <span className="hint" style={{ whiteSpace: 'nowrap' }}>
                {new Date(entry.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
          {auditLog.length === 0 && <p className="hint">No activity recorded yet.</p>}
        </div>
      </section>
    </div>
  );
}

interface EditLineItem {
  description: string;
  quantity: number;
  unitPrice: string;
}

function EditOrderModal({
  order,
  onClose,
  onSaved,
}: {
  order: OrderWithDerived;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const locked = order.amountPaidMinor > 0;

  // The parent only mounts this component while the modal is open (and
  // remounts it fresh each time), so these initializers always reflect the
  // order as of the moment "Edit order" was clicked — no reset-effect needed.
  const [customer, setCustomer] = useState(order.customer);
  const [dueDate, setDueDate] = useState(order.dueDate.slice(0, 10));
  const [lineItems, setLineItems] = useState<EditLineItem[]>(() =>
    order.lineItems.map((li) => ({
      description: li.description,
      quantity: li.quantity,
      unitPrice: minorToMajor(li.unitPriceMinor).toFixed(2),
    }))
  );

  const mutation = useMutation({
    mutationFn: () =>
      updateOrder(order._id, {
        customer,
        dueDate,
        ...(locked
          ? {}
          : {
              lineItems: lineItems.map((li) => ({
                description: li.description,
                quantity: li.quantity,
                unitPriceMinor: majorToMinor(li.unitPrice || '0'),
              })),
            }),
      }),
    onSuccess: () => {
      toast.success('Order updated');
      onSaved();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong');
    },
  });

  function updateLineItem(index: number, patch: Partial<EditLineItem>) {
    setLineItems((items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function removeLineItem(index: number) {
    if (lineItems.length > 1) {
      setLineItems((items) => items.filter((_, i) => i !== index));
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        style={{ maxWidth: 580, width: '100%' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-order-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="edit-order-title">Edit order</h3>
        <form
          className="stack"
          style={{ marginTop: '1rem' }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!dueDate) {
              toast.error('Please select a due date');
              return;
            }
            mutation.mutate();
          }}
        >
          <div className="row">
            <div className="field">
              <label htmlFor="edit-customer">Customer name</label>
              <input id="edit-customer" value={customer} onChange={(e) => setCustomer(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="edit-due-date">Due date</label>
              <DatePicker id="edit-due-date" value={dueDate} onChange={setDueDate} />
            </div>
          </div>

          {locked ? (
            <p className="hint">🔒 Line items are read-only because a payment has been recorded on this order.</p>
          ) : (
            <div className="stack" style={{ gap: '0.75rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>LINE ITEMS</label>
              {lineItems.map((item, i) => (
                <div className="row" key={i} style={{ alignItems: 'flex-end' }}>
                  <div className="field" style={{ flex: 3 }}>
                    {i === 0 && <label>Description</label>}
                    <input
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
                  style={{ fontSize: '0.8125rem' }}
                  onClick={() => setLineItems((items) => [...items, { description: '', quantity: 1, unitPrice: '' }])}
                >
                  + Add line item
                </button>
              </div>
            </div>
          )}

          <div className="row" style={{ justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button type="button" className="secondary" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </button>
            <button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
