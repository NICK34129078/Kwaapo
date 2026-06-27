import {
  filterLinkableUploadProducts,
  isProductLinkableForReel,
} from "./linkableUploadProducts";
import type { Product } from "../types/product";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1",
    ownerId: "u1",
    name: "Test",
    description: null,
    price: 10,
    category: null,
    mainCategory: null,
    audience: null,
    subcategory: null,
    brand: null,
    tags: [],
    stock: 5,
    images: [],
    sizes: [],
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    usesVariants: false,
    variantsReady: false,
    ...overrides,
  };
}

export function runLinkableUploadProductsTests(): void {
  assert(isProductLinkableForReel(product()), "actief product met voorraad is linkbaar");
  assert(
    !isProductLinkableForReel(product({ isActive: false })),
    "inactief product niet linkbaar"
  );
  assert(
    !isProductLinkableForReel(product({ stock: 0 })),
    "uitverkocht product niet linkbaar"
  );

  const filtered = filterLinkableUploadProducts([
    product({ id: "a" }),
    product({ id: "b", stock: 0 }),
    product({ id: "c", isActive: false }),
  ]);
  assert(
    filtered.map((p) => p.id).join(",") === "a",
    "filter houdt alleen linkbare producten"
  );
}

if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") {
  runLinkableUploadProductsTests();
}
