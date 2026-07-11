export const REELS_WINDOW = {
  /** Trim target once the in-memory window grows past MAX. */
  TARGET: 15,
  /** Max posts held in memory before head-trim (ready buffer + scroll history). */
  MAX: 28,
  BUFFER_ABOVE: 3,
  /** RPC page size for initial load and load-more. */
  LOAD_BATCH: 20,
  SEEN_MAX: 450,
  RECORDED_VIEW_MAX: 500,
  /** Min items ahead of active reel before fetching the next page. */
  LOAD_MORE_TRIGGER_AHEAD: 10,
  /** Desired ready buffer depth ahead of the active reel. */
  TARGET_READY_AHEAD: 15,
} as const;

export function trimReelsFeedWindow<T extends { id: string }>(
  posts: readonly T[],
  activePostId: string | null
): { trimmed: T[]; removedIds: string[] } {
  const { MAX, BUFFER_ABOVE, TARGET } = REELS_WINDOW;

  if (posts.length <= MAX) {
    return { trimmed: [...posts], removedIds: [] };
  }

  const activeIndex =
    activePostId != null ? posts.findIndex((p) => p.id === activePostId) : -1;

  if (activeIndex < 0) {
    const trimCount = Math.max(0, posts.length - TARGET);
    if (trimCount <= 0) {
      return { trimmed: [...posts], removedIds: [] };
    }
    return {
      trimmed: posts.slice(trimCount),
      removedIds: posts.slice(0, trimCount).map((p) => p.id),
    };
  }

  const bufferTrim = Math.max(0, activeIndex - BUFFER_ABOVE);
  const sizeTrim = Math.max(0, posts.length - MAX);
  let trimCount = Math.max(bufferTrim, sizeTrim);

  if (posts.length - trimCount > TARGET) {
    const towardTarget = posts.length - TARGET;
    trimCount = Math.max(trimCount, towardTarget);
  }

  trimCount = Math.min(trimCount, Math.max(0, activeIndex));
  trimCount = Math.max(0, Math.min(trimCount, posts.length - 1));

  if (trimCount <= 0) {
    return { trimmed: [...posts], removedIds: [] };
  }

  return {
    trimmed: posts.slice(trimCount),
    removedIds: posts.slice(0, trimCount).map((p) => p.id),
  };
}

export function filterUnseenPosts<T extends { id: string }>(
  posts: readonly T[],
  seen: { has(id: string): boolean }
): T[] {
  return posts.filter((p) => !seen.has(p.id));
}
