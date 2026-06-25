import { supabase } from "../lib/supabase";
import {
  mapProductVariantRow,
  type ProductVariant,
  type ProductVariantRow,
  type VariantStockInput,
} from "../types/productVariant";
import { formatProductStockError } from "../utils/formatAppError";

const VARIANT_COLUMNS =
  "id, product_id, seller_id, option_type, option_value, sku, price_override, stock, is_active, sort_order, created_at, updated_at";

export async function fetchProductVariants(
  productId: string,
  options?: { sellerView?: boolean }
): Promise<ProductVariant[]> {
  const { data, error } = await supabase
    .from("product_variants")
    .select(VARIANT_COLUMNS)
    .eq("product_id", productId)
    .order("sort_order", { ascending: true })
    .order("option_value", { ascending: true });

  if (error) {
    throw error;
  }

  let rows = (data ?? []) as ProductVariantRow[];
  if (!options?.sellerView) {
    rows = rows.filter((row) => row.is_active);
  }

  return rows.map(mapProductVariantRow);
}

export async function enableProductVariantsDraft(
  productId: string,
  optionValues: string[]
): Promise<void> {
  const unique = Array.from(
    new Set(optionValues.map((v) => v.trim()).filter((v) => v.length > 0))
  );
  if (unique.length === 0) {
    throw new Error("Kies minimaal één maat.");
  }

  const { error } = await supabase.rpc("enable_product_variants_draft", {
    p_product_id: productId,
    p_option_values: unique,
  });

  if (error) {
    throw new Error(formatProductStockError(error));
  }
}

export async function saveProductVariantStocks(
  productId: string,
  items: VariantStockInput[]
): Promise<void> {
  const payload = items.map((item) => ({
    option_type: "size",
    option_value: item.optionValue.trim(),
    stock: Math.max(0, Math.floor(item.stock)),
    is_active: item.isActive ?? true,
  }));

  const { error } = await supabase.rpc("save_product_variant_stocks", {
    p_product_id: productId,
    p_items: payload,
  });

  if (error) {
    throw new Error(formatProductStockError(error));
  }
}

export async function activateProductVariants(productId: string): Promise<void> {
  const { error } = await supabase.rpc("activate_product_variants", {
    p_product_id: productId,
  });

  if (error) {
    throw new Error(formatProductStockError(error));
  }
}

export async function adjustProductVariantStock(
  variantId: string,
  mode: "add" | "set",
  value: number
): Promise<{ stockAfter: number; optionValue: string }> {
  const { data, error } = await supabase.rpc("adjust_product_variant_stock", {
    p_variant_id: variantId,
    p_mode: mode,
    p_value: Math.floor(value),
  });

  if (error) {
    throw new Error(formatProductStockError(error));
  }

  const row = data as Record<string, unknown>;
  return {
    stockAfter: Number(row.stock_after ?? 0),
    optionValue: String(row.option_value ?? ""),
  };
}

export async function setupNewProductWithVariants(
  productId: string,
  items: VariantStockInput[]
): Promise<void> {
  const { error: patchError } = await supabase
    .from("products")
    .update({ uses_variants: true })
    .eq("id", productId);

  if (patchError) {
    throw patchError;
  }

  await saveProductVariantStocks(productId, items);
  await activateProductVariants(productId);
}
