import { useCallback, useState } from "react";
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../context/AuthContext";
import { useAuthPrompt } from "../context/AuthPromptContext";
import { useGlobalFeed } from "../context/GlobalFeedContext";
import { useUserUploads } from "../context/UserUploadsContext";
import { CLOUD_VIDEO_WORKER_BASE } from "../constants/cloudVideo";
import { userVideoPostFromPostRow, type PostRow } from "../services/postsService";
import type { ProfilePostMediaItem } from "../types/userVideoPost";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { parseHashtagInput } from "../utils/hashtags";
import { sanitizeUploadCaption } from "../utils/uploadCaption";
import { createUuidV4 } from "../utils/uuid";

const MAX_IMAGES = 10;
const CAROUSEL_UPLOAD_TIMEOUT_MS = 600_000;

type CarouselUploadJson = {
  success?: boolean;
  message?: string;
  hint?: string;
  post?: PostRow;
  media?: Array<{
    id?: string;
    url?: string;
    r2_key?: string | null;
    sort_order?: number | null;
    media_type?: string | null;
  }>;
};

function mediaFromWorkerJson(
  media: CarouselUploadJson["media"]
): ProfilePostMediaItem[] {
  if (!Array.isArray(media) || media.length === 0) {
    return [];
  }
  return media
    .map((m, i) => ({
      url: typeof m.url === "string" ? m.url : "",
      mediaType: (m.media_type === "video" ? "video" : "image") as "image" | "video",
      sortOrder: typeof m.sort_order === "number" ? m.sort_order : i,
    }))
    .filter((m) => m.url.length > 0);
}

function uploadErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return "De upload kon niet worden voltooid.";
}

export type PickCarouselOptions = {
  hashtagsRaw?: string;
  caption?: string;
};

export function useCloudImageCarouselUpload() {
  const { user } = useAuth();
  const { openAuthPrompt } = useAuthPrompt();
  const { refreshGlobalFeed } = useGlobalFeed();
  const { addUserVideoPost, refreshUserVideoPosts } = useUserUploads();
  const [isUploading, setIsUploading] = useState(false);

  const pickAndUploadCarousel = useCallback(
    async (options?: PickCarouselOptions) => {
      const uploadUserId = user?.id;
      if (!uploadUserId) {
        openAuthPrompt({
          message: "Log in of registreer om foto’s te uploaden.",
        });
        return;
      }

      setIsUploading(true);
      try {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            "Toegang nodig",
            "Sta toegang tot je fotobibliotheek toe om foto’s te selecteren."
          );
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsMultipleSelection: true,
          quality: 0.9,
        });

        if (result.canceled) {
          return;
        }
        const picked = (result.assets ?? [])
          .filter((a) => a?.uri)
          .slice(0, MAX_IMAGES);
        if (picked.length === 0) {
          return;
        }

        const clientPostId = createUuidV4();
        const parsedTags = parseHashtagInput(options?.hashtagsRaw ?? "");
        const captionForPost = sanitizeUploadCaption(options?.caption);
        const uploadUrl = `${CLOUD_VIDEO_WORKER_BASE}?userId=${encodeURIComponent(uploadUserId)}`;
        const formData = new FormData();
        formData.append("uploadType", "image_carousel");
        formData.append("tags", JSON.stringify(parsedTags));
        formData.append("caption", captionForPost);
        for (let i = 0; i < picked.length; i++) {
          const a = picked[i]!;
          const name =
            a.fileName && a.fileName.length > 0
              ? a.fileName
              : `photo-${Date.now()}-${i}.jpg`;
          const mime =
            "mimeType" in a &&
            typeof (a as { mimeType?: string }).mimeType === "string" &&
            (a as { mimeType: string }).mimeType.length > 0
              ? (a as { mimeType: string }).mimeType
              : "image/jpeg";
          formData.append("images", {
            uri: a.uri,
            name,
            type: mime,
          } as any);
        }

        const response = await fetchWithTimeout(
          uploadUrl,
          {
            method: "POST",
            headers: {
              "X-App-User-Id": uploadUserId,
              "X-Post-Id": clientPostId,
            },
            body: formData,
          },
          CAROUSEL_UPLOAD_TIMEOUT_MS
        );

        let data: CarouselUploadJson = {};
        try {
          data = (await response.json()) as CarouselUploadJson;
        } catch {
          /* ignore */
        }

        if (!response.ok) {
          const msg =
            typeof data.message === "string" && data.message.length > 0
              ? data.message
              : `Upload mislukt (${response.status})`;
          throw new Error(data.hint ? `${msg} (${data.hint})` : msg);
        }

        if (!data.success) {
          const msg =
            typeof data.message === "string" && data.message.length > 0
              ? data.message
              : "Upload was niet succesvol.";
          throw new Error(data.hint ? `${msg} (${data.hint})` : msg);
        }

        const serverPost = data.post;
        if (!serverPost || typeof serverPost.id !== "string") {
          throw new Error("Server gaf geen post terug.");
        }

        const mediaItems = mediaFromWorkerJson(data.media);
        const final = userVideoPostFromPostRow(serverPost as PostRow, mediaItems);

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

        Alert.alert("Upload gelukt", "Je fotoserie is geplaatst.");
      } catch (error) {
        Alert.alert("Upload mislukt", uploadErrorMessage(error));
      } finally {
        setIsUploading(false);
      }
    },
    [user?.id, openAuthPrompt, refreshGlobalFeed, addUserVideoPost, refreshUserVideoPosts]
  );

  return { isUploading, pickAndUploadCarousel };
}
