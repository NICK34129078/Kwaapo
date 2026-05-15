import { useCallback, useState } from "react";
import { Alert } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as VideoThumbnails from "expo-video-thumbnails";
import { useAuth } from "../context/AuthContext";
import { useAuthPrompt } from "../context/AuthPromptContext";
import { useGlobalFeed } from "../context/GlobalFeedContext";
import { useUserUploads } from "../context/UserUploadsContext";
import { CLOUD_VIDEO_WORKER_BASE, UPLOADED_VIDEO_OWNER } from "../constants/cloudVideo";
import { userVideoPostFromPostRow, type PostRow } from "../services/postsService";
import type { UserVideoPost } from "../types/userVideoPost";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { parseHashtagInput } from "../utils/hashtags";
import { sanitizeUploadCaption } from "../utils/uploadCaption";
import { createUuidV4 } from "../utils/uuid";

/** Waarschuwing bij zeer grote bestanden; geen harde blokkade (direct PUT naar R2). */
const LARGE_VIDEO_WARN_BYTES = 300 * 1024 * 1024;

const MAX_VIDEO_DURATION_MS = 30_000;
const VIDEO_TOO_LONG_MESSAGE = "Video mag maximaal 30 seconden duren.";

const UPLOAD_INIT_TIMEOUT_MS = 30_000;
const VIDEO_PUT_TIMEOUT_MS = 300_000;
const UPLOAD_COMPLETE_TIMEOUT_MS = 30_000;

const UPLOAD_INIT_TIMEOUT_MESSAGE = "Kon upload niet starten. Probeer opnieuw.";
const VIDEO_PUT_TIMEOUT_MESSAGE =
  "Upload duurde te lang. Probeer een kortere video of betere verbinding.";
const UPLOAD_COMPLETE_TIMEOUT_MESSAGE = "Kon upload niet afronden. Probeer opnieuw.";

async function launchVideoImagePickerAsync(): Promise<ImagePicker.ImagePickerResult> {
  return ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Videos,
    allowsEditing: false,
    quality: 0.6,
    videoMaxDuration: 30,
  });
}

type PickedVideoAsset = ImagePicker.ImagePickerAsset;

function normalizeDurationMs(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return null;
  }
  return Math.round(raw > 1000 ? raw : raw * 1000);
}

function assertVideoMaxDuration(asset: PickedVideoAsset): void {
  const durationMs = normalizeDurationMs(asset.duration);
  if (durationMs == null) {
    return;
  }
  if (durationMs > MAX_VIDEO_DURATION_MS) {
    throw new Error(VIDEO_TOO_LONG_MESSAGE);
  }
}

function warnIfVeryLargeVideo(asset: PickedVideoAsset): void {
  const fileSize =
    typeof asset.fileSize === "number" && Number.isFinite(asset.fileSize)
      ? asset.fileSize
      : null;
  if (fileSize != null && fileSize > LARGE_VIDEO_WARN_BYTES) {
    Alert.alert(
      "Grote video",
      "Deze video is erg groot. De upload kan langer duren op een mobiele verbinding."
    );
  }
}

function videoMimeType(asset: PickedVideoAsset): string {
  if (typeof asset.mimeType === "string" && asset.mimeType.length > 0) {
    return asset.mimeType;
  }
  const name = asset.fileName ?? "";
  if (/\.mov$/i.test(name)) {
    return "video/quicktime";
  }
  return "video/mp4";
}

export type PickUploadOptions = {
  hashtagsRaw?: string;
  caption?: string;
};

type UploadInitJson = {
  success?: boolean;
  message?: string;
  uploadUrl?: string;
  r2Key?: string;
  publicVideoUrl?: string;
  postId?: string;
};

type UploadCompleteJson = {
  success?: boolean;
  message?: string;
  hint?: string;
  post?: PostRow;
  createdPost?: PostRow;
  fileName?: string;
  videoUrl?: string;
  thumbnailUrl?: string | null;
  r2Key?: string;
};

type ThumbnailUploadJson = {
  success?: boolean;
  message?: string;
  thumbnailUrl?: string;
};

function uploadErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return "De upload kon niet worden voltooid.";
}

function workerErrorFromJson(
  status: number,
  data: { message?: string; hint?: string },
  bodyText: string
): string {
  if (typeof data.message === "string" && data.message.length > 0) {
    return data.hint ? `${data.message} (${data.hint})` : data.message;
  }
  const trimmed = bodyText.trim();
  if (trimmed.length > 0 && trimmed.length <= 600) {
    return trimmed;
  }
  return `Upload mislukt (${status})`;
}

async function postWorkerJson<T extends { success?: boolean; message?: string }>(
  url: string,
  body: Record<string, unknown>,
  userId: string,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-App-User-Id": userId,
      },
      body: JSON.stringify(body),
    },
    timeoutMs,
    timeoutMessage
  );
  const bodyText = await response.text();
  let data = {} as T;
  if (bodyText.length > 0) {
    try {
      data = JSON.parse(bodyText) as T;
    } catch {
      /* geen JSON */
    }
  }
  if (!response.ok) {
    throw new Error(
      workerErrorFromJson(response.status, data, bodyText)
    );
  }
  if (data.success === false) {
    throw new Error(
      typeof data.message === "string" && data.message.length > 0
        ? data.message
        : "Upload was niet succesvol."
    );
  }
  return data;
}

async function putVideoDirectToR2(
  uploadUrl: string,
  localUri: string,
  videoMime: string,
  userId: string
): Promise<void> {
  await Promise.race([
    (async () => {
      const result = await FileSystem.uploadAsync(uploadUrl, localUri, {
        httpMethod: "PUT",
        headers: {
          "Content-Type": videoMime,
          "X-App-User-Id": userId,
        },
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      });
      if (result.status < 200 || result.status >= 300) {
        let msg = `Video-upload mislukt (${result.status})`;
        if (result.body && result.body.length > 0) {
          try {
            const parsed = JSON.parse(result.body) as { message?: string };
            if (parsed.message) {
              msg = parsed.message;
            }
          } catch {
            if (result.body.length <= 400) {
              msg = result.body;
            }
          }
        }
        throw new Error(msg);
      }
    })(),
    new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error(VIDEO_PUT_TIMEOUT_MESSAGE)), VIDEO_PUT_TIMEOUT_MS);
    }),
  ]);
}

async function uploadThumbnailOptional(
  thumbnailUri: string,
  userId: string,
  postId: string
): Promise<string | null> {
  const url = `${CLOUD_VIDEO_WORKER_BASE}?uploadThumbnail=1`;
  const formData = new FormData();
  formData.append("thumbnail", {
    uri: thumbnailUri,
    name: `thumb-${Date.now()}.jpg`,
    type: "image/jpeg",
  } as any);

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "X-App-User-Id": userId,
        "X-Post-Id": postId,
      },
      body: formData,
    },
    UPLOAD_INIT_TIMEOUT_MS,
    UPLOAD_INIT_TIMEOUT_MESSAGE
  );

  const bodyText = await response.text();
  let data: ThumbnailUploadJson = {};
  if (bodyText.length > 0) {
    try {
      data = JSON.parse(bodyText) as ThumbnailUploadJson;
    } catch {
      /* ignore */
    }
  }
  if (!response.ok || !data.success) {
    return null;
  }
  return typeof data.thumbnailUrl === "string" && data.thumbnailUrl.length > 0
    ? data.thumbnailUrl
    : null;
}

export function useCloudVideoUpload() {
  const { user } = useAuth();
  const { openAuthPrompt } = useAuthPrompt();
  const { refreshGlobalFeed } = useGlobalFeed();
  const { addUserVideoPost, refreshUserVideoPosts } = useUserUploads();
  const [isUploading, setIsUploading] = useState(false);

  const pickAndUploadVideo = useCallback(async (options?: PickUploadOptions) => {
    const uploadUserId = user?.id;
    if (!uploadUserId) {
      openAuthPrompt({
        message: "Log in of registreer om een video te uploaden.",
      });
      return;
    }

    setIsUploading(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Toegang nodig",
          "Sta toegang tot je fotobibliotheek toe om een video te uploaden."
        );
        return;
      }

      const result = await launchVideoImagePickerAsync();
      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];
      if (!asset?.uri) {
        Alert.alert("Geen video", "Kon de geselecteerde video niet lezen.");
        return;
      }

      assertVideoMaxDuration(asset);
      warnIfVeryLargeVideo(asset);

      const localUri = asset.uri;
      const uploadFileName =
        asset.fileName && asset.fileName.length > 0
          ? asset.fileName
          : `video-${Date.now()}.mp4`;
      const videoMime = videoMimeType(asset);
      const parsedTags = parseHashtagInput(options?.hashtagsRaw ?? "");
      const captionForPost = sanitizeUploadCaption(options?.caption);
      const clientPostId = createUuidV4();

      const initData = await postWorkerJson<UploadInitJson>(
        `${CLOUD_VIDEO_WORKER_BASE}?uploadInit=1`,
        {
          postId: clientPostId,
          userId: uploadUserId,
          fileName: uploadFileName,
          contentType: videoMime,
          tags: parsedTags,
          caption: captionForPost,
        },
        uploadUserId,
        UPLOAD_INIT_TIMEOUT_MS,
        UPLOAD_INIT_TIMEOUT_MESSAGE
      );

      const uploadUrl = initData.uploadUrl;
      const r2Key = initData.r2Key;
      const publicVideoUrl = initData.publicVideoUrl;
      if (!uploadUrl || !r2Key || !publicVideoUrl) {
        throw new Error("Server gaf geen upload-URL terug.");
      }

      await putVideoDirectToR2(uploadUrl, localUri, videoMime, uploadUserId);

      let thumbnailUrl: string | null = null;
      const thumbTimeMs =
        typeof asset.duration === "number" && asset.duration > 0
          ? Math.min(1000, Math.round(normalizeDurationMs(asset.duration) ?? 1000))
          : 1000;
      try {
        const thumbnail = await VideoThumbnails.getThumbnailAsync(localUri, {
          time: thumbTimeMs,
          quality: 0.7,
        });
        if (thumbnail?.uri) {
          thumbnailUrl = await uploadThumbnailOptional(
            thumbnail.uri,
            uploadUserId,
            clientPostId
          );
        }
      } catch {
        /* thumbnail optioneel */
      }

      const completeData = await postWorkerJson<UploadCompleteJson>(
        `${CLOUD_VIDEO_WORKER_BASE}?uploadComplete=1`,
        {
          postId: clientPostId,
          userId: uploadUserId,
          r2Key,
          videoUrl: publicVideoUrl,
          thumbnailUrl,
          tags: parsedTags,
          caption: captionForPost,
        },
        uploadUserId,
        UPLOAD_COMPLETE_TIMEOUT_MS,
        UPLOAD_COMPLETE_TIMEOUT_MESSAGE
      );

      const serverPost = completeData.post ?? completeData.createdPost;
      const name = completeData.fileName ?? r2Key;
      const videoUrlFromServer =
        typeof completeData.videoUrl === "string" && completeData.videoUrl.length > 0
          ? completeData.videoUrl
          : publicVideoUrl;

      let final: UserVideoPost;
      if (serverPost && typeof serverPost.id === "string" && serverPost.id.length > 0) {
        final = userVideoPostFromPostRow(serverPost);
      } else {
        const fallbackRow: PostRow = {
          id: clientPostId,
          user_id: uploadUserId,
          type: "video",
          video_url: videoUrlFromServer,
          r2_key: r2Key,
          thumbnail_url: thumbnailUrl,
          filename: name,
          caption: captionForPost,
          likes_count: 0,
          comments_count: 0,
          created_at: new Date().toISOString(),
          is_deleted: false,
          ...(parsedTags.length > 0 ? { tags: parsedTags } : {}),
        };
        final = userVideoPostFromPostRow(fallbackRow);
      }

      addUserVideoPost(final);
      try {
        await refreshUserVideoPosts();
      } catch {
        /* upload gelukt */
      }
      try {
        await refreshGlobalFeed();
      } catch {
        /* idem */
      }

      Alert.alert(
        "Upload gelukt",
        name ? `Je video is geplaatst.` : "Je video is geüpload."
      );
    } catch (error) {
      Alert.alert("Upload mislukt", uploadErrorMessage(error));
    } finally {
      setIsUploading(false);
    }
  }, [
    user?.id,
    openAuthPrompt,
    refreshGlobalFeed,
    addUserVideoPost,
    refreshUserVideoPosts,
  ]);

  return { isUploading, pickAndUploadVideo };
}
