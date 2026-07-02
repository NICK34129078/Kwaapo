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

export function splitTaggedAndUntagged(posts: UserVideoPost[]): {
  tagged: UserVideoPost[];
  untagged: UserVideoPost[];
} {
  const tagged: UserVideoPost[] = [];
  const untagged: UserVideoPost[] = [];
  for (const p of posts) {
    if (hasUsefulTags(p)) {
      tagged.push(p);
    } else {
      untagged.push(p);
    }
  }
  return { tagged, untagged };
}

export type ControlledForYouMixOptions = {
  /** Gemiddeld aantal tagged posts tussen no-tag inserts (default 12). */
  noTagInterval?: number;
  /** Override: max no-tag inserts (default afgeleid van tagged pool). */
  maxNoTagInserts?: number;
  /** Eerste N items moeten tagged blijven (default = batchgrootte). */
  minTaggedHead?: number;
  /** Max no-tag posts als er geen tagged posts zijn (default 1). */
  noTaggedFallbackCap?: number;
};

function randomNoTagInterval(base: number): number {
  const jitter = Math.floor(Math.random() * 5) - 2; // -2 .. +2
  return Math.max(8, Math.min(12, base + jitter));
}

/**
 * Controlled For You mix: tagged hoofdfeed, no-tag zeldzaam.
 * Normaal 0 untagged; max 1; max 2 alleen bij dunne tagged pool.
 */
export function buildControlledForYouMix(
  posts: UserVideoPost[],
  options: ControlledForYouMixOptions = {}
): UserVideoPost[] {
  const noTagInterval = options.noTagInterval ?? 12;
  const noTaggedFallbackCap = options.noTaggedFallbackCap ?? 1;

  const { tagged, untagged } = splitTaggedAndUntagged(posts);

  if (tagged.length === 0) {
    return untagged.slice(0, noTaggedFallbackCap);
  }

  const maxNoTags =
    options.maxNoTagInserts ??
    (tagged.length >= 14 ? 0 : tagged.length >= 9 ? 1 : Math.min(2, untagged.length));

  if (maxNoTags <= 0) {
    return tagged;
  }

  const noTagQueue = untagged.slice(0, maxNoTags);
  const minTaggedHead = options.minTaggedHead ?? Math.max(tagged.length, 12);
  const protectedHead = tagged.length >= minTaggedHead ? minTaggedHead : tagged.length;

  const out: UserVideoPost[] = [];
  let taggedIdx = 0;
  let noTagIdx = 0;
  let taggedSinceNoTag = 0;
  let untilNextNoTag = randomNoTagInterval(noTagInterval);

  while (taggedIdx < tagged.length) {
    out.push(tagged[taggedIdx]!);
    taggedIdx++;
    taggedSinceNoTag++;

    const canPlaceNoTag =
      out.length >= protectedHead &&
      noTagIdx < noTagQueue.length &&
      taggedSinceNoTag >= untilNextNoTag;

    if (canPlaceNoTag) {
      out.push(noTagQueue[noTagIdx]!);
      noTagIdx++;
      taggedSinceNoTag = 0;
      untilNextNoTag = randomNoTagInterval(noTagInterval);
    }
  }

  return out;
}

/** @deprecated Use buildControlledForYouMix */
export function enforceForYouHashtagGate(posts: UserVideoPost[]): UserVideoPost[] {
  return buildControlledForYouMix(posts);
}

/** @deprecated Use buildControlledForYouMix */
export const forceTaggedFirstFinalOrder = buildControlledForYouMix;

/** @deprecated Use hasUsefulTags */
export const hasFeedTags = hasUsefulTags;

/** @deprecated Use buildControlledForYouMix */
export const partitionTaggedFirst = buildControlledForYouMix;

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
 * Ranked feed uit Supabase RPC — behoudt servervolgorde, geen Worker-fallback.
 */
export function buildRankedFeedBatch(rankedRpc: UserVideoPost[]): UserVideoPost[] {
  if (rankedRpc.length === 0) {
    return [];
  }
  return buildControlledForYouMix(rankedRpc);
}

/** @deprecated Gebruik buildRankedFeedBatch zonder Worker-fallback. */
export function mergePersonalizedAndGlobalFeed(
  personalized: UserVideoPost[],
  _global: UserVideoPost[]
): UserVideoPost[] {
  return buildRankedFeedBatch(personalized);
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

export function logForYouFinalTop20(posts: UserVideoPost[]): void {
  if (!__DEV__) return;
  console.log(
    "[FOR_YOU_FINAL_TOP_20]",
    posts.slice(0, 20).map((p) => ({
      id: p.id,
      type: p.type,
      tags: p.tags,
      hasTags: hasUsefulTags(p),
      caption: p.caption,
    }))
  );
}
