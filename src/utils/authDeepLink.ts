/**
 * Parse Supabase auth tokens uit een deep link (hash of query).
 */
export function parseSupabaseAuthParamsFromUrl(url: string): {
  accessToken: string | null;
  refreshToken: string | null;
  type: string | null;
} {
  const hashIndex = url.indexOf("#");
  const queryIndex = url.indexOf("?");
  const paramString =
    hashIndex >= 0
      ? url.slice(hashIndex + 1)
      : queryIndex >= 0
        ? url.slice(queryIndex + 1)
        : "";

  if (!paramString) {
    return { accessToken: null, refreshToken: null, type: null };
  }

  const params = new URLSearchParams(paramString);
  return {
    accessToken: params.get("access_token"),
    refreshToken: params.get("refresh_token"),
    type: params.get("type"),
  };
}

export function isPasswordRecoveryDeepLink(url: string): boolean {
  const { type } = parseSupabaseAuthParamsFromUrl(url);
  return type === "recovery";
}
