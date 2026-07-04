import { Platform } from "react-native";
import Constants from "expo-constants";
import { supabase } from "../lib/supabase";

const PUSH_ENABLED =
  process.env.EXPO_PUBLIC_ENABLE_PUSH_NOTIFICATIONS === "1" ||
  process.env.EXPO_PUBLIC_ENABLE_PUSH_NOTIFICATIONS === "true";

export function isPushNotificationsFeatureEnabled(): boolean {
  return PUSH_ENABLED;
}

export function isExpoGoRuntime(): boolean {
  return Constants.appOwnership === "expo";
}

export function canRegisterRemotePush(): boolean {
  return isPushNotificationsFeatureEnabled() && !isExpoGoRuntime();
}

type PushModule = typeof import("expo-notifications");

async function loadPushModule(): Promise<PushModule | null> {
  if (!canRegisterRemotePush()) {
    return null;
  }
  try {
    return await import("expo-notifications");
  } catch {
    console.warn("[push] expo-notifications unavailable");
    return null;
  }
}

export async function registerPushTokenIfEnabled(): Promise<void> {
  if (!canRegisterRemotePush()) {
    return;
  }

  const Notifications = await loadPushModule();
  if (!Notifications) {
    return;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return;
  }

  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== "granted") {
    return;
  }

  const tokenResult = await Notifications.getExpoPushTokenAsync({
    projectId: Constants.expoConfig?.extra?.eas?.projectId,
  });
  const expoPushToken = tokenResult.data?.trim();
  if (!expoPushToken) {
    return;
  }

  const platform =
    Platform.OS === "ios"
      ? "ios"
      : Platform.OS === "android"
        ? "android"
        : "web";

  const { error } = await supabase.from("push_device_tokens").upsert(
    {
      user_id: user.id,
      expo_push_token: expoPushToken,
      platform,
      app_version: Constants.expoConfig?.version ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,expo_push_token" }
  );

  if (error) {
    console.warn("[push] token upsert failed", error.message);
  }
}

export async function configurePushNotificationHandlers(): Promise<void> {
  if (!isPushNotificationsFeatureEnabled()) {
    return;
  }

  const Notifications = await loadPushModule();
  if (!Notifications) {
    return;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export type PushOrderDeepLink = {
  orderId: string;
  audience: "buyer" | "seller";
  focusTracking?: boolean;
};

export function parsePushOrderDeepLink(
  data: Record<string, unknown> | undefined
): PushOrderDeepLink | null {
  if (!data) {
    return null;
  }
  const orderId = typeof data.orderId === "string" ? data.orderId.trim() : "";
  if (!orderId) {
    return null;
  }
  const audience = data.audience === "seller" ? "seller" : "buyer";
  return {
    orderId,
    audience,
    focusTracking:
      data.focusTracking === true ||
      data.focusTracking === "true" ||
      data.notificationType === "order_shipped",
  };
}
