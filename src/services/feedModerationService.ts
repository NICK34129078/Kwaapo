import { supabase } from "../lib/supabase";
import { getReadableErrorMessage } from "../utils/getReadableErrorMessage";
import type { FeedMuteSets } from "../utils/feedMuteFilter";
import { isPersistablePostId } from "./postLikesService";

/** Redenen die overeenkomen met post_reports_reason_check in de database. */
export const REPORT_REASONS = [
  { id: "spam", label: "Spam" },
  { id: "ongepast", label: "Ongepaste content" },
  { id: "intimidatie", label: "Intimidatie of pesten" },
  { id: "geweld", label: "Geweld of gevaar" },
  { id: "desinformatie", label: "Desinformatie" },
  { id: "overig", label: "Iets anders" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["id"];

type RpcResult = {
  success?: boolean;
  [key: string]: unknown;
};

function assertRpcSuccess(data: unknown, fallback: string): RpcResult {
  const result = (data ?? {}) as RpcResult;
  if (result.success === false) {
    throw new Error(
      typeof result.reason === "string" ? result.reason : fallback
    );
  }
  return result;
}

export async function blockUser(blockedProfileId: string): Promise<void> {
  const { data, error } = await supabase.rpc("block_user", {
    p_blocked_id: blockedProfileId,
  });
  if (error) {
    throw new Error(getReadableErrorMessage(error, "Blokkeren mislukt."));
  }
  assertRpcSuccess(data, "Blokkeren mislukt.");
}

export async function unblockUser(blockedProfileId: string): Promise<void> {
  const { data, error } = await supabase.rpc("unblock_user", {
    p_blocked_id: blockedProfileId,
  });
  if (error) {
    throw new Error(getReadableErrorMessage(error, "Deblokkeren mislukt."));
  }
  assertRpcSuccess(data, "Deblokkeren mislukt.");
}

export async function reportPost(
  postId: string,
  reason: ReportReason,
  details?: string
): Promise<void> {
  if (!isPersistablePostId(postId)) {
    throw new Error("Deze post kan niet worden gemeld.");
  }
  const { data, error } = await supabase.rpc("report_post", {
    p_post_id: postId,
    p_reason: reason,
    p_details: details?.trim() || null,
  });
  if (error) {
    throw new Error(getReadableErrorMessage(error, "Melden mislukt."));
  }
  assertRpcSuccess(data, "Melden mislukt.");
}

export async function markNotInterested(postId: string): Promise<void> {
  if (!isPersistablePostId(postId)) {
    throw new Error("Deze post kan niet worden verborgen.");
  }
  const { data, error } = await supabase.rpc("mark_not_interested", {
    p_post_id: postId,
  });
  if (error) {
    throw new Error(
      getReadableErrorMessage(error, "Voorkeur kon niet worden opgeslagen.")
    );
  }
  assertRpcSuccess(data, "Voorkeur kon niet worden opgeslagen.");
}

/** Profiel-ids van gebruikers die de huidige gebruiker heeft geblokkeerd. */
export async function fetchMyBlockedProfileIds(): Promise<string[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from("user_blocks")
    .select("blocked_id")
    .eq("blocker_id", user.id);

  if (error) {
    console.warn("[feedModeration] fetchMyBlockedProfileIds", error.message);
    return [];
  }

  return (data ?? [])
    .map((row) => row.blocked_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

/**
 * Post-ids die de gebruiker expliciet heeft verborgen of gemeld
 * (voor client-side filtering van de worker-feed).
 */
export async function fetchMyHiddenPostIds(): Promise<string[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return [];
  }

  const [notInterestedRes, reportsRes] = await Promise.all([
    supabase
      .from("feed_not_interested")
      .select("post_id")
      .eq("user_id", user.id),
    supabase.from("post_reports").select("post_id").eq("reporter_id", user.id),
  ]);

  if (notInterestedRes.error) {
    console.warn(
      "[feedModeration] fetchMyHiddenPostIds not_interested",
      notInterestedRes.error.message
    );
  }
  if (reportsRes.error) {
    console.warn(
      "[feedModeration] fetchMyHiddenPostIds reports",
      reportsRes.error.message
    );
  }

  const ids = new Set<string>();
  for (const row of notInterestedRes.data ?? []) {
    if (typeof row.post_id === "string") {
      ids.add(row.post_id);
    }
  }
  for (const row of reportsRes.data ?? []) {
    if (typeof row.post_id === "string") {
      ids.add(row.post_id);
    }
  }
  return [...ids];
}

export async function fetchFeedMuteSets(): Promise<FeedMuteSets> {
  const [blockedProfileIds, hiddenPostIds] = await Promise.all([
    fetchMyBlockedProfileIds(),
    fetchMyHiddenPostIds(),
  ]);
  return {
    blockedProfileIds: new Set(blockedProfileIds),
    hiddenPostIds: new Set(hiddenPostIds),
  };
}

export {
  filterFeedPostsByMuteSets,
  shouldMuteFeedPost,
  type FeedMuteSets,
} from "../utils/feedMuteFilter";
