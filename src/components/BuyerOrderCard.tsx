import React from "react";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { BuyerOrder } from "../types/order";
import { formatPriceEur } from "../utils/formatPrice";
import {
  formatOrderDate,
  formatOrderItemSizeLine,
  sellerDisplayName,
} from "../utils/orderDashboard";
import {
  buyerOrderStatusLabel,
  buyerOrderStatusTone,
} from "../utils/buyerOrderStatus";
import {
  formatOrderItemQuantityLine,
  formatOrderReference,
} from "../utils/buyerOrdersList";
import { OrderStatusBadge } from "./orders/OrderStatusBadge";
import {
  ORDER_LIST_CARD_PADDING,
  ORDER_LIST_CARD_RADIUS,
  ORDER_LIST_IMAGE_RADIUS,
  ORDER_LIST_IMAGE_SIZE,
} from "./orders/orderListUi";

type BuyerOrderCardProps = {
  buyerOrder: BuyerOrder;
  onPress: () => void;
};

export function BuyerOrderCard({ buyerOrder, onPress }: BuyerOrderCardProps) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  const firstItem = buyerOrder.items[0];
  const product = firstItem?.product;
  const order = buyerOrder.order;
  const sizeLine = formatOrderItemSizeLine(firstItem);
  const quantityLine = formatOrderItemQuantityLine(firstItem);
  const statusTone = buyerOrderStatusTone(order);
  const metaParts = [sizeLine, quantityLine].filter(Boolean);
  const itemCount = buyerOrder.items.length;

  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open bestelling"
    >
      {product?.images[0] ? (
        <Image source={{ uri: product.images[0] }} style={styles.image} />
      ) : (
        <View style={[styles.image, styles.imageFallback]}>
          <Ionicons name="receipt-outline" size={24} color={theme.textMuted} />
        </View>
      )}

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>
            {product?.name ?? "Product"}
            {itemCount > 1 ? ` +${itemCount - 1}` : ""}
          </Text>
          <Text style={styles.price}>{formatPriceEur(order.subtotalAmount)}</Text>
        </View>

        <Text style={styles.seller} numberOfLines={1}>
          {sellerDisplayName(buyerOrder)}
        </Text>

        {metaParts.length > 0 ? (
          <Text style={styles.meta} numberOfLines={1}>
            {metaParts.join(" · ")}
          </Text>
        ) : null}

        <View style={styles.footer}>
          <OrderStatusBadge
            label={buyerOrderStatusLabel(order)}
            tone={statusTone}
          />
          <Text style={styles.date} numberOfLines={1}>
            {formatOrderDate(order.createdAt)} · {formatOrderReference(order.id)}
          </Text>
        </View>
      </View>

      <Ionicons
        name="chevron-forward"
        size={18}
        color={theme.textMuted}
        style={styles.chevron}
      />
    </Pressable>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      marginBottom: 10,
      padding: ORDER_LIST_CARD_PADDING,
      borderRadius: ORDER_LIST_CARD_RADIUS,
      backgroundColor: theme.bgElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    image: {
      width: ORDER_LIST_IMAGE_SIZE,
      height: ORDER_LIST_IMAGE_SIZE,
      borderRadius: ORDER_LIST_IMAGE_RADIUS,
      backgroundColor: theme.bg,
    },
    imageFallback: {
      alignItems: "center",
      justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    body: {
      flex: 1,
      minWidth: 0,
      gap: 3,
      paddingTop: 1,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 10,
    },
    title: {
      flex: 1,
      color: theme.text,
      fontSize: 15,
      fontWeight: "700",
      lineHeight: 20,
      letterSpacing: -0.2,
    },
    price: {
      color: theme.text,
      fontSize: 14,
      fontWeight: "700",
      lineHeight: 20,
      flexShrink: 0,
    },
    seller: {
      color: theme.textMuted,
      fontSize: 13,
      fontWeight: "500",
      lineHeight: 18,
    },
    meta: {
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 16,
    },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      marginTop: 6,
      flexWrap: "wrap",
    },
    date: {
      flex: 1,
      minWidth: 0,
      color: theme.textMuted,
      fontSize: 11,
      lineHeight: 14,
      textAlign: "right",
    },
    chevron: {
      marginTop: 28,
      opacity: 0.7,
    },
  });
}
