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

export const env = {
  appUserId,
};

export function isAppUserIdConfigured(): boolean {
  return env.appUserId.length > 0;
}
