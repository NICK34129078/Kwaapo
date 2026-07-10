import {
  createFeedTelemetryCounters,
  formatFeedTelemetry,
  recordFeedFetch,
  summarizeFeedTelemetry,
  type FeedFetchOutcome,
} from "./feedTelemetry";
import {
  flushFeedTelemetry,
  getFeedTelemetrySummary,
  reportFeedFetch,
  resetFeedTelemetry,
  setFeedTelemetrySink,
} from "../services/feedObservability";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function outcome(over: Partial<FeedFetchOutcome> = {}): FeedFetchOutcome {
  return {
    phase: "refresh",
    source: "personalized",
    postCount: 8,
    rawCount: 10,
    hadError: false,
    ...over,
  };
}

export function runFeedTelemetryTests(): void {
  // --- Pure aggregator ---------------------------------------------------
  const zero = createFeedTelemetryCounters();
  assert(zero.totalFetches === 0, "fresh counters start at zero");
  assert(
    zero.bySource.personalized === 0 &&
      zero.bySource.explore === 0 &&
      zero.bySource.empty === 0,
    "fresh source buckets are zero"
  );

  // recordFeedFetch is immutable — original untouched.
  const after = recordFeedFetch(zero, outcome());
  assert(zero.totalFetches === 0, "recordFeedFetch does not mutate input");
  assert(after.totalFetches === 1, "recordFeedFetch increments total");
  assert(after.bySource.personalized === 1, "personalized bucket incremented");
  assert(after.byPhase.refresh === 1, "refresh phase incremented");
  assert(after.emptyFetches === 0, "non-empty source does not count as empty");
  assert(after.errorFetches === 0, "no error recorded");

  // Fold a realistic mix.
  let c = createFeedTelemetryCounters();
  const mix: FeedFetchOutcome[] = [
    outcome({ source: "personalized" }),
    outcome({ source: "personalized" }),
    outcome({ source: "explore", hadError: true }), // personalized threw → explore
    outcome({ source: "empty", postCount: 0, rawCount: 0, hadError: true }),
    outcome({ phase: "loadMore", source: "explore" }),
  ];
  for (const o of mix) c = recordFeedFetch(c, o);

  assert(c.totalFetches === 5, "five fetches folded");
  assert(c.bySource.personalized === 2, "two personalized");
  assert(c.bySource.explore === 2, "two explore");
  assert(c.bySource.empty === 1, "one empty");
  assert(c.byPhase.refresh === 4 && c.byPhase.loadMore === 1, "phase split");
  assert(c.emptyFetches === 1, "one empty fetch");
  assert(c.errorFetches === 2, "two error fetches");

  const summary = summarizeFeedTelemetry(c);
  assert(summary.totalFetches === 5, "summary total");
  assert(
    Math.abs(summary.sourceDistribution.personalized - 0.4) < 1e-9,
    "personalized share 40%"
  );
  assert(Math.abs(summary.emptyRate - 0.2) < 1e-9, "empty rate 20%");
  assert(Math.abs(summary.errorRate - 0.4) < 1e-9, "error rate 40%");

  // Empty counters → no divide-by-zero.
  const emptySummary = summarizeFeedTelemetry(createFeedTelemetryCounters());
  assert(emptySummary.emptyRate === 0, "empty rate 0 when no fetches");
  assert(emptySummary.errorRate === 0, "error rate 0 when no fetches");

  assert(
    formatFeedTelemetry(summary).includes("error_rate=40%"),
    "format includes error rate"
  );

  // --- Service singleton (threshold flush + swappable sink) --------------
  const emitted: number[] = [];
  resetFeedTelemetry();
  setFeedTelemetrySink((s) => emitted.push(s.totalFetches));

  for (let i = 0; i < 9; i++) reportFeedFetch(outcome());
  assert(emitted.length === 0, "no flush before the 10-fetch threshold");

  reportFeedFetch(outcome()); // 10th → flush
  assert(emitted.length === 1, "flush fires on the 10th fetch");
  assert(emitted[0] === 10, "flushed summary counts all 10 fetches");

  reportFeedFetch(outcome({ source: "empty" }));
  assert(emitted.length === 1, "counter resets after flush; no premature emit");
  flushFeedTelemetry();
  assert(emitted.length === 2, "manual flush emits pending counters");
  assert(
    getFeedTelemetrySummary().bySource.empty === 1,
    "singleton retains cumulative empty count"
  );

  flushFeedTelemetry();
  assert(emitted.length === 2, "manual flush with nothing pending is a no-op");

  // Reset restores default sink so we don't leak the spy into other suites.
  resetFeedTelemetry();
  setFeedTelemetrySink(null);
  assert(
    getFeedTelemetrySummary().totalFetches === 0,
    "reset clears cumulative counters"
  );
}

if (require.main === module) {
  runFeedTelemetryTests();
  console.log("feedTelemetry tests passed");
}
