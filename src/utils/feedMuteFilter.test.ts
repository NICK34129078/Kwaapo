import {
  filterFeedPostsByMuteSets,
  shouldMuteFeedPost,
  type FeedMuteSets,
} from "./feedMuteFilter";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

export function runFeedMuteFilterTests(): void {
  const muteSets: FeedMuteSets = {
    blockedProfileIds: new Set(["author-1"]),
    hiddenPostIds: new Set(["post-hidden"]),
  };

  assert(
    shouldMuteFeedPost({ id: "post-hidden", ownerProfileId: "author-2" }, muteSets),
    "hidden post id should mute"
  );
  assert(
    shouldMuteFeedPost({ id: "post-1", ownerProfileId: "author-1" }, muteSets),
    "blocked author should mute"
  );
  assert(
    !shouldMuteFeedPost({ id: "post-2", ownerProfileId: "author-2" }, muteSets),
    "unrelated post should not mute"
  );

  const filtered = filterFeedPostsByMuteSets(
    [
      { id: "post-hidden", ownerProfileId: "author-2" },
      { id: "post-1", ownerProfileId: "author-1" },
      { id: "post-2", ownerProfileId: "author-2" },
    ],
    muteSets
  );
  assert(filtered.length === 1, "filter should keep only allowed post");
  assert(filtered[0]!.id === "post-2", "filter should keep post-2");
}

if (require.main === module) {
  runFeedMuteFilterTests();
  console.log("feedMuteFilter tests passed");
}
