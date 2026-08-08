import { NextResponse, type NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getClient, getOrdersCollection, getPaymentsCollection, getAuditLogCollection } from '@/lib/db';
import { getUserId } from '@/lib/auth-guard';
import { recordPayment } from '@/lib/services/payments';
import { majorToMinor } from '@/lib/money';
import { toErrorResponse, ValidationError, NotFoundError } from '@/lib/errors';

const paymentSchema = z
  .object({
    amountMinor: z.number().int().min(1).optional(),
    amount: z.string().optional(),
    paidDate: z.coerce.date(),
    note: z.string().optional(),
  })
  .refine((data) => data.amountMinor !== undefined || data.amount !== undefined, {
    message: 'Either amountMinor or amount is required',
  });

type Params = Promise<{ id: string }>;

export async function POST(req: NextRequest, { params }: { params: Params }) {
  try {
    const userId = getUserId(req);
    const { id } = await params;
    if (!ObjectId.isValid(id)) throw new NotFoundError('Order not found');
    const orderId = new ObjectId(id);

    const body = await req.json();
    const parsed = paymentSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Invalid payment payload', { issues: parsed.error.issues });
    }

    const amountMinor = parsed.data.amountMinor ?? majorToMinor(parsed.data.amount as string);
    const idempotencyKey = req.headers.get('Idempotency-Key') ?? undefined;

    const client = await getClient();
    const orders = await getOrdersCollection();
    const payments = await getPaymentsCollection();
    const auditLog = await getAuditLogCollection();

    const result = await recordPayment(client, { orders, payments, auditLog }, userId, orderId, {
      amountMinor,
      paidDate: parsed.data.paidDate,
      note: parsed.data.note,
      idempotencyKey,
    });

    return NextResponse.json({ payment: result.payment, order: result.order }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
