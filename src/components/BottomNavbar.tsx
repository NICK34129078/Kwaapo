import React, { useEffect } from "react";
import { Platform, StyleSheet, View } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { PressableScale } from "./PressableScale";
import { SellerOrderCountBadge } from "./SellerOrderCountBadge";
import { NotificationCountBadge } from "./NotificationCountBadge";
import { useSellerFulfillmentOptional } from "../context/SellerFulfillmentContext";
import { useNotificationCenterOptional } from "../context/NotificationCenterContext";
import { logSellerOpenOrders } from "../constants/sellerOpenOrdersDebug";
import { logSellerOrderInstant } from "../constants/sellerOrderInstantDebug";

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

const TAB_KEYS = ["Home", "Shop", "Search", "Activity", "Profile"] as const;

const TAB_ICONS: Record<
  (typeof TAB_KEYS)[number],
  {
    icon: keyof typeof Ionicons.glyphMap;
    iconActive: keyof typeof Ionicons.glyphMap;
    labelKey: "home" | "shop" | "search" | "activity" | "profile";
  }
> = {
  Home: { icon: "home-outline", iconActive: "home", labelKey: "home" },
  Shop: { icon: "bag-outline", iconActive: "bag", labelKey: "shop" },
  Search: { icon: "search-outline", iconActive: "search", labelKey: "search" },
  Activity: { icon: "play-outline", iconActive: "play", labelKey: "activity" },
  Profile: {
    icon: "person-outline",
    iconActive: "person",
    labelKey: "profile",
  },
};

export function BottomNavbar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const bottomPad = Math.max(insets.bottom, 8);
  const fulfillment = useSellerFulfillmentOptional();
  const notificationCenter = useNotificationCenterOptional();
  const profileActionCount =
    fulfillment?.isBusinessSeller && fulfillment.actionCount > 0
      ? fulfillment.actionCount
      : 0;
  const activityBadgeCount = notificationCenter?.totalUnreadCount ?? 0;

  useEffect(() => {
    if (profileActionCount > 0) {
      logSellerOpenOrders(`badge rendered ${profileActionCount}`);
      logSellerOrderInstant(`profile tab badge rendered ${profileActionCount}`);
    }
  }, [profileActionCount]);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.shell, { paddingBottom: bottomPad }]}
    >
      <View style={styles.inner}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const cfg =
            TAB_ICONS[route.name as (typeof TAB_KEYS)[number]] ?? TAB_ICONS.Home;
          const { options } = descriptors[route.key];
          const label =
            (options.tabBarLabel as string) ??
            options.title ??
            (cfg ? t(`tabs.${cfg.labelKey}`) : route.name);

          const color = focused ? IG.iconOn : IG.iconOff;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              if (route.name === "Home") {
                navigation.navigate({
                  name: "Home",
                  params: { feedRefreshNonce: Date.now() },
                  merge: true,
                });
              } else {
                navigation.navigate(route.name);
              }
            }
          };

          const iconEl = (
            <View style={styles.iconWrap}>
              <Ionicons
                name={focused ? cfg.iconActive : cfg.icon}
                size={ICON}
                color={color}
              />
              {route.name === "Activity" && activityBadgeCount > 0 ? (
                <NotificationCountBadge
                  count={activityBadgeCount}
                  style={styles.tabBadge}
                  borderColor={IG.barBg}
                />
              ) : null}
              {route.name === "Profile" && profileActionCount > 0 ? (
                <SellerOrderCountBadge
                  count={profileActionCount}
                  style={styles.tabBadge}
                  borderColor={IG.barBg}
                />
              ) : null}
            </View>
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
  tabBadge: {
    position: "absolute",
    top: -4,
    right: -10,
  },
});
