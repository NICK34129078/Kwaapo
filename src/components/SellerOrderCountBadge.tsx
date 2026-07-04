import React from "react";
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { formatSellerOrderBadgeCount } from "../utils/sellerOrderBadge";

const BADGE_RED = "#FF3B30";

type SellerOrderCountBadgeProps = {
  count: number;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  borderColor?: string;
};

export function SellerOrderCountBadge({
  count,
  style,
  textStyle,
  borderColor = "#000000",
}: SellerOrderCountBadgeProps) {
  const label = formatSellerOrderBadgeCount(count);
  if (!label) {
    return null;
  }

  return (
    <View style={[styles.badge, { borderColor }, style]}>
      <Text style={[styles.text, textStyle]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: BADGE_RED,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
  },
});
