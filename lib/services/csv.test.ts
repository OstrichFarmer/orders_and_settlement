import { ObjectId } from 'mongodb';
import { ordersToCsv } from './csv';
import type { OrderWithDerived } from '@/types/models';

function makeOrder(overrides: Partial<OrderWithDerived> = {}): OrderWithDerived {
  return {
    _id: new ObjectId(),
    userId: new ObjectId(),
    customer: 'Acme Co',
    dueDate: new Date('2026-09-01T00:00:00.000Z'),
    lineItems: [{ description: 'Widget', quantity: 1, unitPriceMinor: 10000 }],
    subtotalMinor: 10000,
    totalMinor: 10000,
    amountPaidMinor: 0,
    status: 'pending',
    version: 0,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    amountDueMinor: 10000,
    displayStatus: 'pending',
    ...overrides,
  };
}

describe('ordersToCsv', () => {
  it('produces a header row plus one row per order', () => {
    const csv = ordersToCsv([makeOrder()]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Customer,Status,Total,Paid,Amount Due,Due Date,Created At');
    expect(lines[1]).toBe('Acme Co,pending,100.00,0.00,100.00,2026-09-01,2026-08-01');
  });

  it('escapes customer names containing commas or quotes', () => {
    const csv = ordersToCsv([makeOrder({ customer: 'Acme, "The" Co' })]);
    const lines = csv.split('\r\n');
    expect(lines[1]).toContain('"Acme, ""The"" Co"');
  });

  it('returns just the header row for an empty order list', () => {
    const csv = ordersToCsv([]);
    expect(csv).toBe('Customer,Status,Total,Paid,Amount Due,Due Date,Created At');
  });
});
