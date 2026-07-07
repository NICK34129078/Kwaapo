import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { useThemedStyles } from "../../hooks/useThemedStyles";
import type { AppTheme } from "../../constants/theme";

export type OrderFilterChipItem<T extends string = string> = {
  id: T;
  label: string;
};

type Props<T extends string> = {
  items: OrderFilterChipItem<T>[];
  selected: T;
  onSelect: (id: T) => void;
};

export function OrderFilterChips<T extends string>({
  items,
  selected,
  onSelect,
}: Props<T>) {
  const styles = useThemedStyles(createStyles);

  return (
    <ScrollView
      horizontal
      style={styles.scroll}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {items.map((chip) => {
        const isSelected = selected === chip.id;
        return (
          <Pressable
            key={chip.id}
            style={[styles.chip, isSelected && styles.chipActive]}
            onPress={() => onSelect(chip.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={chip.label}
          >
            <Text
              style={[styles.chipText, isSelected && styles.chipTextActive]}
              numberOfLines={1}
            >
              {chip.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    scroll: {
      flexGrow: 0,
      flexShrink: 0,
    },
    row: {
      paddingHorizontal: 16,
      paddingBottom: 12,
      gap: 6,
      flexDirection: "row",
      alignItems: "center",
    },
    chip: {
      alignSelf: "flex-start",
      minHeight: 32,
      paddingHorizontal: 11,
      paddingVertical: Platform.OS === "android" ? 6 : 7,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      backgroundColor: theme.bgElevated,
      justifyContent: "center",
    },
    chipActive: {
      borderColor: theme.accentBorder,
      backgroundColor: theme.accentSoft,
    },
    chipText: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: "600",
      lineHeight: 16,
      ...(Platform.OS === "android" ? { includeFontPadding: false } : null),
    },
    chipTextActive: {
      color: theme.accent,
      fontWeight: "700",
    },
  });
}
