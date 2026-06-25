export type Product = {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  price: number;
  category: string | null;
  mainCategory: string | null;
  audience: string | null;
  subcategory: string | null;
  brand: string | null;
  tags: string[];
  stock: number;
  images: string[];
  sizes: string[];
  isActive: boolean;
  createdAt: string;
  usesVariants: boolean;
  variantsReady: boolean;
  /** Alleen gezet door shop feed RPCs (dev/logging). */
  shopScore?: number;
  relevantTags?: string[];
  feedBucket?: string;
};

export type ProductRow = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  price: number | string;
  category: string | null;
  main_category?: string | null;
  audience?: string | null;
  subcategory?: string | null;
  brand: string | null;
  tags?: unknown;
  stock: number;
  images: unknown;
  sizes: unknown;
  is_active: boolean;
  created_at: string;
  uses_variants?: boolean;
  variants_ready?: boolean;
};

export type ProductInput = {
  name: string;
  description?: string | null;
  price: number;
  category?: string | null;
  mainCategory?: string | null;
  audience?: string | null;
  subcategory?: string | null;
  brand?: string | null;
  tags?: string[];
  stock: number;
  images: string[];
  sizes: string[];
  isActive?: boolean;
  usesVariants?: boolean;
  variantsReady?: boolean;
};

/** Productvelden zonder voorraad — voor gewone Opslaan-flow. */
export type ProductDetailsInput = Omit<ProductInput, "stock">;

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

export function mapProductRow(row: ProductRow): Product {
  const price =
    typeof row.price === "number" ? row.price : parseFloat(String(row.price));

  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    description: row.description,
    price: Number.isFinite(price) ? price : 0,
    category: row.category,
    mainCategory: row.main_category ?? null,
    audience: row.audience ?? null,
    subcategory: row.subcategory ?? null,
    brand: row.brand,
    tags: parseStringArray(row.tags),
    stock: Math.max(0, row.stock ?? 0),
    images: parseStringArray(row.images),
    sizes: parseStringArray(row.sizes),
    isActive: row.is_active,
    createdAt: row.created_at,
    usesVariants: row.uses_variants === true,
    variantsReady: row.variants_ready === true,
  };
}
