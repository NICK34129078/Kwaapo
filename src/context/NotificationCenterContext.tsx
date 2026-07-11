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
import { markActivitySeenNow, getActivityLastSeenAt } from "../services/activityNotificationService";
import { resolveActivityTabBadgeCount } from "../utils/activityBadge";
import { supabase } from "../lib/supabase";

type NotificationCenterContextValue = {
  /** Unread social items (likes, follows, comments, follow requests). */
  activityUnreadCount: number;
  /** Badge count for the bottom-nav Activity tab (0 while tab is open). */
  activityTabBadgeCount: number;
  ordersUnreadCount: number;
  totalUnreadCount: number;
  isBusinessSeller: boolean;
  isActivityTabActive: boolean;
  lastSeenAt: string | null;
  refresh: () => Promise<void>;
  refreshUnreadSocialCount: () => Promise<void>;
  setActivityTabActive: (active: boolean) => void;
  /** Optimistic badge clear + server mark-as-read. Safe to call repeatedly. */
  openActivityTab: () => Promise<void>;
  markSocialActivityRead: (activityKey: string) => Promise<void>;
  markAllSocialActivityAsRead: (activityKeys: string[]) => Promise<void>;
  markOrderNotificationRead: (notificationId: string) => Promise<void>;
};

const NotificationCenterContext =
  createContext<NotificationCenterContextValue | null>(null);

const MARK_READ_RETRY_MS = 4_000;

export function NotificationCenterProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [activityUnreadCount, setActivityUnreadCount] = useState(0);
  const [ordersUnreadCount, setOrdersUnreadCount] = useState(0);
  const [isBusinessSeller, setIsBusinessSeller] = useState(false);
  const [isActivityTabActive, setIsActivityTabActive] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);

  const isActivityTabActiveRef = useRef(false);
  const markActivityInFlightRef = useRef(false);
  const pendingMarkKeysRef = useRef<string[] | null>(null);
  const markRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applySocialUnreadCount = useCallback((count: number) => {
    if (isActivityTabActiveRef.current) {
      setActivityUnreadCount(0);
      return;
    }
    setActivityUnreadCount(count);
  }, []);

  const refreshUnreadSocialCount = useCallback(async () => {
    if (!user?.id) {
      applySocialUnreadCount(0);
      return;
    }

    const readKeys = await fetchActivityReadKeys();
    const socialItems = await fetchSocialActivityFeed(user.id, readKeys);
    applySocialUnreadCount(countUnreadSocialItems(socialItems));
  }, [applySocialUnreadCount, user?.id]);

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
    applySocialUnreadCount(countUnreadSocialItems(socialItems));

    if (business) {
      const orderItems = await fetchOrderNotificationFeed();
      setOrdersUnreadCount(countUnreadOrderNotifications(orderItems));
    } else {
      setOrdersUnreadCount(0);
    }
  }, [applySocialUnreadCount, user?.id]);

  const scheduleMarkReadRetry = useCallback((keys: string[]) => {
    pendingMarkKeysRef.current = keys;
    if (markRetryTimerRef.current != null) {
      return;
    }
    markRetryTimerRef.current = setTimeout(() => {
      markRetryTimerRef.current = null;
      const pending = pendingMarkKeysRef.current;
      if (!pending || pending.length === 0 || !user?.id) {
        return;
      }
      void (async () => {
        const ok = await markAllSocialActivityAsRead(pending);
        if (ok) {
          pendingMarkKeysRef.current = null;
          if (!isActivityTabActiveRef.current) {
            void refreshUnreadSocialCount();
          }
          return;
        }
        if (isActivityTabActiveRef.current) {
          scheduleMarkReadRetry(pending);
        } else {
          void refreshUnreadSocialCount();
        }
      })();
    }, MARK_READ_RETRY_MS);
  }, [refreshUnreadSocialCount, user?.id]);

  const persistSocialItemsAsRead = useCallback(
    async (activityKeys: string[]) => {
      const unique = [...new Set(activityKeys.filter((key) => key.length > 0))];
      if (unique.length === 0) {
        return true;
      }

      const ok = await markAllSocialActivityAsRead(unique);
      if (!ok) {
        if (isActivityTabActiveRef.current) {
          scheduleMarkReadRetry(unique);
        }
        return false;
      }

      pendingMarkKeysRef.current = null;
      return true;
    },
    [scheduleMarkReadRetry]
  );

  const openActivityTab = useCallback(async () => {
    if (!user?.id || markActivityInFlightRef.current) {
      return;
    }

    markActivityInFlightRef.current = true;
    isActivityTabActiveRef.current = true;
    setIsActivityTabActive(true);
    setActivityUnreadCount(0);

    try {
      const seenAt = await markActivitySeenNow();
      setLastSeenAt(seenAt);

      const readKeys = await fetchActivityReadKeys();
      const socialItems = await fetchSocialActivityFeed(user.id, readKeys);
      const keys = socialItems.map((item) => item.activityKey);
      await persistSocialItemsAsRead(keys);
    } finally {
      markActivityInFlightRef.current = false;
    }
  }, [persistSocialItemsAsRead, user?.id]);

  const setActivityTabActive = useCallback(
    (active: boolean) => {
      isActivityTabActiveRef.current = active;
      setIsActivityTabActive(active);
      if (active) {
        setActivityUnreadCount(0);
        return;
      }
      void refreshUnreadSocialCount();
    },
    [refreshUnreadSocialCount]
  );

  const markSocialActivityRead = useCallback(async (activityKey: string) => {
    const ok = await markActivityRead(activityKey);
    if (ok && !isActivityTabActiveRef.current) {
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
      await persistSocialItemsAsRead(unique);
    },
    [persistSocialItemsAsRead]
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
    void getActivityLastSeenAt().then((stored) => {
      if (stored) {
        setLastSeenAt(stored);
      }
    });
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      isActivityTabActiveRef.current = false;
      setIsActivityTabActive(false);
      setLastSeenAt(null);
      pendingMarkKeysRef.current = null;
      if (markRetryTimerRef.current != null) {
        clearTimeout(markRetryTimerRef.current);
        markRetryTimerRef.current = null;
      }
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
          if (isActivityTabActiveRef.current) {
            return;
          }
          void refreshUnreadSocialCount();
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
          if (isActivityTabActiveRef.current) {
            return;
          }
          void refreshUnreadSocialCount();
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
          if (isActivityTabActiveRef.current) {
            return;
          }
          void refreshUnreadSocialCount();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "post_likes",
        },
        () => {
          if (isActivityTabActiveRef.current) {
            return;
          }
          void refreshUnreadSocialCount();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "post_comments",
        },
        () => {
          if (isActivityTabActiveRef.current) {
            return;
          }
          void refreshUnreadSocialCount();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh, refreshUnreadSocialCount, user?.id]);

  useEffect(() => {
    const onState = (state: AppStateStatus) => {
      if (state === "active") {
        if (isActivityTabActiveRef.current) {
          void refreshUnreadSocialCount();
          return;
        }
        void refresh();
      }
    };
    const sub = AppState.addEventListener("change", onState);
    return () => sub.remove();
  }, [refresh, refreshUnreadSocialCount]);

  useEffect(() => {
    return () => {
      if (markRetryTimerRef.current != null) {
        clearTimeout(markRetryTimerRef.current);
      }
    };
  }, []);

  const activityTabBadgeCount = resolveActivityTabBadgeCount(
    activityUnreadCount,
    isActivityTabActive
  );
  const totalUnreadCount = activityUnreadCount + ordersUnreadCount;

  const value = useMemo(
    () => ({
      activityUnreadCount,
      activityTabBadgeCount,
      ordersUnreadCount,
      totalUnreadCount,
      isBusinessSeller,
      isActivityTabActive,
      lastSeenAt,
      refresh,
      refreshUnreadSocialCount,
      setActivityTabActive,
      openActivityTab,
      markSocialActivityRead,
      markAllSocialActivityAsRead: markAllSocialActivityAsReadInContext,
      markOrderNotificationRead,
    }),
    [
      activityTabBadgeCount,
      activityUnreadCount,
      isActivityTabActive,
      isBusinessSeller,
      lastSeenAt,
      markAllSocialActivityAsReadInContext,
      markOrderNotificationRead,
      markSocialActivityRead,
      openActivityTab,
      ordersUnreadCount,
      refresh,
      refreshUnreadSocialCount,
      setActivityTabActive,
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
