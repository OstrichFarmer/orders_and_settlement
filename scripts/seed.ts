import { ObjectId } from 'mongodb';
import { getDb, getClient } from '@/lib/db';
import { ensureIndexes } from './ensureIndexes';
import { hashPassword } from '@/lib/auth';

const DEMO_EMAIL = 'demo@example.com';
const DEMO_PASSWORD = 'password123';

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function main() {
  const db = await getDb();
  await ensureIndexes(db);

  const users = db.collection('users');
  const orders = db.collection('orders');
  const payments = db.collection('payments');
  const auditLog = db.collection('audit_log');

  await users.deleteMany({ email: DEMO_EMAIL });
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const { insertedId: userId } = await users.insertOne({
    email: DEMO_EMAIL,
    passwordHash,
    createdAt: new Date(),
  });

  await orders.deleteMany({ userId });
  await payments.deleteMany({ userId });
  await auditLog.deleteMany({ userId });

  // Pending order, not yet due.
  const pendingOrder = {
    _id: new ObjectId(),
    userId,
    customer: 'Northwind Traders',
    dueDate: daysFromNow(30),
    lineItems: [{ description: 'Consulting hours', quantity: 10, unitPriceMinor: 15000 }],
    subtotalMinor: 150000,
    totalMinor: 150000,
    amountPaidMinor: 0,
    status: 'pending' as const,
    version: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Partially paid order, not yet due.
  const partialOrder = {
    _id: new ObjectId(),
    userId,
    customer: 'Contoso Ltd',
    dueDate: daysFromNow(14),
    lineItems: [{ description: 'Widgets', quantity: 20, unitPriceMinor: 2500 }],
    subtotalMinor: 50000,
    totalMinor: 50000,
    amountPaidMinor: 20000,
    status: 'partially_paid' as const,
    version: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Fully paid order, even though its due date has passed — should display "paid", not "overdue".
  const paidOrder = {
    _id: new ObjectId(),
    userId,
    customer: 'Fabrikam Inc',
    dueDate: daysFromNow(-10),
    lineItems: [{ description: 'Annual license', quantity: 1, unitPriceMinor: 80000 }],
    subtotalMinor: 80000,
    totalMinor: 80000,
    amountPaidMinor: 80000,
    status: 'paid' as const,
    version: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Overdue order: unpaid, due date has passed.
  const overdueOrder = {
    _id: new ObjectId(),
    userId,
    customer: 'Adventure Works',
    dueDate: daysFromNow(-5),
    lineItems: [{ description: 'Support retainer', quantity: 1, unitPriceMinor: 30000 }],
    subtotalMinor: 30000,
    totalMinor: 30000,
    amountPaidMinor: 0,
    status: 'pending' as const,
    version: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await orders.insertMany([pendingOrder, partialOrder, paidOrder, overdueOrder]);

  await payments.insertMany([
    {
      _id: new ObjectId(),
      orderId: partialOrder._id,
      userId,
      amountMinor: 20000,
      paidDate: daysFromNow(-3),
      createdAt: new Date(),
    },
    {
      _id: new ObjectId(),
      orderId: paidOrder._id,
      userId,
      amountMinor: 80000,
      paidDate: daysFromNow(-12),
      createdAt: new Date(),
    },
  ]);

  await auditLog.insertMany(
    [pendingOrder, partialOrder, paidOrder, overdueOrder].map((o) => ({
      _id: new ObjectId(),
      userId,
      orderId: o._id,
      event: 'order.created' as const,
      data: { totalMinor: o.totalMinor, customer: o.customer },
      createdAt: o.createdAt,
    }))
  );

  console.log(`Seeded demo user: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log('Orders: 1 pending, 1 partially_paid, 1 paid (due date passed), 1 overdue');

  const client = await getClient();
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
