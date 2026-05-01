import { REEL_VIDEO_POSTER_FALLBACK } from "../data/placeholder";
import {
  CLOUD_VIDEO_WORKER_BASE,
  UPLOADED_VIDEO_OWNER,
  getCloudVideoStreamUrl,
} from "../constants/cloudVideo";
import { env, isAppUserIdConfigured } from "../config/env";
import type { UserVideoPost } from "../types/userVideoPost";

export type PostRow = {
id: string;
user_id: string;
type: string;
video_url: string;
r2_key: string;
thumbnail_url: string | null;
filename: string;
caption: string | null;
likes_count: number;
comments_count: number;
created_at: string;
is_deleted: boolean;
};

type MaybePostRow = PostRow & {
userId?: string;
videoUrl?: string;
thumbnailUrl?: string | null;
r2Key?: string;
likesCount?: number;
commentsCount?: number;
captionText?: string | null;
createdAt?: string;
isDeleted?: boolean;
};

function normalizePostRow(row: MaybePostRow): PostRow {
return {
...row,
user_id: row.user_id ?? row.userId ?? "",
video_url: row.video_url ?? row.videoUrl ?? "",
r2_key: row.r2_key ?? row.r2Key ?? "",
thumbnail_url:
typeof row.thumbnail_url !== "undefined" ? row.thumbnail_url : row.thumbnailUrl ?? null,
caption: typeof row.caption !== "undefined" ? row.caption : row.captionText ?? null,
likes_count: row.likes_count ?? row.likesCount ?? 0,
comments_count: row.comments_count ?? row.commentsCount ?? 0,
created_at: row.created_at ?? row.createdAt ?? new Date().toISOString(),
is_deleted: row.is_deleted ?? row.isDeleted ?? false,
};
}

function mapRowToUserVideoPost(row: PostRow): UserVideoPost {
const poster =
row.thumbnail_url && row.thumbnail_url.length > 0
? row.thumbnail_url
: REEL_VIDEO_POSTER_FALLBACK;
const playableVideoUrl =
row.video_url && row.video_url.length > 0
? row.video_url
: getCloudVideoStreamUrl(row.r2_key);

const handle = UPLOADED_VIDEO_OWNER.startsWith("@")
? UPLOADED_VIDEO_OWNER.slice(1)
: UPLOADED_VIDEO_OWNER;

return {
id: row.id,
type: "video",
imageUrl: poster,
videoUrl: playableVideoUrl,
thumbnailUrl: row.thumbnail_url ?? undefined,
filename: row.filename,
createdAt: new Date(row.created_at).getTime(),
owner: UPLOADED_VIDEO_OWNER,
username: handle,
caption: row.caption && row.caption.length > 0 ? row.caption : "Nieuwe look",
price: "—",
likesCount: row.likes_count,
comments: String(row.comments_count),
shares: "0",
musicThumbUrl: row.thumbnail_url ?? undefined,
};
}

/**

* Fetches post rows via Cloudflare Worker
  */
  export async function fetchUserVideoPosts(): Promise<UserVideoPost[]> {
  if (!isAppUserIdConfigured()) {
  return [];
  }

const appUserId = process.env.EXPO_PUBLIC_APP_USER_ID || "1";

const workerUrl = `${CLOUD_VIDEO_WORKER_BASE}?posts=1&userId=${encodeURIComponent(appUserId)}`;

if (__DEV__) {
console.log("[restore] userId", appUserId);
console.log("[restore] url", workerUrl);
}

const res = await fetch(workerUrl, {
method: "GET",
headers: {
"X-App-User-Id": appUserId,
},
});

if (__DEV__) {
console.log("[restore] status", res.status);
}

let data: { success?: boolean; posts?: PostRow[]; message?: string } = {};

try {
data = await res.json();
} catch {}

if (__DEV__) {
console.log("[restore] raw json", data);
console.log("[restore] posts count", Array.isArray(data.posts) ? data.posts.length : 0);
console.log("RESTORED POSTS:", JSON.stringify(data.posts ?? [], null, 2));
}

if (!res.ok || data.success === false) {
throw new Error(data.message || "Worker fetch failed");
}

if (!Array.isArray(data.posts)) {
throw new Error("No posts returned");
}

const rows = data.posts
.map((p) => normalizePostRow(p as MaybePostRow))
.filter((p) => !p.is_deleted)
.filter((p) => {
const hasVideoUrl = typeof p.video_url === "string" && p.video_url.length > 0;
const hasR2Key = typeof p.r2_key === "string" && p.r2_key.length > 0;
return hasVideoUrl || hasR2Key;
})
.sort(
(a, b) =>
new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
);

const mapped = rows.map(mapRowToUserVideoPost);

if (__DEV__) {
for (const post of mapped) {
console.log("[restore post]", {
id: post.id,
videoUrl: post.videoUrl,
thumbnailUrl: post.thumbnailUrl ?? null,
});
}
console.log("[posts after restore]", mapped.length, mapped);
}

return mapped;
}

export function userVideoPostFromPostRow(row: PostRow): UserVideoPost {
return mapRowToUserVideoPost(row);
}

export async function softDeletePost(postId: string): Promise<void> {
if (!isAppUserIdConfigured()) {
return;
}

const u = new URL(CLOUD_VIDEO_WORKER_BASE);
u.searchParams.set("softDelete", "1");
u.searchParams.set("postId", postId);
u.searchParams.set("userId", env.appUserId);

const res = await fetch(u.toString(), {
method: "GET",
headers: {
"X-App-User-Id": process.env.EXPO_PUBLIC_APP_USER_ID || "1",
},
});

let data: { success?: boolean; message?: string } = {};

try {
data = await res.json();
} catch {}

if (!res.ok || !data.success) {
throw new Error(data.message || "Delete failed");
}
}
