import { supabase } from "../lib/supabase";
import { isPersistablePostId } from "./postLikesService";
import type { ShareTarget } from "./sharePostService";

function logPostSharesError(scope: string, error: unknown): void {
  const e = error as { code?: string; message?: string };
  console.warn(`[post_shares] ${scope}`, {
    code: e.code,
    message: e.message,
  });
}

/**
 * Licht share-event (geen externe app-gegevens). Faalt stil als tabel/migratie ontbreekt.
 */
export async function recordPostShare(
  postId: string,
  target: ShareTarget,
  userId: string | null
): Promise<void> {
  if (!isPersistablePostId(postId)) {
    return;
  }

  const row: {
    post_id: string;
    target: ShareTarget;
    user_id?: string;
  } = {
    post_id: postId,
    target,
  };

  if (userId && userId.length > 0) {
    row.user_id = userId;
  }

  const { error } = await supabase.from("post_shares").insert(row);

  if (error) {
    logPostSharesError("recordPostShare", error);
  }
}

/** Optioneel: aantal shares voor UI (alleen persistable posts). */
export async function fetchPostShareCount(postId: string): Promise<number> {
  if (!isPersistablePostId(postId)) {
    return 0;
  }

  const { count, error } = await supabase
    .from("post_shares")
    .select("id", { count: "exact", head: true })
    .eq("post_id", postId);

  if (error) {
    logPostSharesError("fetchPostShareCount", error);
    return 0;
  }

  return typeof count === "number" && Number.isFinite(count) ? count : 0;
}
