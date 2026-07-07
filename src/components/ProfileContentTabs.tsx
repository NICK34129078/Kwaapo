import React, { useEffect, useRef, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

export type ProfileContentTab = "posts" | "shop" | "saved";

type TabDef = {
  key: ProfileContentTab;
  labelKey: "reels" | "shopTab" | "saved";
  icon: keyof typeof Ionicons.glyphMap;
};

const TAB_DEFS: Record<ProfileContentTab, TabDef> = {
  posts: { key: "posts", labelKey: "reels", icon: "play-circle-outline" },
  shop: { key: "shop", labelKey: "shopTab", icon: "bag-outline" },
  saved: { key: "saved", labelKey: "saved", icon: "bookmark-outline" },
};

type Props = {
  active: ProfileContentTab;
  onChange: (tab: ProfileContentTab) => void;
  /** Welke tabs getoond worden (volgorde bepaalt de weergave). */
  tabs?: ProfileContentTab[];
};

export function ProfileContentTabs({
  active,
  onChange,
  tabs = ["posts", "shop"],
}: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();

  const [width, setWidth] = useState(0);
  const count = Math.max(1, tabs.length);
  const activeIndex = Math.max(0, tabs.indexOf(active));
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
    <View style={styles.row} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {tabs.map((key) => {
        const def = TAB_DEFS[key];
        const label = t(`profile.${def.labelKey}`);
        const selected = active === key;
        return (
          <Pressable
            key={key}
            style={styles.tab}
            onPress={() => onChange(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={label}
          >
            <Ionicons
              name={def.icon}
              size={22}
              color={selected ? theme.text : theme.textMuted}
            />
            <Text style={[styles.tabLabel, selected && styles.tabLabelActive]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
      {width > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            {
              width: segmentWidth,
              transform: [{ translateX: indicatorTranslateX }],
            },
          ]}
        />
      ) : null}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  row: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
    marginBottom: 2,
    position: "relative",
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  indicator: {
    position: "absolute",
    left: 0,
    bottom: -1,
    height: 2,
    backgroundColor: theme.accent,
    borderRadius: 999,
  },
  tabLabel: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    color: theme.text,
    fontWeight: "700",
  },
});
}

