import type { Product } from "../types/product";

export type PostAudioSource =
  | "none"
  | "user_upload"
  | "app_library"
  | "external";

/**
 * Eén shape voor deels én Reels. Image-posts: geen `type` of `type: "image"`.
 * Video (uploads): `type: "video"` + `videoUrl` + `filename`, `owner`, `createdAt`.
 */
export type FeedPost = {
  id: string;
  ownerProfileId?: string;
  ownerUsername?: string | null;
  ownerDisplayName?: string | null;
  ownerAvatarUrl?: string | null;
  type?: "image" | "video" | "image_carousel";
  /** Carousel slides (eerste url = thumbnail/poster). */
  mediaItems?: Array<{
    url: string;
    mediaType: "image" | "video";
    sortOrder: number;
  }>;
  /** Poster/achtergrond: bij video vaak = thumbnail, anders beeld-URL. */
  imageUrl: string;
  /** Afspeel-URL (alleen type video, publieke Worker-URL). */
  videoUrl?: string;
  /** Tijdelijke lokale fallback-uri voor debug / native playback vergelijking. */
  localVideoUri?: string;
  thumbnailUrl?: string;
  filename?: string;
  createdAt?: number;
  /** Handle zoals in profiel, bv. @mara.veldt in UI */
  owner?: string;
  username: string;
  caption: string;
  price: string;
  /** Numeriek voor like-logica; weergave met `formatLikesForDisplay`. */
  likesCount: number;
  /** Numeriek reactieteller; fallback via `comments` string in placeholders. */
  commentsCount?: number;
  comments: string;
  /** Deel-teller (paper plane). */
  shares?: string;
  /** Klein vierkantje voor audio / track art. */
  musicThumbUrl?: string;
  /** Optionele slideshow-audio (carousel). */
  audioUrl?: string | null;
  audioTitle?: string | null;
  audioArtist?: string | null;
  audioSource?: PostAudioSource;
  audioStartMs?: number;
  audioVolume?: number;
  audioDurationMs?: number | null;
  /** FK naar music_tracks wanneer audio via Spotify/bibliotheek is gekozen. */
  audioTrackId?: string;
  /** Avatar naast naam (optioneel; anders gegenereerde placeholder). */
  avatarUrl?: string;
  /** Genormaliseerde hashtags (zonder #), uit `public.posts.tags`. */
  tags?: string[];
  /** Server-side ranking score (alleen gerankte feed-RPC). */
  rankingScore?: number;
  /** Development: uitsplitsing rankingfactoren uit Supabase RPC. */
  rankingBreakdown?: Record<string, unknown>;
  /** Bron van Reels-feed item (RPC-laag, geen Worker). */
  feedSource?: "personalized" | "explore" | "empty";
  /**
   * UI-state: of de huidige gebruiker deze post heeft opgeslagen.
   * Waarheid blijft `public.saved_posts`; dit veld is alleen een hint voor de UI.
   */
  isSaved?: boolean;
  /** Shop-post met productlink (fase 1 — extern openen, geen betaling). */
  isShopPost?: boolean;
  /** Gekoppeld catalogproduct (public.products). */
  productId?: string;
  linkedProduct?: Product;
  productTitle?: string;
  productUrl?: string;
  productBrand?: string;
  productPriceText?: string;
};

/** Wanneer er geen thumbnail is na upload, toch een portret-vriendelijke poster. */
export const REEL_VIDEO_POSTER_FALLBACK =
  "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=1080&h=1920&fit=crop&q=15";

export function isVideoReelItem(
  item: FeedPost
): item is FeedPost & { type: "video"; videoUrl: string } {
  return item.type === "video" && typeof item.videoUrl === "string" && item.videoUrl.length > 0;
}

/** Profiel-grid weergaven: floor, max ~3 cijfers vóór k/m (geen afronden omhoog). */
export function resolveCommentsCount(item: FeedPost): number {
  if (
    typeof item.commentsCount === "number" &&
    Number.isFinite(item.commentsCount)
  ) {
    return Math.max(0, Math.floor(item.commentsCount));
  }
  const digits = item.comments.replace(/[^\d]/g, "");
  const parsed = parseInt(digits, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function formatGridViewsCount(n: number): string {
  const v = Math.max(0, Math.floor(n));
  if (v < 1000) {
    return String(v);
  }

  const trimTenth = (s: string) => (s.endsWith(".0") ? s.slice(0, -2) : s);

  if (v < 1_000_000) {
    if (v < 10_000) {
      const whole = Math.floor(v / 1000);
      const tenth = Math.floor((v % 1000) / 100);
      if (tenth === 0) {
        return `${whole}k`;
      }
      return `${whole}.${tenth}k`;
    }
    if (v < 100_000) {
      return `${trimTenth((Math.floor(v / 100) / 10).toFixed(1))}k`;
    }
    return `${Math.floor(v / 1000)}k`;
  }

  if (v < 10_000_000) {
    const whole = Math.floor(v / 1_000_000);
    const tenth = Math.floor((v % 1_000_000) / 100_000);
    if (tenth === 0) {
      return `${whole}m`;
    }
    return `${whole}.${tenth}m`;
  }
  if (v < 100_000_000) {
    return `${trimTenth((Math.floor(v / 100_000) / 10).toFixed(1))}m`;
  }
  return `${Math.floor(v / 1_000_000)}m`;
}

/** Likes in dezelfde stijl als bestaande placeholders (bv. 14k, 5,6k). */
export function formatLikesForDisplay(n: number): string {
  if (n < 1000) {
    return String(n);
  }
  if (n < 1_000_000) {
    const k = n / 1000;
    const t = k >= 10 ? Math.round(k) : Math.round(k * 10) / 10;
    return `${String(t).replace(".", ",")}k`;
  }
  const m = n / 1_000_000;
  return `${String(Math.round(m * 10) / 10).replace(".", ",")}M`;
}

/**
 * Eigen set voor de home/Reels-tab (full-screen snap): portretvriendelijke placeholders.
 * Geen echte video’s — placeholders tot je backend koppelt.
 */
export const REELS_POSTS: FeedPost[] = [
  {
    id: "reel-1",
    imageUrl:
      "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=1080&h=1920&fit=crop&q=85",
    username: "runway.arch",
    caption: "Look 04 · wide-leg tailoring",
    price: "€329.00",
    likesCount: 50_700,
    comments: "103",
    shares: "714",
    musicThumbUrl:
      "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=200&h=200&fit=crop&q=80",
  },
  {
    id: "reel-2",
    imageUrl:
      "https://images.unsplash.com/photo-1496747611176-843222e0e57c?w=1080&h=1920&fit=crop&q=85",
    username: "studio.velvet",
    caption: "Evening light · silk drape",
    price: "€189.00",
    likesCount: 14_000,
    comments: "620",
    shares: "1,2k",
    musicThumbUrl:
      "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=200&h=200&fit=crop&q=80",
  },
  {
    id: "reel-3",
    imageUrl:
      "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=1080&h=1920&fit=crop&q=85",
    username: "velvet.line",
    caption: "Chrome heel · close-up",
    price: "€199.00",
    likesCount: 5600,
    comments: "204",
    shares: "892",
    musicThumbUrl:
      "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=200&h=200&fit=crop&q=80",
  },
  {
    id: "reel-4",
    imageUrl:
      "https://images.unsplash.com/photo-1552374196-1ab66a0afa06?w=1080&h=1920&fit=crop&q=85",
    username: "noir.runway",
    caption: "Obsidian set · movement",
    price: "€149.50",
    likesCount: 8100,
    comments: "312",
    shares: "445",
    musicThumbUrl:
      "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200&h=200&fit=crop&q=80",
  },
  {
    id: "reel-5",
    imageUrl:
      "https://images.unsplash.com/photo-1539008835657-9e8e3770cd73?w=1080&h=1920&fit=crop&q=85",
    username: "atelier.nova",
    caption: "Editorial coat · texture",
    price: "€289.00",
    likesCount: 12_400,
    comments: "842",
    shares: "2k",
    musicThumbUrl:
      "https://images.unsplash.com/photo-1487180140351-f13209e813c4?w=200&h=200&fit=crop&q=80",
  },
  {
    id: "reel-6",
    imageUrl:
      "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=1080&h=1920&fit=crop&q=85",
    username: "atelier.grey",
    caption: "Fog wool · street",
    price: "€410.00",
    likesCount: 18_000,
    comments: "2,1k",
    shares: "3,4k",
    musicThumbUrl:
      "https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=200&h=200&fit=crop&q=80",
  },
  {
    id: "reel-7",
    imageUrl:
      "https://images.unsplash.com/photo-1541099649105-f69ad21a32c3?w=1080&h=1920&fit=crop&q=85",
    username: "denim.lab",
    caption: "Selvedge jacket · detail",
    price: "€119.00",
    likesCount: 6300,
    comments: "512",
    shares: "228",
    musicThumbUrl:
      "https://images.unsplash.com/photo-1494232410401-ad00d7233afa?w=200&h=200&fit=crop&q=80",
  },
  {
    id: "reel-8",
    imageUrl:
      "https://images.unsplash.com/photo-1583496661160-fb5886a0aa0b?w=1080&h=1920&fit=crop&q=85",
    username: "silk.room",
    caption: "Bias slip · studio",
    price: "€89.00",
    likesCount: 11_000,
    comments: "880",
    shares: "1,1k",
    musicThumbUrl:
      "https://images.unsplash.com/photo-1470225620780-dba8ba3626e8?w=200&h=200&fit=crop&q=80",
  },
];

export const PROFILE_POSTS = REELS_POSTS.map((p) => p.imageUrl);

/**
 * Maakt één `FeedPost` voor zowel profielgrid als Reels, na cloud-upload.
 */
export function buildUploadedReelFeedPost(input: {
  videoUrl: string;
  thumbnailUrl?: string;
  filename: string;
  createdAt: number;
  owner: string;
  caption?: string;
  tags?: string[];
}): Omit<FeedPost, "id"> {
  const poster =
    input.thumbnailUrl && input.thumbnailUrl.length > 0
      ? input.thumbnailUrl
      : REEL_VIDEO_POSTER_FALLBACK;
  const handle = input.owner.startsWith("@")
    ? input.owner.slice(1)
    : input.owner;
  return {
    type: "video",
    imageUrl: poster,
    videoUrl: input.videoUrl,
    thumbnailUrl: input.thumbnailUrl,
    filename: input.filename,
    createdAt: input.createdAt,
    owner: input.owner,
    username: handle,
    caption: input.caption && input.caption.length > 0 ? input.caption : "Nieuwe look",
    price: "—",
    likesCount: 0,
    comments: "0",
    shares: "0",
    musicThumbUrl: input.thumbnailUrl && input.thumbnailUrl.length > 0
      ? input.thumbnailUrl
      : undefined,
    ...(input.tags && input.tags.length > 0 ? { tags: input.tags } : {}),
  };
}
