import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { NavigationContainerRef } from "@react-navigation/native";
import { useAuth } from "./AuthContext";
import {
  enrichBuyerNotification,
  enrichSellerNotification,
  subscribeOrderNotificationInserts,
} from "../services/notificationRealtimeService";
import { markBuyerNotificationRead } from "../services/buyerNotificationService";
import { markSellerNotificationRead } from "../services/sellerNotificationService";
import { InAppNotificationToast } from "../components/InAppNotificationToast";
import {
  dequeueInAppNotification,
  enqueueInAppNotification,
  shouldSuppressInAppNotification,
  type InAppNotificationPayload,
} from "../utils/inAppNotification";

type InAppNotificationContextValue = {
  enqueueNotification: (payload: InAppNotificationPayload) => void;
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

export function InAppNotificationProvider({
  children,
  navigationRef,
}: {
  children: React.ReactNode;
  navigationRef: React.RefObject<NavigationContainerRef<any> | null>;
}) {
  const { user } = useAuth();
  const [queue, setQueue] = useState<InAppNotificationPayload[]>([]);
  const seenIds = useRef(new Set<string>());

  const enqueueNotification = useCallback((payload: InAppNotificationPayload) => {
    if (seenIds.current.has(payload.id)) {
      return;
    }
    seenIds.current.add(payload.id);

    const currentRoute = navigationRef.current?.getCurrentRoute()?.name;
    const currentOrderId = getActiveOrderId(navigationRef.current);
    if (shouldSuppressInAppNotification(currentRoute, currentOrderId, payload)) {
      return;
    }

    setQueue((current) => enqueueInAppNotification(current, payload));
  }, [navigationRef]);

  const processSellerInsert = useCallback(
    async (row: Parameters<typeof enrichSellerNotification>[0]) => {
      const payload = await enrichSellerNotification(row);
      enqueueNotification(payload);
    },
    [enqueueNotification]
  );

  const processBuyerInsert = useCallback(
    async (row: Parameters<typeof enrichBuyerNotification>[0]) => {
      const payload = await enrichBuyerNotification(row);
      enqueueNotification(payload);
    },
    [enqueueNotification]
  );

  useEffect(() => {
    seenIds.current.clear();
    setQueue([]);
    if (!user?.id) {
      return;
    }

    return subscribeOrderNotificationInserts(user.id, {
      onSellerInsert: (row) => {
        void processSellerInsert(row);
      },
      onBuyerInsert: (row) => {
        void processBuyerInsert(row);
      },
    });
  }, [processBuyerInsert, processSellerInsert, user?.id]);

  const activeNotification = queue[0] ?? null;

  const dismissActive = useCallback(() => {
    setQueue((current) => dequeueInAppNotification(current));
  }, []);

  const openNotification = useCallback(
    (notification: InAppNotificationPayload) => {
      if (notification.audience === "seller") {
        void markSellerNotificationRead(notification.id);
      } else {
        void markBuyerNotificationRead(notification.id);
      }

      dismissActive();

      const focusTracking =
        notification.audience === "buyer" &&
        notification.notificationType === "order_shipped";

      navigationRef.current?.navigate("OrderDetail", {
        orderId: notification.orderId,
        focusTracking,
      });
    },
    [dismissActive, navigationRef]
  );

  const value = useMemo(
    () => ({
      enqueueNotification,
    }),
    [enqueueNotification]
  );

  return (
    <InAppNotificationContext.Provider value={value}>
      {children}
      <InAppNotificationToast
        notification={activeNotification}
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
