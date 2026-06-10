import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../constants/theme";
import { fetchBuyerOrders } from "../services/ordersService";
import type { BuyerOrder } from "../types/order";
import { formatPriceEur } from "../utils/formatPrice";
import {
  BUYER_ORDER_FILTERS,
  matchesBuyerOrderFilter,
  paymentStatusLabel,
  shippingStatusLabel,
  type BuyerOrderFilter,
} from "../utils/orderDashboard";

function formatOrderDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function BuyerOrderCard({
  buyerOrder,
  onPress,
}: {
  buyerOrder: BuyerOrder;
  onPress: () => void;
}) {
  const firstItem = buyerOrder.items[0];
  const product = firstItem?.product;
  const order = buyerOrder.order;

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
        <Text style={styles.orderCardDate}>{formatOrderDate(order.createdAt)}</Text>
        <View style={styles.orderBadgeRow}>
          <View
            style={[
              styles.orderBadge,
              order.paymentStatus === "paid"
                ? styles.orderBadgePaid
                : styles.orderBadgeMuted,
            ]}
          >
            <Text
              style={[
                styles.orderBadgeText,
                order.paymentStatus === "paid"
                  ? styles.orderBadgeTextPaid
                  : styles.orderBadgeTextMuted,
              ]}
            >
              {paymentStatusLabel(order.paymentStatus)}
            </Text>
          </View>
          <View style={styles.orderBadge}>
            <Text style={styles.orderBadgeText}>
              {shippingStatusLabel(order.shippingStatus)}
            </Text>
          </View>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
    </Pressable>
  );
}

export function MyOrdersScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [orders, setOrders] = useState<BuyerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<BuyerOrderFilter>("all");

  const load = useCallback(async () => {
    const rows = await fetchBuyerOrders();
    setOrders(rows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load().finally(() => setLoading(false));
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const filteredOrders = useMemo(
    () => orders.filter((row) => matchesBuyerOrderFilter(row.order, filter)),
    [filter, orders]
  );

  const renderItem = useCallback(
    ({ item }: { item: BuyerOrder }) => (
      <BuyerOrderCard
        buyerOrder={item}
        onPress={() =>
          navigation.navigate("OrderDetail", { orderId: item.order.id })
        }
      />
    ),
    [navigation]
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Terug"
        >
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </Pressable>
        <Text style={styles.screenTitle}>Mijn bestellingen</Text>
        <View style={styles.topBarSide} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {BUYER_ORDER_FILTERS.map((chip) => {
          const selected = filter === chip.id;
          return (
            <Pressable
              key={chip.id}
              style={[styles.filterChip, selected && styles.filterChipActive]}
              onPress={() => setFilter(chip.id)}
              accessibilityRole="button"
              accessibilityLabel={chip.label}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selected && styles.filterChipTextActive,
                ]}
              >
                {chip.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading && !refreshing ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="small" color={theme.accent} />
        </View>
      ) : filteredOrders.length === 0 ? (
        <View style={styles.centerState}>
          <Ionicons name="bag-outline" size={40} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>Geen bestellingen</Text>
          <Text style={styles.emptyText}>
            {filter === "all"
              ? "Je hebt nog niets besteld."
              : "Geen bestellingen in dit filter."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item) => item.order.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: 24 + insets.bottom },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
              tintColor={theme.accent}
              colors={[theme.accent]}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  backBtn: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarSide: {
    width: 42,
  },
  screenTitle: {
    flex: 1,
    color: theme.text,
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
    flexDirection: "row",
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    backgroundColor: theme.bgElevated,
  },
  filterChipActive: {
    borderColor: theme.accent,
    backgroundColor: theme.accentSoft,
  },
  filterChipText: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: "800",
  },
  filterChipTextActive: {
    color: theme.accent,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 8,
  },
  emptyTitle: {
    color: theme.text,
    fontSize: 17,
    fontWeight: "900",
    marginTop: 8,
  },
  emptyText: {
    color: theme.textMuted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  listContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  orderCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: theme.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    marginBottom: 10,
  },
  orderCardImage: {
    width: 72,
    height: 72,
    borderRadius: 12,
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
    gap: 8,
  },
  orderCardTitle: {
    flex: 1,
    color: theme.text,
    fontSize: 15,
    fontWeight: "800",
  },
  orderCardPrice: {
    color: theme.accent,
    fontSize: 14,
    fontWeight: "900",
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
    backgroundColor: theme.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.accentBorder,
  },
  orderBadgePaid: {
    backgroundColor: theme.accentMedium,
  },
  orderBadgeMuted: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: theme.border,
  },
  orderBadgeText: {
    color: theme.accent,
    fontSize: 11,
    fontWeight: "900",
  },
  orderBadgeTextPaid: {
    color: theme.accent,
  },
  orderBadgeTextMuted: {
    color: theme.textMuted,
  },
});
