import { ObjectId, type Collection } from 'mongodb';
import { getDb, getClient } from '@/lib/db';
import { ensureIndexes } from '@/scripts/ensureIndexes';
import { createOrder } from './orders';
import { recordPayment, OverpaymentError } from './payments';
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

async function makeOrder(totalMinor: number) {
  return createOrder(orders, auditLog, userId, {
    customer: 'Acme Co',
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    lineItems: [{ description: 'Widget', quantity: 1, unitPriceMinor: totalMinor }],
  });
}

describe('payment allocation', () => {
  it('walks pending -> partially_paid -> paid -> rejected', async () => {
    const client = await getClient();
    const order = await makeOrder(100000); // $1000

    const p1 = await recordPayment(client, { orders, payments, auditLog }, userId, order._id, {
      amountMinor: 40000,
      paidDate: new Date(),
    });
    expect(p1.order.amountPaidMinor).toBe(40000);
    expect(p1.order.status).toBe('partially_paid');

    const p2 = await recordPayment(client, { orders, payments, auditLog }, userId, order._id, {
      amountMinor: 60000,
      paidDate: new Date(),
    });
    expect(p2.order.amountPaidMinor).toBe(100000);
    expect(p2.order.status).toBe('paid');

    await expect(
      recordPayment(client, { orders, payments, auditLog }, userId, order._id, {
        amountMinor: 100,
        paidDate: new Date(),
      })
    ).rejects.toMatchObject({ code: 'OVERPAYMENT', maxAllowedMinor: 0 });

    const events = await auditLog.find({ orderId: order._id }).sort({ createdAt: 1 }).toArray();
    const eventNames = events.map((e) => e.event);
    expect(eventNames).toEqual([
      'order.created',
      'payment.recorded',
      'status.changed',
      'payment.recorded',
      'status.changed',
    ]);
  });

  it('rejects a payment that would exceed the amount due, with the correct maxAllowedMinor', async () => {
    const client = await getClient();
    const order = await makeOrder(100000);
    await recordPayment(client, { orders, payments, auditLog }, userId, order._id, {
      amountMinor: 60000,
      paidDate: new Date(),
    });

    await expect(
      recordPayment(client, { orders, payments, auditLog }, userId, order._id, {
        amountMinor: 60000,
        paidDate: new Date(),
      })
    ).rejects.toMatchObject({ code: 'OVERPAYMENT', maxAllowedMinor: 40000 });
  });
});

describe('concurrency: the $expr guard prevents over-allocation', () => {
  it('exactly one of two concurrent overlapping payments succeeds', async () => {
    const client = await getClient();
    const order = await makeOrder(50000); // $500 remaining headroom

    for (let i = 0; i < 25; i++) {
      const fresh = await makeOrder(50000);
      const results = await Promise.allSettled([
        recordPayment(client, { orders, payments, auditLog }, userId, fresh._id, {
          amountMinor: 30000,
          paidDate: new Date(),
        }),
        recordPayment(client, { orders, payments, auditLog }, userId, fresh._id, {
          amountMinor: 30000,
          paidDate: new Date(),
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(OverpaymentError);

      const finalOrder = await orders.findOne({ _id: fresh._id });
      expect(finalOrder?.amountPaidMinor).toBe(30000);
      expect(finalOrder!.amountPaidMinor).toBeLessThanOrEqual(finalOrder!.totalMinor);
    }

    // silence unused-var lint for the outer `order` used only to prime indexes/collections
    expect(order).toBeTruthy();
  }, 60000);
});

describe('idempotency', () => {
  it('returns the same payment for a repeated key submitted sequentially', async () => {
    const client = await getClient();
    const order = await makeOrder(100000);
    const key = 'idem-key-1';

    const first = await recordPayment(client, { orders, payments, auditLog }, userId, order._id, {
      amountMinor: 40000,
      paidDate: new Date(),
      idempotencyKey: key,
    });
    const second = await recordPayment(client, { orders, payments, auditLog }, userId, order._id, {
      amountMinor: 40000,
      paidDate: new Date(),
      idempotencyKey: key,
    });

    expect(second.idempotentReplay).toBe(true);
    expect(second.payment._id.toString()).toBe(first.payment._id.toString());

    const count = await payments.countDocuments({ orderId: order._id, idempotencyKey: key });
    expect(count).toBe(1);

    const finalOrder = await orders.findOne({ _id: order._id });
    expect(finalOrder?.amountPaidMinor).toBe(40000);
  });

  it('dedupes concurrent requests with the same key to a single payment', async () => {
    for (let i = 0; i < 25; i++) {
      const client = await getClient();
      const order = await makeOrder(100000);
      const key = `idem-concurrent-${i}`;

      const results = await Promise.all(
        [1, 2].map(() =>
          recordPayment(client, { orders, payments, auditLog }, userId, order._id, {
            amountMinor: 40000,
            paidDate: new Date(),
            idempotencyKey: key,
          })
        )
      );

      expect(results[0].payment._id.toString()).toBe(results[1].payment._id.toString());
      const replayCount = results.filter((r) => r.idempotentReplay).length;
      expect(replayCount).toBe(1);

      const count = await payments.countDocuments({ orderId: order._id, idempotencyKey: key });
      expect(count).toBe(1);

      const finalOrder = await orders.findOne({ _id: order._id });
      expect(finalOrder?.amountPaidMinor).toBe(40000);
    }
  }, 60000);
});
