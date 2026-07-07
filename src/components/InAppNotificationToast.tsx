import React, { useCallback, useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
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

const SCREEN_HEIGHT = Dimensions.get("window").height;
const TOAST_MAX_HEIGHT = Math.min(96, Math.round(SCREEN_HEIGHT * 0.2));

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
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeId = useRef<string | null>(null);

  const hide = useCallback(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -120,
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
    translateY.setValue(-120);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        friction: 9,
        tension: 110,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
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
        if (gesture.dy < -20) {
          hide();
        }
      },
    })
  ).current;

  if (!notification) {
    return null;
  }

  const isCompactSellerToast =
    notification.audience === "seller" &&
    notification.notificationType === "new_paid_order";

  const iconName =
    notification.audience === "seller" ? "storefront-outline" : "cube-outline";

  const metaParts = isCompactSellerToast
    ? []
    : notification.audience === "buyer"
      ? [
          notification.variantLabel,
          notification.amountLabel,
          notification.orderReference,
          formatNotificationTime(notification.createdAt),
        ].filter(Boolean)
      : [
          notification.variantLabel ? `Maat ${notification.variantLabel}` : null,
          notification.amountLabel,
          notification.orderReference,
          formatNotificationTime(notification.createdAt),
        ].filter(Boolean);

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.host,
          {
            top: insets.top + 6,
            opacity,
            transform: [{ translateY }],
            maxHeight: isCompactSellerToast ? TOAST_MAX_HEIGHT : undefined,
          },
        ]}
        {...panResponder.panHandlers}
      >
        <Pressable
          style={[
            styles.card,
            isCompactSellerToast ? styles.cardCompact : styles.cardStandard,
          ]}
          onPress={() => onPress(notification)}
          accessibilityRole="button"
          accessibilityLabel={notification.title}
        >
          {notification.productImageUrl ? (
            <Image
              source={{ uri: notification.productImageUrl }}
              style={isCompactSellerToast ? styles.thumbCompact : styles.thumb}
            />
          ) : (
            <View
              style={[
                isCompactSellerToast ? styles.thumbCompact : styles.thumb,
                styles.thumbFallback,
              ]}
            >
              <Ionicons
                name={iconName}
                size={isCompactSellerToast ? 18 : 22}
                color={theme.accent}
              />
            </View>
          )}
          <View style={styles.body}>
            <Text
              style={isCompactSellerToast ? styles.titleCompact : styles.title}
              numberOfLines={1}
            >
              {notification.title}
            </Text>
            <Text
              style={
                isCompactSellerToast ? styles.messageCompact : styles.message
              }
              numberOfLines={isCompactSellerToast ? 1 : 2}
            >
              {notification.body}
            </Text>
            {!isCompactSellerToast && notification.subtitle ? (
              <Text style={styles.subtitle} numberOfLines={2}>
                {notification.subtitle}
              </Text>
            ) : isCompactSellerToast && notification.subtitle ? (
              <Text style={styles.subtitleCompact} numberOfLines={1}>
                {notification.subtitle}
              </Text>
            ) : null}
            {!isCompactSellerToast && metaParts.length > 0 ? (
              <Text style={styles.meta} numberOfLines={1}>
                {metaParts.join(" · ")}
              </Text>
            ) : null}
          </View>
          {!isCompactSellerToast ? (
            <Pressable
              style={styles.closeBtn}
              onPress={hide}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Melding sluiten"
            >
              <Ionicons name="close" size={18} color={theme.textMuted} />
            </Pressable>
          ) : null}
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10000,
    elevation: 10000,
  },
  host: {
    position: "absolute",
    left: 16,
    right: 16,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 24,
    backgroundColor: "rgba(16, 16, 16, 0.97)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(185, 217, 247, 0.35)",
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  cardCompact: {
    minHeight: 72,
    maxHeight: 96,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
    borderRadius: 26,
  },
  cardStandard: {
    alignItems: "flex-start",
    padding: 12,
    gap: 12,
    borderRadius: 18,
  },
  thumbCompact: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: theme.bg,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: theme.bg,
  },
  thumbFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(185, 217, 247, 0.12)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(185, 217, 247, 0.25)",
  },
  body: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 2,
  },
  titleCompact: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.1,
  },
  title: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 2,
  },
  messageCompact: {
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
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
  subtitleCompact: {
    color: theme.textMuted,
    fontSize: 11,
    lineHeight: 14,
    marginTop: 2,
    fontWeight: "600",
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
