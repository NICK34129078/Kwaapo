import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../context/AuthContext";
import { spacing } from "../constants/theme";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";
import { validatePasswordResetForm } from "../utils/passwordResetValidation";

export function ResetPasswordScreen() {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const {
    session,
    loading,
    passwordRecoveryPending,
    completePasswordReset,
    clearPasswordRecoveryPending,
  } = useAuth();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    password?: string;
    confirmPassword?: string;
  }>({});
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  const onSubmit = useCallback(async () => {
    const errors = validatePasswordResetForm(password, confirmPassword);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await completePasswordReset(password);
      if (error) {
        Alert.alert("Wachtwoord wijzigen mislukt", error.message);
        return;
      }
      setCompleted(true);
      Alert.alert(
        "Wachtwoord gewijzigd",
        "Je wachtwoord is bijgewerkt. Log opnieuw in met je nieuwe wachtwoord.",
        [
          {
            text: "Naar inloggen",
            onPress: () => {
              clearPasswordRecoveryPending();
              navigation.reset({
                index: 0,
                routes: [{ name: "MainTabs" }],
              });
            },
          },
        ]
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    clearPasswordRecoveryPending,
    completePasswordReset,
    confirmPassword,
    navigation,
    password,
  ]);

  const onClose = useCallback(() => {
    clearPasswordRecoveryPending();
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.reset({
      index: 0,
      routes: [{ name: "MainTabs" }],
    });
  }, [clearPasswordRecoveryPending, navigation]);

  if (!loading && !session && !passwordRecoveryPending) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.title}>Link verlopen</Text>
        <Text style={styles.lead}>
          Deze resetlink is ongeldig of verlopen. Vraag een nieuwe link aan via
          Wachtwoord vergeten.
        </Text>
        <Pressable style={styles.primaryBtn} onPress={onClose}>
          <Text style={styles.primaryBtnText}>Terug naar app</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top + 12 }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.topBar}>
        <Pressable
          onPress={onClose}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Sluiten"
          hitSlop={10}
        >
          <Ionicons name="close" size={26} color={theme.text} />
        </Pressable>
        <Text style={styles.screenTitle}>Nieuw wachtwoord</Text>
        <View style={styles.topBarSide} />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.lead}>
          Kies een nieuw wachtwoord voor je account. Daarna kun je opnieuw
          inloggen.
        </Text>

        <Text style={styles.label}>Nieuw wachtwoord</Text>
        <TextInput
          style={[styles.input, fieldErrors.password ? styles.inputError : null]}
          placeholder="Minimaal 6 tekens"
          placeholderTextColor={theme.textMuted}
          secureTextEntry
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            setFieldErrors((prev) => ({ ...prev, password: undefined }));
          }}
          editable={!submitting && !completed}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
        />
        {fieldErrors.password ? (
          <Text style={styles.fieldError}>{fieldErrors.password}</Text>
        ) : null}

        <Text style={styles.label}>Herhaal wachtwoord</Text>
        <TextInput
          style={[
            styles.input,
            fieldErrors.confirmPassword ? styles.inputError : null,
          ]}
          placeholder="Herhaal je wachtwoord"
          placeholderTextColor={theme.textMuted}
          secureTextEntry
          value={confirmPassword}
          onChangeText={(text) => {
            setConfirmPassword(text);
            setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }));
          }}
          editable={!submitting && !completed}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
        />
        {fieldErrors.confirmPassword ? (
          <Text style={styles.fieldError}>{fieldErrors.confirmPassword}</Text>
        ) : null}

        <Pressable
          style={[styles.primaryBtn, (submitting || completed) && styles.disabled]}
          onPress={() => void onSubmit()}
          disabled={submitting || completed}
          accessibilityRole="button"
          accessibilityLabel="Wachtwoord opslaan"
        >
          {submitting ? (
            <ActivityIndicator color={theme.bg} />
          ) : (
            <Text style={styles.primaryBtnText}>Wachtwoord opslaan</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  backBtn: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarSide: {
    width: 42,
  },
  screenTitle: {
    flex: 1,
    textAlign: "center",
    color: theme.text,
    fontSize: 17,
    fontWeight: "800",
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
  },
  title: {
    color: theme.text,
    fontSize: 24,
    fontWeight: "800",
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  lead: {
    color: theme.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  label: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 16,
    color: theme.text,
    marginBottom: spacing.sm,
    backgroundColor: theme.bgElevated,
  },
  inputError: {
    borderColor: "#FF6B6B",
  },
  fieldError: {
    color: "#FF6B6B",
    fontSize: 13,
    marginBottom: spacing.md,
  },
  primaryBtn: {
    marginTop: spacing.md,
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: theme.bg,
    fontSize: 16,
    fontWeight: "800",
  },
  disabled: {
    opacity: 0.6,
  },
});
}

