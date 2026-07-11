import {
  EMPTY_FEED_MESSAGE,
  EXPLORE_FALLBACK_ERROR,
  PERSONALIZED_FALLBACK_ERROR,
  fetchWithRetries,
  runRankedFeedLadder,
  type FeedSource,
} from "./rankedFeedLadder";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

type Post = { id: string; source?: FeedSource };

const noSleep = { sleep: async () => {} };

/** Identity stamp that records the resolved source on each post. */
function stamp(posts: Post[], source: FeedSource): Post[] {
  return posts.map((p) => ({ ...p, source }));
}

function ok(...ids: string[]): () => Promise<Post[]> {
  return async () => ids.map((id) => ({ id }));
}

function fail(message: string): () => Promise<Post[]> {
  return async () => {
    throw new Error(message);
  };
}

/** Fetcher that fails `failCount` times then succeeds; records attempt count. */
function flaky(failCount: number, ...ids: string[]) {
  const state = { attempts: 0 };
  const fn = async (): Promise<Post[]> => {
    state.attempts += 1;
    if (state.attempts <= failCount) {
      throw new Error("transient");
    }
    return ids.map((id) => ({ id }));
  };
  return { fn, state };
}

async function runFetchWithRetriesTests(): Promise<void> {
  // Succeeds first try → one attempt, no error.
  const first = await fetchWithRetries(ok("a"), "fallback", noSleep);
  assert(first.posts.length === 1 && first.lastError === null, "success first try");

  // Fails once, succeeds on retry (maxAttempts default 2).
  const recover = flaky(1, "a", "b");
  const recovered = await fetchWithRetries(recover.fn, "fallback", noSleep);
  assert(recover.state.attempts === 2, "retries once");
  assert(
    recovered.posts.length === 2 && recovered.lastError === null,
    "recovers on second attempt"
  );

  // Always fails → empty + last error message.
  const dead = await fetchWithRetries(fail("boom"), "fallback", noSleep);
  assert(
    dead.posts.length === 0 && dead.lastError === "boom",
    "exhausts retries and surfaces error"
  );

  // Non-Error throw → fallback message.
  const weird = await fetchWithRetries(
    async () => {
      throw "nope";
    },
    "fallback",
    noSleep
  );
  assert(weird.lastError === "fallback", "non-Error throw uses fallback message");

  // maxAttempts honored.
  const counter = flaky(99, "x");
  await fetchWithRetries(counter.fn, "fallback", { ...noSleep, maxAttempts: 3 });
  assert(counter.state.attempts === 3, "maxAttempts respected");
}

async function runLadderTests(): Promise<void> {
  // Logged-in + personalized has posts → personalized wins, explore untouched.
  let exploreCalled = false;
  const p1 = await runRankedFeedLadder<Post>({
    isLoggedIn: true,
    fetchPersonalized: ok("a", "b"),
    fetchExplore: async () => {
      exploreCalled = true;
      return [];
    },
    stamp,
    config: noSleep,
  });
  assert(p1.source === "personalized", "personalized source");
  assert(p1.posts.every((p) => p.source === "personalized"), "posts stamped");
  assert(p1.lastError === null, "no error on personalized success");
  assert(!exploreCalled, "explore not called when personalized succeeds");

  // Logged-in but personalized empty → falls to explore (no error carried since empty ≠ throw).
  const p2 = await runRankedFeedLadder<Post>({
    isLoggedIn: true,
    fetchPersonalized: ok(), // empty, no throw
    fetchExplore: ok("c"),
    stamp,
    config: noSleep,
  });
  assert(p2.source === "explore", "empty personalized falls to explore");
  assert(p2.lastError === null, "empty (non-throwing) personalized carries no error");

  // Personalized throws → explore serves, but personalized error is carried.
  const p3 = await runRankedFeedLadder<Post>({
    isLoggedIn: true,
    fetchPersonalized: fail("pgrst202"),
    fetchExplore: ok("d"),
    stamp,
    config: noSleep,
  });
  assert(p3.source === "explore", "personalized error still served by explore");
  assert(
    p3.lastError === "pgrst202",
    "personalized error carried forward on explore success"
  );

  // Guest skips personalized entirely.
  let personalizedCalled = false;
  const guest = await runRankedFeedLadder<Post>({
    isLoggedIn: false,
    fetchPersonalized: async () => {
      personalizedCalled = true;
      return [{ id: "should-not-run" }];
    },
    fetchExplore: ok("e"),
    stamp,
    config: noSleep,
  });
  assert(!personalizedCalled, "guest never calls personalized");
  assert(guest.source === "explore", "guest served by explore");

  // Both empty (no throws) → empty source with default message.
  const emptyBoth = await runRankedFeedLadder<Post>({
    isLoggedIn: true,
    fetchPersonalized: ok(),
    fetchExplore: ok(),
    stamp,
    config: noSleep,
  });
  assert(emptyBoth.source === "empty", "empty source when nothing returns");
  assert(
    emptyBoth.lastError === EMPTY_FEED_MESSAGE,
    "empty default message when no error"
  );

  // Both throw → empty source, explore error preferred.
  const bothFail = await runRankedFeedLadder<Post>({
    isLoggedIn: true,
    fetchPersonalized: fail("p-err"),
    fetchExplore: fail("e-err"),
    stamp,
    config: noSleep,
  });
  assert(bothFail.source === "empty", "empty when both fail");
  assert(bothFail.lastError === "e-err", "explore error preferred on total failure");

  // Personalized throws, explore empty (no throw) → empty, personalized error carried.
  const pThrowExpEmpty = await runRankedFeedLadder<Post>({
    isLoggedIn: true,
    fetchPersonalized: fail("only-error"),
    fetchExplore: ok(),
    stamp,
    config: noSleep,
  });
  assert(
    pThrowExpEmpty.source === "empty" &&
      pThrowExpEmpty.lastError === "only-error",
    "personalized error surfaces when explore is empty without error"
  );
}

export async function runRankedFeedLadderTests(): Promise<void> {
  await runFetchWithRetriesTests();
  await runLadderTests();
  // Reference exported constants so drift is caught by TS.
  assert(
    typeof PERSONALIZED_FALLBACK_ERROR === "string" &&
      typeof EXPLORE_FALLBACK_ERROR === "string",
    "fallback messages exported"
  );
}

if (require.main === module) {
  runRankedFeedLadderTests().then(() => {
    console.log("rankedFeedLadder tests passed");
  });
}
