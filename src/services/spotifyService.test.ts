import { searchSpotifyTracks } from "./spotifyService";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

export async function runSpotifyServiceTests(): Promise<void> {
  const emptyShortQuery = await searchSpotifyTracks("a");
  assert(emptyShortQuery.length === 0, "query shorter than 2 chars returns []");

  const emptyWhitespace = await searchSpotifyTracks("  ");
  assert(emptyWhitespace.length === 0, "whitespace query returns []");
}

if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") {
  void runSpotifyServiceTests();
}
