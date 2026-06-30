import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FeedItem } from "../components/FeedItem";
import type { AppTheme } from "../constants/themeTokens";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { FeedPost } from "../data/placeholder";
import { fetchPostById } from "../services/postsService";
import { buildPublicPostShareUrl } from "../services/sharePostService";

const INITIAL_H = Dimensions.get("window").height;

export type SharedPostRouteParams = {
  postId: string;
};

export function SharedPostScreen() {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const params = (route.params ?? {}) as Partial<SharedPostRouteParams>;
  const postId = params.postId ?? "";

  const [post, setPost] = useState<FeedPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageH, setPageH] = useState(INITIAL_H);

  const load = useCallback(async () => {
    if (!postId) {
      setError("Ongeldige link.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const fetched = await fetchPostById(postId);
      if (!fetched) {
        setError("Deze post is niet meer beschikbaar.");
        setPost(null);
      } else {
        setPost(fetched);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kon post niet laden.");
      setPost(null);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View
      style={styles.root}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        if (h > 0) {
          setPageH(h);
        }
      }}
    >
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Terug"
        >
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>{error}</Text>
          <Text style={styles.errorHint} numberOfLines={2}>
            {buildPublicPostShareUrl({ id: postId })}
          </Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => void load()}
            accessibilityRole="button"
          >
            <Text style={styles.retryBtnText}>Opnieuw proberen</Text>
          </Pressable>
        </View>
      ) : post ? (
        <FeedItem item={post} pageHeight={pageH} isActive />
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
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    paddingHorizontal: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 10,
  },
  errorTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  errorHint: {
    color: theme.textMuted,
    fontSize: 12,
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.accentSoft,
    borderWidth: 1,
    borderColor: theme.accentBorder,
  },
  retryBtnText: {
    color: theme.text,
    fontWeight: "600",
  },
  });
}
