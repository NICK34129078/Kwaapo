import { supabase } from "../lib/supabase";
import { formatProductStockError } from "../utils/formatAppError";

export type ProductStockAdjustment = {
  id: string;
  productId: string;
  sellerId: string;
  productVariantId: string | null;
  changeAmount: number;
  stockBefore: number;
  stockAfter: number;
  reason: string;
  createdAt: string;
};

type AdjustmentRow = {
  id: string;
  product_id: string;
  seller_id: string;
  product_variant_id?: string | null;
  change_amount: number;
  stock_before: number;
  stock_after: number;
  reason: string;
  created_at: string;
};

type AdjustStockResult = {
  productId: string;
  stockBefore: number;
  stockAfter: number;
  changeAmount: number;
  reason: string;
};

function mapRow(row: AdjustmentRow): ProductStockAdjustment {
  return {
    id: row.id,
    productId: row.product_id,
    sellerId: row.seller_id,
    productVariantId: row.product_variant_id ?? null,
    changeAmount: row.change_amount,
    stockBefore: row.stock_before,
    stockAfter: row.stock_after,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

function parseAdjustResult(json: unknown): AdjustStockResult {
  const row = json as Record<string, unknown>;
  return {
    productId: String(row.product_id ?? ""),
    stockBefore: Number(row.stock_before ?? 0),
    stockAfter: Number(row.stock_after ?? 0),
    changeAmount: Number(row.change_amount ?? 0),
    reason: String(row.reason ?? ""),
  };
}

export async function addProductStock(
  productId: string,
  amount: number
): Promise<AdjustStockResult> {
  const value = Math.floor(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Voer een positief aantal in.");
  }

  const { data, error } = await supabase.rpc("adjust_product_stock", {
    p_product_id: productId,
    p_mode: "add",
    p_value: value,
  });

  if (error) {
    throw new Error(formatProductStockError(error));
  }

  return parseAdjustResult(data);
}

export async function setProductStock(
  productId: string,
  newTotal: number
): Promise<AdjustStockResult> {
  const value = Math.floor(newTotal);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Voorraad kan niet lager zijn dan 0.");
  }

  const { data, error } = await supabase.rpc("adjust_product_stock", {
    p_product_id: productId,
    p_mode: "set",
    p_value: value,
  });

  if (error) {
    throw new Error(formatProductStockError(error));
  }

  return parseAdjustResult(data);
}

export async function fetchProductStockHistory(
  productId: string,
  limit = 5
): Promise<ProductStockAdjustment[]> {
  const cap = Math.min(Math.max(limit, 1), 20);

  const { data, error } = await supabase
    .from("product_stock_adjustments")
    .select(
      "id, product_id, seller_id, product_variant_id, change_amount, stock_before, stock_after, reason, created_at"
    )
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(cap);

  if (error) {
    throw error;
  }

  return ((data ?? []) as AdjustmentRow[]).map(mapRow);
}
