import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../constants/theme";

export type ProfileContentTab = "posts" | "shop";

type Props = {
  active: ProfileContentTab;
  onChange: (tab: ProfileContentTab) => void;
};

export function ProfileContentTabs({ active, onChange }: Props) {
  const [width, setWidth] = useState(0);
  const progress = useRef(new Animated.Value(active === "posts" ? 0 : 1)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: active === "posts" ? 0 : 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [active, progress]);

  const indicatorTranslateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, width / 2],
  });

  return (
    <View style={styles.row} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Pressable
        style={styles.tab}
        onPress={() => onChange("posts")}
        accessibilityRole="tab"
        accessibilityState={{ selected: active === "posts" }}
        accessibilityLabel="Reels"
      >
        <Ionicons
          name="play-circle-outline"
          size={22}
          color={active === "posts" ? theme.text : theme.textMuted}
        />
        <Text style={[styles.tabLabel, active === "posts" && styles.tabLabelActive]}>
          Reels
        </Text>
      </Pressable>
      <Pressable
        style={styles.tab}
        onPress={() => onChange("shop")}
        accessibilityRole="tab"
        accessibilityState={{ selected: active === "shop" }}
        accessibilityLabel="Winkel"
      >
        <Ionicons
          name="bag-outline"
          size={22}
          color={active === "shop" ? theme.text : theme.textMuted}
        />
        <Text style={[styles.tabLabel, active === "shop" && styles.tabLabelActive]}>
          Winkel
        </Text>
      </Pressable>
      {width > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            {
              width: width / 2,
              transform: [{ translateX: indicatorTranslateX }],
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
