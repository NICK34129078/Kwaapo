import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { fetchProfileById } from "../services/profileService";
import {
  deleteProduct,
  fetchMyProducts,
  setProductActive,
} from "../services/productsService";
import {
  emitProductCatalogEvent,
  mergeProductIntoList,
  removeProductFromList,
  subscribeProductCatalog,
} from "../services/productCatalogRefresh";
import { fetchSellerOrders, type SellerOrderListRow } from "../services/ordersService";
import {
  markSellerNotificationRead,
  type SellerNotification,
} from "../services/sellerNotificationService";
import {
  canSellerPrepareProducts,
  canSellerManageProducts,
  fetchMySellerOnboarding,
  isSellerPayoutReadyForSales,
  resolveSellerDashboardUI,
} from "../services/sellerOnboardingService";
import { startStripePayoutManagement } from "../services/stripeConnectService";
import { SellerOnboardingStatusCard } from "../components/SellerOnboardingStatusCard";
import type { SellerOnboarding } from "../types/sellerOnboarding";
import type { Product } from "../types/product";
import { formatPriceEur } from "../utils/formatPrice";
import { getProductStockStatus } from "../utils/productStock";
import { SellerActionRequiredCard } from "../components/SellerActionRequiredCard";
import { useSellerFulfillment } from "../context/SellerFulfillmentContext";
import {
  orderNeedsSellerAction,
  sellerFulfillmentLabel,
  sortSellerOrders,
  matchesSellerOrderFilter,
  SELLER_ORDER_FILTERS,
  type SellerOrderFilter,
} from "../utils/sellerFulfillment";
import {
  buyerDisplayName,
  formatOrderItemSizeLine,
} from "../utils/orderDashboard";

type MyShopTab = "products" | "orders";

function formatOrderDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ProductManageRow({
  product,
  onPress,
  onToggleActive,
  onDelete,
  onAddStock,
  toggleBusy,
}: {
  product: Product;
  onPress: () => void;
  onToggleActive: (next: boolean) => void;
  onDelete: () => void;
  onAddStock: () => void;
  toggleBusy: boolean;
}) {
  const imageUri = product.images[0];
  const stockStatus = getProductStockStatus(product.stock);

  return (
    <Pressable
      style={styles.row}
      onPress={onPress}
      onLongPress={onDelete}
      accessibilityRole="button"
      accessibilityLabel={product.name}
      accessibilityHint="Lang indrukken om te verwijderen"
    >
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback]}>
          <Ionicons name="image-outline" size={22} color={theme.textMuted} />
        </View>
      )}
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {product.name}
        </Text>
        <Text style={styles.rowPrice}>{formatPriceEur(product.price)}</Text>
        <View style={styles.rowMeta}>
          {product.category ? (
            <Text style={styles.rowCategory} numberOfLines={1}>
              {product.category}
            </Text>
          ) : null}
          <Text
            style={[
              styles.rowStock,
              stockStatus.tone === "out" && styles.rowStockOut,
              stockStatus.tone === "low" && styles.rowStockLow,
            ]}
          >
            {stockStatus.label}
          </Text>
          {stockStatus.sublabel ? (
            <Text style={styles.rowStockHint}>{stockStatus.sublabel}</Text>
          ) : null}
        </View>
        {stockStatus.tone === "out" ? (
          <Pressable
            style={styles.addStockBtn}
            onPress={(event) => {
              event.stopPropagation();
              onAddStock();
            }}
            accessibilityRole="button"
            accessibilityLabel="Voorraad toevoegen"
          >
            <Ionicons name="add-circle-outline" size={16} color={theme.accent} />
            <Text style={styles.addStockBtnText}>Voorraad toevoegen</Text>
          </Pressable>
        ) : null}
        <View style={styles.activeRow}>
          <Text style={styles.activeLabel}>
            {product.isActive ? "Actief" : "Concept"}
          </Text>
          <Switch
            value={product.isActive}
            onValueChange={onToggleActive}
            disabled={toggleBusy}
            trackColor={{ false: theme.border, true: theme.accentSoft }}
            thumbColor={product.isActive ? theme.accent : theme.textMuted}
          />
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
    </Pressable>
  );
}

function SellerOrderCard({
  sellerOrder,
  onPress,
}: {
  sellerOrder: SellerOrderListRow;
  onPress: () => void;
}) {
  const firstItem = sellerOrder.items[0];
  const product = firstItem?.product;
  const order = sellerOrder.order;
  const buyerName = buyerDisplayName(sellerOrder);
  const fulfillmentLabel = sellerFulfillmentLabel(
    order,
    sellerOrder.fulfillment.fulfillmentStatus
  );
  const needsShip = orderNeedsSellerAction(order, {
    fulfillmentStatus: sellerOrder.fulfillment.fulfillmentStatus,
  });
  const sizeLine = formatOrderItemSizeLine(firstItem);

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
        <View style={[styles.orderCardImage, styles.thumbFallback]}>
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
          {buyerName}
        </Text>
        {sizeLine ? (
          <Text style={styles.orderCardMeta}>{sizeLine}</Text>
        ) : null}
        <Text style={styles.orderCardDate}>
          {formatOrderDate(order.createdAt)} · #{order.id.slice(0, 8)}
        </Text>
        <View style={styles.orderBadgeRow}>
          <View
            style={[
              styles.orderBadge,
              needsShip ? styles.orderBadgePaid : styles.orderBadgeMuted,
            ]}
          >
            <Text
              style={[
                styles.orderBadgeText,
                needsShip ? styles.orderBadgeTextPaid : styles.orderBadgeTextMuted,
              ]}
            >
              {fulfillmentLabel}
            </Text>
          </View>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
    </Pressable>
  );
}

export function MyShopScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const {
    actionCount,
    openNotifications,
    refresh: refreshSellerFulfillment,
  } = useSellerFulfillment();
  const [activeTab, setActiveTab] = useState<MyShopTab>("products");
  const [orderFilter, setOrderFilter] = useState<SellerOrderFilter>("action_required");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<SellerOrderListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toggleBusyId, setToggleBusyId] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [sellerOnboarding, setSellerOnboarding] = useState<SellerOnboarding | null>(
    null
  );

  const load = useCallback(async () => {
    if (!user?.id) {
      setAccessDenied(true);
      setProducts([]);
      setSellerOnboarding(null);
      return;
    }
    const profile = await fetchProfileById(user.id);
    if (profile?.accountType !== "business") {
      setAccessDenied(true);
      setProducts([]);
      setSellerOnboarding(null);
      return;
    }
    setAccessDenied(false);
    const [productRows, orderRows, onboardingRow] = await Promise.all([
      fetchMyProducts(true),
      fetchSellerOrders(),
      fetchMySellerOnboarding(),
    ]);
    setProducts(productRows);
    setOrders(orderRows);
    setSellerOnboarding(onboardingRow);
    void refreshSellerFulfillment();
  }, [refreshSellerFulfillment, user?.id]);

  useEffect(() => {
    if (route.params?.initialTab === "orders") {
      setActiveTab("orders");
    }
    if (route.params?.orderFilter) {
      setOrderFilter(route.params.orderFilter as SellerOrderFilter);
    }
  }, [route.params?.initialTab, route.params?.orderFilter]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load().finally(() => setLoading(false));
    }, [load])
  );

  useEffect(() => {
    return subscribeProductCatalog((event) => {
      if (event.kind === "created" || event.kind === "updated") {
        setProducts((prev) => mergeProductIntoList(prev, event.product));
      } else if (event.kind === "deleted") {
        setProducts((prev) => removeProductFromList(prev, event.productId));
      } else {
        void load();
      }
    });
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  }, [load]);

  const canPublishProducts = canSellerManageProducts(sellerOnboarding);
  const canPrepareProducts = canSellerPrepareProducts(sellerOnboarding);
  const sellerDashboard = resolveSellerDashboardUI(sellerOnboarding);

  const openOnboarding = useCallback(() => {
    navigation.navigate("SellerOnboarding");
  }, [navigation]);

  const confirmDelete = useCallback(
    (product: Product) => {
      Alert.alert(
        "Product verwijderen?",
        `"${product.name}" wordt permanent verwijderd.`,
        [
          { text: "Annuleren", style: "cancel" },
          {
            text: "Verwijderen",
            style: "destructive",
            onPress: () => {
              void (async () => {
                try {
                  await deleteProduct(product.id);
                  setProducts((prev) => prev.filter((p) => p.id !== product.id));
                  emitProductCatalogEvent({ kind: "deleted", productId: product.id });
                } catch (e) {
                  const msg =
                    e instanceof Error ? e.message : "Verwijderen mislukt.";
                  Alert.alert("Fout", msg);
                }
              })();
            },
          },
        ]
      );
    },
    []
  );

  const onToggleActive = useCallback(
    async (product: Product, next: boolean) => {
      if (next && !canPublishProducts) {
        Alert.alert(
          "Stripe nog niet klaar",
          "Rond je verkoopaccount en Stripe-uitbetalingen af voordat je producten publiek activeert.",
          [
            { text: "Annuleren", style: "cancel" },
            { text: "Verkoopaccount", onPress: openOnboarding },
          ]
        );
        return;
      }
      setToggleBusyId(product.id);
      try {
        const updated = await setProductActive(product.id, next);
        setProducts((prev) =>
          prev.map((p) => (p.id === product.id ? updated : p))
        );
        emitProductCatalogEvent({ kind: "updated", product: updated });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Status wijzigen mislukt.";
        Alert.alert("Fout", msg);
      } finally {
        setToggleBusyId(null);
      }
    },
    [canPublishProducts, openOnboarding]
  );

  const renderItem = useCallback(
    ({ item }: { item: Product }) => (
      <ProductManageRow
        product={item}
        onPress={() =>
          navigation.navigate("ProductDetail", {
            productId: item.id,
            canManage: true,
          })
        }
        onToggleActive={(next) => void onToggleActive(item, next)}
        onDelete={() => confirmDelete(item)}
        onAddStock={() =>
          navigation.navigate("ProductForm", {
            productId: item.id,
            openStockAdd: true,
          })
        }
        toggleBusy={toggleBusyId === item.id}
      />
    ),
    [confirmDelete, navigation, onToggleActive, toggleBusyId]
  );

  const renderOrderItem = useCallback(
    ({ item }: { item: SellerOrderListRow }) => (
      <SellerOrderCard
        sellerOrder={item}
        onPress={() =>
          navigation.navigate("OrderDetail", {
            orderId: item.order.id,
          })
        }
      />
    ),
    [navigation]
  );

  const ordersBadgeCount = actionCount;

  const sortedOrders = useMemo(() => sortSellerOrders(orders), [orders]);

  const filteredOrders = useMemo(
    () =>
      sortedOrders.filter((row) =>
        matchesSellerOrderFilter(row.order, orderFilter, {
          fulfillmentStatus: row.fulfillment.fulfillmentStatus,
        })
      ),
    [orderFilter, sortedOrders]
  );

  const onOpenNotification = useCallback(
    (notification: SellerNotification) => {
      void markSellerNotificationRead(notification.id);
      void refreshSellerFulfillment();
      navigation.navigate("OrderDetail", { orderId: notification.orderId });
    },
    [navigation, refreshSellerFulfillment]
  );

  const openActionRequiredOrders = useCallback(() => {
    setActiveTab("orders");
    setOrderFilter("action_required");
  }, []);

  const activeData = useMemo<Array<Product | SellerOrderListRow>>(
    () => (activeTab === "products" ? products : filteredOrders),
    [activeTab, filteredOrders, products]
  );

  const tryOpenProductForm = useCallback(() => {
    if (!canPrepareProducts) {
      Alert.alert(
        "Zakelijk account nodig",
        "Stel eerst een zakelijk verkoopaccount in voordat je producten voorbereidt.",
        [
          { text: "Annuleren", style: "cancel" },
          { text: "Verkoopaccount", onPress: openOnboarding },
        ]
      );
      return;
    }
    navigation.navigate("ProductForm", {});
  }, [canPrepareProducts, navigation, openOnboarding]);

  const onManagePayout = useCallback(async () => {
    const result = await startStripePayoutManagement();
    if (!result.ok) {
      Alert.alert("Stripe", result.message);
      return;
    }
    const row = await fetchMySellerOnboarding();
    setSellerOnboarding(row);
  }, []);

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
        <Text style={styles.screenTitle}>Mijn Winkel</Text>
        <Pressable
          onPress={tryOpenProductForm}
          style={styles.addBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Product toevoegen"
          disabled={accessDenied}
        >
          <Ionicons name="add" size={28} color={theme.accent} />
        </Pressable>
      </View>

      {loading && !refreshing ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="small" color={theme.accent} />
        </View>
      ) : accessDenied ? (
        <View style={styles.centerState}>
          <Ionicons name="lock-closed-outline" size={40} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>Alleen voor business accounts</Text>
          <Text style={styles.emptyText}>
            Zet je account op business om producten te beheren.
          </Text>
        </View>
      ) : (
        <FlatList
          data={activeData}
          keyExtractor={(item) =>
            activeTab === "products"
              ? (item as Product).id
              : (item as SellerOrderListRow).order.id
          }
          renderItem={({ item }) =>
            activeTab === "products"
              ? renderItem({ item: item as Product })
              : renderOrderItem({ item: item as SellerOrderListRow })
          }
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: 32 + insets.bottom },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.accent}
              colors={[theme.accent]}
            />
          }
          ListHeaderComponent={
            <View>
              <SellerActionRequiredCard
                actionCount={actionCount}
                onPress={openActionRequiredOrders}
              />
              {sellerOnboarding ? (
                <SellerOnboardingStatusCard
                  onboarding={sellerOnboarding}
                  onPress={openOnboarding}
                />
              ) : null}
              {sellerDashboard.showPayoutManage ? (
                <Pressable
                  style={styles.payoutManageBtn}
                  onPress={() => void onManagePayout()}
                  accessibilityRole="button"
                  accessibilityLabel="Uitbetalingsrekening beheren"
                >
                  <Text style={styles.payoutManageBtnText}>
                    Uitbetalingsrekening beheren
                  </Text>
                </Pressable>
              ) : null}
              {!canPrepareProducts && activeTab === "products" ? (
                <View style={styles.productsGate}>
                  <Ionicons name="shield-checkmark-outline" size={36} color={theme.textMuted} />
                  <Text style={styles.productsGateTitle}>Eerst verkoopaccount afronden</Text>
                  <Text style={styles.productsGateText}>
                    Stel een zakelijk verkoopaccount in om productconcepten voor te bereiden.
                    Publiek activeren kan pas na Stripe-uitbetalingen.
                  </Text>
                  <Pressable
                    style={styles.primaryBtn}
                    onPress={openOnboarding}
                    accessibilityRole="button"
                    accessibilityLabel="Verkoopaccount instellen"
                  >
                    <Text style={styles.primaryBtnText}>Verkoopaccount instellen</Text>
                  </Pressable>
                </View>
              ) : null}
              <View style={styles.shopTabs}>
                <Pressable
                  style={[
                    styles.shopTab,
                    activeTab === "products" && styles.shopTabActive,
                  ]}
                  onPress={() => setActiveTab("products")}
                  accessibilityRole="button"
                  accessibilityLabel="Producten"
                >
                  <Text
                    style={[
                      styles.shopTabText,
                      activeTab === "products" && styles.shopTabTextActive,
                    ]}
                  >
                    Producten
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.shopTab,
                    activeTab === "orders" && styles.shopTabActive,
                  ]}
                  onPress={() => setActiveTab("orders")}
                  accessibilityRole="button"
                  accessibilityLabel="Bestellingen"
                >
                  <View style={styles.shopTabInner}>
                    <Text
                      style={[
                        styles.shopTabText,
                        activeTab === "orders" && styles.shopTabTextActive,
                      ]}
                    >
                      Bestellingen
                    </Text>
                    {ordersBadgeCount > 0 ? (
                      <View style={styles.tabBadge}>
                        <Text style={styles.tabBadgeText}>
                          {ordersBadgeCount > 99 ? "99+" : ordersBadgeCount}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              </View>
              {openNotifications.length > 0
                ? openNotifications.slice(0, 5).map((notification) => (
                    <Pressable
                      key={notification.id}
                      style={styles.notificationBanner}
                      onPress={() => onOpenNotification(notification)}
                      accessibilityRole="button"
                      accessibilityLabel={notification.title}
                    >
                      <Ionicons
                        name="notifications-outline"
                        size={20}
                        color={theme.accent}
                      />
                      <View style={styles.shipAlertBannerText}>
                        <Text style={styles.shipAlertTitle} numberOfLines={1}>
                          {notification.title}
                        </Text>
                        <Text style={styles.shipAlertSubtitle} numberOfLines={2}>
                          {notification.body}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
                    </Pressable>
                  ))
                : null}
              {activeTab === "orders" ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filterRow}
                >
                  {SELLER_ORDER_FILTERS.map((chip) => {
                    const selected = orderFilter === chip.id;
                    return (
                      <Pressable
                        key={chip.id}
                        style={[
                          styles.filterChip,
                          selected && styles.filterChipActive,
                        ]}
                        onPress={() => setOrderFilter(chip.id)}
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
              ) : null}
              <Text style={styles.subtitle}>
                {activeTab === "products"
                  ? canPrepareProducts
                    ? canPublishProducts
                      ? "Beheer je producten. Lang indrukken om te verwijderen."
                      : "Bereid concepten voor. Publiek activeren kan na volledige Stripe-setup."
                    : "Producten toevoegen is beschikbaar na een zakelijk verkoopaccount."
                  : "Filter op status. Betaalde bestellingen die actie vereisen staan bovenaan."}
              </Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.centerState}>
              <Ionicons
                name={activeTab === "products" ? "storefront-outline" : "receipt-outline"}
                size={44}
                color={theme.textMuted}
              />
              <Text style={styles.emptyTitle}>
                {activeTab === "products"
                  ? "Nog geen producten"
                  : orders.length === 0
                    ? "Nog geen bestellingen"
                    : "Geen bestellingen in dit filter"}
              </Text>
              <Text style={styles.emptyText}>
                {activeTab === "products"
                  ? "Voeg je eerste product toe met de + knop."
                  : orders.length === 0
                    ? "Nieuwe bestellingen verschijnen hier."
                    : "Kies een ander filter om meer orders te zien."}
              </Text>
              {activeTab === "products" && canPrepareProducts ? (
                <Pressable
                  style={styles.primaryBtn}
                  onPress={tryOpenProductForm}
                  accessibilityRole="button"
                  accessibilityLabel="Product toevoegen"
                >
                  <Text style={styles.primaryBtnText}>Product toevoegen</Text>
                </Pressable>
              ) : null}
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
    paddingHorizontal: 16,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -8,
  },
  addBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginRight: -8,
  },
  screenTitle: {
    flex: 1,
    color: theme.text,
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  subtitle: {
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  shipAlertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    marginBottom: 10,
    borderRadius: 12,
    backgroundColor: theme.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.accentBorderStrong,
  },
  notificationBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: theme.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  shipAlertBannerText: {
    flex: 1,
    gap: 2,
  },
  shipAlertTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "700",
  },
  shipAlertSubtitle: {
    color: theme.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  shopTabs: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  shopTab: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  shopTabActive: {
    backgroundColor: theme.accentSoft,
    borderColor: theme.accentBorderStrong,
  },
  shopTabText: {
    color: theme.textMuted,
    fontSize: 14,
    fontWeight: "700",
  },
  shopTabTextActive: {
    color: theme.accent,
  },
  shopTabInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tabBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBadgeText: {
    color: theme.bg,
    fontSize: 11,
    fontWeight: "900",
  },
  filterRow: {
    gap: 8,
    paddingBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: theme.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  filterChipActive: {
    backgroundColor: theme.accentSoft,
    borderColor: theme.accentBorderStrong,
  },
  filterChipText: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: "800",
  },
  filterChipTextActive: {
    color: theme.accent,
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
  orderCardImage: {
    width: 88,
    height: 88,
    borderRadius: 14,
    backgroundColor: theme.bg,
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
    marginTop: 6,
  },
  orderCardMeta: {
    color: theme.textMuted,
    fontSize: 12,
    marginTop: 2,
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
    marginTop: 10,
  },
  orderBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  orderBadgePaid: {
    backgroundColor: theme.accentSoft,
    borderColor: theme.accentBorder,
  },
  orderBadgeMuted: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  orderBadgeText: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: "800",
  },
  orderBadgeTextPaid: {
    color: theme.accent,
  },
  orderBadgeTextMuted: {
    color: theme.textMuted,
  },
  listContent: {
    flexGrow: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: theme.bgElevated,
  },
  thumbFallback: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "700",
  },
  rowPrice: {
    color: theme.accent,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 2,
  },
  rowMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  rowCategory: {
    color: theme.textMuted,
    fontSize: 12,
  },
  rowStock: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  rowStockLow: {
    color: "#d4a017",
  },
  rowStockOut: {
    color: "#e07a5f",
  },
  rowStockHint: {
    color: theme.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  addStockBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: theme.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.accentBorderMuted,
  },
  addStockBtnText: {
    color: theme.accent,
    fontSize: 13,
    fontWeight: "800",
  },
  rowMetaLine: {
    color: theme.textMuted,
    fontSize: 13,
    marginTop: 3,
  },
  statusBadge: {
    alignSelf: "flex-start",
    marginTop: 7,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: theme.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.accentBorder,
  },
  statusBadgeText: {
    color: theme.accent,
    fontSize: 11,
    fontWeight: "800",
  },
  activeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
    paddingRight: 4,
  },
  activeLabel: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  centerState: {
    paddingVertical: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    gap: 8,
  },
  emptyTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyText: {
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  productsGate: {
    alignItems: "center",
    padding: 16,
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: theme.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    gap: 8,
  },
  productsGateTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
  },
  productsGateText: {
    color: theme.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginBottom: 4,
  },
  primaryBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: theme.accent,
  },
  primaryBtnText: {
    color: theme.bg,
    fontSize: 15,
    fontWeight: "700",
  },
  payoutManageBtn: {
    marginBottom: 14,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.accentBorder,
    backgroundColor: theme.accentLight,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  payoutManageBtnText: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "800",
  },
});
