/**
 * Pure helpers for the cold-start interest picker. Kept separate from the
 * Supabase service so the selection/normalisation rules are unit-testable.
 * Normalisation mirrors the server (`seed_feed_interests`) and `parseHashtagInput`:
 * lowercase, strip to [a-z0-9_], drop empties, dedupe.
 */

export const MIN_INTEREST_SELECTION = 3;
export const MAX_INTEREST_SELECTION = 20;

/**
 * Curated fallback interests so onboarding always has options, even on a fresh
 * platform where `get_popular_feed_tags` returns little. Merged with (and
 * deduped against) the live popular tags by the picker.
 */
export const DEFAULT_INTEREST_TAGS: readonly string[] = [
  "fashion",
  "streetwear",
  "vintage",
  "sneakers",
  "beauty",
  "skincare",
  "fitness",
  "food",
  "travel",
  "music",
  "art",
  "gaming",
  "tech",
  "home",
  "diy",
  "photography",
  "cars",
  "sports",
  "comedy",
  "dance",
];

export function normalizeInterestTag(tag: string): string {
  if (typeof tag !== "string") {
    return "";
  }
  return tag.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}

/** Normalise, drop empties, and dedupe (preserving first-seen order). */
export function dedupeInterestTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const norm = normalizeInterestTag(raw);
    if (norm.length === 0 || seen.has(norm)) {
      continue;
    }
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

/**
 * Build the option list shown in the picker: live popular tags first (already
 * ranked by usage), padded with curated defaults, normalised and deduped.
 */
export function buildInterestOptions(
  popularTags: readonly string[],
  defaults: readonly string[] = DEFAULT_INTEREST_TAGS
): string[] {
  return dedupeInterestTags([...popularTags, ...defaults]);
}

/** Selection is submittable once at least MIN_INTEREST_SELECTION distinct tags are chosen. */
export function canSubmitInterestSelection(selectedCount: number): boolean {
  return selectedCount >= MIN_INTEREST_SELECTION;
}

/**
 * Final payload for `seed_feed_interests`: normalised, deduped, and capped at
 * MAX_INTEREST_SELECTION so a client bug can't blow past the server bound.
 */
export function prepareInterestSeedPayload(
  selected: readonly string[]
): string[] {
  return dedupeInterestTags(selected).slice(0, MAX_INTEREST_SELECTION);
}
