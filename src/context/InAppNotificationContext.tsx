import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, StyleSheet, View } from "react-native";
import type { NavigationContainerRef } from "@react-navigation/native";
import { useAuth } from "./AuthContext";
import { useSellerFulfillment } from "./SellerFulfillmentContext";
import { logInAppToastOnce } from "../constants/inAppToastOnceDebug";
import {
  buildFallbackPayload,
  buildSellerNotificationFallback,
  buyerNotificationRowFromService,
  enrichBuyerNotification,
  enrichSellerNotification,
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
import { logBuyerShipmentToast } from "../constants/buyerShipmentToastDebug";
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

function isBuyerOrderShippedToast(payload: InAppNotificationPayload): boolean {
  return (
    payload.audience === "buyer" &&
    payload.notificationType === "order_shipped"
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
      audience: InAppNotificationPayload["audience"],
      notificationType?: string
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
        if (notificationType === "order_shipped") {
          logBuyerShipmentToast(`marked toast_shown_at ${notificationId}`);
        }
      }

      logInAppToastOnce("marked shown", notificationId);
    },
    []
  );

  const shouldSkipToastOnce = useCallback(
    (notificationId: string, meta: ToastOnceMeta): boolean => {
      if (meta.toastShownAt) {
        seenIds.current.add(notificationId);
        if (meta.notificationType === "order_shipped" && meta.audience === "buyer") {
          logBuyerShipmentToast(`skipped already shown ${notificationId}`);
        }
        logInAppToastOnce(
          "skipped already shown database",
          notificationId,
          meta.notificationType
        );
        return true;
      }

      if (seenIds.current.has(notificationId)) {
        if (meta.notificationType === "order_shipped" && meta.audience === "buyer") {
          logBuyerShipmentToast(`skipped already shown ${notificationId}`);
        }
        logInAppToastOnce(
          "skipped already shown memory",
          notificationId,
          meta.notificationType
        );
        void commitToastShown(notificationId, meta.audience, meta.notificationType);
        return true;
      }

      if (storageShownIds.current.has(notificationId)) {
        if (meta.notificationType === "order_shipped" && meta.audience === "buyer") {
          logBuyerShipmentToast(`skipped already shown ${notificationId}`);
        }
        logInAppToastOnce(
          "skipped already shown storage",
          notificationId,
          meta.notificationType
        );
        void commitToastShown(notificationId, meta.audience, meta.notificationType);
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
          if (meta.notificationType === "order_shipped" && meta.audience === "buyer") {
            logBuyerShipmentToast(`skipped too old ${notificationId}`);
          }
          logInAppToastOnce("skipped too old", notificationId, `${ageMs}ms`);
          void commitToastShown(notificationId, meta.audience, meta.notificationType);
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
        void commitToastShown(payload.id, payload.audience, payload.notificationType);
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
      if (isBuyerOrderShippedToast(payload)) {
        logBuyerShipmentToast(`queued ${payload.id}`);
      }
      if (isSellerNewPaidToast(payload)) {
        logSellerOrderInstant(`toast queued ${payload.id}`);
      }
      void commitToastShown(payload.id, payload.audience, payload.notificationType);
      return true;
    },
    [commitToastShown, navigationRef, shouldSkipToastOnce]
  );

  const replaceQueuedPayload = useCallback(
    (payload: InAppNotificationPayload) => {
      const updateQueue = (
        setter: React.Dispatch<React.SetStateAction<InAppNotificationPayload[]>>
      ) => {
        setter((current) => {
          const index = current.findIndex((item) => item.id === payload.id);
          if (index < 0) {
            return current;
          }
          const next = [...current];
          next[index] = payload;
          return next;
        });
      };

      if (payload.audience === "seller") {
        updateQueue(setSellerQueue);
      } else {
        updateQueue(setBuyerQueue);
      }
    },
    []
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

      if (row.notification_type === "new_paid_order") {
        logSellerOrderInstant(`global handler started ${row.id}`);
        syncNewPaidSellerOrder({
          notificationId: row.id,
          orderId: row.order_id,
        });
      }

      const payload = buildSellerNotificationFallback(row);
      queueToastPayload(payload, {
        ...meta,
        audience: "seller",
        notificationType: row.notification_type,
      });

      void enrichSellerNotification(row)
        .then((enriched) => {
          replaceQueuedPayload(enriched);
        })
        .catch((error) => {
          logInAppToastOnce(
            "error enrichSellerNotification",
            row.id,
            error instanceof Error ? error.message : String(error)
          );
          logSellerOrderNotification(
            "error",
            "processSellerInsert",
            row.id,
            error instanceof Error ? error.message : String(error)
          );
        });
    },
    [queueToastPayload, replaceQueuedPayload, syncNewPaidSellerOrder]
  );

  const handleIncomingBuyerOrderNotification = useCallback(
    (
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

      const fallback = buildFallbackPayload(row, "buyer");
      const queued = queueToastPayload(fallback, {
        ...meta,
        audience: "buyer",
        notificationType: row.notification_type,
      });
      if (!queued) {
        return;
      }

      void enrichBuyerNotification(row)
        .then((enriched) => {
          replaceQueuedPayload(enriched);
        })
        .catch((error) => {
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
        });
    },
    [queueToastPayload, replaceQueuedPayload]
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
        handlersRef.current.handleIncomingBuyerOrderNotification(row, {
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
    if (isBuyerOrderShippedToast(visibleNotification)) {
      logBuyerShipmentToast(`toast displayed ${visibleNotification.id}`);
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
      } else if (isBuyerOrderShippedToast(notification)) {
        logBuyerShipmentToast(`navigate to order ${notification.orderId}`);
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
      <View style={styles.root}>
        {children}
        <InAppNotificationToast
          notification={visibleNotification}
          onPress={openNotification}
          onDismiss={dismissActive}
        />
      </View>
    </InAppNotificationContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

export function useInAppNotifications(): InAppNotificationContextValue {
  const ctx = useContext(InAppNotificationContext);
  if (!ctx) {
    throw new Error(
      "useInAppNotifications must be used within InAppNotificationProvider"
    );
  }
  return ctx;
}
