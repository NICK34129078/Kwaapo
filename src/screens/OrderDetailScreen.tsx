import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
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
  type BuyerOrderDetail,
  type SellerOrderDetail,
} from "../services/ordersService";
import { payOrderWithStripe } from "../services/checkoutFlowService";
import {
  markSellerNotificationsHandledForOrder,
} from "../services/sellerNotificationService";
import { useSellerFulfillment } from "../context/SellerFulfillmentContext";
import {
  EMPTY_SELLER_SHIP_CHECKLIST,
  isSellerShipChecklistComplete,
  SellerShipChecklist,
  type SellerShipChecklistState,
} from "../components/SellerShipChecklist";
import { orderNeedsSellerAction } from "../utils/sellerFulfillment";
import type { BuyerOrder } from "../types/order";
import { PLATFORM_FEE_PERCENT_LABEL } from "../constants/platformFee";
import { formatPriceEur } from "../utils/formatPrice";
import {
  buyerDisplayName,
  formatOrderItemSizeLabel,
  formatOrderShortAddress,
  paymentStatusLabel,
  sellerDisplayName,
  shippingStatusLabel,
} from "../utils/orderDashboard";
import {
  buyerPaymentHeadline,
  fulfillmentBlocksSellerShip,
  getOrderFulfillmentDisplay,
  type OrderFulfillmentInfo,
} from "../utils/orderFulfillmentDisplay";
import { formatSellerShipUpdateError } from "../utils/orderShipError";

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
  const focusTracking = route.params?.focusTracking === true;
  const trackingInputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const buyerShippingSectionY = useRef(0);
  const [mode, setMode] = useState<OrderDetailMode>(null);
  const [sellerOrder, setSellerOrder] = useState<SellerOrderDetail | null>(null);
  const [buyerOrder, setBuyerOrder] = useState<BuyerOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [shipBusy, setShipBusy] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [shipConfirmVisible, setShipConfirmVisible] = useState(false);
  const [shipChecklist, setShipChecklist] = useState<SellerShipChecklistState>(
    EMPTY_SELLER_SHIP_CHECKLIST
  );
  const [trackingCode, setTrackingCode] = useState("");
  const { refresh: refreshSellerFulfillment, reportShippingStarted, reportShippingConfirmed, reportShippingFailed } = useSellerFulfillment();

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
      void refreshSellerFulfillment();
      return;
    }
    setMode(null);
    setSellerOrder(null);
    setBuyerOrder(null);
  }, [orderId, refreshSellerFulfillment]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load().finally(() => setLoading(false));
    }, [load])
  );

  useFocusEffect(
    useCallback(() => {
      if (!focusTracking) {
        return;
      }
      const timer = setTimeout(() => {
        if (mode === "seller") {
          trackingInputRef.current?.focus();
          return;
        }
        if (mode === "buyer") {
          scrollRef.current?.scrollTo({
            y: Math.max(0, buyerShippingSectionY.current - 16),
            animated: true,
          });
        }
      }, 350);
      return () => clearTimeout(timer);
    }, [focusTracking, mode])
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

  const fulfillment: OrderFulfillmentInfo | null = useMemo(() => {
    if (mode === "buyer") {
      return buyerOrder?.fulfillment ?? null;
    }
    if (mode === "seller") {
      return sellerOrder?.fulfillment ?? null;
    }
    return null;
  }, [buyerOrder, mode, sellerOrder]);

  const fulfillmentDisplay = useMemo(() => {
    if (!order || !mode) {
      return null;
    }
    return getOrderFulfillmentDisplay(order.paymentStatus, fulfillment, mode);
  }, [fulfillment, mode, order]);

  const needsPayment = order?.paymentStatus === "unpaid";
  const readyToShip =
    mode === "seller" &&
    order != null &&
    orderNeedsSellerAction(order) &&
    !fulfillmentBlocksSellerShip(fulfillment);
  const checklistComplete = isSellerShipChecklistComplete(shipChecklist);
  const isShipped =
    order?.shippingStatus === "shipped" || order?.shippingStatus === "delivered";

  const markAsShipped = useCallback(async () => {
    if (!order || mode !== "seller") {
      return;
    }
    setShipBusy(true);
    reportShippingStarted(order.id);
    try {
      const updated = await markSellerOrderAsShipped(order.id, trackingCode);
      if (
        updated.shippingStatus !== "shipped" &&
        updated.shippingStatus !== "delivered"
      ) {
        throw new Error("Verzending kon niet worden bevestigd in de database.");
      }
      setSellerOrder((prev) => (prev ? { ...prev, order: updated } : prev));
      void markSellerNotificationsHandledForOrder(order.id);
      reportShippingConfirmed(order.id);
      setShipConfirmVisible(false);
      setShipChecklist(EMPTY_SELLER_SHIP_CHECKLIST);
      navigation.reset({
        index: 1,
        routes: [
          { name: "MainTabs", params: { screen: "Home" } },
          { name: "OrderShippedSuccess", params: { orderId: order.id } },
        ],
      });
    } catch (e) {
      reportShippingFailed(order.id);
      const msg = formatSellerShipUpdateError(e);
      Alert.alert("Verzending mislukt", msg);
    } finally {
      setShipBusy(false);
    }
  }, [
    mode,
    navigation,
    order,
    reportShippingConfirmed,
    reportShippingFailed,
    reportShippingStarted,
    trackingCode,
  ]);

  const onConfirmShipPress = useCallback(() => {
    if (!order || mode !== "seller" || !readyToShip) {
      return;
    }
    setShipConfirmVisible(true);
  }, [mode, order, readyToShip]);

  const onPayOrder = useCallback(async () => {
    if (!order || mode !== "buyer") {
      return;
    }
    setPayBusy(true);
    try {
      const payment = await payOrderWithStripe(order.id);
      if (payment.ok) {
        navigation.reset({
          index: 1,
          routes: [
            { name: "MainTabs", params: { screen: "Shop" } },
            { name: "OrderSuccess", params: { orderId: payment.orderId } },
          ],
        });
        return;
      }
      if (payment.reason === "pending") {
        Alert.alert(
          "Betaling wordt verwerkt",
          payment.message ??
            "Je betaling kan nog worden bevestigd. Controleer deze bestelling over een moment."
        );
        void load();
        return;
      }
      navigation.navigate("CheckoutFailed", {
        reason: payment.reason,
        orderId: payment.orderId,
        productId: firstItem?.productId,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Betaling starten mislukt.";
      Alert.alert("Fout", msg);
    } finally {
      setPayBusy(false);
    }
  }, [firstItem?.productId, load, mode, navigation, order]);

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
          ref={scrollRef}
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
                  {buyerPaymentHeadline(order.paymentStatus, fulfillment) ??
                    paymentStatusLabel(order.paymentStatus)}
                </Text>
              </View>
              <View style={styles.statusBadge}>
                <Text style={styles.statusBadgeText}>
                  {shippingStatusLabel(order.shippingStatus)}
                </Text>
              </View>
            </View>
            {fulfillmentDisplay ? (
              <View
                style={[
                  styles.fulfillmentBanner,
                  fulfillmentDisplay.tone === "warning"
                    ? styles.fulfillmentBannerWarning
                    : fulfillmentDisplay.tone === "success"
                      ? styles.fulfillmentBannerSuccess
                      : fulfillmentDisplay.tone === "error"
                        ? styles.fulfillmentBannerError
                        : styles.fulfillmentBannerInfo,
                ]}
              >
                <Text style={styles.fulfillmentHeadline}>
                  {fulfillmentDisplay.headline}
                </Text>
                <Text style={styles.fulfillmentDetail}>
                  {fulfillmentDisplay.detail}
                </Text>
                {fulfillmentDisplay.showSupportHint ? (
                  <Text style={styles.fulfillmentSupport}>
                    Neem contact op via support als je vragen hebt over deze bestelling.
                  </Text>
                ) : null}
              </View>
            ) : null}
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
                  {formatOrderItemSizeLabel(firstItem)
                    ? ` · Maat ${formatOrderItemSizeLabel(firstItem)}`
                    : ""}
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
                  {buyerPaymentHeadline(order.paymentStatus, fulfillment) ??
                    paymentStatusLabel(order.paymentStatus)}
                  {order.paidAt
                    ? ` — betaald op ${formatDate(order.paidAt)}`
                    : ""}
                </Text>
                {fulfillmentDisplay ? (
                  <Text style={[styles.productMeta, styles.fulfillmentSectionNote]}>
                    {fulfillmentDisplay.detail}
                  </Text>
                ) : null}
                {needsPayment ? (
                  <Pressable
                    style={[styles.primaryBtn, styles.buyerPayBtn]}
                    onPress={() => void onPayOrder()}
                    disabled={payBusy}
                    accessibilityRole="button"
                    accessibilityLabel="Opnieuw betalen"
                  >
                    {payBusy ? (
                      <ActivityIndicator size="small" color={theme.bg} />
                    ) : (
                      <Text style={styles.primaryBtnText}>Opnieuw betalen</Text>
                    )}
                  </Pressable>
                ) : null}
              </View>

              <View
                style={styles.section}
                onLayout={(event) => {
                  buyerShippingSectionY.current = event.nativeEvent.layout.y;
                }}
              >
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
              {readyToShip ? (
                <SellerShipChecklist
                  value={shipChecklist}
                  onChange={setShipChecklist}
                />
              ) : null}
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
                  {buyerPaymentHeadline(order.paymentStatus, fulfillment) ??
                    paymentStatusLabel(order.paymentStatus)}
                  {needsPayment
                    ? " — wacht op betaling van de koper."
                    : order.paidAt
                      ? ` — betaald op ${formatDate(order.paidAt)}`
                      : ""}
                </Text>
                {fulfillmentDisplay ? (
                  <Text style={[styles.productMeta, styles.fulfillmentSectionNote]}>
                    {fulfillmentDisplay.detail}
                  </Text>
                ) : null}
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
                      ref={trackingInputRef}
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
                        (!readyToShip || !checklistComplete) && styles.primaryBtnDisabled,
                      ]}
                      onPress={onConfirmShipPress}
                      disabled={shipBusy || !readyToShip || !checklistComplete}
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

      <Modal
        visible={shipConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setShipConfirmVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Pakket daadwerkelijk verzonden?</Text>
            <Text style={styles.modalBody}>
              Bevestig alleen wanneer je het juiste product hebt verpakt en dit naar het
              juiste afleveradres hebt afgegeven of verstuurd. Na bevestiging wordt deze
              bestelling gemarkeerd als verzonden.
              {trackingCode.trim()
                ? `\n\nTracking: ${trackingCode.trim()}`
                : ""}
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalSecondaryBtn}
                onPress={() => setShipConfirmVisible(false)}
                disabled={shipBusy}
                accessibilityRole="button"
                accessibilityLabel="Annuleren"
              >
                <Text style={styles.modalSecondaryBtnText}>Terug</Text>
              </Pressable>
              <Pressable
                style={styles.modalPrimaryBtn}
                onPress={() => void markAsShipped()}
                disabled={shipBusy}
                accessibilityRole="button"
                accessibilityLabel="Bevestig verzending"
              >
                {shipBusy ? (
                  <ActivityIndicator size="small" color={theme.bg} />
                ) : (
                  <Text style={styles.modalPrimaryBtnText}>Ja, ik heb het verzonden</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  fulfillmentBanner: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  fulfillmentBannerWarning: {
    backgroundColor: "rgba(255, 193, 7, 0.12)",
    borderColor: "rgba(255, 193, 7, 0.35)",
  },
  fulfillmentBannerSuccess: {
    backgroundColor: theme.accentSoft,
    borderColor: theme.accentBorder,
  },
  fulfillmentBannerInfo: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: theme.border,
  },
  fulfillmentBannerError: {
    backgroundColor: "rgba(255, 80, 80, 0.12)",
    borderColor: "rgba(255, 80, 80, 0.35)",
  },
  fulfillmentHeadline: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 6,
  },
  fulfillmentDetail: {
    color: theme.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  fulfillmentSupport: {
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
    fontWeight: "700",
  },
  fulfillmentSectionNote: {
    marginTop: 8,
    lineHeight: 19,
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
  buyerPayBtn: {
    marginTop: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 16,
    padding: 18,
    backgroundColor: theme.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  modalTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 8,
  },
  modalBody: {
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
  },
  modalSecondaryBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  modalSecondaryBtnText: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "700",
  },
  modalPrimaryBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.accent,
  },
  modalPrimaryBtnText: {
    color: theme.bg,
    fontSize: 14,
    fontWeight: "900",
  },
});
