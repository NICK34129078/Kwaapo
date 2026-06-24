import { CLOUD_VIDEO_WORKER_BASE } from "./cloudVideo";

/** Expo scheme uit app.json — deep links `lumen-fashion://post/<id>`. */
export const APP_SCHEME = "lumen-fashion";

/**
 * Publieke basis-URL voor gedeelde posts.
 * Override via EXPO_PUBLIC_SHARE_BASE_URL (bv. eigen domein); default = Worker.
 */
export const PUBLIC_SHARE_BASE = (
  typeof process.env.EXPO_PUBLIC_SHARE_BASE_URL === "string" &&
  process.env.EXPO_PUBLIC_SHARE_BASE_URL.trim().length > 0
    ? process.env.EXPO_PUBLIC_SHARE_BASE_URL.trim()
    : CLOUD_VIDEO_WORKER_BASE
).replace(/\/$/, "");

export const SHARE_BRAND_NAME = "Kwaapo";
