export type Product = {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  price: number;
  category: string | null;
  brand: string | null;
  stock: number;
  images: string[];
  sizes: string[];
  isActive: boolean;
  createdAt: string;
};

export type ProductRow = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  price: number | string;
  category: string | null;
  brand: string | null;
  stock: number;
  images: unknown;
  sizes: unknown;
  is_active: boolean;
  created_at: string;
};

export type ProductInput = {
  name: string;
  description?: string | null;
  price: number;
  category?: string | null;
  brand?: string | null;
  stock: number;
  images: string[];
  sizes: string[];
  isActive?: boolean;
};

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
    brand: row.brand,
    stock: Math.max(0, row.stock ?? 0),
    images: parseStringArray(row.images),
    sizes: parseStringArray(row.sizes),
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}
