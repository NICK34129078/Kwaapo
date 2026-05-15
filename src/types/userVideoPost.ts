import type { FeedPost } from "../data/placeholder";

export type ProfilePostMediaItem = {
  url: string;
  mediaType: "image" | "video";
  sortOrder: number;
};

/**
 * Profiel / feed: video-upload of foto-carousel (zelfde lijst als voorheen `UserVideoPost`).
 */
export type UserVideoPost = FeedPost & {
  type: "video" | "image_carousel";
  /** Alleen video-posts: publieke stream-URL. */
  videoUrl?: string;
  /** Carousel: gesorteerde media-URL's (optioneel tot Supabase `post_media` geladen is). */
  mediaItems?: ProfilePostMediaItem[];
  /**
   * Temporary debug fallback:
   * local device file URI used when remote Worker URL fails to play.
   */
  localVideoUri?: string;
};

export function isUserVideoPost(p: FeedPost): p is UserVideoPost {
  if (p.type === "video") {
    return typeof p.videoUrl === "string" && p.videoUrl.length > 0;
  }
  if (p.type === "image_carousel") {
    return true;
  }
  return false;
}
