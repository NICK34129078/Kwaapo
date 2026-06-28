import { supabase } from "../lib/supabase";
import { fetchShopFeedBatch } from "./shopFeedService";

export type ShopBrandProfile = {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  businessName: string | null;
};

type BrandRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  business_name: string | null;
};

type RpcBrandRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  business_name: string | null;
};

const BRAND_COLUMNS =
  "id, username, display_name, avatar_url, business_name";

const SHOP_FEED_OWNER_SCAN_LIMIT = 50;
const SHOP_FEED_OWNER_MAX_PAGES = 8;

function mapBrandRow(row: BrandRow | RpcBrandRow): ShopBrandProfile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    businessName: row.business_name,
  };
}

function sanitizeSearchTerm(raw: string): string {
  return raw.trim().replace(/[%_,]/g, " ").replace(/\s+/g, " ").trim();
}

function isMissingRpcError(error: { code?: string; message?: string }): boolean {
  const message = (error.message ?? "").toLowerCase();
  return (
    error.code === "42883" ||
    error.code === "PGRST202" ||
    message.includes("get_shop_live_seller_profiles") ||
    message.includes("could not find the function")
  );
}

/** Zelfde verkopers als in de shop-feed (verified + live product). */
async function fetchVerifiedLiveSellerOwnerIdsFromShopFeed(): Promise<string[]> {
  const ownerIds = new Set<string>();
  const excludeIds: string[] = [];

  for (let page = 0; page < SHOP_FEED_OWNER_MAX_PAGES; page += 1) {
    const result = await fetchShopFeedBatch({
      mode: "browse",
      limit: SHOP_FEED_OWNER_SCAN_LIMIT,
      excludeProductIds: excludeIds,
      filters: {},
    });

    for (const product of result.products) {
      if (product.ownerId) {
        ownerIds.add(product.ownerId);
      }
      excludeIds.push(product.id);
    }

    if (!result.hasMore || result.products.length === 0) {
      break;
    }
  }

  return [...ownerIds];
}

async function fetchProfilesForOwnerIds(
  ownerIds: readonly string[],
  options?: { searchTerm?: string; limit?: number }
): Promise<ShopBrandProfile[]> {
  if (ownerIds.length === 0) {
    return [];
  }

  const limit = options?.limit ?? 40;
  let query = supabase
    .from("profiles")
    .select(BRAND_COLUMNS)
    .in("id", [...ownerIds])
    .eq("seller_onboarding_status", "verified");

  const searchTerm = options?.searchTerm?.trim();
  if (searchTerm) {
    const pattern = `%${searchTerm}%`;
    query = query.or(
      `username.ilike.${pattern},display_name.ilike.${pattern},business_name.ilike.${pattern}`
    );
  }

  const { data, error } = await query
    .order("business_name", { ascending: true, nullsFirst: false })
    .order("display_name", { ascending: true, nullsFirst: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return ((data ?? []) as BrandRow[]).map(mapBrandRow);
}

async function fetchViaShopFeedFallback(
  searchTerm: string | undefined,
  limit: number
): Promise<ShopBrandProfile[]> {
  const ownerIds = await fetchVerifiedLiveSellerOwnerIdsFromShopFeed();
  return fetchProfilesForOwnerIds(ownerIds, {
    searchTerm,
    limit,
  });
}

async function fetchViaRpc(
  searchTerm: string | undefined,
  limit: number
): Promise<ShopBrandProfile[] | null> {
  const { data, error } = await supabase.rpc("get_shop_live_seller_profiles", {
    p_search_query: searchTerm ?? null,
    p_limit: limit,
  });

  if (error) {
    if (isMissingRpcError(error)) {
      return null;
    }
    throw error;
  }

  if (!Array.isArray(data)) {
    return [];
  }

  return (data as RpcBrandRow[]).map(mapBrandRow);
}

async function fetchShopBrands(
  searchTerm: string | undefined,
  limit: number
): Promise<ShopBrandProfile[]> {
  const rpcRows = await fetchViaRpc(searchTerm, limit);
  if (rpcRows !== null) {
    return rpcRows;
  }
  return fetchViaShopFeedFallback(searchTerm, limit);
}

export function resolveShopBrandLabel(brand: ShopBrandProfile): string {
  const business = brand.businessName?.trim();
  if (business) {
    return business;
  }
  const display = brand.displayName?.trim();
  if (display) {
    return display;
  }
  const uname = brand.username?.trim();
  if (uname) {
    return uname.startsWith("@") ? uname : `@${uname}`;
  }
  return "Bedrijf";
}

export function resolveShopBrandSubtitle(brand: ShopBrandProfile): string {
  const uname = brand.username?.trim();
  if (uname) {
    return `@${uname.replace(/^@/, "")}`;
  }
  return "Geverifieerd bedrijf";
}

export async function fetchShopBrandsBrowse(
  limit = 40
): Promise<ShopBrandProfile[]> {
  return fetchShopBrands(undefined, limit);
}

export async function searchShopBrands(
  rawQuery: string,
  limit = 25
): Promise<ShopBrandProfile[]> {
  const term = sanitizeSearchTerm(rawQuery);
  return fetchShopBrands(term.length > 0 ? term : undefined, limit);
}
