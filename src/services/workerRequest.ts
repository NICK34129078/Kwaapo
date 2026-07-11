import { supabase } from "../lib/supabase";
import {
  invalidateStaleAuthSession,
  isAuthSessionError,
  isValidAuthUser,
  shouldInvalidateForHttpStatus,
} from "../utils/authSession";
import { formatWorkerAuthClientError } from "../utils/workerUploadErrors";

/** Worker requests: send Supabase session JWT — never X-App-User-Id. */
export async function buildWorkerAuthHeaders(
  extra: Record<string, string> = {}
): Promise<Record<string, string>> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !isValidAuthUser(userData.user)) {
    if (userError && isAuthSessionError(userError)) {
      void invalidateStaleAuthSession("worker_getUser");
    }
    throw new Error(formatWorkerAuthClientError(new Error("Niet ingelogd.")));
  }

  const {
    data: { session: initialSession },
  } = await supabase.auth.getSession();

  let session = initialSession;

  if (!session?.access_token) {
    const { data: refreshed, error: refreshError } =
      await supabase.auth.refreshSession();
    if (refreshError) {
      if (isAuthSessionError(refreshError)) {
        void invalidateStaleAuthSession("worker_refreshSession");
      }
      throw new Error(formatWorkerAuthClientError(refreshError));
    }
    if (!refreshed.session?.access_token) {
      void invalidateStaleAuthSession("worker_refresh_no_session");
      throw new Error(formatWorkerAuthClientError(new Error("Niet ingelogd.")));
    }
    session = refreshed.session;
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
    ...extra,
  };
}

/** Roep aan na worker/API-responses met 401 of ongeldige refresh token. */
export async function handleUnauthorizedApiResponse(
  status: number,
  message?: string
): Promise<void> {
  const lower = (message ?? "").toLowerCase();
  if (
    shouldInvalidateForHttpStatus(status) ||
    lower.includes("invalid refresh token") ||
    lower.includes("jwt")
  ) {
    await invalidateStaleAuthSession(`api_${status}`);
  }
}
