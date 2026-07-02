import * as Linking from "expo-linking";

/** Deep link voor Supabase wachtwoord-reset (scheme: lumen-fashion). */
export const PASSWORD_RESET_REDIRECT_URL = Linking.createURL("auth/reset-password");

/** Log exacte runtime-URL vóór Supabase Dashboard redirect-config. */
export function logPasswordResetRedirectUrl(scope = "Auth"): void {
  console.log(`[${scope}] PASSWORD_RESET_REDIRECT_URL`, PASSWORD_RESET_REDIRECT_URL);
}
