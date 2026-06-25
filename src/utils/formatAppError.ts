type ErrorLike = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

export function readErrorLike(error: unknown): ErrorLike | null {
  if (error instanceof Error) {
    return { message: error.message };
  }
  if (typeof error === "object" && error !== null) {
    const row = error as ErrorLike;
    if (typeof row.message === "string" || typeof row.code === "string") {
      return row;
    }
  }
  return null;
}

export function formatProductDetailsSaveError(error: unknown): string {
  const row = readErrorLike(error);
  const message = row?.message?.trim() ?? "";
  const code = row?.code?.trim() ?? "";

  if (
    message.includes("voorraad kan alleen via voorraad beheer") ||
    message.includes("products: voorraad")
  ) {
    return "Voorraad kan niet via Opslaan worden gewijzigd. Gebruik ‘Voorraad toevoegen’ of ‘Voorraad aanpassen’ in de voorraadsectie.";
  }

  if (
    code === "42501" ||
    message.toLowerCase().includes("row-level security") ||
    message.toLowerCase().includes("policy")
  ) {
    return "Je productgegevens konden niet worden opgeslagen. Controleer of je dit product mag bewerken en of publiceren is toegestaan.";
  }

  if (code === "PGRST116") {
    return "Je productgegevens konden niet worden opgeslagen. Het product is niet gevonden of je hebt geen rechten.";
  }

  if (message.length > 0) {
    return message;
  }

  return "Je productgegevens konden niet worden opgeslagen. Probeer het opnieuw.";
}

export function formatProductStockError(error: unknown): string {
  const row = readErrorLike(error);
  const message = row?.message?.trim() ?? "";

  if (message.length > 0) {
    return message;
  }

  return "Je voorraad kon niet worden aangepast. Probeer het opnieuw.";
}
