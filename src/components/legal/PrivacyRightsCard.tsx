import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { spacing } from "../../constants/theme";
import { useThemedStyles } from "../../hooks/useThemedStyles";
import type { AppTheme } from "../../constants/theme";
import { LegalLinkButton } from "./LegalLinkButton";

type Action = {
  label: string;
  onPress: () => void;
  testID?: string;
  hint?: string;
};

type Props = {
  actions: Action[];
};

export function PrivacyRightsCard({ actions }: Props) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.wrap} testID="privacy-rights-card">
      <Text style={styles.title} accessibilityRole="header">
        Jouw privacy acties
      </Text>
      {actions.map((action) => (
        <View key={action.label} style={styles.row}>
          <LegalLinkButton
            label={action.label}
            onPress={action.onPress}
            testID={action.testID}
          />
          {action.hint ? <Text style={styles.hint}>{action.hint}</Text> : null}
        </View>
      ))}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    wrap: {
      marginBottom: spacing.lg,
      gap: spacing.xs,
    },
    title: {
      color: theme.text,
      fontSize: 17,
      fontWeight: "700",
      marginBottom: spacing.sm,
    },
    row: {
      marginBottom: spacing.xs,
    },
    hint: {
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 2,
      marginLeft: 4,
    },
  });
}
