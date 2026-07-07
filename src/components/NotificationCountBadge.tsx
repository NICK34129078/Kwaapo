import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { formatNotificationBadgeCount } from "../utils/notificationBadge";

const BADGE_RED = "#FF3B30";

type Props = {
  count: number;
  style?: StyleProp<ViewStyle>;
  borderColor?: string;
};

export function NotificationCountBadge({
  count,
  style,
  borderColor = "#000000",
}: Props) {
  const label = formatNotificationBadgeCount(count);
  if (!label) {
    return null;
  }

  return (
    <View style={[styles.badge, { borderColor }, style]}>
      <Text style={styles.text} numberOfLines={1}>
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
