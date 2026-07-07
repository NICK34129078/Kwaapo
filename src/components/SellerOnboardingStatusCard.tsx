import React from "react";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  getSellerOnboardingDashboardLines,
  getSellerStatusCardContent,
  resolveSellerDashboardUI,
} from "../services/sellerOnboardingService";
import type { SellerOnboarding } from "../types/sellerOnboarding";

type Props = {
  onboarding: SellerOnboarding;
  onPress: () => void;
};

export function SellerOnboardingStatusCard({ onboarding, onPress }: Props) {
  const { theme } = useTheme();

  const styles = useThemedStyles(createStyles);

  const content = getSellerStatusCardContent(onboarding);
  const dashboard = resolveSellerDashboardUI(onboarding);
  const dashboardLines = getSellerOnboardingDashboardLines(onboarding);

  const toneStyles =
    content.tone === "success"
      ? styles.cardSuccess
      : content.tone === "danger"
        ? styles.cardDanger
        : content.tone === "warning"
          ? styles.cardWarning
          : styles.cardDefault;

  const iconName =
    content.tone === "success"
      ? "checkmark-circle"
      : content.tone === "danger"
        ? "alert-circle"
        : content.tone === "warning"
          ? "time"
          : "storefront-outline";

  return (
    <Pressable
      style={[styles.card, toneStyles]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={content.buttonLabel}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={iconName} size={24} color={theme.accent} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{content.title}</Text>
        <Text style={styles.message}>{content.message}</Text>
        {dashboardLines.map((line) => (
          <Text key={line} style={styles.statusLine}>
            {line}
          </Text>
        ))}
        <Text style={styles.cta}>{dashboard.buttonLabel} →</Text>
      </View>
    </Pressable>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardDefault: {
    backgroundColor: theme.bgElevated,
    borderColor: theme.border,
  },
  cardSuccess: {
    backgroundColor: theme.accentLight,
    borderColor: theme.accentBorderStrong,
  },
  cardWarning: {
    backgroundColor: "rgba(255, 193, 7, 0.08)",
    borderColor: "rgba(255, 193, 7, 0.35)",
  },
  cardDanger: {
    backgroundColor: "rgba(255, 80, 80, 0.1)",
    borderColor: "rgba(255, 80, 80, 0.35)",
  },
  iconWrap: {
    width: 40,
    alignItems: "center",
    paddingTop: 2,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 6,
  },
  message: {
    color: theme.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  statusLine: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 6,
    lineHeight: 17,
  },
  cta: {
    color: theme.accent,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 10,
  },
});
}

