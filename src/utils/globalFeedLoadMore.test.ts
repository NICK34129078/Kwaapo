import {
  LOAD_MORE_MAX_STALE_ROUNDS,
  resolveLoadMoreBatchDecision,
} from "./globalFeedLoadMore";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

export function runGlobalFeedLoadMoreTests(): void {
  const fresh = resolveLoadMoreBatchDecision(5, 2, 0);
  assert(!fresh.stopHasMore && !fresh.retryWithExpandedExclude, "append ok");

  const empty = resolveLoadMoreBatchDecision(0, 0, 0);
  assert(empty.stopHasMore && !empty.retryWithExpandedExclude, "empty batch stops");

  const short = resolveLoadMoreBatchDecision(2, 0, 0, 5);
  assert(short.stopHasMore && !short.retryWithExpandedExclude, "short batch stops");

  const staleRetry = resolveLoadMoreBatchDecision(5, 0, 0, 5, LOAD_MORE_MAX_STALE_ROUNDS);
  assert(!staleRetry.stopHasMore && staleRetry.retryWithExpandedExclude, "stale full batch retries");

  const staleGiveUp = resolveLoadMoreBatchDecision(
    5,
    0,
    LOAD_MORE_MAX_STALE_ROUNDS - 1,
    5,
    LOAD_MORE_MAX_STALE_ROUNDS
  );
  assert(staleGiveUp.stopHasMore && !staleGiveUp.retryWithExpandedExclude, "stale retries exhausted");
}

if (require.main === module) {
  runGlobalFeedLoadMoreTests();
  console.log("globalFeedLoadMore.test.ts: ok");
}
