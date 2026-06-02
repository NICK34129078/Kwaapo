import React, { useCallback } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { formatLikesForDisplay } from "../data/placeholder";
import { useAuth } from "../context/AuthContext";
import { useAuthPrompt } from "../context/AuthPromptContext";
import { useReelLike } from "../context/LikesContext";
import { theme } from "../constants/theme";

type Props = {
  postId: string;
  defaultLikesCount: number;
  style?: StyleProp<ViewStyle>;
  iconSize?: number;
};

export function PostLikeButton({
  postId,
  defaultLikesCount,
  style,
  iconSize = 26,
}: Props) {
  const { user } = useAuth();
  const { openAuthPrompt } = useAuthPrompt();
  const { likesCount, isLikedByCurrentUser, onToggleLike } = useReelLike(
    postId,
    defaultLikesCount
  );

  const onPress = useCallback(() => {
    if (user == null) {
      openAuthPrompt({
        message: "Log in of registreer om een like te plaatsen.",
      });
      return;
    }
    void onToggleLike();
  }, [user, onToggleLike, openAuthPrompt]);

  return (
    <Pressable
      onPress={onPress}
      style={[styles.wrap, style]}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={
        isLikedByCurrentUser ? "Like verwijderen" : "Like plaatsen"
      }
    >
      <Ionicons
        name={isLikedByCurrentUser ? "heart" : "heart-outline"}
        size={iconSize}
        color={isLikedByCurrentUser ? "#ff375f" : theme.text}
      />
      <Text style={styles.count}>{formatLikesForDisplay(likesCount)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    minWidth: 44,
    minHeight: 44,
  },
  count: {
    color: theme.text,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.15,
  },
});
