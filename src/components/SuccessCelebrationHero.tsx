import React, { useEffect, useRef } from "react";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SellerMascotDance } from "./SellerMascotDance";

const MASCOT_TRANSPARENT = require("../../assets/seller-mascot-transparent.png");

type SuccessCelebrationHeroProps = {
  mascotSize?: number;
};

export function SuccessCelebrationHero({ mascotSize = 80 }: SuccessCelebrationHeroProps) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  const checkScale = useRef(new Animated.Value(0)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(checkScale, {
        toValue: 1,
        friction: 6,
        tension: 90,
        useNativeDriver: true,
      }),
      Animated.timing(checkOpacity, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(ringScale, {
          toValue: 1.08,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(ringScale, {
          toValue: 1,
          duration: 260,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [checkOpacity, checkScale, ringScale]);

  return (
    <View style={styles.wrap}>
      <Animated.View
        style={[
          styles.checkShell,
          {
            opacity: checkOpacity,
            transform: [{ scale: Animated.multiply(checkScale, ringScale) }],
          },
        ]}
      >
        <View style={styles.checkCircle}>
          <Ionicons name="checkmark" size={52} color={theme.bg} />
        </View>
      </Animated.View>
      <View style={styles.mascotSlot}>
        <SellerMascotDance
          size={mascotSize}
          source={MASCOT_TRANSPARENT}
        />
      </View>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 176,
    marginBottom: 10,
  },
  checkShell: {
    marginBottom: 10,
  },
  checkCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: theme.accent,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  mascotSlot: {
    marginTop: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
});
}

