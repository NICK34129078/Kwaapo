import type { FeedPost } from "../data/placeholder";

/**
 * Eén geüpload video object voor profiel + reels (R2 = bestand, Supabase = metadata).
 */
export type UserVideoPost = FeedPost & {
  type: "video";
  videoUrl: string;
  /**
   * Temporary debug fallback:
   * local device file URI used when remote Worker URL fails to play.
   */
  localVideoUri?: string;
};

export function isUserVideoPost(
  p: FeedPost
): p is UserVideoPost {
  return p.type === "video" && typeof p.videoUrl === "string" && p.videoUrl.length > 0;
}
