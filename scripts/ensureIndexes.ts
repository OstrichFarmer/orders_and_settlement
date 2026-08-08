import type { Db } from 'mongodb';

export async function ensureIndexes(db: Db): Promise<void> {
  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  await db.collection('orders').createIndex({ userId: 1, status: 1 });
  await db.collection('payments').createIndex({ orderId: 1, createdAt: 1 });
  // A plain `sparse: true` compound index only excludes a document when
  // *every* indexed field is missing; since `orderId` is always present,
  // that would still index (and collide on) every keyless payment for the
  // same order. A partial index correctly indexes only documents that
  // actually have an idempotencyKey.
  await db.collection('payments').createIndex(
    { orderId: 1, idempotencyKey: 1 },
    { unique: true, partialFilterExpression: { idempotencyKey: { $exists: true } } }
  );
  await db.collection('audit_log').createIndex({ orderId: 1, createdAt: 1 });
}
