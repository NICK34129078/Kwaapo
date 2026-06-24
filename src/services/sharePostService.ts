import { Platform, Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import type { FeedPost } from "../data/placeholder";
import { isVideoReelItem } from "../data/placeholder";
import {
  APP_SCHEME,
  PUBLIC_SHARE_BASE,
  SHARE_BRAND_NAME,
} from "../constants/shareLinks";
import { recordPostShare } from "./postSharesService";

export type ShareTarget = "system_share";

export type ShareResult = {
  success: boolean;
  usedFallback?: boolean;
  cancelled?: boolean;
};

const mediaCache = new Map<string, string>();
const MAX_VIDEO_BYTES = 48 * 1024 * 1024;

export function buildPublicPostShareUrl(post: Pick<FeedPost, "id">): string {
  return `${PUBLIC_SHARE_BASE}/post/${post.id}`;
}

export function buildPostDeepLink(post: Pick<FeedPost, "id">): string {
  return `${APP_SCHEME}://post/${post.id}`;
}

export function resolvePostUsername(post: FeedPost): string {
  const raw =
    post.ownerUsername?.trim() ||
    post.username.replace(/^@/, "").trim() ||
    post.owner?.replace(/^@/, "").trim() ||
    "";
  return raw.length > 0 ? raw : "gebruiker";
}

export function buildShareMessage(post: FeedPost): string {
  const handle = resolvePostUsername(post);
  return `Bekijk deze reel van @${handle} op ${SHARE_BRAND_NAME}\n${buildPublicPostShareUrl(post)}`;
}

function resolvePrimaryMedia(
  post: FeedPost
): { url: string; kind: "video" | "image" } | null {
  if (isVideoReelItem(post)) {
    return { url: post.videoUrl, kind: "video" };
  }
  const first = post.mediaItems?.[0];
  if (first?.url) {
    return {
      url: first.url,
      kind: first.mediaType === "video" ? "video" : "image",
    };
  }
  if (post.imageUrl && post.imageUrl.length > 0) {
    return { url: post.imageUrl, kind: "image" };
  }
  return null;
}

async function prepareShareableFileUri(post: FeedPost): Promise<string | null> {
  if (Platform.OS === "web") {
    return null;
  }

  const media = resolvePrimaryMedia(post);
  if (!media?.url) {
    return null;
  }

  const cached = mediaCache.get(media.url);
  if (cached) {
    const info = await FileSystem.getInfoAsync(cached);
    if (info.exists) {
      return cached;
    }
    mediaCache.delete(media.url);
  }

  try {
    const ext = media.kind === "video" ? "mp4" : "jpg";
    const dest = `${FileSystem.cacheDirectory ?? ""}share-${post.id}.${ext}`;
    if (!dest || dest.length <= ext.length) {
      return null;
    }

    const download = await FileSystem.downloadAsync(media.url, dest);
    if (!download.uri) {
      return null;
    }

    if (media.kind === "video") {
      const info = await FileSystem.getInfoAsync(download.uri);
      const size =
        info.exists && "size" in info && typeof info.size === "number"
          ? info.size
          : 0;
      if (size > MAX_VIDEO_BYTES) {
        await FileSystem.deleteAsync(download.uri, { idempotent: true });
        return null;
      }
    }

    mediaCache.set(media.url, download.uri);
    return download.uri;
  } catch {
    return null;
  }
}

async function runNativeShareSheet(
  message: string,
  publicUrl: string,
  fileUri: string | null
): Promise<ShareResult> {
  if (Platform.OS === "web") {
    const webNav = navigator as Navigator & {
      share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
    };
    if (typeof webNav.share === "function") {
      try {
        await webNav.share({
          title: SHARE_BRAND_NAME,
          text: message,
          url: publicUrl,
        });
        return { success: true };
      } catch (e) {
        const err = e as { name?: string };
        if (err.name === "AbortError") {
          return { success: false, cancelled: true };
        }
      }
    }
    await Clipboard.setStringAsync(publicUrl);
    return { success: true, usedFallback: true };
  }

  if (fileUri && (await Sharing.isAvailableAsync())) {
    try {
      const isVideo = fileUri.endsWith(".mp4");
      await Sharing.shareAsync(fileUri, {
        mimeType: isVideo ? "video/mp4" : "image/jpeg",
        dialogTitle: "Deel deze reel",
        UTI: isVideo ? "public.mpeg-4" : "public.jpeg",
      });
      return { success: true };
    } catch (e) {
      const err = e as { message?: string };
      if (err?.message?.toLowerCase().includes("cancel")) {
        return { success: false, cancelled: true };
      }
    }
  }

  try {
    const payload =
      Platform.OS === "ios"
        ? {
            message,
            url: fileUri ?? publicUrl,
          }
        : {
            message,
            title: "Deel deze reel",
          };
    const result = await Share.share(payload);
    if (result.action === Share.dismissedAction) {
      return { success: false, cancelled: true };
    }
    return { success: true };
  } catch (e) {
    const err = e as { message?: string };
    if (err?.message?.toLowerCase().includes("cancel")) {
      return { success: false, cancelled: true };
    }
    await Clipboard.setStringAsync(publicUrl);
    return { success: true, usedFallback: true };
  }
}

/**
 * Opent direct het native iOS/Android share-sheet voor de huidige post.
 * Probeert video/afbeelding mee te geven; bij falen valt het terug op post-link + tekst.
 */
export async function sharePostNative(
  post: FeedPost,
  options?: { userId?: string | null }
): Promise<ShareResult> {
  const message = buildShareMessage(post);
  const publicUrl = buildPublicPostShareUrl(post);
  const fileUri = await prepareShareableFileUri(post);
  const result = await runNativeShareSheet(message, publicUrl, fileUri);

  if (result.success) {
    await recordPostShare(post.id, "system_share", options?.userId ?? null);
  }

  return result;
}
