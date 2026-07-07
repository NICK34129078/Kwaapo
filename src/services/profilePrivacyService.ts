import { supabase } from "../lib/supabase";

export async function fetchMyProfileIsPrivate(): Promise<boolean> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.id) {
    throw new Error("Niet ingelogd.");
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("is_private")
    .eq("id", user.id)
    .maybeSingle<{ is_private: boolean | null }>();

  if (error) {
    throw error;
  }

  return data?.is_private === true;
}

export async function updateMyProfileIsPrivate(isPrivate: boolean): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.id) {
    throw new Error("Niet ingelogd.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({ is_private: isPrivate })
    .eq("id", user.id);

  if (error) {
    throw error;
  }
}

export async function fetchProfileIsPrivate(profileId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("profiles")
    .select("is_private")
    .eq("id", profileId)
    .maybeSingle<{ is_private: boolean | null }>();

  if (error) {
    throw error;
  }

  return data?.is_private === true;
}
