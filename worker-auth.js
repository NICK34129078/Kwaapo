/**
 * Supabase JWT verification for Cloudflare Workers.
 * Identity comes ONLY from Authorization: Bearer <access_token> — never client headers.
 */

function isStandardUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

/** @param {Request} request */
export function extractBearerToken(request) {
  const auth =
    request.headers.get("Authorization") ||
    request.headers.get("authorization") ||
    "";
  const match = /^Bearer\s+(\S+)$/i.exec(auth.trim());
  return match ? match[1].trim() : null;
}

/**
 * Validates access token via Supabase Auth API (server-side).
 * @param {any} env
 * @param {string} accessToken
 * @returns {Promise<{ userId: string; email: string | null } | null>}
 */
export async function verifySupabaseAccessToken(env, accessToken) {
  if (!accessToken || !env?.SUPABASE_URL) {
    return null;
  }
  const apiKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    console.error("[auth] SUPABASE_SERVICE_ROLE_KEY not configured");
    return null;
  }

  const base = String(env.SUPABASE_URL).replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: apiKey,
      },
    });
    if (!res.ok) {
      return null;
    }
    const user = await res.json();
    const userId = typeof user?.id === "string" ? user.id.trim() : "";
    if (!isStandardUuid(userId)) {
      return null;
    }
    return {
      userId,
      email: typeof user?.email === "string" ? user.email : null,
    };
  } catch {
    console.error("[auth] token verification request failed");
    return null;
  }
}

/**
 * @param {Record<string, string>} cors
 * @param {number} [status]
 */
export function authErrorResponse(cors = {}, status = 401) {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

/**
 * @param {Request} request
 * @param {any} env
 * @param {Record<string, string>} [cors]
 * @returns {Promise<{ userId: string } | { error: Response }>}
 */
export async function requireAuthUser(request, env, cors = {}) {
  const token = extractBearerToken(request);
  if (!token) {
    return { error: authErrorResponse(cors, 401) };
  }
  const verified = await verifySupabaseAccessToken(env, token);
  if (!verified) {
    return { error: authErrorResponse(cors, 401) };
  }
  return { userId: verified.userId };
}

export { isStandardUuid };
