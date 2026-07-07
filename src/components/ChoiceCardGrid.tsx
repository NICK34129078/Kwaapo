import React from "react";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const GRID_GAP = 10;
const GRID_COLUMNS = 2;
/** ProductFormScreen gebruikt paddingHorizontal: 16 aan beide kanten. */
const FORM_HORIZONTAL_PADDING = 32;

export function useChoiceCardWidth(
  columns = GRID_COLUMNS,
  horizontalPadding = FORM_HORIZONTAL_PADDING
): number {
  const { width } = useWindowDimensions();
  return (width - horizontalPadding - GRID_GAP * (columns - 1)) / columns;
}

type ChoiceCardProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** main = iets hoger voor hoofdcategorieën; compact = producttype/doelgroep */
  variant?: "main" | "compact";
  width?: number;
};

export function ChoiceCard({
  label,
  selected,
  onPress,
  variant = "compact",
  width: widthProp,
}: ChoiceCardProps) {
  const { theme } = useTheme();

  const styles = useThemedStyles(createStyles);

  const computedWidth = useChoiceCardWidth();
  const cardWidth = widthProp ?? computedWidth;

  return (
    <Pressable
      style={[
        styles.card,
        variant === "main" && styles.cardMain,
        { width: cardWidth, maxWidth: cardWidth },
        selected && styles.cardSelected,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
    >
      <Text
        style={[styles.cardText, selected && styles.cardTextSelected]}
        numberOfLines={2}
      >
        {label}
      </Text>
      {selected ? (
        <View style={styles.checkBadge}>
          <Ionicons name="checkmark" size={11} color={theme.bg} />
        </View>
      ) : null}
    </Pressable>
  );
};

type ChoiceCardGridProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Wrap-grid met vaste 2-koloms spacing — kaarten groeien niet full-width. */
export function ChoiceCardGrid({ children, style }: ChoiceCardGridProps) {
  const styles = useThemedStyles(createStyles);

  return <View style={[styles.grid, style]}>{children}</View>;
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GRID_GAP,
    alignItems: "flex-start",
  },
  card: {
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    backgroundColor: "rgba(255,255,255,0.04)",
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 0,
    flexShrink: 0,
  },
  cardMain: {
    minHeight: 60,
    paddingVertical: 16,
  },
  cardSelected: {
    backgroundColor: theme.accentSoft,
    borderColor: theme.accentBorderMuted,
  },
  cardText: {
    color: theme.textMuted,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 19,
    textAlign: "center",
  },
  cardTextSelected: {
    color: theme.accent,
  },
  checkBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
});
}

