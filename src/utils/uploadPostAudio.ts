import { supabase } from "../lib/supabase";

const BUCKET = "post-audio";

const AUDIO_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  wav: "audio/wav",
  aac: "audio/aac",
  ogg: "audio/ogg",
  webm: "audio/webm",
};

function extFromUri(uri: string): string {
  const guess = uri.split(".").pop()?.split("?")[0]?.toLowerCase();
  if (guess && guess.length <= 5 && /^[a-z0-9]+$/.test(guess)) {
    return guess;
  }
  return "m4a";
}

function contentTypeForExt(ext: string): string {
  return AUDIO_MIME[ext] ?? "application/octet-stream";
}

/**
 * Uploadt lokale audio naar Supabase `post-audio` en retourneert de public URL.
 */
export async function uploadPostAudio(
  localUri: string,
  userId: string
): Promise<string> {
  if (!localUri || localUri.startsWith("http")) {
    throw new Error("Ongeldige audiobron.");
  }
  if (!userId) {
    throw new Error("Gebruiker ontbreekt voor audio-upload.");
  }

  const response = await fetch(localUri);
  if (!response.ok) {
    throw new Error("Kon het audiobestand niet lezen.");
  }

  const fileBuffer = await response.arrayBuffer();
  const ext = extFromUri(localUri);
  const path = `${userId}/audio-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, fileBuffer, {
      upsert: false,
      contentType: contentTypeForExt(ext),
    });

  if (uploadError) {
    throw uploadError;
  }

  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
