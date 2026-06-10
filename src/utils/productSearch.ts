import type { Product } from "../types/product";

function normalizeCategoryToken(value: string): string {
  return value.trim().toLowerCase();
}

/** Filter-chip: match op categorieveld, anders naam/beschrijving/merk. */
export function matchesProductCategory(product: Product, category: string): boolean {
  if (category === "Alle" || category.trim().length === 0) {
    return true;
  }
  const needle = normalizeCategoryToken(category);
  const categoryField = normalizeCategoryToken(product.category ?? "");
  if (categoryField === needle || categoryField.includes(needle)) {
    return true;
  }
  const haystack = [product.name, product.description, product.brand]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

function productHaystack(product: Product): string {
  return [product.name, product.brand, product.category, product.description]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" ")
    .toLowerCase();
}

/** Elk woord in de query moet voorkomen in naam, merk, categorie of beschrijving. */
export function matchesProductSearch(product: Product, query: string): boolean {
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return true;
  }
  const haystack = productHaystack(product);
  return tokens.every((token) => haystack.includes(token));
}
