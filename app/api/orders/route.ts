import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getOrdersCollection, getAuditLogCollection } from '@/lib/db';
import { getUserId } from '@/lib/auth-guard';
import { createOrder, listOrders } from '@/lib/services/orders';
import { toErrorResponse, ValidationError } from '@/lib/errors';

const lineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().int().min(1),
  unitPriceMinor: z.number().int().min(0),
});

const createOrderSchema = z.object({
  customer: z.string().min(1),
  dueDate: z.coerce.date(),
  lineItems: z.array(lineItemSchema).min(1),
});

export async function POST(req: NextRequest) {
  try {
    const userId = getUserId(req);
    const body = await req.json();
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Invalid order payload', { issues: parsed.error.issues });
    }

    const orders = await getOrdersCollection();
    const auditLog = await getAuditLogCollection();
    const order = await createOrder(orders, auditLog, userId, parsed.data);

    return NextResponse.json(order, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function GET(req: NextRequest) {
  try {
    const userId = getUserId(req);
    const status = req.nextUrl.searchParams.get('status') ?? undefined;

    const orders = await getOrdersCollection();
    const result = await listOrders(orders, userId, { status });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
