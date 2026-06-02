import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { PressableScale } from "./PressableScale";

/** Instagram-achtig: dunne witte lijnen, geen accentkleur in de balk. */
const IG = {
  barBg: "#000000",
  iconOn: "#FFFFFF",
  iconOff: "rgba(255,255,255,0.45)",
};

const ICON = 28;
/** Extra ruimte links/rechts: buitenste iconen (Home / Profile) iets naar het midden. */
const H_PADDING = 24;
const V_PADDING_TOP = 10;
const V_PADDING_BOTTOM = 6;
const MIN_BAR = 50;
/** Groter aanraakgebied rond elk icoon (zichtbaar gebied blijft gelijk). */
const TAB_HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 } as const;

const TAB_CONFIG: {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  label: string;
}[] = [
  { key: "Home", icon: "home-outline", iconActive: "home", label: "Home" },
  {
    key: "Shop",
    icon: "bag-outline",
    iconActive: "bag",
    label: "Shop",
  },
  {
    key: "Search",
    icon: "search-outline",
    iconActive: "search",
    label: "Zoeken",
  },
  {
    key: "Activity",
    icon: "play-outline",
    iconActive: "play",
    label: "Studio",
  },
  {
    key: "Profile",
    icon: "person-outline",
    iconActive: "person",
    label: "Profile",
  },
];

export function BottomNavbar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 8);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.shell, { paddingBottom: bottomPad }]}
    >
      <View style={styles.inner}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const cfg = TAB_CONFIG[index];
          const { options } = descriptors[route.key];
          const label =
            (options.tabBarLabel as string) ?? options.title ?? cfg.label;

          const color = focused ? IG.iconOn : IG.iconOff;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const iconEl = (
            <Ionicons
              name={focused ? cfg.iconActive : cfg.icon}
              size={ICON}
              color={color}
            />
          );

          const last = index === state.routes.length - 1;

          return (
            <PressableScale
              key={route.key}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              onPress={onPress}
              hitSlop={TAB_HIT_SLOP}
              style={[
                styles.tab,
                index === 0 && styles.tabFirst,
                last && styles.tabLast,
              ]}
              scaleTo={0.92}
            >
              <View style={styles.iconWrap}>{iconEl}</View>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: IG.barBg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.12)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
      },
      android: { elevation: 8 },
    }),
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: H_PADDING,
    paddingTop: V_PADDING_TOP,
    paddingBottom: V_PADDING_BOTTOM,
    minHeight: MIN_BAR,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 44,
    minHeight: Math.max(44, MIN_BAR - V_PADDING_TOP - V_PADDING_BOTTOM),
    paddingVertical: 4,
  },
  tabFirst: {
    marginLeft: 8,
  },
  tabLast: {
    marginRight: 8,
  },
  iconWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
});
