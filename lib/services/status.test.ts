import { deriveStoredStatus, deriveDisplayStatus } from './status';

describe('deriveStoredStatus', () => {
  it.each([
    [100000, 0, 'pending'],
    [100000, -50, 'pending'],
    [100000, 40000, 'partially_paid'],
    [100000, 99999, 'partially_paid'],
    [100000, 100000, 'paid'],
  ] as const)('total=%i paid=%i -> %s', (totalMinor, amountPaidMinor, expected) => {
    expect(deriveStoredStatus(totalMinor, amountPaidMinor)).toBe(expected);
  });

  it('degrades to paid rather than crashing if amountPaidMinor exceeds totalMinor', () => {
    // This should never happen in practice — the payment guard in payments.ts
    // prevents amountPaidMinor from ever exceeding totalMinor.
    expect(deriveStoredStatus(100000, 150000)).toBe('paid');
  });
});

describe('deriveDisplayStatus', () => {
  const yesterday = new Date('2026-01-01T00:00:00Z');
  const today = new Date('2026-01-02T00:00:00Z');
  const tomorrow = new Date('2026-01-03T00:00:00Z');

  it.each([
    ['pending', yesterday, 'overdue'],
    ['partially_paid', yesterday, 'overdue'],
  ] as const)('stored=%s, dueDate in the past -> %s', (stored, dueDate, expected) => {
    expect(deriveDisplayStatus(stored, dueDate, today)).toBe(expected);
  });

  it.each([
    ['pending', tomorrow, 'pending'],
    ['partially_paid', tomorrow, 'partially_paid'],
    ['paid', tomorrow, 'paid'],
  ] as const)('stored=%s, dueDate in the future -> %s', (stored, dueDate, expected) => {
    expect(deriveDisplayStatus(stored, dueDate, today)).toBe(expected);
  });

  it('an order paid in full after its due date shows paid, not overdue', () => {
    expect(deriveDisplayStatus('paid', yesterday, today)).toBe('paid');
  });

  it('is not overdue exactly at the due date instant (strict > comparison)', () => {
    expect(deriveDisplayStatus('pending', today, today)).toBe('pending');
  });

  it('defaults `now` to the current time when omitted', () => {
    const farFuture = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365);
    expect(deriveDisplayStatus('pending', farFuture)).toBe('pending');
  });
});
