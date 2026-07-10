import {
  DEFAULT_INTEREST_TAGS,
  MAX_INTEREST_SELECTION,
  MIN_INTEREST_SELECTION,
  buildInterestOptions,
  canSubmitInterestSelection,
  dedupeInterestTags,
  normalizeInterestTag,
  prepareInterestSeedPayload,
} from "./feedInterests";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

export function runFeedInterestsTests(): void {
  // normalizeInterestTag
  assert(normalizeInterestTag("  #Fashion ") === "fashion", "strips # and casing");
  assert(normalizeInterestTag("Street-Wear!") === "streetwear", "strips punctuation");
  assert(normalizeInterestTag("with space") === "withspace", "spaces removed");
  assert(normalizeInterestTag("###") === "", "all-punctuation → empty");
  assert(normalizeInterestTag(undefined as unknown as string) === "", "non-string → empty");

  // dedupeInterestTags
  assert(
    dedupeInterestTags(["Fashion", "fashion", "#fashion", "art"]).join(",") ===
      "fashion,art",
    "case/hash variants collapse to one"
  );
  assert(
    dedupeInterestTags(["", "  ", "!!!"]).length === 0,
    "empties dropped entirely"
  );

  // buildInterestOptions: popular first, defaults padded, deduped.
  const opts = buildInterestOptions(["sneakers", "raretag"], ["sneakers", "fashion"]);
  assert(opts[0] === "sneakers", "popular tag stays first");
  assert(opts.includes("raretag") && opts.includes("fashion"), "merges both sources");
  assert(
    opts.filter((t) => t === "sneakers").length === 1,
    "overlap between popular and defaults deduped"
  );

  // canSubmitInterestSelection
  assert(!canSubmitInterestSelection(MIN_INTEREST_SELECTION - 1), "below min not submittable");
  assert(canSubmitInterestSelection(MIN_INTEREST_SELECTION), "at min submittable");

  // prepareInterestSeedPayload caps and dedupes.
  const many = Array.from({ length: 30 }, (_, i) => `tag${i}`);
  const payload = prepareInterestSeedPayload([...many, "tag0", "TAG0"]);
  assert(payload.length === MAX_INTEREST_SELECTION, "payload capped at max");
  assert(new Set(payload).size === payload.length, "payload has no duplicates");

  // Defaults are already clean & unique (guards against typos in the constant).
  assert(
    dedupeInterestTags(DEFAULT_INTEREST_TAGS).length === DEFAULT_INTEREST_TAGS.length,
    "DEFAULT_INTEREST_TAGS must be normalised and unique"
  );
}

if (require.main === module) {
  runFeedInterestsTests();
  console.log("feedInterests tests passed");
}
