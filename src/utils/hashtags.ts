const MAX_TAGS = 10;
const MAX_TAG_LEN = 30;

/**
 * Parseert hashtag-invoer: #tag en tag, lowercase, trim, alleen [a-z0-9_],
 * max 10 tags, elk max 30 tekens, uniek.
 */
export function parseHashtagInput(raw: string): string[] {
  const input = typeof raw === "string" ? raw.trim() : "";
  if (!input) {
    return [];
  }

  const tokens = input.split(/\s+/).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];

  for (const tok of tokens) {
    let t = tok.replace(/^#+/, "").trim().toLowerCase();
    t = t.replace(/[^a-z0-9_]/g, "");
    if (!t) {
      continue;
    }
    if (t.length > MAX_TAG_LEN) {
      t = t.slice(0, MAX_TAG_LEN);
    }
    if (seen.has(t)) {
      continue;
    }
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_TAGS) {
      break;
    }
  }

  return out;
}
