import type { Product } from "../types/product";

/** Producten die aan een reel gekoppeld mogen worden (upload + feed-tag). */
export function isProductLinkableForReel(product: Product): boolean {
  return product.isActive && product.stock > 0;
}

export function filterLinkableUploadProducts(products: Product[]): Product[] {
  return products.filter(isProductLinkableForReel);
}
