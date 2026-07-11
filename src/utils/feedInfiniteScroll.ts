import { REELS_WINDOW } from "./feedRollingWindow";

/** Items still scrollable below the active reel (exclusive of active). */
export function countItemsAhead(activeIndex: number, totalLength: number): number {
  if (activeIndex < 0 || totalLength <= 0) {
    return 0;
  }
  return Math.max(0, totalLength - 1 - activeIndex);
}

export type PrefetchMoreFeedInput = {
  activeIndex: number;
  totalLength: number;
  isLoadingMore: boolean;
  hasMore: boolean;
  isFocused?: boolean;
  triggerAhead?: number;
};

/**
 * Proactive load-more gate: fetch when the ready buffer drops below the trigger threshold.
 * Used by ReelsScreen (active-index effect + onEndReached backup).
 */
export function shouldPrefetchMoreFeed(input: PrefetchMoreFeedInput): boolean {
  const {
    activeIndex,
    totalLength,
    isLoadingMore,
    hasMore,
    isFocused = true,
    triggerAhead = REELS_WINDOW.LOAD_MORE_TRIGGER_AHEAD,
  } = input;

  if (!isFocused || !hasMore || isLoadingMore || totalLength === 0 || activeIndex < 0) {
    return false;
  }

  const ahead = countItemsAhead(activeIndex, totalLength);
  return ahead <= triggerAhead;
}
