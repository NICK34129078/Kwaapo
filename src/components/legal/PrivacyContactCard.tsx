import React from "react";
import { Linking, StyleSheet, Text, View } from "react-native";

import { LEGAL_PLACEHOLDERS } from "../../constants/legalPlaceholders";
import { spacing } from "../../constants/theme";
import { useThemedStyles } from "../../hooks/useThemedStyles";
import type { AppTheme } from "../../constants/theme";
import { LegalLinkButton } from "./LegalLinkButton";

type Props = {
  onContact: () => void;
  onPrivacyRequest: () => void;
  onDeleteAccount: () => void;
  onTerms: () => void;
  onCommunity: () => void;
};

const P = LEGAL_PLACEHOLDERS;

export function PrivacyContactCard({
  onContact,
  onPrivacyRequest,
  onDeleteAccount,
  onTerms,
  onCommunity,
}: Props) {
  const styles = useThemedStyles(createStyles);

  const openAp = () => {
    void Linking.openURL("https://autoriteitpersoonsgegevens.nl");
  };

  return (
    <View style={styles.wrap} testID="privacy-contact-card">
      <Text style={styles.title} accessibilityRole="header">
        Contact
      </Text>
      <View style={styles.infoCard}>
        <Text style={styles.line}>{P.LEGAL_NAME}</Text>
        <Text style={styles.lineMuted}>{P.TRADE_NAME}</Text>
        <Text style={styles.lineMuted}>{P.ADDRESS}</Text>
        <Text style={styles.lineMuted}>KvK: {P.KVK}</Text>
        <Text style={styles.line}>Privacy: {P.PRIVACY_EMAIL}</Text>
        <Text style={styles.line}>Contact: {P.CONTACT_EMAIL}</Text>
        <Text style={styles.lineMuted}>FG/DPO: {P.DPO}</Text>
      </View>

      <LegalLinkButton
        label="Neem contact op"
        onPress={onContact}
        testID="privacy-contact-button"
      />
      <LegalLinkButton
        label="Dien een privacyverzoek in"
        onPress={onPrivacyRequest}
      />
      <LegalLinkButton
        label="Account verwijderen"
        onPress={onDeleteAccount}
        testID="privacy-delete-account-button"
      />
      <LegalLinkButton label="Bekijk gebruikersvoorwaarden" onPress={onTerms} />
      <LegalLinkButton
        label="Bekijk communityrichtlijnen"
        onPress={onCommunity}
      />
      <LegalLinkButton
        label="Autoriteit Persoonsgegevens"
        onPress={openAp}
      />
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    wrap: {
      marginBottom: spacing.xl,
    },
    title: {
      color: theme.text,
      fontSize: 17,
      fontWeight: "700",
      marginBottom: spacing.sm,
    },
    infoCard: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      borderRadius: 12,
      padding: spacing.md,
      marginBottom: spacing.md,
      backgroundColor: theme.bgElevated,
      gap: 4,
    },
    line: {
      color: theme.text,
      fontSize: 15,
      lineHeight: 22,
      flexShrink: 1,
    },
    lineMuted: {
      color: theme.textMuted,
      fontSize: 14,
      lineHeight: 20,
      flexShrink: 1,
    },
  });
}
