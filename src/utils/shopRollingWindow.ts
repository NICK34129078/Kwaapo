export const SHOP_WINDOW = {
  TARGET: 20,
  MAX: 24,
  /** Minimaal scrollen voordat head-trim (voorkomt sprong bovenaan). */
  MIN_SCROLL_Y_TO_TRIM: 480,
  /** Trim altijd in hele rijen (2 kolommen). */
  TRIM_ROW_SIZE: 2,
  SEEN_MAX: 350,
  LOAD_TRIGGER_RATIO: 0.72,
} as const;

export function trimShopProductWindow<T extends { id: string }>(
  products: readonly T[],
  options?: { minScrollY?: number; scrollY?: number }
): { trimmed: T[]; removedIds: string[] } {
  const { MAX, TARGET, TRIM_ROW_SIZE, MIN_SCROLL_Y_TO_TRIM } = SHOP_WINDOW;
  const scrollY = options?.scrollY ?? 0;

  if (products.length <= MAX) {
    return { trimmed: [...products], removedIds: [] };
  }

  if (scrollY < MIN_SCROLL_Y_TO_TRIM) {
    return { trimmed: [...products], removedIds: [] };
  }

  let trimCount = products.length - TARGET;
  trimCount -= trimCount % TRIM_ROW_SIZE;
  if (trimCount <= 0) {
    return { trimmed: [...products], removedIds: [] };
  }

  return {
    trimmed: products.slice(trimCount),
    removedIds: products.slice(0, trimCount).map((p) => p.id),
  };
}

export function filterUnseenProducts<T extends { id: string }>(
  products: readonly T[],
  seen: { has(id: string): boolean }
): T[] {
  return products.filter((p) => !seen.has(p.id));
}
