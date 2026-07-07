import type { ActivityFeedItem } from "../types/activity";

export function buildActivityKey(
  item: Pick<
    ActivityFeedItem,
    | "kind"
    | "actorId"
    | "created_at"
    | "postId"
    | "followRequestId"
    | "commentId"
  >
): string {
  switch (item.kind) {
    case "follow":
      return `follow:${item.actorId}`;
    case "like":
      return `like:${item.postId ?? "unknown"}:${item.actorId}`;
    case "comment":
      return item.commentId
        ? `comment:${item.commentId}`
        : `comment:${item.postId ?? "unknown"}:${item.actorId}:${item.created_at}`;
    case "follow_request":
      return `follow_request:${item.followRequestId ?? item.actorId}`;
    case "follow_request_accepted":
      return `follow_request_accepted:${item.followRequestId ?? item.actorId}`;
    default:
      return `${item.kind}:${item.actorId}:${item.created_at}`;
  }
}
