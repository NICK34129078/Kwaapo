import { fetchExploreFeed } from "./exploreFeedService";
import { fetchPersonalizedFeed } from "./personalizedFeedService";
import type { UserVideoPost } from "../types/userVideoPost";
import {
  runRankedFeedLadder,
  type FeedSource,
} from "../utils/rankedFeedLadder";

export type { FeedSource };

export type RankedFeedFetchResult = {
  posts: UserVideoPost[];
  source: FeedSource;
  lastError: string | null;
};

export type RankedFeedFetchOptions = {
  isLoggedIn?: boolean;
  /** When true, personalized RPC may return posts viewed in the last 7 days (refresh). */
  allowRecentlyViewed?: boolean;
};

function stampFeedSource(
  posts: UserVideoPost[],
  source: FeedSource
): UserVideoPost[] {
  return posts.map((post) => ({
    ...post,
    feedSource: source,
    rankingBreakdown: {
      ...(post.rankingBreakdown ?? {}),
      feed_source: source,
    },
  }));
}

/**
 * Haalt Reels-feed op via Supabase RPC alleen — nooit Worker/chronologisch.
 * Volgorde: personalized (ingelogd) → explore → leeg + foutmelding.
 * De ladder-logica (retries + fallback) leeft in `utils/rankedFeedLadder` zodat
 * ze los van Supabase getest kan worden.
 */
export async function fetchRankedFeedViaRpc(
  limit: number,
  exclude: string[],
  options?: RankedFeedFetchOptions
): Promise<RankedFeedFetchResult> {
  const isLoggedIn = options?.isLoggedIn === true;
  const personalizedOptions =
    options?.allowRecentlyViewed === true
      ? { allowRecentlyViewed: true as const }
      : undefined;

  return runRankedFeedLadder<UserVideoPost>({
    isLoggedIn,
    fetchPersonalized: () =>
      fetchPersonalizedFeed(limit, exclude, personalizedOptions),
    fetchExplore: () => fetchExploreFeed(limit, exclude),
    stamp: stampFeedSource,
  });
}
