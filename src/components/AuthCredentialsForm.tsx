import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "../context/AuthContext";
import { PASSWORD_RESET_REDIRECT_URL, logPasswordResetRedirectUrl } from "../constants/authLinks";
import { supabase } from "../lib/supabase";
import { spacing } from "../constants/theme";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";

type PendingAction = "none" | "login" | "register" | "reset";
const USERNAME_MAX_LENGTH = 30;

function isValidEmailFormat(email: string): boolean {
  const t = email.trim();
  if (t.length < 3) {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

export function AuthCredentialsForm() {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [pending, setPending] = useState<PendingAction>("none");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const busy = pending !== "none";

  const cleanUsername = username.trim().replace(/^@+/, "").toLowerCase();

  const onForgotPassword = useCallback(async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    const em = email.trim();
    if (!em) {
      setErrorMessage("Vul je e-mailadres in om je wachtwoord te resetten.");
      return;
    }
    if (!isValidEmailFormat(em)) {
      setErrorMessage("Voer een geldig e-mailadres in.");
      return;
    }
    setPending("reset");
    try {
      logPasswordResetRedirectUrl("Auth reset request");
      const { error } = await supabase.auth.resetPasswordForEmail(em, {
        redirectTo: PASSWORD_RESET_REDIRECT_URL,
      });
      if (error) {
        setErrorMessage(error.message);
        return;
      }
      setSuccessMessage(
        "Als dit e-mailadres bij ons bekend is, ontvang je binnen enkele minuten een resetlink."
      );
    } finally {
      setPending("none");
    }
  }, [email]);

  const onLogin = useCallback(async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    const em = email.trim();
    if (!em) {
      setErrorMessage("Vul je e-mailadres in.");
      return;
    }
    if (!isValidEmailFormat(em)) {
      setErrorMessage("Voer een geldig e-mailadres in.");
      return;
    }
    if (!password) {
      setErrorMessage("Vul je wachtwoord in.");
      return;
    }
    setPending("login");
    try {
      const { error } = await signIn(em, password);
      if (error) {
        setErrorMessage(error.message);
      }
    } finally {
      setPending("none");
    }
  }, [email, password, signIn]);

  const onRegister = useCallback(async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    const em = email.trim();
    if (!em) {
      setErrorMessage("Vul je e-mailadres in.");
      return;
    }
    if (!isValidEmailFormat(em)) {
      setErrorMessage("Voer een geldig e-mailadres in.");
      return;
    }
    if (!password) {
      setErrorMessage("Kies een wachtwoord.");
      return;
    }
    if (password.length < 6) {
      setErrorMessage("Wachtwoord moet minimaal 6 tekens zijn.");
      return;
    }
    if (!cleanUsername) {
      setErrorMessage("Vul een accountnaam in.");
      return;
    }
    if (cleanUsername.length < 3) {
      setErrorMessage("Accountnaam moet minimaal 3 tekens zijn.");
      return;
    }
    if (cleanUsername.length > USERNAME_MAX_LENGTH) {
      setErrorMessage(`Accountnaam mag maximaal ${USERNAME_MAX_LENGTH} tekens zijn.`);
      return;
    }
    if (!/^[a-z0-9_]+$/.test(cleanUsername)) {
      setErrorMessage("Gebruik alleen letters, cijfers en underscore (_).");
      return;
    }
    setPending("register");
    try {
      const { data: existingUsername, error: existingUsernameError } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", cleanUsername)
        .maybeSingle();

      if (existingUsernameError && existingUsernameError.code !== "PGRST116") {
        setErrorMessage(existingUsernameError.message);
        return;
      }
      if (existingUsername) {
        setErrorMessage("Deze accountnaam is al in gebruik.");
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: em,
        password,
        options: {
          data: {
            username: cleanUsername,
          },
        },
      });

      if (error) {
        if (error.code === "23505") {
          setErrorMessage("Deze accountnaam is al in gebruik.");
          return;
        }
        setErrorMessage(error.message);
        return;
      }

      const userId = data.user?.id ?? null;
      if (userId) {
        const { error: updateProfileError } = await supabase
          .from("profiles")
          .update({ username: cleanUsername })
          .eq("id", userId);

        if (updateProfileError) {
          if (updateProfileError.code === "23505") {
            setErrorMessage("Deze accountnaam is al in gebruik.");
            return;
          }
          setErrorMessage(updateProfileError.message);
          return;
        }
      }

      const needsEmailConfirmation = data.session == null && data.user != null;
      if (needsEmailConfirmation) {
        setSuccessMessage("Check je e-mail om je account te bevestigen.");
      }
    } finally {
      setPending("none");
    }
  }, [cleanUsername, email, password]);

  return (
    <View>
      <TextInput
        style={styles.input}
        placeholder="E-mail"
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
      <TextInput
        style={styles.input}
        placeholder="Accountnaam"
        placeholderTextColor={theme.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        value={username}
        onChangeText={setUsername}
        editable={!busy}
        maxLength={USERNAME_MAX_LENGTH + 1}
      />

      {successMessage ? (
        <Text style={styles.success}>{successMessage}</Text>
      ) : null}
      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

      <Pressable
        style={({ pressed }) => [styles.forgotLink, pressed && styles.pressed]}
        onPress={() => void onForgotPassword()}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Wachtwoord vergeten"
      >
        {pending === "reset" ? (
          <ActivityIndicator size="small" color={theme.accent} />
        ) : (
          <Text style={styles.forgotLinkText}>Wachtwoord vergeten?</Text>
        )}
      </Pressable>

      <Pressable
        style={({ pressed }) => [
          styles.buttonPrimary,
          pressed && styles.pressed,
          busy && styles.disabled,
        ]}
        onPress={onLogin}
        disabled={busy}
      >
        {pending === "login" ? (
          <ActivityIndicator color={theme.bg} />
        ) : (
          <Text style={styles.buttonPrimaryText}>Inloggen</Text>
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
        {pending === "register" ? (
          <ActivityIndicator color={theme.text} />
        ) : (
          <Text style={styles.buttonSecondaryText}>Account maken</Text>
        )}
      </Pressable>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
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
  success: {
    color: theme.accent,
    marginBottom: spacing.md,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
  },
  error: {
    color: "#FF6B6B",
    marginBottom: spacing.md,
    fontSize: 14,
    lineHeight: 20,
  },
  forgotLink: {
    alignSelf: "flex-start",
    marginBottom: spacing.md,
    minHeight: 32,
    justifyContent: "center",
  },
  forgotLinkText: {
    color: theme.accent,
    fontSize: 14,
    fontWeight: "600",
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
}

