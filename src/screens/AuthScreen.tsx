import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../context/AuthContext";
import { theme, spacing } from "../constants/theme";

export function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onLogin = useCallback(async () => {
    setMessage(null);
    setBusy(true);
    try {
      const { error } = await signIn(email.trim(), password);
      if (error) {
        setMessage(error.message);
      }
    } finally {
      setBusy(false);
    }
  }, [email, password, signIn]);

  const onRegister = useCallback(async () => {
    setMessage(null);
    setBusy(true);
    try {
      const { error } = await signUp(email.trim(), password);
      if (error) {
        setMessage(error.message);
      }
    } finally {
      setBusy(false);
    }
  }, [email, password, signUp]);

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top + spacing.lg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.title}>Inloggen</Text>
      <Text style={styles.subtitle}>Email en wachtwoord</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={theme.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        editable={!busy}
      />
      <TextInput
        style={styles.input}
        placeholder="Wachtwoord"
        placeholderTextColor={theme.textMuted}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        editable={!busy}
      />

      {message ? <Text style={styles.error}>{message}</Text> : null}

      <Pressable
        style={({ pressed }) => [
          styles.buttonPrimary,
          pressed && styles.pressed,
          busy && styles.disabled,
        ]}
        onPress={onLogin}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color={theme.bg} />
        ) : (
          <Text style={styles.buttonPrimaryText}>Login</Text>
        )}
      </Pressable>

      <Pressable
        style={({ pressed }) => [
          styles.buttonSecondary,
          pressed && styles.pressed,
          busy && styles.disabled,
        ]}
        onPress={onRegister}
        disabled={busy}
      >
        <Text style={styles.buttonSecondaryText}>Register</Text>
      </Pressable>

      <View style={{ height: insets.bottom + spacing.md }} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 16,
    color: theme.text,
    marginBottom: spacing.md,
    backgroundColor: theme.bgElevated,
  },
  error: {
    color: "#FF6B6B",
    marginBottom: spacing.md,
    fontSize: 14,
  },
  buttonPrimary: {
    backgroundColor: theme.accent,
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    marginBottom: spacing.sm,
  },
  buttonPrimaryText: {
    color: theme.bg,
    fontSize: 16,
    fontWeight: "600",
  },
  buttonSecondary: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    backgroundColor: theme.bgElevated,
  },
  buttonSecondaryText: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.6,
  },
});
