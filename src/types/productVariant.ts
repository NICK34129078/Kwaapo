export type ProductVariant = {
  id: string;
  productId: string;
  sellerId: string;
  optionType: string;
  optionValue: string;
  sku: string | null;
  priceOverride: number | null;
  stock: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ProductVariantRow = {
  id: string;
  product_id: string;
  seller_id: string;
  option_type: string;
  option_value: string;
  sku: string | null;
  price_override: number | string | null;
  stock: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type VariantStockInput = {
  optionValue: string;
  stock: number;
  isActive?: boolean;
};

export function mapProductVariantRow(row: ProductVariantRow): ProductVariant {
  const priceRaw = row.price_override;
  const priceOverride =
    priceRaw == null
      ? null
      : typeof priceRaw === "number"
        ? priceRaw
        : parseFloat(String(priceRaw));

  return {
    id: row.id,
    productId: row.product_id,
    sellerId: row.seller_id,
    optionType: row.option_type,
    optionValue: row.option_value,
    sku: row.sku,
    priceOverride: Number.isFinite(priceOverride!) ? priceOverride : null,
    stock: Math.max(0, row.stock ?? 0),
    isActive: row.is_active,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
