import { supabase } from "../lib/supabase";
import {
  fetchIncomingPendingFollowRequests,
  fetchOutgoingAcceptedFollowRequests,
} from "./followRequestService";
import type { ActivityFeedItem, ProfileRow } from "../types/activity";
import { buildActivityKey } from "../utils/activityKeys";

const ID_BATCH = 80;

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

async function fetchProfilesByIds(ids: string[]): Promise<Map<string, ProfileRow>> {
  const unique = [...new Set(ids.filter((id) => id.length > 0))];
  const map = new Map<string, ProfileRow>();
  if (unique.length === 0) {
    return map;
  }

  for (let i = 0; i < unique.length; i += ID_BATCH) {
    const slice = unique.slice(i, i + ID_BATCH);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", slice);

    if (error) {
      throw error;
    }
    for (const p of (data ?? []) as ProfileRow[]) {
      map.set(p.id, p);
    }
  }
  return map;
}

async function fetchPostThumbnailsByIds(
  postIds: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(postIds.filter((id) => id.length > 0))];
  const map = new Map<string, string>();
  if (unique.length === 0) {
    return map;
  }

  for (let i = 0; i < unique.length; i += ID_BATCH) {
    const slice = unique.slice(i, i + ID_BATCH);
    const { data, error } = await supabase
      .from("posts")
      .select("id, thumbnail_url")
      .in("id", slice)
      .eq("is_deleted", false);

    if (error) {
      throw error;
    }

    for (const row of (data ?? []) as {
      id: string;
      thumbnail_url: string | null;
    }[]) {
      const url = row.thumbnail_url?.trim();
      if (url && url.length > 0) {
        map.set(row.id, url);
      }
    }
  }

  return map;
}

type SocialPart = Omit<ActivityFeedItem, "profile" | "activityKey" | "isUnread">;

async function fetchFollowActivities(userId: string): Promise<SocialPart[]> {
  const { data, error } = await supabase
    .from("follows")
    .select("follower_id, created_at")
    .eq("following_id", userId)
    .neq("follower_id", userId)
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    throw error;
  }

  return ((data ?? []) as { follower_id: string; created_at: string }[]).map(
    (r) => ({
      kind: "follow" as const,
      created_at: r.created_at,
      actorId: r.follower_id,
    })
  );
}

async function fetchLikeActivities(userId: string): Promise<SocialPart[]> {
  const postIds = await fetchOwnPostIds(userId);
  if (postIds.length === 0) {
    return [];
  }

  type LikeRow = { post_id: string; user_id: string; created_at: string };
  const collected: LikeRow[] = [];

  for (let i = 0; i < postIds.length; i += ID_BATCH) {
    const slice = postIds.slice(i, i + ID_BATCH);
    const { data, error } = await supabase
      .from("post_likes")
      .select("post_id, user_id, created_at")
      .in("post_id", slice)
      .neq("user_id", userId);

    if (error) {
      throw error;
    }
    for (const row of (data ?? []) as LikeRow[]) {
      if (row.user_id !== userId) {
        collected.push(row);
      }
    }
  }

  collected.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return collected.slice(0, 100).map((r) => ({
    kind: "like" as const,
    created_at: r.created_at,
    actorId: r.user_id,
    postId: r.post_id,
  }));
}

async function fetchCommentActivities(userId: string): Promise<SocialPart[]> {
  const postIds = await fetchOwnPostIds(userId);
  if (postIds.length === 0) {
    return [];
  }

  type CommentRow = {
    id: string;
    post_id: string;
    user_id: string;
    body: string;
    created_at: string;
  };
  const collected: CommentRow[] = [];

  for (let i = 0; i < postIds.length; i += ID_BATCH) {
    const slice = postIds.slice(i, i + ID_BATCH);
    const { data, error } = await supabase
      .from("post_comments")
      .select("id, post_id, user_id, body, created_at")
      .in("post_id", slice)
      .eq("is_deleted", false)
      .neq("user_id", userId);

    if (error) {
      throw error;
    }
    for (const row of (data ?? []) as CommentRow[]) {
      if (row.user_id !== userId) {
        collected.push(row);
      }
    }
  }

  collected.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return collected.slice(0, 50).map((r) => ({
    kind: "comment" as const,
    created_at: r.created_at,
    actorId: r.user_id,
    postId: r.post_id,
    commentId: r.id,
    commentBody: r.body,
  }));
}

async function fetchFollowRequestActivities(): Promise<ActivityFeedItem[]> {
  const requests = await fetchIncomingPendingFollowRequests();
  return requests.map((request) => {
    const part = {
      kind: "follow_request" as const,
      created_at: request.created_at,
      actorId: request.requester_id,
      followRequestId: request.id,
      profile: {
        id: request.requester.id,
        username: request.requester.username,
        display_name: request.requester.display_name,
        avatar_url: request.requester.avatar_url,
      },
    };
    const activityKey = buildActivityKey(part);
    return {
      ...part,
      activityKey,
      isUnread: true,
    };
  });
}

async function fetchFollowRequestAcceptedActivities(): Promise<ActivityFeedItem[]> {
  const requests = await fetchOutgoingAcceptedFollowRequests();
  return requests.map((request) => {
    const part = {
      kind: "follow_request_accepted" as const,
      created_at: request.accepted_at,
      actorId: request.recipient_id,
      followRequestId: request.id,
      profile: {
        id: request.recipient.id,
        username: request.recipient.username,
        display_name: request.recipient.display_name,
        avatar_url: request.recipient.avatar_url,
      },
    };
    const activityKey = buildActivityKey(part);
    return {
      ...part,
      activityKey,
      isUnread: true,
    };
  });
}

export async function fetchSocialActivityFeed(
  userId: string,
  readKeys: Set<string>
): Promise<ActivityFeedItem[]> {
  const [followRequestItems, followRequestAcceptedItems, followParts, likeParts, commentParts] =
    await Promise.all([
      fetchFollowRequestActivities(),
      fetchFollowRequestAcceptedActivities(),
      fetchFollowActivities(userId),
      fetchLikeActivities(userId),
      fetchCommentActivities(userId).catch((e) => {
        console.warn("[activityFeedService] comments failed", e);
        return [] as SocialPart[];
      }),
    ]);

  const followRequestWithRead = followRequestItems.map((item) => ({
    ...item,
    isUnread: !readKeys.has(item.activityKey),
  }));
  const followRequestAcceptedWithRead = followRequestAcceptedItems.map((item) => ({
    ...item,
    isUnread: !readKeys.has(item.activityKey),
  }));

  const actorIds = [
    ...followParts.map((r) => r.actorId),
    ...likeParts.map((r) => r.actorId),
    ...commentParts.map((r) => r.actorId),
  ];

  const thumbPostIds = [...likeParts, ...commentParts]
    .map((r) => r.postId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const [profiles, postThumbnails] = await Promise.all([
    fetchProfilesByIds(actorIds),
    fetchPostThumbnailsByIds(thumbPostIds),
  ]);

  const raw = [...followParts, ...likeParts, ...commentParts];
  const socialItems: ActivityFeedItem[] = [
    ...followRequestWithRead,
    ...followRequestAcceptedWithRead,
  ];

  for (const part of raw) {
    const profile = profiles.get(part.actorId);
    if (!profile) {
      continue;
    }
    const thumb =
      (part.kind === "like" || part.kind === "comment") && part.postId
        ? postThumbnails.get(part.postId)
        : undefined;
    const base = {
      ...part,
      profile,
      ...(thumb ? { postThumbnailUrl: thumb } : {}),
    };
    const activityKey = buildActivityKey(base);
    socialItems.push({
      ...base,
      activityKey,
      isUnread: !readKeys.has(activityKey),
    });
  }

  socialItems.sort((a, b) => {
    const priority = (item: ActivityFeedItem) => {
      if (item.kind === "follow_request") {
        return 0;
      }
      return 1;
    };
    const aPriority = priority(a);
    const bPriority = priority(b);
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return socialItems;
}

export function countUnreadSocialItems(items: ActivityFeedItem[]): number {
  return items.filter((item) => item.isUnread).length;
}
