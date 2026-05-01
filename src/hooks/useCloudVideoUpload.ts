import { useCallback, useState } from "react";
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as VideoThumbnails from "expo-video-thumbnails";
import { isAppUserIdConfigured } from "../config/env";
import { useUserUploads } from "../context/UserUploadsContext";
import {
  CLOUD_VIDEO_WORKER_BASE,
  getCloudVideoStreamUrl,
  UPLOADED_VIDEO_OWNER,
} from "../constants/cloudVideo";
import { buildUploadedReelFeedPost } from "../data/placeholder";
import { userVideoPostFromPostRow, type PostRow } from "../services/postsService";
import type { UserVideoPost } from "../types/userVideoPost";

type UploadJson = {
  success?: boolean;
  fileName?: string;
  videoUrl?: string;
  thumbnailUrl?: string | null;
  r2Key?: string;
  message?: string;
  hint?: string;
  post?: PostRow;
};

function makeLocalId(): string {
  return `vpost-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useCloudVideoUpload() {
  const { addUserVideoPost, refreshUserVideoPosts } = useUserUploads();
  const [isUploading, setIsUploading] = useState(false);

  const pickAndUploadVideo = useCallback(async () => {
    if (!isAppUserIdConfigured()) {
      Alert.alert(
        "Configuration",
        "Set EXPO_PUBLIC_APP_USER_ID in .env (your public user id for this app) and restart Expo."
      );
      return;
    }
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Permission needed",
          "Allow access to your media library to upload a video."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
        allowsEditing: false,
        quality: 1,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset?.uri) {
        Alert.alert("No video", "Could not read the selected video.");
        return;
      }

      const localUri = asset.uri;
      const uploadFileName =
        asset.fileName && asset.fileName.length > 0
          ? asset.fileName
          : `video-${Date.now()}.mp4`;
      let thumbnailUri: string | null = null;
      try {
        const thumbnail = await VideoThumbnails.getThumbnailAsync(localUri, {
          time: 1000,
          quality: 0.7,
        });
        if (thumbnail?.uri) {
          thumbnailUri = thumbnail.uri;
        }
      } catch (e) {
        if (__DEV__) {
          console.warn("[upload] thumbnail generation failed", e);
        }
      }
      if (__DEV__) {
        console.log("[upload local uri]", localUri);
        console.log("[upload form filename]", uploadFileName);
        console.log("[upload thumbnail uri]", thumbnailUri ?? "(none)");
      }

      setIsUploading(true);

      const uploadUserId = process.env.EXPO_PUBLIC_APP_USER_ID || "1";
      console.log("Uploading with user id:", uploadUserId);
      const uploadUrl = `${CLOUD_VIDEO_WORKER_BASE}?userId=${encodeURIComponent(uploadUserId)}`;
      console.log("Upload worker URL:", uploadUrl);
      const formData = new FormData();
      formData.append("file", {
        uri: localUri,
        name: uploadFileName,
        type: "video/mp4",
      } as any);
      if (thumbnailUri) {
        formData.append("thumbnail", {
          uri: thumbnailUri,
          name: `thumb-${Date.now()}.jpg`,
          type: "image/jpeg",
        } as any);
      }

      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "X-App-User-Id": uploadUserId,
        },
        body: formData,
      });

      let data: UploadJson = {};
      try {
        data = (await response.json()) as UploadJson;
      } catch {
        /* ignore non-JSON */
      }
      if (__DEV__) {
        console.log("[upload response]", data);
      }

      if (!response.ok) {
        const msg =
          typeof data.message === "string" && data.message.length > 0
            ? data.message
            : `Upload failed (${response.status})`;
        throw new Error(
          data.hint ? `${msg} (${data.hint})` : msg
        );
      }

      if (!data.success) {
        const msg =
          typeof data.message === "string" && data.message.length > 0
            ? data.message
            : "Upload was not successful.";
        throw new Error(
          data.hint ? `${msg} (${data.hint})` : msg
        );
      }

      const name =
        typeof data.fileName === "string" ? data.fileName : undefined;
      if (!name || !name.length) {
        throw new Error("Server did not return a file name.");
      }

      const videoUrlFromServer =
        typeof data.videoUrl === "string" && data.videoUrl.length > 0
          ? data.videoUrl
          : getCloudVideoStreamUrl(name);

      const postPayload = buildUploadedReelFeedPost({
        videoUrl: videoUrlFromServer,
        thumbnailUrl:
          typeof data.thumbnailUrl === "string" && data.thumbnailUrl.length > 0
            ? data.thumbnailUrl
            : undefined,
        filename: name,
        createdAt: Date.now(),
        owner: UPLOADED_VIDEO_OWNER,
      });
      const createPostPayload = {
        user_id: uploadUserId,
        userId: uploadUserId,
        type: "video" as const,
        video_url: videoUrlFromServer,
        videoUrl: videoUrlFromServer,
        caption: postPayload.caption ?? "Nieuwe look",
        thumbnail_url:
          typeof data.thumbnailUrl === "string" && data.thumbnailUrl.length > 0
            ? data.thumbnailUrl
            : null,
        thumbnailUrl:
          typeof data.thumbnailUrl === "string" && data.thumbnailUrl.length > 0
            ? data.thumbnailUrl
            : null,
        r2_key: typeof data.r2Key === "string" && data.r2Key.length > 0 ? data.r2Key : name,
      };
      if (__DEV__) {
        console.log("[create post payload]", createPostPayload);
      }

      let final: UserVideoPost;
      if (data.post) {
        final = userVideoPostFromPostRow(data.post);
        if (__DEV__) {
          console.log("[created post]", final);
        }
      } else {
        final = {
          ...postPayload,
          id: makeLocalId(),
          type: "video" as const,
          videoUrl: videoUrlFromServer,
        } as UserVideoPost;
        if (__DEV__) {
          console.log("[created post]", final);
        }
      }

      addUserVideoPost(final);
      await refreshUserVideoPosts();
      if (__DEV__) {
        console.log(
          "[CloudUpload] final post in feed+profile. id =",
          final.id,
          "url =",
          final.videoUrl
        );
      }

      Alert.alert(
        "Upload successful",
        name ? `Saved as: ${name}` : "Your video was uploaded."
      );
    } catch (error) {
      console.error(error);
      const msg =
        error instanceof Error ? error.message : "The upload could not be completed.";
      Alert.alert("Upload failed", msg);
    } finally {
      setIsUploading(false);
    }
  }, [addUserVideoPost, refreshUserVideoPosts]);

  return { isUploading, pickAndUploadVideo };
}
