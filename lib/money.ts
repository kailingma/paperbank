// Ledger-only money utils. Integer minor units throughout, never float.

const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP"]);

export function currencyDecimals(currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2;
}

export function toMinor(major: number, currency: string): number {
  const d = currencyDecimals(currency);
  return Math.round(major * 10 ** d);
}

export function parseMajorToMinor(
  input: string,
  currency: string,
): number | null {
  const n = Number(input.trim().replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0 || n >= 1_000_000_000) return null;
  return toMinor(n, currency);
}

export function formatCents(cents: number, currency: string, locale = "en-US"): string {
  const d = currencyDecimals(currency);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(cents / 10 ** d);
}

export type LineItem = {
  qty: number;
  unitCents: number;
  taxable?: boolean;
  taxRateBpsOverride?: number;
};

export function calcTotals(
  items: LineItem[],
  defaultTaxRateBps: number,
): { subtotalCents: number; taxCents: number; totalCents: number } {
  let subtotalCents = 0;
  let taxCents = 0;
  for (const it of items) {
    const lineSubtotal = it.qty * it.unitCents;
    subtotalCents += lineSubtotal;
    if (it.taxable) {
      const rate = it.taxRateBpsOverride ?? defaultTaxRateBps;
      taxCents += Math.round((lineSubtotal * rate) / 10000); // half-up per line
    }
  }
  return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}
