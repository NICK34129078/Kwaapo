import {
  buildSpotifyWorkerAudioFields,
  buildWorkerAudioFields,
} from "./postAudio";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

export function runPostAudioTests(): void {
  const userFields = buildWorkerAudioFields("https://example.com/audio.mp3", {
    localUri: "file:///a.mp3",
    displayName: "Mijn beat",
    volume: 1.2,
  });
  assert(userFields.audioSource === "user_upload", "user upload source");
  assert(userFields.audioUrl === "https://example.com/audio.mp3", "user upload url");
  assert(userFields.audioVolume === "1", "volume clamped to 1");

  const spotifyFields = buildSpotifyWorkerAudioFields({
    trackId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    title: "Song Title",
    artist: "Artist Name",
    volume: 0.35,
  });
  assert(spotifyFields.audioSource === "external", "spotify external source");
  assert(
    spotifyFields.audioTrackId === "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    "spotify track id forwarded"
  );
  assert(spotifyFields.audioTitle === "Song Title", "spotify title");
  assert(spotifyFields.audioArtist === "Artist Name", "spotify artist");
  assert(spotifyFields.audioVolume === "0.35", "spotify volume");
  assert(spotifyFields.audioStartMs === "0", "spotify start ms");
  assert(!("audioUrl" in spotifyFields), "spotify must not send raw audioUrl");
}

if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") {
  runPostAudioTests();
}
