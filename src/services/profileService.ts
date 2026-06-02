import { supabase } from "../lib/supabase";
import {
  mapProfileRow,
  normalizeAccountType,
  type AccountType,
  type Profile,
  type ProfileRow,
} from "../types/profile";

const PROFILE_COLUMNS =
  "id, username, display_name, avatar_url, bio, account_type";

export async function fetchProfileById(
  profileId: string
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", profileId)
    .maybeSingle<ProfileRow>();

  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }
  return mapProfileRow(data);
}

/**
 * Tijdelijk voor dev/test — later vervangen door echte onboarding.
 */
export async function updateMyAccountType(
  accountType: AccountType
): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }
  if (!user?.id) {
    throw new Error("Niet ingelogd.");
  }

  const normalized = normalizeAccountType(accountType);
  const { error } = await supabase
    .from("profiles")
    .update({ account_type: normalized })
    .eq("id", user.id);

  if (error) {
    throw error;
  }
}

export { normalizeAccountType, type AccountType, type Profile };
