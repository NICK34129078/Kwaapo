import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  LayoutChangeEvent,
  Modal,
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
import { useAuth } from "../context/AuthContext";
import { useLikes } from "../context/LikesContext";
import { formatLikesForDisplay } from "../data/placeholder";
import {
  fetchMyPostStats,
  type PostStats,
} from "../services/postStatsService";
import { isPersistablePostId } from "../services/postLikesService";
import type { AppTheme } from "../constants/themeTokens";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { UserVideoPost } from "../types/userVideoPost";

const INITIAL_H = Dimensions.get("window").height;
const VISIBLE_PCT = 70;
const SCROLL_THROTTLE = 16;

export type ProfileReelsRouteParams = {
  profileId: string;
  initialPostId: string;
  posts: UserVideoPost[];
  isOwnProfile?: boolean;
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

function PostStatsPanel({
  visible,
  loading,
  stats,
  isShopPost,
  onClose,
}: {
  visible: boolean;
  loading: boolean;
  stats: PostStats | null;
  isShopPost: boolean;
  onClose: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.statsOverlay} onPress={onClose}>
        <Pressable style={styles.statsSheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.statsTitle}>Poststatistieken</Text>
          {loading ? (
            <Text style={styles.statsLineMuted}>Laden...</Text>
          ) : stats ? (
            <>
              <Text style={styles.statsLine}>
                Weergaven: {formatLikesForDisplay(stats.viewsCount)}
              </Text>
              <Text style={styles.statsLine}>
                Likes: {formatLikesForDisplay(stats.likesCount)}
              </Text>
              {isShopPost ? (
                <>
                  <Text style={styles.statsLine}>
                    Productkliks:{" "}
                    {formatLikesForDisplay(stats.productClicksCount)}
                  </Text>
                  <Text style={styles.statsLineMuted}>
                    Aankopen: nog niet actief
                  </Text>
                </>
              ) : null}
            </>
          ) : (
            <Text style={styles.statsLineMuted}>
              Statistieken niet beschikbaar.
            </Text>
          )}
          <Pressable
            style={styles.statsCloseBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Sluit statistieken"
          >
            <Text style={styles.statsCloseBtnText}>Sluiten</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function ProfileReelsScreen() {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isFocused = useIsFocused();
  const { syncFeedLikeState, interactionRevision } = useLikes();
  const listRef = useRef<FlatList<UserVideoPost>>(null);
  const didFallbackScrollRef = useRef(false);

  const params = (route.params ?? {}) as Partial<ProfileReelsRouteParams>;
  const [feedData, setFeedData] = useState<UserVideoPost[]>(
    () => params.posts ?? []
  );
  const initialPostId = params.initialPostId ?? "";
  const isOwnProfile =
    params.isOwnProfile === true ||
    (!!user?.id && params.profileId === user.id);

  useEffect(() => {
    setFeedData(params.posts ?? []);
  }, [params.posts]);

  const onRequestRemove = useCallback(
    (postId: string) => {
      setFeedData((prev) => {
        const next = prev.filter((p) => p.id !== postId);
        if (next.length === 0) {
          navigation.goBack();
        }
        return next;
      });
    },
    [navigation]
  );

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
  const [statsByPostId, setStatsByPostId] = useState<Record<string, PostStats>>(
    {}
  );
  const [statsModalVisible, setStatsModalVisible] = useState(false);
  const [statsModalLoading, setStatsModalLoading] = useState(false);

  const activePost = useMemo(
    () => feedData.find((p) => p.id === activePostId) ?? null,
    [feedData, activePostId]
  );

  const activeIsShopPost =
    activePost?.isShopPost === true &&
    typeof activePost.productUrl === "string" &&
    activePost.productUrl.length > 0;

  useEffect(() => {
    if (feedData.length === 0) {
      navigation.goBack();
      return;
    }
    syncFeedLikeState(feedData);
    const start = feedData[initialIndex];
    if (start) {
      setActivePostId(start.id);
    }
  }, [feedData, initialIndex, navigation, syncFeedLikeState]);

  useEffect(() => {
    if (!isOwnProfile || feedData.length === 0) {
      setStatsByPostId({});
      return;
    }

    const ids = feedData.map((p) => p.id).filter(isPersistablePostId);
    if (ids.length === 0) {
      return;
    }

    let cancelled = false;
    void (async () => {
      const map = await fetchMyPostStats(ids);
      if (!cancelled) {
        setStatsByPostId(map);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOwnProfile, feedData]);

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

  const onOpenStats = useCallback(() => {
    if (!activePostId || !isPersistablePostId(activePostId)) {
      return;
    }

    setStatsModalVisible(true);

    if (statsByPostId[activePostId]) {
      setStatsModalLoading(false);
      return;
    }

    setStatsModalLoading(true);
    void (async () => {
      const map = await fetchMyPostStats([activePostId]);
      setStatsByPostId((prev) => ({ ...prev, ...map }));
      setStatsModalLoading(false);
    })();
  }, [activePostId, statsByPostId]);

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
        clickSource="profile_reels"
        onRequestRemove={onRequestRemove}
      />
    ),
    [pageH, activePostId, isFocused, onRequestRemove]
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

  const modalStats = activePostId ? statsByPostId[activePostId] ?? null : null;

  if (feedData.length === 0) {
    return <View style={styles.root} />;
  }

  return (
    <View style={styles.root} onLayout={onRootLayout}>
      <View style={[styles.topChrome, { top: insets.top + 8 }]}>
        {isOwnProfile ? (
          <Pressable
            onPress={onOpenStats}
            style={styles.chromeBtn}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Statistieken"
          >
            <Ionicons name="stats-chart-outline" size={24} color={theme.onMediaIcon} />
            <Text style={styles.chromeBtnLabel}>Statistieken</Text>
          </Pressable>
        ) : (
          <View style={styles.chromeSpacer} />
        )}
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.chromeBtn}
          accessibilityRole="button"
          accessibilityLabel="Sluiten"
          hitSlop={10}
        >
          <Ionicons name="close" size={28} color={theme.onMediaIcon} />
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

      {isOwnProfile ? (
        <PostStatsPanel
          visible={statsModalVisible}
          loading={statsModalLoading}
          stats={modalStats}
          isShopPost={activeIsShopPost}
          onClose={() => setStatsModalVisible(false)}
        />
      ) : null}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg,
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
  },
  chromeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.25)",
  },
  chromeBtnLabel: {
    color: theme.onMediaText,
    fontSize: 13,
    fontWeight: "600",
  },
  chromeSpacer: {
    width: 1,
  },
  statsOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  statsSheet: {
    backgroundColor: theme.bgElevated,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  statsTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 14,
  },
  statsLine: {
    color: theme.text,
    fontSize: 15,
    marginBottom: 8,
  },
  statsLineMuted: {
    color: theme.textMuted,
    fontSize: 14,
    marginBottom: 8,
  },
  statsCloseBtn: {
    marginTop: 12,
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  statsCloseBtnText: {
    color: theme.accent,
    fontSize: 15,
    fontWeight: "600",
  },
  });
}
