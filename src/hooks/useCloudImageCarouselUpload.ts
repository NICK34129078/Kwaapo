import { useCallback, useState } from "react";
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../context/AuthContext";
import { useAuthPrompt } from "../context/AuthPromptContext";
import { useGlobalFeed } from "../context/GlobalFeedContext";
import { useUserUploads } from "../context/UserUploadsContext";
import { CLOUD_VIDEO_WORKER_BASE } from "../constants/cloudVideo";
import { buildWorkerAuthHeaders } from "../services/workerRequest";
import { userVideoPostFromPostRow, enrichPostWithLinkedProduct, type PostRow } from "../services/postsService";
import type { ProfilePostMediaItem } from "../types/userVideoPost";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { parseHashtagInput } from "../utils/hashtags";
import { sanitizeUploadCaption } from "../utils/uploadCaption";
import {
  sanitizeUploadProduct,
  type UploadProductInput,
} from "../utils/uploadProduct";
import { formatWorkerAuthClientError, formatWorkerUploadError } from "../utils/workerUploadErrors";
import { createUuidV4 } from "../utils/uuid";
import { uploadPostAudio } from "../utils/uploadPostAudio";
import { buildWorkerAudioFields, buildSpotifyWorkerAudioFields, type PostAudioInput, type SpotifyAudioSelection } from "../types/postAudio";

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
    return formatWorkerAuthClientError(error);
  }
  return "De upload kon niet worden voltooid.";
}

export type CarouselAudioInput = PostAudioInput;

export type PickCarouselOptions = UploadProductInput & {
  hashtagsRaw?: string;
  caption?: string;
  audio?: CarouselAudioInput;
  spotifyAudio?: SpotifyAudioSelection;
};

export type PickedCarouselAsset = ImagePicker.ImagePickerAsset;

export function useCloudImageCarouselUpload() {
  const { user } = useAuth();
  const { openAuthPrompt } = useAuthPrompt();
  const { refreshGlobalFeed } = useGlobalFeed();
  const { addUserVideoPost, refreshUserVideoPosts } = useUserUploads();
  const [isUploading, setIsUploading] = useState(false);

  const uploadCarouselAssets = useCallback(
    async (assets: PickedCarouselAsset[], options?: PickCarouselOptions) => {
      const uploadUserId = user?.id;
      if (!uploadUserId) {
        openAuthPrompt({
          message: "Log in of registreer om foto’s te uploaden.",
        });
        return;
      }

      setIsUploading(true);
      try {
        const picked = (assets ?? [])
          .filter((a) => a?.uri)
          .slice(0, MAX_IMAGES);
        if (picked.length === 0) {
          return;
        }

        const clientPostId = createUuidV4();
        const parsedTags = parseHashtagInput(options?.hashtagsRaw ?? "");
        const captionForPost = sanitizeUploadCaption(options?.caption);
        const product = sanitizeUploadProduct(options);
        let audioFields: Record<string, string> | null = null;
        if (options?.spotifyAudio?.trackId) {
          audioFields = buildSpotifyWorkerAudioFields(options.spotifyAudio);
        } else if (options?.audio?.localUri) {
          try {
            const audioPublicUrl = await uploadPostAudio(
              options.audio.localUri,
              uploadUserId
            );
            audioFields = buildWorkerAudioFields(audioPublicUrl, options.audio);
          } catch (audioError) {
            if (__DEV__) {
              console.warn("[carousel] audio upload failed", audioError);
            }
            Alert.alert(
              "Audio upload mislukt",
              "Je fotoserie wordt zonder audio geplaatst."
            );
          }
        }
        const uploadUrl = CLOUD_VIDEO_WORKER_BASE;
        const formData = new FormData();
        formData.append("uploadType", "image_carousel");
        formData.append("tags", JSON.stringify(parsedTags));
        formData.append("caption", captionForPost);
        if (product.productId.length > 0) {
          formData.append("productId", product.productId);
        } else if (product.isShopPost) {
          formData.append("productUrl", product.productUrl);
          if (product.productTitle.length > 0) {
            formData.append("productTitle", product.productTitle);
          }
          if (product.productBrand.length > 0) {
            formData.append("productBrand", product.productBrand);
          }
          if (product.productPriceText.length > 0) {
            formData.append("productPriceText", product.productPriceText);
          }
        }
        if (audioFields) {
          for (const [key, value] of Object.entries(audioFields)) {
            formData.append(key, value);
          }
        }
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

        const authHeaders = await buildWorkerAuthHeaders({
          "X-Post-Id": clientPostId,
        });

        const response = await fetchWithTimeout(
          uploadUrl,
          {
            method: "POST",
            headers: authHeaders,
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
          const msg = formatWorkerUploadError(
            response.status,
            typeof data.message === "string" ? data.message : undefined
          );
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
        let final = userVideoPostFromPostRow(serverPost as PostRow, mediaItems);
        final = await enrichPostWithLinkedProduct(final);

        addUserVideoPost(final);
        try {
          await refreshUserVideoPosts();
        } catch {
          /* upload gelukt */
        }
        try {
          await refreshGlobalFeed({ force: true });
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

  const pickAndUploadCarousel = useCallback(
    async (options?: PickCarouselOptions) => {
      const uploadUserId = user?.id;
      if (!uploadUserId) {
        openAuthPrompt({
          message: "Log in of registreer om foto’s te uploaden.",
        });
        return;
      }

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

      await uploadCarouselAssets(result.assets ?? [], options);
    },
    [openAuthPrompt, uploadCarouselAssets, user?.id]
  );

  return { isUploading, pickAndUploadCarousel, uploadCarouselAssets };
}
