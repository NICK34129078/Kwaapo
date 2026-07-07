import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";

type Props = {
  visible: boolean;
  busy?: boolean;
  trackingCode?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ShipConfirmModal({
  visible,
  busy = false,
  trackingCode,
  onCancel,
  onConfirm,
}: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const tracking = trackingCode?.trim() ?? "";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!busy) {
          onCancel();
        }
      }}
    >
      <Pressable
        style={styles.overlay}
        onPress={() => {
          if (!busy) {
            onCancel();
          }
        }}
        accessibilityRole="button"
        accessibilityLabel={t("common.cancel")}
      >
        <Pressable
          style={[
            styles.sheet,
            { marginBottom: Math.max(insets.bottom, 20) },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.iconWrap}>
            <Ionicons name="cube-outline" size={22} color={theme.accent} />
          </View>

          <Text style={styles.title}>{t("orders.shipConfirmTitle")}</Text>
          <Text style={styles.body}>{t("orders.shipConfirmBody")}</Text>

          {tracking ? (
            <View style={styles.trackingRow}>
              <Ionicons
                name="airplane-outline"
                size={14}
                color={theme.textMuted}
              />
              <Text style={styles.tracking} numberOfLines={1}>
                {t("orders.shipConfirmTracking", { code: tracking })}
              </Text>
            </View>
          ) : null}

          <Text style={styles.footnote}>{t("orders.shipConfirmFootnote")}</Text>

          <View style={styles.buttonRow}>
            <Pressable
              style={[
                styles.button,
                styles.secondaryButton,
                styles.secondaryButtonFlex,
                busy && styles.btnDisabled,
              ]}
              onPress={onCancel}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t("common.back")}
            >
              <Text style={styles.secondaryButtonText}>{t("common.back")}</Text>
            </Pressable>

            <Pressable
              style={[
                styles.button,
                styles.primaryButton,
                styles.primaryButtonFlex,
                busy && styles.btnDisabled,
              ]}
              onPress={onConfirm}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t("orders.confirmShipping")}
            >
              {busy ? (
                <ActivityIndicator size="small" color={theme.bg} />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {t("orders.shipConfirmYes")}
                </Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      justifyContent: "flex-end",
      paddingHorizontal: 16,
    },
    sheet: {
      width: "100%",
      maxWidth: 400,
      alignSelf: "center",
      borderRadius: 28,
      paddingHorizontal: 24,
      paddingTop: 24,
      paddingBottom: 24,
      backgroundColor: theme.bgElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      shadowColor: "#000",
      shadowOpacity: 0.2,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 12 },
      elevation: 14,
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "center",
      marginBottom: 16,
      backgroundColor: theme.accentSoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.accentBorder,
    },
    title: {
      color: theme.text,
      fontSize: 19,
      fontWeight: "700",
      lineHeight: 25,
      letterSpacing: -0.35,
      textAlign: "center",
      marginBottom: 10,
    },
    body: {
      color: theme.textMuted,
      fontSize: 14,
      lineHeight: 21,
      textAlign: "center",
      marginBottom: 12,
      paddingHorizontal: 4,
    },
    trackingRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      marginBottom: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: theme.bg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      alignSelf: "stretch",
    },
    tracking: {
      flex: 1,
      color: theme.text,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: "600",
    },
    footnote: {
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 17,
      textAlign: "center",
      marginBottom: 22,
      opacity: 0.9,
    },
    buttonRow: {
      flexDirection: "row",
      alignItems: "stretch",
      gap: 12,
    },
    button: {
      minHeight: 54,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 8,
    },
    secondaryButtonFlex: {
      flex: 0.42,
      paddingHorizontal: 12,
    },
    primaryButtonFlex: {
      flex: 0.58,
      paddingHorizontal: 10,
    },
    secondaryButton: {
      backgroundColor: theme.bg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    primaryButton: {
      backgroundColor: theme.accent,
    },
    secondaryButtonText: {
      color: theme.text,
      fontSize: 15,
      fontWeight: "700",
      textAlign: "center",
      lineHeight: 20,
    },
    primaryButtonText: {
      color: theme.bg,
      fontSize: 13,
      fontWeight: "800",
      textAlign: "center",
      lineHeight: 17,
      width: "100%",
    },
    btnDisabled: {
      opacity: 0.65,
    },
  });
}
