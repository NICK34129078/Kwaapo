import { REELS_WINDOW } from "./feedRollingWindow";

/** Max duplicate-only or empty rounds per loadMore call before declaring end-of-feed. */
export const LOAD_MORE_MAX_STALE_ROUNDS = 5;

export type LoadMoreBatchDecision = {
  /** Stop fetching more pages after this batch. */
  stopHasMore: boolean;
  /** Register batch IDs as seen and issue another request in the same loadMore call. */
  retryWithExpandedExclude: boolean;
};

/**
 * Decides how to handle a load-more batch when nothing new can be appended.
 * Retries before declaring end-of-feed — short or duplicate batches do not imply exhaustion.
 */
export function resolveLoadMoreBatchDecision(
  batchLength: number,
  appendLength: number,
  staleRounds: number,
  loadBatch: number = REELS_WINDOW.LOAD_BATCH,
  maxStaleRounds: number = LOAD_MORE_MAX_STALE_ROUNDS
): LoadMoreBatchDecision {
  if (appendLength > 0) {
    return { stopHasMore: false, retryWithExpandedExclude: false };
  }

  if (staleRounds + 1 < maxStaleRounds) {
    return { stopHasMore: false, retryWithExpandedExclude: true };
  }

  // Retries exhausted — ranked pool likely depleted (empty, short, or all duplicates).
  void batchLength;
  void loadBatch;
  return { stopHasMore: true, retryWithExpandedExclude: false };
}
