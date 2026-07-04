import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../constants/theme";
import { SellerNewOrderNotificationCard } from "../components/SellerNewOrderNotificationCard";
import {
  fetchSellerOrders,
  type SellerOrderListRow,
} from "../services/ordersService";
import {
  fetchUnreadSellerNotifications,
  markSellerNotificationRead,
  type SellerNotification,
} from "../services/sellerNotificationService";
import { useSellerFulfillment } from "../context/SellerFulfillmentContext";
import { formatPriceEur } from "../utils/formatPrice";
import {
  buyerDisplayName,
  formatOrderItemSizeLine,
  formatOrderDate,
} from "../utils/orderDashboard";
import {
  sellerFulfillmentLabel,
  sortSellerOrders,
} from "../utils/sellerFulfillment";

function SellerOrderCard({
  sellerOrder,
  unread,
  onPress,
}: {
  sellerOrder: SellerOrderListRow;
  unread?: boolean;
  onPress: () => void;
}) {
  const firstItem = sellerOrder.items[0];
  const product = firstItem?.product;
  const order = sellerOrder.order;
  const sizeLine = formatOrderItemSizeLine(firstItem);
  const fulfillmentLabel = sellerFulfillmentLabel(
    order,
    sellerOrder.fulfillment.fulfillmentStatus
  );

  return (
    <Pressable
      style={[styles.orderCard, unread && styles.orderCardUnread]}
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
        <Text style={styles.orderCardBuyer} numberOfLines={1}>
          {buyerDisplayName(sellerOrder)}
        </Text>
        {sizeLine ? <Text style={styles.orderCardMeta}>{sizeLine}</Text> : null}
        <Text style={styles.orderCardDate}>
          {formatOrderDate(order.createdAt)} · #{order.id.slice(0, 8)}
        </Text>
        <View style={styles.orderBadgeRow}>
          <View style={[styles.orderBadge, unread && styles.orderBadgeAccent]}>
            <Text style={[styles.orderBadgeText, unread && styles.orderBadgeTextAccent]}>
              {fulfillmentLabel}
            </Text>
          </View>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
    </Pressable>
  );
}

export function SellerOrdersScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { refresh: refreshSellerFulfillment } = useSellerFulfillment();
  const [orders, setOrders] = useState<SellerOrderListRow[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState<SellerNotification[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [orderRows, unreadRows] = await Promise.all([
      fetchSellerOrders(),
      fetchUnreadSellerNotifications(),
    ]);
    setOrders(orderRows);
    setUnreadNotifications(unreadRows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      setError(null);
      void load()
        .catch(() => {
          setOrders([]);
          setUnreadNotifications([]);
          setError("Bestellingen laden mislukt.");
        })
        .finally(() => setLoading(false));
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      await load();
      await refreshSellerFulfillment();
    } catch {
      setError("Bestellingen laden mislukt.");
    } finally {
      setRefreshing(false);
    }
  }, [load, refreshSellerFulfillment]);

  const ordersById = useMemo(
    () => new Map(orders.map((row) => [row.order.id, row])),
    [orders]
  );

  const unreadOrderIds = useMemo(
    () => new Set(unreadNotifications.map((row) => row.orderId)),
    [unreadNotifications]
  );

  const sortedOrders = useMemo(() => sortSellerOrders(orders), [orders]);

  const openOrder = useCallback(
    (orderId: string, notificationId?: string) => {
      if (notificationId) {
        void markSellerNotificationRead(notificationId);
      } else if (unreadOrderIds.has(orderId)) {
        const match = unreadNotifications.find((row) => row.orderId === orderId);
        if (match) {
          void markSellerNotificationRead(match.id);
        }
      }
      void refreshSellerFulfillment();
      navigation.navigate("OrderDetail", { orderId });
    },
    [navigation, refreshSellerFulfillment, unreadNotifications, unreadOrderIds]
  );

  const listHeader = useMemo(() => {
    if (unreadNotifications.length === 0) {
      return <View style={styles.listHeaderSpacer} />;
    }
    return (
      <View style={styles.unreadSection}>
        {unreadNotifications.map((notification) => (
          <SellerNewOrderNotificationCard
            key={notification.id}
            notification={notification}
            sellerOrder={ordersById.get(notification.orderId) ?? null}
            onPress={() => openOrder(notification.orderId, notification.id)}
          />
        ))}
      </View>
    );
  }, [openOrder, ordersById, unreadNotifications]);

  const renderItem = useCallback(
    ({ item }: { item: SellerOrderListRow }) => (
      <SellerOrderCard
        sellerOrder={item}
        unread={unreadOrderIds.has(item.order.id)}
        onPress={() => openOrder(item.order.id)}
      />
    ),
    [openOrder, unreadOrderIds]
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

      {loading && !refreshing ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : error && orders.length === 0 ? (
        <View style={styles.centerState}>
          <Text style={styles.emptyText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={sortedOrders}
          keyExtractor={(item) => item.order.id}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
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
          ListEmptyComponent={
            <View style={styles.centerState}>
              <Ionicons name="receipt-outline" size={40} color={theme.textMuted} />
              <Text style={styles.emptyTitle}>Nog geen verkopen</Text>
              <Text style={styles.emptyText}>
                Nieuwe betaalde bestellingen verschijnen hier.
              </Text>
            </View>
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
    paddingTop: 4,
  },
  listHeaderSpacer: {
    height: 4,
  },
  unreadSection: {
    marginBottom: 8,
  },
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
  orderCardUnread: {
    borderColor: theme.accentBorder,
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
  orderCardBuyer: {
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
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  orderBadgeAccent: {
    backgroundColor: theme.accentMedium,
    borderColor: theme.accentBorder,
  },
  orderBadgeText: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: "900",
  },
  orderBadgeTextAccent: {
    color: theme.accent,
  },
});
