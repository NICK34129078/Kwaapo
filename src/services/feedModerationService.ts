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

export type BlockedUserEntry = {
  blockedId: string;
  blockedAt: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

type BlockedProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

const PROFILE_ID_BATCH = 80;

async function fetchBlockedUserProfiles(
  profileIds: string[]
): Promise<Map<string, BlockedProfileRow>> {
  const unique = [...new Set(profileIds.filter((id) => id.length > 0))];
  const map = new Map<string, BlockedProfileRow>();
  if (unique.length === 0) {
    return map;
  }

  for (let i = 0; i < unique.length; i += PROFILE_ID_BATCH) {
    const slice = unique.slice(i, i + PROFILE_ID_BATCH);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", slice);

    if (error) {
      throw new Error(
        getReadableErrorMessage(error, "Profielen laden mislukt.")
      );
    }

    for (const row of (data ?? []) as BlockedProfileRow[]) {
      map.set(row.id, row);
    }
  }

  return map;
}

/** Geblokkeerde gebruikers met profielgegevens (alleen eigen blocks, via RLS). */
export async function fetchMyBlockedUsers(): Promise<BlockedUserEntry[]> {
  if (__DEV__) {
    console.log("[BlockedUsers] loading started");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    if (__DEV__) {
      console.log("[BlockedUsers] loaded 0");
    }
    return [];
  }

  const { data, error } = await supabase
    .from("user_blocks")
    .select("blocked_id, created_at")
    .eq("blocker_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    if (__DEV__) {
      console.log("[BlockedUsers] error load_blocks", error.message);
    }
    throw new Error(
      getReadableErrorMessage(error, "Geblokkeerde gebruikers laden mislukt.")
    );
  }

  const rows = (data ?? []).filter(
    (row): row is { blocked_id: string; created_at: string } =>
      typeof row.blocked_id === "string" && row.blocked_id.length > 0
  );

  const seen = new Set<string>();
  const uniqueRows = rows.filter((row) => {
    if (seen.has(row.blocked_id)) {
      return false;
    }
    seen.add(row.blocked_id);
    return true;
  });

  const profilesById = await fetchBlockedUserProfiles(
    uniqueRows.map((row) => row.blocked_id)
  );

  const entries: BlockedUserEntry[] = uniqueRows.map((row) => {
    const profile = profilesById.get(row.blocked_id);
    return {
      blockedId: row.blocked_id,
      blockedAt: row.created_at,
      username: profile?.username ?? null,
      displayName: profile?.display_name ?? null,
      avatarUrl: profile?.avatar_url ?? null,
    };
  });

  if (__DEV__) {
    console.log(`[BlockedUsers] loaded ${entries.length}`);
  }

  return entries;
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
