import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

/** Supabase recovery deep link of PASSWORD_RECOVERY auth event. */
export function isPasswordRecoveryAuthEvent(event: AuthChangeEvent): boolean {
  return event === "PASSWORD_RECOVERY";
}

/**
 * Recovery-sessie: gebruiker moet nog een nieuw wachtwoord instellen.
 * Na setSession vanuit recovery-link is er meestal al een geldige sessie.
 */
export function isPasswordRecoverySession(
  session: Session | null,
  options?: { recoveryDeepLink?: boolean }
): boolean {
  if (options?.recoveryDeepLink) {
    return session != null;
  }
  return false;
}

export function shouldOpenPasswordRecoveryScreen(input: {
  passwordRecoveryPending: boolean;
  session: Session | null;
}): boolean {
  return input.passwordRecoveryPending && input.session != null;
}
