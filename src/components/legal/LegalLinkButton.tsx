import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { spacing } from "../../constants/theme";
import { useThemedStyles } from "../../hooks/useThemedStyles";
import type { AppTheme } from "../../constants/theme";

type Props = {
  label: string;
  onPress: () => void;
  testID?: string;
};

export function LegalLinkButton({ label, onPress, testID }: Props) {
  const styles = useThemedStyles(createStyles);

  return (
    <Pressable
      style={styles.btn}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    btn: {
      minHeight: 44,
      justifyContent: "center",
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: 12,
      backgroundColor: theme.accentFaint,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.accentBorderMuted,
      marginBottom: spacing.sm,
    },
    label: {
      color: theme.accent,
      fontSize: 15,
      fontWeight: "600",
      textAlign: "center",
    },
  });
}
