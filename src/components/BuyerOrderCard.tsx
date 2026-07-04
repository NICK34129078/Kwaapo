import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../constants/theme";
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

type BuyerOrderCardProps = {
  buyerOrder: BuyerOrder;
  onPress: () => void;
};

export function BuyerOrderCard({ buyerOrder, onPress }: BuyerOrderCardProps) {
  const firstItem = buyerOrder.items[0];
  const product = firstItem?.product;
  const order = buyerOrder.order;
  const sizeLine = formatOrderItemSizeLine(firstItem);
  const quantityLine = formatOrderItemQuantityLine(firstItem);
  const statusTone = buyerOrderStatusTone(order);
  const metaParts = [sizeLine, quantityLine].filter(Boolean);

  return (
    <Pressable
      style={styles.orderCard}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open bestelling"
    >
      {product?.images[0] ? (
        <Image source={{ uri: product.images[0] }} style={styles.orderCardImage} />
      ) : (
        <View style={[styles.orderCardImage, styles.imageFallback]}>
          <Ionicons name="receipt-outline" size={28} color={theme.textMuted} />
        </View>
      )}
      <View style={styles.orderCardBody}>
        <View style={styles.orderCardTopRow}>
          <Text style={styles.orderCardTitle} numberOfLines={2}>
            {product?.name ?? "Product"}
          </Text>
          <Text style={styles.orderCardPrice}>
            {formatPriceEur(order.subtotalAmount)}
          </Text>
        </View>
        <Text style={styles.orderCardSeller} numberOfLines={1}>
          {sellerDisplayName(buyerOrder)}
        </Text>
        {metaParts.length > 0 ? (
          <Text style={styles.orderCardMeta}>{metaParts.join(" · ")}</Text>
        ) : null}
        <Text style={styles.orderCardDate}>
          {formatOrderDate(order.createdAt)} · {formatOrderReference(order.id)}
        </Text>
        <View style={styles.orderBadgeRow}>
          <View
            style={[
              styles.orderBadge,
              statusTone === "accent" && styles.orderBadgeAccent,
              statusTone === "success" && styles.orderBadgeSuccess,
              statusTone === "danger" && styles.orderBadgeDanger,
              statusTone === "muted" && styles.orderBadgeMuted,
            ]}
          >
            <Text
              style={[
                styles.orderBadgeText,
                statusTone === "accent" && styles.orderBadgeTextAccent,
                statusTone === "success" && styles.orderBadgeTextSuccess,
                statusTone === "danger" && styles.orderBadgeTextDanger,
                statusTone === "muted" && styles.orderBadgeTextMuted,
              ]}
            >
              {buyerOrderStatusLabel(order)}
            </Text>
          </View>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  orderCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: theme.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  orderCardImage: {
    width: 88,
    height: 88,
    borderRadius: 14,
    backgroundColor: theme.bg,
  },
  imageFallback: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  orderCardBody: {
    flex: 1,
    minWidth: 0,
  },
  orderCardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  orderCardTitle: {
    flex: 1,
    color: theme.text,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 21,
  },
  orderCardPrice: {
    color: theme.accent,
    fontSize: 15,
    fontWeight: "900",
  },
  orderCardSeller: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 4,
  },
  orderCardMeta: {
    color: theme.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  orderCardDate: {
    color: theme.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  orderBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  orderBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  orderBadgeAccent: {
    backgroundColor: theme.accentMedium,
    borderColor: theme.accentBorder,
  },
  orderBadgeSuccess: {
    backgroundColor: "rgba(120, 220, 160, 0.14)",
    borderColor: "rgba(120, 220, 160, 0.35)",
  },
  orderBadgeDanger: {
    backgroundColor: "rgba(255, 120, 120, 0.12)",
    borderColor: "rgba(255, 120, 120, 0.35)",
  },
  orderBadgeMuted: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: theme.border,
  },
  orderBadgeText: {
    fontSize: 11,
    fontWeight: "900",
  },
  orderBadgeTextAccent: {
    color: theme.accent,
  },
  orderBadgeTextSuccess: {
    color: "#8CE4B0",
  },
  orderBadgeTextDanger: {
    color: "#FF9B9B",
  },
  orderBadgeTextMuted: {
    color: theme.textMuted,
  },
});
