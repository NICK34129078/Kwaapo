import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import type { ViewToken } from "react-native";
import {
  Dimensions,
  FlatList,
  LayoutChangeEvent,
  ListRenderItem,
  Platform,
  Pressable,
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
import { isPersistablePostId } from "../services/postLikesService";
import { fetchSavedPostIdsForCurrentUser } from "../services/savedPostsService";
import {
  buildControlledForYouMix,
  logForYouControlledMix,
  logForYouFinalTop20,
} from "../utils/feedRanking";
import { capWatchedMs, recordVideoView } from "../services/videoViewsService";

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

/**
 * Bepaalt de actieve reel. Bij ≥70% zichtbaar is er meestal één; bij overlap
 * kiezen we de viewable met de hoogste index (onderste cel in verticale feed).
 */
function ReelsFeedTopBar() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { openAuthPrompt } = useAuthPrompt();

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

/**
 * Reels: één actieve speler, 70% zichtbaarheid, snap, preload volgende video.
 */
export function ReelsScreen() {
  const {
    globalFeedPosts,
    refreshGlobalFeed,
    loadMoreGlobalFeed,
    isLoadingMoreFeed,
  } = useGlobalFeed();
  const { interactionRevision } = useLikes();
  const { user } = useAuth();
  const [pageH, setPageH] = useState(INITIAL_H);
  const [activeReelId, setActiveReelId] = useState<string | null>(null);
  const isFocused = useIsFocused();
  const viewTimingRef = useRef<{ postId: string; startedAt: number } | null>(
    null
  );
  const recordedViewPostIdsRef = useRef<Set<string>>(new Set());
  const playbackMetricsRef = useRef<Map<string, AggregatedPlaybackMetrics>>(
    new Map()
  );

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
    recordedViewPostIdsRef.current.add(postId);

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

  useEffect(() => {
    if (isFocused) {
      return;
    }
    finalizeActiveView();
    console.log("[Reels] screen blurred: stopping all videos");
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
    return () => {
      finalizeActiveView();
    };
  }, [finalizeActiveView]);

  const dedupedFeedData = useMemo(() => {
    const seen = new Set<string>();
    const out: UserVideoPost[] = [];
    for (const p of globalFeedPosts) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        out.push(p);
      }
    }
    return out;
  }, [globalFeedPosts]);

  const finalFeedData = useMemo(() => {
    const mixed = buildControlledForYouMix(dedupedFeedData);
    logForYouControlledMix(mixed);
    logForYouFinalTop20(mixed);
    return mixed;
  }, [dedupedFeedData]);

  useEffect(() => {
    if (__DEV__) {
      console.log("[Reels] render source: finalFeedData from globalFeedPosts", {
        globalCount: globalFeedPosts.length,
        dedupedCount: dedupedFeedData.length,
        finalCount: finalFeedData.length,
      });
    }
  }, [globalFeedPosts.length, dedupedFeedData.length, finalFeedData.length]);

  // Batch: vul de saved-status cache voor alle geladen posts in één request.
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
    if (activeIndex < finalFeedData.length - 4) {
      return;
    }
    if (isLoadingMoreFeed) {
      return;
    }
    void loadMoreGlobalFeed();
  }, [
    isFocused,
    activeIndex,
    finalFeedData.length,
    isLoadingMoreFeed,
    loadMoreGlobalFeed,
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

  // Stabiel voor FlatList (zelfde function identity elke render)
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

  const renderItem: ListRenderItem<FeedPost> = useCallback(
    ({ item }) => (
      <FeedItem
        item={item}
        pageHeight={pageH}
        isActive={isFocused && activeReelId != null && item.id === activeReelId}
        onPlaybackMetrics={onPlaybackMetrics}
      />
    ),
    [pageH, activeReelId, isFocused, onPlaybackMetrics]
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

  return (
    <View style={styles.root} onLayout={onRootLayout}>
      <ReelsFeedTopBar />
      <ReelNextPreloader videoUrl={nextVideoForPreload} />
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
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        removeClippedSubviews={false}
        bounces={false}
        overScrollMode="never"
        scrollEventThrottle={SCROLL_THROTTLE}
        {...(Platform.OS === "android" ? { disableIntervalMomentum: true } : {})}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg,
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
