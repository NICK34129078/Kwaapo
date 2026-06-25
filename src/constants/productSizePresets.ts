import type { ShopAudienceCode, ShopMainCategoryCode } from "./shopCategories";

/** Standaard kledingmaten (volwassenen). */
export const CLOTHING_SIZE_PRESETS = [
  "XXS",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "3XL",
] as const;

/** Kindermaten (kleding). */
export const CLOTHING_KIDS_SIZE_PRESETS = [
  "92",
  "104",
  "116",
  "128",
  "140",
  "152",
  "164",
] as const;

export const SHOE_SIZE_PRESETS = [
  "36",
  "37",
  "38",
  "39",
  "40",
  "41",
  "42",
  "43",
  "44",
  "45",
] as const;

/** Centrale modi — bepaalt wanneer maten getoond worden in seller- en koper-flow. */
export type ProductSizeMode =
  | "clothing_sizes"
  | "shoe_sizes"
  | "optional_sizes"
  | "no_sizes";

const CLOTHING_SIZE_SUBCATEGORIES = new Set([
  "t_shirts",
  "sweaters_hoodies",
  "pants",
  "jeans",
  "jackets",
  "shirts",
  "shorts",
  "underwear",
  "sportswear",
  "formal",
]);

const SHOE_SIZE_SUBCATEGORIES = new Set([
  "sneakers",
  "boots",
  "sandals",
  "slippers",
  "dress_shoes",
  "sports_shoes",
]);

const OPTIONAL_SIZE_SUBCATEGORIES = new Set([
  "belts",
  "gloves",
  "socks",
  "hats",
  "fitness_gloves",
]);

/** @deprecated — gebruik ProductSizeMode */
export type ProductSizeOptionsMode = "recommended" | "optional" | "none";

/**
 * Bepaalt welk maten-blok getoond wordt na categorie + producttype.
 * Zonder subcategory: no_sizes (maten nog niet tonen).
 */
export function getSizeMode(
  mainCategory: ShopMainCategoryCode | null | undefined,
  subcategory: string | null | undefined
): ProductSizeMode {
  if (!mainCategory || !subcategory) {
    return "no_sizes";
  }

  if (mainCategory === "clothing") {
    if (CLOTHING_SIZE_SUBCATEGORIES.has(subcategory)) {
      return "clothing_sizes";
    }
    return "optional_sizes";
  }

  if (mainCategory === "shoes") {
    if (SHOE_SIZE_SUBCATEGORIES.has(subcategory)) {
      return "shoe_sizes";
    }
    return "optional_sizes";
  }

  if (mainCategory === "accessories") {
    if (OPTIONAL_SIZE_SUBCATEGORIES.has(subcategory)) {
      return "optional_sizes";
    }
    return "no_sizes";
  }

  if (mainCategory === "sports") {
    if (subcategory === "sportswear") {
      return "clothing_sizes";
    }
    if (subcategory === "sports_shoes") {
      return "shoe_sizes";
    }
    if (subcategory === "fitness_gloves") {
      return "optional_sizes";
    }
    return "no_sizes";
  }

  if (
    mainCategory === "beauty" ||
    mainCategory === "electronics" ||
    mainCategory === "home" ||
    mainCategory === "other"
  ) {
    return "no_sizes";
  }

  return "no_sizes";
}

/** Maten zijn verplicht (variant-flow) wanneer mode clothing of shoe is. */
export function sizeModeRequiresVariants(mode: ProductSizeMode): boolean {
  return mode === "clothing_sizes" || mode === "shoe_sizes";
}

/** @deprecated — gebruik getSizeMode */
export function getProductSizeOptionsMode(
  mainCategory: ShopMainCategoryCode | null | undefined,
  subcategory: string | null | undefined
): ProductSizeOptionsMode {
  const mode = getSizeMode(mainCategory, subcategory);
  if (mode === "clothing_sizes" || mode === "shoe_sizes") {
    return "recommended";
  }
  if (mode === "optional_sizes") {
    return "optional";
  }
  return "none";
}

/** @deprecated — gebruik getSizeMode */
export function doesProductNeedSizeOptions(
  mainCategory: ShopMainCategoryCode | null | undefined,
  subcategory: string | null | undefined
): boolean {
  return getSizeMode(mainCategory, subcategory) !== "no_sizes";
}

/** Of een bestaand product de migratie naar voorraad per maat mag zien. */
export function productMayUsePerSizeStock(
  mainCategory: string | null | undefined,
  subcategory?: string | null,
  legacySizes?: readonly string[]
): boolean {
  if (legacySizes && legacySizes.length > 0) {
    return true;
  }
  if (!mainCategory) {
    return false;
  }
  return getSizeMode(
    mainCategory as ShopMainCategoryCode,
    subcategory ?? null
  ) !== "no_sizes";
}

/** @deprecated */
export function categoryUsesSizeVariants(
  mainCategory: string | null | undefined
): boolean {
  return mainCategory === "clothing" || mainCategory === "shoes";
}

export function sizePresetsForSizeMode(
  mode: ProductSizeMode,
  audience?: ShopAudienceCode | null
): readonly string[] {
  if (mode === "shoe_sizes") {
    return SHOE_SIZE_PRESETS;
  }
  if (mode === "clothing_sizes" && audience === "kids") {
    return CLOTHING_KIDS_SIZE_PRESETS;
  }
  if (mode === "clothing_sizes") {
    return CLOTHING_SIZE_PRESETS;
  }
  return CLOTHING_SIZE_PRESETS;
}

export function sizePresetsForCategory(
  mainCategory: ShopMainCategoryCode | null | undefined,
  audience?: ShopAudienceCode | null,
  subcategory?: string | null
): readonly string[] {
  const mode = getSizeMode(mainCategory, subcategory ?? null);
  if (mode === "shoe_sizes") {
    return SHOE_SIZE_PRESETS;
  }
  if (mode === "clothing_sizes" && audience === "kids") {
    return CLOTHING_KIDS_SIZE_PRESETS;
  }
  if (mode === "clothing_sizes" || mode === "optional_sizes") {
    return CLOTHING_SIZE_PRESETS;
  }
  return CLOTHING_SIZE_PRESETS;
}

/** Kleding/schoenen: audience verplicht vóór maten. */
export function isCategoryReadyForSizeQuestion(
  mainCategory: ShopMainCategoryCode | null,
  audience: ShopAudienceCode | null,
  subcategory: string | null
): boolean {
  if (!mainCategory || !subcategory) {
    return false;
  }
  if (mainCategory === "clothing" || mainCategory === "shoes") {
    return audience != null;
  }
  return true;
}

/** Hoofdcategorie vereist doelgroep-stap. */
export function categoryRequiresAudience(
  mainCategory: ShopMainCategoryCode | null | undefined
): boolean {
  return mainCategory === "clothing" || mainCategory === "shoes";
}
