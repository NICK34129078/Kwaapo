import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import type { ViewToken } from "react-native";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  LayoutChangeEvent,
  ListRenderItem,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FeedItem, type FeedItemPlaybackMetrics } from "../components/FeedItem";
import { useGlobalFeed } from "../context/GlobalFeedContext";
import { useLikes } from "../context/LikesContext";
import {
  isVideoReelItem,
  type FeedPost,
} from "../data/placeholder";
import type { UserVideoPost } from "../types/userVideoPost";
import { theme } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { useAuthPrompt } from "../context/AuthPromptContext";
import { useSellerFulfillment } from "../context/SellerFulfillmentContext";
import { isPersistablePostId } from "../services/postLikesService";
import { fetchSavedPostIdsForCurrentUser } from "../services/savedPostsService";
import { capWatchedMs, recordVideoView } from "../services/videoViewsService";
import {
  flushContentInteractionsNow,
  milestoneEventsForWatch,
  queueContentInteraction,
} from "../services/contentInteractionsService";
import { addToBoundedSet } from "../utils/boundedSeenIds";
import { REELS_WINDOW } from "../utils/feedRollingWindow";

const INITIAL_H = Dimensions.get("window").height;
const VISIBLE_PCT = 70;
const SCROLL_THROTTLE = 16;

type ViewableInfo = {
  viewableItems: Array<ViewToken<FeedPost>>;
  changed: Array<ViewToken<FeedPost>>;
};

type AggregatedPlaybackMetrics = {
  durationMs: number;
  maxPositionMs: number;
  completed: boolean;
};

function ReelsFeedTopBar() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { user } = useAuth();
  const { openAuthPrompt } = useAuthPrompt();

  if (!isFocused) {
    return null;
  }

  return (
    <View
      style={[styles.feedTopBar, { paddingTop: insets.top + 6 }]}
      pointerEvents="box-none"
    >
      <View style={styles.feedTopBarSide} />
      {user ? (
        <Pressable
          style={styles.feedTopBarIconBtn}
          onPress={() => navigation.navigate("Profile" as never)}
          accessibilityRole="button"
          accessibilityLabel="Ga naar profiel"
        >
          <Ionicons name="person-circle-outline" size={30} color={theme.text} />
        </Pressable>
      ) : (
        <View style={styles.feedTopBarAuth}>
          <Pressable
            style={styles.feedTopBarAuthBtn}
            onPress={() =>
              openAuthPrompt({
                message: "Welkom terug — log hieronder in.",
              })
            }
            accessibilityRole="button"
            accessibilityLabel="Inloggen"
          >
            <Text style={styles.feedTopBarAuthTxt}>Inloggen</Text>
          </Pressable>
          <Pressable
            style={styles.feedTopBarAuthBtn}
            onPress={() =>
              openAuthPrompt({
                message: "Maak een account om te liken, reageren en te uploaden.",
              })
            }
            accessibilityRole="button"
            accessibilityLabel="Account maken"
          >
            <Text style={[styles.feedTopBarAuthTxt, styles.feedTopBarAuthAccent]}>
              Account maken
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function pickActiveViewable(
  viewableItems: Array<ViewToken<FeedPost>>
): ViewToken<FeedPost> | null {
  const ok = viewableItems.filter(
    (t) => t.isViewable && t.item != null && t.index != null
  );
  if (ok.length === 0) {
    return null;
  }
  if (ok.length === 1) {
    return ok[0] ?? null;
  }
  return ok.reduce((a, b) => ((a.index ?? 0) > (b.index ?? 0) ? a : b));
}

function ReelNextPreloader({ videoUrl }: { videoUrl: string | undefined | null }) {
  if (!videoUrl || Platform.OS === "web") {
    return null;
  }
  return (
    <View pointerEvents="none" collapsable={false} style={styles.preloadBox}>
      <Video
        source={{ uri: videoUrl }}
        style={StyleSheet.absoluteFill}
        shouldPlay={false}
        isMuted
        isLooping={false}
        resizeMode={ResizeMode.COVER}
        useNativeControls={false}
      />
    </View>
  );
}

function FeedListFooter({
  loading,
  endReached,
}: {
  loading: boolean;
  endReached: boolean;
}) {
  if (loading) {
    return (
      <View style={styles.footerWrap}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }
  if (endReached) {
    return (
      <View style={styles.footerWrap}>
        <Text style={styles.footerText}>Geen nieuwe posts</Text>
      </View>
    );
  }
  return null;
}

export function ReelsScreen() {
  const {
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
  } = useGlobalFeed();
  const { interactionRevision } = useLikes();
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const { refresh: refreshSellerFulfillment } = useSellerFulfillment();
  const [pageH, setPageH] = useState(INITIAL_H);
  const [activeReelId, setActiveReelId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const isFocused = useIsFocused();

  useFocusEffect(
    useCallback(() => {
      void refreshSellerFulfillment();
    }, [refreshSellerFulfillment])
  );

  const viewTimingRef = useRef<{ postId: string; startedAt: number } | null>(
    null
  );
  const recordedViewPostIdsRef = useRef<Set<string>>(new Set());
  const recordedViewOrderRef = useRef<string[]>([]);
  const playbackMetricsRef = useRef<Map<string, AggregatedPlaybackMetrics>>(
    new Map()
  );
  const impressionSentRef = useRef<Set<string>>(new Set());
  const milestoneSentRef = useRef<Set<string>>(new Set());

  const finalFeedData = globalFeedPosts;

  const onPlaybackMetrics = useCallback(
    (postId: string, metrics: FeedItemPlaybackMetrics) => {
      if (!isPersistablePostId(postId)) {
        return;
      }
      const prev = playbackMetricsRef.current.get(postId) ?? {
        durationMs: 0,
        maxPositionMs: 0,
        completed: false,
      };
      const durationMs = Math.max(prev.durationMs, metrics.durationMs ?? 0);
      const maxPositionMs = Math.max(
        prev.maxPositionMs,
        metrics.positionMs ?? 0
      );
      const completed =
        prev.completed || metrics.didJustFinish === true;
      playbackMetricsRef.current.set(postId, {
        durationMs,
        maxPositionMs,
        completed,
      });

      if (durationMs > 0 && metrics.positionMs != null && metrics.positionMs >= 0) {
        const pct = Math.min(
          100,
          Math.max(0, (metrics.positionMs / durationMs) * 100)
        );
        for (const evt of milestoneEventsForWatch(
          postId,
          pct,
          milestoneSentRef.current
        )) {
          queueContentInteraction(evt);
        }
      }
    },
    []
  );

  const finalizeActiveView = useCallback(() => {
    const cur = viewTimingRef.current;
    if (!cur) {
      return;
    }
    viewTimingRef.current = null;
    const { postId, startedAt } = cur;
    if (!isPersistablePostId(postId)) {
      return;
    }
    if (recordedViewPostIdsRef.current.has(postId)) {
      return;
    }
    const rawWatchedMs = Date.now() - startedAt;

    const metrics = playbackMetricsRef.current.get(postId) ?? {
      durationMs: 0,
      maxPositionMs: 0,
      completed: false,
    };
    playbackMetricsRef.current.delete(postId);

    const durationMs = metrics.durationMs > 0 ? metrics.durationMs : 0;
    const cappedWatchedMs = capWatchedMs(
      rawWatchedMs,
      durationMs > 0 ? durationMs : undefined
    );
    if (cappedWatchedMs < 500) {
      return;
    }
    addToBoundedSet(
      recordedViewPostIdsRef.current,
      recordedViewOrderRef.current,
      postId,
      REELS_WINDOW.RECORDED_VIEW_MAX
    );

    let watchedPercent: number | undefined;
    if (durationMs > 0) {
      const effectiveMs = Math.max(metrics.maxPositionMs, cappedWatchedMs);
      watchedPercent = Math.min(
        100,
        Math.max(0, (effectiveMs / durationMs) * 100)
      );
    }
    const completed =
      metrics.completed === true ||
      (typeof watchedPercent === "number" && watchedPercent >= 95);

    const isQuickSkip =
      cappedWatchedMs < 2000 &&
      (typeof watchedPercent !== "number" || watchedPercent < 20);

    if (isQuickSkip) {
      queueContentInteraction({
        postId,
        eventType: "quick_skip",
        watchDurationMs: cappedWatchedMs,
        contentDurationMs: durationMs > 0 ? durationMs : undefined,
        watchPercentage: watchedPercent,
      });
    }

    void recordVideoView({
      postId,
      watchedMs: cappedWatchedMs,
      durationMs,
      watchedPercent,
      completed,
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshGlobalFeed();
    }, [refreshGlobalFeed])
  );

  const onPullRefresh = useCallback(() => {
    setRefreshing(true);
    void refreshGlobalFeed({ force: true }).finally(() => {
      setRefreshing(false);
    });
  }, [refreshGlobalFeed]);

  useEffect(() => {
    if (isFocused) {
      return;
    }
    finalizeActiveView();
    if (__DEV__) {
      console.log("[Reels] screen blurred: stopping all videos");
    }
    setActiveReelId(null);
  }, [isFocused, finalizeActiveView]);

  useEffect(() => {
    if (!isFocused) {
      return;
    }
    if (activeReelId == null) {
      finalizeActiveView();
      return;
    }
    if (isPersistablePostId(activeReelId) && !impressionSentRef.current.has(activeReelId)) {
      impressionSentRef.current.add(activeReelId);
      queueContentInteraction({
        postId: activeReelId,
        eventType: "impression",
      });
      queueContentInteraction({
        postId: activeReelId,
        eventType: "view_started",
      });
    }
    const cur = viewTimingRef.current;
    if (cur?.postId === activeReelId) {
      return;
    }
    if (cur != null) {
      finalizeActiveView();
    }
    viewTimingRef.current = {
      postId: activeReelId,
      startedAt: Date.now(),
    };
  }, [activeReelId, isFocused, finalizeActiveView]);

  useEffect(() => {
    if (!isFocused) {
      void flushContentInteractionsNow();
    }
  }, [isFocused]);

  useEffect(() => {
    return () => {
      finalizeActiveView();
      void flushContentInteractionsNow();
    };
  }, [finalizeActiveView]);

  useEffect(() => {
    if (user == null || finalFeedData.length === 0) {
      return;
    }
    const ids = finalFeedData.map((p) => p.id).filter(isPersistablePostId);
    if (ids.length === 0) {
      return;
    }
    void fetchSavedPostIdsForCurrentUser(ids).catch(() => {
      /* stil falen: FeedItem valt terug op per-item check */
    });
  }, [finalFeedData, user]);

  useEffect(() => {
    if (finalFeedData.length === 0) {
      return;
    }
    if (activeReelId == null) {
      setActiveReelId(finalFeedData[0]!.id);
      return;
    }
    if (!finalFeedData.some((p) => p.id === activeReelId)) {
      setActiveReelId(finalFeedData[0]!.id);
    }
  }, [finalFeedData, activeReelId]);

  const activeIndex = useMemo(
    () => finalFeedData.findIndex((p) => p.id === activeReelId),
    [finalFeedData, activeReelId]
  );

  useEffect(() => {
    if (!isFocused) {
      return;
    }
    if (activeIndex < 0 || finalFeedData.length === 0) {
      return;
    }
    if (finalFeedData.length < 6) {
      return;
    }
    if (activeIndex < finalFeedData.length - REELS_WINDOW.LOAD_MORE_TRIGGER_FROM_END) {
      return;
    }
    if (isLoadingMoreFeed || !hasMoreFeed) {
      return;
    }
    void loadMoreGlobalFeed();
  }, [
    isFocused,
    activeIndex,
    finalFeedData.length,
    isLoadingMoreFeed,
    hasMoreFeed,
    loadMoreGlobalFeed,
  ]);

  useEffect(() => {
    if (!isFocused || finalFeedData.length <= REELS_WINDOW.MAX) {
      return;
    }
    trimFeedWindow(activeReelId);
  }, [
    activeReelId,
    activeIndex,
    finalFeedData.length,
    isFocused,
    isLoadingMoreFeed,
    trimFeedWindow,
  ]);

  const nextVideoForPreload = useMemo(() => {
    if (activeIndex < 0 || activeIndex + 1 >= finalFeedData.length) {
      return null;
    }
    const next = finalFeedData[activeIndex + 1];
    return isVideoReelItem(next) ? next.videoUrl : null;
  }, [finalFeedData, activeIndex]);

  const onRootLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) {
      setPageH(Math.floor(h));
    }
  }, []);

  const onViewableItemsChanged = useCallback((info: ViewableInfo) => {
    const best = pickActiveViewable(info.viewableItems);
    if (best?.item) {
      setActiveReelId((best.item as FeedPost).id);
    }
  }, []);

  const viewabilityConfig = useMemo(
    () => ({
      itemVisiblePercentThreshold: VISIBLE_PCT,
      minimumViewTime: 12,
    }),
    []
  );

  const onRequestRemove = useCallback(
    (postId: string) => {
      removePostFromFeed(postId);
    },
    [removePostFromFeed]
  );

  const onRequestRemoveAuthor = useCallback(
    (profileId: string) => {
      muteAuthor(profileId);
    },
    [muteAuthor]
  );

  const renderItem: ListRenderItem<FeedPost> = useCallback(
    ({ item }) => (
      <FeedItem
        item={item}
        pageHeight={pageH}
        isActive={isFocused && activeReelId != null && item.id === activeReelId}
        onPlaybackMetrics={onPlaybackMetrics}
        onRequestRemove={onRequestRemove}
        onRequestRemoveAuthor={onRequestRemoveAuthor}
      />
    ),
    [
      pageH,
      activeReelId,
      isFocused,
      onPlaybackMetrics,
      onRequestRemove,
      onRequestRemoveAuthor,
    ]
  );

  const keyExtractor = useCallback((item: FeedPost) => item.id, []);

  const getItemLayout = useCallback(
    (_d: ArrayLike<FeedPost> | null | undefined, index: number) => ({
      length: pageH,
      offset: pageH * index,
      index,
    }),
    [pageH]
  );

  const listFooter = useMemo(
    () => (
      <FeedListFooter
        loading={isLoadingMoreFeed}
        endReached={feedEndReached}
      />
    ),
    [isLoadingMoreFeed, feedEndReached]
  );

  const showInitialLoading =
    globalFeedLoading && finalFeedData.length === 0 && !refreshing;

  return (
    <View style={styles.root} onLayout={onRootLayout}>
      <ReelsFeedTopBar />
      <ReelNextPreloader videoUrl={nextVideoForPreload} />
      {showInitialLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : globalFeedError && finalFeedData.length === 0 ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{globalFeedError}</Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => void refreshGlobalFeed({ force: true })}
            accessibilityRole="button"
            accessibilityLabel="Opnieuw proberen"
          >
            <Text style={styles.retryBtnText}>Opnieuw proberen</Text>
          </Pressable>
        </View>
      ) : finalFeedData.length === 0 ? (
        <View style={styles.centerState}>
          <Text style={styles.emptyText}>Nog geen posts in de feed</Text>
          <Pressable
            style={styles.retryBtn}
            onPress={onPullRefresh}
            accessibilityRole="button"
            accessibilityLabel="Feed vernieuwen"
          >
            <Text style={styles.retryBtnText}>Vernieuwen</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={finalFeedData}
          extraData={`${activeReelId}:${interactionRevision}`}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={pageH}
          snapToAlignment="start"
          decelerationRate="fast"
          getItemLayout={getItemLayout}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          windowSize={5}
          maintainVisibleContentPosition={
            Platform.OS === "ios" || Platform.OS === "android"
              ? { minIndexForVisible: 0, autoscrollToTopThreshold: 10 }
              : undefined
          }
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          removeClippedSubviews={false}
          bounces={false}
          overScrollMode="never"
          scrollEventThrottle={SCROLL_THROTTLE}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onPullRefresh}
              tintColor={theme.accent}
              colors={[theme.accent]}
            />
          }
          ListFooterComponent={listFooter}
          {...(Platform.OS === "android" ? { disableIntervalMomentum: true } : {})}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 16,
  },
  errorText: {
    color: theme.textMuted,
    fontSize: 15,
    textAlign: "center",
  },
  emptyText: {
    color: theme.textMuted,
    fontSize: 15,
    textAlign: "center",
  },
  retryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: theme.accent,
  },
  retryBtnText: {
    color: theme.bg,
    fontWeight: "700",
    fontSize: 14,
  },
  footerWrap: {
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  footerText: {
    color: theme.textMuted,
    fontSize: 13,
  },
  feedTopBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 14,
    paddingBottom: 6,
    pointerEvents: "box-none",
  },
  feedTopBarSide: {
    flex: 1,
  },
  feedTopBarAuth: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    maxWidth: "100%",
    flexShrink: 1,
  },
  feedTopBarAuthBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  feedTopBarAuthTxt: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "700",
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  feedTopBarAuthAccent: {
    color: theme.accent,
  },
  feedTopBarIconBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  preloadBox: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    opacity: 0,
    zIndex: -1,
  },
});
