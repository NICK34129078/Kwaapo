import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useThemedStyles } from "../../hooks/useThemedStyles";
import type { AppTheme } from "../../constants/theme";

export type OrderStatusBadgeTone = "muted" | "accent" | "success" | "danger";

type Props = {
  label: string;
  tone?: OrderStatusBadgeTone;
};

export function OrderStatusBadge({ label, tone = "muted" }: Props) {
  const styles = useThemedStyles(createStyles);

  return (
    <View
      style={[
        styles.badge,
        tone === "accent" && styles.badgeAccent,
        tone === "success" && styles.badgeSuccess,
        tone === "danger" && styles.badgeDanger,
        tone === "muted" && styles.badgeMuted,
      ]}
    >
      <Text
        style={[
          styles.text,
          tone === "accent" && styles.textAccent,
          tone === "success" && styles.textSuccess,
          tone === "danger" && styles.textDanger,
          tone === "muted" && styles.textMuted,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    badge: {
      alignSelf: "flex-start",
      maxWidth: "100%",
      paddingHorizontal: 7,
      paddingVertical: Platform.OS === "android" ? 3 : 4,
      borderRadius: 6,
      borderWidth: StyleSheet.hairlineWidth,
    },
    badgeAccent: {
      backgroundColor: theme.accentMedium,
      borderColor: theme.accentBorder,
    },
    badgeSuccess: {
      backgroundColor: "rgba(120, 220, 160, 0.12)",
      borderColor: "rgba(120, 220, 160, 0.32)",
    },
    badgeDanger: {
      backgroundColor: "rgba(255, 120, 120, 0.1)",
      borderColor: "rgba(255, 120, 120, 0.32)",
    },
    badgeMuted: {
      backgroundColor: theme.bg,
      borderColor: theme.border,
    },
    text: {
      fontSize: 11,
      fontWeight: "600",
      lineHeight: 14,
      letterSpacing: 0.1,
      ...(Platform.OS === "android" ? { includeFontPadding: false } : null),
    },
    textAccent: {
      color: theme.accent,
    },
    textSuccess: {
      color: "#8CE4B0",
    },
    textDanger: {
      color: "#FF9B9B",
    },
    textMuted: {
      color: theme.textMuted,
    },
  });
}
