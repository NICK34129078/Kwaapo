import type { UserVideoPost } from "../types/userVideoPost";

function tagsArrayFromPost(post: UserVideoPost): string[] {
  const raw: unknown = post.tags;
  if (Array.isArray(raw)) {
    return raw
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  }
  if (typeof raw === "string") {
    const s = raw.trim();
    return s.length > 0 ? [s] : [];
  }
  return [];
}

export function hasUsefulTags(post: UserVideoPost): boolean {
  return tagsArrayFromPost(post).length > 0;
}

/** Verwijdert dubbele post-ids; behoudt eerste voorkomen. */
export function dedupeFeedPosts(posts: UserVideoPost[]): UserVideoPost[] {
  const seen = new Set<string>();
  const out: UserVideoPost[] = [];
  for (const p of posts) {
    if (seen.has(p.id)) {
      continue;
    }
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

/** Voegt nieuwe posts achteraan toe zonder bestaande volgorde te wijzigen. */
export function appendUniqueFeedPosts(
  existing: UserVideoPost[],
  append: UserVideoPost[]
): UserVideoPost[] {
  if (append.length === 0) {
    return existing;
  }
  const seen = new Set(existing.map((p) => p.id));
  const out = [...existing];
  for (const p of append) {
    if (seen.has(p.id)) {
      continue;
    }
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

/**
 * Ranked feed uit Supabase RPC — de server bepaalt volgorde én tagged/untagged
 * mix (`get_personalized_feed` / `get_explore_feed`); client dedupet alleen.
 */
export function buildRankedFeedBatch(rankedRpc: UserVideoPost[]): UserVideoPost[] {
  return dedupeFeedPosts(rankedRpc);
}

export function logForYouControlledMix(posts: UserVideoPost[]): void {
  if (!__DEV__) return;
  const noTagIndices: number[] = [];
  let taggedCount = 0;
  for (let i = 0; i < posts.length; i++) {
    if (hasUsefulTags(posts[i]!)) {
      taggedCount++;
    } else {
      noTagIndices.push(i);
    }
  }
  console.log("[FOR_YOU_CONTROLLED_MIX]", {
    total: posts.length,
    taggedCount,
    noTagCount: posts.length - taggedCount,
    first20HasTags: posts.slice(0, 20).map((p) => hasUsefulTags(p)),
    noTagIndices,
  });
}
