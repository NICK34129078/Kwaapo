/**
 * Client-side creator-fatigue cap for the Reels feed.
 *
 * The server (`get_personalized_feed`) only applies a *soft* score penalty to
 * repeat creators (`ranking_score - (creator_rank - 1) * 3.0`), so a
 * high-affinity creator can still surface several posts back-to-back. This pass
 * enforces a *hard* cap on consecutive posts from one creator.
 *
 * It is deliberately NOT a re-rank: it never consults ranking score, tags, or
 * affinity — only the consecutive-creator constraint. When a run would exceed
 * the cap it pulls the earliest following post from a *different* creator
 * forward by the minimum amount needed to break the run; all other server
 * ordering is preserved. Posts without an `ownerProfileId` are treated as
 * distinct and are never counted into a run nor deferred.
 *
 * Best-effort by design: because it only ever moves a differing post *forward*
 * (never reorders by frequency), a batch dominated by one or two creators can
 * still leave a trailing cluster — fully capping that would require a
 * frequency-based re-rank, which the feed invariant forbids. In a normal
 * ranked batch (many creators, a few short clusters) the cap holds. No post is
 * ever dropped or duplicated.
 */

export type CreatorSpacingInput = {
  ownerProfileId?: string | null;
};

export const MAX_CONSECUTIVE_SAME_CREATOR = 2;

function normalizeCreator(id: string | null | undefined): string | null {
  if (typeof id !== "string") {
    return null;
  }
  const trimmed = id.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Trailing creator ids of an already-ordered feed (most-recent last). */
export function trailingCreatorIds(
  posts: readonly CreatorSpacingInput[],
  count: number
): string[] {
  if (count <= 0 || posts.length === 0) {
    return [];
  }
  return posts.slice(-count).map((p) => normalizeCreator(p.ownerProfileId) ?? "");
}

type RespaceOptions = {
  maxConsecutive?: number;
  /** Creators already shown before this batch (most-recent last), to respect the boundary. */
  precedingCreators?: readonly (string | null | undefined)[];
};

export function respaceFeedByCreator<T extends CreatorSpacingInput>(
  posts: readonly T[],
  options?: RespaceOptions
): T[] {
  const maxConsecutive = Math.max(
    1,
    options?.maxConsecutive ?? MAX_CONSECUTIVE_SAME_CREATOR
  );
  if (posts.length <= 1) {
    return posts.slice();
  }

  // Seed the trailing run from what's already on screen.
  let runCreator: string | null = null;
  let runLength = 0;
  for (const raw of options?.precedingCreators ?? []) {
    const creator = normalizeCreator(raw);
    if (creator !== null && creator === runCreator) {
      runLength += 1;
    } else {
      runCreator = creator;
      runLength = creator === null ? 0 : 1;
    }
  }

  const pending = posts.slice();
  const result: T[] = [];

  while (pending.length > 0) {
    const headCreator = normalizeCreator(pending[0]!.ownerProfileId);
    const wouldExceed =
      headCreator !== null &&
      headCreator === runCreator &&
      runLength >= maxConsecutive;

    let pickIndex = 0;
    if (wouldExceed) {
      // Earliest following post from a different creator; -1 = all remaining
      // are the same creator, so the cap is unavoidable and we emit in order.
      const alt = pending.findIndex(
        (p) => normalizeCreator(p.ownerProfileId) !== runCreator
      );
      pickIndex = alt === -1 ? 0 : alt;
    }

    const [picked] = pending.splice(pickIndex, 1);
    const pickedCreator = normalizeCreator(picked!.ownerProfileId);
    if (pickedCreator !== null && pickedCreator === runCreator) {
      runLength += 1;
    } else {
      runCreator = pickedCreator;
      runLength = pickedCreator === null ? 0 : 1;
    }
    result.push(picked!);
  }

  return result;
}
