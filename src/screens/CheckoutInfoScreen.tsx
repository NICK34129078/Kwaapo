import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../constants/theme";
import { ProductListingImage } from "../components/ProductListingImage";
import { createOrderFromProduct } from "../services/ordersService";
import { payOrderWithStripe } from "../services/checkoutFlowService";
import {
  canSellerAcceptSales,
  fetchSellerOnboardingByProfileId,
} from "../services/sellerOnboardingService";
import { fetchProductById } from "../services/productsService";
import type { Product } from "../types/product";
import { formatPriceEur } from "../utils/formatPrice";
import { productUsesVariantCheckout } from "../utils/productStock";

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize = "sentences",
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "email-address" | "phone-pad" | "number-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        style={styles.input}
      />
    </View>
  );
}

export function CheckoutInfoScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const productId: string | undefined = route.params?.productId;
  const routeQuantity = Number(route.params?.quantity ?? 1);
  const routeSize: string | null = route.params?.size ?? null;
  const routeProductVariantId: string | null = route.params?.productVariantId ?? null;
  const routeSelectedVariantType: string | null = route.params?.selectedVariantType ?? null;
  const routeSelectedVariantValue: string | null = route.params?.selectedVariantValue ?? null;
  const submittingRef = useRef(false);

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("Nederland");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [street, setStreet] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedSize, setSelectedSize] = useState<string | null>(
    routeSelectedVariantValue ?? routeSize
  );
  const [selectedVariantId] = useState<string | null>(routeProductVariantId);
  const [quantity, setQuantity] = useState(
    String(Number.isFinite(routeQuantity) && routeQuantity > 0 ? routeQuantity : 1)
  );

  useEffect(() => {
    let mounted = true;
    void (async () => {
      if (!productId) {
        setProduct(null);
        setLoading(false);
        return;
      }
      try {
        const row = await fetchProductById(productId);
        if (!mounted) {
          return;
        }
        setProduct(row);
        if (!routeProductVariantId) {
          setSelectedSize((prev) => prev ?? row?.sizes[0] ?? null);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Product laden mislukt.";
        Alert.alert("Fout", msg);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [productId, routeProductVariantId]);

  const usesVariantCheckout = useMemo(
    () => (product ? productUsesVariantCheckout(product) : false),
    [product]
  );

  const total = useMemo(() => {
    const count = Math.max(1, Math.floor(Number(quantity) || 1));
    return (product?.price ?? 0) * count;
  }, [product?.price, quantity]);

  const onSubmit = useCallback(async () => {
    if (!product || submittingRef.current) {
      return;
    }
    if (usesVariantCheckout) {
      if (!selectedVariantId) {
        Alert.alert("Maat kiezen", "Kies eerst een maat.");
        return;
      }
    } else if (product.sizes.length > 0 && !selectedSize) {
      Alert.alert("Maat kiezen", "Kies eerst een maat.");
      return;
    }
    if (!usesVariantCheckout && product.stock <= 0) {
      Alert.alert(
        "Niet op voorraad",
        "Dit product is momenteel tijdelijk niet beschikbaar voor aankoop."
      );
      return;
    }

    const sellerOnboarding = await fetchSellerOnboardingByProfileId(product.ownerId);
    if (!canSellerAcceptSales(sellerOnboarding)) {
      Alert.alert(
        "Niet beschikbaar",
        "Dit product is momenteel tijdelijk niet beschikbaar voor aankoop."
      );
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const order = await createOrderFromProduct(product, {
        buyerFullName: fullName,
        buyerEmail: email,
        shippingCountry: country,
        shippingCity: city,
        shippingPostalCode: postalCode,
        shippingStreet: street,
        shippingHouseNumber: houseNumber,
        shippingPhone: phone,
        quantity: Number(quantity),
        size: selectedSize,
        productVariantId: selectedVariantId,
        selectedVariantType:
          routeSelectedVariantType ?? (selectedVariantId ? "size" : null),
        selectedVariantValue: routeSelectedVariantValue ?? selectedSize,
      });

      const payment = await payOrderWithStripe(order.id);

      if (payment.ok) {
        navigation.reset({
          index: 1,
          routes: [
            { name: "MainTabs", params: { screen: "Shop" } },
            {
              name: "OrderSuccess",
              params: { orderId: payment.orderId },
            },
          ],
        });
        return;
      }

      navigation.replace("CheckoutFailed", {
        reason: payment.reason,
        orderId: payment.orderId,
        productId: product.id,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Betaling voorbereiden mislukt.";
      Alert.alert("Fout", msg);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [
    city,
    country,
    email,
    fullName,
    houseNumber,
    navigation,
    phone,
    postalCode,
    product,
    quantity,
    routeSelectedVariantType,
    routeSelectedVariantValue,
    selectedSize,
    selectedVariantId,
    street,
    usesVariantCheckout,
  ]);

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top + 8 }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
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
        <Text style={styles.screenTitle}>Verzendgegevens</Text>
        <View style={styles.topBarSide} />
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="small" color={theme.accent} />
        </View>
      ) : !product ? (
        <View style={styles.centerState}>
          <Text style={styles.emptyText}>Product niet gevonden.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.productCard}>
            {product.images[0] ? (
              <ProductListingImage
                uri={product.images[0]}
                style={styles.productImage}
                recyclingKey={`checkout-info-${product.id}`}
              />
            ) : (
              <View style={[styles.productImage, styles.imageFallback]}>
                <Ionicons name="image-outline" size={24} color={theme.textMuted} />
              </View>
            )}
            <View style={styles.productMain}>
              <Text style={styles.productName} numberOfLines={2}>
                {product.name}
              </Text>
              <Text style={styles.productPrice}>{formatPriceEur(total)}</Text>
              <Text style={styles.helperText}>Veilig betalen via Stripe.</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Klantgegevens</Text>
            <FormField
              label="Volledige naam"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Voor- en achternaam"
              autoCapitalize="words"
            />
            <FormField
              label="E-mail"
              value={email}
              onChangeText={setEmail}
              placeholder="naam@email.nl"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <FormField
              label="Telefoon (optioneel)"
              value={phone}
              onChangeText={setPhone}
              placeholder="+31..."
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Verzendadres</Text>
            <FormField label="Land" value={country} onChangeText={setCountry} />
            <FormField label="Stad" value={city} onChangeText={setCity} />
            <FormField
              label="Postcode"
              value={postalCode}
              onChangeText={setPostalCode}
              autoCapitalize="characters"
            />
            <FormField label="Straat" value={street} onChangeText={setStreet} />
            <FormField
              label="Huisnummer"
              value={houseNumber}
              onChangeText={setHouseNumber}
            />
          </View>

          {usesVariantCheckout && selectedSize ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Maat</Text>
              <Text style={styles.selectedSizeText}>{selectedSize}</Text>
            </View>
          ) : product.sizes.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Maat</Text>
              <View style={styles.sizeRow}>
                {product.sizes.map((size) => {
                  const selected = selectedSize === size;
                  return (
                    <Pressable
                      key={size}
                      style={[styles.sizeChip, selected && styles.sizeChipSelected]}
                      onPress={() => setSelectedSize(size)}
                      accessibilityRole="button"
                      accessibilityLabel={`Maat ${size}`}
                    >
                      <Text
                        style={[
                          styles.sizeChipText,
                          selected && styles.sizeChipTextSelected,
                        ]}
                      >
                        {size}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={styles.section}>
            <FormField
              label="Aantal"
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="number-pad"
            />
          </View>
        </ScrollView>
      )}

      {product ? (
        <View style={[styles.stickyBar, { paddingBottom: insets.bottom + 10 }]}>
          <Pressable
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={() => void onSubmit()}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel="Veilig betalen via Stripe"
          >
            {submitting ? (
              <>
                <ActivityIndicator size="small" color={theme.bg} />
                <Text style={styles.submitBtnTextLoading}>Betaling voorbereiden…</Text>
              </>
            ) : (
              <Text style={styles.submitBtnText}>Veilig betalen via Stripe</Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </KeyboardAvoidingView>
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
    fontSize: 19,
    fontWeight: "900",
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
    fontSize: 15,
  },
  productCard: {
    flexDirection: "row",
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: theme.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  productImage: {
    width: 76,
    height: 76,
    borderRadius: 12,
    backgroundColor: theme.bgElevated,
  },
  imageFallback: {
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
    fontSize: 16,
    fontWeight: "900",
  },
  productPrice: {
    color: theme.accent,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 5,
  },
  helperText: {
    color: theme.textMuted,
    fontSize: 12,
    marginTop: 5,
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  sectionTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 12,
  },
  field: {
    marginBottom: 12,
  },
  label: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
  },
  input: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: theme.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    color: theme.text,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  sizeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sizeChip: {
    minWidth: 44,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.bgElevated,
  },
  sizeChipSelected: {
    borderColor: theme.accent,
    backgroundColor: theme.accentSoft,
  },
  sizeChipText: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: "800",
  },
  sizeChipTextSelected: {
    color: theme.accent,
  },
  selectedSizeText: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "800",
  },
  stickyBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: "rgba(8,8,8,0.96)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
  },
  submitBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  submitBtnDisabled: {
    opacity: 0.75,
  },
  submitBtnText: {
    color: theme.bg,
    fontSize: 16,
    fontWeight: "900",
  },
  submitBtnTextLoading: {
    color: theme.bg,
    fontSize: 14,
    fontWeight: "800",
  },
});
