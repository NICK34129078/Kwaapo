/** Shop hoofdcategorie codes (database: products.main_category). */
export const SHOP_MAIN_CATEGORY_CODES = [
  "clothing",
  "shoes",
  "accessories",
  "beauty",
  "electronics",
  "home",
  "sports",
  "other",
] as const;

export type ShopMainCategoryCode = (typeof SHOP_MAIN_CATEGORY_CODES)[number];

export const SHOP_AUDIENCE_CODES = ["men", "women", "kids", "unisex"] as const;

export type ShopAudienceCode = (typeof SHOP_AUDIENCE_CODES)[number];

export type ShopMainCategoryDef = {
  code: ShopMainCategoryCode;
  label: string;
  /** Kleding/schoenen: eerst doelgroep, daarna subcategorie. */
  hasAudienceStep: boolean;
};

export const SHOP_MAIN_CATEGORIES: readonly ShopMainCategoryDef[] = [
  { code: "clothing", label: "Kleding", hasAudienceStep: true },
  { code: "shoes", label: "Schoenen", hasAudienceStep: true },
  { code: "accessories", label: "Accessoires", hasAudienceStep: false },
  { code: "beauty", label: "Beauty", hasAudienceStep: false },
  { code: "electronics", label: "Elektronica", hasAudienceStep: false },
  { code: "home", label: "Wonen", hasAudienceStep: false },
  { code: "sports", label: "Sport", hasAudienceStep: false },
  { code: "other", label: "Overig", hasAudienceStep: false },
] as const;

export const SHOP_AUDIENCES: readonly { code: ShopAudienceCode; label: string }[] = [
  { code: "men", label: "Heren" },
  { code: "women", label: "Dames" },
  { code: "kids", label: "Kinderen" },
  { code: "unisex", label: "Unisex" },
] as const;

export type ShopSubcategoryDef = { code: string; label: string };

export const SHOP_SUBCATEGORIES: Record<ShopMainCategoryCode, readonly ShopSubcategoryDef[]> = {
  clothing: [
    { code: "t_shirts", label: "T-shirts" },
    { code: "sweaters_hoodies", label: "Truien & hoodies" },
    { code: "pants", label: "Broeken" },
    { code: "jeans", label: "Jeans" },
    { code: "jackets", label: "Jassen" },
    { code: "shirts", label: "Overhemden" },
    { code: "shorts", label: "Shorts" },
    { code: "underwear", label: "Ondergoed" },
    { code: "sportswear", label: "Sportkleding" },
    { code: "formal", label: "Pakken & formeel" },
    { code: "other", label: "Overig" },
  ],
  shoes: [
    { code: "sneakers", label: "Sneakers" },
    { code: "boots", label: "Laarzen" },
    { code: "sandals", label: "Sandalen" },
    { code: "slippers", label: "Slippers" },
    { code: "dress_shoes", label: "Nette schoenen" },
    { code: "sports_shoes", label: "Sportschoenen" },
    { code: "other", label: "Overig" },
  ],
  accessories: [
    { code: "bags", label: "Tassen" },
    { code: "belts", label: "Riemen" },
    { code: "gloves", label: "Handschoenen" },
    { code: "socks", label: "Sokken" },
    { code: "watches", label: "Horloges" },
    { code: "glasses", label: "Brillen" },
    { code: "hats", label: "Petten" },
    { code: "jewelry", label: "Sieraden" },
    { code: "wallets", label: "Portemonnees" },
    { code: "other", label: "Overig" },
  ],
  beauty: [
    { code: "face", label: "Gezicht" },
    { code: "hair", label: "Haar" },
    { code: "fragrance", label: "Geur" },
    { code: "makeup", label: "Make-up" },
    { code: "care", label: "Verzorging" },
    { code: "other", label: "Overig" },
  ],
  electronics: [
    { code: "phones", label: "Telefoons" },
    { code: "headphones", label: "Koptelefoons" },
    { code: "speakers", label: "Speakers" },
    { code: "gaming", label: "Gaming" },
    { code: "wearables", label: "Wearables" },
    { code: "camera", label: "Camera" },
    { code: "other", label: "Overig" },
  ],
  sports: [
    { code: "sportswear", label: "Sportkleding" },
    { code: "sports_shoes", label: "Sportschoenen" },
    { code: "fitness_gloves", label: "Fitnesshandschoenen" },
    { code: "football", label: "Voetbal" },
    { code: "fitness", label: "Fitnessmateriaal" },
    { code: "cycling", label: "Fietsen" },
    { code: "running", label: "Hardlopen" },
    { code: "outdoor", label: "Outdoor" },
    { code: "other", label: "Overig" },
  ],
  home: [
    { code: "decor", label: "Decoratie" },
    { code: "lighting", label: "Verlichting" },
    { code: "furniture", label: "Meubels" },
    { code: "kitchen", label: "Keuken" },
    { code: "bedroom", label: "Slaapkamer" },
    { code: "other", label: "Overig" },
  ],
  other: [{ code: "other", label: "Overig" }],
};

/** Bovenste shop-tabs (feed-modi + hoofdcategorieën). */
export type ShopFeedTabId = "voor_jou" | "browse" | ShopMainCategoryCode;

export type ShopFeedTabDef = {
  id: ShopFeedTabId;
  label: string;
};

export const SHOP_FEED_TABS: readonly ShopFeedTabDef[] = [
  { id: "voor_jou", label: "Voor jou" },
  { id: "browse", label: "Alle" },
  ...SHOP_MAIN_CATEGORIES.map((c) => ({ id: c.code, label: c.label })),
];

/** @deprecated — gebruik SHOP_MAIN_CATEGORIES labels voor legacy category veld. */
export const SHOP_PRODUCT_CATEGORIES = SHOP_MAIN_CATEGORIES.map((c) => c.label);

export type ShopProductCategory = (typeof SHOP_PRODUCT_CATEGORIES)[number];

/** @deprecated */
export const SHOP_CATEGORY_FILTERS = ["Alle", ...SHOP_PRODUCT_CATEGORIES] as const;

export type ShopCategoryFilter = (typeof SHOP_CATEGORY_FILTERS)[number];

export function isShopMainCategoryCode(value: string): value is ShopMainCategoryCode {
  return (SHOP_MAIN_CATEGORY_CODES as readonly string[]).includes(value);
}

export function isShopProductCategory(value: string): value is ShopProductCategory {
  return (SHOP_PRODUCT_CATEGORIES as readonly string[]).includes(value);
}

export function getMainCategoryDef(
  code: ShopMainCategoryCode | null | undefined
): ShopMainCategoryDef | undefined {
  if (!code) {
    return undefined;
  }
  return SHOP_MAIN_CATEGORIES.find((c) => c.code === code);
}

export function legacyCategoryLabelFromCodes(
  mainCategory: ShopMainCategoryCode | null | undefined,
  _audience?: ShopAudienceCode | null,
  _subcategory?: string | null
): string | null {
  const def = getMainCategoryDef(mainCategory ?? undefined);
  return def?.label ?? null;
}

export function resolveMainCategoryFromLegacyCategory(
  category: string | null | undefined
): ShopMainCategoryCode | null {
  if (!category?.trim()) {
    return null;
  }
  const needle = category.trim().toLowerCase();
  const match = SHOP_MAIN_CATEGORIES.find(
    (c) => c.label.toLowerCase() === needle || c.code === needle
  );
  return match?.code ?? null;
}

export function getSubcategoryLabel(
  mainCategory: ShopMainCategoryCode,
  subcategoryCode: string | null | undefined
): string | null {
  if (!subcategoryCode) {
    return null;
  }
  const list = SHOP_SUBCATEGORIES[mainCategory] ?? [];
  return list.find((s) => s.code === subcategoryCode)?.label ?? subcategoryCode;
}

export function getAudienceLabel(code: ShopAudienceCode | null | undefined): string | null {
  if (!code) {
    return null;
  }
  return SHOP_AUDIENCES.find((a) => a.code === code)?.label ?? null;
}
