import { supabase } from "../lib/supabase";
import type { UserVideoPost } from "../types/userVideoPost";
import { mapSupabasePostRowsToGlobalUserVideoPosts } from "./postsService";
import { isPersistablePostId } from "./postLikesService";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

function clampLimit(limit?: number): number {
  const raw = limit ?? DEFAULT_LIMIT;
  return Math.min(Math.max(raw, 1), MAX_LIMIT);
}

/**
 * Explore-feed voor gasten (en fallback): Supabase RPC `get_explore_feed`.
 * Werkt zonder auth; exclude-batch voor infinite scroll.
 */
export async function fetchExploreFeed(
  limit?: number,
  excludePostIds?: string[]
): Promise<UserVideoPost[]> {
  const lim = clampLimit(limit);
  const validExclude = (excludePostIds ?? []).filter(isPersistablePostId);

  const { data, error } = await supabase.rpc("get_explore_feed", {
    p_limit: lim,
    p_exclude_post_ids: validExclude,
  });

  if (error) {
    if (__DEV__) {
      console.warn("[ExploreFeed] fetch failed:", error.message);
    }
    return [];
  }

  if (data == null || !Array.isArray(data) || data.length === 0) {
    return [];
  }

  return await mapSupabasePostRowsToGlobalUserVideoPosts(data);
}
