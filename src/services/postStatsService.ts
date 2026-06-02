import { supabase } from "../lib/supabase";
import { isPersistablePostId } from "./postLikesService";

const IN_BATCH = 80;

/** Later via payments/orders. */
const PURCHASES_PLACEHOLDER = 0;

export type PostStats = {
  postId: string;
  viewsCount: number;
  likesCount: number;
  productClicksCount: number;
  purchasesCount: number;
};

type OwnedPostRow = {
  id: string;
  likes_count: number | null;
};

type IdRow = {
  post_id: string;
};

function emptyStatsForPost(postId: string, likesCount = 0): PostStats {
  return {
    postId,
    viewsCount: 0,
    likesCount,
    productClicksCount: 0,
    purchasesCount: PURCHASES_PLACEHOLDER,
  };
}

async function fetchOwnedPostIds(
  userId: string,
  postIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const uuidIds = postIds.filter(isPersistablePostId);
  if (uuidIds.length === 0) {
    return map;
  }

  for (let i = 0; i < uuidIds.length; i += IN_BATCH) {
    const slice = uuidIds.slice(i, i + IN_BATCH);
    const { data, error } = await supabase
      .from("posts")
      .select("id, likes_count")
      .eq("user_id", userId)
      .eq("is_deleted", false)
      .in("id", slice);

    if (error) {
      throw error;
    }

    for (const row of (data ?? []) as OwnedPostRow[]) {
      map.set(row.id, Math.max(0, row.likes_count ?? 0));
    }
  }

  return map;
}

async function fetchViewCountsByPost(
  postIds: string[]
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const id of postIds) {
    counts[id] = 0;
  }

  if (postIds.length === 0) {
    return counts;
  }

  for (let i = 0; i < postIds.length; i += IN_BATCH) {
    const slice = postIds.slice(i, i + IN_BATCH);
    const { data, error } = await supabase
      .from("video_views")
      .select("post_id")
      .in("post_id", slice);

    if (error) {
      console.warn("[PostStats] views fetch failed:", error.message);
      return counts;
    }

    for (const row of (data ?? []) as IdRow[]) {
      counts[row.post_id] = (counts[row.post_id] ?? 0) + 1;
    }
  }

  return counts;
}

async function fetchProductClickCountsByPost(
  userId: string,
  postIds: string[]
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const id of postIds) {
    counts[id] = 0;
  }

  if (postIds.length === 0) {
    return counts;
  }

  for (let i = 0; i < postIds.length; i += IN_BATCH) {
    const slice = postIds.slice(i, i + IN_BATCH);
    const { data, error } = await supabase
      .from("product_clicks")
      .select("post_id")
      .eq("creator_id", userId)
      .neq("viewer_id", userId)
      .in("post_id", slice);

    if (error) {
      throw error;
    }

    for (const row of (data ?? []) as IdRow[]) {
      counts[row.post_id] = (counts[row.post_id] ?? 0) + 1;
    }
  }

  return counts;
}

/**
 * Creator-statistieken per eigen post (views, likes, externe productkliks).
 */
export async function fetchMyPostStats(
  postIds: string[]
): Promise<Record<string, PostStats>> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      throw userError;
    }
    if (!user?.id) {
      return {};
    }

    const owned = await fetchOwnedPostIds(user.id, postIds);
    const ownedIds = [...owned.keys()];
    if (ownedIds.length === 0) {
      return {};
    }

    const [viewsByPost, clicksByPost] = await Promise.all([
      fetchViewCountsByPost(ownedIds),
      fetchProductClickCountsByPost(user.id, ownedIds),
    ]);

    const out: Record<string, PostStats> = {};
    for (const postId of ownedIds) {
      out[postId] = {
        postId,
        viewsCount: viewsByPost[postId] ?? 0,
        likesCount: owned.get(postId) ?? 0,
        productClicksCount: clicksByPost[postId] ?? 0,
        purchasesCount: PURCHASES_PLACEHOLDER,
      };
    }

    return out;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[PostStats] fetch failed:", msg);
    return {};
  }
}

export { emptyStatsForPost };
