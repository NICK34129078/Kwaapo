import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { spacing } from "../../constants/theme";
import { useThemedStyles } from "../../hooks/useThemedStyles";
import type { AppTheme } from "../../constants/theme";

type Props = {
  title: string;
  body: string;
};

export function LegalNotice({ title, body }: Props) {
  const styles = useThemedStyles(createStyles);

  return (
    <View
      style={styles.card}
      accessibilityRole="text"
      accessibilityLabel={`${title}. ${body}`}
    >
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    card: {
      backgroundColor: theme.bgElevated,
      borderLeftWidth: 3,
      borderLeftColor: theme.warning,
      borderRadius: 10,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    title: {
      color: theme.text,
      fontSize: 15,
      fontWeight: "700",
      marginBottom: spacing.xs,
    },
    body: {
      color: theme.textMuted,
      fontSize: 15,
      lineHeight: 22,
    },
  });
}
