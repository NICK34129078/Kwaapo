import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { spacing } from "../../constants/theme";
import { useThemedStyles } from "../../hooks/useThemedStyles";
import type { AppTheme } from "../../constants/theme";

type Row = {
  category: string;
  period: string;
  note: string;
};

type Props = {
  rows: Row[];
  testID?: string;
};

export function PrivacyDataTable({ rows, testID }: Props) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.wrap} testID={testID ?? "privacy-retention-table"}>
      <Text style={styles.caption} accessibilityRole="header">
        Bewaartermijnen per categorie
      </Text>
      {rows.map((row) => (
        <View key={row.category} style={styles.card}>
          <Text style={styles.category}>{row.category}</Text>
          <Text style={styles.period}>
            <Text style={styles.label}>Termijn: </Text>
            {row.period}
          </Text>
          <Text style={styles.note}>{row.note}</Text>
        </View>
      ))}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    wrap: {
      marginBottom: spacing.lg,
      gap: spacing.sm,
    },
    caption: {
      color: theme.text,
      fontSize: 17,
      fontWeight: "700",
      marginBottom: spacing.xs,
    },
    card: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      borderRadius: 12,
      padding: spacing.md,
      backgroundColor: theme.bgElevated,
    },
    category: {
      color: theme.text,
      fontSize: 15,
      fontWeight: "700",
      marginBottom: spacing.xs,
      flexShrink: 1,
    },
    period: {
      color: theme.textMuted,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: spacing.xs,
      flexShrink: 1,
    },
    label: {
      fontWeight: "600",
      color: theme.text,
    },
    note: {
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 18,
      flexShrink: 1,
    },
  });
}
