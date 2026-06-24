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

const PERSONALIZED_BATCH = 10;
const GLOBAL_PAGE_SIZE = 30;
const GLOBAL_LOAD_MORE_SIZE = 25;

type RefreshOptions = {
  force?: boolean;
};

type GlobalFeedValue = {
  globalFeedPosts: UserVideoPost[];
  refreshGlobalFeed: (options?: RefreshOptions) => Promise<void>;
  loadMoreGlobalFeed: () => Promise<void>;
  globalFeedLoading: boolean;
  isLoadingMoreFeed: boolean;
  globalFeedError: string | null;
  /** False wanneer personalized én global geen nieuwe posts meer hebben. */
  hasMoreFeed: boolean;
  feedEndReached: boolean;
};

const GlobalFeedContext = createContext<GlobalFeedValue | null>(null);

export function GlobalFeedProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { syncFeedLikeState } = useLikes();
  const [globalFeedPosts, setGlobalFeedPosts] = useState<UserVideoPost[]>([]);
  const [globalFeedLoading, setGlobalFeedLoading] = useState(false);
  const [isLoadingMoreFeed, setIsLoadingMoreFeed] = useState(false);
  const [globalFeedError, setGlobalFeedError] = useState<string | null>(null);
  const [hasMorePersonalizedFeed, setHasMorePersonalizedFeed] = useState(true);
  const [hasMoreGlobalFeed, setHasMoreGlobalFeed] = useState(true);

  const globalFeedPostsRef = useRef<UserVideoPost[]>([]);
  const globalCursorRef = useRef<string | null>(null);
  const loadMoreInFlightRef = useRef(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const resetPaginationState = useCallback(() => {
    globalCursorRef.current = null;
    setHasMorePersonalizedFeed(true);
    setHasMoreGlobalFeed(true);
  }, []);

  useEffect(() => {
    setHasLoadedOnce(false);
    setGlobalFeedPosts([]);
    resetPaginationState();
  }, [user?.id, resetPaginationState]);

  useEffect(() => {
    globalFeedPostsRef.current = globalFeedPosts;
  }, [globalFeedPosts]);

  const hasMoreFeed = hasMorePersonalizedFeed || hasMoreGlobalFeed;
  const feedEndReached =
    hasLoadedOnce && !hasMoreFeed && globalFeedPosts.length > 0;

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

      try {
        const isLoggedIn = user?.id != null;
        let primaryBatch: UserVideoPost[] = [];

        if (isLoggedIn) {
          primaryBatch = await fetchPersonalizedFeed(PERSONALIZED_BATCH, []);
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
          globalPage.posts
        );
        logForYouControlledMix(merged);
        setGlobalFeedPosts(merged);
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
    [user?.id, resetPaginationState, hasLoadedOnce]
  );

  const loadMoreGlobalFeed = useCallback(async () => {
    if (loadMoreInFlightRef.current || !hasMoreFeed) {
      return;
    }
    loadMoreInFlightRef.current = true;
    setIsLoadingMoreFeed(true);
    setGlobalFeedError(null);

    try {
      const current = globalFeedPostsRef.current;
      const exclude = current.map((p) => p.id);
      let append: UserVideoPost[] = [];
      let personalizedExhausted = !hasMorePersonalizedFeed;

      if (hasMorePersonalizedFeed) {
        const batch =
          user?.id != null
            ? await fetchPersonalizedFeed(PERSONALIZED_BATCH, exclude)
            : await fetchExploreFeed(PERSONALIZED_BATCH, exclude);

        if (batch.length > 0) {
          const seen = new Set(exclude);
          append = batch.filter((p) => !seen.has(p.id));
        }
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

        const seen = new Set(exclude);
        append = globalPage.posts.filter((p) => !seen.has(p.id));
      }

      if (append.length === 0) {
        if (personalizedExhausted) {
          setHasMorePersonalizedFeed(false);
        }
        return;
      }

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
  }, [hasMoreFeed, hasMoreGlobalFeed, hasMorePersonalizedFeed, user?.id]);

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
      globalFeedLoading,
      isLoadingMoreFeed,
      globalFeedError,
      hasMoreFeed,
      feedEndReached,
    }),
    [
      globalFeedPosts,
      refreshGlobalFeed,
      loadMoreGlobalFeed,
      globalFeedLoading,
      isLoadingMoreFeed,
      globalFeedError,
      hasMoreFeed,
      feedEndReached,
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
