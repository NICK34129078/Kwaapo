/**
 * Server-side push dispatch (feature-flagged).
 * Remote push is not exercised in Expo Go — use development build / TestFlight.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/**
 * @param {Record<string, unknown>} env
 * @param {Function} supabaseRequest
 * @param {string} userId
 */
async function fetchUserPushTokens(env, supabaseRequest, userId) {
  const rows = await supabaseRequest(
    env,
    "GET",
    `/push_device_tokens?user_id=eq.${encodeURIComponent(userId)}&select=expo_push_token&order=updated_at.desc&limit=10`
  );
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows
    .map((row) => (row?.expo_push_token ? String(row.expo_push_token) : ""))
    .filter(Boolean);
}

/**
 * @param {Record<string, unknown>} env
 * @param {Function} supabaseRequest
 * @param {{
 *   userId: string;
 *   title: string;
 *   body: string;
 *   data?: Record<string, unknown>;
 * }} payload
 */
export async function sendExpoPushToUser(env, supabaseRequest, payload) {
  if (env.PUSH_NOTIFICATIONS_ENABLED !== "1" && env.PUSH_NOTIFICATIONS_ENABLED !== "true") {
    return { ok: false, skipped: true, reason: "disabled" };
  }
  if (!env.EXPO_ACCESS_TOKEN) {
    console.warn("[push] EXPO_ACCESS_TOKEN missing — skip push");
    return { ok: false, skipped: true, reason: "no_expo_token" };
  }

  try {
    const tokens = await fetchUserPushTokens(env, supabaseRequest, payload.userId);
    if (!tokens.length) {
      return { ok: true, sent: 0 };
    }

    const messages = tokens.map((token) => ({
      to: token,
      sound: "default",
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
    }));

    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      const text = await response.text();
      console.warn("[push] expo send failed", response.status, text.slice(0, 200));
      return { ok: false, error: text };
    }

    return { ok: true, sent: messages.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[push] sendExpoPushToUser failed", message);
    return { ok: false, error: message };
  }
}

/**
 * @param {Record<string, unknown>} env
 * @param {Function} supabaseRequest
 * @param {{
 *   userId: string;
 *   orderId: string;
 *   audience: "buyer" | "seller";
 *   notificationType: string;
 *   title: string;
 *   body: string;
 *   focusTracking?: boolean;
 * }} payload
 */
export async function maybeSendOrderPushNotification(env, supabaseRequest, payload) {
  return sendExpoPushToUser(env, supabaseRequest, {
    userId: payload.userId,
    title: payload.title,
    body: payload.body,
    data: {
      orderId: payload.orderId,
      audience: payload.audience,
      notificationType: payload.notificationType,
      focusTracking: payload.focusTracking === true,
    },
  });
}
