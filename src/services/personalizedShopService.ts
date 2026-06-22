import { supabase } from "../lib/supabase";
import {
  applyShopDiversityRules,
  logPersonalizedShopTop20,
} from "../utils/shopRanking";
import {
  mapProductRow,
  type Product,
  type ProductRow,
} from "../types/product";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 120;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

function clampLimit(limit?: number): number {
  const raw = limit ?? DEFAULT_LIMIT;
  return Math.min(Math.max(raw, 1), MAX_LIMIT);
}

type PersonalizedShopRpcRow = ProductRow & {
  shop_score?: number | string | null;
  relevant_tags?: unknown;
};

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function mapPersonalizedShopRow(row: PersonalizedShopRpcRow): Product {
  const product = mapProductRow(row);
  const shopScoreRaw = row.shop_score;
  const shopScore =
    typeof shopScoreRaw === "number"
      ? shopScoreRaw
      : typeof shopScoreRaw === "string"
        ? parseFloat(shopScoreRaw)
        : undefined;

  return {
    ...product,
    shopScore: Number.isFinite(shopScore) ? shopScore : undefined,
    relevantTags: parseStringArray(row.relevant_tags),
  };
}

/**
 * Gepersonaliseerde shop via Supabase RPC.
 * Lege array bij geen user, fout of lege response — caller valt terug op fetchShopProducts.
 */
export async function fetchPersonalizedShopProducts(
  limit?: number,
  excludeProductIds?: string[]
): Promise<Product[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return [];
  }

  const lim = clampLimit(limit);
  const validExclude = (excludeProductIds ?? []).filter(isUuid);

  const { data, error } = await supabase.rpc("get_personalized_shop_products", {
    p_limit: lim,
    p_exclude_product_ids: validExclude,
  });

  if (error) {
    console.warn("[PersonalizedShop] fetch failed:", error.message);
    return [];
  }

  if (data == null || !Array.isArray(data) || data.length === 0) {
    return [];
  }

  const ranked = (data as PersonalizedShopRpcRow[]).map(mapPersonalizedShopRow);
  const diversified = applyShopDiversityRules(ranked);
  logPersonalizedShopTop20(diversified);
  return diversified;
}
