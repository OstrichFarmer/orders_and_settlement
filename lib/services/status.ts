export type StoredStatus = 'pending' | 'partially_paid' | 'paid';
export type DisplayStatus = StoredStatus | 'overdue';

export function deriveStoredStatus(totalMinor: number, amountPaidMinor: number): StoredStatus {
  if (amountPaidMinor <= 0) return 'pending';
  if (amountPaidMinor < totalMinor) return 'partially_paid';
  return 'paid'; // amountPaidMinor === totalMinor (over-payment is impossible by guard)
}

export function deriveDisplayStatus(
  stored: StoredStatus,
  dueDate: Date,
  now: Date = new Date()
): DisplayStatus {
  if (stored !== 'paid' && now > dueDate) return 'overdue';
  return stored;
}
