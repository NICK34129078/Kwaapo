import React, { useCallback, useEffect, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { fetchSavedPostsByUserId } from "../services/savedPostsService";
import type { UserVideoPost } from "../types/userVideoPost";

type Props = {
  /** Eigenaar van de bekeken bookmark-tab (eigen of ander profiel). */
  userId: string;
  isOwnProfile: boolean;
  cellSize: number;
  /** Aantal saves wijzigt (bijv. voor een teller in het profiel). */
  onCountChange?: (count: number) => void;
};

const GAP = 2;

export function SavedPostsGrid({
  userId,
  isOwnProfile,
  cellSize,
  onCountChange,
}: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  const navigation = useNavigation<any>();
  const [posts, setPosts] = useState<UserVideoPost[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchSavedPostsByUserId(userId);
      setPosts(rows);
      onCountChange?.(rows.length);
    } catch {
      setPosts([]);
      onCountChange?.(0);
    } finally {
      setLoading(false);
    }
  }, [onCountChange, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openSavedPost = useCallback(
    (post: UserVideoPost) => {
      if (posts.length === 0) {
        return;
      }
      navigation.navigate("ProfileReels", {
        profileId: userId,
        initialPostId: post.id,
        posts,
        // Opgeslagen posts zijn niet noodzakelijk van deze gebruiker:
        // geen eigenaar-acties (verwijderen) tonen.
        isOwnProfile: false,
      });
    },
    [navigation, posts, userId]
  );

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="small" color={theme.accent} />
      </View>
    );
  }

  if (posts.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="bookmark-outline" size={40} color={theme.textMuted} />
        <Text style={styles.emptyTitle}>
          {isOwnProfile ? "Nog geen opgeslagen posts" : "Geen opgeslagen posts"}
        </Text>
        <Text style={styles.emptyText}>
          {isOwnProfile
            ? "Opgeslagen posts verschijnen hier."
            : "Deze gebruiker heeft nog niets opgeslagen."}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.grid}>
      {posts.map((p, i) => (
        <Pressable
          key={p.id}
          onPress={() => openSavedPost(p)}
          accessibilityRole="button"
          accessibilityLabel={
            p.type === "image_carousel"
              ? `Open opgeslagen fotoserie ${p.filename ?? ""}`
              : `Open opgeslagen video ${p.filename ?? ""}`
          }
          style={[
            styles.cell,
            { width: cellSize },
            { marginRight: i % 3 === 2 ? 0 : GAP, marginBottom: GAP },
          ]}
        >
          <View style={styles.thumbWithOverlay}>
            {p.thumbnailUrl || p.imageUrl ? (
              <Image
                source={{ uri: p.thumbnailUrl ?? p.imageUrl }}
                style={styles.thumb}
              />
            ) : (
              <View style={[styles.thumb, styles.thumbFallback]}>
                <Ionicons name="play-circle" size={24} color={theme.text} />
              </View>
            )}
            {p.type === "image_carousel" ? (
              <View style={styles.badge} pointerEvents="none">
                <Ionicons
                  name="albums-outline"
                  size={18}
                  color="rgba(255,255,255,0.95)"
                />
              </View>
            ) : (
              <View style={styles.playIconOverlay} pointerEvents="none">
                <Ionicons
                  name="play-circle"
                  size={24}
                  color="rgba(255,255,255,0.95)"
                />
              </View>
            )}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  loadingWrap: {
    paddingVertical: 32,
    alignItems: "center",
  },
  cell: {
    width: "33.33%",
  },
  thumbWithOverlay: {
    width: "100%",
    position: "relative",
    aspectRatio: 0.78,
  },
  thumb: {
    width: "100%",
    aspectRatio: 0.78,
    backgroundColor: theme.bgElevated,
  },
  thumbFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  playIconOverlay: {
    position: "absolute",
    right: 4,
    bottom: 4,
  },
  badge: {
    position: "absolute",
    right: 4,
    bottom: 4,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 6,
    padding: 3,
  },
  emptyWrap: {
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "800",
  },
  emptyText: {
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
});
}

