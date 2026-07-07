import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SellerNewOrderNotificationCard } from "../components/SellerNewOrderNotificationCard";
import {
  OrderStatusBadge,
  type OrderStatusBadgeTone,
} from "../components/orders/OrderStatusBadge";
import {
  ORDER_LIST_CARD_PADDING,
  ORDER_LIST_CARD_RADIUS,
  ORDER_LIST_IMAGE_RADIUS,
  ORDER_LIST_IMAGE_SIZE,
} from "../components/orders/orderListUi";
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
  buildSellerOrderListSections,
  sellerFulfillmentLabel,
  sortSellerOrders,
  type SellerOrderListBucket,
} from "../utils/sellerFulfillment";

const SELLER_SECTION_TITLE_KEYS: Record<SellerOrderListBucket, string> = {
  action_required: "orders.sellerSectionActionRequired",
  shipped: "orders.sellerSectionShipped",
  completed: "orders.sellerSectionCompleted",
  other: "orders.sellerSectionOther",
};

function badgeToneForBucket(bucket: SellerOrderListBucket): OrderStatusBadgeTone {
  switch (bucket) {
    case "action_required":
      return "accent";
    case "shipped":
      return "success";
    case "completed":
      return "muted";
    default:
      return "danger";
  }
}

function SellerOrderSectionHeader({
  title,
  count,
  bucket,
}: {
  title: string;
  count: number;
  bucket: SellerOrderListBucket;
}) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  const iconName =
    bucket === "action_required"
      ? "alert-circle-outline"
      : bucket === "shipped"
        ? "airplane-outline"
        : bucket === "completed"
          ? "checkmark-circle-outline"
          : "ellipse-outline";

  const iconColor =
    bucket === "action_required"
      ? theme.accent
      : bucket === "shipped"
        ? "#8CE4B0"
        : bucket === "completed"
          ? theme.textMuted
          : theme.textMuted;

  return (
    <View
      style={[
        styles.sectionHeader,
        bucket === "action_required" && styles.sectionHeaderAction,
      ]}
    >
      <View style={styles.sectionHeaderMain}>
        <Ionicons name={iconName} size={16} color={iconColor} />
        <Text
          style={[
            styles.sectionTitle,
            bucket === "action_required" && styles.sectionTitleAction,
          ]}
        >
          {title}
        </Text>
      </View>
      <Text style={styles.sectionCount}>{count}</Text>
    </View>
  );
}

function SellerOrderCard({
  sellerOrder,
  bucket,
  unread,
  onPress,
}: {
  sellerOrder: SellerOrderListRow;
  bucket: SellerOrderListBucket;
  unread?: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  const firstItem = sellerOrder.items[0];
  const product = firstItem?.product;
  const order = sellerOrder.order;
  const sizeLine = formatOrderItemSizeLine(firstItem);
  const fulfillmentLabel = sellerFulfillmentLabel(
    order,
    sellerOrder.fulfillment.fulfillmentStatus
  );
  const badgeTone = badgeToneForBucket(bucket);
  const isCompleted = bucket === "completed";

  return (
    <Pressable
      style={[
        styles.orderCard,
        bucket === "action_required" && styles.orderCardAction,
        bucket === "shipped" && styles.orderCardShipped,
        bucket === "completed" && styles.orderCardCompleted,
        unread && bucket === "action_required" && styles.orderCardUnread,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t("orders.openOrder")}
    >
      {bucket === "action_required" ? <View style={styles.actionStripe} /> : null}
      {bucket === "shipped" ? <View style={styles.shippedStripe} /> : null}

      {product?.images[0] ? (
        <Image
          source={{ uri: product.images[0] }}
          style={[styles.orderCardImage, isCompleted && styles.orderCardImageMuted]}
        />
      ) : (
        <View
          style={[
            styles.orderCardImage,
            styles.imageFallback,
            isCompleted && styles.orderCardImageMuted,
          ]}
        >
          <Ionicons name="receipt-outline" size={24} color={theme.textMuted} />
        </View>
      )}
      <View style={styles.orderCardBody}>
        <View style={styles.orderCardTopRow}>
          <Text
            style={[styles.orderCardTitle, isCompleted && styles.orderCardTitleMuted]}
            numberOfLines={2}
          >
            {product?.name ?? t("common.product")}
          </Text>
          <Text
            style={[styles.orderCardPrice, isCompleted && styles.orderCardPriceMuted]}
          >
            {formatPriceEur(order.subtotalAmount)}
          </Text>
        </View>
        <Text style={styles.orderCardBuyer} numberOfLines={1}>
          {buyerDisplayName(sellerOrder)}
        </Text>
        {sizeLine ? <Text style={styles.orderCardMeta}>{sizeLine}</Text> : null}
        <View style={styles.orderCardFooter}>
          <OrderStatusBadge label={fulfillmentLabel} tone={badgeTone} />
          <Text style={styles.orderCardDate} numberOfLines={1}>
            {formatOrderDate(order.createdAt)} · #{order.id.slice(0, 8)}
          </Text>
        </View>
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={theme.textMuted}
        style={styles.orderCardChevron}
      />
    </Pressable>
  );
}

export function SellerOrdersScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

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
          setError(t("orders.loadFailed"));
        })
        .finally(() => setLoading(false));
    }, [load, t])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      await load();
      await refreshSellerFulfillment();
    } catch {
      setError(t("orders.loadFailed"));
    } finally {
      setRefreshing(false);
    }
  }, [load, refreshSellerFulfillment, t]);

  const ordersById = useMemo(
    () => new Map(orders.map((row) => [row.order.id, row])),
    [orders]
  );

  const unreadOrderIds = useMemo(
    () => new Set(unreadNotifications.map((row) => row.orderId)),
    [unreadNotifications]
  );

  const sortedOrders = useMemo(() => sortSellerOrders(orders), [orders]);

  const sectionTitles = useMemo(
    () =>
      ({
        action_required: t(SELLER_SECTION_TITLE_KEYS.action_required),
        shipped: t(SELLER_SECTION_TITLE_KEYS.shipped),
        completed: t(SELLER_SECTION_TITLE_KEYS.completed),
        other: t(SELLER_SECTION_TITLE_KEYS.other),
      }) satisfies Record<SellerOrderListBucket, string>,
    [t]
  );

  const sections = useMemo(
    () => buildSellerOrderListSections(sortedOrders, sectionTitles),
    [sectionTitles, sortedOrders]
  );

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
  }, [openOrder, ordersById, unreadNotifications, styles.listHeaderSpacer, styles.unreadSection]);

  const renderSectionHeader = useCallback(
    ({ section }: { section: (typeof sections)[number] }) => (
      <SellerOrderSectionHeader
        title={section.title}
        count={section.data.length}
        bucket={section.key}
      />
    ),
    []
  );

  const renderItem = useCallback(
    ({ item, section }: { item: SellerOrderListRow; section: (typeof sections)[number] }) => (
      <SellerOrderCard
        sellerOrder={item}
        bucket={section.key}
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
          accessibilityLabel={t("common.back")}
        >
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </Pressable>
        <Text style={styles.screenTitle}>{t("orders.sellerOrders")}</Text>
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
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.order.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
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
              <Text style={styles.emptyTitle}>{t("orders.noSalesYet")}</Text>
              <Text style={styles.emptyText}>{t("orders.noSalesHint")}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 8,
      marginBottom: 4,
    },
    backBtn: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
    },
    topBarSide: {
      width: 40,
    },
    screenTitle: {
      flex: 1,
      color: theme.text,
      fontSize: 18,
      fontWeight: "700",
      textAlign: "center",
      letterSpacing: -0.3,
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
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: 14,
      paddingBottom: 8,
      gap: 8,
    },
    sectionHeaderAction: {
      paddingTop: 10,
    },
    sectionHeaderMain: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      flex: 1,
      minWidth: 0,
    },
    sectionTitle: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.4,
      textTransform: "uppercase",
    },
    sectionTitleAction: {
      color: theme.accent,
    },
    sectionCount: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: "600",
      minWidth: 20,
      textAlign: "right",
    },
    orderCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      marginBottom: 10,
      padding: ORDER_LIST_CARD_PADDING,
      borderRadius: ORDER_LIST_CARD_RADIUS,
      backgroundColor: theme.bgElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      overflow: "hidden",
    },
    orderCardAction: {
      backgroundColor: theme.accentSoft,
      borderColor: theme.accentBorder,
    },
    orderCardShipped: {
      backgroundColor: "rgba(120, 220, 160, 0.06)",
      borderColor: "rgba(120, 220, 160, 0.28)",
    },
    orderCardCompleted: {
      backgroundColor: theme.bgElevated,
      borderColor: theme.border,
      opacity: 0.88,
    },
    orderCardUnread: {
      borderColor: theme.accentBorderStrong,
    },
    actionStripe: {
      position: "absolute",
      left: 0,
      top: 10,
      bottom: 10,
      width: 3,
      borderRadius: 2,
      backgroundColor: theme.accent,
    },
    shippedStripe: {
      position: "absolute",
      left: 0,
      top: 10,
      bottom: 10,
      width: 3,
      borderRadius: 2,
      backgroundColor: "#8CE4B0",
    },
    orderCardImage: {
      width: ORDER_LIST_IMAGE_SIZE,
      height: ORDER_LIST_IMAGE_SIZE,
      borderRadius: ORDER_LIST_IMAGE_RADIUS,
      backgroundColor: theme.bg,
    },
    orderCardImageMuted: {
      opacity: 0.75,
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
      gap: 3,
      paddingTop: 1,
      paddingLeft: 4,
    },
    orderCardTopRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 10,
    },
    orderCardTitle: {
      flex: 1,
      color: theme.text,
      fontSize: 15,
      fontWeight: "700",
      lineHeight: 20,
      letterSpacing: -0.2,
    },
    orderCardTitleMuted: {
      color: theme.textMuted,
      fontWeight: "600",
    },
    orderCardPrice: {
      color: theme.text,
      fontSize: 14,
      fontWeight: "700",
      lineHeight: 20,
      flexShrink: 0,
    },
    orderCardPriceMuted: {
      color: theme.textMuted,
      fontWeight: "600",
    },
    orderCardBuyer: {
      color: theme.textMuted,
      fontSize: 13,
      fontWeight: "500",
      lineHeight: 18,
    },
    orderCardMeta: {
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 16,
    },
    orderCardFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      marginTop: 6,
      flexWrap: "wrap",
    },
    orderCardDate: {
      flex: 1,
      minWidth: 0,
      color: theme.textMuted,
      fontSize: 11,
      lineHeight: 14,
      textAlign: "right",
    },
    orderCardChevron: {
      marginTop: 28,
      opacity: 0.7,
    },
  });
}
