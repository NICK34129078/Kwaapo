import type { Product } from "../types/product";

export type ProductCatalogEvent =
  | { kind: "refresh" }
  | { kind: "created"; product: Product }
  | { kind: "updated"; product: Product }
  | { kind: "deleted"; productId: string };

type Listener = (event: ProductCatalogEvent) => void;

const listeners = new Set<Listener>();

export function subscribeProductCatalog(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitProductCatalogEvent(event: ProductCatalogEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}

/** @deprecated Gebruik emitProductCatalogEvent */
export function notifyProductCatalogChanged(): void {
  emitProductCatalogEvent({ kind: "refresh" });
}

export function mergeProductIntoList(
  list: Product[],
  product: Product
): Product[] {
  const without = list.filter((row) => row.id !== product.id);
  return [product, ...without];
}

export function removeProductFromList(
  list: Product[],
  productId: string
): Product[] {
  return list.filter((row) => row.id !== productId);
}
