export type ActivityKind =
  | "follow"
  | "follow_request"
  | "follow_request_accepted"
  | "like"
  | "comment";

export type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type ActivityFeedItem = {
  kind: ActivityKind;
  created_at: string;
  actorId: string;
  profile: ProfileRow;
  activityKey: string;
  isUnread: boolean;
  postId?: string;
  postThumbnailUrl?: string;
  commentBody?: string;
  commentId?: string;
  followRequestId?: string;
};

export type ActivitySection = "activity" | "orders";
