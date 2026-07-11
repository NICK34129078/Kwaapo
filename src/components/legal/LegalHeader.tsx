import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { spacing } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { useThemedStyles } from "../../hooks/useThemedStyles";
import type { AppTheme } from "../../constants/theme";

type Props = {
  title: string;
  subtitle: string;
  effectiveDate: string;
  version: string;
  testID?: string;
};

export function LegalHeader({
  title,
  subtitle,
  effectiveDate,
  version,
  testID = "terms-header",
}: Props) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.wrap} testID={testID} accessibilityRole="header">
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <View style={styles.metaRow}>
        <Text style={styles.meta}>Laatst bijgewerkt: {effectiveDate}</Text>
        <Text style={styles.meta}>Versie: {version}</Text>
      </View>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    wrap: {
      marginBottom: spacing.lg,
    },
    title: {
      color: theme.text,
      fontSize: 28,
      fontWeight: "800",
      lineHeight: 34,
      marginBottom: spacing.xs,
    },
    subtitle: {
      color: theme.textMuted,
      fontSize: 16,
      lineHeight: 24,
      marginBottom: spacing.md,
    },
    metaRow: {
      gap: 4,
    },
    meta: {
      color: theme.textMuted,
      fontSize: 14,
      lineHeight: 20,
    },
  });
}
