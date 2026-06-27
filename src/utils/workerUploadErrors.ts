/** Map ruwe worker-responses naar begrijpelijke uploadfouten (geen technische lekken). */

const SESSION_EXPIRED =
  "Je sessie is verlopen. Log opnieuw in en probeer het opnieuw.";

const LEGACY_WORKER_MISMATCH =
  "Upload is tijdelijk niet beschikbaar. Sluit de app volledig af, log opnieuw in en probeer het nog eens.";

export function formatWorkerUploadError(
  status: number,
  message: string | undefined,
  bodyText = ""
): string {
  const msg = (message ?? "").trim();
  const lower = msg.toLowerCase();
  const bodyLower = bodyText.toLowerCase();

  if (status === 401 || lower === "unauthorized" || bodyLower.includes("unauthorized")) {
    return SESSION_EXPIRED;
  }

  if (
    lower.includes("userid required") ||
    lower.includes("x-app-user-id header required")
  ) {
    return LEGACY_WORKER_MISMATCH;
  }

  if (msg.length > 0) {
    return msg;
  }

  const trimmed = bodyText.trim();
  if (trimmed.length > 0 && trimmed.length <= 600) {
    return trimmed;
  }

  return `Upload mislukt (${status})`;
}

export function formatWorkerAuthClientError(error: unknown): string {
  if (error instanceof Error && error.message === "Niet ingelogd.") {
    return SESSION_EXPIRED;
  }
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return SESSION_EXPIRED;
}
