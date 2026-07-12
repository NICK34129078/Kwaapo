type PostgrestLike = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

const RPC_ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: "Niet ingelogd.",
  invalid_seller_type: "Kies hoe je verkoopt: persoonlijk of bedrijf.",
  business_name_required: "Vul een naam of bedrijfsnaam in.",
  business_email_required: "Vul een geldig zakelijk e-mailadres in.",
  profile_not_found:
    "Je profiel kon niet worden gevonden. Log uit en opnieuw in, of neem contact op met support.",
};

export function mapSellerRpcError(errorCode: string | undefined): string {
  if (!errorCode) {
    return "Opslaan mislukt. Probeer het opnieuw.";
  }
  return RPC_ERROR_MESSAGES[errorCode] ?? "Opslaan mislukt. Probeer het opnieuw.";
}

export function mapSellerSaveError(error: unknown): Error {
  const row = readPostgrestLike(error);
  const code = row?.code ?? "";
  const message = row?.message ?? "";

  if (code === "42501" || /permission denied/i.test(message)) {
    return new Error(
      "Opslaan mislukt door rechten op je profiel. Vernieuw de app en probeer opnieuw."
    );
  }

  if (/read-only/i.test(message)) {
    return new Error(
      "Opslaan mislukt. Vernieuw de app — een serverupdate is nodig voor verkopersregistratie."
    );
  }

  if (code === "PGRST202" || /update_my_seller_business_info/i.test(message)) {
    return new Error(
      "Verkopersregistratie is op de server nog niet bijgewerkt. Probeer later opnieuw of neem contact op."
    );
  }

  if (message.length > 0 && message.length <= 160 && !/pgrst|postgres|jwt/i.test(message)) {
    return new Error(message);
  }

  return new Error("Opslaan mislukt. Probeer het opnieuw.");
}

function readPostgrestLike(error: unknown): PostgrestLike | null {
  if (typeof error === "object" && error !== null) {
    const row = error as PostgrestLike;
    if (typeof row.message === "string" || typeof row.code === "string") {
      return row;
    }
  }
  if (error instanceof Error) {
    return { message: error.message };
  }
  return null;
}

export function logSellerSaveErrorDev(error: unknown): void {
  if (!__DEV__) {
    return;
  }
  const row = readPostgrestLike(error);
  console.warn("[SellerOnboarding] SELLER_SAVE_ERROR", {
    code: row?.code ?? null,
    message: row?.message?.slice(0, 240) ?? null,
    details: row?.details?.slice(0, 120) ?? null,
    hint: row?.hint?.slice(0, 120) ?? null,
  });
}
