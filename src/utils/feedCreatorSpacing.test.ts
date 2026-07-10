import {
  MAX_CONSECUTIVE_SAME_CREATOR,
  respaceFeedByCreator,
  trailingCreatorIds,
} from "./feedCreatorSpacing";

type P = { id: string; ownerProfileId?: string | null };

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function post(id: string, creator?: string | null): P {
  return { id, ownerProfileId: creator };
}

function maxRun(posts: P[]): number {
  let best = 0;
  let cur = 0;
  let prev: string | null = null;
  for (const p of posts) {
    const c = p.ownerProfileId ?? null;
    if (c !== null && c === prev) {
      cur += 1;
    } else {
      cur = c === null ? 0 : 1;
    }
    prev = c;
    if (cur > best) best = cur;
  }
  return best;
}

function ids(posts: P[]): string {
  return posts.map((p) => p.id).join(",");
}

export function runFeedCreatorSpacingTests(): void {
  // No-op cases.
  assert(respaceFeedByCreator([]).length === 0, "empty stays empty");
  assert(
    ids(respaceFeedByCreator([post("1", "a")])) === "1",
    "single post unchanged"
  );

  // Already within cap → identical order (stable, no gratuitous moves).
  const ok = [post("1", "a"), post("2", "a"), post("3", "b"), post("4", "a")];
  assert(
    ids(respaceFeedByCreator(ok)) === "1,2,3,4",
    "within-cap feed must be untouched"
  );

  // Over-long run gets broken with minimal displacement.
  const cluster = [
    post("1", "a"),
    post("2", "a"),
    post("3", "a"),
    post("4", "b"),
  ];
  const spaced = respaceFeedByCreator(cluster, { maxConsecutive: 2 });
  assert(maxRun(spaced) <= 2, "no more than 2 consecutive from same creator");
  assert(
    ids(spaced) === "1,2,4,3",
    "b should be pulled forward by exactly one slot"
  );
  assert(spaced.length === cluster.length, "no posts dropped or duplicated");

  // Unavoidable single-creator run stays intact (no infinite loop, no loss).
  const solo = [post("1", "a"), post("2", "a"), post("3", "a")];
  const soloOut = respaceFeedByCreator(solo, { maxConsecutive: 2 });
  assert(ids(soloOut) === "1,2,3", "single-creator feed emitted in order");

  // Boundary with already-shown feed: preceding run seeds the cap.
  const append = [post("10", "a"), post("11", "b")];
  const withPreceding = respaceFeedByCreator(append, {
    maxConsecutive: 2,
    precedingCreators: ["a", "a"], // two 'a' already on screen
  });
  assert(
    ids(withPreceding) === "11,10",
    "append must not extend an existing 2-run of creator a"
  );

  // Posts without a creator id are never counted into a run.
  const nulls = [
    post("1", null),
    post("2", null),
    post("3", null),
    post("4", "a"),
  ];
  assert(
    ids(respaceFeedByCreator(nulls, { maxConsecutive: 2 })) === "1,2,3,4",
    "null-creator posts never trigger deferral"
  );

  // Realistic batch: several short clusters amid many creators → cap holds.
  const diverse: P[] = [
    post("1", "a"), post("2", "a"), post("3", "a"),
    post("4", "b"), post("5", "c"),
    post("6", "a"), post("7", "a"), post("8", "a"),
    post("9", "d"), post("10", "e"), post("11", "f"),
    post("12", "a"), post("13", "a"), post("14", "g"), post("15", "h"),
  ];
  const diverseOut = respaceFeedByCreator(diverse, { maxConsecutive: 2 });
  assert(diverseOut.length === diverse.length, "all posts preserved (diverse)");
  assert(
    new Set(diverseOut.map((p) => p.id)).size === diverse.length,
    "no duplicates (diverse)"
  );
  assert(maxRun(diverseOut) <= 2, "cap holds for a diverse batch");

  // Best-effort boundary: a creator-dominated batch is never dropped/duplicated,
  // even though the trailing cluster can't be fully broken without re-ranking.
  const dominated: P[] = [];
  for (let i = 0; i < 20; i++) dominated.push(post(String(i), i < 10 ? "a" : "b"));
  const domOut = respaceFeedByCreator(dominated, { maxConsecutive: 2 });
  assert(domOut.length === 20, "all posts preserved (dominated)");
  assert(new Set(domOut.map((p) => p.id)).size === 20, "no duplicates (dominated)");

  // trailingCreatorIds helper.
  assert(
    trailingCreatorIds([post("1", "a"), post("2", "b"), post("3", "c")], 2).join(
      ","
    ) === "b,c",
    "trailingCreatorIds returns last N creators"
  );

  assert(MAX_CONSECUTIVE_SAME_CREATOR >= 1, "cap constant sane");
}

if (require.main === module) {
  runFeedCreatorSpacingTests();
  console.log("feedCreatorSpacing tests passed");
}
