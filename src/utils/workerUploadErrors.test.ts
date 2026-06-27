import { formatWorkerAuthClientError, formatWorkerUploadError } from "./workerUploadErrors";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

export function runWorkerUploadErrorsTests(): void {
  assert(
    formatWorkerUploadError(400, "userId required").includes("tijdelijk niet beschikbaar"),
    "legacy worker userId required → vriendelijke melding"
  );
  assert(
    formatWorkerUploadError(401, "Unauthorized") ===
      "Je sessie is verlopen. Log opnieuw in en probeer het opnieuw.",
    "401 → sessie verlopen"
  );
  assert(
    formatWorkerAuthClientError(new Error("Niet ingelogd.")) ===
      "Je sessie is verlopen. Log opnieuw in en probeer het opnieuw.",
    "buildWorkerAuth zonder sessie"
  );
}

if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") {
  runWorkerUploadErrorsTests();
}
