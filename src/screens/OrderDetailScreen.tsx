import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../constants/theme";
import { AvatarImage } from "../components/AvatarImage";
import {
  fetchBuyerOrderById,
  fetchSellerOrderById,
  markSellerOrderAsShipped,
  type SellerOrder,
} from "../services/ordersService";
import type { BuyerOrder } from "../types/order";
import { PLATFORM_FEE_PERCENT_LABEL } from "../constants/platformFee";
import { formatPriceEur } from "../utils/formatPrice";
import {
  buyerDisplayName,
  formatOrderShortAddress,
  paymentStatusLabel,
  sellerDisplayName,
  shippingStatusLabel,
} from "../utils/orderDashboard";

type OrderDetailMode = "buyer" | "seller" | null;

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return d.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function OrderDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const orderId: string | undefined = route.params?.orderId;
  const [mode, setMode] = useState<OrderDetailMode>(null);
  const [sellerOrder, setSellerOrder] = useState<SellerOrder | null>(null);
  const [buyerOrder, setBuyerOrder] = useState<BuyerOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [shipBusy, setShipBusy] = useState(false);
  const [trackingCode, setTrackingCode] = useState("");

  const load = useCallback(async () => {
    if (!orderId) {
      setMode(null);
      setSellerOrder(null);
      setBuyerOrder(null);
      return;
    }
    const buyer = await fetchBuyerOrderById(orderId);
    if (buyer) {
      setMode("buyer");
      setBuyerOrder(buyer);
      setSellerOrder(null);
      return;
    }
    const seller = await fetchSellerOrderById(orderId);
    if (seller) {
      setMode("seller");
      setSellerOrder(seller);
      setBuyerOrder(null);
      return;
    }
    setMode(null);
    setSellerOrder(null);
    setBuyerOrder(null);
  }, [orderId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load().finally(() => setLoading(false));
    }, [load])
  );

  const order = useMemo(() => {
    if (mode === "buyer") {
      return buyerOrder?.order ?? null;
    }
    if (mode === "seller") {
      return sellerOrder?.order ?? null;
    }
    return null;
  }, [buyerOrder, mode, sellerOrder]);

  const firstItem = useMemo(() => {
    if (mode === "buyer") {
      return buyerOrder?.items[0] ?? null;
    }
    if (mode === "seller") {
      return sellerOrder?.items[0] ?? null;
    }
    return null;
  }, [buyerOrder, mode, sellerOrder]);

  const needsPayment = order?.paymentStatus === "unpaid";
  const readyToShip =
    order?.paymentStatus === "paid" && order.shippingStatus === "not_shipped";
  const isShipped =
    order?.shippingStatus === "shipped" || order?.shippingStatus === "delivered";

  const markAsShipped = useCallback(async () => {
    if (!order || mode !== "seller") {
      return;
    }
    setShipBusy(true);
    try {
      const updated = await markSellerOrderAsShipped(order.id, trackingCode);
      setSellerOrder((prev) => (prev ? { ...prev, order: updated } : prev));
      Alert.alert("Verzonden", "De bestelling is gemarkeerd als verzonden.");
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Verzending bijwerken mislukt.";
      Alert.alert("Fout", msg);
    } finally {
      setShipBusy(false);
    }
  }, [mode, order, trackingCode]);

  const screenTitle =
    mode === "buyer" ? "Mijn bestelling" : mode === "seller" ? "Bestelling" : "Bestelling";

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
        <Text style={styles.screenTitle}>{screenTitle}</Text>
        <View style={styles.topBarSide} />
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="small" color={theme.accent} />
        </View>
      ) : !order || !mode ? (
        <View style={styles.centerState}>
          <Text style={styles.emptyText}>Bestelling niet gevonden.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <Text style={styles.kicker}>
              {mode === "buyer"
                ? "Jouw bestelling"
                : needsPayment
                  ? "Nieuwe bestelling"
                  : readyToShip
                    ? "Klaar om te verzenden"
                    : isShipped
                      ? "Verzonden"
                      : "Bestelling"}
            </Text>
            <Text style={styles.orderNumber}>#{order.id.slice(0, 8)}</Text>
            <Text style={styles.dateText}>{formatDate(order.createdAt)}</Text>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusBadge,
                  order.paymentStatus === "paid"
                    ? styles.paymentPaidBadge
                    : styles.paymentUnpaidBadge,
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    order.paymentStatus === "paid"
                      ? styles.paymentPaidText
                      : styles.paymentUnpaidText,
                  ]}
                >
                  {paymentStatusLabel(order.paymentStatus)}
                </Text>
              </View>
              <View style={styles.statusBadge}>
                <Text style={styles.statusBadgeText}>
                  {shippingStatusLabel(order.shippingStatus)}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Product</Text>
            <View style={styles.productHeroRow}>
              {firstItem?.product?.images[0] ? (
                <Image
                  source={{ uri: firstItem.product.images[0] }}
                  style={styles.productHeroImage}
                />
              ) : (
                <View style={[styles.productHeroImage, styles.productThumbFallback]}>
                  <Ionicons name="image-outline" size={28} color={theme.textMuted} />
                </View>
              )}
              <View style={styles.productMain}>
                <Text style={styles.productName} numberOfLines={2}>
                  {firstItem?.product?.name ?? "Product"}
                </Text>
                <Text style={styles.productMeta}>
                  Aantal {firstItem?.quantity ?? 1}
                  {firstItem?.size ? ` · Maat ${firstItem.size}` : ""}
                </Text>
                <Text style={styles.productPriceLarge}>
                  {formatPriceEur(order.subtotalAmount)}
                </Text>
              </View>
            </View>
          </View>

          {mode === "buyer" && buyerOrder ? (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Verkoper</Text>
                <View style={styles.buyerRow}>
                  <AvatarImage
                    uri={buyerOrder.seller?.avatarUrl}
                    style={styles.buyerAvatar}
                  />
                  <View style={styles.productMain}>
                    <Text style={styles.productName}>
                      {sellerDisplayName(buyerOrder)}
                    </Text>
                    {buyerOrder.seller?.username ? (
                      <Text style={styles.productMeta}>
                        @{buyerOrder.seller.username}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Verzendadres</Text>
                <Text style={styles.addressLine}>{formatOrderShortAddress(order)}</Text>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Betaling</Text>
                <Text style={styles.productMeta}>
                  {paymentStatusLabel(order.paymentStatus)}
                  {order.paidAt
                    ? ` — betaald op ${formatDate(order.paidAt)}`
                    : ""}
                </Text>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Verzending</Text>
                <Text style={styles.productMeta}>
                  {shippingStatusLabel(order.shippingStatus)}
                </Text>
                {order.trackingCode ? (
                  <Text style={[styles.productMeta, styles.trackingCode]}>
                    Tracking: {order.trackingCode}
                  </Text>
                ) : null}
                {order.shippedAt ? (
                  <Text style={styles.productMeta}>
                    Verzonden op {formatDate(order.shippedAt)}
                  </Text>
                ) : null}
              </View>
            </>
          ) : null}

          {mode === "seller" && sellerOrder ? (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Koper</Text>
                <View style={styles.buyerRow}>
                  <AvatarImage
                    uri={sellerOrder.buyer?.avatarUrl}
                    style={styles.buyerAvatar}
                  />
                  <View style={styles.productMain}>
                    <Text style={styles.productName}>
                      {order.buyerFullName || buyerDisplayName(sellerOrder)}
                    </Text>
                    <Text style={styles.productMeta}>
                      {order.buyerEmail || "Geen email"}
                    </Text>
                    <Text style={styles.productMeta}>
                      {order.shippingPhone || "Geen telefoon"}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Verzendadres</Text>
                <Text style={styles.addressLine}>
                  {order.shippingStreet || "-"} {order.shippingHouseNumber || ""}
                </Text>
                <Text style={styles.addressLine}>
                  {order.shippingPostalCode || "-"} {order.shippingCity || ""}
                </Text>
                <Text style={styles.addressLine}>{order.shippingCountry || "-"}</Text>
                <View style={styles.instructionBox}>
                  <Ionicons name="cube-outline" size={18} color={theme.accent} />
                  <Text style={styles.instructionText}>
                    Verzend dit pakket naar bovenstaand adres. Werk de status bij zodra
                    het pakket is verzonden.
                  </Text>
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Betaling</Text>
                <Text style={styles.productMeta}>
                  {paymentStatusLabel(order.paymentStatus)}
                  {needsPayment
                    ? " — wacht op betaling van de koper."
                    : order.paidAt
                      ? ` — betaald op ${formatDate(order.paidAt)}`
                      : ""}
                </Text>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Verzending</Text>
                {order.trackingCode ? (
                  <Text style={styles.productMeta}>Tracking: {order.trackingCode}</Text>
                ) : null}
                {order.shippedAt ? (
                  <Text style={styles.productMeta}>
                    Verzonden op {formatDate(order.shippedAt)}
                  </Text>
                ) : null}
                {!isShipped ? (
                  <>
                    {!readyToShip ? (
                      <Text style={styles.productMeta}>
                        Wacht tot de betaling is voltooid voordat je verzendt.
                      </Text>
                    ) : null}
                    <TextInput
                      value={trackingCode}
                      onChangeText={setTrackingCode}
                      placeholder="Trackingcode (optioneel)"
                      placeholderTextColor={theme.textMuted}
                      style={styles.input}
                      autoCapitalize="characters"
                      editable={readyToShip}
                    />
                    <Pressable
                      style={[
                        styles.primaryBtn,
                        !readyToShip && styles.primaryBtnDisabled,
                      ]}
                      onPress={() => void markAsShipped()}
                      disabled={shipBusy || !readyToShip}
                      accessibilityRole="button"
                      accessibilityLabel="Markeer als verzonden"
                    >
                      {shipBusy ? (
                        <ActivityIndicator size="small" color={theme.bg} />
                      ) : (
                        <Text style={styles.primaryBtnText}>Markeer als verzonden</Text>
                      )}
                    </Pressable>
                  </>
                ) : (
                  <Text style={styles.productMeta}>
                    Deze bestelling is al gemarkeerd als verzonden.
                  </Text>
                )}
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Bedragen</Text>
                <View style={styles.amountRow}>
                  <Text style={styles.amountLabel}>Subtotaal</Text>
                  <Text style={styles.amountValue}>
                    {formatPriceEur(order.subtotalAmount)}
                  </Text>
                </View>
                <View style={styles.amountRow}>
                  <Text style={styles.amountLabel}>
                Platform fee ({PLATFORM_FEE_PERCENT_LABEL})
              </Text>
                  <Text style={styles.amountValue}>
                    {formatPriceEur(order.platformFeeAmount)}
                  </Text>
                </View>
                <View style={styles.amountRow}>
                  <Text style={styles.amountLabel}>Voor verkoper</Text>
                  <Text style={styles.amountValueAccent}>
                    {formatPriceEur(order.sellerAmount)}
                  </Text>
                </View>
              </View>
            </>
          ) : null}
        </ScrollView>
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
    marginBottom: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -8,
  },
  topBarSide: {
    width: 40,
  },
  screenTitle: {
    flex: 1,
    color: theme.text,
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyText: {
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  heroCard: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: theme.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    marginBottom: 14,
  },
  kicker: {
    color: theme.accent,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.4,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  orderNumber: {
    color: theme.text,
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 10,
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: theme.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.accentBorder,
  },
  statusBadgeText: {
    color: theme.accent,
    fontSize: 12,
    fontWeight: "900",
  },
  paymentPaidBadge: {
    backgroundColor: theme.accentMedium,
    borderColor: theme.accentBorderStrong,
  },
  paymentPaidText: {
    color: theme.accent,
  },
  paymentUnpaidBadge: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: theme.border,
  },
  paymentUnpaidText: {
    color: theme.textMuted,
  },
  dateText: {
    color: theme.textMuted,
    fontSize: 13,
    marginTop: 10,
  },
  section: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    marginBottom: 12,
  },
  sectionTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 12,
  },
  productHeroRow: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
  },
  productHeroImage: {
    width: 96,
    height: 96,
    borderRadius: 14,
    backgroundColor: theme.bgElevated,
  },
  productThumbFallback: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  productMain: {
    flex: 1,
    minWidth: 0,
  },
  productName: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "800",
  },
  productMeta: {
    color: theme.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  trackingCode: {
    marginTop: 8,
    fontWeight: "700",
    color: theme.text,
  },
  productPriceLarge: {
    color: theme.accent,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 8,
  },
  addressLine: {
    color: theme.text,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
  },
  instructionBox: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: theme.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.accentBorder,
  },
  instructionText: {
    flex: 1,
    color: theme.text,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  input: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: theme.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    color: theme.text,
    paddingHorizontal: 12,
    fontSize: 14,
    marginTop: 12,
    marginBottom: 10,
  },
  buyerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  buyerAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: theme.bgElevated,
  },
  amountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 7,
  },
  amountLabel: {
    color: theme.textMuted,
    fontSize: 14,
  },
  amountValue: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "700",
  },
  amountValueAccent: {
    color: theme.accent,
    fontSize: 15,
    fontWeight: "900",
  },
  primaryBtn: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnDisabled: {
    opacity: 0.45,
  },
  primaryBtnText: {
    color: theme.bg,
    fontSize: 15,
    fontWeight: "900",
  },
});
