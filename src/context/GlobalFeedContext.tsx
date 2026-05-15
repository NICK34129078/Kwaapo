import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAuth } from "./AuthContext";
import { useLikes } from "./LikesContext";
import { fetchGlobalPosts } from "../services/postsService";
import { fetchPersonalizedFeed } from "../services/personalizedFeedService";
import type { UserVideoPost } from "../types/userVideoPost";

type GlobalFeedValue = {
  /** Alle posts voor de Reels-tab (iedereen, Supabase, nieuwste eerst). */
  globalFeedPosts: UserVideoPost[];
  /** Opnieuw ophalen vanaf de backend. */
  refreshGlobalFeed: () => Promise<void>;
  /** Volgende batch personalized (+ fallback global) appenden; geen volledige refresh. */
  loadMoreGlobalFeed: () => Promise<void>;
  globalFeedLoading: boolean;
  /** True tijdens loadMoreGlobalFeed (voorkomt parallelle batch-requests). */
  isLoadingMoreFeed: boolean;
  globalFeedError: string | null;
};

const GlobalFeedContext = createContext<GlobalFeedValue | null>(null);

export function GlobalFeedProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { syncFeedLikeState } = useLikes();
  const [globalFeedPosts, setGlobalFeedPosts] = useState<UserVideoPost[]>([]);
  const [globalFeedLoading, setGlobalFeedLoading] = useState(false);
  const [isLoadingMoreFeed, setIsLoadingMoreFeed] = useState(false);
  const [globalFeedError, setGlobalFeedError] = useState<string | null>(null);
  const globalFeedPostsRef = useRef<UserVideoPost[]>([]);
  const loadMoreInFlightRef = useRef(false);

  useEffect(() => {
    globalFeedPostsRef.current = globalFeedPosts;
  }, [globalFeedPosts]);

  const refreshGlobalFeed = useCallback(async () => {
    setGlobalFeedLoading(true);
    setGlobalFeedError(null);
    try {
      const personalized =
        user?.id != null ? await fetchPersonalizedFeed(10, []) : [];
      const rows = await fetchGlobalPosts();
      if (rows === undefined) {
        if (personalized.length > 0) {
          setGlobalFeedPosts(personalized);
        }
        return;
      }
      if (personalized.length === 0) {
        setGlobalFeedPosts(rows);
      } else {
        const seen = new Set<string>();
        const merged: UserVideoPost[] = [];
        for (const p of personalized) {
          if (!seen.has(p.id)) {
            seen.add(p.id);
            merged.push(p);
          }
        }
        for (const p of rows) {
          if (!seen.has(p.id)) {
            seen.add(p.id);
            merged.push(p);
          }
        }
        setGlobalFeedPosts(merged);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Feed kon niet geladen worden";
      setGlobalFeedError(msg);
      if (__DEV__) {
        console.warn("[GlobalFeed]", msg);
      }
    } finally {
      setGlobalFeedLoading(false);
    }
  }, [user?.id]);

  const loadMoreGlobalFeed = useCallback(async () => {
    if (loadMoreInFlightRef.current) {
      return;
    }
    loadMoreInFlightRef.current = true;
    setIsLoadingMoreFeed(true);
    try {
      const current = globalFeedPostsRef.current;
      const exclude = current.map((p) => p.id);
      let append: UserVideoPost[] = [];

      if (user?.id != null) {
        const batch = await fetchPersonalizedFeed(10, exclude);
        if (batch.length > 0) {
          append = batch;
        }
      }

      if (append.length === 0) {
        const global = await fetchGlobalPosts();
        if (global != null && global.length > 0) {
          const seen = new Set(exclude);
          append = global.filter((p) => !seen.has(p.id)).slice(0, 25);
        }
      }

      if (append.length === 0) {
        return;
      }

      setGlobalFeedPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const next = [...prev];
        for (const p of append) {
          if (!seen.has(p.id)) {
            seen.add(p.id);
            next.push(p);
          }
        }
        return next;
      });
    } catch {
      /* feed blijft staan op huidige buffer */
    } finally {
      loadMoreInFlightRef.current = false;
      setIsLoadingMoreFeed(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (globalFeedPosts.length === 0) {
      return;
    }
    syncFeedLikeState(globalFeedPosts);
  }, [user?.id, globalFeedPosts, syncFeedLikeState]);

  const value = useMemo(
    () => ({
      globalFeedPosts,
      refreshGlobalFeed,
      loadMoreGlobalFeed,
      globalFeedLoading,
      isLoadingMoreFeed,
      globalFeedError,
    }),
    [
      globalFeedPosts,
      refreshGlobalFeed,
      loadMoreGlobalFeed,
      globalFeedLoading,
      isLoadingMoreFeed,
      globalFeedError,
    ]
  );

  return (
    <GlobalFeedContext.Provider value={value}>
      {children}
    </GlobalFeedContext.Provider>
  );
}

export function useGlobalFeed(): GlobalFeedValue {
  const ctx = useContext(GlobalFeedContext);
  if (!ctx) {
    throw new Error("useGlobalFeed must be used within GlobalFeedProvider");
  }
  return ctx;
}
