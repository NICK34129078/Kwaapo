/**
 * Cloudflare Worker: R2 video + Supabase post metadata.
 *
 * Secrets (set with `wrangler secret put <NAME>`; never in the app bundle):
 *   - SUPABASE_URL   e.g. https://xxxx.supabase.co
 *   - SUPABASE_SERVICE_ROLE_KEY
 *
 * Local dev: .dev.vars with the same names (not committed; see .dev.vars.example)
 */

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Headers": [
    "Content-Type",
    "Range",
    "If-Range",
    "If-Modified-Since",
    "If-None-Match",
    "X-App-User-Id",
    "X-Post-Caption",
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

function streamHeaders(object, totalSize) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", MP4);
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
 * @param {string} id
 * @returns {boolean}
 */
function isUuidLike(id) {
  if (!id || typeof id !== "string" || id.length < 20 || id.length > 100) return false;
  // UUID (with hyphens) or cuid — posts.id is uuid in DB; accept standard UUID
  return /^[0-9a-f-]{16,50}$/i.test(id);
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
 */
async function insertPostRow(env, userId, fileName, videoUrl, thumbnailUrl, caption) {
  const row = {
    user_id: userId,
    type: "video",
    video_url: videoUrl,
    r2_key: fileName,
    thumbnail_url: thumbnailUrl || null,
    filename: fileName,
    caption: caption && caption.length > 0 ? caption : "Nieuwe look",
    likes_count: 0,
    comments_count: 0,
  };
  console.log("[create post payload]", row);
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

/** @param {any} env */
async function fetchPostsForUser(env, userId) {
  const path =
    "/posts?select=*" +
    "&user_id=eq." +
    encodeURIComponent(userId) +
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
    const file = url.searchParams.get("file");
    const thumb = url.searchParams.get("thumb");
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
        const posts = await fetchPostsForUser(env, userId);
        const validPosts = await filterValidVideoPosts(env, Array.isArray(posts) ? posts : []);
        console.log("[posts] fetched", {
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

    if ((request.method === "GET" || request.method === "HEAD") && file) {
      if (!isAllowedVideoKey(file)) {
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

    if (request.method === "POST") {
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
      const contentType = request.headers.get("Content-Type") || "";
      console.log("[upload content-type]", contentType);
      console.log("[create post request]", {
        userId,
        contentType,
        hasCaption: caption.length > 0,
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
      if (contentType.toLowerCase().includes("multipart/form-data")) {
        const fd = await request.formData();
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
          caption
        );
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
      return new Response("Use POST to upload, or GET with ?file=… or ?posts=1&userId=… or ?softDelete=1&…", {
        status: 400,
        headers: { ...cors },
      });
    }

    return new Response("Method not allowed", { status: 405, headers: { ...cors } });
  },
};
