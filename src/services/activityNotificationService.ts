import AsyncStorage from "@react-native-async-storage/async-storage";

import { supabase } from "../lib/supabase";

const LAST_SEEN_KEY = "kwaapo:activity_last_seen_at";
const ID_BATCH = 80;

export type ActivityToastKind = "like" | "comment";

export type ActivityToastPayload = {
  id: string;
  kind: ActivityToastKind;
  actorLabel: string;
  message: string;
};

type ProfileBrief = {
  username: string | null;
  display_name: string | null;
};

async function fetchOwnPostIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("posts")
    .select("id")
    .eq("user_id", userId)
    .eq("is_deleted", false);

  if (error) {
    throw error;
  }

  return [
    ...new Set(
      ((data ?? []) as { id: string }[]).map((p) => p.id).filter(Boolean)
    ),
  ];
}

export async function getActivityLastSeenAt(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_SEEN_KEY);
}

export async function setActivityLastSeenAt(iso: string): Promise<void> {
  await AsyncStorage.setItem(LAST_SEEN_KEY, iso);
}

export async function markActivitySeenNow(): Promise<string> {
  const now = new Date().toISOString();
  await setActivityLastSeenAt(now);
  return now;
}

async function countLikesSince(
  userId: string,
  postIds: string[],
  sinceIso: string
): Promise<number> {
  let total = 0;
  for (let i = 0; i < postIds.length; i += ID_BATCH) {
    const slice = postIds.slice(i, i + ID_BATCH);
    const { count, error } = await supabase
      .from("post_likes")
      .select("post_id", { count: "exact", head: true })
      .in("post_id", slice)
      .neq("user_id", userId)
      .gt("created_at", sinceIso);

    if (error) {
      throw error;
    }
    total += count ?? 0;
  }
  return total;
}

async function countCommentsSince(
  userId: string,
  postIds: string[],
  sinceIso: string
): Promise<number> {
  let total = 0;
  for (let i = 0; i < postIds.length; i += ID_BATCH) {
    const slice = postIds.slice(i, i + ID_BATCH);
    const { count, error } = await supabase
      .from("post_comments")
      .select("post_id", { count: "exact", head: true })
      .in("post_id", slice)
      .eq("is_deleted", false)
      .neq("user_id", userId)
      .gt("created_at", sinceIso);

    if (error) {
      throw error;
    }
    total += count ?? 0;
  }
  return total;
}

export async function countUnreadActivitySince(
  userId: string,
  sinceIso: string
): Promise<number> {
  const postIds = await fetchOwnPostIds(userId);
  if (postIds.length === 0) {
    return 0;
  }

  const [likes, comments] = await Promise.all([
    countLikesSince(userId, postIds, sinceIso),
    countCommentsSince(userId, postIds, sinceIso),
  ]);

  return likes + comments;
}

async function fetchProfileBrief(userId: string): Promise<ProfileBrief | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("username, display_name")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return data as ProfileBrief;
}

function resolveActorLabel(profile: ProfileBrief | null): string {
  const display = profile?.display_name?.trim();
  if (display) {
    return display;
  }
  const uname = profile?.username?.trim();
  if (uname) {
    return uname.startsWith("@") ? uname : `@${uname}`;
  }
  return "Iemand";
}

export function buildActivityToastMessage(
  kind: ActivityToastKind,
  actorLabel: string
): string {
  if (kind === "comment") {
    return `${actorLabel} heeft een reactie achtergelaten`;
  }
  return `${actorLabel} vindt je post leuk`;
}

export async function resolveActivityToast(
  kind: ActivityToastKind,
  actorId: string
): Promise<ActivityToastPayload> {
  const profile = await fetchProfileBrief(actorId);
  const actorLabel = resolveActorLabel(profile);
  return {
    id: `${kind}-${actorId}-${Date.now()}`,
    kind,
    actorLabel,
    message: buildActivityToastMessage(kind, actorLabel),
  };
}

export async function fetchOwnPostIdSet(userId: string): Promise<Set<string>> {
  const ids = await fetchOwnPostIds(userId);
  return new Set(ids);
}

export function subscribeActivityNotifications(
  userId: string,
  onLike: (postId: string, actorId: string) => void,
  onComment: (postId: string, actorId: string) => void
): () => void {
  const channel = supabase
    .channel(`activity-notifications-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "post_comments",
      },
      (payload) => {
        const row = payload.new as {
          post_id?: string;
          user_id?: string;
          is_deleted?: boolean;
        };
        if (
          !row.post_id ||
          !row.user_id ||
          row.user_id === userId ||
          row.is_deleted
        ) {
          return;
        }
        onComment(row.post_id, row.user_id);
      }
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "post_likes",
      },
      (payload) => {
        const row = payload.new as {
          post_id?: string;
          user_id?: string;
        };
        if (!row.post_id || !row.user_id || row.user_id === userId) {
          return;
        }
        onLike(row.post_id, row.user_id);
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
