/**
 * `EXPO_PUBLIC_APP_USER_ID` (non-secret) is sent to the Cloudflare Worker
 * to scope posts (same ID used when inserting in Worker after upload).
 * Post metadata and Supabase credentials are only on the Worker (secrets),
 * not in the mobile app.
 */
function cleanAppUserId(v: string | undefined): string {
  if (v == null || typeof v !== "string") {
    return "";
  }
  return v
    .replace(/^\uFEFF/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

const appUserId = cleanAppUserId(
  process.env.EXPO_PUBLIC_APP_USER_ID
) || "1";

function cleanEnvString(v: string | undefined): string {
  if (v == null || typeof v !== "string") {
    return "";
  }
  return v.replace(/^\uFEFF/g, "").trim();
}

export const env = {
  appUserId,
  /** Supabase project URL (Expo: EXPO_PUBLIC_SUPABASE_URL) */
  supabaseUrl: cleanEnvString(process.env.EXPO_PUBLIC_SUPABASE_URL),
  /** Supabase anon/public key (Expo: EXPO_PUBLIC_SUPABASE_ANON_KEY) */
  supabaseAnonKey: cleanEnvString(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
};

export function isAppUserIdConfigured(): boolean {
  return env.appUserId.length > 0;
}

/** Veilige diagnostiek (geen secrets): alleen booleans en lengtes. */
export function getSupabaseEnvDiagnostics() {
  const url = env.supabaseUrl;
  const key = env.supabaseAnonKey;
  return {
    hasSupabaseUrl: url.length > 0,
    supabaseUrlLength: url.length,
    urlStartsWithHttps: url.startsWith("https://"),
    hasAnonKey: key.length > 0,
    anonKeyLength: key.length,
  };
}

/** Minimaal nodig voor geldige Supabase Auth-requests. */
export function isSupabaseClientConfigured(): boolean {
  const d = getSupabaseEnvDiagnostics();
  return d.hasSupabaseUrl && d.urlStartsWithHttps && d.hasAnonKey;
}

/** Eénmalige dev-log; geen keys, alleen flags/lengtes. */
export function logSupabaseEnvDiagnosticsOnce(): void {
  if (!__DEV__) {
    return;
  }
  const d = getSupabaseEnvDiagnostics();
  console.log("[Supabase env]", {
    EXPO_PUBLIC_SUPABASE_URL_set: d.hasSupabaseUrl,
    supabaseUrlLength: d.supabaseUrlLength,
    urlStartsWithHttps: d.urlStartsWithHttps,
    EXPO_PUBLIC_SUPABASE_ANON_KEY_set: d.hasAnonKey,
    anonKeyLength: d.anonKeyLength,
  });
  if (!d.hasSupabaseUrl) {
    console.warn(
      "[Supabase] EXPO_PUBLIC_SUPABASE_URL ontbreekt of is leeg. Zet deze in .env in de projectroot en herstart Expo."
    );
  } else if (!d.urlStartsWithHttps) {
    console.warn(
      "[Supabase] URL moet met https:// beginnen (bv. https://xxxx.supabase.co). HTTP of typos geven vaak 'Network request failed'."
    );
  }
  if (!d.hasAnonKey) {
    console.warn(
      "[Supabase] EXPO_PUBLIC_SUPABASE_ANON_KEY ontbreekt of is leeg. Project Settings → API → anon public."
    );
  }
}
