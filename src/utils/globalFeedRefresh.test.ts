import {
  FEED_ERROR_KEYS,
  isStaleFeedGeneration,
  resolveRefreshEmptyOutcome,
  resolveRefreshErrorOutcome,
  shouldSkipRefresh,
} from "./globalFeedRefresh";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

export function runGlobalFeedRefreshTests(): void {
  // --- Generation guard --------------------------------------------------
  assert(!isStaleFeedGeneration(3, 3), "same generation is fresh");
  assert(isStaleFeedGeneration(2, 3), "older generation is stale");
  assert(isStaleFeedGeneration(0, 1), "user-switch bump invalidates in-flight");

  // --- shouldSkipRefresh ---------------------------------------------------
  assert(
    shouldSkipRefresh({ force: false, hasLoadedOnce: true, currentPostCount: 5 }),
    "skip when already loaded with posts"
  );
  assert(
    !shouldSkipRefresh({ force: true, hasLoadedOnce: true, currentPostCount: 5 }),
    "force always refetches"
  );
  assert(
    !shouldSkipRefresh({ force: false, hasLoadedOnce: false, currentPostCount: 0 }),
    "first load never skipped"
  );
  assert(
    !shouldSkipRefresh({ force: false, hasLoadedOnce: true, currentPostCount: 0 }),
    "loaded-once but empty screen still refetches"
  );

  // --- resolveRefreshEmptyOutcome ------------------------------------------
  const keep = resolveRefreshEmptyOutcome({
    hadPostsBefore: true,
    rawCount: 0,
    batchTarget: 15,
  });
  assert(keep.keepExistingPosts, "empty refresh with posts on screen keeps them");
  assert(keep.setHasMore === null, "hasMore untouched when keeping posts");
  assert(
    keep.errorKey === FEED_ERROR_KEYS.noRankedPosts,
    "empty refresh sets noRankedPosts"
  );

  const clearFull = resolveRefreshEmptyOutcome({
    hadPostsBefore: false,
    rawCount: 15,
    batchTarget: 15,
  });
  assert(!clearFull.keepExistingPosts, "first empty refresh clears feed");
  assert(clearFull.setHasMore === true, "full raw batch implies hasMore");

  const clearShort = resolveRefreshEmptyOutcome({
    hadPostsBefore: false,
    rawCount: 3,
    batchTarget: 15,
  });
  assert(clearShort.setHasMore === false, "short raw batch stops pagination");

  // --- resolveRefreshErrorOutcome ------------------------------------------
  const errKeep = resolveRefreshErrorOutcome(true);
  assert(!errKeep.clearPosts, "error during refresh keeps existing posts");
  assert(
    errKeep.errorKey === FEED_ERROR_KEYS.feedLoadFailed,
    "refresh error key"
  );

  const errClear = resolveRefreshErrorOutcome(false);
  assert(errClear.clearPosts, "error on first load clears feed");
}

if (require.main === module) {
  runGlobalFeedRefreshTests();
  console.log("globalFeedRefresh tests passed");
}
