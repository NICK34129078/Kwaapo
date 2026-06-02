import { supabase } from "../lib/supabase";
import { isPersistablePostId } from "./postLikesService";

const COMMENT_BODY_MAX = 300;
const FETCH_LIMIT = 50;

export type PostComment = {
  id: string;
  postId: string;
  userId: string;
  body: string;
  createdAt: string;
  username?: string;
  avatarUrl?: string;
};

type CommentRow = {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

type ProfileRow = {
  id: string;
  username: string | null;
  avatar_url: string | null;
};

type AddCommentRpcResult = {
  success?: boolean;
  reason?: string;
  id?: string;
  post_id?: string;
  user_id?: string;
  body?: string;
  created_at?: string;
};

type DeleteCommentRpcResult = {
  success?: boolean;
  reason?: string;
  comment_id?: string;
  post_id?: string;
};

function deleteCommentErrorMessage(reason: string): string {
  switch (reason) {
    case "comment_not_found":
      return "Deze reactie bestaat niet meer.";
    case "not_owner":
      return "Je kunt alleen je eigen reacties verwijderen.";
    default:
      return "Reactie verwijderen mislukt.";
  }
}

async function fetchProfilesByIds(
  userIds: string[]
): Promise<Map<string, ProfileRow>> {
  const unique = [...new Set(userIds.filter((id) => id.length > 0))];
  const map = new Map<string, ProfileRow>();
  if (unique.length === 0) {
    return map;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, avatar_url")
    .in("id", unique);

  if (error) {
    throw error;
  }

  for (const row of (data ?? []) as ProfileRow[]) {
    map.set(row.id, row);
  }
  return map;
}

function mapCommentRow(
  row: CommentRow,
  profiles: Map<string, ProfileRow>
): PostComment {
  const profile = profiles.get(row.user_id);
  const username = profile?.username?.trim();
  return {
    id: row.id,
    postId: row.post_id,
    userId: row.user_id,
    body: row.body,
    createdAt: row.created_at,
    ...(username && username.length > 0 ? { username } : {}),
    ...(profile?.avatar_url ? { avatarUrl: profile.avatar_url } : {}),
  };
}

export async function fetchComments(postId: string): Promise<PostComment[]> {
  if (!isPersistablePostId(postId)) {
    return [];
  }

  const { data, error } = await supabase
    .from("post_comments")
    .select("id, post_id, user_id, body, created_at")
    .eq("post_id", postId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(FETCH_LIMIT);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as CommentRow[];
  const profiles = await fetchProfilesByIds(rows.map((r) => r.user_id));
  return rows.map((row) => mapCommentRow(row, profiles));
}

export async function addComment(
  postId: string,
  body: string
): Promise<PostComment> {
  if (!isPersistablePostId(postId)) {
    throw new Error("Ongeldige post.");
  }

  const trimmed = body.trim().slice(0, COMMENT_BODY_MAX);
  if (trimmed.length === 0) {
    throw new Error("Schrijf een reactie.");
  }

  const { data, error } = await supabase.rpc("add_post_comment", {
    p_post_id: postId,
    p_body: trimmed,
  });

  if (error) {
    throw new Error(error.message);
  }

  const result = (data ?? {}) as AddCommentRpcResult;
  if (result.success !== true || !result.id || !result.user_id) {
    const reason = result.reason ?? "unknown";
    if (reason === "empty_body") {
      throw new Error("Schrijf een reactie.");
    }
    if (reason === "post_not_found") {
      throw new Error("Deze post bestaat niet meer.");
    }
    throw new Error("Reactie plaatsen mislukt.");
  }

  const profiles = await fetchProfilesByIds([result.user_id]);
  const profile = profiles.get(result.user_id);

  return {
    id: result.id,
    postId: result.post_id ?? postId,
    userId: result.user_id,
    body: result.body ?? trimmed,
    createdAt: result.created_at ?? new Date().toISOString(),
    ...(profile?.username?.trim()
      ? { username: profile.username.trim() }
      : {}),
    ...(profile?.avatar_url ? { avatarUrl: profile.avatar_url } : {}),
  };
}

export async function deleteMyComment(
  commentId: string
): Promise<{ success: boolean; postId?: string }> {
  if (!isPersistablePostId(commentId)) {
    throw new Error("Ongeldige reactie.");
  }

  const { data, error } = await supabase.rpc("delete_my_comment", {
    p_comment_id: commentId,
  });

  if (error) {
    throw new Error(error.message);
  }

  const result = (data ?? {}) as DeleteCommentRpcResult;
  if (result.success !== true) {
    throw new Error(deleteCommentErrorMessage(result.reason ?? "unknown"));
  }

  return {
    success: true,
    postId: result.post_id,
  };
}
