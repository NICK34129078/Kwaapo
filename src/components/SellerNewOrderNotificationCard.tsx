import React from "react";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatPriceEur } from "../utils/formatPrice";
import {
  formatOrderItemSizeLine,
} from "../utils/orderDashboard";
import { notificationOrderReference } from "../utils/inAppNotification";
import { OrderStatusBadge } from "./orders/OrderStatusBadge";
import {
  ORDER_LIST_IMAGE_RADIUS,
  ORDER_LIST_IMAGE_SIZE,
} from "./orders/orderListUi";
import type { SellerNotification } from "../services/sellerNotificationService";
import type { SellerOrderListRow } from "../services/ordersService";

type SellerNewOrderNotificationCardProps = {
  notification: SellerNotification;
  sellerOrder?: SellerOrderListRow | null;
  onPress: () => void;
};

function formatNotificationDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("nl-NL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SellerNewOrderNotificationCard({
  notification,
  sellerOrder,
  onPress,
}: SellerNewOrderNotificationCardProps) {
  const { theme } = useTheme();

  const styles = useThemedStyles(createStyles);

  const firstItem = sellerOrder?.items[0];
  const product = firstItem?.product;
  const order = sellerOrder?.order;
  const productName = notification.productName ?? product?.name ?? "Product";
  const amountLabel = order
    ? formatPriceEur(order.subtotalAmount)
    : null;
  const sizeLine = formatOrderItemSizeLine(firstItem);

  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Nieuwe bestelling ontvangen"
    >
      <View style={styles.headerRow}>
        <Ionicons name="sparkles-outline" size={16} color={theme.accent} />
        <Text style={styles.kicker}>Nieuwe bestelling ontvangen</Text>
      </View>
      <View style={styles.bodyRow}>
        {product?.images[0] ? (
          <Image source={{ uri: product.images[0] }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <Ionicons name="storefront-outline" size={24} color={theme.accent} />
          </View>
        )}
        <View style={styles.body}>
          <Text style={styles.productName} numberOfLines={2}>
            {productName}
          </Text>
          {amountLabel ? (
            <Text style={styles.amountLine}>
              Je hebt {productName} verkocht voor {amountLabel}.
            </Text>
          ) : (
            <Text style={styles.amountLine} numberOfLines={2}>
              {notification.body}
            </Text>
          )}
          {sizeLine ? <Text style={styles.meta}>{sizeLine}</Text> : null}
          <Text style={styles.meta}>
            {formatNotificationDate(notification.createdAt)}
            {order ? ` · ${notificationOrderReference(order.id)}` : ""}
          </Text>
          <View style={styles.footer}>
            <OrderStatusBadge
              label="Betaald – klaar om te verzenden"
              tone="accent"
            />
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
      </View>
    </Pressable>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  card: {
    marginBottom: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: theme.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.accentBorder,
    gap: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  kicker: {
    color: theme.accent,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.25,
    textTransform: "uppercase",
  },
  bodyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  thumb: {
    width: ORDER_LIST_IMAGE_SIZE,
    height: ORDER_LIST_IMAGE_SIZE,
    borderRadius: ORDER_LIST_IMAGE_RADIUS,
    backgroundColor: theme.bg,
  },
  thumbFallback: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  productName: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  amountLine: {
    color: theme.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  meta: {
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  footer: {
    marginTop: 6,
  },
});
}

