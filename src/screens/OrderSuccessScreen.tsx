import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../constants/theme";
import { fetchBuyerOrderById } from "../services/ordersService";
import type { BuyerOrder } from "../types/order";
import { formatPriceEur } from "../utils/formatPrice";
import {
  formatOrderShortAddress,
  paymentStatusLabel,
  sellerDisplayName,
  shippingStatusLabel,
} from "../utils/orderDashboard";

export function OrderSuccessScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const orderId: string | undefined = route.params?.orderId;
  const [buyerOrder, setBuyerOrder] = useState<BuyerOrder | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!orderId) {
      setBuyerOrder(null);
      return;
    }
    const row = await fetchBuyerOrderById(orderId);
    setBuyerOrder(row);
  }, [orderId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load().finally(() => setLoading(false));
    }, [load])
  );

  const order = buyerOrder?.order ?? null;
  const firstItem = buyerOrder?.items[0] ?? null;

  const onViewOrder = useCallback(() => {
    if (!orderId) {
      return;
    }
    navigation.navigate("OrderDetail", { orderId });
  }, [navigation, orderId]);

  const onContinueShopping = useCallback(() => {
    navigation.reset({
      index: 0,
      routes: [{ name: "MainTabs", params: { screen: "Shop" } }],
    });
  }, [navigation]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : !order ? (
        <View style={styles.centerState}>
          <Text style={styles.emptyText}>Bestelling niet gevonden.</Text>
          <Pressable
            style={styles.secondaryBtn}
            onPress={onContinueShopping}
            accessibilityRole="button"
            accessibilityLabel="Verder winkelen"
          >
            <Text style={styles.secondaryBtnText}>Verder winkelen</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 24 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.iconWrap}>
            <View style={styles.checkCircle}>
              <Ionicons name="checkmark" size={48} color={theme.bg} />
            </View>
          </View>

          <Text style={styles.title}>Bestelling geplaatst</Text>
          <Text style={styles.subtitle}>
            Je betaling is gelukt. De verkoper is op de hoogte gebracht.
          </Text>

          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Ordernummer</Text>
              <Text style={styles.summaryValue}>#{order.id.slice(0, 8)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Verkoper</Text>
              <Text style={styles.summaryValue} numberOfLines={2}>
                {buyerOrder ? sellerDisplayName(buyerOrder) : "Verkoper"}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Product</Text>
              <Text style={styles.summaryValue} numberOfLines={2}>
                {firstItem?.product?.name ?? "Product"}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Totaal</Text>
              <Text style={styles.summaryValueAccent}>
                {formatPriceEur(order.subtotalAmount)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Verzendadres</Text>
              <Text style={styles.summaryValue} numberOfLines={3}>
                {formatOrderShortAddress(order)}
              </Text>
            </View>
            <View style={styles.statusRow}>
              <View style={styles.statusBadge}>
                <Text style={styles.statusBadgeText}>
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

          <Pressable
            style={styles.primaryBtn}
            onPress={onViewOrder}
            accessibilityRole="button"
            accessibilityLabel="Bekijk bestelling"
          >
            <Text style={styles.primaryBtnText}>Bekijk bestelling</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryBtn}
            onPress={onContinueShopping}
            accessibilityRole="button"
            accessibilityLabel="Verder winkelen"
          >
            <Text style={styles.secondaryBtnText}>Verder winkelen</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg,
    paddingHorizontal: 20,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  emptyText: {
    color: theme.textMuted,
    fontSize: 15,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 24,
  },
  iconWrap: {
    alignItems: "center",
    marginBottom: 20,
  },
  checkCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: theme.text,
    fontSize: 28,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 10,
  },
  subtitle: {
    color: theme.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  summaryCard: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: theme.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    marginBottom: 24,
    gap: 12,
  },
  summaryRow: {
    gap: 4,
  },
  summaryLabel: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  summaryValue: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 21,
  },
  summaryValueAccent: {
    color: theme.accent,
    fontSize: 22,
    fontWeight: "900",
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  statusBadge: {
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
  primaryBtn: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  primaryBtnText: {
    color: theme.bg,
    fontSize: 16,
    fontWeight: "900",
  },
  secondaryBtn: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.accentBorderStrong,
    backgroundColor: theme.accentSoft,
  },
  secondaryBtnText: {
    color: theme.accent,
    fontSize: 16,
    fontWeight: "900",
  },
});
