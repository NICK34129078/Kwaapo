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

export type SpotifyAudioSelection = {
  trackId: string;
  title: string;
  artist: string;
  volume: number;
};

/**
 * Audio-metadata voor Spotify-bibliotheek (external + audioTrackId).
 * Server valideert track via music_tracks FK — geen client preview URL.
 */
export function buildSpotifyWorkerAudioFields(
  input: SpotifyAudioSelection
): Record<string, string> {
  const volume = Math.min(1, Math.max(0, input.volume ?? 0.7));
  return {
    audioTrackId: input.trackId,
    audioTitle: input.title.trim().slice(0, AUDIO_TITLE_MAX) || "Onbekend nummer",
    audioArtist: input.artist.trim().slice(0, AUDIO_TITLE_MAX) || "Onbekende artiest",
    audioSource: "external",
    audioStartMs: "0",
    audioVolume: String(volume),
  };
}
