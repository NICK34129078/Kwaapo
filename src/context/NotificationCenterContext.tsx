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
  countUnreadSocialItems,
  fetchSocialActivityFeed,
} from "../services/activityFeedService";
import {
  fetchActivityReadKeys,
  markActivityRead,
  markAllSocialActivityAsRead,
} from "../services/activityReadService";
import {
  countUnreadOrderNotifications,
  fetchOrderNotificationFeed,
} from "../services/orderNotificationFeedService";
import { markSellerNotificationRead } from "../services/sellerNotificationService";
import { fetchProfileById } from "../services/profileService";
import { supabase } from "../lib/supabase";

type NotificationCenterContextValue = {
  activityUnreadCount: number;
  ordersUnreadCount: number;
  totalUnreadCount: number;
  isBusinessSeller: boolean;
  refresh: () => Promise<void>;
  markSocialActivityRead: (activityKey: string) => Promise<void>;
  markAllSocialActivityAsRead: (activityKeys: string[]) => Promise<void>;
  markOrderNotificationRead: (notificationId: string) => Promise<void>;
};

const NotificationCenterContext =
  createContext<NotificationCenterContextValue | null>(null);

export function NotificationCenterProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [activityUnreadCount, setActivityUnreadCount] = useState(0);
  const [ordersUnreadCount, setOrdersUnreadCount] = useState(0);
  const [isBusinessSeller, setIsBusinessSeller] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setActivityUnreadCount(0);
      setOrdersUnreadCount(0);
      setIsBusinessSeller(false);
      return;
    }

    const profile = await fetchProfileById(user.id);
    const business = profile?.accountType === "business";
    setIsBusinessSeller(business);

    const readKeys = await fetchActivityReadKeys();
    const socialItems = await fetchSocialActivityFeed(user.id, readKeys);
    setActivityUnreadCount(countUnreadSocialItems(socialItems));

    if (business) {
      const orderItems = await fetchOrderNotificationFeed();
      setOrdersUnreadCount(countUnreadOrderNotifications(orderItems));
    } else {
      setOrdersUnreadCount(0);
    }
  }, [user?.id]);

  const markSocialActivityRead = useCallback(async (activityKey: string) => {
    const ok = await markActivityRead(activityKey);
    if (ok) {
      setActivityUnreadCount((prev) => Math.max(0, prev - 1));
    }
  }, []);

  const markAllSocialActivityAsReadInContext = useCallback(
    async (activityKeys: string[]) => {
      const unique = [...new Set(activityKeys.filter((key) => key.length > 0))];
      if (unique.length === 0) {
        return;
      }

      setActivityUnreadCount(0);
      const ok = await markAllSocialActivityAsRead(unique);
      if (!ok) {
        void refresh();
      }
    },
    [refresh]
  );

  const markOrderNotificationRead = useCallback(async (notificationId: string) => {
    await markSellerNotificationRead(notificationId);
    setOrdersUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    const channel = supabase
      .channel(`notification_center:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "activity_reads",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void refresh();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "seller_notifications",
          filter: `seller_id=eq.${user.id}`,
        },
        () => {
          void refresh();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "follow_requests" },
        () => {
          void refresh();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "follows",
          filter: `following_id=eq.${user.id}`,
        },
        () => {
          void refresh();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh, user?.id]);

  useEffect(() => {
    const onState = (state: AppStateStatus) => {
      if (state === "active") {
        void refresh();
      }
    };
    const sub = AppState.addEventListener("change", onState);
    return () => sub.remove();
  }, [refresh]);

  const totalUnreadCount = activityUnreadCount + ordersUnreadCount;

  const value = useMemo(
    () => ({
      activityUnreadCount,
      ordersUnreadCount,
      totalUnreadCount,
      isBusinessSeller,
      refresh,
      markSocialActivityRead,
      markAllSocialActivityAsRead: markAllSocialActivityAsReadInContext,
      markOrderNotificationRead,
    }),
    [
      activityUnreadCount,
      isBusinessSeller,
      markOrderNotificationRead,
      markAllSocialActivityAsReadInContext,
      markSocialActivityRead,
      ordersUnreadCount,
      refresh,
      totalUnreadCount,
    ]
  );

  return (
    <NotificationCenterContext.Provider value={value}>
      {children}
    </NotificationCenterContext.Provider>
  );
}

export function useNotificationCenter(): NotificationCenterContextValue {
  const ctx = useContext(NotificationCenterContext);
  if (!ctx) {
    throw new Error(
      "useNotificationCenter must be used within NotificationCenterProvider"
    );
  }
  return ctx;
}

export function useNotificationCenterOptional() {
  return useContext(NotificationCenterContext);
}
