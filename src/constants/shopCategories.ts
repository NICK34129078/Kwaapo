/** Vaste shop-categorieën — zelfde lijst voor filters én productformulier. */
export const SHOP_PRODUCT_CATEGORIES = [
  "Kleding",
  "Schoenen",
  "Accessoires",
  "Elektronica",
  "Sport",
  "Overig",
] as const;

export type ShopProductCategory = (typeof SHOP_PRODUCT_CATEGORIES)[number];

export const SHOP_CATEGORY_FILTERS = ["Alle", ...SHOP_PRODUCT_CATEGORIES] as const;

export type ShopCategoryFilter = (typeof SHOP_CATEGORY_FILTERS)[number];

export function isShopProductCategory(value: string): value is ShopProductCategory {
  return (SHOP_PRODUCT_CATEGORIES as readonly string[]).includes(value);
}
