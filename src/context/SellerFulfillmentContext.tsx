import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useAuth } from "./AuthContext";
import {
  fetchSellerFulfillmentSnapshot,
  subscribeSellerFulfillmentChanges,
  type SellerFulfillmentChangeHint,
  type SellerFulfillmentSnapshot,
} from "../services/sellerFulfillmentService";
import {
  countUnreadSellerNotifications,
  fetchOpenSellerNotifications,
} from "../services/sellerNotificationService";
import type { SellerNotification } from "../services/sellerNotificationService";
import type { SellerOrder } from "../types/order";
import {
  formatOrderIdsForLog,
  logSellerOpenOrders,
} from "../constants/sellerOpenOrdersDebug";
import { clearSellerOrderInstantTiming } from "../constants/sellerOrderInstantDebug";
import { getOpenSellerOrderIdsFromSnapshot } from "../utils/sellerOpenOrders";

export type SyncNewPaidSellerOrderInput = {
  notificationId: string;
  orderId: string;
};

type SellerFulfillmentContextValue = {
  actionCount: number;
  unreadNotificationCount: number;
  ordersNeedingAction: SellerOrder[];
  isBusinessSeller: boolean;
  openNotifications: SellerNotification[];
  loading: boolean;
  refresh: () => Promise<void>;
  getOpenSellerOrderCount: () => number;
  syncNewPaidSellerOrder: (input: SyncNewPaidSellerOrderInput) => void;
  reportShippingStarted: (orderId: string) => void;
  reportShippingConfirmed: (orderId: string) => void;
  reportShippingFailed: (orderId: string) => void;
};

const SellerFulfillmentContext =
  createContext<SellerFulfillmentContextValue | null>(null);

function snapshotWithCount(
  base: SellerFulfillmentSnapshot,
  openOrderIds: Set<string>
): SellerFulfillmentSnapshot {
  const count = openOrderIds.size;
  return {
    ...base,
    actionCount: count,
    ordersNeedingAction: base.ordersNeedingAction.filter((row) =>
      openOrderIds.has(row.order.id)
    ),
  };
}

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
  const openOrderIdsRef = useRef(new Set<string>());
  const pendingRemovalOrderIdsRef = useRef(new Set<string>());
  const shippingRollbackCountsRef = useRef(new Map<string, number>());
  const initialFetchLoggedRef = useRef(false);
  const pendingHintRef = useRef<SellerFulfillmentChangeHint | null>(null);
  const lastServerSnapshotRef = useRef<SellerFulfillmentSnapshot | null>(null);

  const publishOpenOrderState = useCallback(
    (baseSnapshot: SellerFulfillmentSnapshot) => {
      const effectiveIds = new Set(openOrderIdsRef.current);
      for (const orderId of pendingRemovalOrderIdsRef.current) {
        effectiveIds.delete(orderId);
      }
      openOrderIdsRef.current = effectiveIds;
      const nextSnapshot = snapshotWithCount(baseSnapshot, effectiveIds);
      setSnapshot(nextSnapshot);
      logSellerOpenOrders(`badge rendered ${nextSnapshot.actionCount}`);
      return nextSnapshot;
    },
    []
  );

  const applyServerSnapshot = useCallback(
    (
      nextSnapshot: SellerFulfillmentSnapshot,
      logRefresh: boolean,
      allowServerAdds: boolean
    ) => {
      lastServerSnapshotRef.current = nextSnapshot;
      const serverIds = new Set(getOpenSellerOrderIdsFromSnapshot(nextSnapshot));

      for (const orderId of [...pendingRemovalOrderIdsRef.current]) {
        if (!serverIds.has(orderId)) {
          pendingRemovalOrderIdsRef.current.delete(orderId);
          shippingRollbackCountsRef.current.delete(orderId);
        }
      }

      if (allowServerAdds) {
        const mergedIds = new Set(serverIds);
        for (const orderId of openOrderIdsRef.current) {
          if (
            !serverIds.has(orderId) &&
            !pendingRemovalOrderIdsRef.current.has(orderId)
          ) {
            mergedIds.add(orderId);
          }
        }
        openOrderIdsRef.current = mergedIds;
      } else {
        for (const orderId of [...openOrderIdsRef.current]) {
          if (
            !serverIds.has(orderId) &&
            !pendingRemovalOrderIdsRef.current.has(orderId)
          ) {
            openOrderIdsRef.current.delete(orderId);
          }
        }
      }

      const effectiveIds = openOrderIdsRef.current;

      if (!initialFetchLoggedRef.current) {
        initialFetchLoggedRef.current = true;
        logSellerOpenOrders(
          `initial fetched ${effectiveIds.size} ${formatOrderIdsForLog(effectiveIds)}`
        );
      } else if (logRefresh) {
        logSellerOpenOrders(
          `refresh result ${effectiveIds.size} ${formatOrderIdsForLog(effectiveIds)}`
        );
      }

      return publishOpenOrderState(nextSnapshot);
    },
    [publishOpenOrderState]
  );

  const refresh = useCallback(
    async (options?: { allowServerAdds?: boolean }) => {
      const allowServerAdds = options?.allowServerAdds ?? false;
      if (!user?.id) {
        openOrderIdsRef.current.clear();
        pendingRemovalOrderIdsRef.current.clear();
        shippingRollbackCountsRef.current.clear();
        initialFetchLoggedRef.current = false;
        lastServerSnapshotRef.current = null;
        clearSellerOrderInstantTiming();
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
        applyServerSnapshot(nextSnapshot, true, allowServerAdds);
        setOpenNotifications(notifications);
        setUnreadNotificationCount(unreadCount);
      } catch {
        openOrderIdsRef.current.clear();
        pendingRemovalOrderIdsRef.current.clear();
        shippingRollbackCountsRef.current.clear();
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
    },
    [applyServerSnapshot, user?.id]
  );

  const getOpenSellerOrderCount = useCallback(() => {
    return openOrderIdsRef.current.size;
  }, []);

  const syncNewPaidSellerOrder = useCallback(
    (input: SyncNewPaidSellerOrderInput) => {
      if (!user?.id) {
        return;
      }
      if (pendingRemovalOrderIdsRef.current.has(input.orderId)) {
        return;
      }
      if (openOrderIdsRef.current.has(input.orderId)) {
        return;
      }

      openOrderIdsRef.current.add(input.orderId);
      const newCount = openOrderIdsRef.current.size;
      logSellerOpenOrders(
        `realtime order added ${input.orderId} ${newCount}`
      );

      const base = lastServerSnapshotRef.current ?? {
        actionCount: 0,
        ordersNeedingAction: [],
        isBusinessSeller: true,
      };
      publishOpenOrderState({
        ...base,
        isBusinessSeller: true,
      });
    },
    [publishOpenOrderState, user?.id]
  );

  const reportShippingStarted = useCallback(
    (orderId: string) => {
      if (!openOrderIdsRef.current.has(orderId)) {
        return;
      }
      if (pendingRemovalOrderIdsRef.current.has(orderId)) {
        return;
      }

      const oldCount = openOrderIdsRef.current.size;
      shippingRollbackCountsRef.current.set(orderId, oldCount);
      pendingRemovalOrderIdsRef.current.add(orderId);
      openOrderIdsRef.current.delete(orderId);
      const newCount = openOrderIdsRef.current.size;

      logSellerOpenOrders(`shipping started ${orderId} ${oldCount}`);
      logSellerOpenOrders(`optimistic decrement ${orderId} ${newCount}`);

      const base = lastServerSnapshotRef.current ?? {
        actionCount: 0,
        ordersNeedingAction: [],
        isBusinessSeller: true,
      };
      publishOpenOrderState(base);
    },
    [publishOpenOrderState]
  );

  const reportShippingConfirmed = useCallback(
    (orderId: string) => {
      const newCount = openOrderIdsRef.current.size;
      logSellerOpenOrders(`shipping confirmed ${orderId} ${newCount}`);
      void refresh();
    },
    [refresh]
  );

  const reportShippingFailed = useCallback(
    (orderId: string) => {
      if (!pendingRemovalOrderIdsRef.current.has(orderId)) {
        return;
      }

      pendingRemovalOrderIdsRef.current.delete(orderId);
      openOrderIdsRef.current.add(orderId);
      const restoredCount = openOrderIdsRef.current.size;
      shippingRollbackCountsRef.current.delete(orderId);

      logSellerOpenOrders(
        `shipping failed rollback ${orderId} ${restoredCount}`
      );

      const base = lastServerSnapshotRef.current ?? {
        actionCount: 0,
        ordersNeedingAction: [],
        isBusinessSeller: true,
      };
      publishOpenOrderState(base);
    },
    [publishOpenOrderState]
  );

  const handleRealtimeOrderChange = useCallback(
    (hint?: SellerFulfillmentChangeHint) => {
      if (hint?.becameShipped && hint.orderId) {
        if (pendingRemovalOrderIdsRef.current.has(hint.orderId)) {
          pendingHintRef.current = hint;
          void refresh();
          return;
        }
        if (openOrderIdsRef.current.has(hint.orderId)) {
          openOrderIdsRef.current.delete(hint.orderId);
          const newCount = openOrderIdsRef.current.size;
          logSellerOpenOrders(
            `optimistic decrement ${hint.orderId} ${newCount}`
          );
          logSellerOpenOrders(
            `shipping confirmed ${hint.orderId} ${newCount}`
          );
          const base = lastServerSnapshotRef.current ?? {
            actionCount: 0,
            ordersNeedingAction: [],
            isBusinessSeller: true,
          };
          publishOpenOrderState(base);
        }
      }
      pendingHintRef.current = hint ?? null;
      void refresh();
    },
    [publishOpenOrderState, refresh]
  );

  useEffect(() => {
    initialFetchLoggedRef.current = false;
    pendingHintRef.current = null;
    openOrderIdsRef.current.clear();
    pendingRemovalOrderIdsRef.current.clear();
    shippingRollbackCountsRef.current.clear();
    clearSellerOrderInstantTiming();
    void refresh({ allowServerAdds: true });
  }, [refresh]);

  useEffect(() => {
    if (!user?.id || !snapshot.isBusinessSeller) {
      return;
    }
    return subscribeSellerFulfillmentChanges(user.id, handleRealtimeOrderChange);
  }, [handleRealtimeOrderChange, snapshot.isBusinessSeller, user?.id]);

  useEffect(() => {
    const onAppState = (state: AppStateStatus) => {
      if (state === "active") {
        void refresh({ allowServerAdds: true });
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
      getOpenSellerOrderCount,
      syncNewPaidSellerOrder,
      reportShippingStarted,
      reportShippingConfirmed,
      reportShippingFailed,
    }),
    [
      getOpenSellerOrderCount,
      loading,
      openNotifications,
      refresh,
      reportShippingConfirmed,
      reportShippingFailed,
      reportShippingStarted,
      snapshot,
      syncNewPaidSellerOrder,
      unreadNotificationCount,
    ]
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

/** Open seller-orders voor badges en actie-lijsten. */
export function useSellerActionRequiredOrders(): Pick<
  SellerFulfillmentContextValue,
  "actionCount" | "ordersNeedingAction" | "getOpenSellerOrderCount" | "refresh"
> {
  const ctx = useSellerFulfillment();
  return {
    actionCount: ctx.actionCount,
    ordersNeedingAction: ctx.ordersNeedingAction,
    getOpenSellerOrderCount: ctx.getOpenSellerOrderCount,
    refresh: ctx.refresh,
  };
}

/** Veilig buiten provider (bijv. tests) — fallback nulls. */
export function useSellerFulfillmentOptional(): SellerFulfillmentContextValue | null {
  return useContext(SellerFulfillmentContext);
}
