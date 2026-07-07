import { supabase } from "../lib/supabase";

const READ_BATCH = 100;

export async function fetchActivityReadKeys(): Promise<Set<string>> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.id) {
    return new Set();
  }

  const { data, error } = await supabase
    .from("activity_reads")
    .select("activity_key")
    .eq("user_id", user.id);

  if (error) {
    console.warn("[activityReadService] fetch keys failed", error.message);
    return new Set();
  }

  return new Set(
    (data ?? [])
      .map((row) => row.activity_key as string)
      .filter((key) => key.length > 0)
  );
}

export async function markActivityRead(activityKey: string): Promise<boolean> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.id || activityKey.length === 0) {
    return false;
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("activity_reads").upsert(
    {
      user_id: user.id,
      activity_key: activityKey,
      read_at: now,
    },
    { onConflict: "user_id,activity_key" }
  );

  if (error) {
    console.warn("[activityReadService] mark read failed", error.message);
    return false;
  }

  return true;
}

/**
 * Bulk-mark social activity keys as read (single upsert per batch).
 * Safe to call repeatedly — conflicts update read_at only.
 */
export async function markAllSocialActivityAsRead(
  activityKeys: string[]
): Promise<boolean> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.id) {
    return false;
  }

  const unique = [...new Set(activityKeys.filter((key) => key.length > 0))];
  if (unique.length === 0) {
    return true;
  }

  const now = new Date().toISOString();

  for (let i = 0; i < unique.length; i += READ_BATCH) {
    const slice = unique.slice(i, i + READ_BATCH);
    const rows = slice.map((activity_key) => ({
      user_id: user.id,
      activity_key,
      read_at: now,
    }));

    const { error } = await supabase
      .from("activity_reads")
      .upsert(rows, { onConflict: "user_id,activity_key" });

    if (error) {
      console.warn("[activityReadService] bulk mark read failed", error.message);
      return false;
    }
  }

  return true;
}
