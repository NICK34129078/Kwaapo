import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ViewToken } from "react-native";
import {
  Dimensions,
  FlatList,
  LayoutChangeEvent,
  ListRenderItem,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import { FeedItem } from "../components/FeedItem";
import { useUserUploads } from "../context/UserUploadsContext";
import {
  REELS_POSTS,
  isVideoReelItem,
  type FeedPost,
} from "../data/placeholder";
import { theme } from "../constants/theme";

const INITIAL_H = Dimensions.get("window").height;
const VISIBLE_PCT = 70;
const SCROLL_THROTTLE = 16;

type ViewableInfo = {
  viewableItems: Array<ViewToken<FeedPost>>;
  changed: Array<ViewToken<FeedPost>>;
};

/**
 * Bepaalt de actieve reel. Bij ≥70% zichtbaar is er meestal één; bij overlap
 * kiezen we de viewable met de hoogste index (onderste cel in verticale feed).
 */
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
  const { uploadedVideoPosts } = useUserUploads();
  const [pageH, setPageH] = useState(INITIAL_H);
  const [activeReelId, setActiveReelId] = useState<string | null>(null);

  const feedData = useMemo(
    () => [...uploadedVideoPosts, ...REELS_POSTS] as FeedPost[],
    [uploadedVideoPosts]
  );

  useEffect(() => {
    if (__DEV__) {
      console.log("[Reels] restored feed posts count", feedData.length);
      console.log("[Reels] restored uploads in feed", uploadedVideoPosts.length);
    }
  }, [feedData.length, uploadedVideoPosts.length]);

  useEffect(() => {
    if (feedData.length === 0) {
      return;
    }
    if (activeReelId == null) {
      setActiveReelId(feedData[0]!.id);
      return;
    }
    if (!feedData.some((p) => p.id === activeReelId)) {
      setActiveReelId(feedData[0]!.id);
    }
  }, [feedData, activeReelId]);

  const activeIndex = useMemo(
    () => feedData.findIndex((p) => p.id === activeReelId),
    [feedData, activeReelId]
  );

  const nextVideoForPreload = useMemo(() => {
    if (activeIndex < 0 || activeIndex + 1 >= feedData.length) {
      return null;
    }
    const next = feedData[activeIndex + 1];
    return isVideoReelItem(next) ? next.videoUrl : null;
  }, [feedData, activeIndex]);

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
        isActive={activeReelId == null ? item.id === feedData[0]?.id : item.id === activeReelId}
      />
    ),
    [pageH, activeReelId, feedData]
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
      <ReelNextPreloader videoUrl={nextVideoForPreload} />
      <FlatList
        data={feedData}
        extraData={activeReelId}
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
  preloadBox: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    opacity: 0,
    zIndex: -1,
  },
});
