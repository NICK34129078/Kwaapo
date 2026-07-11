/**
 * Neutralize user input that gets interpolated into a PostgREST filter string
 * (e.g. `.or("name.ilike.%<value>%,...")`).
 *
 * PostgREST parses commas and parentheses as filter/grouping syntax, and treats
 * `%`, `_` and `*` as LIKE wildcards. Interpolating raw input therefore allows
 * filter injection (breaking out of the intended conditions) and wildcard abuse.
 * We strip those characters; the result is safe to embed inside an ilike pattern.
 */
export function sanitizePostgrestFilterValue(value: string): string {
  const withoutSyntax = String(value ?? "").replace(/[,()*%_\\]/g, " ");

  // Replace control characters (code point < 0x20 or 0x7f) with spaces without
  // embedding literal control bytes in source.
  let out = "";
  for (const ch of withoutSyntax) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 0x20 || code === 0x7f ? " " : ch;
  }

  return out.replace(/\s+/g, " ").trim();
}
