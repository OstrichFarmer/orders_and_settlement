import { ObjectId, type Collection, type ClientSession } from 'mongodb';
import type { AuditLog, AuditEvent } from '@/types/models';

export async function writeAuditLog(
  auditLog: Collection<AuditLog>,
  entry: { userId: ObjectId; orderId: ObjectId; event: AuditEvent; data: Record<string, unknown> },
  session?: ClientSession
): Promise<void> {
  await auditLog.insertOne(
    {
      _id: new ObjectId(),
      userId: entry.userId,
      orderId: entry.orderId,
      event: entry.event,
      data: entry.data,
      createdAt: new Date(),
    },
    session ? { session } : undefined
  );
}
