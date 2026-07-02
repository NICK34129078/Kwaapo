import {
  appendUniqueFeedPosts,
  buildRankedFeedBatch,
  dedupeFeedPosts,
} from "./feedRanking";
import type { UserVideoPost } from "../types/userVideoPost";

function post(id: string, tags?: string[]): UserVideoPost {
  return {
    id,
    type: "video",
    imageUrl: "https://example.com/img.jpg",
    username: "user",
    caption: "test",
    price: "€0",
    likesCount: 0,
    comments: "0",
    tags,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

export function runFeedRankingHelperTests(): void {
  const deduped = dedupeFeedPosts([post("a"), post("a"), post("b")]);
  assert(deduped.length === 2, "dedupe should keep first occurrence");

  const appended = appendUniqueFeedPosts([post("a")], [post("b"), post("a")]);
  assert(appended.length === 2, "append should add only new ids");
  assert(appended[0]!.id === "a" && appended[1]!.id === "b", "append preserves order");

  const merged = buildRankedFeedBatch(
    [post("p1", ["tag"])]
  );
  assert(merged.some((p) => p.id === "p1"), "ranked batch keeps rpc order");
  assert(merged.length >= 1, "ranked batch produces feed items");

  const empty = buildRankedFeedBatch([]);
  assert(empty.length === 0, "empty rpc returns empty feed");
}

if (require.main === module) {
  runFeedRankingHelperTests();
  console.log("feedRanking helper tests passed");
}
