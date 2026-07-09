import React from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";

export type SettingsRowIconVariant = "default" | "danger" | "accent";

type Props = {
  name: React.ComponentProps<typeof Ionicons>["name"];
  variant?: SettingsRowIconVariant;
};

export function SettingsRowIcon({ name, variant = "default" }: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  const iconColor =
    variant === "danger"
      ? theme.danger
      : variant === "accent"
        ? theme.accentText
        : theme.textMuted;

  return (
    <View
      style={[
        styles.wrap,
        variant === "danger" ? styles.wrapDanger : null,
        variant === "accent" ? styles.wrapAccent : null,
      ]}
    >
      <Ionicons name={name} size={20} color={iconColor} />
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    wrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.accentFaint,
      flexShrink: 0,
    },
    wrapDanger: {
      backgroundColor: "rgba(255, 138, 132, 0.12)",
    },
    wrapAccent: {
      backgroundColor: theme.accentSoft,
    },
  });
}
