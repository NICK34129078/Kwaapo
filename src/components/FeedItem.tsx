import React, { createElement, useEffect, useMemo, useRef } from "react";
import { Image } from "expo-image";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Video, ResizeMode } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FeedPost, formatLikesForDisplay, isVideoReelItem } from "../data/placeholder";
import { useReelLike } from "../context/LikesContext";
import { PressableScale } from "./PressableScale";
import { theme } from "../constants/theme";

type Props = {
  item: FeedPost;
  pageHeight: number;
  /** Alleen het zichtbare snap-item speelt video af. */
  isActive?: boolean;
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
const AVATAR = 32;
const HANDLE_FS = 14;
const CAPTION_FS = 13;
const AUDIO_FS = 12;

export function FeedItem({ item, pageHeight, isActive = true }: Props) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 12);
  const shareCount = item.shares ?? "—";
  const thumbUri = item.musicThumbUrl ?? item.imageUrl;
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
  const asVideo = isVideoReelItem(item);
  const activeVideoUri = item.videoUrl ?? "";

  useEffect(() => {
    if (!__DEV__ || !asVideo) return;
    console.log("[Reels] active post id:", item.id, "isActive:", isActive);
    console.log("[Reels] videoUrl:", item.videoUrl ?? "(none)");
    console.log("[Reels] localVideoUri:", item.localVideoUri ?? "(none)");
    console.log("[Reels] thumbnailUrl:", item.thumbnailUrl ?? "(none)");
  }, [asVideo, isActive, item.id, item.localVideoUri, item.videoUrl]);

  if (__DEV__ && asVideo) {
    const postAny = item as FeedPost & { uri?: string; videoUri?: string };
    console.log(
      "VIDEO SOURCE URI:",
      postAny.videoUrl || postAny.uri || postAny.videoUri
    );
  }

  // Web: exact één speler tegelijk — pauze, reset, daarna play bij actief
  useEffect(() => {
    if (Platform.OS !== "web" || !asVideo) return;
    const v = webVideoRef.current;
    if (!v) return;
    if (isActive) {
      v.muted = false;
      const p = v.play();
      if (p && typeof (p as Promise<unknown>).catch === "function") {
        (p as Promise<unknown>).catch(() => {});
      }
    } else {
      v.pause();
      if (typeof v.currentTime === "number") {
        v.currentTime = 0;
      }
    }
  }, [isActive, asVideo, item.id]);

  // Native: bij inactief expliciet pauze + seek 0; afspeel volgt `shouldPlay={isActive}`
  useEffect(() => {
    if (Platform.OS === "web" || !asVideo) return;
    const node = nativeVideoRef.current;
    if (!node) return;
    (async () => {
      try {
        if (isActive) {
          await node.setIsMutedAsync(false);
        } else {
          await node.pauseAsync();
          await node.setPositionAsync(0);
          await node.setIsMutedAsync(true);
        }
      } catch {
        /* buffer nog niet klaar of item ontkoppeld */
      }
    })();
  }, [isActive, asVideo, item.id]);

  const avatarUri = useMemo(() => {
    if (item.avatarUrl) return item.avatarUrl;
    return `https://i.pravatar.cc/128?u=${encodeURIComponent(item.id + item.username)}`;
  }, [item.avatarUrl, item.id, item.username]);

  const {
    likesCount,
    isLikedByCurrentUser,
    onToggleLike,
  } = useReelLike(item.id, item.likesCount);

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
          onLoad={() => console.log("VIDEO LOADED:", item.id)}
          onReadyForDisplay={() => {
            console.log("VIDEO READY:", item.id);
          }}
          onError={(error) => {
            console.log("VIDEO ERROR:", item.id, error);
            if (__DEV__) {
              console.warn("[Reels] playback error", error, {
                id: item.id,
                attempted: activeVideoUri,
                videoUrl: item.videoUrl ?? "",
              });
            }
          }}
        />
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
          onPress={onToggleLike}
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

        <PressableScale style={styles.railAction} scaleTo={0.9}>
          <Ionicons
            name="chatbubble-outline"
            size={ACTION_ICON}
            color={theme.text}
          />
          <Text style={styles.railCount}>{item.comments}</Text>
        </PressableScale>

        <PressableScale style={styles.railAction} scaleTo={0.9}>
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

      <View style={[styles.bottomLeft, { paddingBottom: 92 + bottomPad }]}>
        <View style={styles.userRow}>
          <Image
            source={{ uri: avatarUri }}
            style={styles.avatar}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
          <Text style={styles.handle} numberOfLines={1}>
            {item.username}
          </Text>
          <PressableScale style={styles.followPill} scaleTo={0.96}>
            <Text style={styles.followText}>Volgen</Text>
          </PressableScale>
        </View>

        <Text style={styles.caption} numberOfLines={3}>
          {item.caption}
        </Text>

        <Text style={styles.audioHint} numberOfLines={1}>
          ♪ Origineel geluid · {item.username}
        </Text>

        <View style={styles.pricePill}>
          <Text style={styles.price}>{item.price}</Text>
        </View>
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
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.95)",
  },
  handle: {
    flex: 1,
    minWidth: 0,
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
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
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
  pricePill: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(11,11,11,0.5)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  price: {
    color: theme.accent,
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});
