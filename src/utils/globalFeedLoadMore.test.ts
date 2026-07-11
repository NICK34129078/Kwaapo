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
  const fresh = resolveLoadMoreBatchDecision(20, 5, 0);
  assert(!fresh.stopHasMore && !fresh.retryWithExpandedExclude, "append ok");

  const emptyRetry = resolveLoadMoreBatchDecision(0, 0, 0, 20, LOAD_MORE_MAX_STALE_ROUNDS);
  assert(!emptyRetry.stopHasMore && emptyRetry.retryWithExpandedExclude, "empty batch retries");

  const shortRetry = resolveLoadMoreBatchDecision(8, 0, 0, 20, LOAD_MORE_MAX_STALE_ROUNDS);
  assert(!shortRetry.stopHasMore && shortRetry.retryWithExpandedExclude, "short batch retries");

  const staleRetry = resolveLoadMoreBatchDecision(20, 0, 0, 20, LOAD_MORE_MAX_STALE_ROUNDS);
  assert(!staleRetry.stopHasMore && staleRetry.retryWithExpandedExclude, "stale full batch retries");

  const staleGiveUp = resolveLoadMoreBatchDecision(
    20,
    0,
    LOAD_MORE_MAX_STALE_ROUNDS - 1,
    20,
    LOAD_MORE_MAX_STALE_ROUNDS
  );
  assert(staleGiveUp.stopHasMore && !staleGiveUp.retryWithExpandedExclude, "stale retries exhausted");

  const emptyGiveUp = resolveLoadMoreBatchDecision(
    0,
    0,
    LOAD_MORE_MAX_STALE_ROUNDS - 1,
    20,
    LOAD_MORE_MAX_STALE_ROUNDS
  );
  assert(emptyGiveUp.stopHasMore && !emptyGiveUp.retryWithExpandedExclude, "empty retries exhausted");
}

if (require.main === module) {
  runGlobalFeedLoadMoreTests();
  console.log("globalFeedLoadMore.test.ts: ok");
}
