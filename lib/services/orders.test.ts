import { ObjectId, type Collection } from 'mongodb';
import { getDb, getClient } from '@/lib/db';
import { ensureIndexes } from '@/scripts/ensureIndexes';
import { createOrder, listOrders, getOrderById, updateOrder, deleteOrder } from './orders';
import type { Order, Payment, AuditLog } from '@/types/models';

let orders: Collection<Order>;
let payments: Collection<Payment>;
let auditLog: Collection<AuditLog>;
const userId = new ObjectId();

beforeAll(async () => {
  const db = await getDb();
  await ensureIndexes(db);
  orders = db.collection<Order>('orders');
  payments = db.collection<Payment>('payments');
  auditLog = db.collection<AuditLog>('audit_log');
});

afterEach(async () => {
  await orders.deleteMany({});
  await payments.deleteMany({});
  await auditLog.deleteMany({});
});

afterAll(async () => {
  const client = await getClient();
  await client.close();
});

function futureDate(days = 30) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function pastDate(days = 1) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

describe('createOrder', () => {
  it('computes subtotal/total server-side and writes an audit entry', async () => {
    const order = await createOrder(orders, auditLog, userId, {
      customer: 'Acme Co',
      dueDate: futureDate(),
      lineItems: [
        { description: 'Widget', quantity: 3, unitPriceMinor: 1000 },
        { description: 'Gadget', quantity: 1, unitPriceMinor: 500 },
      ],
    });

    expect(order.subtotalMinor).toBe(3500);
    expect(order.totalMinor).toBe(3500);
    expect(order.amountPaidMinor).toBe(0);
    expect(order.status).toBe('pending');
    expect(order.displayStatus).toBe('pending');
    expect(order.amountDueMinor).toBe(3500);

    const events = await auditLog.find({ orderId: order._id }).toArray();
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('order.created');
  });

  it('rejects an order with no line items', async () => {
    await expect(
      createOrder(orders, auditLog, userId, { customer: 'Acme', dueDate: futureDate(), lineItems: [] })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('listOrders', () => {
  it('filters by stored status', async () => {
    await createOrder(orders, auditLog, userId, {
      customer: 'A',
      dueDate: futureDate(),
      lineItems: [{ description: 'x', quantity: 1, unitPriceMinor: 100 }],
    });
    const results = await listOrders(orders, userId, { status: 'pending' });
    expect(results).toHaveLength(1);
    const paidResults = await listOrders(orders, userId, { status: 'paid' });
    expect(paidResults).toHaveLength(0);
  });

  it('filters overdue orders via a real Mongo query on stored fields', async () => {
    await createOrder(orders, auditLog, userId, {
      customer: 'Overdue Co',
      dueDate: pastDate(),
      lineItems: [{ description: 'x', quantity: 1, unitPriceMinor: 100 }],
    });
    await createOrder(orders, auditLog, userId, {
      customer: 'Not Due Co',
      dueDate: futureDate(),
      lineItems: [{ description: 'x', quantity: 1, unitPriceMinor: 100 }],
    });

    const overdue = await listOrders(orders, userId, { status: 'overdue' });
    expect(overdue).toHaveLength(1);
    expect(overdue[0].customer).toBe('Overdue Co');
  });
});

describe('getOrderById', () => {
  it('404s for another user\'s order', async () => {
    const order = await createOrder(orders, auditLog, userId, {
      customer: 'A',
      dueDate: futureDate(),
      lineItems: [{ description: 'x', quantity: 1, unitPriceMinor: 100 }],
    });
    await expect(
      getOrderById(orders, payments, auditLog, new ObjectId(), order._id)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('returns the audit trail alongside the order and payments', async () => {
    const order = await createOrder(orders, auditLog, userId, {
      customer: 'A',
      dueDate: futureDate(),
      lineItems: [{ description: 'x', quantity: 1, unitPriceMinor: 100 }],
    });
    const result = await getOrderById(orders, payments, auditLog, userId, order._id);
    expect(result.auditLog).toHaveLength(1);
    expect(result.auditLog[0].event).toBe('order.created');
  });
});

describe('updateOrder', () => {
  it('allows editing customer/dueDate freely', async () => {
    const order = await createOrder(orders, auditLog, userId, {
      customer: 'A',
      dueDate: futureDate(),
      lineItems: [{ description: 'x', quantity: 1, unitPriceMinor: 100 }],
    });
    const updated = await updateOrder(orders, auditLog, userId, order._id, { customer: 'B' });
    expect(updated.customer).toBe('B');
  });

  it('blocks lineItems edits once a payment has been recorded', async () => {
    const order = await createOrder(orders, auditLog, userId, {
      customer: 'A',
      dueDate: futureDate(),
      lineItems: [{ description: 'x', quantity: 1, unitPriceMinor: 100 }],
    });
    await orders.updateOne({ _id: order._id }, { $set: { amountPaidMinor: 50, status: 'partially_paid' } });

    await expect(
      updateOrder(orders, auditLog, userId, order._id, {
        lineItems: [{ description: 'y', quantity: 2, unitPriceMinor: 200 }],
      })
    ).rejects.toMatchObject({ code: 'ORDER_LOCKED' });
  });
});

describe('deleteOrder', () => {
  it('deletes an order with no payments', async () => {
    const order = await createOrder(orders, auditLog, userId, {
      customer: 'A',
      dueDate: futureDate(),
      lineItems: [{ description: 'x', quantity: 1, unitPriceMinor: 100 }],
    });
    await deleteOrder(orders, userId, order._id);
    await expect(orders.findOne({ _id: order._id })).resolves.toBeNull();
  });

  it('blocks deleting an order that has payments', async () => {
    const order = await createOrder(orders, auditLog, userId, {
      customer: 'A',
      dueDate: futureDate(),
      lineItems: [{ description: 'x', quantity: 1, unitPriceMinor: 100 }],
    });
    await orders.updateOne({ _id: order._id }, { $set: { amountPaidMinor: 50 } });

    await expect(deleteOrder(orders, userId, order._id)).rejects.toMatchObject({
      code: 'ORDER_HAS_PAYMENTS',
    });
  });
});
