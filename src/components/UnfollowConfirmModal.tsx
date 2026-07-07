import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";

type Props = {
  visible: boolean;
  username: string | null | undefined;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function formatUsername(username: string | null | undefined): string {
  const raw = username?.trim().replace(/^@+/, "") ?? "";
  return raw.length > 0 ? `@${raw}` : "@gebruiker";
}

export function UnfollowConfirmModal({
  visible,
  username,
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const handle = formatUsername(username);

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
          style={[styles.card, { marginBottom: Math.max(insets.bottom, 16) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={styles.title}>{t("profile.unfollowConfirmTitle")}</Text>
          <Text style={styles.message}>
            {t("profile.unfollowConfirmMessage", { username: handle.replace(/^@/, "") })}
          </Text>

          <View style={styles.actions}>
            <Pressable
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t("common.cancel")}
            >
              <Text style={styles.cancelButtonText}>{t("common.cancel")}</Text>
            </Pressable>

            <Pressable
              style={[styles.button, styles.confirmButton, busy && styles.buttonDisabled]}
              onPress={onConfirm}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t("profile.unfollowConfirmAction")}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmButtonText}>
                  {t("profile.unfollowConfirmAction")}
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
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 28,
    },
    card: {
      width: "100%",
      maxWidth: 340,
      backgroundColor: theme.bgElevated,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      paddingHorizontal: 22,
      paddingTop: 22,
      paddingBottom: 18,
    },
    title: {
      color: theme.text,
      fontSize: 18,
      fontWeight: "800",
      textAlign: "center",
      marginBottom: 8,
    },
    message: {
      color: theme.textMuted,
      fontSize: 15,
      lineHeight: 21,
      textAlign: "center",
      marginBottom: 20,
    },
    actions: {
      flexDirection: "row",
      gap: 10,
    },
    button: {
      flex: 1,
      minHeight: 44,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 12,
    },
    cancelButton: {
      backgroundColor: theme.bg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    confirmButton: {
      backgroundColor: "rgba(255, 59, 48, 0.88)",
    },
    buttonDisabled: {
      opacity: 0.75,
    },
    cancelButtonText: {
      color: theme.text,
      fontSize: 15,
      fontWeight: "700",
    },
    confirmButtonText: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "700",
    },
  });
}
