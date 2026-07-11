import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import { spacing } from "../constants/theme";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";
import { REGISTRATION_AGE_LABEL } from "../utils/registrationTermsAcceptance";

type Props = {
  acceptedTerms: boolean;
  confirmedMinimumAge: boolean;
  onAcceptedTermsChange: (value: boolean) => void;
  onConfirmedMinimumAgeChange: (value: boolean) => void;
  disabled?: boolean;
};

export function RegistrationTermsPanel({
  acceptedTerms,
  confirmedMinimumAge,
  onAcceptedTermsChange,
  onConfirmedMinimumAgeChange,
  disabled = false,
}: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<any>();

  return (
    <View style={styles.wrap}>
      <Pressable
        style={styles.row}
        onPress={disabled ? undefined : () => onAcceptedTermsChange(!acceptedTerms)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: acceptedTerms, disabled: !!disabled }}
        accessibilityLabel="Akkoord met Gebruikersvoorwaarden en Privacybeleid"
        testID="registration-terms-checkbox"
      >
        <View style={[styles.box, acceptedTerms && styles.boxChecked]}>
          {acceptedTerms ? (
            <Ionicons name="checkmark" size={16} color={theme.bg} />
          ) : null}
        </View>
        <Text style={styles.label}>
          Door een account aan te maken ga ik akkoord met de{" "}
          <Text
            style={styles.link}
            onPress={() =>
              navigation.navigate("PolicyDocument", { policyId: "terms" })
            }
            accessibilityRole="link"
          >
            Gebruikersvoorwaarden
          </Text>{" "}
          en bevestig ik dat ik het{" "}
          <Text
            style={styles.link}
            onPress={() =>
              navigation.navigate("PolicyDocument", { policyId: "privacy" })
            }
            accessibilityRole="link"
          >
            Privacybeleid
          </Text>{" "}
          heb gelezen.
        </Text>
      </Pressable>

      <Pressable
        style={styles.row}
        onPress={
          disabled ? undefined : () => onConfirmedMinimumAgeChange(!confirmedMinimumAge)
        }
        accessibilityRole="checkbox"
        accessibilityState={{ checked: confirmedMinimumAge, disabled: !!disabled }}
        accessibilityLabel={REGISTRATION_AGE_LABEL}
        testID="registration-age-checkbox"
      >
        <View style={[styles.box, confirmedMinimumAge && styles.boxChecked]}>
          {confirmedMinimumAge ? (
            <Ionicons name="checkmark" size={16} color={theme.bg} />
          ) : null}
        </View>
        <Text style={styles.label}>{REGISTRATION_AGE_LABEL}</Text>
      </Pressable>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    wrap: {
      gap: spacing.xs,
      marginBottom: spacing.md,
    },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
      minHeight: 44,
      paddingVertical: spacing.xs,
    },
    box: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.bgElevated,
      marginTop: 2,
    },
    boxChecked: {
      backgroundColor: theme.accent,
      borderColor: theme.accent,
    },
    label: {
      flex: 1,
      color: theme.textMuted,
      fontSize: 14,
      lineHeight: 20,
    },
    link: {
      color: theme.accent,
      fontWeight: "600",
      textDecorationLine: "underline",
    },
  });
}
