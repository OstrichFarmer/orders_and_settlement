const MAJOR_AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

/**
 * Converts a major-unit amount string (e.g. "12.50") to integer minor units (1250).
 * This is one of the only two places float math on a major-unit value is allowed —
 * the input is validated as a well-formed decimal string first, then rounded once.
 */
export function majorToMinor(major: string): number {
  if (!MAJOR_AMOUNT_PATTERN.test(major)) {
    throw new Error(`Invalid amount: "${major}"`);
  }
  return Math.round(parseFloat(major) * 100);
}

export function minorToMajor(minor: number): number {
  return minor / 100;
}

/** Only place `toFixed` is allowed — display-layer formatting boundary. */
export function formatMinor(minor: number): string {
  return (minor / 100).toFixed(2);
}
