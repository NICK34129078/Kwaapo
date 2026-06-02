export function formatPriceEur(amount: number): string {
  const value = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

export function parsePriceInput(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!cleaned.length) {
    return null;
  }
  const value = parseFloat(cleaned);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.round(value * 100) / 100;
}

export function parseSizesInput(raw: string): string[] {
  return raw
    .split(/[,;|/]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function formatSizesForInput(sizes: string[]): string {
  return sizes.join(", ");
}
