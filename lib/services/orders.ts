import { ObjectId, type Collection } from 'mongodb';
import type { Order, OrderWithDerived, Payment, LineItem } from '@/types/models';
import { deriveStoredStatus, deriveDisplayStatus, type DisplayStatus } from '@/lib/services/status';
import { writeAuditLog } from '@/lib/services/audit';
import { NotFoundError, ConflictError, ValidationError } from '@/lib/errors';
import type { AuditLog } from '@/types/models';

export interface LineItemInput {
  description: string;
  quantity: number;
  unitPriceMinor: number;
}

export interface CreateOrderInput {
  customer: string;
  dueDate: Date;
  lineItems: LineItemInput[];
}

export interface UpdateOrderInput {
  customer?: string;
  dueDate?: Date;
  lineItems?: LineItemInput[];
}

function validateLineItems(lineItems: LineItemInput[]): LineItem[] {
  if (lineItems.length === 0) {
    throw new ValidationError('An order must have at least one line item');
  }
  return lineItems.map((item) => {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new ValidationError(`Invalid quantity for "${item.description}": must be an integer >= 1`);
    }
    if (!Number.isInteger(item.unitPriceMinor) || item.unitPriceMinor < 0) {
      throw new ValidationError(`Invalid unitPriceMinor for "${item.description}": must be an integer >= 0`);
    }
    return {
      description: item.description,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
    };
  });
}

function computeSubtotalMinor(lineItems: LineItem[]): number {
  return lineItems.reduce((sum, item) => sum + item.quantity * item.unitPriceMinor, 0);
}

function withDerived(order: Order): OrderWithDerived {
  const displayStatus: DisplayStatus = deriveDisplayStatus(order.status, order.dueDate);
  return {
    ...order,
    amountDueMinor: order.totalMinor - order.amountPaidMinor,
    displayStatus,
  };
}

export async function createOrder(
  orders: Collection<Order>,
  auditLog: Collection<AuditLog>,
  userId: ObjectId,
  input: CreateOrderInput
): Promise<OrderWithDerived> {
  const lineItems = validateLineItems(input.lineItems);
  const subtotalMinor = computeSubtotalMinor(lineItems);
  const totalMinor = subtotalMinor;
  const now = new Date();

  const order: Omit<Order, '_id'> = {
    userId,
    customer: input.customer,
    dueDate: input.dueDate,
    lineItems,
    subtotalMinor,
    totalMinor,
    amountPaidMinor: 0,
    status: 'pending',
    version: 0,
    createdAt: now,
    updatedAt: now,
  };

  const result = await orders.insertOne(order as Order);
  const created = { ...order, _id: result.insertedId } as Order;

  await writeAuditLog(auditLog, {
    userId,
    orderId: created._id,
    event: 'order.created',
    data: { totalMinor, customer: input.customer },
  });

  return withDerived(created);
}

export async function listOrders(
  orders: Collection<Order>,
  userId: ObjectId,
  filter: { status?: string; from?: Date; to?: Date }
): Promise<OrderWithDerived[]> {
  const now = new Date();
  const query: Record<string, unknown> = { userId };
  const dueDateConditions: Record<string, Date> = {};

  if (filter.status === 'overdue') {
    // overdue is a predicate over stored fields, expressible directly in Mongo.
    query.status = { $ne: 'paid' };
    dueDateConditions.$lt = now;
  } else if (filter.status === 'pending' || filter.status === 'partially_paid' || filter.status === 'paid') {
    query.status = filter.status;
  }

  // Used by the CSV export ("for a date range") — filters on dueDate, the
  // field the brief's date-range language most naturally refers to (when
  // payment is expected), documented as an assumption in the README.
  if (filter.from) dueDateConditions.$gte = filter.from;
  if (filter.to) dueDateConditions.$lte = filter.to;
  if (Object.keys(dueDateConditions).length > 0) query.dueDate = dueDateConditions;

  const docs = await orders.find(query).sort({ dueDate: 1 }).toArray();
  return docs.map(withDerived);
}

export async function getOrderById(
  orders: Collection<Order>,
  payments: Collection<Payment>,
  auditLog: Collection<AuditLog>,
  userId: ObjectId,
  orderId: ObjectId
): Promise<{ order: OrderWithDerived; payments: Payment[]; auditLog: AuditLog[] }> {
  const order = await orders.findOne({ _id: orderId, userId });
  if (!order) throw new NotFoundError('Order not found');

  const paymentDocs = await payments.find({ orderId }).sort({ createdAt: 1 }).toArray();
  const auditDocs = await auditLog.find({ orderId }).sort({ createdAt: 1 }).toArray();

  return { order: withDerived(order), payments: paymentDocs, auditLog: auditDocs };
}

export async function updateOrder(
  orders: Collection<Order>,
  auditLog: Collection<AuditLog>,
  userId: ObjectId,
  orderId: ObjectId,
  patch: UpdateOrderInput
): Promise<OrderWithDerived> {
  const existing = await orders.findOne({ _id: orderId, userId });
  if (!existing) throw new NotFoundError('Order not found');

  if (patch.lineItems && existing.amountPaidMinor > 0) {
    throw new ConflictError(
      'ORDER_LOCKED',
      'Line items are read-only once a payment has been recorded'
    );
  }

  const update: Partial<Order> = { updatedAt: new Date() };
  if (patch.customer !== undefined) update.customer = patch.customer;
  if (patch.dueDate !== undefined) update.dueDate = patch.dueDate;

  let newStatus = existing.status;
  if (patch.lineItems) {
    const lineItems = validateLineItems(patch.lineItems);
    const subtotalMinor = computeSubtotalMinor(lineItems);
    update.lineItems = lineItems;
    update.subtotalMinor = subtotalMinor;
    update.totalMinor = subtotalMinor;
    newStatus = deriveStoredStatus(subtotalMinor, existing.amountPaidMinor);
    if (newStatus !== existing.status) update.status = newStatus;
  }

  const result = await orders.findOneAndUpdate(
    { _id: orderId, userId },
    { $set: update },
    { returnDocument: 'after' }
  );
  if (!result) throw new NotFoundError('Order not found');

  if (newStatus !== existing.status) {
    await writeAuditLog(auditLog, {
      userId,
      orderId,
      event: 'status.changed',
      data: { from: existing.status, to: newStatus },
    });
  }

  return withDerived(result);
}

export async function deleteOrder(
  orders: Collection<Order>,
  userId: ObjectId,
  orderId: ObjectId
): Promise<void> {
  const existing = await orders.findOne({ _id: orderId, userId });
  if (!existing) throw new NotFoundError('Order not found');

  if (existing.amountPaidMinor > 0) {
    throw new ConflictError(
      'ORDER_HAS_PAYMENTS',
      'Orders with recorded payments cannot be deleted'
    );
  }

  await orders.deleteOne({ _id: orderId, userId });
}
