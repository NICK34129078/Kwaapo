import React, { useCallback } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useTheme } from "../context/ThemeContext";
import { useLanguage } from "../context/LanguageContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";
import { APP_LANGUAGES, type AppLocale } from "../i18n/languages";

export function LanguageSettingsScreen() {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { locale, setLocale, isRtl } = useLanguage();

  const onSelect = useCallback(
    async (next: AppLocale) => {
      if (next === locale) {
        return;
      }
      await setLocale(next);
    },
    [locale, setLocale]
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
        >
          <Ionicons
            name={isRtl ? "chevron-forward" : "chevron-back"}
            size={24}
            color={theme.text}
          />
        </Pressable>
        <Text style={styles.title}>{t("language.title")}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <Text style={styles.subtitle}>{t("language.settingsSubtitle")}</Text>

      <FlatList
        data={APP_LANGUAGES}
        keyExtractor={(item) => item.locale}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 24 },
        ]}
        renderItem={({ item }) => {
          const active = item.locale === locale;
          return (
            <Pressable
              style={styles.row}
              onPress={() => void onSelect(item.locale)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={item.nativeLabel}
            >
              <View style={styles.rowMain}>
                <Text style={styles.nativeLabel}>{item.nativeLabel}</Text>
                <Text style={styles.rowSubtitle}>{item.subtitle}</Text>
              </View>
              {active ? (
                <Ionicons name="checkmark" size={22} color={theme.accent} />
              ) : (
                <View style={styles.checkPlaceholder} />
              )}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 8,
      paddingBottom: 8,
    },
    backBtn: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    headerSpacer: {
      width: 44,
    },
    title: {
      flex: 1,
      textAlign: "center",
      fontSize: 17,
      fontWeight: "700",
      color: theme.text,
    },
    subtitle: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.textMuted,
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    listContent: {
      paddingHorizontal: 16,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 14,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: theme.bgElevated,
      marginBottom: 8,
    },
    rowMain: {
      flex: 1,
      paddingRight: 12,
    },
    nativeLabel: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.text,
    },
    rowSubtitle: {
      marginTop: 2,
      fontSize: 13,
      color: theme.textMuted,
    },
    checkPlaceholder: {
      width: 22,
    },
  });
}
