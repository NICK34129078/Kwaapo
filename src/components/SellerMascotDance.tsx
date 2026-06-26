import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, View } from "react-native";

const MASCOT_SOURCE = require("../../assets/seller-mascot.png");

/** Eén volledige danscyclus — begin en eind zijn identiek (pose 0). */
const LOOP_MS = 2400;

type SellerMascotDanceProps = {
  size?: number;
};

/**
 * Naadloze loop: één phase 0→1 met linear easing.
 * Alle beweging via interpolate — waarden op 0 en 1 zijn gelijk, geen zichtbare naad.
 */
export function SellerMascotDance({ size = 56 }: SellerMascotDanceProps) {
  const phase = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    phase.setValue(0);
    const dance = Animated.loop(
      Animated.timing(phase, {
        toValue: 1,
        duration: LOOP_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    dance.start();
    return () => dance.stop();
  }, [phase]);

  const translateY = phase.interpolate({
    inputRange: [0, 0.12, 0.28, 0.45, 0.62, 0.78, 1],
    outputRange: [0, -3, -6, -4, -7, -3, 0],
  });

  const translateX = phase.interpolate({
    inputRange: [0, 0.18, 0.38, 0.58, 0.78, 1],
    outputRange: [0, 3.5, -3.5, 3, -2.5, 0],
  });

  const rotate = phase.interpolate({
    inputRange: [0, 0.2, 0.45, 0.7, 1],
    outputRange: ["0deg", "6deg", "-6deg", "5deg", "0deg"],
  });

  const scaleX = phase.interpolate({
    inputRange: [0, 0.25, 0.5, 0.72, 1],
    outputRange: [1, 1.03, 0.98, 1.05, 1],
  });

  const scaleY = phase.interpolate({
    inputRange: [0, 0.25, 0.5, 0.72, 1],
    outputRange: [1, 0.97, 1.04, 0.96, 1],
  });

  return (
    <View
      style={[styles.shell, { width: size, height: size }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View
        style={{
          width: size,
          height: size,
          transform: [
            { translateY },
            { translateX },
            { rotate },
            { scaleX },
            { scaleY },
          ],
        }}
      >
        <Image
          source={MASCOT_SOURCE}
          style={{ width: size, height: size }}
          resizeMode="contain"
          accessible={false}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "visible",
  },
});
