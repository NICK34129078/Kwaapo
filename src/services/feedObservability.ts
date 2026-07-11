/**
 * Feed observability singleton (feed_plan.md gap #4).
 *
 * Owns the running feed-telemetry counters and emits a compact production
 * summary (source distribution, empty-feed rate, RPC error rate). Unlike the
 * old `__DEV__`-only `console.log` signals this emits in every build, but stays
 * cheap: it aggregates in memory and only flushes on a fetch-count threshold or
 * a time interval — never per fetch.
 *
 * The emit sink is swappable via `setFeedTelemetrySink` so a real analytics
 * backend (or a test spy) can replace the default `console.log`. All counting
 * logic lives in the pure, unit-tested `../utils/feedTelemetry`.
 */
import {
  createFeedTelemetryCounters,
  formatFeedTelemetry,
  recordFeedFetch,
  summarizeFeedTelemetry,
  type FeedFetchOutcome,
  type FeedTelemetryCounters,
  type FeedTelemetrySummary,
} from "../utils/feedTelemetry";

export type FeedTelemetrySink = (summary: FeedTelemetrySummary) => void;

/** Emit after this many fetches since the last flush. */
const FLUSH_EVERY_N_FETCHES = 10;
/** …or once this much time has elapsed since the last flush (whichever first). */
const FLUSH_INTERVAL_MS = 60_000;

const defaultSink: FeedTelemetrySink = (summary) => {
  // Intentionally not gated behind __DEV__: this is the production counter.
  console.log(formatFeedTelemetry(summary));
};

let counters: FeedTelemetryCounters = createFeedTelemetryCounters();
let sink: FeedTelemetrySink = defaultSink;
let fetchesSinceFlush = 0;
let lastFlushAt = Date.now();

function now(): number {
  return Date.now();
}

function flush(): void {
  if (fetchesSinceFlush === 0) {
    return;
  }
  fetchesSinceFlush = 0;
  lastFlushAt = now();
  try {
    sink(summarizeFeedTelemetry(counters));
  } catch {
    // Observability must never break the feed.
  }
}

/** Record one ranked-feed fetch outcome; flushes on threshold/interval. */
export function reportFeedFetch(outcome: FeedFetchOutcome): void {
  counters = recordFeedFetch(counters, outcome);
  fetchesSinceFlush += 1;
  if (
    fetchesSinceFlush >= FLUSH_EVERY_N_FETCHES ||
    now() - lastFlushAt >= FLUSH_INTERVAL_MS
  ) {
    flush();
  }
}

/** Force an immediate emit (e.g. app backgrounding). No-op if nothing pending. */
export function flushFeedTelemetry(): void {
  flush();
}

/** Current aggregated summary — handy for debug panels. */
export function getFeedTelemetrySummary(): FeedTelemetrySummary {
  return summarizeFeedTelemetry(counters);
}

/** Swap the emit sink (analytics backend or test spy). */
export function setFeedTelemetrySink(next: FeedTelemetrySink | null): void {
  sink = next ?? defaultSink;
}

/** Reset counters + flush bookkeeping. Test-only. */
export function resetFeedTelemetry(): void {
  counters = createFeedTelemetryCounters();
  fetchesSinceFlush = 0;
  lastFlushAt = now();
}
