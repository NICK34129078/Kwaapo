import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../constants/theme";

type Props = {
  title: string;
  subtitle?: string;
};

export function PlaceholderScreen({ title, subtitle }: Props) {
  const insets = useSafeAreaInsets();
  const bottomPad = 100 + Math.max(insets.bottom, 0);

  return (
    <View style={[styles.root, { paddingBottom: bottomPad }]}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  title: {
    color: theme.text,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 0.4,
    textAlign: "center",
  },
  sub: {
    marginTop: 10,
    color: theme.textMuted,
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
});
