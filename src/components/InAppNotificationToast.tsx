import React, { useCallback, useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../constants/theme";
import {
  IN_APP_NOTIFICATION_VISIBLE_MS,
  type InAppNotificationPayload,
} from "../utils/inAppNotification";

type InAppNotificationToastProps = {
  notification: InAppNotificationPayload | null;
  onPress: (notification: InAppNotificationPayload) => void;
  onDismiss: () => void;
};

function formatNotificationTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function InAppNotificationToast({
  notification,
  onPress,
  onDismiss,
}: InAppNotificationToastProps) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-140)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeId = useRef<string | null>(null);

  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -140,
        duration: 260,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        onDismiss();
      }
    });
  }, [onDismiss, opacity, translateY]);

  const show = useCallback(() => {
    translateY.setValue(-140);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        friction: 8,
        tension: 90,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY]);

  useEffect(() => {
    if (!notification) {
      activeId.current = null;
      return;
    }
    if (activeId.current === notification.id) {
      return;
    }
    activeId.current = notification.id;
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
    }
    show();
    dismissTimer.current = setTimeout(() => {
      hide();
    }, IN_APP_NOTIFICATION_VISIBLE_MS);
    return () => {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
      }
    };
  }, [hide, notification, show]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dy < -8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy < -24) {
          hide();
        }
      },
    })
  ).current;

  if (!notification) {
    return null;
  }

  const iconName =
    notification.audience === "seller"
      ? "storefront-outline"
      : "cube-outline";
  const metaParts = [
    notification.variantLabel ? `Maat ${notification.variantLabel}` : null,
    notification.amountLabel,
    notification.orderReference,
    formatNotificationTime(notification.createdAt),
  ].filter(Boolean);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.host,
        {
          top: insets.top + 8,
          opacity,
          transform: [{ translateY }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      <Pressable
        style={styles.card}
        onPress={() => onPress(notification)}
        accessibilityRole="button"
        accessibilityLabel={notification.title}
      >
        {notification.productImageUrl ? (
          <Image
            source={{ uri: notification.productImageUrl }}
            style={styles.thumb}
          />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <Ionicons name={iconName} size={24} color={theme.accent} />
          </View>
        )}
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>
            {notification.title}
          </Text>
          <Text style={styles.message} numberOfLines={2}>
            {notification.body}
          </Text>
          {notification.subtitle ? (
            <Text style={styles.subtitle} numberOfLines={2}>
              {notification.subtitle}
            </Text>
          ) : null}
          {metaParts.length > 0 ? (
            <Text style={styles.meta} numberOfLines={1}>
              {metaParts.join(" · ")}
            </Text>
          ) : null}
        </View>
        <Pressable
          style={styles.closeBtn}
          onPress={hide}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Melding sluiten"
        >
          <Ionicons name="close" size={18} color={theme.textMuted} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 14,
    right: 14,
    zIndex: 1000,
    elevation: 12,
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "rgba(18, 18, 18, 0.96)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.accentBorder,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: theme.bg,
  },
  thumbFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.accentBorder,
  },
  body: {
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  title: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 2,
  },
  message: {
    color: theme.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  subtitle: {
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  meta: {
    color: theme.accent,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 6,
  },
  closeBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
});
