import React from "react";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextStyle,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SellerMascotDance } from "./SellerMascotDance";

type SellerActionRequiredCardProps = {
  actionCount: number;
  onPress: () => void;
  compact?: boolean;
};

/** Wit met dunne zwarte rand — leesbaar op pastelblauw én over video. */
function outlinedText(size: "kicker" | "title" | "body" | "hint"): TextStyle {
  const base: TextStyle = {
    color: "#FFFFFF",
    textShadowColor: "#000000",
    textShadowOffset: { width: 0, height: 0 },
    ...(Platform.OS === "android" ? { includeFontPadding: false } : null),
  };

  switch (size) {
    case "kicker":
      return {
        ...base,
        fontSize: 11,
        fontWeight: "900",
        letterSpacing: 0.7,
        textTransform: "uppercase",
        textShadowRadius: 2,
      };
    case "title":
      return {
        ...base,
        fontSize: 18,
        fontWeight: "900",
        lineHeight: 22,
        textShadowRadius: 3.5,
      };
    case "body":
      return {
        ...base,
        fontSize: 14,
        lineHeight: 20,
        fontWeight: "700",
        textShadowRadius: 2.5,
      };
    case "hint":
      return {
        ...base,
        fontSize: 13,
        lineHeight: 18,
        fontWeight: "600",
        textShadowRadius: 2,
      };
  }
}

export function SellerActionRequiredCard({
  actionCount,
  onPress,
  compact = false,
}: SellerActionRequiredCardProps) {
  const styles = useThemedStyles(createStyles);

  if (actionCount <= 0) {
    return null;
  }

  const title =
    actionCount === 1
      ? "Nieuwe bestelling ontvangen"
      : "Actie vereist";

  const body =
    actionCount === 1
      ? "Er staat 1 betaalde bestelling klaar om te verzenden."
      : `Je hebt ${actionCount} bestellingen klaar om te verzenden.`;

  const ctaLabel =
    actionCount === 1 ? "Bestelling bekijken" : "Bestellingen bekijken";

  return (
    <Pressable
      style={[styles.card, compact && styles.cardCompact]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
    >
      <View style={styles.mascotWrap}>
        <SellerMascotDance size={58} />
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={outlinedText("kicker")}>Actie vereist</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>
              {actionCount > 99 ? "99+" : actionCount}
            </Text>
          </View>
        </View>
        <Text style={outlinedText("title")}>{title}</Text>
        <Text style={outlinedText("body")}>{body}</Text>
        <Text style={outlinedText("hint")}>
          Controleer elk pakket zorgvuldig en verzend het naar het juiste adres.
        </Text>
        <View style={styles.ctaPill}>
          <Text style={styles.ctaText}>{ctaLabel}</Text>
          <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
        </View>
      </View>
    </Pressable>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: 14,
    padding: 16,
    borderRadius: 16,
    backgroundColor: theme.accent,
    borderWidth: 2,
    borderColor: "rgba(0,0,0,0.35)",
    marginBottom: 14,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
    }),
  },
  cardCompact: {
    marginHorizontal: 16,
    marginTop: 8,
  },
  mascotWrap: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "visible",
  },
  body: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  countBadge: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 13,
    backgroundColor: theme.bg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  countBadgeText: {
    color: theme.accent,
    fontSize: 13,
    fontWeight: "900",
  },
  ctaPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: theme.bg,
  },
  ctaText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
});
}

