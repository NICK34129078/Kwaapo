import type { PostgrestError } from "@supabase/supabase-js";

function isPostgrestError(error: unknown): error is PostgrestError {
  return (
    typeof error === "object" &&
    error != null &&
    "code" in error &&
    "message" in error
  );
}

/**
 * Maps ship-update failures to user-facing Dutch copy.
 * Dev logs should include the raw error separately.
 */
export function formatSellerShipUpdateError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    const msg = error.message;
    if (msg === "Bestelling niet gevonden.") {
      return msg;
    }
    if (msg.includes("Deze bestelling kan niet meer als verzonden")) {
      return msg;
    }
    if (msg.includes("Niet ingelogd")) {
      return "Log opnieuw in als verkoper en probeer het nog eens.";
    }
    if (msg.includes("orders: sellers cannot")) {
      return "Deze bestelling kan nu niet als verzonden worden gemarkeerd.";
    }
    if (msg.includes("orders: authentication required")) {
      return "Je sessie is verlopen. Log opnieuw in en probeer het nog eens.";
    }
  }

  if (isPostgrestError(error)) {
    if (error.code === "PGRST116") {
      return "Bestelling niet gevonden of geen rechten om te wijzigen.";
    }
    if (error.code === "42703") {
      return "Verzending kon niet worden opgeslagen door een serverconfiguratiefout.";
    }
  }

  return "Verzending bijwerken mislukt. Probeer het opnieuw.";
}

export function logSellerShipUpdateErrorDev(orderId: string, error: unknown): void {
  if (!__DEV__) {
    return;
  }
  if (isPostgrestError(error)) {
    console.warn("[orders] markSellerOrderAsShipped failed", {
      orderId,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return;
  }
  console.warn("[orders] markSellerOrderAsShipped failed", {
    orderId,
    error: error instanceof Error ? error.message : String(error),
  });
}
