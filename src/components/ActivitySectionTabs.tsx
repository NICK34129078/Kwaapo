import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";
import type { ActivitySection } from "../types/activity";
import { NotificationCountBadge } from "./NotificationCountBadge";

type Props = {
  active: ActivitySection;
  onChange: (section: ActivitySection) => void;
  activityUnreadCount: number;
  ordersUnreadCount: number;
  showOrdersTab: boolean;
};

export function ActivitySectionTabs({
  active,
  onChange,
  activityUnreadCount,
  ordersUnreadCount,
  showOrdersTab,
}: Props) {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();
  const [width, setWidth] = useState(0);

  const tabs: { key: ActivitySection; label: string; count: number }[] = [
    {
      key: "activity",
      label: t("activityCenter.activityTab"),
      count: activityUnreadCount,
    },
  ];
  if (showOrdersTab) {
    tabs.push({
      key: "orders",
      label: t("activityCenter.ordersTab"),
      count: ordersUnreadCount,
    });
  }

  const count = Math.max(1, tabs.length);
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.key === active));
  const progress = useRef(new Animated.Value(activeIndex)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: activeIndex,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [activeIndex, progress]);

  const segmentWidth = width / count;
  const indicatorTranslateX = progress.interpolate({
    inputRange: [0, Math.max(1, count - 1)],
    outputRange: [0, segmentWidth * Math.max(0, count - 1)],
  });

  return (
    <View
      style={styles.wrap}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <View style={styles.pill}>
        {tabs.map((tab) => {
          const selected = active === tab.key;
          return (
            <Pressable
              key={tab.key}
              style={styles.tab}
              onPress={() => onChange(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={tab.label}
            >
              <Text style={[styles.tabLabel, selected && styles.tabLabelActive]}>
                {tab.label}
              </Text>
              <NotificationCountBadge
                count={tab.count}
                style={styles.tabBadge}
                borderColor="transparent"
              />
            </Pressable>
          );
        })}
        {width > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.indicator,
              {
                width: segmentWidth - 8,
                transform: [{ translateX: Animated.add(indicatorTranslateX, 4) }],
              },
            ]}
          />
        ) : null}
      </View>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    wrap: {
      marginBottom: 12,
    },
    pill: {
      flexDirection: "row",
      position: "relative",
      backgroundColor: theme.bgElevated,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      padding: 4,
    },
    tab: {
      flex: 1,
      minHeight: 36,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingHorizontal: 8,
      zIndex: 1,
    },
    tabLabel: {
      color: theme.textMuted,
      fontSize: 13,
      fontWeight: "600",
    },
    tabLabelActive: {
      color: theme.text,
      fontWeight: "700",
    },
    tabBadge: {
      position: "relative",
      top: 0,
      right: 0,
    },
    indicator: {
      position: "absolute",
      left: 0,
      top: 4,
      bottom: 4,
      backgroundColor: theme.bg,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
  });
}
