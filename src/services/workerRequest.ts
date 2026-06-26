import { supabase } from "../lib/supabase";

/** Worker requests: send Supabase session JWT — never X-App-User-Id. */
export async function buildWorkerAuthHeaders(
  extra: Record<string, string> = {}
): Promise<Record<string, string>> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    throw new Error("Niet ingelogd.");
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
    ...extra,
  };
}
