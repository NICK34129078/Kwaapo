import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { spacing } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { useThemedStyles } from "../../hooks/useThemedStyles";
import type { AppTheme } from "../../constants/theme";

type Props = {
  onPress: () => void;
  label?: string;
  testID?: string;
};

export function BackToTopButton({
  onPress,
  label = "Terug naar boven",
  testID = "terms-back-to-top",
}: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <Pressable
      style={styles.btn}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
    >
      <Ionicons name="arrow-up" size={16} color={theme.accent} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    btn: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      minHeight: 44,
      paddingHorizontal: spacing.sm,
      marginTop: spacing.md,
      marginBottom: spacing.lg,
    },
    label: {
      color: theme.accent,
      fontSize: 14,
      fontWeight: "600",
    },
  });
}
