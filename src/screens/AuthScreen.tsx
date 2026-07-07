import React from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthCredentialsForm } from "../components/AuthCredentialsForm";
import { spacing } from "../constants/theme";
import type { AppTheme } from "../constants/themeTokens";
import { useThemedStyles } from "../hooks/useThemedStyles";

/** Volledig scherm inloggen (o.a. voor tests of diepe links); de app gebruikt het gastpad + modal. */
export function AuthScreen() {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top + spacing.lg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.title}>Inloggen</Text>
      <Text style={styles.subtitle}>E-mail en wachtwoord</Text>

      <AuthCredentialsForm />

      <View style={{ height: insets.bottom + spacing.md }} />
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.bg,
      paddingHorizontal: spacing.lg,
    },
    title: {
      fontSize: 28,
      fontWeight: "700",
      color: theme.text,
      marginBottom: spacing.xs,
    },
    subtitle: {
      fontSize: 15,
      color: theme.textMuted,
      marginBottom: spacing.xl,
    },
  });
}
