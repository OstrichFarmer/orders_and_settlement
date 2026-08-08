import { NextResponse, type NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getOrdersCollection, getPaymentsCollection, getAuditLogCollection } from '@/lib/db';
import { getUserId } from '@/lib/auth-guard';
import { getOrderById, updateOrder, deleteOrder } from '@/lib/services/orders';
import { toErrorResponse, ValidationError, NotFoundError } from '@/lib/errors';

function parseOrderId(id: string): ObjectId {
  if (!ObjectId.isValid(id)) throw new NotFoundError('Order not found');
  return new ObjectId(id);
}

const lineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().int().min(1),
  unitPriceMinor: z.number().int().min(0),
});

const updateOrderSchema = z.object({
  customer: z.string().min(1).optional(),
  dueDate: z.coerce.date().optional(),
  lineItems: z.array(lineItemSchema).min(1).optional(),
});

type Params = Promise<{ id: string }>;

export async function GET(req: NextRequest, { params }: { params: Params }) {
  try {
    const userId = getUserId(req);
    const { id } = await params;
    const orderId = parseOrderId(id);

    const orders = await getOrdersCollection();
    const payments = await getPaymentsCollection();
    const result = await getOrderById(orders, payments, userId, orderId);

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  try {
    const userId = getUserId(req);
    const { id } = await params;
    const orderId = parseOrderId(id);

    const body = await req.json();
    const parsed = updateOrderSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Invalid order update payload', { issues: parsed.error.issues });
    }

    const orders = await getOrdersCollection();
    const auditLog = await getAuditLogCollection();
    const result = await updateOrder(orders, auditLog, userId, orderId, parsed.data);

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Params }) {
  try {
    const userId = getUserId(req);
    const { id } = await params;
    const orderId = parseOrderId(id);

    const orders = await getOrdersCollection();
    await deleteOrder(orders, userId, orderId);

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
