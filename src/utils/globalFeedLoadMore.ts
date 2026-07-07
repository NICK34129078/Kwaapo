import { REELS_WINDOW } from "./feedRollingWindow";

export const LOAD_MORE_MAX_STALE_ROUNDS = 3;

export type LoadMoreBatchDecision = {
  /** Stop fetching more pages after this batch. */
  stopHasMore: boolean;
  /** Register batch IDs as seen and issue another request in the same loadMore call. */
  retryWithExpandedExclude: boolean;
};

/**
 * Decides how to handle a load-more batch when nothing new can be appended.
 * Prevents infinite load-more loops when the RPC returns already-seen IDs.
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

  if (batchLength === 0) {
    return { stopHasMore: true, retryWithExpandedExclude: false };
  }

  if (batchLength < loadBatch) {
    return { stopHasMore: true, retryWithExpandedExclude: false };
  }

  if (staleRounds + 1 < maxStaleRounds) {
    return { stopHasMore: false, retryWithExpandedExclude: true };
  }

  return { stopHasMore: true, retryWithExpandedExclude: false };
}
