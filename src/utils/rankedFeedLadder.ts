/**
 * Pure ranked-feed fallback ladder (feed_plan.md gap #5 — test-coverage debt).
 *
 * The ordering "personalized (logged-in, retried) → explore → empty + error"
 * used to live inline in `src/services/rankedFeedService.ts`, which imports
 * Supabase and so could not run under `npx tsx`. This module holds the same
 * logic dependency-injected (the two feed fetchers and the source-stamp are
 * passed in), so it is unit-testable without touching the network. Keep it free
 * of React Native / Supabase imports.
 */

export type FeedSource = "personalized" | "explore" | "empty";

export type RankedFeedResult<T> = {
  posts: T[];
  source: FeedSource;
  lastError: string | null;
};

export const DEFAULT_MAX_RPC_ATTEMPTS = 2;
export const DEFAULT_RETRY_DELAY_MS = 450;
export const PERSONALIZED_FALLBACK_ERROR = "Personalized feed mislukt";
export const EXPLORE_FALLBACK_ERROR = "Explore feed mislukt";
export const EMPTY_FEED_MESSAGE =
  "Geen gerankte posts beschikbaar. Probeer later opnieuw.";

export type LadderConfig = {
  maxAttempts?: number;
  retryDelayMs?: number;
  /** Injectable so tests don't wait on real timers. */
  sleep?: (ms: number) => Promise<void>;
  emptyMessage?: string;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs a single feed fetcher with linear-backoff retries. Resolves with the
 * first successful batch (even if empty → no error), or an empty batch plus the
 * last error message after all attempts fail.
 */
export async function fetchWithRetries<T>(
  fetcher: () => Promise<T[]>,
  fallbackError: string,
  config?: LadderConfig
): Promise<{ posts: T[]; lastError: string | null }> {
  const maxAttempts = config?.maxAttempts ?? DEFAULT_MAX_RPC_ATTEMPTS;
  const retryDelayMs = config?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const sleep = config?.sleep ?? defaultSleep;

  let lastError: string | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await sleep(retryDelayMs * attempt);
    }
    try {
      const posts = await fetcher();
      return { posts, lastError: null };
    } catch (e) {
      lastError = e instanceof Error ? e.message : fallbackError;
    }
  }
  return { posts: [], lastError };
}

export type RankedFeedLadderParams<T> = {
  isLoggedIn: boolean;
  /** Personalized RPC (already bound to limit/exclude/options). */
  fetchPersonalized: () => Promise<T[]>;
  /** Explore RPC (already bound to limit/exclude). */
  fetchExplore: () => Promise<T[]>;
  /** Tags each post with the resolved source (identity is fine for tests). */
  stamp: (posts: T[], source: FeedSource) => T[];
  config?: LadderConfig;
};

/**
 * Resolves the Reels feed via RPC only — never Worker/chronological.
 * Order: personalized (logged-in) → explore → empty + error message.
 * A personalized error is carried forward so the caller can distinguish an
 * explore-served-but-personalized-failed batch from a clean explore result.
 */
export async function runRankedFeedLadder<T>(
  params: RankedFeedLadderParams<T>
): Promise<RankedFeedResult<T>> {
  const { isLoggedIn, fetchPersonalized, fetchExplore, stamp, config } = params;
  let lastError: string | null = null;

  if (isLoggedIn) {
    const personalized = await fetchWithRetries(
      fetchPersonalized,
      PERSONALIZED_FALLBACK_ERROR,
      config
    );
    if (personalized.posts.length > 0) {
      return {
        posts: stamp(personalized.posts, "personalized"),
        source: "personalized",
        lastError: null,
      };
    }
    lastError = personalized.lastError;
  }

  const explore = await fetchWithRetries(
    fetchExplore,
    EXPLORE_FALLBACK_ERROR,
    config
  );
  if (explore.posts.length > 0) {
    return {
      posts: stamp(explore.posts, "explore"),
      source: "explore",
      lastError,
    };
  }

  return {
    posts: [],
    source: "empty",
    lastError:
      explore.lastError ??
      lastError ??
      (config?.emptyMessage ?? EMPTY_FEED_MESSAGE),
  };
}
