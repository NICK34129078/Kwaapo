import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY_PREFIX = "in_app_toast_shown_v1:";
const LEGACY_SELLER_KEY_PREFIX = "seller_order_toast_shown_v1:";
const MAX_STORED_IDS = 500;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type StoredEntry = {
  id: string;
  shownAtMs: number;
};

function storageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

function legacySellerKey(userId: string): string {
  return `${LEGACY_SELLER_KEY_PREFIX}${userId}`;
}

function parseStoredEntries(raw: string | null): StoredEntry[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    const now = Date.now();
    const entries: StoredEntry[] = [];
    for (const item of parsed) {
      if (typeof item === "string" && item.length > 0) {
        entries.push({ id: item, shownAtMs: now });
        continue;
      }
      if (
        item &&
        typeof item === "object" &&
        typeof (item as StoredEntry).id === "string" &&
        typeof (item as StoredEntry).shownAtMs === "number"
      ) {
        entries.push(item as StoredEntry);
      }
    }
    return entries.filter((entry) => now - entry.shownAtMs <= RETENTION_MS);
  } catch {
    return [];
  }
}

async function readEntries(userId: string): Promise<StoredEntry[]> {
  const [currentRaw, legacyRaw] = await Promise.all([
    AsyncStorage.getItem(storageKey(userId)),
    AsyncStorage.getItem(legacySellerKey(userId)),
  ]);
  const merged = new Map<string, StoredEntry>();
  for (const entry of [
    ...parseStoredEntries(currentRaw),
    ...parseStoredEntries(legacyRaw),
  ]) {
    merged.set(entry.id, entry);
  }
  return Array.from(merged.values());
}

export async function loadInAppToastShownIds(userId: string): Promise<Set<string>> {
  if (!userId) {
    return new Set();
  }
  try {
    const entries = await readEntries(userId);
    return new Set(entries.map((entry) => entry.id));
  } catch {
    return new Set();
  }
}

export async function persistInAppToastShownId(
  userId: string,
  notificationId: string
): Promise<void> {
  if (!userId || !notificationId) {
    return;
  }
  try {
    const entries = await readEntries(userId);
    const merged = new Map(entries.map((entry) => [entry.id, entry]));
    merged.set(notificationId, { id: notificationId, shownAtMs: Date.now() });
    const next = Array.from(merged.values())
      .sort((a, b) => a.shownAtMs - b.shownAtMs)
      .slice(-MAX_STORED_IDS);
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    // Non-critical — database toast_shown_at is authoritative.
  }
}

export async function clearInAppToastShownIds(userId: string): Promise<void> {
  try {
    await Promise.all([
      AsyncStorage.removeItem(storageKey(userId)),
      AsyncStorage.removeItem(legacySellerKey(userId)),
    ]);
  } catch {
    // ignore
  }
}
