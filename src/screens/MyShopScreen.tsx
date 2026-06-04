import React, { useCallback, useMemo, useState } from "react";
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
import { useFocusEffect, useNavigation } from "@react-navigation/native";
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
import { fetchSellerOrders } from "../services/ordersService";
import {
  canSellerManageProducts,
  fetchMySellerOnboarding,
} from "../services/sellerOnboardingService";
import { SellerOnboardingStatusCard } from "../components/SellerOnboardingStatusCard";
import type { SellerOnboarding } from "../types/sellerOnboarding";
import type { Product } from "../types/product";
import type { SellerOrder } from "../types/order";
import { formatPriceEur } from "../utils/formatPrice";
import {
  buyerDisplayName,
  countSellerOrdersNeedingAttention,
  matchesSellerOrderFilter,
  paymentStatusLabel,
  SELLER_ORDER_FILTERS,
  shippingStatusLabel,
  type SellerOrderFilter,
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
  toggleBusy,
}: {
  product: Product;
  onPress: () => void;
  onToggleActive: (next: boolean) => void;
  onDelete: () => void;
  toggleBusy: boolean;
}) {
  const imageUri = product.images[0];

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
          <Text style={styles.rowStock}>Voorraad: {product.stock}</Text>
        </View>
        <View style={styles.activeRow}>
          <Text style={styles.activeLabel}>
            {product.isActive ? "Actief" : "Inactief"}
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
  sellerOrder: SellerOrder;
  onPress: () => void;
}) {
  const firstItem = sellerOrder.items[0];
  const product = firstItem?.product;
  const order = sellerOrder.order;
  const buyerName = buyerDisplayName(sellerOrder);
  const paid = order.paymentStatus === "paid";

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
        <Text style={styles.orderCardDate}>
          {formatOrderDate(order.createdAt)} · #{order.id.slice(0, 8)}
        </Text>
        <View style={styles.orderBadgeRow}>
          <View
            style={[
              styles.orderBadge,
              paid ? styles.orderBadgePaid : styles.orderBadgeMuted,
            ]}
          >
            <Text
              style={[
                styles.orderBadgeText,
                paid ? styles.orderBadgeTextPaid : styles.orderBadgeTextMuted,
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

export function MyShopScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<MyShopTab>("products");
  const [orderFilter, setOrderFilter] = useState<SellerOrderFilter>("new");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<SellerOrder[]>([]);
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
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load().finally(() => setLoading(false));
    }, [load])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  }, [load]);

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

  const onToggleActive = useCallback(async (product: Product, next: boolean) => {
    setToggleBusyId(product.id);
    try {
      const updated = await setProductActive(product.id, next);
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? updated : p))
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Status wijzigen mislukt.";
      Alert.alert("Fout", msg);
    } finally {
      setToggleBusyId(null);
    }
  }, []);

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
        toggleBusy={toggleBusyId === item.id}
      />
    ),
    [confirmDelete, navigation, onToggleActive, toggleBusyId]
  );

  const renderOrderItem = useCallback(
    ({ item }: { item: SellerOrder }) => (
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

  const ordersBadgeCount = useMemo(
    () => countSellerOrdersNeedingAttention(orders),
    [orders]
  );

  const filteredOrders = useMemo(
    () => orders.filter((row) => matchesSellerOrderFilter(row.order, orderFilter)),
    [orderFilter, orders]
  );

  const activeData = useMemo<Array<Product | SellerOrder>>(
    () => (activeTab === "products" ? products : filteredOrders),
    [activeTab, filteredOrders, products]
  );

  const canManageProducts = canSellerManageProducts(sellerOnboarding);

  const openOnboarding = useCallback(() => {
    navigation.navigate("SellerOnboarding");
  }, [navigation]);

  const tryOpenProductForm = useCallback(() => {
    if (!canManageProducts) {
      Alert.alert(
        "Verificatie nodig",
        "Rond je verkoopaccount af en wacht op goedkeuring voordat je producten toevoegt.",
        [
          { text: "Annuleren", style: "cancel" },
          { text: "Verkoopaccount", onPress: openOnboarding },
        ]
      );
      return;
    }
    navigation.navigate("ProductForm", {});
  }, [canManageProducts, navigation, openOnboarding]);

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
              : (item as SellerOrder).order.id
          }
          renderItem={({ item }) =>
            activeTab === "products"
              ? renderItem({ item: item as Product })
              : renderOrderItem({ item: item as SellerOrder })
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
              {sellerOnboarding ? (
                <SellerOnboardingStatusCard
                  onboarding={sellerOnboarding}
                  onPress={openOnboarding}
                />
              ) : null}
              {!canManageProducts && activeTab === "products" ? (
                <View style={styles.productsGate}>
                  <Ionicons name="shield-checkmark-outline" size={36} color={theme.textMuted} />
                  <Text style={styles.productsGateTitle}>Eerst verkoopaccount afronden</Text>
                  <Text style={styles.productsGateText}>
                    Na goedkeuring van je KVK- en bedrijfsgegevens kun je producten toevoegen
                    en officiële verkopen ontvangen.
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
                  ? canManageProducts
                    ? "Beheer je producten. Lang indrukken om te verwijderen."
                    : "Producten toevoegen is beschikbaar na goedkeuring van je verkoopaccount."
                  : "Filter op status en tik een bestelling voor verzendgegevens."}
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
              {activeTab === "products" && canManageProducts ? (
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
    borderColor: "rgba(158, 255, 0, 0.45)",
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
    borderColor: "rgba(158, 255, 0, 0.45)",
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
    borderColor: "rgba(158, 255, 0, 0.35)",
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
    borderColor: "rgba(158, 255, 0, 0.35)",
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
});
