import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import type { NavigationContainerRef } from "@react-navigation/native";
import { useAuth } from "./AuthContext";
import { useSellerFulfillment } from "./SellerFulfillmentContext";
import { logInAppToastOnce } from "../constants/inAppToastOnceDebug";
import {
  buildSellerNotificationFallback,
  buyerNotificationRowFromService,
  enrichBuyerNotification,
  sellerNotificationRowFromService,
  subscribeOrderNotificationInserts,
} from "../services/notificationRealtimeService";
import {
  fetchPendingBuyerToastNotifications,
  markBuyerNotificationRead,
  markBuyerNotificationToastShown,
} from "../services/buyerNotificationService";
import {
  fetchPendingSellerToastNotifications,
  markSellerNotificationRead,
  markSellerNotificationToastShown,
} from "../services/sellerNotificationService";
import {
  loadInAppToastShownIds,
  persistInAppToastShownId,
} from "../services/inAppToastShownStorage";
import { logBuyerNotification } from "../constants/buyerNotificationDebug";
import { logSellerOrderNotification } from "../constants/sellerOrderNotificationDebug";
import {
  logSellerOrderInstant,
  logSellerOrderInstantToastRendered,
} from "../constants/sellerOrderInstantDebug";
import { InAppNotificationToast } from "../components/InAppNotificationToast";
import { getSupabaseProjectRefFromEnv } from "../utils/supabaseProject";
import {
  dequeueInAppNotification,
  enqueueInAppNotification,
  isPendingToastTooOld,
  notificationAgeMs,
  shouldSuppressInAppNotification,
  type InAppNotificationPayload,
} from "../utils/inAppNotification";

type InAppNotificationContextValue = {
  enqueueNotification: (payload: InAppNotificationPayload) => void;
};

type ToastSource = "realtime" | "pending";

type ToastOnceMeta = {
  source: ToastSource;
  createdAt: string;
  toastShownAt: string | null;
  audience: InAppNotificationPayload["audience"];
  notificationType: string;
};

const InAppNotificationContext = createContext<InAppNotificationContextValue | null>(
  null
);

function getActiveOrderId(
  navigationRef: NavigationContainerRef<any> | null
): string | undefined {
  const route = navigationRef?.getCurrentRoute();
  if (!route || route.name !== "OrderDetail") {
    return undefined;
  }
  const params = route.params as { orderId?: string } | undefined;
  return params?.orderId;
}

function getCurrentRouteName(
  navigationRef: NavigationContainerRef<any> | null
): string {
  return navigationRef?.getCurrentRoute()?.name ?? "unknown";
}

function isSellerNewPaidToast(payload: InAppNotificationPayload): boolean {
  return (
    payload.audience === "seller" &&
    payload.notificationType === "new_paid_order"
  );
}

function formatDebugIds(ids: string[]): string {
  return ids.length > 0 ? ids.join(", ") : "none";
}

export function InAppNotificationProvider({
  children,
  navigationRef,
}: {
  children: React.ReactNode;
  navigationRef: React.RefObject<NavigationContainerRef<any> | null>;
}) {
  const { user } = useAuth();
  const { syncNewPaidSellerOrder } = useSellerFulfillment();
  const [sellerQueue, setSellerQueue] = useState<InAppNotificationPayload[]>([]);
  const [buyerQueue, setBuyerQueue] = useState<InAppNotificationPayload[]>([]);
  const seenIds = useRef(new Set<string>());
  const storageShownIds = useRef(new Set<string>());
  const userIdRef = useRef<string | null>(null);
  const subscriptionCleanup = useRef<(() => void) | null>(null);
  const visibleRef = useRef<InAppNotificationPayload | null>(null);

  const commitToastShown = useCallback(
    async (
      notificationId: string,
      audience: InAppNotificationPayload["audience"]
    ) => {
      seenIds.current.add(notificationId);
      storageShownIds.current.add(notificationId);

      const userId = userIdRef.current;
      if (userId) {
        await persistInAppToastShownId(userId, notificationId);
      }

      if (audience === "seller") {
        await markSellerNotificationToastShown(notificationId);
      } else {
        await markBuyerNotificationToastShown(notificationId);
      }

      logInAppToastOnce("marked shown", notificationId);
    },
    []
  );

  const shouldSkipToastOnce = useCallback(
    (notificationId: string, meta: ToastOnceMeta): boolean => {
      if (meta.toastShownAt) {
        seenIds.current.add(notificationId);
        logInAppToastOnce(
          "skipped already shown database",
          notificationId,
          meta.notificationType
        );
        return true;
      }

      if (seenIds.current.has(notificationId)) {
        logInAppToastOnce(
          "skipped already shown memory",
          notificationId,
          meta.notificationType
        );
        void commitToastShown(notificationId, meta.audience);
        return true;
      }

      if (storageShownIds.current.has(notificationId)) {
        logInAppToastOnce(
          "skipped already shown storage",
          notificationId,
          meta.notificationType
        );
        void commitToastShown(notificationId, meta.audience);
        return true;
      }

      const ageMs = notificationAgeMs(meta.createdAt);
      if (meta.source === "pending") {
        logInAppToastOnce(
          "pending candidate",
          notificationId,
          `${ageMs}ms`
        );
        if (isPendingToastTooOld(meta.createdAt)) {
          logInAppToastOnce("skipped too old", notificationId, `${ageMs}ms`);
          void commitToastShown(notificationId, meta.audience);
          return true;
        }
      }

      return false;
    },
    [commitToastShown]
  );

  const queueToastPayload = useCallback(
    (
      payload: InAppNotificationPayload,
      meta: ToastOnceMeta
    ): boolean => {
      if (shouldSkipToastOnce(payload.id, meta)) {
        return false;
      }

      const currentRoute = navigationRef.current?.getCurrentRoute()?.name;
      const currentOrderId = getActiveOrderId(navigationRef.current);
      if (shouldSuppressInAppNotification(currentRoute, currentOrderId, payload)) {
        seenIds.current.add(payload.id);
        logInAppToastOnce(
          "skipped suppressed on order detail",
          payload.id,
          payload.notificationType
        );
        void commitToastShown(payload.id, payload.audience);
        return false;
      }

      const enqueue = (
        setter: React.Dispatch<React.SetStateAction<InAppNotificationPayload[]>>
      ): boolean => {
        let queued = false;
        setter((current) => {
          const next = enqueueInAppNotification(current, payload);
          if (next.length === current.length) {
            logInAppToastOnce(
              "skipped queue deduped",
              payload.id,
              payload.notificationType
            );
            return current;
          }
          queued = true;
          return next;
        });
        return queued;
      };

      const queued =
        payload.audience === "seller"
          ? enqueue(setSellerQueue)
          : enqueue(setBuyerQueue);

      if (!queued) {
        return false;
      }

      seenIds.current.add(payload.id);
      logInAppToastOnce(
        "queued first time",
        payload.id,
        payload.notificationType
      );
      void commitToastShown(payload.id, payload.audience);
      return true;
    },
    [commitToastShown, navigationRef, shouldSkipToastOnce]
  );

  const handleIncomingSellerOrderNotification = useCallback(
    (
      row: Parameters<typeof buildSellerNotificationFallback>[0],
      meta: ToastOnceMeta
    ) => {
      if (meta.source === "realtime") {
        logInAppToastOnce(
          "realtime received",
          row.id,
          row.notification_type
        );
        logSellerOrderInstant(`realtime received ${row.id} ${row.order_id}`);
      }

      const payload = buildSellerNotificationFallback(row);
      const queued = queueToastPayload(payload, {
        ...meta,
        audience: "seller",
        notificationType: row.notification_type,
      });
      if (!queued) {
        return;
      }

      syncNewPaidSellerOrder({
        notificationId: row.id,
        orderId: row.order_id,
      });
    },
    [queueToastPayload, syncNewPaidSellerOrder]
  );

  const handleIncomingBuyerOrderNotification = useCallback(
    async (
      row: Parameters<typeof enrichBuyerNotification>[0],
      meta: ToastOnceMeta
    ) => {
      if (meta.source === "realtime") {
        logInAppToastOnce(
          "realtime received",
          row.id,
          row.notification_type
        );
      }

      try {
        const payload = await enrichBuyerNotification(row);
        queueToastPayload(payload, {
          ...meta,
          audience: "buyer",
          notificationType: row.notification_type,
        });
      } catch (error) {
        logInAppToastOnce(
          "error enrichBuyerNotification",
          row.id,
          error instanceof Error ? error.message : String(error)
        );
        logBuyerNotification(
          "error",
          "processBuyerInsert",
          row.id,
          error instanceof Error ? error.message : String(error)
        );
      }
    },
    [queueToastPayload]
  );

  const handlersRef = useRef({
    handleIncomingSellerOrderNotification,
    handleIncomingBuyerOrderNotification,
  });
  handlersRef.current = {
    handleIncomingSellerOrderNotification,
    handleIncomingBuyerOrderNotification,
  };

  const loadPendingSellerToasts = useCallback(async () => {
    if (!userIdRef.current) {
      return;
    }
    try {
      const pending = await fetchPendingSellerToastNotifications();
      logSellerOrderNotification(
        `pending raw rows ${formatDebugIds(pending.map((row) => row.id))}`
      );

      for (const notification of pending) {
        const row = sellerNotificationRowFromService(notification);
        handlersRef.current.handleIncomingSellerOrderNotification(row, {
          source: "pending",
          createdAt: notification.createdAt,
          toastShownAt: notification.toastShownAt,
          audience: "seller",
          notificationType: notification.notificationType,
        });
      }
    } catch (error) {
      logInAppToastOnce(
        "error loadPendingSellerToasts",
        undefined,
        error instanceof Error ? error.message : String(error)
      );
      logSellerOrderNotification(
        "error",
        "loadPendingSellerToasts",
        error instanceof Error ? error.message : String(error)
      );
    }
  }, []);

  const loadPendingBuyerToasts = useCallback(async () => {
    if (!userIdRef.current) {
      return;
    }
    try {
      const pending = await fetchPendingBuyerToastNotifications();
      logBuyerNotification(
        `pending raw rows ${formatDebugIds(pending.map((row) => row.id))}`
      );

      for (const notification of pending) {
        const row = buyerNotificationRowFromService(notification);
        await handlersRef.current.handleIncomingBuyerOrderNotification(row, {
          source: "pending",
          createdAt: notification.createdAt,
          toastShownAt: notification.toastShownAt,
          audience: "buyer",
          notificationType: notification.notificationType,
        });
      }
    } catch (error) {
      logInAppToastOnce(
        "error loadPendingBuyerToasts",
        undefined,
        error instanceof Error ? error.message : String(error)
      );
      logBuyerNotification(
        "error",
        "loadPendingBuyerToasts",
        error instanceof Error ? error.message : String(error)
      );
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function startSubscription(userId: string) {
      subscriptionCleanup.current?.();
      subscriptionCleanup.current = subscribeOrderNotificationInserts(userId, {
        onSellerInsert: (row) => {
          handlersRef.current.handleIncomingSellerOrderNotification(row, {
            source: "realtime",
            createdAt: row.created_at,
            toastShownAt: null,
            audience: "seller",
            notificationType: row.notification_type,
          });
        },
        onBuyerInsert: (row) => {
          void handlersRef.current.handleIncomingBuyerOrderNotification(row, {
            source: "realtime",
            createdAt: row.created_at,
            toastShownAt: null,
            audience: "buyer",
            notificationType: row.notification_type,
          });
        },
      });
    }

    async function bootstrap(userId: string) {
      userIdRef.current = userId;
      seenIds.current.clear();
      storageShownIds.current = await loadInAppToastShownIds(userId);
      for (const notificationId of storageShownIds.current) {
        seenIds.current.add(notificationId);
      }
      setSellerQueue([]);
      setBuyerQueue([]);

      logSellerOrderNotification(
        `current supabase project ${getSupabaseProjectRefFromEnv()}`
      );
      logInAppToastOnce(
        "bootstrap storage loaded",
        undefined,
        `${storageShownIds.current.size} ids`
      );

      await startSubscription(userId);
      if (cancelled) {
        return;
      }

      await loadPendingBuyerToasts();
      if (cancelled) {
        return;
      }

      await loadPendingSellerToasts();
    }

    if (!user?.id) {
      userIdRef.current = null;
      seenIds.current.clear();
      storageShownIds.current.clear();
      setSellerQueue([]);
      setBuyerQueue([]);
      subscriptionCleanup.current?.();
      subscriptionCleanup.current = null;
      return;
    }

    void bootstrap(user.id);

    return () => {
      cancelled = true;
      subscriptionCleanup.current?.();
      subscriptionCleanup.current = null;
    };
  }, [loadPendingBuyerToasts, loadPendingSellerToasts, user?.id]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        return;
      }
      void loadPendingBuyerToasts();
      void loadPendingSellerToasts();
    });
    return () => subscription.remove();
  }, [loadPendingBuyerToasts, loadPendingSellerToasts, user?.id]);

  const visibleNotification = useMemo(() => {
    if (sellerQueue[0]) {
      return sellerQueue[0];
    }
    return buyerQueue[0] ?? null;
  }, [buyerQueue, sellerQueue]);

  visibleRef.current = visibleNotification;

  useEffect(() => {
    if (!visibleNotification) {
      return;
    }
    if (isSellerNewPaidToast(visibleNotification)) {
      logSellerOrderNotification(
        `queue rendered ${visibleNotification.id}`
      );
      logSellerOrderInstantToastRendered(
        visibleNotification.id,
        getCurrentRouteName(navigationRef.current)
      );
      return;
    }
    logBuyerNotification(`queue rendered ${visibleNotification.id}`);
  }, [navigationRef, visibleNotification]);

  const dismissActive = useCallback(() => {
    const current = visibleRef.current;
    if (!current) {
      return;
    }
    if (isSellerNewPaidToast(current)) {
      setSellerQueue((queue) => dequeueInAppNotification(queue));
      return;
    }
    setBuyerQueue((queue) => dequeueInAppNotification(queue));
  }, []);

  const openNotification = useCallback(
    (notification: InAppNotificationPayload) => {
      if (isSellerNewPaidToast(notification)) {
        logSellerOrderNotification(
          "navigate to order",
          notification.orderId,
          notification.id
        );
      }

      if (notification.audience === "seller") {
        void markSellerNotificationRead(notification.id);
      } else {
        void markBuyerNotificationRead(notification.id);
      }

      if (isSellerNewPaidToast(notification)) {
        setSellerQueue((queue) => dequeueInAppNotification(queue));
      } else {
        setBuyerQueue((queue) => dequeueInAppNotification(queue));
      }

      const focusTracking =
        notification.audience === "buyer" &&
        notification.notificationType === "order_shipped";

      navigationRef.current?.navigate("OrderDetail", {
        orderId: notification.orderId,
        focusTracking,
      });
    },
    [navigationRef]
  );

  const enqueueSellerNotification = useCallback(
    (payload: InAppNotificationPayload) => {
      if (!isSellerNewPaidToast(payload)) {
        return;
      }
      queueToastPayload(payload, {
        source: "realtime",
        createdAt: payload.createdAt,
        toastShownAt: null,
        audience: "seller",
        notificationType: payload.notificationType,
      });
    },
    [queueToastPayload]
  );

  const enqueueBuyerNotification = useCallback(
    (payload: InAppNotificationPayload) => {
      queueToastPayload(payload, {
        source: "realtime",
        createdAt: payload.createdAt,
        toastShownAt: null,
        audience: "buyer",
        notificationType: payload.notificationType,
      });
    },
    [queueToastPayload]
  );

  const value = useMemo(
    () => ({
      enqueueNotification: (payload: InAppNotificationPayload) => {
        if (isSellerNewPaidToast(payload)) {
          enqueueSellerNotification(payload);
        } else {
          enqueueBuyerNotification(payload);
        }
      },
    }),
    [enqueueBuyerNotification, enqueueSellerNotification]
  );

  return (
    <InAppNotificationContext.Provider value={value}>
      {children}
      <InAppNotificationToast
        notification={visibleNotification}
        onPress={openNotification}
        onDismiss={dismissActive}
      />
    </InAppNotificationContext.Provider>
  );
}

export function useInAppNotifications(): InAppNotificationContextValue {
  const ctx = useContext(InAppNotificationContext);
  if (!ctx) {
    throw new Error(
      "useInAppNotifications must be used within InAppNotificationProvider"
    );
  }
  return ctx;
}
