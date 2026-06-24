import {
  REEL_VIDEO_POSTER_FALLBACK,
  type PostAudioSource,
} from "../data/placeholder";
import {
  CLOUD_VIDEO_WORKER_BASE,
  UPLOADED_VIDEO_OWNER,
  getCloudVideoStreamUrl,
} from "../constants/cloudVideo";
import { supabase } from "../lib/supabase";
import type { ProfilePostMediaItem, UserVideoPost } from "../types/userVideoPost";
import type { Product } from "../types/product";
import { fetchProductsByIds } from "./productsService";
import { logForYouControlledMix } from "../utils/feedRanking";

/** Profiel (mijn uploads): vaste owner-handle. Globale feed: afgeleid van `user_id`. */
export type UserVideoPostMappingScope = "own_profile" | "global";

export type PostRow = {
  id: string;
  user_id: string;
  type: string;
  video_url: string | null;
  r2_key: string;
  thumbnail_url: string | null;
  filename: string;
  caption: string | null;
  /** Hashtags uit `public.posts.tags` (text[]). */
  tags?: string[];
  product_title?: string | null;
  product_url?: string | null;
  product_brand?: string | null;
  product_price_text?: string | null;
  product_id?: string | null;
  is_shop_post?: boolean;
  likes_count: number;
  comments_count: number;
  created_at: string;
  is_deleted: boolean;
  audio_url?: string | null;
  audio_title?: string | null;
  audio_artist?: string | null;
  audio_source?: string | null;
  audio_start_ms?: number | null;
  audio_volume?: number | null;
  audio_duration_ms?: number | null;
  audio_track_id?: string | null;
};

type MaybePostRow = PostRow & {
  userId?: string;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  r2Key?: string;
  likesCount?: number;
  commentsCount?: number;
  captionText?: string | null;
  createdAt?: string;
  isDeleted?: boolean;
  productTitle?: string | null;
  productUrl?: string | null;
  productBrand?: string | null;
  productPriceText?: string | null;
  productId?: string | null;
  isShopPost?: boolean;
  audioUrl?: string | null;
  audioTitle?: string | null;
  audioArtist?: string | null;
  audioSource?: string | null;
  audioStartMs?: number | null;
  audioVolume?: number | null;
  audioDurationMs?: number | null;
};

const POST_AUDIO_SOURCES = new Set<PostAudioSource>([
  "none",
  "user_upload",
  "app_library",
  "external",
]);

function normalizePostAudioSource(value: unknown): PostAudioSource {
  if (typeof value === "string" && POST_AUDIO_SOURCES.has(value as PostAudioSource)) {
    return value as PostAudioSource;
  }
  return "none";
}

function audioFieldsFromRow(row: MaybePostRow): Pick<
  UserVideoPost,
  | "audioUrl"
  | "audioTitle"
  | "audioArtist"
  | "audioSource"
  | "audioStartMs"
  | "audioVolume"
  | "audioDurationMs"
> {
  const audioUrlRaw =
    typeof row.audio_url === "string"
      ? row.audio_url
      : typeof row.audioUrl === "string"
        ? row.audioUrl
        : null;
  const audioUrl =
    audioUrlRaw && audioUrlRaw.trim().length > 0 ? audioUrlRaw.trim() : null;
  if (!audioUrl) {
    return {};
  }

  const audioTitle =
    (typeof row.audio_title === "string" && row.audio_title.length > 0
      ? row.audio_title
      : typeof row.audioTitle === "string" && row.audioTitle.length > 0
        ? row.audioTitle
        : null) ?? null;
  const audioArtist =
    (typeof row.audio_artist === "string" && row.audio_artist.length > 0
      ? row.audio_artist
      : typeof row.audioArtist === "string" && row.audioArtist.length > 0
        ? row.audioArtist
        : null) ?? null;
  const audioSource = normalizePostAudioSource(row.audio_source ?? row.audioSource);
  const startRaw = row.audio_start_ms ?? row.audioStartMs;
  const audioStartMs =
    typeof startRaw === "number" && Number.isFinite(startRaw)
      ? Math.max(0, Math.floor(startRaw))
      : 0;
  const volRaw = row.audio_volume ?? row.audioVolume;
  const audioVolume =
    typeof volRaw === "number" && Number.isFinite(volRaw)
      ? Math.min(1, Math.max(0, volRaw))
      : 1;
  const durRaw = row.audio_duration_ms ?? row.audioDurationMs;
  const audioDurationMs =
    typeof durRaw === "number" && Number.isFinite(durRaw) && durRaw > 0
      ? Math.floor(durRaw)
      : null;

  return {
    audioUrl,
    audioTitle,
    audioArtist,
    audioSource,
    audioStartMs,
    audioVolume,
    audioDurationMs,
  };
}

/** Normaliseert Supabase text[] / Worker JSON naar string[] (leeg = []). */
export function normalizeTagsFromApi(v: unknown): string[] {
  if (v == null) {
    return [];
  }
  if (Array.isArray(v)) {
    return v
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
  }
  if (typeof v === "string") {
    const s = v.trim();
    if (s.length === 0) {
      return [];
    }
    if (s.startsWith("[") && s.endsWith("]")) {
      try {
        return normalizeTagsFromApi(JSON.parse(s));
      } catch {
        /* fall through */
      }
    }
    if (s.startsWith("{") && s.endsWith("}")) {
      const inner = s.slice(1, -1).trim();
      if (inner.length === 0) {
        return [];
      }
      return inner
        .split(",")
        .map((part) => part.replace(/^"|"$/g, "").trim())
        .filter((part) => part.length > 0);
    }
    return [s];
  }
  return [];
}

type ProfileOwnerRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type PostMediaDbRow = {
  post_id: string;
  url: string;
  media_type: string | null;
  sort_order: number | null;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

function shopFieldsFromRow(row: MaybePostRow): Pick<
  UserVideoPost,
  | "isShopPost"
  | "productId"
  | "productTitle"
  | "productUrl"
  | "productBrand"
  | "productPriceText"
> {
  const productIdRaw =
    (typeof row.product_id === "string" && row.product_id.length > 0
      ? row.product_id
      : typeof row.productId === "string" && row.productId.length > 0
        ? row.productId
        : "") || "";
  const productUrl =
    (typeof row.product_url === "string" && row.product_url.length > 0
      ? row.product_url
      : typeof row.productUrl === "string" && row.productUrl.length > 0
        ? row.productUrl
        : "") || "";
  const isShop =
    row.is_shop_post === true ||
    row.isShopPost === true ||
    productUrl.length > 0 ||
    productIdRaw.length > 0;

  const base: Pick<
    UserVideoPost,
    "isShopPost" | "productId" | "productTitle" | "productUrl" | "productBrand" | "productPriceText"
  > = {};

  if (productIdRaw.length > 0) {
    base.productId = productIdRaw;
  }
  if (isShop) {
    base.isShopPost = true;
  }

  if (productUrl.length === 0 && productIdRaw.length === 0) {
    return base;
  }

  if (productUrl.length > 0) {
    const productTitle =
      row.product_title ?? row.productTitle ?? undefined;
    const productBrand =
      row.product_brand ?? row.productBrand ?? undefined;
    const productPriceText =
      row.product_price_text ?? row.productPriceText ?? undefined;
    return {
      ...base,
      isShopPost: true,
      productUrl,
      ...(typeof productTitle === "string" && productTitle.length > 0
        ? { productTitle }
        : {}),
      ...(typeof productBrand === "string" && productBrand.length > 0
        ? { productBrand }
        : {}),
      ...(typeof productPriceText === "string" && productPriceText.length > 0
        ? { productPriceText }
        : {}),
    };
  }

  return base;
}

function normalizePostRow(row: MaybePostRow): PostRow {
  const rawVideo = row.video_url ?? row.videoUrl;
  const videoNorm =
    rawVideo == null || (typeof rawVideo === "string" && rawVideo.length === 0)
      ? null
      : String(rawVideo);
  return {
    ...row,
    user_id: row.user_id ?? row.userId ?? "",
    type: typeof row.type === "string" && row.type.length > 0 ? row.type : "video",
    video_url: videoNorm,
    r2_key: row.r2_key ?? row.r2Key ?? "",
    thumbnail_url:
      typeof row.thumbnail_url !== "undefined"
        ? row.thumbnail_url
        : row.thumbnailUrl ?? null,
    caption:
      typeof row.caption !== "undefined"
        ? row.caption
        : row.captionText ?? null,
    likes_count: row.likes_count ?? row.likesCount ?? 0,
    comments_count: row.comments_count ?? row.commentsCount ?? 0,
    created_at: row.created_at ?? row.createdAt ?? new Date().toISOString(),
    is_deleted: row.is_deleted ?? row.isDeleted ?? false,
    tags: normalizeTagsFromApi(
      row.tags ?? (row as { hashtags?: unknown }).hashtags
    ),
    product_title:
      typeof row.product_title !== "undefined"
        ? row.product_title
        : row.productTitle ?? null,
    product_url:
      typeof row.product_url !== "undefined"
        ? row.product_url
        : row.productUrl ?? null,
    product_brand:
      typeof row.product_brand !== "undefined"
        ? row.product_brand
        : row.productBrand ?? null,
    product_price_text:
      typeof row.product_price_text !== "undefined"
        ? row.product_price_text
        : row.productPriceText ?? null,
    product_id:
      typeof row.product_id !== "undefined"
        ? row.product_id
        : row.productId ?? null,
    is_shop_post: row.is_shop_post ?? row.isShopPost ?? false,
  };
}

/** Zichtbare handle in de globale feed zonder aparte profieltabel. */
function usernameFromUserIdForGlobalFeed(userId: string): string {
  const compact = userId.replace(/-/g, "").slice(0, 12);
  return compact.length > 0 ? `user_${compact}` : "user_unknown";
}

function mapRowToUserVideoPost(
  row: PostRow,
  scope: UserVideoPostMappingScope = "own_profile",
  ownerProfile?: ProfileOwnerRow,
  mediaByPostId?: Map<string, ProfilePostMediaItem[]>
): UserVideoPost {
  const poster =
    row.thumbnail_url && row.thumbnail_url.length > 0
      ? row.thumbnail_url
      : REEL_VIDEO_POSTER_FALLBACK;

  const handleOwn =
    UPLOADED_VIDEO_OWNER.startsWith("@")
      ? UPLOADED_VIDEO_OWNER.slice(1)
      : UPLOADED_VIDEO_OWNER;

  const usernameFromProfile = ownerProfile?.username?.trim() ?? "";
  const fallbackUsername =
    scope === "global"
      ? usernameFromUserIdForGlobalFeed(row.user_id)
      : handleOwn;
  const displayUsername = usernameFromProfile.length
    ? usernameFromProfile
    : fallbackUsername;
  const username = displayUsername.startsWith("@")
    ? displayUsername
    : `@${displayUsername}`;
  const owner = username;

  const baseCaption =
    row.caption && row.caption.length > 0 ? row.caption : "Nieuwe look";

  if (row.type === "image_carousel") {
    const fromMap = mediaByPostId?.get(row.id);
    const mediaItems: ProfilePostMediaItem[] =
      fromMap && fromMap.length > 0
        ? fromMap
        : row.thumbnail_url && row.thumbnail_url.length > 0
          ? [
              {
                url: row.thumbnail_url,
                mediaType: "image",
                sortOrder: 0,
              },
            ]
          : [];

    return {
      id: row.id,
      ownerProfileId: row.user_id,
      ownerUsername: usernameFromProfile.length ? usernameFromProfile : null,
      ownerDisplayName: ownerProfile?.display_name ?? null,
      ownerAvatarUrl: ownerProfile?.avatar_url ?? null,
      type: "image_carousel",
      imageUrl: poster,
      thumbnailUrl: row.thumbnail_url ?? undefined,
      filename: row.filename,
      createdAt: new Date(row.created_at).getTime(),
      owner,
      username,
      caption: baseCaption,
      price: "—",
      likesCount: row.likes_count,
      commentsCount: row.comments_count,
      comments: String(row.comments_count),
      shares: "0",
      musicThumbUrl: row.thumbnail_url ?? undefined,
      mediaItems,
      tags: row.tags ?? [],
      ...shopFieldsFromRow(row),
      ...audioFieldsFromRow(row),
    };
  }

  const playableVideoUrl =
    row.video_url && row.video_url.length > 0
      ? row.video_url
      : getCloudVideoStreamUrl(row.r2_key);

  return {
    id: row.id,
    ownerProfileId: row.user_id,
    ownerUsername: usernameFromProfile.length ? usernameFromProfile : null,
    ownerDisplayName: ownerProfile?.display_name ?? null,
    ownerAvatarUrl: ownerProfile?.avatar_url ?? null,
    type: "video",
    imageUrl: poster,
    videoUrl: playableVideoUrl,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    filename: row.filename,
    createdAt: new Date(row.created_at).getTime(),
    owner,
    username,
    caption: baseCaption,
    price: "—",
    likesCount: row.likes_count,
    commentsCount: row.comments_count,
    comments: String(row.comments_count),
    shares: "0",
    musicThumbUrl: row.thumbnail_url ?? undefined,
    tags: row.tags ?? [],
    ...shopFieldsFromRow(row),
    ...audioFieldsFromRow(row),
  };
}

type WorkerPostsPayload = {
  success?: boolean;
  posts?: PostRow[];
  message?: string;
  nextCursor?: string | null;
  hasMore?: boolean;
};

export type GlobalPostsPage = {
  posts: UserVideoPost[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type FetchGlobalPostsOptions = {
  limit?: number;
  cursor?: string | null;
};

const DEFAULT_GLOBAL_PAGE_SIZE = 30;
const MAX_GLOBAL_PAGE_SIZE = 100;

function clampGlobalPageLimit(limit?: number): number {
  const raw = limit ?? DEFAULT_GLOBAL_PAGE_SIZE;
  return Math.min(Math.max(raw, 1), MAX_GLOBAL_PAGE_SIZE);
}

async function fetchWorkerPostsJson(
  url: string,
  init?: RequestInit
): Promise<{ res: Response; json: WorkerPostsPayload }> {
  const res = await fetch(url, init);
  let json: WorkerPostsPayload = {};
  try {
    json = await res.json();
  } catch {
    /* ignore */
  }
  return { res, json };
}

async function fetchPostMediaByPostIds(
  postIds: string[]
): Promise<Map<string, ProfilePostMediaItem[]>> {
  const map = new Map<string, ProfilePostMediaItem[]>();
  if (postIds.length === 0) {
    return map;
  }
  const { data, error } = await supabase
    .from("post_media")
    .select("post_id, url, media_type, sort_order")
    .in("post_id", postIds)
    .order("sort_order", { ascending: true });

  if (error) {
    if (__DEV__) {
      console.warn("[postsService] post_media:", error.message);
    }
    return map;
  }

  for (const raw of data ?? []) {
    const r = raw as PostMediaDbRow;
    const item: ProfilePostMediaItem = {
      url: r.url,
      mediaType: r.media_type === "video" ? "video" : "image",
      sortOrder: typeof r.sort_order === "number" ? r.sort_order : 0,
    };
    const list = map.get(r.post_id) ?? [];
    list.push(item);
    map.set(r.post_id, list);
  }
  return map;
}

async function attachLinkedProductsToPosts(
  posts: UserVideoPost[]
): Promise<UserVideoPost[]> {
  const productIds = posts
    .map((post) => post.productId)
    .filter((id): id is string => typeof id === "string" && isUuid(id));
  if (productIds.length === 0) {
    return posts;
  }

  let products: Product[] = [];
  try {
    products = await fetchProductsByIds(productIds);
  } catch {
    return posts;
  }

  const activeById = new Map(
    products.filter((product) => product.isActive).map((product) => [product.id, product])
  );

  return posts.map((post) => {
    if (!post.productId) {
      return post;
    }
    const linkedProduct = activeById.get(post.productId);
    if (!linkedProduct) {
      return post;
    }
    return {
      ...post,
      linkedProduct,
      isShopPost: true,
    };
  });
}

async function mapWorkerPostsToUserVideoPosts(
  rows: PostRow[],
  scope: UserVideoPostMappingScope,
  ownerProfilesById: Map<string, ProfileOwnerRow>
): Promise<UserVideoPost[]> {
  const normalized = rows
    .map((p) => normalizePostRow(p as MaybePostRow))
    .filter((p) => !p.is_deleted)
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  const carouselIds = normalized
    .filter((p) => p.type === "image_carousel")
    .map((p) => p.id);
  const mediaByPostId = await fetchPostMediaByPostIds(carouselIds);
  const mapped = normalized.map((row) =>
    mapRowToUserVideoPost(row, scope, ownerProfilesById.get(row.user_id), mediaByPostId)
  );
  return attachLinkedProductsToPosts(mapped);
}

async function fetchOwnerProfilesByIds(
  rows: PostRow[]
): Promise<Map<string, ProfileOwnerRow>> {
  const uniqueIds = Array.from(
    new Set(rows.map((row) => row.user_id).filter((id) => id.length > 0))
  );
  const validProfileIds = uniqueIds.filter(isUuid);
  if (validProfileIds.length === 0) {
    return new Map<string, ProfileOwnerRow>();
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", validProfileIds);

  if (error) {
    if (__DEV__) {
      console.warn("[postsService] owner profile fetch failed:", error.message);
    }
    return new Map<string, ProfileOwnerRow>();
  }

  return new Map(
    ((data ?? []) as ProfileOwnerRow[]).map((profile) => [profile.id, profile])
  );
}

/**
 * Profielposts: alleen rows voor de opgegeven gebruiker via Worker `?userPosts=1`.
 * @returns `undefined` als `json.posts` ontbreekt — caller moet state niet leegmaken.
 */
export async function fetchUserPosts(
  userId: string,
  scope: UserVideoPostMappingScope = "own_profile"
): Promise<UserVideoPost[] | undefined> {
  if (!userId || userId.length === 0) {
    return [];
  }

  const workerUrl = new URL(CLOUD_VIDEO_WORKER_BASE);
  workerUrl.searchParams.set("userPosts", "1");
  workerUrl.searchParams.set("userId", userId);

  const { res, json } = await fetchWorkerPostsJson(workerUrl.toString(), {
    method: "GET",
    headers: {
      "X-App-User-Id": userId,
    },
  });

  if (!res.ok || json.success === false) {
    throw new Error(json.message || "Worker fetch failed");
  }

  if (!Array.isArray(json.posts)) {
    return undefined;
  }

  const ownerProfilesById = await fetchOwnerProfilesByIds(json.posts);
  return await mapWorkerPostsToUserVideoPosts(json.posts, scope, ownerProfilesById);
}

export function userVideoPostFromPostRow(
  row: PostRow,
  mediaOverride?: ProfilePostMediaItem[]
): UserVideoPost {
  const map = new Map<string, ProfilePostMediaItem[]>();
  if (mediaOverride && mediaOverride.length > 0) {
    map.set(row.id, mediaOverride);
  }
  return mapRowToUserVideoPost(row, "own_profile", undefined, map);
}

export async function enrichPostWithLinkedProduct(
  post: UserVideoPost
): Promise<UserVideoPost> {
  const [enriched] = await attachLinkedProductsToPosts([post]);
  return enriched;
}

/**
 * Zelfde mapping als de globale Worker-feed, voor RPC-rows (bijv. `get_personalized_feed`).
 * Extra velden op de row (zoals `ranking_score`) vallen buiten `UserVideoPost` en worden niet in de UI gezet.
 */
export async function mapSupabasePostRowsToGlobalUserVideoPosts(
  raw: unknown[]
): Promise<UserVideoPost[]> {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [];
  }
  const asRows = raw as MaybePostRow[];
  const normalized = asRows
    .map((p) => normalizePostRow(p))
    .filter((p) => !p.is_deleted);
  if (normalized.length === 0) {
    return [];
  }
  const ownerProfilesById = await fetchOwnerProfilesByIds(normalized);
  const carouselIds = normalized
    .filter((p) => p.type === "image_carousel")
    .map((p) => p.id);
  const mediaByPostId = await fetchPostMediaByPostIds(carouselIds);
  const mapped = normalized.map((row) =>
    mapRowToUserVideoPost(row, "global", ownerProfilesById.get(row.user_id), mediaByPostId)
  );
  return attachLinkedProductsToPosts(mapped);
}

/**
 * Globale Reels-feed (gepagineerd): Worker `?posts=1&limit=&cursor=`.
 */
export async function fetchGlobalPostsPage(
  options: FetchGlobalPostsOptions = {}
): Promise<GlobalPostsPage> {
  const limit = clampGlobalPageLimit(options.limit);
  const workerUrl = new URL(CLOUD_VIDEO_WORKER_BASE);
  workerUrl.searchParams.set("posts", "1");
  workerUrl.searchParams.set("limit", String(limit));
  if (options.cursor) {
    workerUrl.searchParams.set("cursor", options.cursor);
  }

  const { res, json } = await fetchWorkerPostsJson(workerUrl.toString(), {
    method: "GET",
  });

  if (!res.ok || json.success === false) {
    throw new Error(json.message || "Worker fetch failed");
  }
  if (!Array.isArray(json.posts)) {
    return { posts: [], nextCursor: null, hasMore: false };
  }

  const ownerProfilesById = await fetchOwnerProfilesByIds(json.posts);
  const mapped = await mapWorkerPostsToUserVideoPosts(
    json.posts,
    "global",
    ownerProfilesById
  );

  return {
    posts: mapped,
    nextCursor:
      typeof json.nextCursor === "string" && json.nextCursor.length > 0
        ? json.nextCursor
        : null,
    hasMore: json.hasMore === true,
  };
}

/**
 * Volledige globale batch (legacy). Gebruik `fetchGlobalPostsPage` voor infinite scroll.
 *
 * @returns `undefined` als `json.posts` ontbreekt — caller moet state niet leegmaken.
 */
export async function fetchGlobalPosts(): Promise<UserVideoPost[] | undefined> {
  const workerUrl = new URL(CLOUD_VIDEO_WORKER_BASE);
  workerUrl.searchParams.set("posts", "1");
  const { res, json } = await fetchWorkerPostsJson(workerUrl.toString(), {
    method: "GET",
  });

  if (!res.ok || json.success === false) {
    throw new Error(json.message || "Worker fetch failed");
  }
  if (!Array.isArray(json.posts)) {
    return undefined;
  }

  const ownerProfilesById = await fetchOwnerProfilesByIds(json.posts);
  const mapped = await mapWorkerPostsToUserVideoPosts(json.posts, "global", ownerProfilesById);
  if (__DEV__) {
    const sample = json.posts.slice(0, 5).map((r) => ({
      id: r.id,
      rawTags: (r as { tags?: unknown }).tags,
      mappedTags: mapped.find((p) => p.id === r.id)?.tags ?? [],
    }));
    console.log("[fetchGlobalPosts] tag mapping sample", sample);
    logForYouControlledMix(mapped);
  }
  return mapped;
}

export const fetchGlobalVideoPosts = fetchGlobalPosts;
export const fetchUserVideoPosts = fetchUserPosts;

/**
 * Shop-feed: alleen posts met productlink (`is_shop_post`), nieuwste eerst.
 */
export async function fetchShopPosts(limit = 50): Promise<UserVideoPost[]> {
  const cap = Math.min(Math.max(1, limit), 100);
  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .eq("is_deleted", false)
    .eq("is_shop_post", true)
    .order("created_at", { ascending: false })
    .limit(cap);

  if (error) {
    throw new Error(error.message);
  }

  return mapSupabasePostRowsToGlobalUserVideoPosts(data ?? []);
}

export async function fetchPostsByProductId(
  productId: string,
  limit = 24
): Promise<UserVideoPost[]> {
  if (!isUuid(productId)) {
    return [];
  }
  const cap = Math.min(Math.max(1, limit), 60);
  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .eq("is_deleted", false)
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(cap);

  if (error) {
    throw new Error(error.message);
  }

  return mapSupabasePostRowsToGlobalUserVideoPosts(data ?? []);
}

/** Enkele post ophalen voor deep links / gedeelde URLs. */
export async function fetchPostById(
  postId: string
): Promise<UserVideoPost | null> {
  if (!isUuid(postId)) {
    return null;
  }

  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .eq("id", postId)
    .eq("is_deleted", false)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    return null;
  }

  const mapped = await mapSupabasePostRowsToGlobalUserVideoPosts([data]);
  return mapped[0] ?? null;
}

export type DeleteMyPostResult = {
  success?: boolean;
  post_id?: string;
  reason?: string;
};

/**
 * Soft-delete eigen post via Supabase RPC `delete_my_post` (RLS + auth.uid()).
 */
export async function deleteMyPost(postId: string): Promise<void> {
  if (!postId || postId.length === 0) {
    throw new Error("Ongeldige post.");
  }

  const { data, error } = await supabase.rpc("delete_my_post", {
    p_post_id: postId,
  });

  if (error) {
    throw new Error(error.message);
  }

  const result = (data ?? {}) as DeleteMyPostResult;
  if (result.success !== true) {
    if (result.reason === "not_found_or_not_owner") {
      throw new Error("Post niet gevonden of je bent niet de eigenaar.");
    }
    throw new Error("Verwijderen mislukt.");
  }
}

/** @deprecated Gebruik {@link deleteMyPost} — Worker soft-delete blijft voor legacy scripts. */
export async function softDeletePost(
  postId: string,
  authUserId: string
): Promise<void> {
  if (!authUserId || authUserId.length === 0) {
    return;
  }

  const u = new URL(CLOUD_VIDEO_WORKER_BASE);
  u.searchParams.set("softDelete", "1");
  u.searchParams.set("postId", postId);
  u.searchParams.set("userId", authUserId);

  const res = await fetch(u.toString(), {
    method: "GET",
    headers: {
      "X-App-User-Id": authUserId,
    },
  });

  let data: { success?: boolean; message?: string } = {};

  try {
    data = await res.json();
  } catch {
    /* ignore */
  }

  if (!res.ok || !data.success) {
    throw new Error(data.message || "Delete failed");
  }
}
