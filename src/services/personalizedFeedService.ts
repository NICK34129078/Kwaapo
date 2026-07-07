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
 * Gepersonaliseerde Reels-candidates via Supabase RPC.
 * Bij geen user: lege array. Bij RPC-fout: throw (caller doet retry/explore).
 *
 * `excludePostIds`: posts die niet opnieuw in de batch mogen (voor infinite scroll).
 * Oude DB zonder `p_exclude_post_ids`: alleen fallback als er niets te excluden is.
 */
export async function fetchPersonalizedFeed(
  limit?: number,
  excludePostIds?: string[],
  options?: { allowRecentlyViewed?: boolean }
): Promise<UserVideoPost[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return [];
  }

  const lim = clampLimit(limit);
  const validExclude = (excludePostIds ?? []).filter(isPersistablePostId);
  const allowRecentlyViewed = options?.allowRecentlyViewed === true;

  const argsFull: Record<string, unknown> = {
    p_limit: lim,
    p_exclude_post_ids: validExclude,
  };
  if (allowRecentlyViewed) {
    argsFull.p_allow_recently_viewed = true;
  }

  let { data, error } = await supabase.rpc("get_personalized_feed", argsFull);

  if (error && allowRecentlyViewed) {
    const retry = await supabase.rpc("get_personalized_feed", {
      p_limit: lim,
      p_exclude_post_ids: validExclude,
    });
    data = retry.data;
    error = retry.error;
  } else if (error && validExclude.length === 0) {
    const retry = await supabase.rpc("get_personalized_feed", {
      p_limit: lim,
    });
    data = retry.data;
    error = retry.error;
  } else if (error) {
    throw new Error(error.message);
  }

  if (error) {
    throw new Error(error.message);
  }

  if (data == null || !Array.isArray(data) || data.length === 0) {
    return [];
  }

  if (__DEV__) {
    const sample = data.slice(0, 5).map((row) => {
      const r = row as { id?: string; tags?: unknown; ranking_score?: number };
      return {
        id: r.id,
        rawTags: r.tags,
        ranking_score: r.ranking_score,
      };
    });
    console.log("[PersonalizedFeed] raw tag sample", sample);
  }

  return await mapSupabasePostRowsToGlobalUserVideoPosts(data);
}
