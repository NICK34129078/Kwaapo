import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";

type Props = {
  username: string | null | undefined;
};

function formatHandle(username: string | null | undefined): string {
  const raw = username?.trim().replace(/^@+/, "") ?? "";
  return raw.length > 0 ? `@${raw}` : "@gebruiker";
}

export function PrivateProfileEmptyState({ username }: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();
  const handle = formatHandle(username);

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Ionicons name="lock-closed-outline" size={28} color={theme.textMuted} />
        </View>
        <Text style={styles.title}>{t("privacy.privateAccountTitle")}</Text>
        <Text style={styles.body}>
          {t("privacy.privateAccountBody", { handle })}
        </Text>
      </View>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    wrap: {
      paddingHorizontal: 20,
      paddingTop: 28,
      paddingBottom: 40,
    },
    card: {
      alignItems: "center",
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      backgroundColor: theme.bgElevated,
      paddingHorizontal: 24,
      paddingVertical: 32,
      gap: 10,
    },
    iconCircle: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.bg,
      marginBottom: 4,
    },
    title: {
      fontSize: 17,
      fontWeight: "700",
      color: theme.text,
      textAlign: "center",
    },
    body: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.textMuted,
      textAlign: "center",
    },
  });
}
