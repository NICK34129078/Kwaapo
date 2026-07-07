import React, { useCallback, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";
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
import { SuccessCelebrationHero } from "../components/SuccessCelebrationHero";
import { fetchSellerOrderById } from "../services/ordersService";
import type { SellerOrderDetail } from "../services/ordersService";
import {
  buyerDisplayName,
  formatOrderItemSizeLabel,
  formatOrderShortAddress,
} from "../utils/orderDashboard";

export function OrderShippedSuccessScreen() {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const orderId: string | undefined = route.params?.orderId;
  const [sellerOrder, setSellerOrder] = useState<SellerOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!orderId) {
      setSellerOrder(null);
      return;
    }
    const row = await fetchSellerOrderById(orderId);
    setSellerOrder(row);
  }, [orderId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load().finally(() => setLoading(false));
    }, [load])
  );

  const order = sellerOrder?.order ?? null;
  const firstItem = sellerOrder?.items[0] ?? null;
  const isShipped =
    order?.shippingStatus === "shipped" || order?.shippingStatus === "delivered";

  const exitToHome = useCallback(() => {
    navigation.reset({
      index: 0,
      routes: [{ name: "MainTabs", params: { screen: "Home" } }],
    });
  }, [navigation]);

  const onAddTracking = useCallback(() => {
    if (!orderId) {
      exitToHome();
      return;
    }
    navigation.reset({
      index: 1,
      routes: [
        { name: "MainTabs", params: { screen: "Home" } },
        { name: "OrderDetail", params: { orderId, focusTracking: true } },
      ],
    });
  }, [exitToHome, navigation, orderId]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <View style={styles.topBarSide} />
        <Text style={styles.topBarTitle}>Verzonden</Text>
        <Pressable
          style={styles.closeBtn}
          onPress={exitToHome}
          accessibilityRole="button"
          accessibilityLabel="Sluiten en terug naar home"
          hitSlop={10}
        >
          <Ionicons name="close" size={26} color={theme.text} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : !order || !isShipped ? (
        <View style={styles.centerState}>
          <Text style={styles.emptyText}>
            De verzending kon niet worden bevestigd. Probeer het opnieuw vanuit je
            bestelling.
          </Text>
          <Pressable
            style={styles.secondaryBtn}
            onPress={exitToHome}
            accessibilityRole="button"
            accessibilityLabel="Terug naar home"
          >
            <Text style={styles.secondaryBtnText}>Terug naar home</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 28 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <SuccessCelebrationHero />

          <Text style={styles.title}>Bestelling verzonden!</Text>
          <Text style={styles.subtitle}>
            Je hebt bevestigd dat het pakket onderweg is naar de koper.
          </Text>

          <View style={styles.infoCard}>
            <Text style={styles.infoCardKicker}>Volgende stap</Text>
            <Text style={styles.infoCardBody}>
              Voeg trackinginformatie toe zodra je die hebt, zodat de koper de
              bestelling kan volgen.
            </Text>
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Product</Text>
              <Text style={styles.summaryValue} numberOfLines={2}>
                {firstItem?.product?.name ?? "Product"}
              </Text>
            </View>
            {formatOrderItemSizeLabel(firstItem) ? (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Variant</Text>
                <Text style={styles.summaryValue}>
                  {formatOrderItemSizeLabel(firstItem)}
                </Text>
              </View>
            ) : null}
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Ordernummer</Text>
              <Text style={styles.summaryValue}>#{order.id.slice(0, 8)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Koper</Text>
              <Text style={styles.summaryValue} numberOfLines={2}>
                {sellerOrder ? buyerDisplayName(sellerOrder) : "Koper"}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Verzendadres</Text>
              <Text style={styles.summaryValue} numberOfLines={3}>
                {formatOrderShortAddress(order)}
              </Text>
            </View>
          </View>

          <Pressable
            style={styles.primaryBtn}
            onPress={onAddTracking}
            accessibilityRole="button"
            accessibilityLabel="Tracking toevoegen"
          >
            <Text style={styles.primaryBtnText}>Tracking toevoegen</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryTextBtn}
            onPress={exitToHome}
            accessibilityRole="button"
            accessibilityLabel="Later toevoegen"
          >
            <Text style={styles.secondaryTextBtnLabel}>Later toevoegen</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg,
    paddingHorizontal: 20,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  topBarSide: {
    width: 44,
  },
  topBarTitle: {
    flex: 1,
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 12,
  },
  emptyText: {
    color: theme.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 8,
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
    marginBottom: 22,
    paddingHorizontal: 6,
  },
  infoCard: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: theme.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.accentBorder,
    marginBottom: 16,
    gap: 8,
  },
  infoCardKicker: {
    color: theme.accent,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.35,
    textTransform: "uppercase",
  },
  infoCardBody: {
    color: theme.text,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
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
  primaryBtn: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  primaryBtnText: {
    color: theme.bg,
    fontSize: 16,
    fontWeight: "900",
  },
  secondaryBtn: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.accentBorderStrong,
    backgroundColor: theme.accentSoft,
    paddingHorizontal: 20,
  },
  secondaryBtnText: {
    color: theme.accent,
    fontSize: 15,
    fontWeight: "900",
  },
  secondaryTextBtn: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryTextBtnLabel: {
    color: theme.textMuted,
    fontSize: 15,
    fontWeight: "800",
  },
});
}

