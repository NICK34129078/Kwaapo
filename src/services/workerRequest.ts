import { supabase } from "../lib/supabase";
import { formatWorkerAuthClientError } from "../utils/workerUploadErrors";

/** Worker requests: send Supabase session JWT — never X-App-User-Id. */
export async function buildWorkerAuthHeaders(
  extra: Record<string, string> = {}
): Promise<Record<string, string>> {
  const {
    data: { session: initialSession },
  } = await supabase.auth.getSession();

  let session = initialSession;

  if (!session?.access_token) {
    const { data: refreshed, error: refreshError } =
      await supabase.auth.refreshSession();
    if (!refreshError && refreshed.session?.access_token) {
      session = refreshed.session;
    }
  }

  if (!session?.access_token) {
    throw new Error(formatWorkerAuthClientError(new Error("Niet ingelogd.")));
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
    ...extra,
  };
}
