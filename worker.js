/**
 * Cloudflare Worker: R2 video + Supabase post metadata + Stripe Checkout.
 *
 * Secrets (set with `wrangler secret put <NAME>`; never in the app bundle):
 *   - SUPABASE_URL   e.g. https://xxxx.supabase.co
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - STRIPE_SECRET_KEY          sk_test_...
 *   - STRIPE_WEBHOOK_SECRET      whsec_...
 *   - CHECKOUT_SUCCESS_URL       optional (default lumen-fashion://checkout/success?session_id={CHECKOUT_SESSION_ID})
 *   - CHECKOUT_CANCEL_URL        optional (default lumen-fashion://checkout/cancel)
 *   - WORKER_PUBLIC_URL          optional HTTPS base for Stripe Connect return/refresh links
 *   - KVK_API_KEY                KVK Handelsregister API key (test key ok for KVK_API_BASE test URL)
 *   - KVK_API_BASE               optional (default https://api.kvk.nl/api/v1; test: https://api.kvk.nl/test/api/v1)
 *
 * Local dev: .dev.vars with the same names (not committed; see .dev.vars.example)
 */

import {
  handleCheckoutCancel,
  handleCheckoutReturn,
  handleStripeCheckout,
  handleStripeConfirm,
  handleStripeWebhook,
} from "./worker-stripe.js";
import {
  handleStripeConnectAccount,
  handleStripeConnectOnboardingLink,
  handleStripeConnectRefresh,
  handleStripeConnectReturn,
  handleStripeConnectStatus,
  handleStripeConnectDebug,
} from "./worker-stripe-connect.js";
import { handleKvkVerify } from "./worker-kvk.js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": [
    "Content-Type",
    "Range",
    "If-Range",
    "If-Modified-Since",
    "If-None-Match",
    "X-App-User-Id",
    "X-Post-Caption",
    "X-Post-Id",
  ].join(", "),
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, ETag",
};

const MP4 = "video/mp4";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

function hasSecret(env, name) {
  const value = env?.[name];
  return typeof value === "string" && value.length > 0;
}

/**
 * Parse an HTTP Range header like `bytes=0-1023`, `bytes=1024-` or `bytes=-1024`.
 * Returns null if absent, and throws on invalid/unsatisfiable format.
 * @param {string | null} rangeHeader
 * @param {number} totalSize
 * @returns {{ offset: number; length: number; end: number } | null}
 */
function parseHttpRange(rangeHeader, totalSize) {
  if (!rangeHeader || rangeHeader.length === 0) {
    return null;
  }
  const m = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!m) {
    throw new Error("Invalid Range header format");
  }
  const startRaw = m[1];
  const endRaw = m[2];
  if (!startRaw && !endRaw) {
    throw new Error("Range start and end are empty");
  }
  let start;
  let end;
  if (!startRaw && endRaw) {
    const suffixLen = Number(endRaw);
    if (!Number.isFinite(suffixLen) || suffixLen <= 0) {
      throw new Error("Invalid suffix range");
    }
    const clamped = Math.min(suffixLen, totalSize);
    start = totalSize - clamped;
    end = totalSize - 1;
  } else {
    start = Number(startRaw);
    if (!Number.isFinite(start) || start < 0 || start >= totalSize) {
      throw new Error("Range start out of bounds");
    }
    if (endRaw === "") {
      end = totalSize - 1;
    } else {
      end = Number(endRaw);
      if (!Number.isFinite(end) || end < start) {
        throw new Error("Invalid Range end");
      }
      if (end >= totalSize) {
        end = totalSize - 1;
      }
    }
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new Error("Invalid computed range");
  }
  const length = end - start + 1;
  if (length <= 0) {
    throw new Error("Invalid Range length");
  }
  return { offset: start, length, end };
}

function streamHeaders(object, totalSize, contentTypeOverride) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set(
    "Content-Type",
    contentTypeOverride || object.httpMetadata?.contentType || MP4
  );
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "public, max-age=31536000");
  // Prevent any intermediary/content-layer from compressing MP4 bytes.
  headers.set("Content-Encoding", "identity");
  if (object.httpEtag) {
    headers.set("ETag", object.httpEtag);
  }
  for (const [k, v] of Object.entries(cors)) {
    headers.set(k, v);
  }
  return headers;
}

const SUPABASE_KEY_HEADERS = (key) => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
});

/**
 * @param {string} fileName
 * @returns {boolean}
 */
function isAllowedVideoKey(fileName) {
  if (!fileName || typeof fileName !== "string") return false;
  if (fileName.length > 200 || fileName.includes("..") || fileName.includes("/")) {
    return false;
  }
  return /^video-\d+\.mp4$/.test(fileName);
}

/** Direct-to-R2 video keys: videos/<postUuid>/<timestamp>-<name>.(mp4|mov) */
function isAllowedDirectVideoR2Key(key) {
  if (!key || typeof key !== "string") return false;
  if (key.length > 280 || key.includes("..")) return false;
  return /^videos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-zA-Z0-9._-]+\.(mp4|mov)$/i.test(
    key
  );
}

function isAllowedStreamVideoKey(key) {
  return isAllowedVideoKey(key) || isAllowedDirectVideoR2Key(key);
}

function sanitizeVideoFileName(name) {
  if (!name || typeof name !== "string") return "video";
  const base = name.split(/[/\\]/).pop() || "video";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  return cleaned.length > 0 ? cleaned : "video";
}

function buildDirectVideoR2Key(postId, fileName, contentType) {
  const safe = sanitizeVideoFileName(fileName);
  const ext = (contentType || "").toLowerCase().includes("quicktime") ? "mov" : "mp4";
  const stem = safe.replace(/\.(mp4|mov)$/i, "") || "video";
  return `videos/${postId}/${Date.now()}-${stem}.${ext}`;
}

function isAllowedVideoContentType(ct) {
  const c = (ct || "").toLowerCase();
  return c === "video/mp4" || c === "video/quicktime";
}

/**
 * @param {Request} request
 * @param {URL} url
 * @param {any} env
 */
async function handleUploadInit(request, url, env) {
  const headerUserId = (
    request.headers.get("X-App-User-Id") ||
    request.headers.get("x-app-user-id") ||
    ""
  ).trim();
  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ success: false, message: "Invalid JSON body" }, 400);
  }
  const postId = typeof body.postId === "string" ? body.postId.trim() : "";
  const userId =
    (typeof body.userId === "string" ? body.userId.trim() : "") || headerUserId;
  if (!userId) {
    return json({ success: false, message: "userId required" }, 400);
  }
  if (headerUserId && headerUserId !== userId) {
    return json({ success: false, message: "userId mismatch with header" }, 403);
  }
  if (!isStandardUuid(postId)) {
    return json({ success: false, message: "invalid postId (UUID required)" }, 400);
  }
  const contentType = typeof body.contentType === "string" ? body.contentType : "";
  if (!isAllowedVideoContentType(contentType)) {
    return json(
      {
        success: false,
        message: "contentType must be video/mp4 or video/quicktime",
      },
      400
    );
  }
  const fileName =
    typeof body.fileName === "string" && body.fileName.length > 0
      ? body.fileName
      : "video.mp4";
  const r2Key = buildDirectVideoR2Key(postId, fileName, contentType);
  const uploadUrl = new URL(url.origin + url.pathname);
  uploadUrl.search = "";
  uploadUrl.searchParams.set("videoPut", "1");
  uploadUrl.searchParams.set("r2Key", r2Key);
  uploadUrl.searchParams.set("userId", userId);
  const publicVideoUrl = getPublicVideoUrl(request, r2Key);
  return json({
    success: true,
    uploadUrl: uploadUrl.toString(),
    r2Key,
    publicVideoUrl,
    postId,
  });
}

/**
 * Stream PUT body naar R2 (geen multipart buffering in Worker).
 * @param {Request} request
 * @param {URL} url
 * @param {any} env
 */
async function handleVideoPut(request, url, env) {
  const r2Key = url.searchParams.get("r2Key") || "";
  const queryUserId = (url.searchParams.get("userId") || "").trim();
  const headerUserId = (
    request.headers.get("X-App-User-Id") ||
    request.headers.get("x-app-user-id") ||
    ""
  ).trim();
  const userId = headerUserId || queryUserId;
  if (!userId) {
    return json({ success: false, message: "userId required" }, 400);
  }
  if (queryUserId && headerUserId && queryUserId !== headerUserId) {
    return json({ success: false, message: "userId mismatch" }, 403);
  }
  if (!isAllowedDirectVideoR2Key(r2Key)) {
    return json({ success: false, message: "invalid r2Key" }, 400);
  }
  const contentType = request.headers.get("Content-Type") || "video/mp4";
  if (!isAllowedVideoContentType(contentType)) {
    return json({ success: false, message: "invalid Content-Type for video PUT" }, 400);
  }
  if (!request.body) {
    return json({ success: false, message: "empty upload body" }, 400);
  }
  try {
    await env.VIDEOS.put(r2Key, request.body, {
      httpMetadata: { contentType },
    });
    const head = await env.VIDEOS.head(r2Key);
    if (!head || typeof head.size !== "number" || head.size <= 0) {
      return json({ success: false, message: "upload stored but object is empty" }, 400);
    }
    return json({ success: true, r2Key, size: head.size });
  } catch (e) {
    return json(
      { success: false, message: (e && e.message) || String(e) },
      500
    );
  }
}

/**
 * @param {Request} request
 * @param {any} env
 */
async function handleUploadComplete(request, env) {
  const headerUserId = (
    request.headers.get("X-App-User-Id") ||
    request.headers.get("x-app-user-id") ||
    ""
  ).trim();
  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ success: false, message: "Invalid JSON body" }, 400);
  }
  const postId = typeof body.postId === "string" ? body.postId.trim() : "";
  const userId =
    (typeof body.userId === "string" ? body.userId.trim() : "") || headerUserId;
  const r2Key = typeof body.r2Key === "string" ? body.r2Key.trim() : "";
  if (!userId) {
    return json({ success: false, message: "userId required" }, 400);
  }
  if (headerUserId && headerUserId !== userId) {
    return json({ success: false, message: "userId mismatch with header" }, 403);
  }
  if (!isStandardUuid(postId)) {
    return json({ success: false, message: "invalid postId" }, 400);
  }
  if (!isAllowedDirectVideoR2Key(r2Key) || !r2Key.startsWith(`videos/${postId}/`)) {
    return json({ success: false, message: "invalid r2Key for postId" }, 400);
  }
  const head = await env.VIDEOS.head(r2Key);
  if (!head || typeof head.size !== "number" || head.size <= 0) {
    return json(
      {
        success: false,
        message: "video not found in storage; upload PUT first",
      },
      400
    );
  }
  const videoUrl =
    typeof body.videoUrl === "string" && body.videoUrl.length > 0
      ? body.videoUrl
      : getPublicVideoUrl(request, r2Key);
  const thumbnailUrl =
    typeof body.thumbnailUrl === "string" && body.thumbnailUrl.length > 0
      ? body.thumbnailUrl
      : null;
  const caption = typeof body.caption === "string" ? body.caption : "";
  const tagsRaw = body.tags;
  const tagsArray = Array.isArray(tagsRaw)
    ? tagsRaw
    : typeof tagsRaw === "string"
      ? (() => {
          try {
            return JSON.parse(tagsRaw);
          } catch {
            return [];
          }
        })()
      : [];
  const productRaw = {
    productId: body.productId ?? body.product_id,
    productTitle: body.productTitle,
    productUrl: body.productUrl,
    productBrand: body.productBrand,
    productPriceText: body.productPriceText,
  };
  const audioFields = sanitizeVideoAudioFromBody(env, body);
  try {
    const post = await insertPostRow(
      env,
      userId,
      r2Key,
      videoUrl,
      thumbnailUrl,
      caption,
      postId,
      tagsArray,
      productRaw,
      audioFields
    );
    return json({
      success: true,
      post,
      createdPost: post,
      fileName: r2Key,
      videoUrl,
      thumbnailUrl,
      r2Key,
    });
  } catch (e) {
    const msg = (e && e.message) || String(e);
    const status =
      typeof msg === "string" && msg.includes("Product URL") ? 400 : 500;
    return json(
      {
        success: false,
        message: msg,
        hint:
          status === 500
            ? "R2 object exists; Supabase insert failed."
            : undefined,
      },
      status
    );
  }
}

/**
 * Kleine thumbnail multipart (video zelf gaat via direct PUT).
 * @param {Request} request
 * @param {any} env
 */
async function handleUploadThumbnail(request, env) {
  const userId = (
    request.headers.get("X-App-User-Id") ||
    request.headers.get("x-app-user-id") ||
    ""
  ).trim();
  if (!userId) {
    return json({ success: false, message: "userId required" }, 400);
  }
  const postId = (
    request.headers.get("X-Post-Id") ||
    request.headers.get("x-post-id") ||
    ""
  ).trim();
  if (!isStandardUuid(postId)) {
    return json({ success: false, message: "invalid X-Post-Id" }, 400);
  }
  const ct = request.headers.get("Content-Type") || "";
  if (!ct.toLowerCase().includes("multipart/form-data")) {
    return json({ success: false, message: "multipart/form-data required" }, 400);
  }
  const fd = await request.formData();
  const maybeThumb = fd.get("thumbnail");
  if (
    !maybeThumb ||
    typeof maybeThumb !== "object" ||
    !("stream" in maybeThumb) ||
    !("size" in maybeThumb)
  ) {
    return json({ success: false, message: "thumbnail field required" }, 400);
  }
  const thumbSize =
    typeof maybeThumb.size === "number" && Number.isFinite(maybeThumb.size)
      ? maybeThumb.size
      : 0;
  if (thumbSize <= 0) {
    return json({ success: false, message: "thumbnail is empty" }, 400);
  }
  const thumbnailKey = `thumbnails/thumb-${Date.now()}.jpg`;
  try {
    await env.VIDEOS.put(thumbnailKey, maybeThumb.stream(), {
      httpMetadata: { contentType: "image/jpeg" },
    });
  } catch (e) {
    return json(
      { success: false, message: (e && e.message) || String(e) },
      500
    );
  }
  const thumbnailUrl = getPublicThumbnailUrl(request, thumbnailKey);
  return json({ success: true, thumbnailUrl, thumbnailKey });
}

/**
 * @param {string} fileName
 * @returns {boolean}
 */
function isAllowedThumbnailKey(fileName) {
  if (!fileName || typeof fileName !== "string") return false;
  if (fileName.length > 240 || fileName.includes("..")) {
    return false;
  }
  return /^thumbnails\/thumb-\d+\.jpg$/i.test(fileName);
}

/**
 * Carousel still images: images/<postUuid>/<timestamp>-<index>.<ext>
 * @param {string} key
 * @returns {boolean}
 */
function isAllowedPostImageKey(key) {
  if (!key || typeof key !== "string") return false;
  if (key.length > 280 || key.includes("..")) {
    return false;
  }
  return /^images\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/\d+-\d+\.(jpe?g|png|webp)$/i.test(
    key
  );
}

/**
 * @param {string} id
 * @returns {boolean}
 */
function isUuidLike(id) {
  if (!id || typeof id !== "string" || id.length < 20 || id.length > 100) return false;
  // UUID (with hyphens) or cuid — posts.id is uuid in DB; accept standard UUID
  return /^[0-9a-f-]{16,50}$/i.test(id);
}

/** Strikte UUID voor posts.id / X-Post-Id (match met app + FK post_likes). */
function isStandardUuid(s) {
  return (
    typeof s === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  );
}

const DEFAULT_POST_CAPTION = "Nieuwe look";
const MAX_POST_CAPTION_CHARS = 150;

/**
 * @param {unknown} raw
 * @returns {string}
 */
function normalizeCaptionForStorage(raw) {
  if (raw == null || raw === "") {
    return DEFAULT_POST_CAPTION;
  }
  const s = String(raw).trim().slice(0, MAX_POST_CAPTION_CHARS);
  return s.length > 0 ? s : DEFAULT_POST_CAPTION;
}

const POST_AUDIO_SOURCES = new Set([
  "none",
  "user_upload",
  "app_library",
  "external",
]);

/**
 * @param {any} env
 * @param {unknown} raw
 * @returns {string | null}
 */
function sanitizePostAudioUrl(env, raw) {
  if (raw == null || typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const base = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  if (!base) {
    return null;
  }
  const prefix = `${base}/storage/v1/object/public/post-audio/`;
  if (!trimmed.startsWith(prefix)) {
    return null;
  }
  return trimmed;
}

/** Lege/uitgeschakelde audio-velden voor posts zonder geldige audio. */
function emptyPostAudioFields() {
  return {
    audio_url: null,
    audio_title: null,
    audio_artist: null,
    audio_source: "none",
    audio_start_ms: 0,
    audio_volume: 1,
    audio_duration_ms: null,
  };
}

/**
 * Generieke audio-sanitizer voor zowel foto-carousel (FormData) als video (JSON).
 * @param {any} env
 * @param {(key: string) => unknown} get
 * @returns {Record<string, unknown>}
 */
function sanitizePostAudioFields(env, get) {
  const url = sanitizePostAudioUrl(env, get("audioUrl"));
  if (!url) {
    return emptyPostAudioFields();
  }

  const titleRaw = get("audioTitle");
  const artistRaw = get("audioArtist");
  const sourceRaw = get("audioSource");
  const startRaw = get("audioStartMs");
  const volumeRaw = get("audioVolume");
  const durationRaw = get("audioDurationMs");

  let audioSource = "user_upload";
  if (typeof sourceRaw === "string" && POST_AUDIO_SOURCES.has(sourceRaw)) {
    audioSource = sourceRaw;
  }

  let audioStartMs = 0;
  if (typeof startRaw === "string" || typeof startRaw === "number") {
    const n = Number(startRaw);
    if (Number.isFinite(n) && n >= 0) {
      audioStartMs = Math.floor(n);
    }
  }

  let audioVolume = 1;
  if (typeof volumeRaw === "string" || typeof volumeRaw === "number") {
    const n = Number(volumeRaw);
    if (Number.isFinite(n)) {
      audioVolume = Math.min(1, Math.max(0, n));
    }
  }

  let audioDurationMs = null;
  if (typeof durationRaw === "string" || typeof durationRaw === "number") {
    const n = Number(durationRaw);
    if (Number.isFinite(n) && n > 0) {
      audioDurationMs = Math.floor(n);
    }
  }

  const audioTitle =
    typeof titleRaw === "string" && titleRaw.trim().length > 0
      ? titleRaw.trim().slice(0, 120)
      : "Eigen audio";
  const audioArtist =
    typeof artistRaw === "string" && artistRaw.trim().length > 0
      ? artistRaw.trim().slice(0, 120)
      : null;

  return {
    audio_url: url,
    audio_title: audioTitle,
    audio_artist: audioArtist,
    audio_source: audioSource,
    audio_start_ms: audioStartMs,
    audio_volume: audioVolume,
    audio_duration_ms: audioDurationMs,
  };
}

/**
 * @param {any} env
 * @param {FormData} fd
 * @returns {Record<string, unknown>}
 */
function sanitizeCarouselAudioFromForm(env, fd) {
  return sanitizePostAudioFields(env, (key) => fd.get(key));
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} body
 * @returns {Record<string, unknown>}
 */
function sanitizeVideoAudioFromBody(env, body) {
  const src = body && typeof body === "object" ? body : {};
  return sanitizePostAudioFields(env, (key) => src[key]);
}

/** Client stuurt JSON-array; server-side opschoning (max 10, max 30 chars). */
function sanitizeWorkerTags(arr) {
  if (!Array.isArray(arr)) {
    return [];
  }
  const out = [];
  const seen = new Set();
  for (const item of arr) {
    if (typeof item !== "string") {
      continue;
    }
    let t = item.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!t) {
      continue;
    }
    if (t.length > 30) {
      t = t.slice(0, 30);
    }
    if (seen.has(t)) {
      continue;
    }
    seen.add(t);
    out.push(t);
    if (out.length >= 10) {
      break;
    }
  }
  return out;
}

const MAX_PRODUCT_TITLE = 80;
const MAX_PRODUCT_URL = 500;
const MAX_PRODUCT_BRAND = 60;
const MAX_PRODUCT_PRICE = 40;

/**
 * @param {unknown} v
 * @returns {string}
 */
function trimProductField(v) {
  if (v == null) {
    return "";
  }
  return String(v).trim();
}

/**
 * @param {Record<string, unknown> | null | undefined} raw
 * @returns {{ fields: Record<string, unknown> } | { error: string }}
 */
function sanitizeProductFields(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const title = trimProductField(src.productTitle ?? src.product_title).slice(
    0,
    MAX_PRODUCT_TITLE
  );
  const brand = trimProductField(src.productBrand ?? src.product_brand).slice(
    0,
    MAX_PRODUCT_BRAND
  );
  const price = trimProductField(
    src.productPriceText ?? src.product_price_text
  ).slice(0, MAX_PRODUCT_PRICE);
  let url = trimProductField(src.productUrl ?? src.product_url).slice(
    0,
    MAX_PRODUCT_URL
  );

  if (url.length > 0 && !/^https?:\/\//i.test(url)) {
    return { error: "Product URL must start with http:// or https://" };
  }

  if (url.length === 0) {
    return {
      fields: {
        product_title: null,
        product_url: null,
        product_brand: null,
        product_price_text: null,
        is_shop_post: false,
      },
    };
  }

  return {
    fields: {
      product_title: title.length > 0 ? title : null,
      product_url: url,
      product_brand: brand.length > 0 ? brand : null,
      product_price_text: price.length > 0 ? price : null,
      is_shop_post: true,
    },
  };
}

/**
 * @param {any} env
 * @param {string} userId
 * @param {string} productId
 * @returns {Promise<{ productId: string } | { error: string }>}
 */
async function validateOwnedActiveProduct(env, userId, productId) {
  if (!isStandardUuid(productId)) {
    return { error: "invalid productId (UUID required)" };
  }
  if (!isStandardUuid(userId)) {
    return { error: "invalid userId for product validation" };
  }
  const path =
    `/products?id=eq.${encodeURIComponent(productId)}` +
    `&owner_id=eq.${encodeURIComponent(userId)}` +
    `&is_active=eq.true&select=id&limit=1`;
  const rows = await supabaseRequest(env, "GET", path);
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      error: "Product not found, inactive, or not owned by uploader",
    };
  }
  return { productId };
}

/**
 * Catalog product_id takes precedence over legacy product_url fields.
 * @param {any} env
 * @param {string} userId
 * @param {Record<string, unknown> | null | undefined} raw
 * @returns {Promise<{ fields: Record<string, unknown> } | { error: string }>}
 */
async function resolveProductFieldsForInsert(env, userId, raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const productId = trimProductField(src.productId ?? src.product_id);

  if (productId.length > 0) {
    const validated = await validateOwnedActiveProduct(env, userId, productId);
    if ("error" in validated) {
      return validated;
    }
    return {
      fields: {
        product_id: validated.productId,
        is_shop_post: true,
      },
    };
  }

  const urlSanitized = sanitizeProductFields(raw);
  if ("error" in urlSanitized) {
    return urlSanitized;
  }
  return urlSanitized;
}

/**
 * @param {FormData} fd
 * @returns {Record<string, unknown>}
 */
function productRawFromFormData(fd) {
  return {
    productId: fd.get("productId"),
    productTitle: fd.get("productTitle"),
    productUrl: fd.get("productUrl"),
    productBrand: fd.get("productBrand"),
    productPriceText: fd.get("productPriceText"),
  };
}

/**
 * @param {Request} request
 * @param {string} fileName
 * @returns {string}
 */
function getPublicVideoUrl(request, fileName) {
  const u = new URL(request.url);
  u.hash = "";
  u.search = "";
  u.searchParams.set("file", fileName);
  return u.toString();
}

/**
 * @param {Request} request
 * @param {string} thumbnailKey
 * @returns {string}
 */
function getPublicThumbnailUrl(request, thumbnailKey) {
  const u = new URL(request.url);
  u.hash = "";
  u.search = "";
  u.searchParams.set("thumb", thumbnailKey);
  return u.toString();
}

/**
 * @param {Request} request
 * @param {string} imageKey
 * @returns {string}
 */
function getPublicPostImageUrl(request, imageKey) {
  const u = new URL(request.url);
  u.hash = "";
  u.search = "";
  u.searchParams.set("img", imageKey);
  return u.toString();
}

/** @param {any} env */
function getSupabaseBase(env) {
  const s = env.SUPABASE_URL;
  if (typeof s !== "string" || s.length < 8) {
    return null;
  }
  return s.replace(/\/$/, "");
}

/**
 * @param {any} env
 * @param {string} method
 * @param {string} pathWithQuery
 * @param {string} [jsonBody]
 * @param {{ preferRepresentation?: boolean }} [opts]
 */
async function supabaseRequest(env, method, pathWithQuery, jsonBody, opts) {
  const base = getSupabaseBase(env);
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Worker secrets");
  }
  const headers = { ...SUPABASE_KEY_HEADERS(key) };
  if (method === "GET" || method === "HEAD") {
    delete headers["Content-Type"];
    headers["Accept"] = "application/json";
  }
  if (method === "POST" && jsonBody != null && (opts == null || opts.preferRepresentation !== false)) {
    headers["Prefer"] = "return=representation";
  }
  const res = await fetch(`${base}/rest/v1${pathWithQuery}`, {
    method,
    headers,
    body: jsonBody != null ? jsonBody : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`PostgREST ${res.status}: ${text.slice(0, 500)}`);
  }
  if (res.status === 204 || !text || text.length === 0) {
    return null;
  }
  if (text === "null") {
    return null;
  }
  return JSON.parse(text);
}

/**
 * @param {import("./worker").Env} env
 * @param {string} userId
 * @param {string} fileName
 * @param {string} videoUrl
 * @param {string | null} thumbnailUrl
 * @param {string} [caption]
 * @param {string | null} [explicitPostId] — optioneel door client (header X-Post-Id); zelfde id als in public.posts.
 * @param {string[]} [tagsArray] — text[] in public.posts.tags
 * @param {Record<string, unknown> | null} [productRaw]
 * @param {Record<string, unknown> | null} [audioFields] — geschoonde audio-metadata (optioneel)
 */
async function insertPostRow(
  env,
  userId,
  fileName,
  videoUrl,
  thumbnailUrl,
  caption,
  explicitPostId,
  tagsArray,
  productRaw,
  audioFields
) {
  const tagsClean = sanitizeWorkerTags(tagsArray || []);
  const productResolved = await resolveProductFieldsForInsert(env, userId, productRaw);
  if ("error" in productResolved) {
    throw new Error(productResolved.error);
  }
  const row = {
    user_id: userId,
    type: "video",
    video_url: videoUrl,
    r2_key: fileName,
    thumbnail_url: thumbnailUrl || null,
    filename: fileName,
    caption: normalizeCaptionForStorage(caption),
    likes_count: 0,
    comments_count: 0,
    tags: tagsClean.length > 0 ? tagsClean : [],
    ...productResolved.fields,
    ...(audioFields && typeof audioFields === "object" ? audioFields : {}),
  };
  if (explicitPostId && isStandardUuid(explicitPostId)) {
    row.id = explicitPostId;
  }
  const result = await supabaseRequest(
    env,
    "POST",
    "/posts?select=*",
    JSON.stringify(row),
    { preferRepresentation: true }
  );
  if (Array.isArray(result) && result.length > 0) {
    console.log("[created post]", result[0]);
    return result[0];
  }
  if (result && result.id) {
    console.log("[created post]", result);
    return result;
  }
  throw new Error("Insert did not return a post row");
}

/**
 * @param {string} mime
 * @returns {"jpg"|"png"|"webp"}
 */
function imageExtFromMime(mime) {
  const m = (mime || "").toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  return "jpg";
}

/**
 * @param {"jpg"|"png"|"webp"} ext
 * @returns {string}
 */
function imageContentTypeForExt(ext) {
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

/**
 * @param {any} env
 * @param {string} userId
 * @param {string} firstKey
 * @param {string | null} thumbnailUrl
 * @param {string} caption
 * @param {string | null} explicitPostId
 * @param {string[]} tagsArray
 * @param {Record<string, unknown> | null} [productRaw]
 * @param {Record<string, unknown> | null} [audioFields]
 */
async function insertCarouselPostRow(
  env,
  userId,
  firstKey,
  thumbnailUrl,
  caption,
  explicitPostId,
  tagsArray,
  productRaw,
  audioFields
) {
  const tagsClean = sanitizeWorkerTags(tagsArray || []);
  const productResolved = await resolveProductFieldsForInsert(env, userId, productRaw);
  if ("error" in productResolved) {
    throw new Error(productResolved.error);
  }
  const row = {
    user_id: userId,
    type: "image_carousel",
    video_url: null,
    r2_key: firstKey,
    thumbnail_url: thumbnailUrl || null,
    filename: firstKey,
    caption: normalizeCaptionForStorage(caption),
    likes_count: 0,
    comments_count: 0,
    tags: tagsClean.length > 0 ? tagsClean : [],
    ...productResolved.fields,
    ...(audioFields && typeof audioFields === "object" ? audioFields : {}),
  };
  if (explicitPostId && isStandardUuid(explicitPostId)) {
    row.id = explicitPostId;
  }
  const result = await supabaseRequest(
    env,
    "POST",
    "/posts?select=*",
    JSON.stringify(row),
    { preferRepresentation: true }
  );
  if (Array.isArray(result) && result.length > 0) {
    return result[0];
  }
  if (result && result.id) {
    return result;
  }
  throw new Error("Insert did not return a post row");
}

/**
 * @param {any} env
 * @param {Array<{ post_id: string; media_type: string; url: string; r2_key: string; sort_order: number }>} rows
 * @returns {Promise<any[]>}
 */
async function insertPostMediaRows(env, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }
  const result = await supabaseRequest(
    env,
    "POST",
    "/post_media?select=*",
    JSON.stringify(rows),
    { preferRepresentation: true }
  );
  if (Array.isArray(result)) {
    return result;
  }
  if (result) {
    return [result];
  }
  return [];
}

/**
 * Global feed (?posts=1): alleen rijen uit Supabase public.posts (zelfde ids als inserts).
 * @param {any} env
 */
async function fetchPostsForUser(env) {
  const path =
    "/posts?select=*" +
    "&is_deleted=eq.false" +
    "&order=created_at.desc";
  return await supabaseRequest(env, "GET", path);
}

/**
 * Profiel (?userPosts=1): alleen posts van één gebruiker.
 * @param {any} env
 * @param {string} userId
 */
async function fetchPostsByUserId(env, userId) {
  const path =
    "/posts?select=*" +
    "&user_id=eq." + encodeURIComponent(userId) +
    "&is_deleted=eq.false" +
    "&order=created_at.desc";
  return await supabaseRequest(env, "GET", path);
}

/**
 * Keep only posts whose referenced R2 object exists and has bytes.
 * Hides historical broken rows that point to missing/empty video blobs.
 * @param {any} env
 * @param {any[]} posts
 * @returns {Promise<any[]>}
 */
async function filterValidVideoPosts(env, posts) {
  if (!Array.isArray(posts) || posts.length === 0) {
    return [];
  }
  const checks = posts.map(async (post) => {
    const key = typeof post?.r2_key === "string" ? post.r2_key.trim() : "";
    if (!key) {
      return null;
    }
    try {
      const head = await env.VIDEOS.head(key);
      if (!head || typeof head.size !== "number" || head.size <= 0) {
        console.log("[posts] hidden invalid video", {
          id: post?.id ?? null,
          key,
          reason: !head ? "missing" : "empty",
          size: head?.size ?? null,
        });
        return null;
      }
      return post;
    } catch (e) {
      console.log("[posts] hidden invalid video", {
        id: post?.id ?? null,
        key,
        reason: "head_error",
        error: (e && e.message) || String(e),
      });
      return null;
    }
  });
  const resolved = await Promise.all(checks);
  return resolved.filter(Boolean);
}

/** @param {any} env */
async function softDeletePostForUser(env, postId, userId) {
  const filter =
    "id=eq." + encodeURIComponent(postId) + "&user_id=eq." + encodeURIComponent(userId);
  await supabaseRequest(
    env,
    "PATCH",
    "/posts?" + filter,
    JSON.stringify({ is_deleted: true }),
    { preferRepresentation: false }
  );
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { ...cors } });
    }

    const url = new URL(request.url);

    if (request.method === "PUT" && url.searchParams.get("videoPut") === "1") {
      return handleVideoPut(request, url, env);
    }
    const file = url.searchParams.get("file");
    const thumb = url.searchParams.get("thumb");
    const img = url.searchParams.get("img");
    const debugFile = url.searchParams.get("debugFile");
    if (request.method === "GET" && thumb) {
      if (!isAllowedThumbnailKey(thumb)) {
        return new Response("Invalid thumbnail", { status: 400, headers: { ...cors } });
      }
      const object = await env.VIDEOS.get(thumb);
      if (object === null) {
        return new Response("Not found", { status: 404, headers: { ...cors } });
      }
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("Content-Type", object.httpMetadata?.contentType || "image/jpeg");
      headers.set("Cache-Control", "public, max-age=31536000");
      for (const [k, v] of Object.entries(cors)) {
        headers.set(k, v);
      }
      return new Response(object.body, { status: 200, headers });
    }

    if (request.method === "GET" && img) {
      if (!isAllowedPostImageKey(img)) {
        return new Response("Invalid image key", { status: 400, headers: { ...cors } });
      }
      const object = await env.VIDEOS.get(img);
      if (object === null) {
        return new Response("Not found", { status: 404, headers: { ...cors } });
      }
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set(
        "Content-Type",
        object.httpMetadata?.contentType || "image/jpeg"
      );
      headers.set("Cache-Control", "public, max-age=31536000");
      for (const [k, v] of Object.entries(cors)) {
        headers.set(k, v);
      }
      return new Response(object.body, { status: 200, headers });
    }

    if (request.method === "GET" && debugFile) {
      if (!isAllowedVideoKey(debugFile)) {
        return json({ error: "invalid debugFile" }, 400);
      }
      const object = await env.VIDEOS.get(debugFile);
      if (object === null) {
        return json({
          exists: false,
          file: debugFile,
        });
      }
      return json({
        exists: true,
        size: object.size,
        contentType: object.httpMetadata?.contentType || null,
        uploaded: object.uploaded || null,
        key: debugFile,
      });
    }

    if (request.method === "GET" && url.searchParams.get("posts") === "1") {
      try {
        const posts = await fetchPostsForUser(env);
        const validPosts = Array.isArray(posts) ? posts : [];
        console.log("[posts] fetched", {
          mode: "global",
          total: Array.isArray(posts) ? posts.length : 0,
          valid: validPosts.length,
        });
        return new Response(JSON.stringify({ success: true, posts: validPosts }), {
          headers: { "Content-Type": "application/json", ...cors },
        });
      } catch (e) {
        return new Response(
          JSON.stringify({ success: false, message: (e && e.message) || String(e) }),
          { status: 500, headers: { "Content-Type": "application/json", ...cors } }
        );
      }
    }

    if (request.method === "GET" && url.searchParams.get("userPosts") === "1") {
      const userId =
        request.headers.get("X-App-User-Id") ||
        url.searchParams.get("userId");
      if (!userId || userId.length < 1) {
        return new Response(JSON.stringify({ message: "userId required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...cors },
        });
      }
      try {
        const posts = await fetchPostsByUserId(env, userId);
        const validPosts = Array.isArray(posts) ? posts : [];
        console.log("[posts] fetched", {
          mode: "user",
          userId,
          total: Array.isArray(posts) ? posts.length : 0,
          valid: validPosts.length,
        });
        return new Response(JSON.stringify({ success: true, posts: validPosts }), {
          headers: { "Content-Type": "application/json", ...cors },
        });
      } catch (e) {
        return new Response(
          JSON.stringify({ success: false, message: (e && e.message) || String(e) }),
          { status: 500, headers: { "Content-Type": "application/json", ...cors } }
        );
      }
    }

    if (request.method === "GET" && url.searchParams.get("softDelete") === "1") {
      const postId = url.searchParams.get("postId");
      const userId =
        request.headers.get("X-App-User-Id") ||
        url.searchParams.get("userId");
      if (!isUuidLike(postId || "")) {
        return new Response(JSON.stringify({ message: "invalid postId" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...cors },
        });
      }
      if (!userId || userId.length < 1) {
        return new Response(JSON.stringify({ message: "userId required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...cors },
        });
      }
      try {
        await softDeletePostForUser(env, postId, userId);
        return new Response(JSON.stringify({ success: true }), {
          headers: { "Content-Type": "application/json", ...cors },
        });
      } catch (e) {
        return new Response(
          JSON.stringify({ success: false, message: (e && e.message) || String(e) }),
          { status: 500, headers: { "Content-Type": "application/json", ...cors } }
        );
      }
    }

    if (request.method === "GET" && url.searchParams.get("debugEnv") === "1") {
      return json({
        hasStripeSecret: hasSecret(env, "STRIPE_SECRET_KEY"),
        hasWebhookSecret: hasSecret(env, "STRIPE_WEBHOOK_SECRET"),
        hasSupabaseUrl: hasSecret(env, "SUPABASE_URL"),
        hasServiceRole: hasSecret(env, "SUPABASE_SERVICE_ROLE_KEY"),
      });
    }

    if ((request.method === "GET" || request.method === "HEAD") && file) {
      if (!isAllowedStreamVideoKey(file)) {
        return new Response("Invalid file", { status: 400, headers: { ...cors } });
      }

      const rangeHeader = request.headers.get("Range");
      const headObject = await env.VIDEOS.head(file);
      if (headObject === null) {
        return new Response("Not found", { status: 404, headers: { ...cors } });
      }
      const totalSize = headObject.size;

      console.log("[stream] request", {
        method: request.method,
        file,
        range: rangeHeader || "",
      });

      let parsedRange = null;
      try {
        parsedRange = parseHttpRange(rangeHeader, totalSize);
      } catch (e) {
        console.log("[stream] range-parse-error", {
          file,
          range: rangeHeader || "",
          error: (e && e.message) || String(e),
          totalSize,
        });
        const errHeaders = new Headers({
          ...cors,
          "Content-Type": "video/mp4",
          "Accept-Ranges": "bytes",
          "Content-Range": `bytes */${totalSize}`,
        });
        return new Response("Range Not Satisfiable", { status: 416, headers: errHeaders });
      }
      console.log("[stream] parsed-range", {
        file,
        range: rangeHeader || "",
        parsed: parsedRange,
        totalSize,
      });

      const object = parsedRange
        ? await env.VIDEOS.get(file, {
            range: { offset: parsedRange.offset, length: parsedRange.length },
          })
        : await env.VIDEOS.get(file);

      if (object === null) {
        return new Response("Not found", { status: 404, headers: { ...cors } });
      }

      const headers = streamHeaders(object, totalSize);

      const status = parsedRange ? 206 : 200;
      if (parsedRange) {
        headers.set(
          "Content-Range",
          `bytes ${parsedRange.offset}-${parsedRange.end}/${totalSize}`
        );
        headers.set("Content-Length", String(parsedRange.length));
      } else {
        headers.set("Content-Length", String(totalSize));
      }

      console.log("[stream] r2", {
        file,
        size: totalSize,
        r2ContentType: object.httpMetadata?.contentType || "",
      });
      console.log("[stream] response", {
        file,
        status,
        contentType: headers.get("Content-Type") || "",
        contentLength: headers.get("Content-Length") || "",
        contentRange: headers.get("Content-Range") || "",
      });

      if (request.method === "HEAD") {
        return new Response(null, { status, headers });
      }
      return new Response(object.body, { status, headers });
    }

    if (request.method === "GET" && url.searchParams.get("checkoutReturn") === "1") {
      return handleCheckoutReturn(request, url, env, cors);
    }

    if (request.method === "GET" && url.searchParams.get("checkoutCancel") === "1") {
      return handleCheckoutCancel(request, url, env, cors);
    }

    if (request.method === "GET" && url.searchParams.get("stripeConfirm") === "1") {
      return handleStripeConfirm(request, url, env, cors);
    }

    if (request.method === "GET" && url.searchParams.get("stripeConnectReturn") === "1") {
      return handleStripeConnectReturn(request, url, env, cors);
    }

    if (request.method === "GET" && url.searchParams.get("stripeConnectRefresh") === "1") {
      return handleStripeConnectRefresh(request, url, env, cors);
    }

    if (request.method === "GET" && url.searchParams.get("stripeConnectStatus") === "1") {
      return handleStripeConnectStatus(request, env, cors);
    }

    if (request.method === "GET" && url.searchParams.get("stripeConnectDebug") === "1") {
      return handleStripeConnectDebug(request, env, cors);
    }

    if (request.method === "POST") {
      if (url.searchParams.get("stripeCheckout") === "1") {
        return handleStripeCheckout(request, env, cors);
      }
      if (url.searchParams.get("stripeConnectAccount") === "1") {
        return handleStripeConnectAccount(request, env, cors);
      }
      if (url.searchParams.get("stripeConnectOnboardingLink") === "1") {
        return handleStripeConnectOnboardingLink(request, env, cors);
      }
      if (url.searchParams.get("kvkVerify") === "1") {
        return handleKvkVerify(request, env, cors);
      }
      if (url.searchParams.get("stripeWebhook") === "1") {
        return handleStripeWebhook(request, env);
      }
      if (url.searchParams.get("uploadInit") === "1") {
        return handleUploadInit(request, url, env);
      }
      if (url.searchParams.get("uploadComplete") === "1") {
        return handleUploadComplete(request, env);
      }
      if (url.searchParams.get("uploadThumbnail") === "1") {
        return handleUploadThumbnail(request, env);
      }

      const userId = (
        request.headers.get("X-App-User-Id") ||
        request.headers.get("x-app-user-id") ||
        url.searchParams.get("userId") ||
        ""
      ).trim();
      console.log("Worker userId:", userId);

      if (!userId) {
        return json(
          { error: "X-App-User-Id header required (or userId query param)" },
          400
        );
      }
      const caption = request.headers.get("X-Post-Caption") || "";
      const explicitPostIdHeader = (
        request.headers.get("X-Post-Id") ||
        request.headers.get("x-post-id") ||
        ""
      ).trim();
      const explicitPostId =
        explicitPostIdHeader && isStandardUuid(explicitPostIdHeader)
          ? explicitPostIdHeader
          : null;
      const contentType = request.headers.get("Content-Type") || "";
      console.log("[upload content-type]", contentType);
      console.log("[create post request]", {
        userId,
        contentType,
        hasCaption: caption.length > 0,
        explicitPostId: explicitPostId || null,
      });
      /** @type {ArrayBuffer | null} */
      let body = null;
      /** @type {ReadableStream | null} */
      let uploadStream = null;
      /** @type {number} */
      let uploadBytes = 0;
      /** @type {ReadableStream | null} */
      let thumbnailStream = null;
      /** @type {string | null} */
      let thumbnailContentType = null;
      /** @type {string[]} */
      let tagsPayload = [];
      /** @type {Record<string, unknown> | null} */
      let multipartProductRaw = null;
      if (contentType.toLowerCase().includes("multipart/form-data")) {
        const fd = await request.formData();
        multipartProductRaw = productRawFromFormData(fd);
        const tagsField = fd.get("tags");
        if (typeof tagsField === "string" && tagsField.length > 0) {
          try {
            const parsed = JSON.parse(tagsField);
            tagsPayload = sanitizeWorkerTags(parsed);
          } catch (_) {
            tagsPayload = [];
          }
        }

        const uploadTypeRaw = fd.get("uploadType");
        const uploadType =
          typeof uploadTypeRaw === "string" ? uploadTypeRaw.trim() : "";

        if (uploadType === "image_carousel") {
          if (!explicitPostId) {
            return json(
              {
                success: false,
                message:
                  "image_carousel requires a valid X-Post-Id header (UUID) matching the client-generated post id.",
              },
              400
            );
          }
          const captionFieldRaw = fd.get("caption");
          const captionFromForm =
            typeof captionFieldRaw === "string" ? captionFieldRaw : "";
          const captionHeaderTrim = (caption || "").trim();
          const carouselCaptionRaw =
            captionFromForm.trim().length > 0 ? captionFromForm : captionHeaderTrim;
          const rawImages = fd.getAll("images");
          const imageEntries = rawImages.filter(
            (x) =>
              x &&
              typeof x === "object" &&
              "stream" in x &&
              "size" in x
          );
          if (imageEntries.length === 0) {
            return json(
              {
                success: false,
                message:
                  "No image files found. Upload one or more files in the `images` field.",
              },
              400
            );
          }
          if (imageEntries.length > 10) {
            return json(
              { success: false, message: "Maximum 10 images per carousel." },
              400
            );
          }
          for (let ci = 0; ci < imageEntries.length; ci++) {
            const f = imageEntries[ci];
            const sz =
              typeof f.size === "number" && Number.isFinite(f.size) ? f.size : 0;
            if (sz <= 0) {
              return json(
                {
                  success: false,
                  message: `Image ${ci + 1} is empty (0 bytes).`,
                },
                400
              );
            }
            const mt = typeof f.type === "string" ? f.type : "";
            if (!mt.startsWith("image/")) {
              return json(
                {
                  success: false,
                  message: `Image ${ci + 1} must have an image/* MIME type.`,
                },
                400
              );
            }
          }
          const ts = Date.now();
          const keys = [];
          const urls = [];
          for (let ci = 0; ci < imageEntries.length; ci++) {
            const f = imageEntries[ci];
            const ext = imageExtFromMime(f.type);
            const key = `images/${explicitPostId}/${ts}-${ci}.${ext}`;
            const httpCt = imageContentTypeForExt(ext);
            try {
              await env.VIDEOS.put(key, f.stream(), {
                httpMetadata: { contentType: httpCt },
              });
            } catch (e) {
              return json(
                {
                  success: false,
                  message: `Failed to upload image ${ci + 1} to storage: ${
                    (e && e.message) || String(e)
                  }`,
                },
                500
              );
            }
            keys.push(key);
            urls.push(getPublicPostImageUrl(request, key));
          }
          const carouselProductRaw = productRawFromFormData(fd);
          const carouselAudioFields = sanitizeCarouselAudioFromForm(env, fd);
          try {
            const post = await insertCarouselPostRow(
              env,
              userId,
              keys[0],
              urls[0],
              carouselCaptionRaw,
              explicitPostId,
              tagsPayload,
              carouselProductRaw,
              carouselAudioFields
            );
            const postId = post && post.id;
            if (!postId) {
              throw new Error("Missing post id after insert");
            }
            const mediaRows = keys.map((k, idx) => ({
              post_id: postId,
              media_type: "image",
              url: urls[idx],
              r2_key: k,
              sort_order: idx,
            }));
            const media = await insertPostMediaRows(env, mediaRows);
            return new Response(
              JSON.stringify({ success: true, post, media }),
              { headers: { "Content-Type": "application/json", ...cors } }
            );
          } catch (e) {
            return json(
              {
                success: false,
                message: (e && e.message) || String(e),
                hint:
                  "R2 object(s) uploaded; Supabase write failed. Run DB migration for post_media and nullable posts.video_url.",
              },
              500
            );
          }
        }

        const maybeFile =
          fd.get("file") ||
          fd.get("video") ||
          fd.get("media");
        if (maybeFile && typeof maybeFile === "object" && "arrayBuffer" in maybeFile) {
          const fileSize =
            typeof maybeFile.size === "number" && Number.isFinite(maybeFile.size)
              ? maybeFile.size
              : 0;
          console.log("[upload file size]", fileSize);
          if (fileSize <= 0) {
            return new Response(
              JSON.stringify({
                success: false,
                message: "Uploaded multipart file is empty (0 bytes).",
                hint: "Client FormData contains an empty file.",
              }),
              { status: 400, headers: { "Content-Type": "application/json", ...cors } }
            );
          }
          uploadBytes = fileSize;
          uploadStream = maybeFile.stream();
          const maybeThumb = fd.get("thumbnail");
          if (
            maybeThumb &&
            typeof maybeThumb === "object" &&
            "size" in maybeThumb &&
            "stream" in maybeThumb
          ) {
            const thumbSize =
              typeof maybeThumb.size === "number" && Number.isFinite(maybeThumb.size)
                ? maybeThumb.size
                : 0;
            if (thumbSize > 0) {
              thumbnailStream = maybeThumb.stream();
              thumbnailContentType =
                typeof maybeThumb.type === "string" && maybeThumb.type.length > 0
                  ? maybeThumb.type
                  : "image/jpeg";
            }
          }
        } else {
          return new Response(
            JSON.stringify({ success: false, message: "No file found in multipart form data" }),
            { status: 400, headers: { "Content-Type": "application/json", ...cors } }
          );
        }
      } else {
        body = await request.arrayBuffer();
        uploadBytes = body.byteLength;
      }
      console.log("[upload bytes]", { userId, bytes: uploadBytes });
      if (uploadBytes <= 0) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Uploaded file is empty (0 bytes).",
            hint: "Client upload body was empty; do not create a post for empty files.",
          }),
          { status: 400, headers: { "Content-Type": "application/json", ...cors } }
        );
      }
      const fileName = `video-${Date.now()}.mp4`;
      const videoUrl = getPublicVideoUrl(request, fileName);
      let thumbnailKey = null;
      let thumbnailUrl = null;

      if (uploadStream) {
        await env.VIDEOS.put(fileName, uploadStream, { httpMetadata: { contentType: MP4 } });
      } else {
        await env.VIDEOS.put(fileName, body, { httpMetadata: { contentType: MP4 } });
      }
      if (thumbnailStream) {
        try {
          thumbnailKey = `thumbnails/thumb-${Date.now()}.jpg`;
          await env.VIDEOS.put(thumbnailKey, thumbnailStream, {
            httpMetadata: { contentType: thumbnailContentType || "image/jpeg" },
          });
          thumbnailUrl = getPublicThumbnailUrl(request, thumbnailKey);
        } catch (e) {
          console.log("[thumbnail upload] failed, continuing without thumbnail", {
            error: (e && e.message) || String(e),
          });
          thumbnailKey = null;
          thumbnailUrl = null;
        }
      }

      try {
        const post = await insertPostRow(
          env,
          userId,
          fileName,
          videoUrl,
          thumbnailUrl,
          caption,
          explicitPostId,
          tagsPayload,
          multipartProductRaw
        );
        console.log("[PostCreate] saved public.posts row", {
          id: post?.id ?? null,
          user_id: post?.user_id ?? null,
        });
        console.log("[created post]", post);
        return new Response(
          JSON.stringify({
            success: true,
            fileName,
            videoUrl,
            thumbnailUrl,
            r2Key: fileName,
            thumbnailKey,
            post,
            createdPost: post,
          }),
          { headers: { "Content-Type": "application/json", ...cors } }
        );
      } catch (e) {
        return new Response(
          JSON.stringify({
            success: false,
            fileName,
            videoUrl,
            r2Key: fileName,
            message: (e && e.message) || String(e),
            hint: "R2 upload succeeded; Supabase insert failed. Check Worker secrets and posts table.",
          }),
          { status: 500, headers: { "Content-Type": "application/json", ...cors } }
        );
      }
    }

    if (request.method === "GET") {
      return new Response("Use POST to upload, or GET with ?file=… or ?posts=1 or ?userPosts=1&userId=… or ?softDelete=1&…", {
        status: 400,
        headers: { ...cors },
      });
    }

    return new Response("Method not allowed", { status: 405, headers: { ...cors } });
  },
};
