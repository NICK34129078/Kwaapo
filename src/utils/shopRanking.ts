import type { Product } from "../types/product";

function tagsArrayFromProduct(product: Product): string[] {
  return (product.tags ?? [])
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
}

export function hasUsefulProductTags(product: Product): boolean {
  return tagsArrayFromProduct(product).length > 0;
}

export function primaryProductTag(product: Product): string | null {
  const tags = tagsArrayFromProduct(product);
  return tags[0] ?? product.category?.trim().toLowerCase() ?? null;
}

function sellerStreakAtEnd(products: Product[], sellerId: string): number {
  let streak = 0;
  for (let i = products.length - 1; i >= 0; i--) {
    if (products[i]!.ownerId !== sellerId) {
      break;
    }
    streak++;
  }
  return streak;
}

function canPlaceProduct(candidate: Product, placed: Product[]): boolean {
  if (placed.length >= 2) {
    const streak = sellerStreakAtEnd(placed, candidate.ownerId);
    if (streak >= 2) {
      return false;
    }
  }

  if (placed.length > 0 && placed.length < 12) {
    const lastPrimary = primaryProductTag(placed[placed.length - 1]!);
    const candPrimary = primaryProductTag(candidate);
    if (
      lastPrimary &&
      candPrimary &&
      lastPrimary === candPrimary &&
      placed.length >= 2
    ) {
      const recentPrimaries = new Set(
        placed.slice(-3).map((p) => primaryProductTag(p)).filter(Boolean)
      );
      if (recentPrimaries.size === 1) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Re-order score-sorted shop products: max 2 same seller in a row,
 * mix primary tags in the top ~12 when alternatives exist.
 */
export function applyShopDiversityRules(products: Product[]): Product[] {
  if (products.length <= 2) {
    return products;
  }

  const pool = [...products];
  const placed: Product[] = [];

  while (pool.length > 0) {
    let pickIndex = pool.findIndex((candidate) => canPlaceProduct(candidate, placed));
    if (pickIndex < 0) {
      pickIndex = 0;
    }
    placed.push(pool.splice(pickIndex, 1)[0]!);
  }

  return placed;
}

export type PersonalizedShopLogRow = {
  index: number;
  id: string;
  name: string;
  tags: string[];
  sellerId: string;
  shopScore: number | null;
  relevantTags: string[];
};

export function logPersonalizedShopTop20(products: Product[]): void {
  if (!__DEV__) {
    return;
  }

  const rows: PersonalizedShopLogRow[] = products.slice(0, 20).map((product, index) => ({
    index,
    id: product.id,
    name: product.name,
    tags: product.tags ?? [],
    sellerId: product.ownerId,
    shopScore: product.shopScore ?? null,
    relevantTags: product.relevantTags ?? [],
  }));

  console.log("[PERSONALIZED_SHOP_TOP_20]", rows);
}
