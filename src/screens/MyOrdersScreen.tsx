import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import { BuyerOrderCard } from "../components/BuyerOrderCard";
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

export function MyOrdersScreen() {
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
          setError("Bestellingen laden mislukt. Trek naar beneden om opnieuw te proberen.");
        })
        .finally(() => setLoading(false));
    }, [loadInitial])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      await loadInitial();
    } catch {
      setError("Bestellingen laden mislukt. Trek naar beneden om opnieuw te proberen.");
    } finally {
      setRefreshing(false);
    }
  }, [loadInitial]);

  const onLoadMore = useCallback(async () => {
    if (loading || refreshing || loadingMore || !hasMore) {
      return;
    }
    setLoadingMore(true);
    try {
      await loadPage(orders.length, false);
    } catch {
      setError("Meer bestellingen laden mislukt.");
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadPage, loading, loadingMore, orders.length, refreshing]);

  const filteredOrders = useMemo(
    () => orders.filter((row) => matchesBuyerOrderFilter(row.order, filter)),
    [filter, orders]
  );

  const showShopEmptyState =
    !loading && !error && filter === "all" && orders.length === 0;
  const showFilterEmptyState =
    !loading && !error && !showShopEmptyState && filteredOrders.length === 0;

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
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={styles.stateHint}>Bestellingen laden…</Text>
        </View>
      ) : error && orders.length === 0 ? (
        <View style={styles.centerState}>
          <Ionicons name="cloud-offline-outline" size={40} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>Laden mislukt</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => void onRefresh()}
            accessibilityRole="button"
            accessibilityLabel="Opnieuw proberen"
          >
            <Text style={styles.primaryBtnText}>Opnieuw proberen</Text>
          </Pressable>
        </View>
      ) : showShopEmptyState ? (
        <View style={styles.centerState}>
          <Ionicons name="bag-outline" size={40} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>Nog geen bestellingen</Text>
          <Text style={styles.emptyText}>
            Alles wat je koopt op Kwaapo vind je hier terug.
          </Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={openShop}
            accessibilityRole="button"
            accessibilityLabel="Ontdek de shop"
          >
            <Text style={styles.primaryBtnText}>Ontdek de shop</Text>
          </Pressable>
        </View>
      ) : showFilterEmptyState ? (
        <View style={styles.centerState}>
          <Ionicons name="funnel-outline" size={40} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>Geen resultaten</Text>
          <Text style={styles.emptyText}>
            Geen bestellingen in dit filter. Probeer een ander filter of laad meer
            bestellingen.
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
    paddingTop: 4,
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
