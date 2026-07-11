import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { spacing } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { useThemedStyles } from "../../hooks/useThemedStyles";
import type { AppTheme } from "../../constants/theme";

export type TocItem = {
  id: string;
  number: number;
  title: string;
};

type Props = {
  items: TocItem[];
  expanded: boolean;
  activeId: string | null;
  onToggleExpanded: () => void;
  onSelect: (id: string) => void;
  testID?: string;
};

export function LegalTableOfContents({
  items,
  expanded,
  activeId,
  onToggleExpanded,
  onSelect,
  testID = "terms-toc",
}: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.wrap} testID={testID}>
      <Pressable
        style={styles.toggle}
        onPress={onToggleExpanded}
        accessibilityRole="button"
        accessibilityLabel={
          expanded ? "Inhoudsopgave inklappen" : "Inhoudsopgave uitklappen"
        }
        accessibilityState={{ expanded }}
      >
        <Text style={styles.toggleTitle}>Inhoudsopgave</Text>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={20}
          color={theme.text}
        />
      </Pressable>

      {expanded ? (
        <View style={styles.list}>
          {items.map((item) => {
            const active = item.id === activeId;
            return (
              <Pressable
                key={item.id}
                style={[styles.item, active && styles.itemActive]}
                onPress={() => onSelect(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`Hoofdstuk ${item.number}: ${item.title}`}
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.itemNumber, active && styles.itemTextActive]}>
                  {item.number}.
                </Text>
                <Text style={[styles.itemTitle, active && styles.itemTextActive]}>
                  {item.title}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    wrap: {
      marginBottom: spacing.lg,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      backgroundColor: theme.bgElevated,
      overflow: "hidden",
    },
    toggle: {
      minHeight: 48,
      paddingHorizontal: spacing.md,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    toggleTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: "700",
    },
    list: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
      paddingVertical: spacing.xs,
    },
    item: {
      minHeight: 44,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
    },
    itemActive: {
      backgroundColor: theme.accentFaint,
    },
    itemNumber: {
      color: theme.textMuted,
      fontSize: 14,
      fontWeight: "700",
      width: 24,
    },
    itemTitle: {
      flex: 1,
      color: theme.text,
      fontSize: 14,
      lineHeight: 20,
    },
    itemTextActive: {
      color: theme.accent,
      fontWeight: "600",
    },
  });
}
