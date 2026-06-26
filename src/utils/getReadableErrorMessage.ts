import { formatUserFacingError } from "./formatAppError";

export function getReadableErrorMessage(error: unknown, fallback: string): string {
  return formatUserFacingError(error, fallback);
}
