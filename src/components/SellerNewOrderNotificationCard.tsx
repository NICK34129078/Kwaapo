import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../constants/theme";
import { formatPriceEur } from "../utils/formatPrice";
import {
  formatOrderItemSizeLine,
} from "../utils/orderDashboard";
import { notificationOrderReference } from "../utils/inAppNotification";
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
          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>Betaald – klaar om te verzenden</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
    width: 72,
    height: 72,
    borderRadius: 12,
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
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 21,
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
  statusBadge: {
    alignSelf: "flex-start",
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: theme.accentMedium,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.accentBorder,
  },
  statusBadgeText: {
    color: theme.accent,
    fontSize: 11,
    fontWeight: "900",
  },
});
