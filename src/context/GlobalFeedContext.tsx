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
import { fetchRankedFeedViaRpc } from "../services/rankedFeedService";
import type { UserVideoPost } from "../types/userVideoPost";
import {
  appendUniqueFeedPosts,
  buildRankedFeedBatch,
  dedupeFeedPosts,
  logForYouControlledMix,
} from "../utils/feedRanking";
import {
  fetchFeedMuteSets,
  filterFeedPostsByMuteSets,
  type FeedMuteSets,
} from "../services/feedModerationService";
import {
  BoundedSeenIds,
  excludeIdsForRpc,
} from "../utils/boundedSeenIds";
import {
  filterUnseenPosts,
  REELS_WINDOW,
  trimReelsFeedWindow,
} from "../utils/feedRollingWindow";
import { resolveLoadMoreBatchDecision } from "../utils/globalFeedLoadMore";
import { pruneSavedStatusCache } from "../services/savedPostsService";

const FEED_BATCH = REELS_WINDOW.LOAD_BATCH;

type RefreshOptions = {
  force?: boolean;
  /** Re-show posts viewed in the last 7 days (pull-to-refresh / Home tap). */
  allowRecentlyViewed?: boolean;
};

type FetchBatchOptions = {
  allowRecentlyViewed?: boolean;
};

type GlobalFeedValue = {
  globalFeedPosts: UserVideoPost[];
  refreshGlobalFeed: (options?: RefreshOptions) => Promise<void>;
  loadMoreGlobalFeed: () => Promise<void>;
  trimFeedWindow: (activePostId: string | null) => void;
  globalFeedLoading: boolean;
  isLoadingMoreFeed: boolean;
  globalFeedError: string | null;
  hasMoreFeed: boolean;
  feedEndReached: boolean;
  removePostFromFeed: (postId: string) => void;
  muteAuthor: (profileId: string) => void;
};

const GlobalFeedContext = createContext<GlobalFeedValue | null>(null);

export function GlobalFeedProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { syncFeedLikeState, prunePostIds } = useLikes();
  const [globalFeedPosts, setGlobalFeedPosts] = useState<UserVideoPost[]>([]);
  const [globalFeedLoading, setGlobalFeedLoading] = useState(false);
  const [isLoadingMoreFeed, setIsLoadingMoreFeed] = useState(false);
  const [globalFeedError, setGlobalFeedError] = useState<string | null>(null);
  const [hasMoreRankedFeed, setHasMoreRankedFeed] = useState(true);

  const globalFeedPostsRef = useRef<UserVideoPost[]>([]);
  const loadMoreInFlightRef = useRef(false);
  const feedGenerationRef = useRef(0);
  const seenPostIdsRef = useRef(new BoundedSeenIds(REELS_WINDOW.SEEN_MAX));
  const muteSetsRef = useRef<FeedMuteSets>({
    blockedProfileIds: new Set(),
    hiddenPostIds: new Set(),
  });
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const applyMuteFilter = useCallback((posts: UserVideoPost[]) => {
    return filterFeedPostsByMuteSets(posts, muteSetsRef.current);
  }, []);

  const registerPostsInSeen = useCallback((posts: readonly UserVideoPost[]) => {
    seenPostIdsRef.current.addMany(posts.map((p) => p.id));
  }, []);

  const onPostsRemovedFromWindow = useCallback(
    (removedIds: string[]) => {
      if (removedIds.length === 0) {
        return;
      }
      prunePostIds(removedIds);
      pruneSavedStatusCache(removedIds);
    },
    [prunePostIds]
  );

  const loadMuteSets = useCallback(async () => {
    if (!user?.id) {
      muteSetsRef.current = {
        blockedProfileIds: new Set(),
        hiddenPostIds: new Set(),
      };
      return;
    }
    muteSetsRef.current = await fetchFeedMuteSets();
  }, [user?.id]);

  const resetPaginationState = useCallback(() => {
    setHasMoreRankedFeed(true);
  }, []);

  useEffect(() => {
    setHasLoadedOnce(false);
    setGlobalFeedPosts([]);
    seenPostIdsRef.current.reset();
    resetPaginationState();
    void loadMuteSets();
  }, [user?.id, resetPaginationState, loadMuteSets]);

  useEffect(() => {
    globalFeedPostsRef.current = globalFeedPosts;
  }, [globalFeedPosts]);

  const hasMoreFeed = hasMoreRankedFeed;
  const feedEndReached =
    hasLoadedOnce && !hasMoreFeed && globalFeedPosts.length > 0;

  const trimFeedWindow = useCallback(
    (activePostId: string | null) => {
      const prev = globalFeedPostsRef.current;
      const { trimmed, removedIds } = trimReelsFeedWindow(prev, activePostId);
      if (removedIds.length === 0) {
        return;
      }
      setGlobalFeedPosts(trimmed);
      onPostsRemovedFromWindow(removedIds);
    },
    [onPostsRemovedFromWindow]
  );

  const fetchRankedFeedBatch = useCallback(
    async (limit: number, exclude: string[], options?: FetchBatchOptions) => {
      const result = await fetchRankedFeedViaRpc(limit, exclude, {
        isLoggedIn: user?.id != null,
        allowRecentlyViewed: options?.allowRecentlyViewed === true,
      });
      return {
        ...result,
        posts: applyMuteFilter(result.posts),
      };
    },
    [user?.id, applyMuteFilter]
  );

  const refreshGlobalFeed = useCallback(
    async (options?: RefreshOptions) => {
      const force = options?.force === true;
      const allowRecentlyViewed =
        options?.allowRecentlyViewed === true || force;
      if (
        !force &&
        hasLoadedOnce &&
        globalFeedPostsRef.current.length > 0
      ) {
        return;
      }

      const generation = ++feedGenerationRef.current;
      loadMoreInFlightRef.current = false;
      setIsLoadingMoreFeed(false);
      setGlobalFeedLoading(true);
      setGlobalFeedError(null);
      resetPaginationState();
      seenPostIdsRef.current.reset();

      const hadPostsBeforeRefresh = globalFeedPostsRef.current.length > 0;

      try {
        await loadMuteSets();
        if (generation !== feedGenerationRef.current) {
          return;
        }

        const { posts: rankedBatch, lastError } = await fetchRankedFeedBatch(
          FEED_BATCH,
          [],
          { allowRecentlyViewed }
        );

        if (generation !== feedGenerationRef.current) {
          return;
        }

        if (rankedBatch.length === 0) {
          const msg =
            lastError ??
            "Geen gerankte posts beschikbaar. Trek omlaag om opnieuw te proberen.";
          if (hadPostsBeforeRefresh) {
            setGlobalFeedError(msg);
            setHasLoadedOnce(true);
            if (__DEV__) {
              console.warn("[GlobalFeed] refresh empty - keeping existing posts");
            }
            return;
          }
          setGlobalFeedPosts([]);
          setHasMoreRankedFeed(false);
          setGlobalFeedError(msg);
          setHasLoadedOnce(true);
          return;
        }

        setHasMoreRankedFeed(true);

        const merged = buildRankedFeedBatch(rankedBatch);
        logForYouControlledMix(merged);
        registerPostsInSeen(merged);
        setGlobalFeedPosts(merged);
        setGlobalFeedError(null);
        setHasLoadedOnce(true);
      } catch (e) {
        if (generation !== feedGenerationRef.current) {
          return;
        }
        const msg =
          e instanceof Error ? e.message : "Feed kon niet geladen worden";
        setGlobalFeedError(msg);
        if (!hadPostsBeforeRefresh) {
          setGlobalFeedPosts([]);
        } else if (__DEV__) {
          console.warn("[GlobalFeed] refresh failed - keeping existing posts", msg);
        }
      } finally {
        if (generation === feedGenerationRef.current) {
          setGlobalFeedLoading(false);
        }
      }
    },
    [
      resetPaginationState,
      hasLoadedOnce,
      loadMuteSets,
      registerPostsInSeen,
      fetchRankedFeedBatch,
    ]
  );

  const loadMoreGlobalFeed = useCallback(async () => {
    if (loadMoreInFlightRef.current || !hasMoreFeed) {
      return;
    }
    loadMoreInFlightRef.current = true;
    setIsLoadingMoreFeed(true);
    setGlobalFeedError(null);
    const generation = feedGenerationRef.current;

    try {
      let staleRounds = 0;

      while (generation === feedGenerationRef.current) {
        const allowRecentlyViewed = staleRounds >= 2;
        const exclude = excludeIdsForRpc(seenPostIdsRef.current);
        const { posts: batch, lastError } = await fetchRankedFeedBatch(
          REELS_WINDOW.LOAD_BATCH,
          exclude,
          { allowRecentlyViewed }
        );

        if (generation !== feedGenerationRef.current) {
          return;
        }

        const unseen = filterUnseenPosts(batch, seenPostIdsRef.current);
        const append = buildRankedFeedBatch(unseen);
        const decision = resolveLoadMoreBatchDecision(
          batch.length,
          append.length,
          staleRounds
        );

        if (append.length > 0) {
          registerPostsInSeen(append);
          setGlobalFeedPosts((prev) => appendUniqueFeedPosts(prev, append));
          return;
        }

        if (batch.length > 0) {
          registerPostsInSeen(batch);
        }

        if (decision.stopHasMore) {
          setHasMoreRankedFeed(false);
          if (batch.length === 0 && lastError && __DEV__) {
            console.warn("[GlobalFeed] loadMore ranked empty:", lastError);
          }
          return;
        }

        staleRounds++;
      }
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Kon geen extra posts laden";
      setGlobalFeedError(msg);
      if (__DEV__) {
        console.warn("[GlobalFeed] loadMore failed:", msg);
      }
    } finally {
      loadMoreInFlightRef.current = false;
      setIsLoadingMoreFeed(false);
    }
  }, [hasMoreFeed, registerPostsInSeen, fetchRankedFeedBatch]);

  const removePostFromFeed = useCallback((postId: string) => {
    muteSetsRef.current.hiddenPostIds.add(postId);
    seenPostIdsRef.current.add(postId);
    setGlobalFeedPosts((prev) => prev.filter((p) => p.id !== postId));
  }, []);

  const muteAuthor = useCallback((profileId: string) => {
    muteSetsRef.current.blockedProfileIds.add(profileId);
    setGlobalFeedPosts((prev) =>
      prev.filter((p) => p.ownerProfileId !== profileId)
    );
  }, []);

  useEffect(() => {
    if (globalFeedPosts.length === 0) {
      return;
    }
    syncFeedLikeState(globalFeedPosts);
  }, [user?.id, globalFeedPosts, syncFeedLikeState]);

  const value = useMemo(
    () => ({
      globalFeedPosts: dedupeFeedPosts(globalFeedPosts),
      refreshGlobalFeed,
      loadMoreGlobalFeed,
      trimFeedWindow,
      globalFeedLoading,
      isLoadingMoreFeed,
      globalFeedError,
      hasMoreFeed,
      feedEndReached,
      removePostFromFeed,
      muteAuthor,
    }),
    [
      globalFeedPosts,
      refreshGlobalFeed,
      loadMoreGlobalFeed,
      trimFeedWindow,
      globalFeedLoading,
      isLoadingMoreFeed,
      globalFeedError,
      hasMoreFeed,
      feedEndReached,
      removePostFromFeed,
      muteAuthor,
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
