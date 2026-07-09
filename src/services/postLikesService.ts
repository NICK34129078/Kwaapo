import { supabase } from "../lib/supabase";
import { queueContentInteraction } from "./contentInteractionsService";

function logPostLikesError(scope: string, error: unknown): void {
  const e = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  };
  console.warn(`[post_likes] ${scope}`, {
    code: e.code,
    message: e.message,
    details: e.details,
    hint: e.hint,
  });
}

/**
 * Likes: bron van waarheid is `public.post_likes`.
 * `posts.likes_count` (worker) is alleen een fallback in de UI als er nog geen aggregatie is.
 */

const IN_BATCH = 120;

function fireApplyPostLikePreference(postId: string, isLiked: boolean): void {
  void supabase
    .rpc("apply_post_like_preference", {
      p_post_id: postId,
      p_is_liked: isLiked,
    })
    .then(({ error }) => {
      if (error) {
        console.warn("[Likes] preference update failed:", error.message);
      }
    });
  queueContentInteraction({
    postId,
    eventType: isLiked ? "like" : "unlike",
  });
}

/** Alleen echte post-ids (uuid); placeholders zoals "reel-1" niet. */
export function isPersistablePostId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id
  );
}

/**
 * Alle `post_id` in `postIds` waar `user_id` een like heeft gezet.
 */
export async function fetchLikedPostIdsForUser(
  postIds: string[],
  userId: string
): Promise<Set<string>> {
  const uuidIds = postIds.filter(isPersistablePostId);
  if (!userId || uuidIds.length === 0) {
    return new Set();
  }

  const out = new Set<string>();
  for (let i = 0; i < uuidIds.length; i += IN_BATCH) {
    const slice = uuidIds.slice(i, i + IN_BATCH);
    const { data, error } = await supabase
      .from("post_likes")
      .select("post_id")
      .eq("user_id", userId)
      .in("post_id", slice);

    if (error) {
      logPostLikesError("fetchLikedPostIdsForUser", error);
      throw error;
    }
    for (const row of (data ?? []) as { post_id: string }[]) {
      out.add(row.post_id);
    }
  }
  return out;
}

/** @deprecated gebruik fetchLikedPostIdsForUser(postIds, userId) */
export async function fetchMyLikedPostIds(
  userId: string,
  postIds: string[]
): Promise<Set<string>> {
  return fetchLikedPostIdsForUser(postIds, userId);
}

/**
 * Aantal likes per post uit `post_likes` (alle rijen met `post_id` in de lijst).
 */
export async function fetchLikeCountsForPosts(
  postIds: string[]
): Promise<Record<string, number>> {
  const uuidIds = postIds.filter(isPersistablePostId);
  const counts: Record<string, number> = {};
  if (uuidIds.length === 0) {
    return counts;
  }

  for (let i = 0; i < uuidIds.length; i += IN_BATCH) {
    const slice = uuidIds.slice(i, i + IN_BATCH);
    const { data, error } = await supabase
      .from("post_likes")
      .select("post_id")
      .in("post_id", slice);

    if (error) {
      logPostLikesError("fetchLikeCountsForPosts", error);
      throw error;
    }
    for (const row of (data ?? []) as { post_id: string }[]) {
      const pid = row.post_id;
      counts[pid] = (counts[pid] ?? 0) + 1;
    }
  }

  for (const id of uuidIds) {
    if (counts[id] === undefined) {
      counts[id] = 0;
    }
  }
  return counts;
}

/**
 * Zet like aan/uit. Vereist geen rij in `public.posts` (FK optioneel verwijderd).
 */
export async function setPostLikedInSupabase(
  postId: string,
  userId: string,
  liked: boolean
): Promise<void> {
  if (!isPersistablePostId(postId)) {
    return;
  }

  if (liked) {
    const { data, error } = await supabase
      .from("post_likes")
      .insert({
        post_id: postId,
        user_id: userId,
      })
      .select("post_id");

    if (error) {
      logPostLikesError("insert post_likes", error);
      if ((error as { code?: string }).code === "23505") {
        return;
      }
      throw error;
    }
    if (data != null && data.length > 0) {
      fireApplyPostLikePreference(postId, true);
    }
    return;
  }

  const { data, error } = await supabase
    .from("post_likes")
    .delete()
    .eq("post_id", postId)
    .eq("user_id", userId)
    .select("post_id");

  if (error) {
    logPostLikesError("delete post_likes", error);
    throw error;
  }
  if (data != null && data.length > 0) {
    fireApplyPostLikePreference(postId, false);
  }
}
