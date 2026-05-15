/**
 * Public Worker base URL (upload init/complete, direct PUT, stream GET with ?file=<r2_key>).
 * Must match deployment (see wrangler + worker.js).
 */
export const CLOUD_VIDEO_WORKER_BASE =
  "https://wild-mountain-072a.n-vandullemen.workers.dev";

export const UPLOADED_VIDEO_OWNER = "@mara.veldt";

/**
 * Public streaming URL for a key stored in R2 by the uploader.
 */
export function getCloudVideoStreamUrl(fileName: string): string {
  const u = new URL(CLOUD_VIDEO_WORKER_BASE);
  u.searchParams.set("file", fileName);
  return u.toString();
}
