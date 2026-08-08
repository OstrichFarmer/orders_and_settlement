import { ObjectId, type Collection, type MongoClient } from 'mongodb';
import type { Order, Payment, AuditLog } from '@/types/models';
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

export interface RecordPaymentInput {
  amountMinor: number;
  paidDate: Date;
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
    throw new AppError('PAYMENT_CONFLICT', 'Concurrent payment write conflict — retry the request', 409);
  }
  const order = await orders.findOne({ _id: orderId, userId });
  if (!order) throw new NotFoundError('Order not found');
  return { payment: existingPayment, order, idempotentReplay: true };
}

/**
 * Claim-first, transaction-wrapped payment recording.
 *
 * 1. Insert the payment doc first (inside the transaction) — the unique
 *    {orderId, idempotencyKey} index claims idempotency before any money moves.
 * 2. Atomically increment amountPaidMinor with an $expr guard so it can never
 *    exceed totalMinor — this guard is what's concurrency-critical, and is
 *    correct even without a transaction.
 * 3. If the guard rejects the payment, throwing here aborts the whole
 *    transaction, which rolls back step 1's insert automatically.
 * 4. On success, append audit entries and persist any status change — all
 *    inside the same transaction, so the three writes are all-or-nothing.
 */
export async function recordPayment(
  client: MongoClient,
  { orders, payments, auditLog }: RecordPaymentCollections,
  userId: ObjectId,
  orderId: ObjectId,
  input: RecordPaymentInput
): Promise<RecordPaymentResult> {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor < 1) {
    throw new ValidationError('amountMinor must be an integer >= 1');
  }

  const session = client.startSession();
  try {
    const paymentId = new ObjectId();

    const outcome = await session.withTransaction(async () => {
      // `note`/`idempotencyKey` are omitted entirely rather than set to
      // `undefined` — the driver serializes `undefined` fields as BSON null,
      // which a sparse index does NOT treat as "field absent", so every
      // keyless payment for the same order would collide on the unique
      // {orderId, idempotencyKey} index otherwise.
      const paymentDoc: Payment = {
        _id: paymentId,
        orderId,
        userId,
        amountMinor: input.amountMinor,
        paidDate: input.paidDate,
        createdAt: new Date(),
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
      };
      // Step a: claim idempotency first. Duplicate key throws and propagates
      // out of withTransaction (after an automatic abort — nothing else was
      // written yet, so there is nothing to compensate).
      await payments.insertOne(paymentDoc, { session });

      // Step b: atomic guarded increment, still inside the transaction.
      const updatedOrder = await orders.findOneAndUpdate(
        {
          _id: orderId,
          userId,
          $expr: { $lte: [{ $add: ['$amountPaidMinor', input.amountMinor] }, '$totalMinor'] },
        },
        { $inc: { amountPaidMinor: input.amountMinor }, $set: { updatedAt: new Date() } },
        { returnDocument: 'after', session }
      );

      if (!updatedOrder) {
        // Step c: disambiguate not-found vs over-payment, still inside the
        // transaction for a consistent read; throwing aborts the transaction,
        // which rolls back the payment insert from step a automatically.
        const existing = await orders.findOne({ _id: orderId, userId }, { session });
        if (!existing) throw new NotFoundError('Order not found');
        const maxAllowedMinor = Math.max(0, existing.totalMinor - existing.amountPaidMinor);
        throw new OverpaymentError(maxAllowedMinor);
      }

      const previousStatus = updatedOrder.status; // status field not yet updated at this point
      const newStatus = deriveStoredStatus(updatedOrder.totalMinor, updatedOrder.amountPaidMinor);

      await auditLog.insertOne(
        {
          _id: new ObjectId(),
          userId,
          orderId,
          event: 'payment.recorded',
          data: { amountMinor: input.amountMinor, paymentId: paymentDoc._id },
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

      return { payment: paymentDoc, order: finalOrder, idempotentReplay: false };
    });

    if (!outcome) {
      throw new AppError('TRANSACTION_FAILED', 'Payment transaction did not complete', 500);
    }
    return outcome;
  } catch (err) {
    if (isDuplicateKeyError(err) && input.idempotencyKey) {
      return findReplay(payments, orders, userId, orderId, input.idempotencyKey);
    }
    throw err;
  } finally {
    await session.endSession();
  }
}
