import type { AuthError } from "@supabase/supabase-js";

function lc(s: string): string {
  return s.toLowerCase();
}

/**
 * Vertaalt Supabase Auth-fouten naar begrijpelijke NL-teksten (geen secrets).
 */
export function formatAuthError(
  error: AuthError,
  flow: "signIn" | "signUp"
): string {
  const code = error.code ?? "";
  const msg = lc(error.message ?? "");

  if (flow === "signIn") {
    if (
      code === "email_not_confirmed" ||
      msg.includes("email not confirmed") ||
      msg.includes("not confirmed")
    ) {
      return "Bevestig eerst je e-mailadres via de link in je inbox voordat je inlogt.";
    }
    if (
      code === "invalid_credentials" ||
      msg.includes("invalid login credentials") ||
      msg.includes("invalid credential")
    ) {
      return "Onjuist e-mailadres of wachtwoord.";
    }
    if (msg.includes("network") || msg.includes("fetch failed")) {
      return "Netwerkfout. Controleer je verbinding en probeer opnieuw.";
    }
    if (msg.includes("invalid email")) {
      return "Voer een geldig e-mailadres in.";
    }
    return (
      error.message ||
      "Inloggen mislukt. Controleer je gegevens en probeer opnieuw."
    );
  }

  if (
    code === "user_already_exists" ||
    msg.includes("already registered") ||
    msg.includes("user already registered") ||
    msg.includes("already been registered")
  ) {
    return "Dit e-mailadres is al geregistreerd. Log in of gebruik een ander adres.";
  }
  if (
    code === "weak_password" ||
    (msg.includes("password") &&
      (msg.includes("weak") ||
        msg.includes("least") ||
        msg.includes("short")))
  ) {
    return "Wachtwoord voldoet niet aan de eisen (vaak minimaal 6 tekens). Kies een sterker wachtwoord.";
  }
  if (
    code === "invalid_email" ||
    msg.includes("invalid email") ||
    (msg.includes("email") && msg.includes("invalid"))
  ) {
    return "Voer een geldig e-mailadres in.";
  }
  if (
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("email rate limit")
  ) {
    return "Te veel pogingen. Wacht even en probeer het opnieuw.";
  }
  if (msg.includes("signup") && msg.includes("disabled")) {
    return "Registratie is tijdelijk uitgeschakeld. Probeer later opnieuw.";
  }
  if (msg.includes("network") || msg.includes("fetch failed")) {
    return "Netwerkfout. Controleer je verbinding en probeer opnieuw.";
  }

  return (
    error.message ||
    "Registratie mislukt. Controleer je gegevens en probeer opnieuw."
  );
}
