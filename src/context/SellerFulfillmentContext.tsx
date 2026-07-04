import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useAuth } from "./AuthContext";
import {
  fetchSellerFulfillmentSnapshot,
  subscribeSellerFulfillmentChanges,
  type SellerFulfillmentSnapshot,
} from "../services/sellerFulfillmentService";
import {
  countUnreadSellerNotifications,
  fetchOpenSellerNotifications,
} from "../services/sellerNotificationService";
import type { SellerNotification } from "../services/sellerNotificationService";
import type { SellerOrder } from "../types/order";

type SellerFulfillmentContextValue = {
  actionCount: number;
  unreadNotificationCount: number;
  ordersNeedingAction: SellerOrder[];
  isBusinessSeller: boolean;
  openNotifications: SellerNotification[];
  loading: boolean;
  refresh: () => Promise<void>;
};

const SellerFulfillmentContext =
  createContext<SellerFulfillmentContextValue | null>(null);

export function SellerFulfillmentProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<SellerFulfillmentSnapshot>({
    actionCount: 0,
    ordersNeedingAction: [],
    isBusinessSeller: false,
  });
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [openNotifications, setOpenNotifications] = useState<SellerNotification[]>(
    []
  );
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setSnapshot({
        actionCount: 0,
        ordersNeedingAction: [],
        isBusinessSeller: false,
      });
      setOpenNotifications([]);
      setUnreadNotificationCount(0);
      return;
    }

    setLoading(true);
    try {
      const [nextSnapshot, notifications, unreadCount] = await Promise.all([
        fetchSellerFulfillmentSnapshot(),
        fetchOpenSellerNotifications(),
        countUnreadSellerNotifications(),
      ]);
      setSnapshot(nextSnapshot);
      setOpenNotifications(notifications);
      setUnreadNotificationCount(unreadCount);
    } catch {
      setSnapshot({
        actionCount: 0,
        ordersNeedingAction: [],
        isBusinessSeller: false,
      });
      setOpenNotifications([]);
      setUnreadNotificationCount(0);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user?.id || !snapshot.isBusinessSeller) {
      return;
    }
    return subscribeSellerFulfillmentChanges(user.id, () => {
      void refresh();
    });
  }, [refresh, snapshot.isBusinessSeller, user?.id]);

  useEffect(() => {
    const onAppState = (state: AppStateStatus) => {
      if (state === "active") {
        void refresh();
      }
    };
    const sub = AppState.addEventListener("change", onAppState);
    return () => sub.remove();
  }, [refresh]);

  const value = useMemo(
    () => ({
      actionCount: snapshot.actionCount,
      unreadNotificationCount,
      ordersNeedingAction: snapshot.ordersNeedingAction,
      isBusinessSeller: snapshot.isBusinessSeller,
      openNotifications,
      loading,
      refresh,
    }),
    [loading, openNotifications, refresh, snapshot, unreadNotificationCount]
  );

  return (
    <SellerFulfillmentContext.Provider value={value}>
      {children}
    </SellerFulfillmentContext.Provider>
  );
}

export function useSellerFulfillment(): SellerFulfillmentContextValue {
  const ctx = useContext(SellerFulfillmentContext);
  if (!ctx) {
    throw new Error("useSellerFulfillment must be used within SellerFulfillmentProvider");
  }
  return ctx;
}

/** Veilig buiten provider (bijv. tests) — fallback nulls. */
export function useSellerFulfillmentOptional(): SellerFulfillmentContextValue | null {
  return useContext(SellerFulfillmentContext);
}
