import type { NextRequest } from 'next/server';
import { getOrdersCollection } from '@/lib/db';
import { getUserId } from '@/lib/auth-guard';
import { listOrders } from '@/lib/services/orders';
import { ordersToCsv } from '@/lib/services/csv';
import { toErrorResponse } from '@/lib/errors';

export async function GET(req: NextRequest) {
  try {
    const userId = getUserId(req);
    const params = req.nextUrl.searchParams;
    const status = params.get('status') ?? undefined;
    const from = params.get('from') ? new Date(params.get('from') as string) : undefined;
    const to = params.get('to') ? new Date(params.get('to') as string) : undefined;

    const orders = await getOrdersCollection();
    const results = await listOrders(orders, userId, { status, from, to });
    const csv = ordersToCsv(results);

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="orders-export.csv"`,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
