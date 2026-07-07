import React, { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image } from "expo-image";
import {
  Alert,
  FlatList,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Audio, Video, ResizeMode, type AVPlaybackStatus } from "expo-av";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  FeedPost,
  formatLikesForDisplay,
  isVideoReelItem,
  resolveCommentsCount,
} from "../data/placeholder";
import { ProductReelShopCard } from "./ProductReelShopCard";
import { CommentsSheet } from "./CommentsSheet";
import { PostMoreSheet } from "./PostMoreSheet";
import { ReportReasonSheet } from "./ReportReasonSheet";
import { AvatarImage } from "./AvatarImage";
import {
  DoubleTapHeartAnimation,
  type DoubleTapHeartHandle,
} from "./DoubleTapHeartAnimation";
import { ReelPauseIndicator } from "./ReelPauseIndicator";
import type { ProfilePostMediaItem } from "../types/userVideoPost";
import { useAuth } from "../context/AuthContext";
import { useAuthPrompt } from "../context/AuthPromptContext";
import { useReelLike } from "../context/LikesContext";
import { recordProductClick } from "../services/productClicksService";
import { isPersistablePostId } from "../services/postLikesService";
import {
  getCachedSavedStatus,
  isPostSaved,
  savePost,
  subscribeSavedStatus,
  unsavePost,
} from "../services/savedPostsService";
import { formatPriceEur } from "../utils/formatPrice";
import { PressableScale } from "./PressableScale";
import type { AppTheme } from "../constants/themeTokens";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import { fetchPostShareCount } from "../services/postSharesService";
import {
  buildPublicPostShareUrl,
  resolvePostUsername,
  sharePostNative,
} from "../services/sharePostService";
import * as Clipboard from "expo-clipboard";
import { supabase } from "../lib/supabase";
import { deleteMyPost } from "../services/postsService";
import {
  blockUser,
  markNotInterested,
  reportPost,
  type ReportReason,
} from "../services/feedModerationService";
import { getReadableErrorMessage } from "../utils/getReadableErrorMessage";

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
  /** Bron voor product-click tracking (feed, shop, profile_reels, …). */
  clickSource?: string;
  /** Na succesvol verwijderen uit de feedlijst halen. */
  onRequestRemove?: (postId: string) => void;
  /** Na blokkeren alle posts van deze auteur uit de feed halen. */
  onRequestRemoveAuthor?: (profileId: string) => void;
};

/**
 * IG Reels-achtige maatvoering (ca. 28–30dp iconen, 11pt counts, ~20dp stack,
 * 40–44dp audio). Video kon hier niet worden uitgemeten — stuur desnoods screenshots.
 */
const ACTION_ICON = 28;
const SHARE_ICON = 30;
const SHARE_ROTATION_DEG = -14;
const MORE_ICON = 24;
const ICON_TO_LABEL = 3;
const GROUP_GAP = 20;
const RAIL_RIGHT = 12;
const COUNT_FS = 11;
const BOTTOM_AVATAR = 32;
const HANDLE_FS = 14;
const CAPTION_FS = 13;
const PRODUCT_INFO_FS = 11;
const CAPTION_COLLAPSE_CHARS = 80;
const REELS_BOTTOM_CHROME = 72;
const CAPTION_RAIL_CLEARANCE = 110;

const PLAYBACK_METRICS_EMIT_MS = 500;
const DOUBLE_TAP_MS = 280;

function buildProductInfoLine(item: FeedPost): string {
  if (item.linkedProduct) {
    return `${item.linkedProduct.name} · ${formatPriceEur(item.linkedProduct.price)}`;
  }
  const parts: string[] = [];
  const title = (item.productTitle ?? "").trim();
  const brand = (item.productBrand ?? "").trim();
  const price = (item.productPriceText ?? "").trim();
  if (title.length > 0) {
    parts.push(title);
  }
  if (brand.length > 0) {
    parts.push(brand);
  }
  if (price.length > 0) {
    parts.push(price);
  }
  if (parts.length > 0) {
    return parts.join(" · ");
  }
  return "Product gelinkt";
}

function truncateCaption(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  let cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > maxChars * 0.55) {
    cut = cut.slice(0, lastSpace);
  }
  return cut.trimEnd();
}

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
  onCarouselDraggingChange?: (dragging: boolean) => void;
  onSlidePress?: (e: GestureResponderEvent) => void;
  tapToPauseAudio?: boolean;
};

function ReelImageCarousel({
  itemId,
  slides,
  pageWidth,
  pageHeight,
  dotsBottom,
  onCarouselDraggingChange,
  onSlidePress,
  tapToPauseAudio = false,
}: ReelImageCarouselProps) {
  const styles = useThemedStyles(createStyles);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [itemId]);

  const onMomentumScrollEnd = useCallback(
    (ev: NativeSyntheticEvent<NativeScrollEvent>) => {
      const page = Math.round(ev.nativeEvent.contentOffset.x / pageWidth);
      const max = Math.max(0, slides.length - 1);
      setActiveIndex(Math.min(Math.max(0, page), max));
      onCarouselDraggingChange?.(false);
    },
    [pageWidth, slides.length, onCarouselDraggingChange]
  );

  const onScrollBeginDrag = useCallback(() => {
    onCarouselDraggingChange?.(true);
  }, [onCarouselDraggingChange]);

  const onScrollEndDrag = useCallback(() => {
    onCarouselDraggingChange?.(false);
  }, [onCarouselDraggingChange]);

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
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        {...(Platform.OS === "android"
          ? {
              snapToInterval: pageWidth,
              snapToAlignment: "start" as const,
              disableIntervalMomentum: true,
            }
          : {})}
        renderItem={({ item: slide }) => (
          <Pressable
            style={{ width: pageWidth, height: pageHeight }}
            onPress={onSlidePress}
            accessibilityRole="button"
            accessibilityLabel={
              tapToPauseAudio
                ? "Tik om audio te pauzeren, dubbel tik om te liken"
                : "Dubbel tik om te liken"
            }
          >
            <Image
              source={{ uri: slide.url }}
              style={{ width: pageWidth, height: pageHeight }}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
            />
          </Pressable>
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
  clickSource = "feed",
  onRequestRemove,
  onRequestRemoveAuthor,
}: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { openAuthPrompt } = useAuthPrompt();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const bottomPad = Math.max(insets.bottom, 12);
  const reelsBottomInset = REELS_BOTTOM_CHROME + bottomPad;
  const captionMaxWidth = Math.max(160, screenWidth - CAPTION_RAIL_CLEARANCE);
  const carouselDotsBottom = reelsBottomInset + 108;
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [moreVisible, setMoreVisible] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [reportReasonVisible, setReportReasonVisible] = useState(false);
  const [moderationBusy, setModerationBusy] = useState(false);
  const [commentsCount, setCommentsCount] = useState(() =>
    resolveCommentsCount(item)
  );
  const [shareCount, setShareCount] = useState(() => {
    const raw = item.shares ?? "0";
    const digits = String(raw).replace(/[^\d]/g, "");
    const parsed = parseInt(digits, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  });
  const [shopCardVisible, setShopCardVisible] = useState(true);
  const [userPaused, setUserPaused] = useState(false);

  useEffect(() => {
    setShopCardVisible(true);
    setUserPaused(false);
  }, [item.id]);
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
  const asStaticImageReel =
    !asVideo &&
    !asCarouselReel &&
    typeof item.imageUrl === "string" &&
    item.imageUrl.length > 0;
  const postAudioUrl =
    typeof item.audioUrl === "string" && item.audioUrl.length > 0
      ? item.audioUrl
      : null;
  const hasPostAudio =
    postAudioUrl != null &&
    (asVideo || asCarouselReel || asStaticImageReel);
  const supportsTapToPause =
    asVideo || (hasPostAudio && (asCarouselReel || asStaticImageReel));
  // Video met eigen audio-overlay: video dempen zodat er geen dubbele audio is.
  // Op web spelen we de overlay-track niet af, dus daar houden we het videogeluid.
  const muteVideoForOverlay =
    asVideo && postAudioUrl != null && Platform.OS !== "web";
  const postAudioLabel =
    item.audioTitle && item.audioTitle.length > 0
      ? item.audioArtist && item.audioArtist.length > 0
        ? `${item.audioTitle} · ${item.audioArtist}`
        : item.audioTitle
      : item.audioArtist && item.audioArtist.length > 0
        ? item.audioArtist
        : "Eigen audio";
  const canOpenSoundReels =
    typeof item.audioTrackId === "string" && item.audioTrackId.length > 0;
  const postAudioVolume =
    typeof item.audioVolume === "number" && Number.isFinite(item.audioVolume)
      ? Math.min(1, Math.max(0, item.audioVolume))
      : 1;
  const postAudioStartMs =
    typeof item.audioStartMs === "number" && Number.isFinite(item.audioStartMs)
      ? Math.max(0, Math.floor(item.audioStartMs))
      : 0;
  const carouselAudioRef = useRef<Audio.Sound | null>(null);

  const captionText = (item.caption ?? "").trim();
  const isLongCaption = captionText.length > CAPTION_COLLAPSE_CHARS;

  useEffect(() => {
    if (!isActive) {
      setUserPaused(false);
    }
  }, [isActive]);

  useEffect(() => {
    setCaptionExpanded(false);
    setCommentsVisible(false);
    setCommentsCount(resolveCommentsCount(item));
  }, [item.id, item.commentsCount, item.comments]);

  const onCaptionPress = useCallback(() => {
    if (!isLongCaption) {
      return;
    }
    setCaptionExpanded((prev) => !prev);
  }, [isLongCaption]);

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

  // Web: play/pause op actief + gebruikers-pauze
  useEffect(() => {
    if (Platform.OS !== "web" || !asVideo) return;
    const v = webVideoRef.current;
    if (!v) return;
    if (!isActive) {
      stopWebPlayback();
      return;
    }
    v.muted = muteVideoForOverlay;
    if (userPaused) {
      v.pause();
      return;
    }
    const p = v.play();
    if (p && typeof (p as Promise<unknown>).catch === "function") {
      (p as Promise<unknown>).catch(() => {});
    }
  }, [isActive, userPaused, asVideo, muteVideoForOverlay, stopWebPlayback]);

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

  const stopCarouselAudio = useCallback(async () => {
    const sound = carouselAudioRef.current;
    if (!sound) {
      return;
    }
    try {
      await sound.pauseAsync();
    } catch {
      /* sound nog niet geladen */
    }
  }, []);

  useEffect(() => {
    if (!hasPostAudio || !postAudioUrl || Platform.OS === "web") {
      return;
    }

    let cancelled = false;
    let sound: Audio.Sound | null = null;

    void (async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
        });
        const created = await Audio.Sound.createAsync(
          { uri: postAudioUrl },
          {
            shouldPlay: false,
            isLooping: true,
            volume: postAudioVolume,
          }
        );
        if (cancelled) {
          await created.sound.unloadAsync();
          return;
        }
        sound = created.sound;
        carouselAudioRef.current = sound;
        if (postAudioStartMs > 0) {
          await sound.setPositionAsync(postAudioStartMs);
        }
        if (isActive && !userPaused) {
          await sound.playAsync();
        }
      } catch (error) {
        if (__DEV__) {
          console.warn("[FeedItem] post audio load failed", {
            id: item.id,
            error,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      carouselAudioRef.current = null;
      if (sound) {
        void sound.unloadAsync();
      }
    };
  }, [
    hasPostAudio,
    postAudioUrl,
    postAudioVolume,
    postAudioStartMs,
    item.id,
  ]);

  useEffect(() => {
    if (!hasPostAudio || Platform.OS === "web") {
      return;
    }
    const sound = carouselAudioRef.current;
    if (!sound) {
      return;
    }
    void (async () => {
      try {
        if (isActive && !userPaused) {
          await sound.playAsync();
        } else {
          await sound.pauseAsync();
        }
      } catch {
        /* playback state nog niet klaar */
      }
    })();
  }, [hasPostAudio, isActive, userPaused]);

  useEffect(() => {
    if (!hasPostAudio) {
      return;
    }
    return () => {
      carouselAudioRef.current = null;
      void stopCarouselAudio();
    };
  }, [hasPostAudio, stopCarouselAudio]);

  const avatarUri = item.ownerAvatarUrl ?? item.avatarUrl ?? null;

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
      return;
    }
    setCommentsVisible(true);
  };

  useEffect(() => {
    if (!isPersistablePostId(item.id)) {
      return;
    }
    let cancelled = false;
    void fetchPostShareCount(item.id)
      .then((count) => {
        if (!cancelled && count > 0) {
          setShareCount(count);
        }
      })
      .catch(() => {
        /* stil falen */
      });
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  const shareBusyRef = useRef(false);

  const onSharePress = () => {
    if (shareBusyRef.current) {
      return;
    }
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    shareBusyRef.current = true;
    void sharePostNative(item, { userId: user?.id ?? null })
      .then((result) => {
        if (result.success) {
          setShareCount((c) => c + 1);
        }
      })
      .finally(() => {
        shareBusyRef.current = false;
      });
  };

  const [isSaved, setIsSaved] = useState<boolean>(
    () => getCachedSavedStatus(item.id) ?? item.isSaved ?? false
  );
  const saveBusyRef = useRef(false);

  // Houd de bookmark in sync met de gedeelde cache (over FlatList-remounts heen).
  useEffect(() => {
    const sync = () => {
      const cached = getCachedSavedStatus(item.id);
      if (typeof cached === "boolean") {
        setIsSaved(cached);
      }
    };
    sync();
    return subscribeSavedStatus(sync);
  }, [item.id]);

  // Initiële status ophalen als die nog niet in de cache zit (batch vult deze vaak al).
  useEffect(() => {
    if (user == null) {
      setIsSaved(false);
      return;
    }
    if (!isPersistablePostId(item.id)) {
      return;
    }
    if (typeof getCachedSavedStatus(item.id) === "boolean") {
      return;
    }
    let cancelled = false;
    void isPostSaved(item.id)
      .then((saved) => {
        if (!cancelled) {
          setIsSaved(saved);
        }
      })
      .catch(() => {
        /* stil falen: bookmark blijft outline */
      });
    return () => {
      cancelled = true;
    };
  }, [user, item.id]);

  const onSavePress = () => {
    if (user == null) {
      openAuthPrompt({
        message: "Log in om posts op te slaan.",
      });
      return;
    }
    if (!isPersistablePostId(item.id) || saveBusyRef.current) {
      return;
    }

    const next = !isSaved;
    saveBusyRef.current = true;
    setIsSaved(next); // optimistische UI

    const action = next ? savePost(item.id) : unsavePost(item.id);
    void action
      .catch(() => {
        setIsSaved(!next); // rollback bij fout
        Alert.alert("Opslaan mislukt", "Probeer het opnieuw.");
      })
      .finally(() => {
        saveBusyRef.current = false;
      });
  };

  const isOwnPost =
    !!user?.id &&
    !!item.ownerProfileId &&
    item.ownerProfileId === user.id;
  const targetProfileId = item.ownerProfileId ?? null;

  useEffect(() => {
    if (!user?.id || !targetProfileId || isOwnPost) {
      setIsFollowing(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("follower_id", user.id)
        .eq("following_id", targetProfileId)
        .maybeSingle();
      if (!cancelled && !error) {
        setIsFollowing(!!data);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, targetProfileId, isOwnPost]);

  const requireAuth = useCallback(
    (message: string) => {
      openAuthPrompt({ message });
    },
    [openAuthPrompt]
  );

  const onMorePress = useCallback(() => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setMoreVisible(true);
  }, []);

  const onCopyLink = useCallback(() => {
    void (async () => {
      try {
        await Clipboard.setStringAsync(buildPublicPostShareUrl(item));
        Alert.alert("Link gekopieerd", "De link staat op je klembord.");
      } catch {
        Alert.alert("Kopiëren mislukt", "Probeer het opnieuw.");
      }
    })();
  }, [item]);

  const onToggleFollow = useCallback(() => {
    if (user == null) {
      requireAuth("Log in om creators te volgen.");
      return;
    }
    if (!targetProfileId || isOwnPost || followBusy) {
      return;
    }
    const next = !isFollowing;
    setFollowBusy(true);
    setIsFollowing(next);
    void (async () => {
      try {
        if (next) {
          const { error } = await supabase.from("follows").insert({
            follower_id: user.id,
            following_id: targetProfileId,
          });
          if (error) {
            if (error.code === "23505") {
              return;
            }
            throw error;
          }
        } else {
          const { error } = await supabase
            .from("follows")
            .delete()
            .eq("follower_id", user.id)
            .eq("following_id", targetProfileId);
          if (error) {
            throw error;
          }
        }
      } catch (e) {
        setIsFollowing(!next);
        const msg = getReadableErrorMessage(e, "Volgen mislukt.");
        Alert.alert("Fout", msg);
      } finally {
        setFollowBusy(false);
      }
    })();
  }, [
    followBusy,
    isFollowing,
    isOwnPost,
    requireAuth,
    targetProfileId,
    user,
  ]);

  const onViewStats = useCallback(() => {
    navigation.navigate("CreatorStats");
  }, [navigation]);

  const onConfirmDelete = useCallback(() => {
    if (!isOwnPost || !isPersistablePostId(item.id) || deleteBusy) {
      return;
    }
    Alert.alert(
      "Post verwijderen?",
      "Weet je zeker dat je deze post wilt verwijderen?",
      [
        { text: "Annuleren", style: "cancel" },
        {
          text: "Verwijderen",
          style: "destructive",
          onPress: () => {
            setDeleteBusy(true);
            void (async () => {
              try {
                await deleteMyPost(item.id);
                onRequestRemove?.(item.id);
              } catch (e) {
                const msg =
                  e instanceof Error ? e.message : "Verwijderen mislukt";
                Alert.alert("Fout", msg);
              } finally {
                setDeleteBusy(false);
              }
            })();
          },
        },
      ]
    );
  }, [deleteBusy, isOwnPost, item.id, onRequestRemove]);

  const onNotInterested = useCallback(() => {
    if (user == null) {
      requireAuth("Log in om je feed te personaliseren.");
      return;
    }
    if (!isPersistablePostId(item.id) || moderationBusy) {
      return;
    }
    setModerationBusy(true);
    void (async () => {
      try {
        await markNotInterested(item.id);
        onRequestRemove?.(item.id);
        Alert.alert(
          "Niet geïnteresseerd",
          "We tonen deze post en vergelijkbare content minder vaak."
        );
      } catch (e) {
        Alert.alert(
          "Fout",
          getReadableErrorMessage(e, "Voorkeur kon niet worden opgeslagen.")
        );
      } finally {
        setModerationBusy(false);
      }
    })();
  }, [item.id, moderationBusy, onRequestRemove, requireAuth, user]);

  const onReport = useCallback(() => {
    if (user == null) {
      requireAuth("Log in om content te melden.");
      return;
    }
    setReportReasonVisible(true);
  }, [requireAuth, user]);

  const onSubmitReport = useCallback(
    (reason: string) => {
      if (!isPersistablePostId(item.id) || moderationBusy) {
        return;
      }
      setModerationBusy(true);
      void (async () => {
        try {
          await reportPost(item.id, reason as ReportReason);
          onRequestRemove?.(item.id);
          Alert.alert(
            "Bedankt voor je melding",
            "We bekijken deze content zo snel mogelijk."
          );
        } catch (e) {
          Alert.alert(
            "Fout",
            getReadableErrorMessage(e, "Melden mislukt.")
          );
        } finally {
          setModerationBusy(false);
        }
      })();
    },
    [item.id, moderationBusy, onRequestRemove]
  );

  const onBlock = useCallback(() => {
    if (user == null) {
      requireAuth("Log in om gebruikers te blokkeren.");
      return;
    }
    if (!targetProfileId || moderationBusy) {
      return;
    }
    const handle = resolvePostUsername(item);
    Alert.alert(
      `@${handle} blokkeren?`,
      "Je ziet geen posts meer van deze gebruiker en jullie volgen elkaar niet meer.",
      [
        { text: "Annuleren", style: "cancel" },
        {
          text: "Blokkeren",
          style: "destructive",
          onPress: () => {
            setModerationBusy(true);
            void (async () => {
              try {
                await blockUser(targetProfileId);
                setIsFollowing(false);
                onRequestRemoveAuthor?.(targetProfileId);
                onRequestRemove?.(item.id);
                Alert.alert(
                  "Geblokkeerd",
                  `Je ziet geen content meer van @${handle}.`
                );
              } catch (e) {
                Alert.alert(
                  "Fout",
                  getReadableErrorMessage(e, "Blokkeren mislukt.")
                );
              } finally {
                setModerationBusy(false);
              }
            })();
          },
        },
      ]
    );
  }, [
    item,
    moderationBusy,
    onRequestRemove,
    onRequestRemoveAuthor,
    requireAuth,
    targetProfileId,
    user,
  ]);

  const onOwnerPress = useCallback(() => {
    const ownerProfileId = item.ownerProfileId;
    if (!ownerProfileId) {
      return;
    }
    navigation.navigate("PublicProfile", { profileId: ownerProfileId });
  }, [item.ownerProfileId, navigation]);

  const showLegacyShopCta =
    !item.linkedProduct &&
    item.isShopPost === true &&
    typeof item.productUrl === "string" &&
    item.productUrl.length > 0;
  const showShopCta = showLegacyShopCta;

  const onShopPress = useCallback(() => {
    if (item.linkedProduct) {
      void (async () => {
        if (user != null && isPersistablePostId(item.id)) {
          await recordProductClick(item.id, clickSource);
        }
        navigation.navigate("ProductDetail", {
          productId: item.linkedProduct!.id,
          canManage: false,
        });
      })();
      return;
    }

    const url = item.productUrl;
    if (!url) {
      return;
    }

    void (async () => {
      if (user != null && isPersistablePostId(item.id)) {
        await recordProductClick(item.id, clickSource);
      }
      try {
        await Linking.openURL(url);
      } catch {
        Alert.alert("Kan link niet openen.");
      }
    })();
  }, [clickSource, item.id, item.linkedProduct, item.productUrl, navigation, user]);

  const onSoundPress = useCallback(() => {
    if (!canOpenSoundReels || !item.audioTrackId) {
      return;
    }
    navigation.navigate("SoundReels", {
      audioTrackId: item.audioTrackId,
      initialPostId: item.id,
    });
  }, [canOpenSoundReels, item.audioTrackId, item.id, navigation]);

  const lastMediaTapAtRef = useRef(0);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const carouselDraggingRef = useRef(false);
  const heartAnimRef = useRef<DoubleTapHeartHandle | null>(null);

  useEffect(() => {
    return () => {
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
      }
    };
  }, []);

  const toggleUserPaused = useCallback(() => {
    if (!supportsTapToPause) {
      return;
    }
    setUserPaused((prev) => !prev);
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
        () => {}
      );
    }
  }, [supportsTapToPause]);

  const onCarouselDraggingChange = useCallback((dragging: boolean) => {
    carouselDraggingRef.current = dragging;
  }, []);

  const fireLikeHaptic = useCallback(() => {
    // Haptics zijn optioneel; nooit laten crashen (bv. web of geen motor).
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
      () => {}
    );
  }, []);

  const onDoubleTapLike = useCallback(
    (x?: number, y?: number) => {
      if (user == null) {
        openAuthPrompt({
          message: "Log in of registreer om een like te plaatsen.",
        });
        return;
      }
      heartAnimRef.current?.trigger(x, y);
      fireLikeHaptic();
      // Niet spammen: alleen liken als nog niet geliket; extra dubbeltikken
      // tonen wel een hart maar voegen geen tweede like toe.
      if (!isLikedByCurrentUser) {
        void onToggleLike();
      }
    },
    [user, openAuthPrompt, fireLikeHaptic, isLikedByCurrentUser, onToggleLike]
  );

  const onMediaAreaPress = useCallback(
    (e?: GestureResponderEvent) => {
      if (carouselDraggingRef.current) {
        return;
      }
      const now = Date.now();
      if (now - lastMediaTapAtRef.current <= DOUBLE_TAP_MS) {
        if (singleTapTimerRef.current) {
          clearTimeout(singleTapTimerRef.current);
          singleTapTimerRef.current = null;
        }
        lastMediaTapAtRef.current = 0;
        const ne = e?.nativeEvent;
        onDoubleTapLike(ne?.pageX, ne?.pageY);
        return;
      }
      lastMediaTapAtRef.current = now;

      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
      }
      singleTapTimerRef.current = setTimeout(() => {
        singleTapTimerRef.current = null;
        toggleUserPaused();
      }, DOUBLE_TAP_MS);
    },
    [onDoubleTapLike, toggleUserPaused]
  );

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
            muted: !isActive || muteVideoForOverlay,
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
          shouldPlay={isActive && !userPaused}
          isLooping
          isMuted={!isActive || muteVideoForOverlay}
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
            onCarouselDraggingChange={onCarouselDraggingChange}
            onSlidePress={onMediaAreaPress}
            tapToPauseAudio={hasPostAudio}
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
        colors={["rgba(0,0,0,0.08)", "rgba(0,0,0,0.35)", "rgba(0,0,0,0.92)"]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {supportsTapToPause && (asVideo || asStaticImageReel) ? (
        <Pressable
          style={styles.mediaTapLayer}
          onPress={onMediaAreaPress}
          accessibilityRole="button"
          accessibilityLabel={
            userPaused ? "Tik om af te spelen" : "Tik om te pauzeren"
          }
        />
      ) : null}

      {supportsTapToPause ? (
        <ReelPauseIndicator visible={userPaused && isActive} />
      ) : null}

      <DoubleTapHeartAnimation ref={heartAnimRef} />

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
            color={isLikedByCurrentUser ? "#ff375f" : theme.onMediaIcon}
          />
          <Text style={styles.railCount}>
            {formatLikesForDisplay(likesCount)}
          </Text>
        </PressableScale>

        <PressableScale style={styles.railAction} scaleTo={0.9} onPress={onCommentPress}>
          <Ionicons
            name="chatbubble-outline"
            size={ACTION_ICON}
            color={theme.onMediaIcon}
          />
          <Text style={styles.railCount}>
            {formatLikesForDisplay(commentsCount)}
          </Text>
        </PressableScale>

        <PressableScale
          style={styles.railAction}
          scaleTo={0.93}
          onPress={onSharePress}
          accessibilityRole="button"
          accessibilityLabel="Deel deze reel"
        >
          <Ionicons
            name="paper-plane-outline"
            size={SHARE_ICON}
            color={theme.onMediaIcon}
            style={styles.shareIcon}
          />
          <Text style={styles.railCount}>
            {formatLikesForDisplay(shareCount)}
          </Text>
        </PressableScale>

        <PressableScale
          style={styles.railAction}
          scaleTo={0.9}
          onPress={onSavePress}
          accessibilityRole="button"
          accessibilityLabel={isSaved ? "Verwijder uit opgeslagen" : "Opslaan"}
          accessibilityState={{ selected: isSaved }}
        >
          <Ionicons
            name={isSaved ? "bookmark" : "bookmark-outline"}
            size={ACTION_ICON}
            color={theme.onMediaIcon}
          />
        </PressableScale>

        <PressableScale
          style={[styles.railAction, styles.railMoreRow]}
          scaleTo={0.9}
          onPress={onMorePress}
          accessibilityRole="button"
          accessibilityLabel="Meer opties"
        >
          <Ionicons
            name="ellipsis-horizontal"
            size={MORE_ICON}
            color={theme.onMediaIcon}
          />
        </PressableScale>
      </View>

      <View
        style={[
          styles.bottomLeftOverlay,
          { bottom: reelsBottomInset, maxWidth: captionMaxWidth },
        ]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={onOwnerPress}
          disabled={!item.ownerProfileId}
          style={styles.bottomUserRow}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Bekijk profiel"
        >
          <AvatarImage
            uri={avatarUri}
            style={styles.bottomAvatar}
            variant="expo"
            contentFit="cover"
          />
          <Text style={styles.handle} numberOfLines={1}>
            {ownerLabel}
          </Text>
        </Pressable>

        {captionText.length > 0 ? (
          <Pressable
            onPress={onCaptionPress}
            disabled={!isLongCaption}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={
              isLongCaption
                ? captionExpanded
                  ? "Caption inklappen"
                  : "Volledige caption tonen"
                : undefined
            }
          >
            <Text
              style={styles.caption}
              numberOfLines={captionExpanded ? undefined : 2}
            >
              {captionExpanded || !isLongCaption
                ? captionText
                : truncateCaption(captionText, CAPTION_COLLAPSE_CHARS)}
              {isLongCaption && !captionExpanded ? (
                <Text style={styles.captionToggle}>... meer</Text>
              ) : null}
              {isLongCaption && captionExpanded ? (
                <Text style={styles.captionToggle}> minder</Text>
              ) : null}
            </Text>
          </Pressable>
        ) : null}

        {hasPostAudio ? (
          canOpenSoundReels ? (
            <Pressable
              onPress={onSoundPress}
              style={styles.audioBadgeRow}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Meer posts met ${postAudioLabel}`}
            >
              {item.musicThumbUrl ? (
                <Image
                  source={{ uri: item.musicThumbUrl }}
                  style={styles.audioBadgeCover}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.audioBadgeCoverPlaceholder}>
                  <Ionicons name="musical-notes" size={14} color={theme.accent} />
                </View>
              )}
              <Text style={styles.audioBadge} numberOfLines={1}>
                {postAudioLabel}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={14}
                color="rgba(255,255,255,0.75)"
              />
            </Pressable>
          ) : (
            <Text style={styles.audioBadge} numberOfLines={1}>
              🎵 {postAudioLabel}
            </Text>
          )
        ) : null}

        {showShopCta ? (
          <View style={styles.shopBlock}>
            <Text style={styles.productInfo} numberOfLines={1}>
              {buildProductInfoLine(item)}
            </Text>
            <Pressable
              onPress={onShopPress}
              style={styles.shopCta}
              hitSlop={8}
              accessibilityRole="link"
              accessibilityLabel="Bekijk product"
            >
              <Text style={styles.shopCtaText}>Bekijk product</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <CommentsSheet
        visible={commentsVisible}
        postId={item.id}
        onClose={() => setCommentsVisible(false)}
        onCommentAdded={() => setCommentsCount((c) => c + 1)}
        onCommentDeleted={() =>
          setCommentsCount((c) => Math.max(0, c - 1))
        }
      />

      <PostMoreSheet
        visible={moreVisible}
        post={item}
        isOwnPost={isOwnPost}
        isFollowing={isFollowing}
        followBusy={followBusy}
        deleteBusy={deleteBusy}
        onClose={() => setMoreVisible(false)}
        onCopyLink={onCopyLink}
        onViewProfile={item.ownerProfileId ? onOwnerPress : undefined}
        onToggleFollow={
          !isOwnPost && targetProfileId ? onToggleFollow : undefined
        }
        onViewStats={isOwnPost ? onViewStats : undefined}
        onDelete={isOwnPost ? onConfirmDelete : undefined}
        onNotInterested={!isOwnPost ? onNotInterested : undefined}
        onReport={!isOwnPost ? onReport : undefined}
        onBlock={!isOwnPost ? onBlock : undefined}
      />

      <ReportReasonSheet
        visible={reportReasonVisible}
        onClose={() => setReportReasonVisible(false)}
        onSubmit={onSubmitReport}
        busy={moderationBusy}
      />

      {item.linkedProduct ? (
        <ProductReelShopCard
          product={item.linkedProduct}
          bottomInset={reelsBottomInset}
          visible={shopCardVisible}
          onPress={onShopPress}
          onDismiss={() => setShopCardVisible(false)}
        />
      ) : null}

    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
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
    zIndex: 20,
    elevation: 20,
  },
  railAction: {
    alignItems: "center",
    gap: ICON_TO_LABEL,
  },
  shareIcon: {
    transform: [{ rotate: `${SHARE_ROTATION_DEG}deg` }],
  },
  railMoreRow: {
    gap: 0,
    paddingVertical: 1,
  },
  railCount: {
    color: theme.onMediaText,
    fontSize: COUNT_FS,
    fontWeight: "600",
    letterSpacing: 0.15,
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  bottomLeftOverlay: {
    position: "absolute",
    left: 16,
    zIndex: 20,
    elevation: 20,
    gap: 6,
  },
  bottomUserRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  bottomAvatar: {
    width: BOTTOM_AVATAR,
    height: BOTTOM_AVATAR,
    borderRadius: BOTTOM_AVATAR / 2,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.95)",
  },
  handle: {
    color: theme.onMediaText,
    fontSize: HANDLE_FS,
    fontWeight: "700",
    letterSpacing: 0.2,
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
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
  captionToggle: {
    fontWeight: "700",
    color: "rgba(255,255,255,0.78)",
  },
  audioBadge: {
    flex: 1,
    color: "rgba(255,255,255,0.9)",
    fontSize: 12,
    fontWeight: "700",
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  audioBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    maxWidth: "88%",
  },
  audioBadgeCover: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  audioBadgeCoverPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  shopBlock: {
    marginTop: 6,
    gap: 5,
    alignSelf: "stretch",
  },
  productInfo: {
    color: "rgba(255,255,255,0.72)",
    fontSize: PRODUCT_INFO_FS,
    lineHeight: 15,
    fontWeight: "500",
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  shopCta: {
    alignSelf: "flex-start",
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.38)",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  shopCtaText: {
    color: theme.onMediaText,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.15,
  },
  mediaTapLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 8,
    elevation: 8,
  },
  });
}
