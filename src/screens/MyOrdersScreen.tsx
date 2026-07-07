import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BuyerOrderCard } from "../components/BuyerOrderCard";
import { OrderFilterChips } from "../components/orders/OrderFilterChips";
import {
  BUYER_ORDERS_PAGE_SIZE,
  fetchBuyerOrdersPage,
} from "../services/ordersService";
import type { BuyerOrder } from "../types/order";
import {
  BUYER_ORDER_FILTERS,
  matchesBuyerOrderFilter,
  type BuyerOrderFilter,
} from "../utils/orderDashboard";

const BUYER_FILTER_LABEL_KEYS: Record<BuyerOrderFilter, string> = {
  all: "orders.filterAll",
  unpaid: "orders.filterUnpaid",
  waiting_ship: "orders.filterWaitingShip",
  shipped: "orders.filterShipped",
  completed: "orders.filterCompleted",
};

export function MyOrdersScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [orders, setOrders] = useState<BuyerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<BuyerOrderFilter>("all");

  const loadPage = useCallback(async (offset: number, replace: boolean) => {
    const page = await fetchBuyerOrdersPage({
      offset,
      limit: BUYER_ORDERS_PAGE_SIZE,
    });
    setOrders((current) => (replace ? page.orders : [...current, ...page.orders]));
    setHasMore(page.hasMore);
    return page.orders.length;
  }, []);

  const loadInitial = useCallback(async () => {
    setError(null);
    await loadPage(0, true);
  }, [loadPage]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void loadInitial()
        .catch(() => {
          setOrders([]);
          setHasMore(false);
          setError(t("orders.loadFailedPullRefresh"));
        })
        .finally(() => setLoading(false));
    }, [loadInitial, t])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      await loadInitial();
    } catch {
      setError(t("orders.loadFailedPullRefresh"));
    } finally {
      setRefreshing(false);
    }
  }, [loadInitial, t]);

  const onLoadMore = useCallback(async () => {
    if (loading || refreshing || loadingMore || !hasMore) {
      return;
    }
    setLoadingMore(true);
    try {
      await loadPage(orders.length, false);
    } catch {
      setError(t("orders.loadMoreFailed"));
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadPage, loading, loadingMore, orders.length, refreshing, t]);

  const filteredOrders = useMemo(
    () => orders.filter((row) => matchesBuyerOrderFilter(row.order, filter)),
    [filter, orders]
  );

  const showShopEmptyState =
    !loading && !error && filter === "all" && orders.length === 0;
  const showFilterEmptyState =
    !loading && !error && !showShopEmptyState && filteredOrders.length === 0;

  const filterItems = useMemo(
    () =>
      BUYER_ORDER_FILTERS.map((chip) => ({
        id: chip.id,
        label: t(BUYER_FILTER_LABEL_KEYS[chip.id]),
      })),
    [t]
  );

  const openOrderDetail = useCallback(
    (orderId: string) => {
      navigation.navigate("OrderDetail", { orderId });
    },
    [navigation]
  );

  const openShop = useCallback(() => {
    navigation.navigate("MainTabs", { screen: "Shop" });
  }, [navigation]);

  const renderItem = useCallback(
    ({ item }: { item: BuyerOrder }) => (
      <BuyerOrderCard
        buyerOrder={item}
        onPress={() => openOrderDetail(item.order.id)}
      />
    ),
    [openOrderDetail]
  );

  const listFooter = useMemo(() => {
    if (loadingMore) {
      return (
        <View style={styles.listFooter}>
          <ActivityIndicator size="small" color={theme.accent} />
        </View>
      );
    }
    return <View style={styles.listFooterSpacer} />;
  }, [loadingMore]);

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
        <Text style={styles.screenTitle}>{t("orders.myOrders")}</Text>
        <View style={styles.topBarSide} />
      </View>

      <View style={styles.filterWrap}>
        <OrderFilterChips
          items={filterItems}
          selected={filter}
          onSelect={setFilter}
        />
      </View>

      {loading && !refreshing ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={styles.stateHint}>{t("orders.loadingOrders")}</Text>
        </View>
      ) : error && orders.length === 0 ? (
        <View style={styles.centerState}>
          <Ionicons name="cloud-offline-outline" size={40} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>{t("orders.loadFailedTitle")}</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => void onRefresh()}
            accessibilityRole="button"
            accessibilityLabel={t("common.retry")}
          >
            <Text style={styles.primaryBtnText}>{t("common.retry")}</Text>
          </Pressable>
        </View>
      ) : showShopEmptyState ? (
        <View style={styles.centerState}>
          <Ionicons name="bag-outline" size={40} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>{t("orders.noOrdersYet")}</Text>
          <Text style={styles.emptyText}>{t("orders.noOrdersHint")}</Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={openShop}
            accessibilityRole="button"
            accessibilityLabel={t("orders.exploreShop")}
          >
            <Text style={styles.primaryBtnText}>{t("orders.exploreShop")}</Text>
          </Pressable>
        </View>
      ) : showFilterEmptyState ? (
        <View style={styles.centerState}>
          <Ionicons name="funnel-outline" size={40} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>{t("orders.noResults")}</Text>
          <Text style={styles.emptyText}>{t("orders.noResultsHint")}</Text>
        </View>
      ) : (
        <FlatList
          style={styles.list}
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
          onEndReached={() => void onLoadMore()}
          onEndReachedThreshold={0.35}
          ListFooterComponent={listFooter}
          ListHeaderComponent={
            error ? (
              <View style={styles.inlineError}>
                <Text style={styles.inlineErrorText}>{error}</Text>
              </View>
            ) : null
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
  filterWrap: {
    flexGrow: 0,
    flexShrink: 0,
  },
  list: {
    flex: 1,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 10,
  },
  stateHint: {
    color: theme.textMuted,
    fontSize: 14,
    marginTop: 4,
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
  primaryBtn: {
    marginTop: 8,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  primaryBtnText: {
    color: theme.bg,
    fontSize: 15,
    fontWeight: "900",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 2,
  },
  listFooter: {
    paddingVertical: 16,
    alignItems: "center",
  },
  listFooterSpacer: {
    height: 8,
  },
  inlineError: {
    marginBottom: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255, 120, 120, 0.1)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 120, 120, 0.35)",
  },
  inlineErrorText: {
    color: "#FF9B9B",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
});
}

