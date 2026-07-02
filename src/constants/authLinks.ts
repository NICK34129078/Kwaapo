import * as Linking from "expo-linking";

/** Deep link voor Supabase wachtwoord-reset (scheme: lumen-fashion). */
export const PASSWORD_RESET_REDIRECT_URL = Linking.createURL("auth/reset-password");
