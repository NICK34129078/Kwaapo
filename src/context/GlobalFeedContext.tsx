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
import {
  FEED_ERROR_KEYS,
  isStaleFeedGeneration,
  resolveRefreshEmptyOutcome,
  resolveRefreshErrorOutcome,
  shouldSkipRefresh,
} from "../utils/globalFeedRefresh";
import {
  MAX_CONSECUTIVE_SAME_CREATOR,
  respaceFeedByCreator,
  trailingCreatorIds,
} from "../utils/feedCreatorSpacing";
import { pruneSavedStatusCache } from "../services/savedPostsService";
import { reportFeedFetch } from "../services/feedObservability";

const FEED_BATCH = REELS_WINDOW.TARGET;

type RefreshOptions = {
  force?: boolean;
  /** Re-show posts viewed in the last 7 days (pull-to-refresh / Home tap). */
  allowRecentlyViewed?: boolean;
};

type FetchBatchOptions = {
  allowRecentlyViewed?: boolean;
  /** Which context the fetch runs in, for feed observability. */
  phase?: "refresh" | "loadMore";
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

  const registerIdsInSeen = useCallback((ids: readonly string[]) => {
    seenPostIdsRef.current.addMany(ids);
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
      const filtered = applyMuteFilter(result.posts);
      reportFeedFetch({
        phase: options?.phase ?? "refresh",
        source: result.source,
        postCount: filtered.length,
        rawCount: result.posts.length,
        hadError: result.lastError != null,
      });
      return {
        ...result,
        posts: filtered,
        // Server-aantallen vóór mute-filter: bepalen hasMore/paginatie, anders
        // stopt infinite scroll zodra een geblokkeerde auteur de batch vult.
        rawCount: result.posts.length,
        rawIds: result.posts.map((p) => p.id),
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
        shouldSkipRefresh({
          force,
          hasLoadedOnce,
          currentPostCount: globalFeedPostsRef.current.length,
        })
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
        if (isStaleFeedGeneration(generation, feedGenerationRef.current)) {
          return;
        }

        const {
          posts: rankedBatch,
          rawCount,
          rawIds,
          lastError,
        } = await fetchRankedFeedBatch(FEED_BATCH, [], {
          allowRecentlyViewed,
          phase: "refresh",
        });

        if (isStaleFeedGeneration(generation, feedGenerationRef.current)) {
          return;
        }

        if (rankedBatch.length === 0) {
          if (__DEV__ && lastError) {
            console.warn("[GlobalFeed] refresh empty:", lastError);
          }
          const emptyOutcome = resolveRefreshEmptyOutcome({
            hadPostsBefore: hadPostsBeforeRefresh,
            rawCount,
            batchTarget: FEED_BATCH,
          });
          if (emptyOutcome.keepExistingPosts) {
            setGlobalFeedError(emptyOutcome.errorKey);
            setHasLoadedOnce(true);
            if (__DEV__) {
              console.warn("[GlobalFeed] refresh empty — keeping existing posts");
            }
            return;
          }
          setGlobalFeedPosts([]);
          if (emptyOutcome.setHasMore != null) {
            setHasMoreRankedFeed(emptyOutcome.setHasMore);
          }
          setGlobalFeedError(emptyOutcome.errorKey);
          setHasLoadedOnce(true);
          return;
        }

        setHasMoreRankedFeed(rawCount >= FEED_BATCH);

        // Creator-fatigue cap: server only soft-penalises repeat creators, so
        // hard-cap consecutive posts client-side (order-preserving, not a re-rank).
        const merged = respaceFeedByCreator(buildRankedFeedBatch(rankedBatch));
        logForYouControlledMix(merged);
        registerIdsInSeen(rawIds);
        setGlobalFeedPosts(merged.slice(0, REELS_WINDOW.TARGET));
        syncFeedLikeState(merged);
        setGlobalFeedError(null);
        setHasLoadedOnce(true);
      } catch (e) {
        if (isStaleFeedGeneration(generation, feedGenerationRef.current)) {
          return;
        }
        if (__DEV__) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn("[GlobalFeed] refresh failed:", msg);
        }
        const errorOutcome = resolveRefreshErrorOutcome(hadPostsBeforeRefresh);
        setGlobalFeedError(errorOutcome.errorKey);
        if (errorOutcome.clearPosts) {
          setGlobalFeedPosts([]);
        }
      } finally {
        if (!isStaleFeedGeneration(generation, feedGenerationRef.current)) {
          setGlobalFeedLoading(false);
        }
      }
    },
    [
      resetPaginationState,
      hasLoadedOnce,
      loadMuteSets,
      registerIdsInSeen,
      fetchRankedFeedBatch,
      syncFeedLikeState,
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

      while (!isStaleFeedGeneration(generation, feedGenerationRef.current)) {
        const exclude = excludeIdsForRpc(seenPostIdsRef.current);
        const { posts: batch, rawCount, rawIds, lastError } =
          await fetchRankedFeedBatch(REELS_WINDOW.LOAD_BATCH, exclude, {
            phase: "loadMore",
          });

        if (isStaleFeedGeneration(generation, feedGenerationRef.current)) {
          return;
        }

        const unseen = filterUnseenPosts(batch, seenPostIdsRef.current);
        // Respace against the tail already on screen so an append can't extend
        // a run that ends the current window.
        const append = respaceFeedByCreator(buildRankedFeedBatch(unseen), {
          precedingCreators: trailingCreatorIds(
            globalFeedPostsRef.current,
            MAX_CONSECUTIVE_SAME_CREATOR
          ),
        });
        const decision = resolveLoadMoreBatchDecision(
          rawCount,
          append.length,
          staleRounds
        );

        if (decision.stopHasMore) {
          setHasMoreRankedFeed(false);
        }

        if (append.length > 0) {
          registerIdsInSeen(rawIds);
          setGlobalFeedPosts((prev) => appendUniqueFeedPosts(prev, append));
          syncFeedLikeState(append);
          return;
        }

        if (rawCount === 0) {
          if (lastError && __DEV__) {
            console.warn("[GlobalFeed] loadMore ranked empty:", lastError);
          }
          return;
        }

        registerIdsInSeen(rawIds);

        if (!decision.retryWithExpandedExclude) {
          return;
        }

        staleRounds++;
      }
    } catch (e) {
      if (__DEV__) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn("[GlobalFeed] loadMore failed:", msg);
      }
      setGlobalFeedError(FEED_ERROR_KEYS.loadMoreFailed);
    } finally {
      loadMoreInFlightRef.current = false;
      setIsLoadingMoreFeed(false);
    }
  }, [hasMoreFeed, registerIdsInSeen, fetchRankedFeedBatch, syncFeedLikeState]);

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
