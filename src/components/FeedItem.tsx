import React, { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image } from "expo-image";
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Video, ResizeMode, type AVPlaybackStatus } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FeedPost, formatLikesForDisplay, isVideoReelItem } from "../data/placeholder";
import type { ProfilePostMediaItem } from "../types/userVideoPost";
import { useAuth } from "../context/AuthContext";
import { useAuthPrompt } from "../context/AuthPromptContext";
import { useReelLike } from "../context/LikesContext";
import { PressableScale } from "./PressableScale";
import { theme } from "../constants/theme";

export type FeedItemPlaybackMetrics = {
  durationMs?: number;
  positionMs?: number;
  isLoaded?: boolean;
  didJustFinish?: boolean;
};

type Props = {
  item: FeedPost;
  pageHeight: number;
  /** Alleen het zichtbare snap-item speelt video af. */
  isActive?: boolean;
  onPlaybackMetrics?: (postId: string, metrics: FeedItemPlaybackMetrics) => void;
};

/**
 * IG Reels-achtige maatvoering (ca. 28–30dp iconen, 11pt counts, ~20dp stack,
 * 40–44dp audio). Video kon hier niet worden uitgemeten — stuur desnoods screenshots.
 */
const ACTION_ICON = 28;
const MORE_ICON = 24;
const ICON_TO_LABEL = 3;
const GROUP_GAP = 20;
const MUSIC = 42;
const MUSIC_RADIUS = 7;
const RAIL_RIGHT = 12;
const COUNT_FS = 11;
const AVATAR = 40;
const HANDLE_FS = 14;
const CAPTION_FS = 13;
const AUDIO_FS = 12;

const PLAYBACK_METRICS_EMIT_MS = 500;

/** Zonder `lib: dom` in RN-tsc: minimale shape voor `<video>` events. */
type WebVideoTarget = {
  duration: number;
  currentTime: number;
};

function isCarouselReelItem(item: FeedPost): boolean {
  if (item.type === "image_carousel") {
    return true;
  }
  return (item.mediaItems?.length ?? 0) > 1;
}

function buildCarouselSlides(item: FeedPost): ProfilePostMediaItem[] {
  if (!isCarouselReelItem(item)) {
    return [];
  }
  const items = item.mediaItems;
  if (items && items.length > 0) {
    return [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  }
  const url =
    item.thumbnailUrl && item.thumbnailUrl.length > 0
      ? item.thumbnailUrl
      : item.imageUrl;
  if (url && url.length > 0) {
    return [{ url, mediaType: "image", sortOrder: 0 }];
  }
  return [];
}

type ReelImageCarouselProps = {
  itemId: string;
  slides: ProfilePostMediaItem[];
  pageWidth: number;
  pageHeight: number;
  dotsBottom: number;
};

function ReelImageCarousel({
  itemId,
  slides,
  pageWidth,
  pageHeight,
  dotsBottom,
}: ReelImageCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [itemId]);

  const onMomentumScrollEnd = useCallback(
    (ev: NativeSyntheticEvent<NativeScrollEvent>) => {
      const page = Math.round(ev.nativeEvent.contentOffset.x / pageWidth);
      const max = Math.max(0, slides.length - 1);
      setActiveIndex(Math.min(Math.max(0, page), max));
    },
    [pageWidth, slides.length]
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<ProfilePostMediaItem> | null | undefined, index: number) => ({
      length: pageWidth,
      offset: pageWidth * index,
      index,
    }),
    [pageWidth]
  );

  return (
    <View style={[styles.carouselMediaRoot, { width: pageWidth, height: pageHeight }]}>
      <FlatList
        key={itemId}
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        bounces={false}
        nestedScrollEnabled
        scrollEventThrottle={16}
        removeClippedSubviews={false}
        keyExtractor={(slide) => `${slide.url}-${slide.sortOrder}`}
        getItemLayout={getItemLayout}
        onMomentumScrollEnd={onMomentumScrollEnd}
        {...(Platform.OS === "android"
          ? {
              snapToInterval: pageWidth,
              snapToAlignment: "start" as const,
              disableIntervalMomentum: true,
            }
          : {})}
        renderItem={({ item: slide }) => (
          <View style={{ width: pageWidth, height: pageHeight }}>
            <Image
              source={{ uri: slide.url }}
              style={{ width: pageWidth, height: pageHeight }}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
            />
          </View>
        )}
      />
      {slides.length > 1 ? (
        <View
          style={[styles.carouselDotsRow, { bottom: dotsBottom }]}
          pointerEvents="none"
          accessibilityLabel={`Foto ${activeIndex + 1} van ${slides.length}`}
        >
          {slides.map((slide, i) => (
            <View
              key={`${slide.url}-${i}`}
              style={[
                styles.carouselDot,
                i === activeIndex && styles.carouselDotActive,
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function FeedItem({
  item,
  pageHeight,
  isActive = true,
  onPlaybackMetrics,
}: Props) {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { openAuthPrompt } = useAuthPrompt();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const bottomPad = Math.max(insets.bottom, 12);
  const topPad = Math.max(insets.top + 12, 40);
  const carouselDotsBottom = 108 + bottomPad;
  const shareCount = item.shares ?? "—";
  const thumbUri = item.musicThumbUrl ?? item.imageUrl;
  const ownerLabel =
    item.ownerUsername && item.ownerUsername.length > 0
      ? `@${item.ownerUsername}`
      : item.username && item.username.length > 0
        ? item.username
        : "@gebruiker";
  const webVideoRef = useRef<{
    play: () => Promise<unknown> | void;
    pause: () => void;
    currentTime?: number;
    muted?: boolean;
  } | null>(null);
  const setWebVideoRef = (el: unknown) => {
    webVideoRef.current = el as typeof webVideoRef.current;
  };
  const nativeVideoRef = useRef<InstanceType<typeof Video> | null>(null);
  const playbackMetricsEmitAtRef = useRef(0);
  const asVideo = isVideoReelItem(item);
  const activeVideoUri = item.videoUrl ?? "";
  const carouselSlides = useMemo(() => buildCarouselSlides(item), [item]);
  const asCarouselReel = carouselSlides.length > 0 && isCarouselReelItem(item);

  const emitPlaybackMetrics = useCallback(
    (
      durationMs: number,
      positionMs: number,
      didJustFinish: boolean
    ) => {
      if (!onPlaybackMetrics) {
        return;
      }
      const now = Date.now();
      if (
        !didJustFinish &&
        now - playbackMetricsEmitAtRef.current < PLAYBACK_METRICS_EMIT_MS
      ) {
        return;
      }
      playbackMetricsEmitAtRef.current = now;
      onPlaybackMetrics(item.id, {
        durationMs,
        positionMs,
        isLoaded: true,
        didJustFinish,
      });
    },
    [item.id, onPlaybackMetrics]
  );

  const onNativePlaybackStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (!onPlaybackMetrics || !status.isLoaded) {
        return;
      }
      const durationMs = status.durationMillis ?? 0;
      const positionMs = status.positionMillis ?? 0;
      const didJustFinish = status.didJustFinish ?? false;
      emitPlaybackMetrics(durationMs, positionMs, didJustFinish);
    },
    [emitPlaybackMetrics, onPlaybackMetrics]
  );

  const onWebTimeUpdate = useCallback(
    (e: { target?: EventTarget | null }) => {
      if (!onPlaybackMetrics) {
        return;
      }
      const el = e.target as WebVideoTarget | undefined;
      if (!el || !Number.isFinite(el.duration) || el.duration <= 0) {
        return;
      }
      const durationMs = Math.round(el.duration * 1000);
      const positionMs = Math.round(el.currentTime * 1000);
      emitPlaybackMetrics(durationMs, positionMs, false);
    },
    [emitPlaybackMetrics, onPlaybackMetrics]
  );

  const onWebVideoEnded = useCallback(
    (e: { target?: EventTarget | null }) => {
      if (!onPlaybackMetrics) {
        return;
      }
      const el = e.target as WebVideoTarget | undefined;
      const durationMs =
        el && Number.isFinite(el.duration) && el.duration > 0
          ? Math.round(el.duration * 1000)
          : 0;
      const positionMs =
        durationMs > 0 ? durationMs : Math.round((el?.currentTime ?? 0) * 1000);
      emitPlaybackMetrics(durationMs, positionMs, true);
    },
    [emitPlaybackMetrics, onPlaybackMetrics]
  );

  const stopWebPlayback = useCallback(() => {
    const v = webVideoRef.current;
    if (!v) return;
    v.pause();
    if (typeof v.currentTime === "number") {
      v.currentTime = 0;
    }
    v.muted = true;
  }, []);

  const stopNativePlayback = useCallback(async () => {
    const node = nativeVideoRef.current;
    if (!node) return;
    try {
      await node.pauseAsync();
      await node.setPositionAsync(0);
      await node.setIsMutedAsync(true);
    } catch {
      /* player nog niet klaar of is net ge-unmount */
    }
  }, []);

  // Web: exact één speler tegelijk — pauze, reset, daarna play bij actief
  useEffect(() => {
    if (Platform.OS !== "web" || !asVideo) return;
    if (isActive) {
      const v = webVideoRef.current;
      if (!v) return;
      v.muted = false;
      const p = v.play();
      if (p && typeof (p as Promise<unknown>).catch === "function") {
        (p as Promise<unknown>).catch(() => {});
      }
    } else {
      stopWebPlayback();
    }
  }, [isActive, asVideo, stopWebPlayback]);

  // Native: bij inactief expliciet pauze + seek 0; afspeel volgt `shouldPlay={isActive}`
  useEffect(() => {
    if (Platform.OS === "web" || !asVideo) return;
    (async () => {
      const node = nativeVideoRef.current;
      if (!node) return;
      if (isActive) {
        try {
          await node.setIsMutedAsync(false);
        } catch {
          /* player state nog niet beschikbaar */
        }
      } else {
        await stopNativePlayback();
      }
    })();
  }, [isActive, asVideo, stopNativePlayback]);

  useEffect(() => {
    if (!asVideo) {
      return;
    }
    return () => {
      if (Platform.OS === "web") {
        stopWebPlayback();
      } else {
        void stopNativePlayback();
      }
    };
  }, [asVideo, stopNativePlayback, stopWebPlayback]);

  const avatarUri = useMemo(() => {
    if (item.ownerAvatarUrl) return item.ownerAvatarUrl;
    if (item.avatarUrl) return item.avatarUrl;
    return `https://i.pravatar.cc/128?u=${encodeURIComponent(item.id + item.username)}`;
  }, [item.ownerAvatarUrl, item.avatarUrl, item.id, item.username]);

  const {
    likesCount,
    isLikedByCurrentUser,
    onToggleLike,
  } = useReelLike(item.id, item.likesCount);

  const onLikePress = () => {
    if (user == null) {
      openAuthPrompt({
        message: "Log in of registreer om een like te plaatsen.",
      });
      return;
    }
    void onToggleLike();
  };

  const onCommentPress = () => {
    if (user == null) {
      openAuthPrompt({
        message: "Log in om te reageren op video’s.",
      });
    }
  };

  const onSharePress = () => {
    if (user == null) {
      openAuthPrompt({
        message: "Log in om te delen.",
      });
    }
  };

  const onFollowPress = () => {
    if (user == null) {
      openAuthPrompt({
        message: "Log in om makers te volgen.",
      });
    }
  };

  const onOwnerPress = useCallback(() => {
    const ownerProfileId = item.ownerProfileId;
    if (!ownerProfileId) {
      return;
    }
    navigation.navigate("PublicProfile", { profileId: ownerProfileId });
  }, [item.ownerProfileId, navigation]);

  return (
    <View style={[styles.card, { height: pageHeight }]}>
      {asVideo && Platform.OS === "web" && activeVideoUri
        ? createElement("video", {
            key: `${item.id}:remote`,
            ref: setWebVideoRef,
            style: {
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            } as const,
            src: activeVideoUri,
            muted: !isActive,
            loop: true,
            playsInline: true,
            autoPlay: false,
            crossOrigin: "anonymous",
            poster: item.thumbnailUrl || item.imageUrl,
            onTimeUpdate: onWebTimeUpdate,
            onEnded: onWebVideoEnded,
            onError: () => {
              if (__DEV__) {
                console.warn("[Reels] playback error", {
                  id: item.id,
                  attempted: activeVideoUri,
                  videoUrl: item.videoUrl ?? "",
                });
              }
            },
          } as any)
        : null}
      {asVideo && Platform.OS !== "web" && activeVideoUri ? (
        <Video
          key={`${item.id}:remote`}
          ref={nativeVideoRef as React.MutableRefObject<InstanceType<typeof Video> | null>}
          source={{ uri: activeVideoUri }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER}
          shouldPlay={isActive}
          isLooping
          isMuted={!isActive}
          useNativeControls={false}
          onPlaybackStatusUpdate={onNativePlaybackStatusUpdate}
          onError={(error) => {
            if (__DEV__) {
              console.warn("[Reels] playback error", error, {
                id: item.id,
                attempted: activeVideoUri,
                videoUrl: item.videoUrl ?? "",
              });
            }
          }}
        />
      ) : asCarouselReel ? (
        <View style={StyleSheet.absoluteFill} collapsable={false}>
          <ReelImageCarousel
            itemId={item.id}
            slides={carouselSlides}
            pageWidth={screenWidth}
            pageHeight={pageHeight}
            dotsBottom={carouselDotsBottom}
          />
        </View>
      ) : !asVideo ? (
        <Image
          source={{ uri: item.imageUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={250}
          cachePolicy="memory-disk"
        />
      ) : null}

      <LinearGradient
        colors={["rgba(0,0,0,0.12)", "rgba(0,0,0,0.5)", "rgba(0,0,0,0.88)"]}
        locations={[0, 0.42, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View
        style={[styles.rightRail, { bottom: 96 + bottomPad, right: RAIL_RIGHT }]}
      >
        <PressableScale
          style={styles.railAction}
          scaleTo={0.9}
          onPress={onLikePress}
        >
          <Ionicons
            name={isLikedByCurrentUser ? "heart" : "heart-outline"}
            size={ACTION_ICON}
            color={theme.text}
          />
          <Text style={styles.railCount}>
            {formatLikesForDisplay(likesCount)}
          </Text>
        </PressableScale>

        <PressableScale style={styles.railAction} scaleTo={0.9} onPress={onCommentPress}>
          <Ionicons
            name="chatbubble-outline"
            size={ACTION_ICON}
            color={theme.text}
          />
          <Text style={styles.railCount}>{item.comments}</Text>
        </PressableScale>

        <PressableScale style={styles.railAction} scaleTo={0.9} onPress={onSharePress}>
          <Ionicons
            name="paper-plane-outline"
            size={ACTION_ICON}
            color={theme.text}
          />
          <Text style={styles.railCount}>{shareCount}</Text>
        </PressableScale>

        <PressableScale style={[styles.railAction, styles.railMoreRow]} scaleTo={0.9}>
          <Ionicons
            name="ellipsis-horizontal"
            size={MORE_ICON}
            color={theme.text}
          />
        </PressableScale>

        <PressableScale style={styles.musicWrap} scaleTo={0.94}>
          <Image
            source={{ uri: thumbUri }}
            style={styles.musicThumb}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        </PressableScale>
      </View>

      <View style={[styles.topLeftOverlay, { top: topPad }]}>
        <View style={styles.userRow}>
          <Pressable
            onPress={onOwnerPress}
            disabled={!item.ownerProfileId}
            style={styles.ownerGroupPressable}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Bekijk profiel"
          >
            <Image
              source={{ uri: avatarUri }}
              style={styles.avatar}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
            <Text style={styles.handle} numberOfLines={1}>
              {ownerLabel}
            </Text>
          </Pressable>
          <PressableScale style={styles.followPill} scaleTo={0.96} onPress={onFollowPress}>
            <Text style={styles.followText}>Volgen</Text>
          </PressableScale>
        </View>

        <Text style={styles.caption} numberOfLines={2}>
          {item.caption}
        </Text>

        {item.tags && item.tags.length > 0 ? (
          <Text style={styles.tagsLine} numberOfLines={2}>
            {item.tags.map((t) => `#${t}`).join(" ")}
          </Text>
        ) : null}

        <Text style={styles.audioHint} numberOfLines={1}>
          ♪ Origineel geluid · {ownerLabel}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    backgroundColor: theme.bg,
    overflow: "hidden",
  },
  carouselMediaRoot: {
    overflow: "hidden",
    backgroundColor: theme.bg,
  },
  carouselDotsRow: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    zIndex: 12,
    elevation: 12,
  },
  carouselDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  carouselDotActive: {
    backgroundColor: "#fff",
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  rightRail: {
    position: "absolute",
    alignItems: "center",
    gap: GROUP_GAP,
  },
  railAction: {
    alignItems: "center",
    gap: ICON_TO_LABEL,
  },
  railMoreRow: {
    gap: 0,
    paddingVertical: 1,
  },
  railCount: {
    color: theme.text,
    fontSize: COUNT_FS,
    fontWeight: "600",
    letterSpacing: 0.15,
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  musicWrap: {
    marginTop: 2,
    borderRadius: MUSIC_RADIUS,
    borderWidth: 2,
    borderColor: theme.text,
    overflow: "hidden",
  },
  musicThumb: {
    width: MUSIC,
    height: MUSIC,
  },
  topLeftOverlay: {
    position: "absolute",
    left: 16,
    right: 78,
    zIndex: 20,
    elevation: 20,
    pointerEvents: "box-none",
    gap: 8,
  },
  bottomLeft: {
    paddingHorizontal: 16,
    maxWidth: "68%",
    gap: 6,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 2,
  },
  ownerGroupPressable: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.95)",
  },
  handle: {
    color: theme.text,
    fontSize: HANDLE_FS,
    fontWeight: "700",
    letterSpacing: 0.2,
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  followPill: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.35)",
  },
  followText: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  caption: {
    color: "rgba(255,255,255,0.95)",
    fontSize: CAPTION_FS,
    lineHeight: 18,
    fontWeight: "500",
    marginTop: 2,
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  tagsLine: {
    color: theme.accent,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
    letterSpacing: 0.2,
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  audioHint: {
    color: "rgba(255,255,255,0.88)",
    fontSize: AUDIO_FS,
    fontWeight: "500",
    marginTop: 2,
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
