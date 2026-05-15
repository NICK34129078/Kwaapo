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
import {
  fetchLikeCountsForPosts,
  fetchLikedPostIdsForUser,
  isPersistablePostId,
  setPostLikedInSupabase,
} from "../services/postLikesService";

type PerPost = {
  likesCount: number;
  isLikedByCurrentUser: boolean;
};

type LikesContextValue = {
  getLikeState: (postId: string, defaultLikesCount: number) => PerPost;
  toggleLike: (postId: string, defaultLikesCount: number) => Promise<void>;
  /** Na feed-fetch: reset lokale count-delta’s + hydratie van eigen likes (uuid-posts). */
  syncFeedLikeState: (posts: Array<{ id: string }>) => void;
  /**
   * Verhoogt bij elke like-state wijziging. Gebruik in FlatList `extraData` zodat rijen
   * opnieuw renderen (VirtualizedList rendert anders niet bij alleen context-updates).
   */
  interactionRevision: number;
};

const LikesContext = createContext<LikesContextValue | null>(null);

export function LikesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  /** Placeholder reels (id zoals "reel-1"): alleen lokaal, geen Supabase. */
  const [demoOverrides, setDemoOverrides] = useState<Record<string, PerPost>>(
    {}
  );

  const [hydratedLiked, setHydratedLiked] = useState<Record<string, boolean>>(
    {}
  );
  /** Baseline teller uit post_likes per post (na sync); ontbreekt → fallback `defaultLikesCount` uit feed-item. */
  const [hydratedCounts, setHydratedCounts] = useState<Record<string, number>>(
    {}
  );
  const [countAdjust, setCountAdjust] = useState<Record<string, number>>({});
  const [optimistic, setOptimistic] = useState<Record<string, PerPost>>({});
  const [interactionRevision, setInteractionRevision] = useState(0);
  /** Voorkom parallelle toggles op dezelfde post (double tap / trage network). */
  const toggleInFlight = useRef<Set<string>>(new Set());

  useEffect(() => {
    setInteractionRevision((n) => n + 1);
  }, [hydratedLiked, hydratedCounts, countAdjust, optimistic, demoOverrides]);

  useEffect(() => {
    if (!user?.id) {
      setHydratedLiked({});
      setCountAdjust({});
      setOptimistic({});
      setDemoOverrides({});
      toggleInFlight.current.clear();
    }
  }, [user?.id]);

  const syncFeedLikeState = useCallback(
    (posts: Array<{ id: string }>) => {
      const ids = posts.map((p) => p.id);

      setCountAdjust((prev) => {
        const next = { ...prev };
        for (const id of ids) {
          delete next[id];
        }
        return next;
      });

      if (!user?.id) {
        setHydratedLiked({});
      }

      const uuidIds = ids.filter(isPersistablePostId);
      if (uuidIds.length === 0) {
        return;
      }

      void (async () => {
        try {
          const counts = await fetchLikeCountsForPosts(uuidIds);
          setHydratedCounts((prev) => {
            const next = { ...prev };
            for (const id of uuidIds) {
              next[id] = counts[id] ?? 0;
            }
            return next;
          });

          if (user?.id) {
            const liked = await fetchLikedPostIdsForUser(uuidIds, user.id);
            setHydratedLiked((prev) => {
              const next = { ...prev };
              for (const id of uuidIds) {
                next[id] = liked.has(id);
              }
              return next;
            });
          }
        } catch (e) {
          if (__DEV__) {
            console.warn("[Likes] hydrate failed:", e);
          }
        }
      })();
    },
    [user?.id]
  );

  const getLikeState = useCallback(
    (postId: string, defaultLikesCount: number): PerPost => {
      const pending = optimistic[postId];
      if (pending) {
        return pending;
      }

      if (!isPersistablePostId(postId)) {
        const d = demoOverrides[postId];
        return (
          d ?? {
            likesCount: defaultLikesCount,
            isLikedByCurrentUser: false,
          }
        );
      }

      const liked = hydratedLiked[postId] ?? false;
      const baseCount =
        hydratedCounts[postId] !== undefined
          ? hydratedCounts[postId]
          : defaultLikesCount;
      const count = Math.max(0, baseCount + (countAdjust[postId] ?? 0));
      return {
        likesCount: count,
        isLikedByCurrentUser: liked,
      };
    },
    [demoOverrides, hydratedLiked, hydratedCounts, countAdjust, optimistic]
  );

  const toggleLike = useCallback(
    async (postId: string, defaultLikesCount: number) => {
      if (!isPersistablePostId(postId)) {
        setDemoOverrides((prev) => {
          const current = prev[postId] ?? {
            likesCount: defaultLikesCount,
            isLikedByCurrentUser: false,
          };
          const wasLiked = current.isLikedByCurrentUser;
          const nextLiked = !wasLiked;
          const delta = nextLiked ? 1 : -1;
          return {
            ...prev,
            [postId]: {
              likesCount: Math.max(0, current.likesCount + delta),
              isLikedByCurrentUser: nextLiked,
            },
          };
        });
        return;
      }

      if (!user?.id) {
        return;
      }

      if (toggleInFlight.current.has(postId)) {
        return;
      }
      toggleInFlight.current.add(postId);

      const current = getLikeState(postId, defaultLikesCount);
      const wasLiked = current.isLikedByCurrentUser;
      const nextLiked = !wasLiked;
      const delta = nextLiked ? 1 : -1;
      const nextCount = Math.max(0, current.likesCount + delta);

      setOptimistic((prev) => ({
        ...prev,
        [postId]: {
          likesCount: nextCount,
          isLikedByCurrentUser: nextLiked,
        },
      }));

      try {
        await setPostLikedInSupabase(postId, user.id, nextLiked);

        setHydratedLiked((prev) => ({ ...prev, [postId]: nextLiked }));
        setCountAdjust((prev) => {
          const prevAdj = prev[postId] ?? 0;
          const newAdj = prevAdj + delta;
          const next = { ...prev };
          if (newAdj === 0) {
            delete next[postId];
          } else {
            next[postId] = newAdj;
          }
          return next;
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn("[Likes] toggle failed:", msg);
      } finally {
        setOptimistic((prev) => {
          const next = { ...prev };
          delete next[postId];
          return next;
        });
        toggleInFlight.current.delete(postId);
      }
    },
    [user?.id, getLikeState]
  );

  const value = useMemo(
    () => ({
      getLikeState,
      toggleLike,
      syncFeedLikeState,
      interactionRevision,
    }),
    [getLikeState, toggleLike, syncFeedLikeState, interactionRevision]
  );

  return (
    <LikesContext.Provider value={value}>{children}</LikesContext.Provider>
  );
}

export function useLikes(): LikesContextValue {
  const ctx = useContext(LikesContext);
  if (!ctx) {
    throw new Error("useLikes must be used within LikesProvider");
  }
  return ctx;
}

/** Voor `FeedItem`: huidige count + like status + tap handler */
export function useReelLike(
  postId: string,
  defaultLikesCount: number
): {
  likesCount: number;
  isLikedByCurrentUser: boolean;
  onToggleLike: () => Promise<void>;
} {
  const { getLikeState, toggleLike } = useLikes();
  const s = getLikeState(postId, defaultLikesCount);
  const onToggleLike = useCallback(() => {
    return toggleLike(postId, defaultLikesCount);
  }, [postId, defaultLikesCount, toggleLike]);
  return {
    likesCount: s.likesCount,
    isLikedByCurrentUser: s.isLikedByCurrentUser,
    onToggleLike,
  };
}
