import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "kwaapo_saved_product_ids";

async function readIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}

async function writeIds(ids: string[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(new Set(ids))));
}

export async function isProductSaved(productId: string): Promise<boolean> {
  const ids = await readIds();
  return ids.includes(productId);
}

export async function saveProductLocally(productId: string): Promise<void> {
  const ids = await readIds();
  if (!ids.includes(productId)) {
    ids.unshift(productId);
    await writeIds(ids.slice(0, 200));
  }
}

export async function unsaveProductLocally(productId: string): Promise<void> {
  const ids = await readIds();
  await writeIds(ids.filter((id) => id !== productId));
}

export async function fetchSavedProductIds(): Promise<string[]> {
  return readIds();
}
