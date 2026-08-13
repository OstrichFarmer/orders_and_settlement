import { ObjectId, type Collection, type MongoClient } from 'mongodb';
import type { Order, Payment, AuditLog, AuditEvent, SettlementType } from '@/types/models';
import { deriveStoredStatus } from '@/lib/services/status';
import { formatMinor } from '@/lib/money';
import { AppError, NotFoundError, ValidationError, isDuplicateKeyError } from '@/lib/errors';

export class OverpaymentError extends AppError {
  maxAllowedMinor: number;

  constructor(maxAllowedMinor: number) {
    super(
      'OVERPAYMENT',
      `Payment exceeds amount due. Maximum allowed: ${formatMinor(maxAllowedMinor)}.`,
      409,
      { maxAllowedMinor }
    );
    this.maxAllowedMinor = maxAllowedMinor;
  }
}

export class RefundExceedsPaidError extends AppError {
  maxAllowedMinor: number;

  constructor(maxAllowedMinor: number) {
    super(
      'REFUND_EXCEEDS_PAID',
      `Refund exceeds amount paid. Maximum allowed: ${formatMinor(maxAllowedMinor)}.`,
      409,
      { maxAllowedMinor }
    );
    this.maxAllowedMinor = maxAllowedMinor;
  }
}

export interface RecordPaymentInput {
  amountMinor: number;
  paidDate: Date;
  note?: string;
  idempotencyKey?: string;
}

export interface RecordRefundInput {
  amountMinor: number;
  refundDate: Date;
  note?: string;
  idempotencyKey?: string;
}

export interface RecordPaymentCollections {
  orders: Collection<Order>;
  payments: Collection<Payment>;
  auditLog: Collection<AuditLog>;
}

export interface RecordPaymentResult {
  payment: Payment;
  order: Order;
  idempotentReplay: boolean;
}

async function findReplay(
  payments: Collection<Payment>,
  orders: Collection<Order>,
  userId: ObjectId,
  orderId: ObjectId,
  idempotencyKey: string
): Promise<RecordPaymentResult> {
  const existingPayment = await payments.findOne({ orderId, idempotencyKey });
  if (!existingPayment) {
    // The concurrent insert that caused our duplicate-key error hasn't become
    // visible to this read yet (or was itself rolled back) — extremely rare
    // race; surfacing as a transient failure lets the client safely retry.
    throw new AppError('SETTLEMENT_CONFLICT', 'Concurrent write conflict — retry the request', 409);
  }
  const order = await orders.findOne({ _id: orderId, userId });
  if (!order) throw new NotFoundError('Order not found');
  return { payment: existingPayment, order, idempotentReplay: true };
}

interface SettlementParams {
  client: MongoClient;
  collections: RecordPaymentCollections;
  userId: ObjectId;
  orderId: ObjectId;
  type: SettlementType;
  amountMinor: number;
  date: Date;
  note?: string;
  idempotencyKey?: string;
  event: AuditEvent;
}

/**
 * Claim-first, transaction-wrapped settlement recording — shared by both
 * payments (increase amountPaidMinor) and refunds (decrease it).
 *
 * 1. Insert the settlement doc first (inside the transaction) — the unique
 *    {orderId, idempotencyKey} index claims idempotency before any money moves.
 * 2. Atomically apply the guarded delta so amountPaidMinor can never exceed
 *    totalMinor (payment) or go below 0 (refund) — this guard is what's
 *    concurrency-critical, and is correct even without a transaction.
 * 3. If the guard rejects the write, throwing here aborts the whole
 *    transaction, which rolls back step 1's insert automatically.
 * 4. On success, append audit entries and persist any status change — all
 *    inside the same transaction, so the writes are all-or-nothing.
 */
async function recordSettlement(params: SettlementParams): Promise<RecordPaymentResult> {
  const {
    client,
    collections: { orders, payments, auditLog },
    userId,
    orderId,
    type,
    amountMinor,
    date,
    note,
    idempotencyKey,
    event,
  } = params;

  const delta = type === 'payment' ? amountMinor : -amountMinor;
  const guardExpr =
    type === 'payment'
      ? { $lte: [{ $add: ['$amountPaidMinor', amountMinor] }, '$totalMinor'] }
      : { $gte: [{ $subtract: ['$amountPaidMinor', amountMinor] }, 0] };

  const session = client.startSession();
  try {
    const settlementId = new ObjectId();

    const outcome = await session.withTransaction(async () => {
      // `note`/`idempotencyKey` are omitted entirely rather than set to
      // `undefined` — the driver serializes `undefined` fields as BSON null,
      // which a sparse index does NOT treat as "field absent", so every
      // keyless settlement for the same order would collide on the unique
      // {orderId, idempotencyKey} index otherwise.
      const doc: Payment = {
        _id: settlementId,
        orderId,
        userId,
        type,
        amountMinor,
        paidDate: date,
        createdAt: new Date(),
        ...(note !== undefined ? { note } : {}),
        ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
      };
      // Step a: claim idempotency first. Duplicate key throws and propagates
      // out of withTransaction (after an automatic abort — nothing else was
      // written yet, so there is nothing to compensate).
      await payments.insertOne(doc, { session });

      // Step b: atomic guarded delta, still inside the transaction.
      const updatedOrder = await orders.findOneAndUpdate(
        { _id: orderId, userId, $expr: guardExpr },
        { $inc: { amountPaidMinor: delta }, $set: { updatedAt: new Date() } },
        { returnDocument: 'after', session }
      );

      if (!updatedOrder) {
        // Step c: disambiguate not-found vs guard rejection, still inside the
        // transaction for a consistent read; throwing aborts the transaction,
        // which rolls back the insert from step a automatically.
        const existing = await orders.findOne({ _id: orderId, userId }, { session });
        if (!existing) throw new NotFoundError('Order not found');
        if (type === 'payment') {
          throw new OverpaymentError(Math.max(0, existing.totalMinor - existing.amountPaidMinor));
        }
        throw new RefundExceedsPaidError(existing.amountPaidMinor);
      }

      const previousStatus = updatedOrder.status; // status field not yet updated at this point
      const newStatus = deriveStoredStatus(updatedOrder.totalMinor, updatedOrder.amountPaidMinor);

      await auditLog.insertOne(
        {
          _id: new ObjectId(),
          userId,
          orderId,
          event,
          data: { amountMinor, settlementId: doc._id },
          createdAt: new Date(),
        },
        { session }
      );

      let finalOrder = updatedOrder;
      if (newStatus !== previousStatus) {
        const statusResult = await orders.findOneAndUpdate(
          { _id: orderId, userId },
          { $set: { status: newStatus } },
          { returnDocument: 'after', session }
        );
        if (statusResult) finalOrder = statusResult;

        await auditLog.insertOne(
          {
            _id: new ObjectId(),
            userId,
            orderId,
            event: 'status.changed',
            data: { from: previousStatus, to: newStatus },
            createdAt: new Date(),
          },
          { session }
        );
      }

      return { payment: doc, order: finalOrder, idempotentReplay: false };
    });

    if (!outcome) {
      throw new AppError('TRANSACTION_FAILED', 'Settlement transaction did not complete', 500);
    }
    return outcome;
  } catch (err) {
    if (isDuplicateKeyError(err) && idempotencyKey) {
      return findReplay(payments, orders, userId, orderId, idempotencyKey);
    }
    throw err;
  } finally {
    await session.endSession();
  }
}

export async function recordPayment(
  client: MongoClient,
  collections: RecordPaymentCollections,
  userId: ObjectId,
  orderId: ObjectId,
  input: RecordPaymentInput
): Promise<RecordPaymentResult> {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor < 1) {
    throw new ValidationError('amountMinor must be an integer >= 1');
  }
  return recordSettlement({
    client,
    collections,
    userId,
    orderId,
    type: 'payment',
    amountMinor: input.amountMinor,
    date: input.paidDate,
    note: input.note,
    idempotencyKey: input.idempotencyKey,
    event: 'payment.recorded',
  });
}

/**
 * Records a refund against an order's already-collected payments.
 * Total refunds may never exceed total payments (amountPaidMinor >= 0), guarded
 * the same way overpayment is: atomically, inside the write itself.
 */
export async function recordRefund(
  client: MongoClient,
  collections: RecordPaymentCollections,
  userId: ObjectId,
  orderId: ObjectId,
  input: RecordRefundInput
): Promise<RecordPaymentResult> {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor < 1) {
    throw new ValidationError('amountMinor must be an integer >= 1');
  }
  return recordSettlement({
    client,
    collections,
    userId,
    orderId,
    type: 'refund',
    amountMinor: input.amountMinor,
    date: input.refundDate,
    note: input.note,
    idempotencyKey: input.idempotencyKey,
    event: 'refund.recorded',
  });
}
