import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { spacing } from "../../constants/theme";
import { useThemedStyles } from "../../hooks/useThemedStyles";
import type { AppTheme } from "../../constants/theme";

type Props = {
  title?: string;
  items: string[];
  testID?: string;
};

export function LegalSummaryCard({
  title = "Belangrijk in het kort",
  items,
  testID = "terms-summary",
}: Props) {
  const styles = useThemedStyles(createStyles);

  return (
    <View
      style={styles.card}
      testID={testID}
      accessibilityRole="summary"
      accessibilityLabel={title}
    >
      <Text style={styles.title}>{title}</Text>
      {items.map((item) => (
        <View key={item} style={styles.row}>
          <Text style={styles.bullet} accessibilityElementsHidden>
            •
          </Text>
          <Text style={styles.item}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    card: {
      backgroundColor: theme.bgElevated,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.accentBorderMuted,
      padding: spacing.md,
      marginBottom: spacing.lg,
      gap: spacing.sm,
    },
    title: {
      color: theme.accent,
      fontSize: 17,
      fontWeight: "700",
      marginBottom: spacing.xs,
    },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
    },
    bullet: {
      color: theme.accent,
      fontSize: 16,
      lineHeight: 22,
      marginTop: 1,
    },
    item: {
      flex: 1,
      color: theme.text,
      fontSize: 15,
      lineHeight: 22,
    },
  });
}
