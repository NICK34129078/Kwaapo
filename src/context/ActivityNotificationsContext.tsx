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
  countUnreadActivitySince,
  fetchOwnPostIdSet,
  getActivityLastSeenAt,
  markActivitySeenNow,
  resolveActivityToast,
  subscribeActivityNotifications,
  type ActivityToastPayload,
} from "../services/activityNotificationService";

type ActivityNotificationsContextValue = {
  unreadCount: number;
  activeToast: ActivityToastPayload | null;
  markActivitySeen: () => Promise<void>;
  refreshUnreadCount: () => Promise<void>;
  onToastFinished: () => void;
};

const ActivityNotificationsContext =
  createContext<ActivityNotificationsContextValue | null>(null);

const POLL_MS = 45_000;

export function ActivityNotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeToast, setActiveToast] = useState<ActivityToastPayload | null>(
    null
  );

  const lastSeenRef = useRef(new Date(0).toISOString());
  const ownPostIdsRef = useRef<Set<string>>(new Set());
  const toastQueueRef = useRef<ActivityToastPayload[]>([]);
  const toastBusyRef = useRef(false);
  const readyRef = useRef(false);

  const refreshOwnPostIds = useCallback(async () => {
    if (!user?.id) {
      ownPostIdsRef.current = new Set();
      return;
    }
    ownPostIdsRef.current = await fetchOwnPostIdSet(user.id);
  }, [user?.id]);

  const refreshUnreadCount = useCallback(async () => {
    if (!user?.id) {
      setUnreadCount(0);
      return;
    }
    const count = await countUnreadActivitySince(
      user.id,
      lastSeenRef.current
    );
    setUnreadCount(count);
  }, [user?.id]);

  const pumpToastQueue = useCallback(() => {
    if (toastBusyRef.current) {
      return;
    }
    const next = toastQueueRef.current.shift();
    if (!next) {
      setActiveToast(null);
      return;
    }
    toastBusyRef.current = true;
    setActiveToast(next);
  }, []);

  const onToastFinished = useCallback(() => {
    toastBusyRef.current = false;
    setActiveToast(null);
    requestAnimationFrame(() => {
      pumpToastQueue();
    });
  }, [pumpToastQueue]);

  const pushToast = useCallback(
    (payload: ActivityToastPayload) => {
      toastQueueRef.current.push(payload);
      pumpToastQueue();
    },
    [pumpToastQueue]
  );

  const handleActivityEvent = useCallback(
    async (kind: "like" | "comment", postId: string, actorId: string) => {
      if (!user?.id || !readyRef.current) {
        return;
      }
      if (actorId === user.id) {
        return;
      }
      if (!ownPostIdsRef.current.has(postId)) {
        return;
      }

      setUnreadCount((prev) => prev + 1);
      try {
        const payload = await resolveActivityToast(kind, actorId);
        pushToast(payload);
      } catch {
        pushToast({
          id: `${kind}-${Date.now()}`,
          kind,
          actorLabel: "Iemand",
          message:
            kind === "comment"
              ? "Iemand heeft een reactie achtergelaten"
              : "Iemand vindt je post leuk",
        });
      }
    },
    [pushToast, user?.id]
  );

  const markActivitySeen = useCallback(async () => {
    const now = await markActivitySeenNow();
    lastSeenRef.current = now;
    setUnreadCount(0);
  }, []);

  useEffect(() => {
    if (!user?.id) {
      readyRef.current = false;
      setUnreadCount(0);
      setActiveToast(null);
      toastQueueRef.current = [];
      toastBusyRef.current = false;
      return;
    }

    let cancelled = false;

    void (async () => {
      const stored =
        (await getActivityLastSeenAt()) ?? new Date(0).toISOString();
      if (cancelled) {
        return;
      }
      lastSeenRef.current = stored;
      await refreshOwnPostIds();
      if (cancelled) {
        return;
      }
      await refreshUnreadCount();
      if (cancelled) {
        return;
      }
      readyRef.current = true;
    })();

    return () => {
      cancelled = true;
      readyRef.current = false;
    };
  }, [refreshOwnPostIds, refreshUnreadCount, user?.id]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    const unsubscribe = subscribeActivityNotifications(
      user.id,
      (postId, actorId) => {
        void handleActivityEvent("like", postId, actorId);
      },
      (postId, actorId) => {
        void handleActivityEvent("comment", postId, actorId);
      }
    );

    const poll = setInterval(() => {
      void refreshOwnPostIds();
      void refreshUnreadCount();
    }, POLL_MS);

    const onAppState = (state: AppStateStatus) => {
      if (state === "active") {
        void refreshOwnPostIds();
        void refreshUnreadCount();
      }
    };
    const sub = AppState.addEventListener("change", onAppState);

    return () => {
      unsubscribe();
      clearInterval(poll);
      sub.remove();
    };
  }, [
    handleActivityEvent,
    refreshOwnPostIds,
    refreshUnreadCount,
    user?.id,
  ]);

  const value = useMemo(
    () => ({
      unreadCount,
      activeToast,
      markActivitySeen,
      refreshUnreadCount,
      onToastFinished,
    }),
    [
      activeToast,
      markActivitySeen,
      onToastFinished,
      refreshUnreadCount,
      unreadCount,
    ]
  );

  return (
    <ActivityNotificationsContext.Provider value={value}>
      {children}
    </ActivityNotificationsContext.Provider>
  );
}

export function useActivityNotifications(): ActivityNotificationsContextValue {
  const ctx = useContext(ActivityNotificationsContext);
  if (!ctx) {
    throw new Error(
      "useActivityNotifications must be used within ActivityNotificationsProvider"
    );
  }
  return ctx;
}

export function useActivityNotificationsOptional():
  | ActivityNotificationsContextValue
  | null {
  return useContext(ActivityNotificationsContext);
}
