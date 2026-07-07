import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AppTheme } from "../constants/themeTokens";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import { useActivityNotificationsOptional } from "../context/ActivityNotificationsContext";
import type { ActivityToastPayload } from "../services/activityNotificationService";

const SHOW_MS = 3200;
const SLIDE_MS = 280;

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    wrap: {
      position: "absolute",
      left: 12,
      right: 12,
      zIndex: 200,
      elevation: 200,
    },
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 16,
      backgroundColor: "rgba(18,18,18,0.96)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(255,255,255,0.12)",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 16,
    },
    cardPressed: {
      opacity: 0.92,
    },
    iconBubble: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.accentSoft,
    },
    textWrap: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      color: theme.onMediaText,
      fontSize: 14,
      fontWeight: "700",
      lineHeight: 18,
    },
    subtitle: {
      color: theme.onMediaTextMuted,
      fontSize: 12,
      marginTop: 2,
    },
  });
}

function ToastCard({
  toast,
  topInset,
  onDismiss,
}: {
  toast: ActivityToastPayload;
  topInset: number;
  onDismiss: () => void;
}) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    translateY.setValue(-120);
    opacity.setValue(0);
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: SLIDE_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: SLIDE_MS,
        useNativeDriver: true,
      }),
    ]).start();

    const hideTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -120,
          duration: 220,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          onDismiss();
        }
      });
    }, SHOW_MS);

    return () => {
      clearTimeout(hideTimer);
    };
  }, [onDismiss, opacity, toast.id, translateY]);

  const iconName =
    toast.kind === "comment" ? "chatbubble-ellipses" : "heart";

  return (
    <Animated.View
      style={[
        styles.wrap,
        { top: topInset + 8, opacity, transform: [{ translateY }] },
      ]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={onDismiss}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        accessibilityRole="button"
        accessibilityLabel={toast.message}
      >
        <View style={styles.iconBubble}>
          <Ionicons name={iconName} size={18} color={theme.accent} />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.title} numberOfLines={2}>
            {toast.message}
          </Text>
          <Text style={styles.subtitle}>Activiteit</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function ActivityInAppToast() {
  const insets = useSafeAreaInsets();
  const ctx = useActivityNotificationsOptional();

  if (!ctx?.activeToast) {
    return null;
  }

  return (
    <ToastCard
      key={ctx.activeToast.id}
      toast={ctx.activeToast}
      topInset={insets.top}
      onDismiss={ctx.onToastFinished}
    />
  );
}
