import { supabase } from "../lib/supabase";
import {
  isSellerOnboardingStatus,
  type SellerOnboardingStatus,
} from "../types/sellerOnboarding";
import {
  mapProductRow,
  type Product,
  type ProductInput,
  type ProductRow,
} from "../types/product";

const PRODUCT_COLUMNS =
  "id, owner_id, name, description, price, category, brand, stock, images, sizes, is_active, created_at";

export type ProductSeller = {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  sellerOnboardingStatus: SellerOnboardingStatus;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function fetchProductsByIds(ids: string[]): Promise<Product[]> {
  const unique = Array.from(new Set(ids.filter(isUuid)));
  if (unique.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .in("id", unique);

  if (error) {
    throw error;
  }
  return ((data ?? []) as ProductRow[]).map(mapProductRow);
}

export async function fetchMyActiveProducts(): Promise<Product[]> {
  return fetchMyProducts(false);
}

export async function fetchActiveProducts(limit = 80): Promise<Product[]> {
  return fetchShopProducts({ limit });
}

type FetchShopProductsOptions = {
  query?: string;
  category?: string;
  limit?: number;
};

/**
 * Shop-zoeken: actieve producten ophalen met optionele tekst- en categoriefilter.
 * Zoekt in naam, merk, beschrijving en categorie (case-insensitive).
 */
export async function fetchShopProducts(
  options?: FetchShopProductsOptions
): Promise<Product[]> {
  const cap = Math.min(Math.max(1, options?.limit ?? 100), 120);
  const q = (options?.query ?? "").trim();
  const category = (options?.category ?? "").trim();

  let builder = supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(cap);

  if (category.length > 0 && category.toLowerCase() !== "alle") {
    const safeCategory = category.replace(/[%_]/g, "");
    const categoryPattern = `%${safeCategory}%`;
    builder = builder.or(
      `category.ilike.${categoryPattern},name.ilike.${categoryPattern},description.ilike.${categoryPattern},brand.ilike.${categoryPattern}`
    );
  }

  if (q.length > 0) {
    const pattern = `%${q.replace(/[%_]/g, "")}%`;
    builder = builder.or(
      `name.ilike.${pattern},brand.ilike.${pattern},description.ilike.${pattern},category.ilike.${pattern}`
    );
  }

  const { data, error } = await builder;
  if (error) {
    throw error;
  }
  return ((data ?? []) as ProductRow[]).map(mapProductRow);
}

export async function fetchActiveProductsByOwner(
  ownerId: string
): Promise<Product[]> {
  return fetchProductsByOwner(ownerId, { includeInactive: false });
}

export async function fetchProductSeller(
  ownerId: string
): Promise<ProductSeller | null> {
  if (!isUuid(ownerId)) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, username, display_name, avatar_url, seller_onboarding_status, stripe_charges_enabled, stripe_payouts_enabled"
    )
    .eq("id", ownerId)
    .maybeSingle<{
      id: string;
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
      seller_onboarding_status: string | null;
      stripe_charges_enabled: boolean | null;
      stripe_payouts_enabled: boolean | null;
    }>();

  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }

  return {
    id: data.id,
    username: data.username,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
    sellerOnboardingStatus: isSellerOnboardingStatus(data.seller_onboarding_status)
      ? data.seller_onboarding_status
      : "not_started",
    stripeChargesEnabled: data.stripe_charges_enabled === true,
    stripePayoutsEnabled: data.stripe_payouts_enabled === true,
  };
}

function rowToInsert(input: ProductInput, ownerId: string) {
  return {
    owner_id: ownerId,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    price: input.price,
    category: input.category?.trim() || null,
    brand: input.brand?.trim() || null,
    stock: Math.max(0, Math.floor(input.stock)),
    images: input.images,
    sizes: input.sizes,
    is_active: input.isActive ?? true,
  };
}

export async function fetchProductsByOwner(
  ownerId: string,
  options?: { includeInactive?: boolean }
): Promise<Product[]> {
  let query = supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });

  if (!options?.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return ((data ?? []) as ProductRow[]).map(mapProductRow);
}

export async function fetchMyProducts(
  includeInactive = true
): Promise<Product[]> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }
  if (!user?.id) {
    return [];
  }

  return fetchProductsByOwner(user.id, { includeInactive });
}

export async function fetchProductById(
  productId: string
): Promise<Product | null> {
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("id", productId)
    .maybeSingle<ProductRow>();

  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }
  return mapProductRow(data);
}

export async function createProduct(
  input: ProductInput,
  productId?: string
): Promise<Product> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }
  if (!user?.id) {
    throw new Error("Niet ingelogd.");
  }

  const payload = rowToInsert(input, user.id);
  const { data, error } = await supabase
    .from("products")
    .insert(productId ? { ...payload, id: productId } : payload)
    .select(PRODUCT_COLUMNS)
    .single<ProductRow>();

  if (error) {
    throw error;
  }
  return mapProductRow(data);
}

export async function updateProduct(
  productId: string,
  input: Partial<ProductInput>
): Promise<Product> {
  const patch: Record<string, unknown> = {};

  if (input.name !== undefined) {
    patch.name = input.name.trim();
  }
  if (input.description !== undefined) {
    patch.description = input.description?.trim() || null;
  }
  if (input.price !== undefined) {
    patch.price = input.price;
  }
  if (input.category !== undefined) {
    patch.category = input.category?.trim() || null;
  }
  if (input.brand !== undefined) {
    patch.brand = input.brand?.trim() || null;
  }
  if (input.stock !== undefined) {
    patch.stock = Math.max(0, Math.floor(input.stock));
  }
  if (input.images !== undefined) {
    patch.images = input.images;
  }
  if (input.sizes !== undefined) {
    patch.sizes = input.sizes;
  }
  if (input.isActive !== undefined) {
    patch.is_active = input.isActive;
  }

  const { data, error } = await supabase
    .from("products")
    .update(patch)
    .eq("id", productId)
    .select(PRODUCT_COLUMNS)
    .single<ProductRow>();

  if (error) {
    throw error;
  }
  return mapProductRow(data);
}

export async function setProductActive(
  productId: string,
  isActive: boolean
): Promise<Product> {
  return updateProduct(productId, { isActive });
}

export async function deleteProduct(productId: string): Promise<void> {
  const { error } = await supabase.from("products").delete().eq("id", productId);
  if (error) {
    throw error;
  }
}

export type { Product, ProductInput };
