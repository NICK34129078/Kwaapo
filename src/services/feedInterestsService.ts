import { supabase } from "../lib/supabase";
import { prepareInterestSeedPayload } from "../utils/feedInterests";

/**
 * Cold-start interest onboarding. Backed by the RPCs in migration
 * `20260710130000_feed_cold_start_onboarding.sql`.
 */

export type PopularFeedTag = {
  tag: string;
  usageCount: number;
};

/** Live popular tags to offer in the picker (data-driven, may be empty). */
export async function fetchPopularFeedTags(
  limit = 24
): Promise<PopularFeedTag[]> {
  const { data, error } = await supabase.rpc("get_popular_feed_tags", {
    p_limit: limit,
  });
  if (error) {
    console.warn("[FeedInterests] popular tags failed:", error.message);
    return [];
  }
  return ((data ?? []) as { tag: string; usage_count: number }[]).map((row) => ({
    tag: row.tag,
    usageCount: row.usage_count,
  }));
}

/**
 * Whether the cold-start picker should be shown for the current user.
 * Fails closed (false) so a transient error never blocks the app on onboarding.
 */
export async function needsFeedInterestOnboarding(): Promise<boolean> {
  const { data, error } = await supabase.rpc("needs_feed_interest_onboarding");
  if (error) {
    if (__DEV__) {
      console.warn("[FeedInterests] onboarding check failed:", error.message);
    }
    return false;
  }
  return data === true;
}

/**
 * Seed the chosen interests (or none, to just dismiss). Marks the profile so
 * the picker won't reappear. Returns how many tags were seeded server-side.
 */
export async function seedFeedInterests(tags: string[]): Promise<number> {
  const payload = prepareInterestSeedPayload(tags);
  const { data, error } = await supabase.rpc("seed_feed_interests", {
    p_tags: payload,
  });
  if (error) {
    throw new Error(error.message);
  }
  const result = (data ?? {}) as { success?: boolean; seeded?: number };
  return typeof result.seeded === "number" ? result.seeded : 0;
}
