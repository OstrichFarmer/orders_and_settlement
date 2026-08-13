import type { OrderWithDerived } from '@/types/models';
import { formatMinor } from '@/lib/money';

const HEADERS = ['Customer', 'Status', 'Total', 'Paid', 'Amount Due', 'Due Date', 'Created At'];

function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Pure, no DB — takes already-fetched orders and produces CSV text (CRLF line endings per RFC 4180). */
export function ordersToCsv(orders: OrderWithDerived[]): string {
  const rows = orders.map((o) => [
    escapeCsvField(o.customer),
    o.displayStatus,
    formatMinor(o.totalMinor),
    formatMinor(o.amountPaidMinor),
    formatMinor(o.amountDueMinor),
    o.dueDate.toISOString().slice(0, 10),
    o.createdAt.toISOString().slice(0, 10),
  ]);
  return [HEADERS, ...rows].map((r) => r.join(',')).join('\r\n');
}
