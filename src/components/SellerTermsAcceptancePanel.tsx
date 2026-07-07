import React from "react";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import {
  CURRENT_SELLER_TERMS_VERSION,
  SELLER_TERMS_ACCEPT_LABEL,
  SELLER_TERMS_SECTIONS,
} from "../constants/sellerTerms";

type Props = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  alreadyAccepted?: boolean;
};

export function SellerTermsAcceptancePanel({
  checked,
  onCheckedChange,
  alreadyAccepted = false,
}: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.wrap}>
      <Text style={styles.version}>Versie {CURRENT_SELLER_TERMS_VERSION}</Text>
      <Text style={styles.intro}>
        Lees de voorwaarden zorgvuldig. Je moet akkoord gaan voordat je
        verkoopaccount kan worden geactiveerd.
      </Text>

      {SELLER_TERMS_SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <Text style={styles.sectionBody}>{section.body}</Text>
        </View>
      ))}

      {alreadyAccepted ? (
        <View style={styles.acceptedBanner}>
          <Ionicons name="checkmark-circle" size={18} color={theme.accent} />
          <Text style={styles.acceptedText}>
            Je hebt de huidige seller-voorwaarden geaccepteerd.
          </Text>
        </View>
      ) : (
        <Pressable
          style={styles.acceptRow}
          onPress={() => onCheckedChange(!checked)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
        >
          <View style={[styles.box, checked && styles.boxChecked]}>
            {checked ? (
              <Ionicons name="checkmark" size={16} color={theme.bg} />
            ) : null}
          </View>
          <Text style={styles.acceptLabel}>{SELLER_TERMS_ACCEPT_LABEL}</Text>
        </Pressable>
      )}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    wrap: {
      gap: 0,
    },
    version: {
      color: theme.textMuted,
      fontSize: 12,
      marginBottom: 8,
    },
    intro: {
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 19,
      marginBottom: 14,
    },
    section: {
      marginBottom: 14,
    },
    sectionTitle: {
      color: theme.text,
      fontSize: 15,
      fontWeight: "700",
      marginBottom: 4,
    },
    sectionBody: {
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 19,
    },
    acceptRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      marginTop: 4,
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
    },
    box: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: theme.accentBorder,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.bg,
      marginTop: 2,
    },
    boxChecked: {
      backgroundColor: theme.accent,
      borderColor: theme.accent,
    },
    acceptLabel: {
      flex: 1,
      color: theme.text,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "600",
    },
    acceptedBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 8,
      padding: 12,
      borderRadius: 12,
      backgroundColor: theme.accentFaint,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.accentBorder,
    },
    acceptedText: {
      flex: 1,
      color: theme.text,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: "600",
    },
  });
}
