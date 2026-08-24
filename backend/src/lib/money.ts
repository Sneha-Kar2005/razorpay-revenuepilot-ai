/**
 * All money in RevenuePilot is represented as an integer number of paise
 * (1 INR = 100 paise). No floating point is ever used for a financial
 * calculation. The LLM/agent layer is never allowed to emit a final money
 * value that is used directly — every paise amount that reaches the ledger
 * is computed here, deterministically.
 */

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

export function formatINR(paise: number): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(rupees);
}

/** Integer percentage-of-amount helper, e.g. recovery cost = 2% of recovered amount. */
export function percentOfPaise(paise: number, percent: number): number {
  return Math.round((paise * percent) / 100);
}

export function sumPaise(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

export function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return numerator / denominator;
}

export function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}
