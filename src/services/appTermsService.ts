import { CURRENT_APP_TERMS_VERSION } from "../constants/appPolicies";
import { supabase } from "../lib/supabase";

export async function recordAppTermsAcceptance(userId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("profiles")
    .update({
      app_terms_version: CURRENT_APP_TERMS_VERSION,
      app_terms_accepted_at: now,
    })
    .eq("id", userId);

  if (error) {
    throw error;
  }
}
