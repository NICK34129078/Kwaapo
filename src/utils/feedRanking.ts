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
  /** Gemiddeld aantal tagged posts tussen no-tag inserts (default 9 → interval 8–12). */
  noTagInterval?: number;
  /** Maximaal aandeel no-tag t.o.v. tagged (default 0.1 = ~10%). */
  maxNoTagRatio?: number;
  /** Eerste N items moeten tagged blijven als genoeg tagged posts (default 10). */
  minTaggedHead?: number;
  /** Max no-tag posts als er geen tagged posts zijn (default 10). */
  noTaggedFallbackCap?: number;
};

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

function randomNoTagInterval(base: number): number {
  const jitter = Math.floor(Math.random() * 5) - 2; // -2 .. +2
  return Math.max(8, Math.min(12, base + jitter));
}

/**
 * Controlled For You mix: tagged hoofdfeed, no-tag zeldzaam en verspreid.
 * - Behoud tagged-volgorde (algoritme/RPC)
 * - Shuffle no-tag pool
 * - Max ~10% no-tag, interval ~9 tagged tussen inserts
 * - No-tag nooit op index 0 als tagged bestaan
 * - Eerste 10 items tagged wanneer tagged.length >= 10
 */
export function buildControlledForYouMix(
  posts: UserVideoPost[],
  options: ControlledForYouMixOptions = {}
): UserVideoPost[] {
  const noTagInterval = options.noTagInterval ?? 9;
  const maxNoTagRatio = options.maxNoTagRatio ?? 0.1;
  const minTaggedHead = options.minTaggedHead ?? 10;
  const noTaggedFallbackCap = options.noTaggedFallbackCap ?? 10;

  const { tagged, untagged } = splitTaggedAndUntagged(posts);

  if (tagged.length === 0) {
    return shuffleArray(untagged).slice(0, noTaggedFallbackCap);
  }

  const maxNoTags = Math.min(
    untagged.length,
    Math.max(0, Math.ceil(tagged.length * maxNoTagRatio))
  );
  const noTagQueue = shuffleArray(untagged).slice(0, maxNoTags);

  const protectedHead =
    tagged.length >= minTaggedHead ? minTaggedHead : 1;

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
 * Merge personalized/explore RPC + global Worker-pagina, één controlled mix (alleen bij refresh).
 */
export function mergePersonalizedAndGlobalFeed(
  personalized: UserVideoPost[],
  global: UserVideoPost[]
): UserVideoPost[] {
  const seen = new Set<string>();
  const merged: UserVideoPost[] = [];

  const push = (p: UserVideoPost) => {
    if (seen.has(p.id)) return;
    seen.add(p.id);
    merged.push(p);
  };

  for (const p of personalized) push(p);
  for (const p of global) push(p);

  return buildControlledForYouMix(merged);
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
