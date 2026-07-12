type WorkerStripeJson = {
  error?: string;
  message?: string;
  detail?: string;
  step?: string;
};

export function mapStripeConnectUserMessage(
  json: WorkerStripeJson,
  status: number,
  context: "status" | "link" = "link"
): string {
  const raw = [json.error, json.message, json.detail]
    .filter((p): p is string => typeof p === "string" && p.length > 0)
    .join(" ");

  if (status === 401 || status === 403 || /sessie|jwt|unauthorized|not authenticated/i.test(raw)) {
    return "Je sessie is verlopen. Log opnieuw in.";
  }

  if (/Alleen business accounts/i.test(raw)) {
    return "Stel eerst je bedrijfsgegevens op als zakelijk account (stap 1).";
  }

  if (/Profiel niet gevonden/i.test(raw)) {
    return "Je profiel kon niet worden geladen. Log opnieuw in en probeer het opnieuw.";
  }

  if (context === "status") {
    if (/read-only|PostgREST 400|Seller readiness sync mislukt/i.test(raw)) {
      return "Stripe-status kon niet worden opgeslagen. Probeer het opnieuw.";
    }
    if (/Stripe \d{3}|rate limit|temporarily unavailable|timeout/i.test(raw)) {
      return "Stripe-status kon niet worden opgehaald. Probeer het opnieuw.";
    }
    if (raw.length > 0 && raw.length <= 180 && !/PostgREST|pgrst|P0001|postgres/i.test(raw)) {
      return raw;
    }
    return "Stripe-status kon niet worden opgehaald. Probeer het opnieuw.";
  }

  if (/read-only|stripe_connect_account_id|PostgREST 400/i.test(raw)) {
    return "Stripe kon tijdelijk niet worden gestart. Probeer het opnieuw.";
  }

  if (/Stripe \d{3}|rate limit|temporarily unavailable|timeout/i.test(raw)) {
    return "Stripe kon tijdelijk niet worden gestart. Probeer het opnieuw.";
  }

  if (/account link heeft geen url|onboarding URL/i.test(raw)) {
    return "Stripe gaf geen geldige onboarding-link terug. Probeer het opnieuw.";
  }

  if (raw.length > 0 && raw.length <= 180 && !/PostgREST|pgrst|P0001|postgres/i.test(raw)) {
    return raw;
  }

  return "Stripe kon tijdelijk niet worden gestart. Probeer het opnieuw.";
}
