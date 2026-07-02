/**
 * Public Worker base URL (upload init/complete, direct PUT, stream GET with ?file=<r2_key>).
 * Production default unchanged; set EXPO_PUBLIC_KWAAPO_WORKER_BASE for staging/preview builds.
 */
const STAGING_WORKER_BASE = process.env.EXPO_PUBLIC_KWAAPO_WORKER_BASE?.trim() ?? "";

export const CLOUD_VIDEO_WORKER_BASE =
  STAGING_WORKER_BASE.length > 0
    ? STAGING_WORKER_BASE.replace(/\/$/, "")
    : "https://wild-mountain-072a.n-vandullemen.workers.dev";

export const UPLOADED_VIDEO_OWNER = "@mara.veldt";

/**
 * Public streaming URL for a key stored in R2 by the uploader.
 */
export function getCloudVideoStreamUrl(fileName: string): string {
  const u = new URL(CLOUD_VIDEO_WORKER_BASE);
  u.searchParams.set("file", fileName);
  return u.toString();
}
