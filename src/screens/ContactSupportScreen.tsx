import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";
import { sendContactSupportMessage } from "../services/contactSupportService";
import {
  CONTACT_MESSAGE_MAX_WORDS,
  countContactWords,
  hasContactFieldErrors,
  trimMessageToWordLimit,
  validateContactSupportFields,
  type ContactField,
} from "../utils/contactSupportValidation";
import { getReadableErrorMessage } from "../utils/getReadableErrorMessage";

export function ContactSupportScreen() {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { isRtl } = useLanguage();
  const { user } = useAuth();

  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<ContactField, boolean>>>(
    {}
  );

  const wordCount = useMemo(() => countContactWords(message), [message]);

  const validationMessages = useMemo(
    () => ({
      emailInvalid: t("contact.errorEmailInvalid"),
      phoneRequired: t("contact.errorPhoneRequired"),
      messageTooLong: t("contact.errorMessageTooLong"),
      messageTooShort: t("contact.errorMessageTooShort"),
    }),
    [t]
  );

  const currentErrors = useMemo(
    () =>
      validateContactSupportFields(
        { email, phone, message },
        validationMessages
      ),
    [email, message, phone, validationMessages]
  );

  const canSubmit =
    !submitting &&
    !submitted &&
    !hasContactFieldErrors(currentErrors);

  const onMessageChange = useCallback((text: string) => {
    setMessage(trimMessageToWordLimit(text));
    setSubmitError(null);
  }, []);

  const markTouched = useCallback((field: ContactField) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  const showError = useCallback(
    (field: ContactField) =>
      (touched[field] || submitting) && currentErrors[field]
        ? currentErrors[field]
        : undefined,
    [currentErrors, submitting, touched]
  );

  const onSubmit = useCallback(async () => {
    if (submitting || submitted) {
      return;
    }

    setTouched({ email: true, phone: true, message: true });
    const errors = validateContactSupportFields(
      { email, phone, message },
      validationMessages
    );

    if (hasContactFieldErrors(errors)) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      await sendContactSupportMessage({ email, phone, message });
      setSubmitted(true);
      navigation.replace("ContactSupportSuccess");
    } catch (error) {
      setSubmitError(
        getReadableErrorMessage(error, t("contact.errorSubmitFailed"))
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    email,
    message,
    navigation,
    phone,
    submitted,
    submitting,
    t,
    validationMessages,
  ]);

  const chevronBack = isRtl ? "chevron-forward" : "chevron-back";

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
        >
          <Ionicons name={chevronBack} size={24} color={theme.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{t("contact.title")}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.subtitle}>{t("contact.subtitle")}</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t("contact.emailLabel")}</Text>
            <TextInput
              style={[
                styles.input,
                showError("email") ? styles.inputError : null,
              ]}
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setSubmitError(null);
              }}
              onBlur={() => markTouched("email")}
              placeholder={t("contact.emailPlaceholder")}
              placeholderTextColor={theme.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!submitting && !submitted}
              accessibilityLabel={t("contact.emailLabel")}
            />
            {showError("email") ? (
              <Text style={styles.errorText}>{showError("email")}</Text>
            ) : null}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t("contact.phoneLabel")}</Text>
            <TextInput
              style={[
                styles.input,
                showError("phone") ? styles.inputError : null,
              ]}
              value={phone}
              onChangeText={(text) => {
                setPhone(text);
                setSubmitError(null);
              }}
              onBlur={() => markTouched("phone")}
              placeholder={t("contact.phonePlaceholder")}
              placeholderTextColor={theme.textMuted}
              keyboardType="phone-pad"
              editable={!submitting && !submitted}
              accessibilityLabel={t("contact.phoneLabel")}
            />
            {showError("phone") ? (
              <Text style={styles.errorText}>{showError("phone")}</Text>
            ) : null}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t("contact.messageLabel")}</Text>
            <TextInput
              style={[
                styles.input,
                styles.messageInput,
                showError("message") ? styles.inputError : null,
              ]}
              value={message}
              onChangeText={onMessageChange}
              onBlur={() => markTouched("message")}
              placeholder={t("contact.messagePlaceholder")}
              placeholderTextColor={theme.textMuted}
              multiline
              textAlignVertical="top"
              editable={!submitting && !submitted}
              accessibilityLabel={t("contact.messageLabel")}
            />
            <Text style={styles.wordCounter}>
              {t("contact.wordCounter", {
                count: wordCount,
                max: CONTACT_MESSAGE_MAX_WORDS,
              })}
            </Text>
            {showError("message") ? (
              <Text style={styles.errorText}>{showError("message")}</Text>
            ) : null}
          </View>

          {submitError ? (
            <Text style={styles.submitError}>{submitError}</Text>
          ) : null}

          <Pressable
            style={[
              styles.submitBtn,
              !canSubmit ? styles.submitBtnDisabled : null,
            ]}
            onPress={() => void onSubmit()}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityLabel={t("contact.submit")}
            accessibilityState={{ disabled: !canSubmit, busy: submitting }}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={theme.bg} />
            ) : (
              <Ionicons name="paper-plane" size={18} color={theme.bg} />
            )}
            <Text style={styles.submitBtnText}>
              {submitting ? t("contact.submitting") : t("contact.submit")}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    flex: {
      flex: 1,
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
    headerTitle: {
      flex: 1,
      textAlign: "center",
      fontSize: 17,
      fontWeight: "700",
      color: theme.text,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 8,
    },
    subtitle: {
      fontSize: 15,
      lineHeight: 22,
      color: theme.textMuted,
      marginBottom: 24,
    },
    fieldGroup: {
      marginBottom: 20,
    },
    label: {
      fontSize: 14,
      fontWeight: "600",
      color: theme.text,
      marginBottom: 8,
    },
    input: {
      minHeight: 54,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.inputBackground,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: theme.text,
    },
    messageInput: {
      minHeight: 170,
      maxHeight: 220,
      paddingTop: 14,
      lineHeight: 22,
    },
    inputError: {
      borderColor: theme.danger,
    },
    wordCounter: {
      marginTop: 8,
      fontSize: 12,
      color: theme.textMuted,
      textAlign: "right",
    },
    errorText: {
      marginTop: 8,
      fontSize: 13,
      color: theme.danger,
      lineHeight: 18,
    },
    submitError: {
      marginBottom: 16,
      fontSize: 14,
      color: theme.danger,
      lineHeight: 20,
      textAlign: "center",
    },
    submitBtn: {
      marginTop: 8,
      minHeight: 54,
      borderRadius: 18,
      backgroundColor: theme.accent,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      paddingHorizontal: 20,
    },
    submitBtnDisabled: {
      opacity: 0.45,
    },
    submitBtnText: {
      fontSize: 16,
      fontWeight: "700",
      color: theme.bg,
    },
  });
}
