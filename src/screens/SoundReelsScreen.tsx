import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
  type ViewToken,
} from "react-native";
import { useIsFocused, useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FeedItem } from "../components/FeedItem";
import { useLikes } from "../context/LikesContext";
import { theme } from "../constants/theme";
import type { UserVideoPost } from "../types/userVideoPost";
import { fetchMusicTrackById } from "../services/musicTracksService";
import { fetchPostsByAudioTrackId } from "../services/postsService";

const INITIAL_H = Dimensions.get("window").height;
const VISIBLE_PCT = 70;
const SCROLL_THROTTLE = 16;

export type SoundReelsRouteParams = {
  audioTrackId: string;
  initialPostId: string;
};

type ViewableInfo = {
  viewableItems: Array<ViewToken<UserVideoPost>>;
  changed: Array<ViewToken<UserVideoPost>>;
};

function pickActiveViewable(
  viewableItems: Array<ViewToken<UserVideoPost>>
): ViewToken<UserVideoPost> | null {
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

export function SoundReelsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { syncFeedLikeState, interactionRevision } = useLikes();
  const listRef = useRef<FlatList<UserVideoPost>>(null);
  const didFallbackScrollRef = useRef(false);

  const params = (route.params ?? {}) as Partial<SoundReelsRouteParams>;
  const audioTrackId = params.audioTrackId ?? "";
  const initialPostId = params.initialPostId ?? "";

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [trackTitle, setTrackTitle] = useState("");
  const [trackArtist, setTrackArtist] = useState<string | null>(null);
  const [trackCoverUrl, setTrackCoverUrl] = useState<string | null>(null);
  const [feedData, setFeedData] = useState<UserVideoPost[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!audioTrackId) {
        setLoadError("Geluid niet gevonden.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoadError(null);
      try {
        const [track, posts] = await Promise.all([
          fetchMusicTrackById(audioTrackId),
          fetchPostsByAudioTrackId(audioTrackId),
        ]);
        if (cancelled) {
          return;
        }
        if (!track) {
          setLoadError("Geluid niet gevonden.");
          setFeedData([]);
          return;
        }
        setTrackTitle(track.title);
        setTrackArtist(track.artist);
        setTrackCoverUrl(track.coverUrl);
        setFeedData(posts);
        if (posts.length === 0) {
          setLoadError("Nog geen andere posts met dit geluid.");
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(
            e instanceof Error ? e.message : "Posts laden mislukt."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [audioTrackId]);

  const initialIndex = useMemo(() => {
    if (feedData.length === 0) {
      return 0;
    }
    const idx = feedData.findIndex((p) => p.id === initialPostId);
    return idx >= 0 ? idx : 0;
  }, [feedData, initialPostId]);

  const [pageH, setPageH] = useState(INITIAL_H);
  const [activePostId, setActivePostId] = useState<string | null>(() => {
    if (feedData.length === 0) {
      return null;
    }
    return feedData[initialIndex]?.id ?? feedData[0]!.id;
  });

  useEffect(() => {
    if (feedData.length === 0) {
      return;
    }
    syncFeedLikeState(feedData);
    const start = feedData[initialIndex];
    if (start) {
      setActivePostId(start.id);
    }
  }, [feedData, initialIndex, syncFeedLikeState]);

  useEffect(() => {
    if (!isFocused) {
      setActivePostId(null);
      return;
    }
    if (feedData.length === 0) {
      return;
    }
    const start = feedData[initialIndex];
    if (start) {
      setActivePostId(start.id);
    }
  }, [isFocused, feedData, initialIndex]);

  const onRootLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) {
      setPageH(Math.floor(h));
    }
  }, []);

  const getItemLayout = useCallback(
    (_d: ArrayLike<UserVideoPost> | null | undefined, index: number) => ({
      length: pageH,
      offset: pageH * index,
      index,
    }),
    [pageH]
  );

  const onViewableItemsChanged = useCallback((info: ViewableInfo) => {
    const best = pickActiveViewable(info.viewableItems);
    if (best?.item) {
      setActivePostId(best.item.id);
    }
  }, []);

  const viewabilityConfig = useMemo(
    () => ({
      itemVisiblePercentThreshold: VISIBLE_PCT,
      minimumViewTime: 12,
    }),
    []
  );

  const renderItem: ListRenderItem<UserVideoPost> = useCallback(
    ({ item }) => (
      <FeedItem
        item={item}
        pageHeight={pageH}
        isActive={isFocused && activePostId != null && item.id === activePostId}
        clickSource="sound_reels"
      />
    ),
    [pageH, activePostId, isFocused]
  );

  const keyExtractor = useCallback((item: UserVideoPost) => item.id, []);

  const onScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      if (didFallbackScrollRef.current) {
        return;
      }
      didFallbackScrollRef.current = true;
      setTimeout(() => {
        listRef.current?.scrollToIndex({
          index: info.index,
          animated: false,
        });
      }, 80);
    },
    []
  );

  const onListLayout = useCallback(() => {
    if (initialIndex <= 0 || didFallbackScrollRef.current) {
      return;
    }
    didFallbackScrollRef.current = true;
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({
        index: initialIndex,
        animated: false,
      });
    });
  }, [initialIndex]);

  if (loading) {
    return (
      <View style={[styles.root, styles.centered]}>
        <ActivityIndicator color={theme.accent} size="large" />
      </View>
    );
  }

  if (feedData.length === 0) {
    return (
      <View style={[styles.root, styles.emptyRoot, { paddingTop: insets.top + 16 }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={[styles.closeBtn, { top: insets.top + 8 }]}
          accessibilityRole="button"
          accessibilityLabel="Sluiten"
        >
          <Ionicons name="close" size={28} color={theme.text} />
        </Pressable>
        {trackCoverUrl ? (
          <Image source={{ uri: trackCoverUrl }} style={styles.emptyCover} />
        ) : (
          <View style={styles.emptyCoverPlaceholder}>
            <Ionicons name="musical-notes" size={36} color={theme.accent} />
          </View>
        )}
        <Text style={styles.emptyTitle}>{trackTitle || "Geluid"}</Text>
        {trackArtist ? (
          <Text style={styles.emptyArtist}>{trackArtist}</Text>
        ) : null}
        <Text style={styles.emptyMessage}>
          {loadError ?? "Nog geen andere posts met dit geluid."}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root} onLayout={onRootLayout}>
      <View style={[styles.topChrome, { top: insets.top + 8 }]}>
        <View style={styles.soundMeta}>
          {trackCoverUrl ? (
            <Image source={{ uri: trackCoverUrl }} style={styles.metaCover} />
          ) : (
            <View style={styles.metaCoverPlaceholder}>
              <Ionicons name="musical-notes" size={14} color={theme.accent} />
            </View>
          )}
          <View style={styles.metaText}>
            <Text style={styles.metaTitle} numberOfLines={1}>
              {trackTitle}
            </Text>
            <Text style={styles.metaSubtitle} numberOfLines={1}>
              {trackArtist ?? "Spotify"} · {feedData.length} posts
            </Text>
          </View>
        </View>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.chromeBtn}
          accessibilityRole="button"
          accessibilityLabel="Sluiten"
          hitSlop={10}
        >
          <Ionicons name="close" size={28} color={theme.text} />
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={feedData}
        extraData={`${activePostId}:${interactionRevision}`}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={pageH}
        snapToAlignment="start"
        decelerationRate="fast"
        getItemLayout={getItemLayout}
        initialScrollIndex={initialIndex > 0 ? initialIndex : undefined}
        initialNumToRender={Math.min(feedData.length, initialIndex + 2)}
        maxToRenderPerBatch={2}
        windowSize={5}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        removeClippedSubviews={false}
        bounces={false}
        overScrollMode="never"
        scrollEventThrottle={SCROLL_THROTTLE}
        onScrollToIndexFailed={onScrollToIndexFailed}
        onLayout={onListLayout}
        disableIntervalMomentum
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
  topChrome: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 60,
    elevation: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    pointerEvents: "box-none",
    gap: 10,
  },
  soundMeta: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.25)",
  },
  metaCover: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  metaCoverPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.accentSoft,
  },
  metaText: {
    flex: 1,
  },
  metaTitle: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "800",
  },
  metaSubtitle: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 11,
    marginTop: 1,
  },
  chromeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.25)",
  },
  emptyRoot: {
    alignItems: "center",
    paddingHorizontal: 24,
  },
  closeBtn: {
    position: "absolute",
    right: 16,
    padding: 8,
    zIndex: 2,
  },
  emptyCover: {
    width: 120,
    height: 120,
    borderRadius: 16,
    marginTop: 48,
    marginBottom: 16,
  },
  emptyCoverPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 16,
    marginTop: 48,
    marginBottom: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.accentSoft,
  },
  emptyTitle: {
    color: theme.text,
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyArtist: {
    color: theme.textMuted,
    fontSize: 14,
    marginTop: 4,
    textAlign: "center",
  },
  emptyMessage: {
    color: theme.textMuted,
    fontSize: 14,
    marginTop: 12,
    textAlign: "center",
    lineHeight: 20,
  },
});
