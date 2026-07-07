import React, { useCallback, useEffect, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AvatarImage } from "./AvatarImage";
import { useAuth } from "../context/AuthContext";
import {
  addComment,
  deleteMyComment,
  fetchComments,
  type PostComment,
} from "../services/commentsService";

const BODY_MAX = 300;

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
  const { user } = useAuth();
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={[styles.root, { paddingTop: insets.top }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Reacties</Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Sluit reacties"
          >
            <Ionicons name="close" size={28} color={theme.text} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="small" color={theme.accent} />
          </View>
        ) : loadError ? (
          <View style={styles.centerState}>
            <Text style={styles.errorText}>{loadError}</Text>
            <Pressable onPress={() => void load()} style={styles.retryBtn}>
              <Text style={styles.retryBtnText}>Opnieuw</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={comments}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            contentContainerStyle={[
              styles.listContent,
              comments.length === 0 && styles.listContentEmpty,
            ]}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={styles.emptyText}>Nog geen reacties</Text>
            }
          />
        )}

        <View
          style={[
            styles.composer,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <TextInput
            style={styles.input}
            placeholder="Plaats een reactie…"
            placeholderTextColor={theme.textMuted}
            value={draft}
            onChangeText={(t) => setDraft(t.slice(0, BODY_MAX))}
            multiline
            maxLength={BODY_MAX}
            editable={!submitting && deletingId == null}
          />
          <Pressable
            onPress={onSubmit}
            disabled={
              submitting || deletingId != null || draft.trim().length === 0
            }
            style={[
              styles.sendBtn,
              (submitting || deletingId != null || draft.trim().length === 0) &&
                styles.sendBtnDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Plaatsen"
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#0B0B0B" />
            ) : (
              <Text style={styles.sendBtnText}>Plaatsen</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  commentAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.bgElevated,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  commentAvatarFallbackText: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: "600",
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
    color: "#0B0B0B",
    fontSize: 14,
    fontWeight: "700",
  },
});
}

