import { fetchExploreFeed } from "./exploreFeedService";
import { fetchPersonalizedFeed } from "./personalizedFeedService";
import type { UserVideoPost } from "../types/userVideoPost";

export type FeedSource = "personalized" | "explore" | "empty";

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

const MAX_RPC_ATTEMPTS = 3;
const RETRY_DELAY_MS = 450;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

async function fetchPersonalizedWithRetries(
  limit: number,
  exclude: string[],
  options?: { allowRecentlyViewed?: boolean }
): Promise<{ posts: UserVideoPost[]; lastError: string | null }> {
  let lastError: string | null = null;
  for (let attempt = 0; attempt < MAX_RPC_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAY_MS * attempt);
    }
    try {
      const posts = await fetchPersonalizedFeed(limit, exclude, options);
      return { posts, lastError: null };
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Personalized feed mislukt";
    }
  }
  return { posts: [], lastError };
}

async function fetchExploreWithRetries(
  limit: number,
  exclude: string[]
): Promise<{ posts: UserVideoPost[]; lastError: string | null }> {
  let lastError: string | null = null;
  for (let attempt = 0; attempt < MAX_RPC_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAY_MS * attempt);
    }
    try {
      const posts = await fetchExploreFeed(limit, exclude);
      return { posts, lastError: null };
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Explore feed mislukt";
    }
  }
  return { posts: [], lastError };
}

/**
 * Haalt Reels-feed op via Supabase RPC alleen — nooit Worker/chronologisch.
 * Volgorde: personalized (ingelogd) → explore → leeg + foutmelding.
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
  let lastError: string | null = null;

  if (isLoggedIn) {
    const personalized = await fetchPersonalizedWithRetries(
      limit,
      exclude,
      personalizedOptions
    );
    if (personalized.posts.length > 0) {
      return {
        posts: stampFeedSource(personalized.posts, "personalized"),
        source: "personalized",
        lastError: null,
      };
    }
    lastError = personalized.lastError;
  }

  const explore = await fetchExploreWithRetries(limit, exclude);
  if (explore.posts.length > 0) {
    return {
      posts: stampFeedSource(explore.posts, "explore"),
      source: "explore",
      lastError: lastError,
    };
  }

  return {
    posts: [],
    source: "empty",
    lastError:
      explore.lastError ??
      lastError ??
      "Geen gerankte posts beschikbaar. Probeer later opnieuw.",
  };
}
