/**
 * Pure decision helpers for GlobalFeedContext refresh + generation guard
 * (feed_plan.md gap #5 — test-coverage debt).
 *
 * These encode the branching that used to be inline in
 * `src/context/GlobalFeedContext.tsx` (which can't run under `npx tsx` because
 * it pulls in React Native). Extracting them keeps the context a thin wiring
 * layer and makes the refresh/empty/error branches and the async stale-guard
 * unit-testable. No side effects here — the context still owns setState.
 */

export const FEED_ERROR_KEYS = {
  noRankedPosts: "feed.noRankedPosts",
  feedLoadFailed: "feed.feedLoadFailed",
  loadMoreFailed: "feed.loadMoreFailed",
} as const;

/**
 * A `feedGenerationRef` snapshot is stale once a newer refresh/user-switch has
 * bumped the counter. Every async setState in the feed must bail when stale.
 */
export function isStaleFeedGeneration(
  captured: number,
  current: number
): boolean {
  return captured !== current;
}

/**
 * A cached refresh is skipped unless forced: already loaded once and posts are
 * on screen. `force` (pull-to-refresh / Home tap) always refetches.
 */
export function shouldSkipRefresh(params: {
  force: boolean;
  hasLoadedOnce: boolean;
  currentPostCount: number;
}): boolean {
  return (
    !params.force && params.hasLoadedOnce && params.currentPostCount > 0
  );
}

export type RefreshEmptyOutcome = {
  /** Keep existing posts (a refresh that came back empty shouldn't blank the screen). */
  keepExistingPosts: boolean;
  /** New `hasMore` value, or `null` to leave pagination state untouched. */
  setHasMore: boolean | null;
  errorKey: string;
};

/**
 * What to do when a refresh resolves to zero renderable posts. If the user
 * already had posts, keep them (transient blip); otherwise clear and set
 * `hasMore` from the raw server count so pagination can still recover.
 */
export function resolveRefreshEmptyOutcome(params: {
  hadPostsBefore: boolean;
  rawCount: number;
  batchTarget: number;
}): RefreshEmptyOutcome {
  if (params.hadPostsBefore) {
    return {
      keepExistingPosts: true,
      setHasMore: null,
      errorKey: FEED_ERROR_KEYS.noRankedPosts,
    };
  }
  return {
    keepExistingPosts: false,
    setHasMore: params.rawCount >= params.batchTarget,
    errorKey: FEED_ERROR_KEYS.noRankedPosts,
  };
}

export type RefreshErrorOutcome = {
  errorKey: string;
  /** Only wipe the feed when the refresh had nothing to preserve. */
  clearPosts: boolean;
};

/** What to do when a refresh throws. */
export function resolveRefreshErrorOutcome(
  hadPostsBefore: boolean
): RefreshErrorOutcome {
  return {
    errorKey: FEED_ERROR_KEYS.feedLoadFailed,
    clearPosts: !hadPostsBefore,
  };
}
