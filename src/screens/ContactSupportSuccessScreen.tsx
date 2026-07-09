import React, { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";

export function ContactSupportSuccessScreen() {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const onClose = useCallback(() => {
    navigation.navigate("MainTabs", { screen: "Profile" });
  }, [navigation]);

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <View style={styles.topBar}>
        <View style={styles.topBarSpacer} />
        <Pressable
          onPress={onClose}
          style={styles.closeBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
        >
          <Ionicons name="close" size={26} color={theme.text} />
        </Pressable>
      </View>

      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <View style={styles.iconCircle}>
            <Ionicons name="checkmark" size={44} color={theme.bg} />
          </View>
        </View>

        <Text style={styles.title}>{t("contact.successTitle")}</Text>
        <Text style={styles.body}>{t("contact.successBody")}</Text>

        <Pressable
          style={styles.primaryBtn}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("contact.backToProfile")}
        >
          <Text style={styles.primaryBtnText}>{t("contact.backToProfile")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.bg,
      paddingHorizontal: 24,
    },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      minHeight: 44,
    },
    topBarSpacer: {
      flex: 1,
    },
    closeBtn: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    content: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingBottom: 48,
    },
    iconWrap: {
      marginBottom: 28,
    },
    iconCircle: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: theme.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    title: {
      fontSize: 28,
      fontWeight: "700",
      color: theme.text,
      marginBottom: 16,
      textAlign: "center",
    },
    body: {
      fontSize: 16,
      lineHeight: 24,
      color: theme.textMuted,
      textAlign: "center",
      maxWidth: 340,
      marginBottom: 36,
    },
    primaryBtn: {
      minHeight: 52,
      minWidth: 240,
      borderRadius: 18,
      backgroundColor: theme.accent,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
    },
    primaryBtnText: {
      fontSize: 16,
      fontWeight: "700",
      color: theme.bg,
    },
  });
}
