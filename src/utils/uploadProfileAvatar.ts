import { Buffer } from "buffer";
import type * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "../lib/supabase";

function withCacheBust(publicUrl: string): string {
  const base = publicUrl.split("?")[0]?.trim() || publicUrl;
  return `${base}?v=${Date.now()}`;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function readUriAsArrayBuffer(
  uri: string
): Promise<{ buffer: ArrayBuffer; mimeType: string }> {
  if (uri.startsWith("data:")) {
    const match = /^data:([^;]+);base64,(.+)$/.exec(uri);
    if (!match) {
      throw new Error("Kon de bijgesneden foto niet lezen.");
    }
    return {
      buffer: base64ToArrayBuffer(match[2]),
      mimeType: match[1] || "image/jpeg",
    };
  }

  if (uri.startsWith("http://") || uri.startsWith("https://")) {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error("Kon het geselecteerde bestand niet lezen.");
    }
    return {
      buffer: await response.arrayBuffer(),
      mimeType: response.headers.get("content-type") ?? "image/jpeg",
    };
  }

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (!base64) {
    throw new Error("Kon de bijgesneden foto niet lezen.");
  }

  return {
    buffer: base64ToArrayBuffer(base64),
    mimeType: "image/jpeg",
  };
}

async function uploadAvatarBuffer(
  userId: string,
  fileBuffer: ArrayBuffer,
  contentType: string,
  ext: string
): Promise<string> {
  if (fileBuffer.byteLength === 0) {
    throw new Error("De geselecteerde foto is leeg.");
  }

  const path = `${userId}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, fileBuffer, {
      upsert: true,
      contentType,
      cacheControl: "60",
    });

  if (uploadError) {
    throw uploadError;
  }

  const storageUrl = supabase.storage.from("avatars").getPublicUrl(path).data
    .publicUrl;
  const publicUrl = withCacheBust(storageUrl);

  const { data, error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl })
    .eq("id", userId)
    .select("avatar_url")
    .maybeSingle();

  if (updateError) {
    throw updateError;
  }

  if (!data?.avatar_url) {
    throw new Error(
      "Profielfoto geüpload, maar je profiel kon niet worden bijgewerkt."
    );
  }

  return data.avatar_url;
}

export async function uploadProfileAvatarUri(
  userId: string,
  uri: string,
  mimeType = "image/jpeg"
): Promise<string> {
  const { buffer, mimeType: detectedMime } = await readUriAsArrayBuffer(uri);
  const resolvedMime = detectedMime || mimeType;
  const ext = resolvedMime.split("/").pop()?.toLowerCase() || "jpg";
  return uploadAvatarBuffer(userId, buffer, resolvedMime, ext);
}

export async function uploadProfileAvatar(
  userId: string,
  asset: ImagePicker.ImagePickerAsset
): Promise<string> {
  if (!asset.uri) {
    throw new Error("Kon het geselecteerde bestand niet lezen.");
  }

  const { buffer, mimeType } = await readUriAsArrayBuffer(asset.uri);
  const ext =
    asset.fileName?.split(".").pop()?.toLowerCase() ||
    mimeType.split("/").pop()?.toLowerCase() ||
    "jpg";

  return uploadAvatarBuffer(
    userId,
    buffer,
    asset.mimeType ?? mimeType ?? "image/jpeg",
    ext
  );
}
