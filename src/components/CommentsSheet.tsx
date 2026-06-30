import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import {
  FlatList,
  GestureHandlerRootView,
  NativeViewGestureHandler,
  PanGestureHandler,
  State,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { AppTheme } from "../constants/themeTokens";
import { AvatarImage } from "./AvatarImage";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import {
  addComment,
  deleteMyComment,
  fetchComments,
  type PostComment,
} from "../services/commentsService";

const BODY_MAX = 300;
const SHEET_HEIGHT_RATIO = 0.88;
const DISMISS_DISTANCE_RATIO = 0.22;
const DISMISS_VELOCITY = 0.55;
const SCROLL_TOP_EPSILON = 2;
const CHROME_TOP_HEIGHT = 72;
const COMPOSER_BASE_HEIGHT = 64;

type Props = {
  visible: boolean;
  postId: string;
  onClose: () => void;
  onCommentAdded?: () => void;
  onCommentDeleted?: () => void;
};

function formatCommentTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return d.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type CommentRowProps = {
  item: PostComment;
  isOwn: boolean;
  onDeletePress: (comment: PostComment) => void;
};

function CommentRow({ item, isOwn, onDeletePress }: CommentRowProps) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const uname = item.username?.trim() || "gebruiker";
  return (
    <View style={styles.commentRow}>
      <AvatarImage uri={item.avatarUrl} style={styles.commentAvatar} />
      <View style={styles.commentBodyWrap}>
        <View style={styles.commentHeader}>
          <Text style={styles.commentUser} numberOfLines={1}>
            @{uname}
          </Text>
          <View style={styles.commentHeaderRight}>
            {item.createdAt ? (
              <Text style={styles.commentTime}>
                {formatCommentTime(item.createdAt)}
              </Text>
            ) : null}
            {isOwn ? (
              <Pressable
                onPress={() => onDeletePress(item)}
                hitSlop={10}
                style={styles.deleteBtn}
                accessibilityRole="button"
                accessibilityLabel="Reactie verwijderen"
              >
                <Ionicons
                  name="trash-outline"
                  size={18}
                  color={theme.textMuted}
                />
              </Pressable>
            ) : null}
          </View>
        </View>
        <Text style={styles.commentText}>{item.body}</Text>
      </View>
    </View>
  );
}

export function CommentsSheet({
  visible,
  postId,
  onClose,
  onCommentAdded,
  onCommentDeleted,
}: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { user } = useAuth();
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [presented, setPresented] = useState(false);
  const [scrollAtTop, setScrollAtTop] = useState(true);
  const [sheetDragged, setSheetDragged] = useState(false);

  const sheetHeight = Math.round(windowHeight * SHEET_HEIGHT_RATIO);
  const translateY = useRef(new Animated.Value(sheetHeight)).current;
  const dragYRef = useRef(sheetHeight);
  const grantDragYRef = useRef(0);
  const scrollYRef = useRef(0);
  const panActiveRef = useRef(false);
  const touchInScrimRef = useRef(false);
  const panRef = useRef<PanGestureHandler>(null);
  const scrollRef = useRef<NativeViewGestureHandler>(null);

  const composerZoneHeight = COMPOSER_BASE_HEIGHT + Math.max(insets.bottom, 12);

  const listScrollEnabled =
    !scrollAtTop && !loading && loadError == null && comments.length > 0;

  const backdropOpacity = useMemo(
    () =>
      translateY.interpolate({
        inputRange: [0, sheetHeight],
        outputRange: [1, 0],
        extrapolate: "clamp",
      }),
    [sheetHeight, translateY]
  );

  useEffect(() => {
    const sub = translateY.addListener(({ value }) => {
      dragYRef.current = value;
      const dragged = value > 0;
      setSheetDragged((prev) => (prev === dragged ? prev : dragged));
    });
    return () => {
      translateY.removeListener(sub);
    };
  }, [translateY]);

  const animateOpen = useCallback(() => {
    scrollYRef.current = 0;
    setScrollAtTop(true);
    setSheetDragged(false);
    translateY.setValue(sheetHeight);
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 34,
      stiffness: 380,
      mass: 0.82,
    }).start();
  }, [sheetHeight, translateY]);

  const animateClosed = useCallback(
    (onFinished?: () => void) => {
      const remaining = Math.max(0, sheetHeight - dragYRef.current);
      const duration = Math.min(
        240,
        Math.max(140, Math.round(remaining * 0.5))
      );
      Animated.timing(translateY, {
        toValue: sheetHeight,
        duration,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          onFinished?.();
        }
      });
    },
    [sheetHeight, translateY]
  );

  useEffect(() => {
    if (visible) {
      setPresented(true);
    }
  }, [visible]);

  useEffect(() => {
    if (!presented) {
      return;
    }
    if (visible) {
      animateOpen();
      return;
    }
    animateClosed(() => setPresented(false));
  }, [animateClosed, animateOpen, presented, visible]);

  const requestClose = useCallback(() => {
    if (!visible) {
      return;
    }
    onClose();
  }, [onClose, visible]);

  const onPanGestureEvent = useCallback(
    (event: PanGestureHandlerGestureEvent) => {
      if (!panActiveRef.current) {
        return;
      }
      const { translationY } = event.nativeEvent;
      translateY.setValue(Math.max(0, grantDragYRef.current + translationY));
    },
    [translateY]
  );

  const onPanHandlerStateChange = useCallback(
    (event: PanGestureHandlerStateChangeEvent) => {
      const { state, translationY, velocityY, y } = event.nativeEvent;

      if (state === State.BEGAN) {
        grantDragYRef.current = dragYRef.current;
        const sheetTop = windowHeight - sheetHeight + dragYRef.current;
        touchInScrimRef.current = y < sheetTop;

        if (touchInScrimRef.current) {
          panActiveRef.current = true;
          return;
        }

        const touchOnSheet = y - sheetTop;
        const inChrome = touchOnSheet < CHROME_TOP_HEIGHT;
        const inComposer = touchOnSheet > sheetHeight - composerZoneHeight;

        panActiveRef.current =
          inChrome ||
          inComposer ||
          sheetDragged ||
          scrollYRef.current <= SCROLL_TOP_EPSILON ||
          loading ||
          loadError != null ||
          comments.length === 0;
        return;
      }

      if (state === State.CANCELLED || state === State.FAILED) {
        panActiveRef.current = false;
        touchInScrimRef.current = false;
        return;
      }

      if (state !== State.END) {
        return;
      }

      if (!panActiveRef.current) {
        return;
      }
      panActiveRef.current = false;

      const current = Math.max(0, grantDragYRef.current + translationY);
      translateY.setValue(current);

      const wasScrimTap =
        touchInScrimRef.current &&
        Math.abs(translationY) < 12 &&
        Math.abs(velocityY) < 0.35;
      touchInScrimRef.current = false;

      if (wasScrimTap) {
        requestClose();
        return;
      }

      const dismissDistance = Math.max(72, sheetHeight * DISMISS_DISTANCE_RATIO);
      if (current > dismissDistance || velocityY > DISMISS_VELOCITY) {
        requestClose();
        return;
      }

      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 26,
        stiffness: 360,
        mass: 0.78,
        velocity: velocityY,
      }).start();
    },
    [
      comments.length,
      composerZoneHeight,
      loadError,
      loading,
      requestClose,
      sheetDragged,
      sheetHeight,
      translateY,
      windowHeight,
    ]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await fetchComments(postId);
      setComments(rows);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Kon reacties niet laden.";
      setLoadError(msg);
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    if (!visible) {
      setDraft("");
      setLoadError(null);
      setDeletingId(null);
      return;
    }
    void load();
  }, [visible, load]);

  const confirmDeleteComment = useCallback(
    (comment: PostComment) => {
      Alert.alert(
        "Reactie verwijderen?",
        "Weet je zeker dat je deze reactie wilt verwijderen?",
        [
          { text: "Annuleren", style: "cancel" },
          {
            text: "Verwijderen",
            style: "destructive",
            onPress: () => {
              setDeletingId(comment.id);
              void (async () => {
                try {
                  await deleteMyComment(comment.id);
                  setComments((prev) =>
                    prev.filter((c) => c.id !== comment.id)
                  );
                  onCommentDeleted?.();
                } catch (e) {
                  const msg =
                    e instanceof Error ? e.message : "Verwijderen mislukt.";
                  Alert.alert("Fout", msg);
                } finally {
                  setDeletingId(null);
                }
              })();
            },
          },
        ]
      );
    },
    [onCommentDeleted]
  );

  const onSubmit = useCallback(() => {
    const text = draft.trim();
    if (text.length === 0 || submitting) {
      return;
    }

    setSubmitting(true);
    void (async () => {
      try {
        const created = await addComment(postId, text);
        setComments((prev) => [created, ...prev]);
        setDraft("");
        onCommentAdded?.();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Plaatsen mislukt.";
        Alert.alert("Fout", msg);
      } finally {
        setSubmitting(false);
      }
    })();
  }, [draft, submitting, postId, onCommentAdded]);

  const renderItem = useCallback(
    ({ item }: { item: PostComment }) => (
      <CommentRow
        item={item}
        isOwn={user?.id === item.userId}
        onDeletePress={confirmDeleteComment}
      />
    ),
    [user?.id, confirmDeleteComment]
  );

  const keyExtractor = useCallback((item: PostComment) => item.id, []);

  const onCommentsScroll = useCallback(
    (event: { nativeEvent: { contentOffset: { y: number } } }) => {
      const y = event.nativeEvent.contentOffset.y;
      scrollYRef.current = y;
      const atTop = y <= SCROLL_TOP_EPSILON;
      setScrollAtTop((prev) => (prev === atTop ? prev : atTop));
    },
    []
  );

  const panHandlerProps = {
    onGestureEvent: onPanGestureEvent,
    onHandlerStateChange: onPanHandlerStateChange,
    activeOffsetY: [-4, 4] as [number, number],
    failOffsetX: [-28, 28] as [number, number],
    simultaneousHandlers: scrollRef,
  };

  if (!presented) {
    return null;
  }

  return (
    <Modal
      visible={presented}
      transparent
      animationType="none"
      onRequestClose={requestClose}
      statusBarTranslucent={Platform.OS === "android"}
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
        <PanGestureHandler ref={panRef} {...panHandlerProps}>
          <Animated.View style={styles.overlayFill}>
            <Animated.View
              pointerEvents="none"
              style={[styles.backdrop, { opacity: backdropOpacity }]}
            />

            <Animated.View
              style={[
                styles.sheet,
                {
                  height: sheetHeight,
                  transform: [{ translateY }],
                },
              ]}
            >
              <KeyboardAvoidingView
                style={styles.sheetInner}
                behavior={Platform.OS === "ios" ? "padding" : undefined}
              >
                <View style={styles.grabberWrap}>
                  <View style={styles.grabber} />
                </View>

                <View style={styles.header}>
                  <Text style={styles.title}>Reacties</Text>
                  <Pressable
                    onPress={requestClose}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="Sluit reacties"
                  >
                    <Ionicons name="close" size={28} color={theme.text} />
                  </Pressable>
                </View>

                <View style={styles.bodyDragZone}>
                  {loading ? (
                    <View style={styles.centerState}>
                      <ActivityIndicator size="small" color={theme.accent} />
                    </View>
                  ) : loadError ? (
                    <View style={styles.centerState}>
                      <Text style={styles.errorText}>{loadError}</Text>
                      <Pressable
                        onPress={() => void load()}
                        style={styles.retryBtn}
                      >
                        <Text style={styles.retryBtnText}>Opnieuw</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <NativeViewGestureHandler
                      ref={scrollRef}
                      simultaneousHandlers={panRef}
                    >
                      <FlatList
                        data={comments}
                        keyExtractor={keyExtractor}
                        renderItem={renderItem}
                        contentContainerStyle={[
                          styles.listContent,
                          comments.length === 0 && styles.listContentEmpty,
                        ]}
                        keyboardShouldPersistTaps="handled"
                        scrollEventThrottle={16}
                        bounces={false}
                        overScrollMode="never"
                        scrollEnabled={listScrollEnabled}
                        onScroll={onCommentsScroll}
                        ListEmptyComponent={
                          <Text style={styles.emptyText}>Nog geen reacties</Text>
                        }
                      />
                    </NativeViewGestureHandler>
                  )}
                </View>

                <View
                  style={[
                    styles.composer,
                    { paddingBottom: Math.max(insets.bottom, 12) },
                  ]}
                >
                  <TextInput
                    style={styles.input}
                    placeholder="Plaats een reactie…"
                    placeholderTextColor={theme.placeholder}
                    value={draft}
                    onChangeText={(t) => setDraft(t.slice(0, BODY_MAX))}
                    multiline
                    maxLength={BODY_MAX}
                    editable={!submitting && deletingId == null}
                  />
                  <Pressable
                    onPress={onSubmit}
                    disabled={
                      submitting ||
                      deletingId != null ||
                      draft.trim().length === 0
                    }
                    style={[
                      styles.sendBtn,
                      (submitting ||
                        deletingId != null ||
                        draft.trim().length === 0) &&
                        styles.sendBtnDisabled,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Plaatsen"
                  >
                    {submitting ? (
                      <ActivityIndicator size="small" color={theme.accentText} />
                    ) : (
                      <Text style={styles.sendBtnText}>Plaatsen</Text>
                    )}
                  </Pressable>
                </View>
              </KeyboardAvoidingView>
            </Animated.View>
          </Animated.View>
        </PanGestureHandler>
      </GestureHandlerRootView>
    </Modal>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  overlayFill: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.overlay,
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    overflow: "hidden",
  },
  sheetInner: {
    flex: 1,
  },
  bodyDragZone: {
    flex: 1,
    minHeight: 0,
  },
  grabberWrap: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  title: {
    color: theme.text,
    fontSize: 18,
    fontWeight: "700",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: "center",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyText: {
    color: theme.textMuted,
    fontSize: 15,
    textAlign: "center",
  },
  errorText: {
    color: theme.textMuted,
    fontSize: 14,
    textAlign: "center",
    marginBottom: 12,
  },
  retryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  retryBtnText: {
    color: theme.accent,
    fontSize: 15,
    fontWeight: "600",
  },
  commentRow: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.bgElevated,
  },
  commentBodyWrap: {
    flex: 1,
    minWidth: 0,
  },
  commentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4,
  },
  commentHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  commentUser: {
    flex: 1,
    color: theme.text,
    fontSize: 14,
    fontWeight: "600",
  },
  commentTime: {
    color: theme.textMuted,
    fontSize: 11,
  },
  deleteBtn: {
    padding: 2,
  },
  commentText: {
    color: theme.text,
    fontSize: 14,
    lineHeight: 20,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
    backgroundColor: theme.bg,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    backgroundColor: theme.bgElevated,
    color: theme.text,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sendBtn: {
    minWidth: 72,
    minHeight: 40,
    borderRadius: 20,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
  sendBtnText: {
    color: theme.accentText,
    fontSize: 14,
    fontWeight: "700",
  },
  });
}
