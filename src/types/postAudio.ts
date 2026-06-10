/**
 * Gedeelde audio-input voor foto-carousel én video upload.
 * `localUri` is een lokaal bestand dat als eigen audio geüpload wordt.
 */
export type PostAudioInput = {
  localUri: string;
  displayName: string;
  volume: number;
};

const AUDIO_TITLE_MAX = 120;

/**
 * Audio-metadata voor een EIGEN upload (user_upload).
 * Werkt voor zowel multipart (carousel) als JSON (video) payloads.
 */
export function buildWorkerAudioFields(
  audioPublicUrl: string,
  input: PostAudioInput
): Record<string, string> {
  const title =
    input.displayName.trim().length > 0
      ? input.displayName.trim().slice(0, AUDIO_TITLE_MAX)
      : "Eigen audio";
  const volume = Math.min(1, Math.max(0, input.volume ?? 0.7));
  return {
    audioUrl: audioPublicUrl,
    audioTitle: title,
    audioArtist: "Eigen audio",
    audioSource: "user_upload",
    audioStartMs: "0",
    audioVolume: String(volume),
  };
}
