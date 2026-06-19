import { supabase } from "../lib/supabase";
import { isPersistablePostId } from "./postLikesService";
import { mapSupabasePostRowsToGlobalUserVideoPosts } from "./postsService";
import type { UserVideoPost } from "../types/userVideoPost";

/**
 * Opgeslagen posts (bookmarks). Bron van waarheid is `public.saved_posts`.
 * Voor nu zijn saves openbaar leesbaar (zie RLS); later uitbreidbaar met privacy.
 */

const IN_BATCH = 120;

function logSavedPostsError(scope: string, error: unknown): void {
  const e = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  };
  console.warn(`[saved_posts] ${scope}`, {
    code: e.code,
    message: e.message,
    details: e.details,
    hint: e.hint,
  });
}

async function getCurrentUserId(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/* -------------------------------------------------------------------------- */
/* Lichte in-memory cache zodat FeedItem-status consistent blijft over         */
/* remounts (FlatList-virtualisatie) en optimistische toggles meteen overal    */
/* zichtbaar zijn. Waarheid blijft de saved_posts-tabel.                       */
/* -------------------------------------------------------------------------- */

const savedStatusCache = new Map<string, boolean>();
type SavedStatusListener = () => void;
const savedStatusListeners = new Set<SavedStatusListener>();

function notifySavedStatusListeners(): void {
  for (const listener of savedStatusListeners) {
    listener();
  }
}

export function subscribeSavedStatus(listener: SavedStatusListener): () => void {
  savedStatusListeners.add(listener);
  return () => {
    savedStatusListeners.delete(listener);
  };
}

export function getCachedSavedStatus(postId: string): boolean | undefined {
  return savedStatusCache.get(postId);
}

export function setCachedSavedStatus(postId: string, saved: boolean): void {
  savedStatusCache.set(postId, saved);
  notifySavedStatusListeners();
}

/** Wis de cache, bijv. bij uitloggen of accountwissel. */
export function clearSavedStatusCache(): void {
  savedStatusCache.clear();
  notifySavedStatusListeners();
}

/**
 * Batch: welke van `postIds` heeft de huidige gebruiker opgeslagen.
 * Vult meteen de in-memory cache (ook expliciet `false` voor niet-opgeslagen).
 */
export async function fetchSavedPostIdsForCurrentUser(
  postIds: string[]
): Promise<Set<string>> {
  const out = new Set<string>();
  const uuidIds = postIds.filter(isPersistablePostId);
  if (uuidIds.length === 0) {
    return out;
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return out;
  }

  for (let i = 0; i < uuidIds.length; i += IN_BATCH) {
    const slice = uuidIds.slice(i, i + IN_BATCH);
    const { data, error } = await supabase
      .from("saved_posts")
      .select("post_id")
      .eq("user_id", userId)
      .in("post_id", slice);

    if (error) {
      logSavedPostsError("fetchSavedPostIdsForCurrentUser", error);
      throw error;
    }
    for (const row of (data ?? []) as { post_id: string }[]) {
      out.add(row.post_id);
    }
  }

  // Cache vullen voor alle opgevraagde ids (true én false).
  for (const id of uuidIds) {
    savedStatusCache.set(id, out.has(id));
  }
  notifySavedStatusListeners();

  return out;
}

/** Is één specifieke post opgeslagen door de huidige gebruiker. */
export async function isPostSaved(postId: string): Promise<boolean> {
  if (!isPersistablePostId(postId)) {
    return false;
  }
  const userId = await getCurrentUserId();
  if (!userId) {
    return false;
  }

  const { data, error } = await supabase
    .from("saved_posts")
    .select("post_id")
    .eq("user_id", userId)
    .eq("post_id", postId)
    .maybeSingle();

  if (error) {
    logSavedPostsError("isPostSaved", error);
    throw error;
  }

  const saved = data != null;
  savedStatusCache.set(postId, saved);
  notifySavedStatusListeners();
  return saved;
}

/** Sla een post op (idempotent: dubbele save geeft geen fout). */
export async function savePost(postId: string): Promise<void> {
  if (!isPersistablePostId(postId)) {
    throw new Error("Ongeldige post.");
  }
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error("Niet ingelogd.");
  }

  const { error } = await supabase
    .from("saved_posts")
    .insert({ user_id: userId, post_id: postId });

  if (error) {
    // 23505 = unique_violation: al opgeslagen, behandelen als succes.
    if ((error as { code?: string }).code === "23505") {
      setCachedSavedStatus(postId, true);
      return;
    }
    logSavedPostsError("savePost", error);
    throw error;
  }

  setCachedSavedStatus(postId, true);
}

/** Verwijder een opgeslagen post (idempotent). */
export async function unsavePost(postId: string): Promise<void> {
  if (!isPersistablePostId(postId)) {
    throw new Error("Ongeldige post.");
  }
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error("Niet ingelogd.");
  }

  const { error } = await supabase
    .from("saved_posts")
    .delete()
    .eq("user_id", userId)
    .eq("post_id", postId);

  if (error) {
    logSavedPostsError("unsavePost", error);
    throw error;
  }

  setCachedSavedStatus(postId, false);
}

/**
 * Toggle save/unsave. Retourneert de nieuwe saved-status.
 * Gebruikt de cache als hint, maar valt terug op de tabel.
 */
export async function toggleSavePost(postId: string): Promise<boolean> {
  const current = savedStatusCache.get(postId) ?? (await isPostSaved(postId));
  if (current) {
    await unsavePost(postId);
    return false;
  }
  await savePost(postId);
  return true;
}

type SavedPostRow = {
  post_id: string;
  created_at: string;
};

/**
 * Opgeslagen posts van een gebruiker, nieuwste save eerst.
 * Haalt saved_posts op en mapt de gekoppelde posts via de bestaande feed-mapping,
 * zodat video/foto/audio/product-info net als in de feed werken.
 */
export async function fetchSavedPostsByUserId(
  userId: string
): Promise<UserVideoPost[]> {
  if (!userId || userId.length === 0) {
    return [];
  }

  const { data: savedRows, error: savedError } = await supabase
    .from("saved_posts")
    .select("post_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (savedError) {
    logSavedPostsError("fetchSavedPostsByUserId", savedError);
    throw savedError;
  }

  const rows = (savedRows ?? []) as SavedPostRow[];
  const orderedPostIds = rows
    .map((r) => r.post_id)
    .filter(isPersistablePostId);
  if (orderedPostIds.length === 0) {
    return [];
  }

  // Bewaar de save-volgorde (nieuwste eerst) om na de fetch te kunnen sorteren.
  const savedOrder = new Map<string, number>();
  orderedPostIds.forEach((id, index) => {
    if (!savedOrder.has(id)) {
      savedOrder.set(id, index);
    }
  });

  const { data: postRows, error: postsError } = await supabase
    .from("posts")
    .select("*")
    .eq("is_deleted", false)
    .in("id", orderedPostIds);

  if (postsError) {
    logSavedPostsError("fetchSavedPostsByUserId/posts", postsError);
    throw postsError;
  }

  const mapped = await mapSupabasePostRowsToGlobalUserVideoPosts(postRows ?? []);

  return mapped
    .map((post) => ({ ...post, isSaved: true }))
    .sort((a, b) => {
      const oa = savedOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const ob = savedOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return oa - ob;
    });
}
