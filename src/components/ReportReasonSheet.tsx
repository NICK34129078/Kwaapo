import React, { useCallback } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { AppTheme } from "../constants/themeTokens";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import {
  REPORT_REASONS,
  type ReportReason,
} from "../services/feedModerationService";
import type { ModerationReasonOption } from "../constants/moderationReasons";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  busy?: boolean;
  title?: string;
  subtitle?: string;
  reasons?: readonly ModerationReasonOption[];
};

export function ReportReasonSheet({
  visible,
  onClose,
  onSubmit,
  busy = false,
  title = "Waarom meld je dit?",
  subtitle = "Je melding is anoniem voor de maker.",
  reasons = REPORT_REASONS,
}: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();

  const fireHaptic = useCallback(() => {
    if (Platform.OS === "web") {
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  const handleSelect = useCallback(
    (reason: string) => {
      if (busy) {
        return;
      }
      fireHaptic();
      onClose();
      onSubmit(reason);
    },
    [busy, fireHaptic, onClose, onSubmit]
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Sluit melden"
        />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={styles.grabber} />
          <Text style={styles.sheetTitle}>{title}</Text>
          <Text style={styles.sheetSubtitle}>{subtitle}</Text>
          {reasons.map((reason, index) => (
            <View key={reason.id}>
              {index > 0 ? <View style={styles.separator} /> : null}
              <Pressable
                onPress={() => handleSelect(reason.id)}
                disabled={busy}
                style={({ pressed }) => [
                  styles.row,
                  pressed && !busy && styles.rowPressed,
                  busy && styles.rowDisabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel={reason.label}
                accessibilityState={{ disabled: busy }}
              >
                <Ionicons
                  name="flag-outline"
                  size={22}
                  color={theme.text}
                />
                <Text style={styles.rowLabel}>{reason.label}</Text>
              </Pressable>
            </View>
          ))}
          <View style={styles.cancelGap} />
          <Pressable
            onPress={() => {
              fireHaptic();
              onClose();
            }}
            style={({ pressed }) => [
              styles.cancelBtn,
              pressed && styles.rowPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Annuleren"
          >
            <Text style={styles.cancelLabel}>Annuleren</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: theme.overlay,
    },
    sheet: {
      backgroundColor: theme.bgElevated,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 8,
      paddingHorizontal: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    grabber: {
      alignSelf: "center",
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: "rgba(255,255,255,0.22)",
      marginBottom: 12,
    },
    sheetTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: "700",
      textAlign: "center",
      marginBottom: 4,
    },
    sheetSubtitle: {
      color: theme.textMuted,
      fontSize: 13,
      textAlign: "center",
      marginBottom: 8,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      minHeight: 56,
      paddingHorizontal: 8,
      borderRadius: 12,
    },
    rowPressed: {
      backgroundColor: theme.accentFaint,
    },
    rowDisabled: {
      opacity: 0.45,
    },
    rowLabel: {
      flex: 1,
      fontSize: 16,
      fontWeight: "500",
      color: theme.text,
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.border,
      marginHorizontal: 8,
    },
    cancelGap: {
      height: 8,
    },
    cancelBtn: {
      minHeight: 52,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.bg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      marginBottom: 4,
    },
    cancelLabel: {
      color: theme.text,
      fontSize: 16,
      fontWeight: "600",
    },
  });
}
