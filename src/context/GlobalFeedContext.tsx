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
import { fetchExploreFeed } from "../services/exploreFeedService";
import { fetchGlobalPostsPage } from "../services/postsService";
import { fetchPersonalizedFeed } from "../services/personalizedFeedService";
import type { UserVideoPost } from "../types/userVideoPost";
import {
  appendUniqueFeedPosts,
  dedupeFeedPosts,
  logForYouControlledMix,
  mergePersonalizedAndGlobalFeed,
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
import { pruneSavedStatusCache } from "../services/savedPostsService";

const PERSONALIZED_BATCH = REELS_WINDOW.LOAD_BATCH;
const GLOBAL_PAGE_SIZE = 30;
const GLOBAL_LOAD_MORE_SIZE = REELS_WINDOW.LOAD_BATCH;

type RefreshOptions = {
  force?: boolean;
};

type GlobalFeedValue = {
  globalFeedPosts: UserVideoPost[];
  refreshGlobalFeed: (options?: RefreshOptions) => Promise<void>;
  loadMoreGlobalFeed: () => Promise<void>;
  /** Trim oude reels boven actieve positie (rolling window). */
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
  const [hasMorePersonalizedFeed, setHasMorePersonalizedFeed] = useState(true);
  const [hasMoreGlobalFeed, setHasMoreGlobalFeed] = useState(true);

  const globalFeedPostsRef = useRef<UserVideoPost[]>([]);
  const globalCursorRef = useRef<string | null>(null);
  const loadMoreInFlightRef = useRef(false);
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
    globalCursorRef.current = null;
    setHasMorePersonalizedFeed(true);
    setHasMoreGlobalFeed(true);
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

  const hasMoreFeed = hasMorePersonalizedFeed || hasMoreGlobalFeed;
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

  const refreshGlobalFeed = useCallback(
    async (options?: RefreshOptions) => {
      const force = options?.force === true;
      if (
        !force &&
        hasLoadedOnce &&
        globalFeedPostsRef.current.length > 0
      ) {
        return;
      }

      setGlobalFeedLoading(true);
      setGlobalFeedError(null);
      resetPaginationState();
      seenPostIdsRef.current.reset();

      try {
        await loadMuteSets();
        const isLoggedIn = user?.id != null;
        let primaryBatch: UserVideoPost[] = [];

        if (isLoggedIn) {
          primaryBatch = applyMuteFilter(
            await fetchPersonalizedFeed(PERSONALIZED_BATCH, [])
          );
          setHasMorePersonalizedFeed(primaryBatch.length >= PERSONALIZED_BATCH);
        } else {
          primaryBatch = await fetchExploreFeed(PERSONALIZED_BATCH, []);
          setHasMorePersonalizedFeed(primaryBatch.length >= PERSONALIZED_BATCH);
        }

        const globalPage = await fetchGlobalPostsPage({
          limit: GLOBAL_PAGE_SIZE,
        });
        globalCursorRef.current = globalPage.nextCursor;
        setHasMoreGlobalFeed(globalPage.hasMore);

        const merged = mergePersonalizedAndGlobalFeed(
          primaryBatch,
          applyMuteFilter(globalPage.posts)
        );
        logForYouControlledMix(merged);
        registerPostsInSeen(merged);
        const initialWindow = merged.slice(0, REELS_WINDOW.TARGET);
        setGlobalFeedPosts(initialWindow);
        setHasLoadedOnce(true);
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Feed kon niet geladen worden";
        setGlobalFeedError(msg);
        if (__DEV__) {
          console.warn("[GlobalFeed]", msg);
        }
      } finally {
        setGlobalFeedLoading(false);
      }
    },
    [
      user?.id,
      resetPaginationState,
      hasLoadedOnce,
      loadMuteSets,
      applyMuteFilter,
      registerPostsInSeen,
    ]
  );

  const loadMoreGlobalFeed = useCallback(async () => {
    if (loadMoreInFlightRef.current || !hasMoreFeed) {
      return;
    }
    loadMoreInFlightRef.current = true;
    setIsLoadingMoreFeed(true);
    setGlobalFeedError(null);

    try {
      const exclude = excludeIdsForRpc(seenPostIdsRef.current);
      let append: UserVideoPost[] = [];
      let personalizedExhausted = !hasMorePersonalizedFeed;

      if (hasMorePersonalizedFeed) {
        const batch =
          user?.id != null
            ? applyMuteFilter(
                await fetchPersonalizedFeed(PERSONALIZED_BATCH, exclude)
              )
            : await fetchExploreFeed(PERSONALIZED_BATCH, exclude);

        append = filterUnseenPosts(batch, seenPostIdsRef.current);
        if (batch.length < PERSONALIZED_BATCH) {
          personalizedExhausted = true;
          setHasMorePersonalizedFeed(false);
        }
      }

      if (append.length === 0 && hasMoreGlobalFeed) {
        const globalPage = await fetchGlobalPostsPage({
          limit: GLOBAL_LOAD_MORE_SIZE,
          cursor: globalCursorRef.current,
        });
        globalCursorRef.current = globalPage.nextCursor;
        setHasMoreGlobalFeed(globalPage.hasMore);

        append = filterUnseenPosts(
          applyMuteFilter(globalPage.posts),
          seenPostIdsRef.current
        );
      }

      if (append.length === 0) {
        if (personalizedExhausted) {
          setHasMorePersonalizedFeed(false);
        }
        return;
      }

      registerPostsInSeen(append);
      setGlobalFeedPosts((prev) => appendUniqueFeedPosts(prev, append));
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
  }, [
    hasMoreFeed,
    hasMoreGlobalFeed,
    hasMorePersonalizedFeed,
    user?.id,
    applyMuteFilter,
    registerPostsInSeen,
  ]);

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
