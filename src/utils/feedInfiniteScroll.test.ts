import {
  countItemsAhead,
  shouldPrefetchMoreFeed,
} from "./feedInfiniteScroll";
import { REELS_WINDOW } from "./feedRollingWindow";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

export function runFeedInfiniteScrollTests(): void {
  assert(countItemsAhead(0, 10) === 9, "ahead from first item");
  assert(countItemsAhead(9, 10) === 0, "ahead at last item");
  assert(countItemsAhead(-1, 10) === 0, "invalid index");

  const trigger = REELS_WINDOW.LOAD_MORE_TRIGGER_AHEAD;
  const base = {
    activeIndex: 5,
    totalLength: 20,
    isLoadingMore: false,
    hasMore: true,
    isFocused: true,
  };

  assert(
    shouldPrefetchMoreFeed({ ...base, activeIndex: 20 - trigger - 1 }),
    "fires when ahead equals trigger"
  );
  assert(
    !shouldPrefetchMoreFeed({ ...base, activeIndex: 20 - trigger - 2 }),
    "skips when buffer is healthy"
  );
  assert(
    !shouldPrefetchMoreFeed({ ...base, isLoadingMore: true }),
    "skips while loading"
  );
  assert(
    !shouldPrefetchMoreFeed({ ...base, hasMore: false }),
    "skips when exhausted"
  );
}

if (require.main === module) {
  runFeedInfiniteScrollTests();
  console.log("feedInfiniteScroll.test.ts: ok");
}
