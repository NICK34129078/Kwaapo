import React from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthCredentialsForm } from "./AuthCredentialsForm";
import { spacing } from "../constants/theme";
import type { AppTheme } from "../constants/themeTokens";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";

type Props = {
  visible: boolean;
  onRequestClose: () => void;
  message?: string;
};

export function LoginRegisterModal({ visible, onRequestClose, message }: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onRequestClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onRequestClose} />
        <View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, spacing.lg),
              paddingTop: spacing.md,
            },
          ]}
        >
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Account nodig</Text>
            <Pressable
              onPress={onRequestClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Sluiten"
              hitSlop={12}
            >
              <Ionicons name="close" size={26} color={theme.text} />
            </Pressable>
          </View>
          <Text style={styles.lead}>
            {message?.trim()
              ? message
              : "Log in of maak een account om deze actie uit te voeren."}
          </Text>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <AuthCredentialsForm />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: "flex-end",
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.55)",
    },
    sheet: {
      backgroundColor: theme.bg,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: spacing.lg,
      maxHeight: "88%",
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    sheetHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.sm,
    },
    sheetTitle: {
      color: theme.text,
      fontSize: 20,
      fontWeight: "800",
    },
    closeBtn: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
    },
    lead: {
      color: theme.textMuted,
      fontSize: 15,
      lineHeight: 21,
      marginBottom: spacing.lg,
    },
    scrollContent: {
      paddingBottom: spacing.md,
    },
  });
}
