import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AppTheme } from "../constants/themeTokens";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import { ProfileScreen } from "./ProfileScreen";

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    backButton: {
      position: "absolute",
      left: 12,
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.45)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(255,255,255,0.25)",
      zIndex: 50,
      elevation: 50,
    },
  });
}

export function PublicProfileScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.root}>
      <ProfileScreen />

      <Pressable
        onPress={() => navigation.goBack()}
        style={[styles.backButton, { top: insets.top + 8 }]}
        accessibilityRole="button"
        accessibilityLabel="Ga terug"
        hitSlop={10}
      >
        <Ionicons name="chevron-back" size={24} color={theme.text} />
      </Pressable>
    </View>
  );
}
