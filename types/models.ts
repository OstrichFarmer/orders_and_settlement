import type { ObjectId } from 'mongodb';
import type { DisplayStatus, StoredStatus } from '@/lib/services/status';

export interface User {
  _id: ObjectId;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

export interface LineItem {
  description: string;
  quantity: number;
  unitPriceMinor: number;
}

export interface Order {
  _id: ObjectId;
  userId: ObjectId;
  customer: string;
  dueDate: Date;
  lineItems: LineItem[];
  subtotalMinor: number;
  totalMinor: number;
  amountPaidMinor: number;
  status: StoredStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderWithDerived extends Order {
  amountDueMinor: number;
  displayStatus: DisplayStatus;
}

export type SettlementType = 'payment' | 'refund';

export interface Payment {
  _id: ObjectId;
  orderId: ObjectId;
  userId: ObjectId;
  /** 'payment' increases amountPaidMinor, 'refund' decreases it. amountMinor is always a positive magnitude. */
  type: SettlementType;
  amountMinor: number;
  paidDate: Date;
  note?: string;
  idempotencyKey?: string;
  createdAt: Date;
}

export type AuditEvent = 'order.created' | 'payment.recorded' | 'refund.recorded' | 'status.changed';

export interface AuditLog {
  _id: ObjectId;
  userId: ObjectId;
  orderId: ObjectId;
  event: AuditEvent;
  data: Record<string, unknown>;
  createdAt: Date;
}
