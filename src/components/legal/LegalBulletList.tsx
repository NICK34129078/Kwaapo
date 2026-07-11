import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { spacing } from "../../constants/theme";
import { useThemedStyles } from "../../hooks/useThemedStyles";
import type { AppTheme } from "../../constants/theme";

type Props = {
  items: string[];
};

export function LegalBulletList({ items }: Props) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.wrap}>
      {items.map((item) => (
        <View key={item} style={styles.row}>
          <Text style={styles.bullet} accessibilityElementsHidden>
            •
          </Text>
          <Text style={styles.text}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    wrap: {
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
    },
    bullet: {
      color: theme.accent,
      fontSize: 16,
      lineHeight: 24,
    },
    text: {
      flex: 1,
      color: theme.textMuted,
      fontSize: 16,
      lineHeight: 24,
    },
  });
}
