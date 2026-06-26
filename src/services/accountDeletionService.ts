import { supabase } from "../lib/supabase";
import { formatUserFacingError } from "../utils/formatAppError";

type RpcResult = {
  success?: boolean;
  already_requested?: boolean;
  reason?: string;
};

export async function requestAccountDeletion(reason?: string): Promise<void> {
  const { data, error } = await supabase.rpc("request_account_deletion", {
    p_reason: reason?.trim() || null,
  });

  if (error) {
    throw new Error(
      formatUserFacingError(error, "Account verwijderen mislukt. Probeer het opnieuw.")
    );
  }

  const result = (data ?? {}) as RpcResult;
  if (result.success === false) {
    throw new Error(
      formatUserFacingError(result.reason, "Account verwijderen mislukt. Probeer het opnieuw.")
    );
  }
}
