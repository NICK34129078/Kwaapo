/**
 * Pure feed-observability aggregator (feed_plan.md gap #4).
 *
 * Feed health was only visible through `__DEV__` `console.log` calls, so nothing
 * was measurable in production. This module keeps a small set of dependency-free,
 * unit-testable counters describing every ranked-feed fetch:
 *   - source distribution  (personalized vs explore vs empty)
 *   - empty-feed rate       (fetches the RPC ladder resolved to `empty`)
 *   - RPC error rate        (fetches where the personalized/explore RPC threw)
 *
 * It is intentionally side-effect free: the singleton in
 * `src/services/feedObservability.ts` owns the running counters and emits them.
 * Keep this file free of React Native / Supabase imports so it can run under
 * `npx tsx` like the other feed test helpers.
 */

/** Mirrors `FeedSource` in `src/services/rankedFeedService.ts` (kept dependency-free here). */
export type FeedTelemetrySource = "personalized" | "explore" | "empty";

/** Which context the fetch happened in — initial/refresh load vs infinite-scroll append. */
export type FeedFetchPhase = "refresh" | "loadMore";

export type FeedFetchOutcome = {
  phase: FeedFetchPhase;
  /** Resolved source from the RPC fallback ladder. */
  source: FeedTelemetrySource;
  /** Posts handed to the UI after mute filtering. */
  postCount: number;
  /** Posts returned by the server before mute filtering (drives pagination). */
  rawCount: number;
  /** The personalized/explore RPC(s) surfaced an error (even if a fallback recovered). */
  hadError: boolean;
};

export type FeedTelemetryCounters = {
  totalFetches: number;
  bySource: Record<FeedTelemetrySource, number>;
  byPhase: Record<FeedFetchPhase, number>;
  /** Fetches whose resolved source was `empty` (user/pagination saw no posts). */
  emptyFetches: number;
  /** Fetches where at least one RPC threw. */
  errorFetches: number;
};

export type FeedTelemetrySummary = {
  totalFetches: number;
  bySource: Record<FeedTelemetrySource, number>;
  byPhase: Record<FeedFetchPhase, number>;
  /** Fraction (0..1) of fetches per source. */
  sourceDistribution: Record<FeedTelemetrySource, number>;
  /** Fraction (0..1) of fetches that resolved to an empty feed. */
  emptyRate: number;
  /** Fraction (0..1) of fetches that hit an RPC error. */
  errorRate: number;
};

export function createFeedTelemetryCounters(): FeedTelemetryCounters {
  return {
    totalFetches: 0,
    bySource: { personalized: 0, explore: 0, empty: 0 },
    byPhase: { refresh: 0, loadMore: 0 },
    emptyFetches: 0,
    errorFetches: 0,
  };
}

/**
 * Folds one fetch outcome into the counters. Returns a new object (immutable)
 * so callers can swap the reference atomically and tests can assert on deltas.
 */
export function recordFeedFetch(
  counters: FeedTelemetryCounters,
  outcome: FeedFetchOutcome
): FeedTelemetryCounters {
  const next: FeedTelemetryCounters = {
    totalFetches: counters.totalFetches + 1,
    bySource: { ...counters.bySource },
    byPhase: { ...counters.byPhase },
    emptyFetches: counters.emptyFetches,
    errorFetches: counters.errorFetches,
  };

  next.bySource[outcome.source] += 1;
  next.byPhase[outcome.phase] += 1;
  if (outcome.source === "empty") {
    next.emptyFetches += 1;
  }
  if (outcome.hadError) {
    next.errorFetches += 1;
  }
  return next;
}

function rate(part: number, total: number): number {
  return total > 0 ? part / total : 0;
}

export function summarizeFeedTelemetry(
  counters: FeedTelemetryCounters
): FeedTelemetrySummary {
  const { totalFetches, bySource, byPhase, emptyFetches, errorFetches } =
    counters;
  return {
    totalFetches,
    bySource: { ...bySource },
    byPhase: { ...byPhase },
    sourceDistribution: {
      personalized: rate(bySource.personalized, totalFetches),
      explore: rate(bySource.explore, totalFetches),
      empty: rate(bySource.empty, totalFetches),
    },
    emptyRate: rate(emptyFetches, totalFetches),
    errorRate: rate(errorFetches, totalFetches),
  };
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** Compact single-line summary for a log sink. */
export function formatFeedTelemetry(summary: FeedTelemetrySummary): string {
  const { totalFetches, bySource, emptyRate, errorRate } = summary;
  return (
    `[FeedTelemetry] n=${totalFetches} ` +
    `personalized=${bySource.personalized} ` +
    `explore=${bySource.explore} ` +
    `empty=${bySource.empty} ` +
    `empty_rate=${pct(emptyRate)} ` +
    `error_rate=${pct(errorRate)}`
  );
}
