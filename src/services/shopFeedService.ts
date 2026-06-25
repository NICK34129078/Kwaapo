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

export const SHOP_FEED_BATCH_SIZE = 12;

export type ShopFeedMode = "personalized" | "browse";

export type ShopFeedFilters = {
  mainCategory?: string | null;
  audience?: string | null;
  subcategory?: string | null;
  query?: string | null;
};

type ShopFeedRpcRow = ProductRow & {
  shop_score?: number | string | null;
  relevant_tags?: unknown;
  feed_bucket?: string | null;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

function clampBatchSize(limit?: number): number {
  const raw = limit ?? SHOP_FEED_BATCH_SIZE;
  return Math.min(Math.max(raw, 1), 50);
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function mapShopFeedRow(row: ShopFeedRpcRow): Product {
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
    feedBucket: typeof row.feed_bucket === "string" ? row.feed_bucket : undefined,
  };
}

function buildRpcFilters(filters?: ShopFeedFilters) {
  const q = filters?.query?.trim() ?? "";
  return {
    p_main_category: filters?.mainCategory?.trim() || null,
    p_audience: filters?.audience?.trim() || null,
    p_subcategory: filters?.subcategory?.trim() || null,
    p_search_query: q.length > 0 ? q : null,
  };
}

export type FetchShopFeedBatchOptions = {
  mode: ShopFeedMode;
  limit?: number;
  excludeProductIds?: string[];
  filters?: ShopFeedFilters;
};

export type ShopFeedBatchResult = {
  products: Product[];
  hasMore: boolean;
};

/**
 * Haalt één batch shop-producten op via Supabase RPC (server-side ranking/filter).
 */
export async function fetchShopFeedBatch(
  options: FetchShopFeedBatchOptions
): Promise<ShopFeedBatchResult> {
  const lim = clampBatchSize(options.limit);
  const validExclude = (options.excludeProductIds ?? []).filter(isUuid);
  const filterArgs = buildRpcFilters(options.filters);

  if (options.mode === "personalized") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { products: [], hasMore: false };
    }

    const { data, error } = await supabase.rpc("get_personalized_shop_products", {
      p_limit: lim,
      p_exclude_product_ids: validExclude,
      ...filterArgs,
    });

    if (error) {
      console.warn("[ShopFeed] personalized fetch failed:", error.message);
      if (validExclude.length === 0) {
        return fetchShopFeedBatch({ ...options, mode: "browse" });
      }
      return { products: [], hasMore: false };
    }

    if (!Array.isArray(data) || data.length === 0) {
      if (validExclude.length === 0) {
        return fetchShopFeedBatch({ ...options, mode: "browse" });
      }
      return { products: [], hasMore: false };
    }

    const ranked = (data as ShopFeedRpcRow[]).map(mapShopFeedRow);
    const diversified = applyShopDiversityRules(ranked);
    logPersonalizedShopTop20(diversified);
    return {
      products: diversified,
      hasMore: diversified.length >= lim,
    };
  }

  const { data, error } = await supabase.rpc("get_shop_browse_products", {
    p_limit: lim,
    p_exclude_product_ids: validExclude,
    ...filterArgs,
  });

  if (error) {
    console.warn("[ShopFeed] browse fetch failed:", error.message);
    return { products: [], hasMore: false };
  }

  if (!Array.isArray(data) || data.length === 0) {
    return { products: [], hasMore: false };
  }

  const products = (data as ShopFeedRpcRow[]).map(mapShopFeedRow);
  return {
    products: applyShopDiversityRules(products),
    hasMore: products.length >= lim,
  };
}

/** @deprecated Gebruik fetchShopFeedBatch */
export async function fetchPersonalizedShopProducts(
  limit?: number,
  excludeProductIds?: string[]
): Promise<Product[]> {
  const result = await fetchShopFeedBatch({
    mode: "personalized",
    limit,
    excludeProductIds,
  });
  return result.products;
}
