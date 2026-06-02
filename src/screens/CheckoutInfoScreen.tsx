import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { createTestOrderFromProduct } from "../services/ordersService";
import { fetchProductById } from "../services/productsService";
import {
  createStripeCheckoutSession,
  openStripeCheckoutAndConfirm,
} from "../services/stripeCheckoutService";
import type { Product } from "../types/product";
import { formatPriceEur } from "../utils/formatPrice";

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
  const [selectedSize, setSelectedSize] = useState<string | null>(routeSize);
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
        setSelectedSize((prev) => prev ?? row?.sizes[0] ?? null);
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
  }, [productId]);

  const total = useMemo(() => {
    const count = Math.max(1, Math.floor(Number(quantity) || 1));
    return (product?.price ?? 0) * count;
  }, [product?.price, quantity]);

  const onSubmit = useCallback(async () => {
    if (!product) {
      return;
    }
    if (product.sizes.length > 0 && !selectedSize) {
      Alert.alert("Maat kiezen", "Kies eerst een maat.");
      return;
    }

    setSubmitting(true);
    try {
      const order = await createTestOrderFromProduct(product, {
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
      });

      const { checkoutUrl, sessionId } = await createStripeCheckoutSession(order.id);
      const payment = await openStripeCheckoutAndConfirm(
        checkoutUrl,
        order.id,
        sessionId
      );

      if (payment.ok) {
        Alert.alert(
          "Betaling gelukt",
          `Bestelling #${payment.order.id.slice(0, 8)} is betaald. De verkoper kan je pakket nu verzenden.`,
          [{ text: "OK", onPress: () => navigation.goBack() }]
        );
        return;
      }

      if (payment.reason === "cancelled") {
        Alert.alert(
          "Betaling geannuleerd",
          "Je bestelling staat nog open. Je kunt later opnieuw betalen via je bestellingen."
        );
        navigation.goBack();
        return;
      }

      Alert.alert("Betaling mislukt", payment.message);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Order aanmaken mislukt.";
      Alert.alert("Fout", msg);
    } finally {
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
    selectedSize,
    street,
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
        <Text style={styles.screenTitle}>Afrekenen</Text>
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
              <Image source={{ uri: product.images[0] }} style={styles.productImage} />
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
              <Text style={styles.helperText}>
                Na het invullen van je gegevens open je Stripe Checkout (testmodus).
              </Text>
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
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="naam@email.nl"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <FormField
              label="Telefoon optioneel"
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

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Productopties</Text>
            {product.sizes.length > 0 ? (
              <View style={styles.optionBlock}>
                <Text style={styles.label}>Maat</Text>
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
            accessibilityLabel="Doorgaan"
          >
            {submitting ? (
              <ActivityIndicator size="small" color={theme.bg} />
            ) : (
              <Text style={styles.submitBtnText}>Betalen met Stripe</Text>
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
  optionBlock: {
    marginBottom: 12,
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
  },
  submitBtnDisabled: {
    opacity: 0.75,
  },
  submitBtnText: {
    color: theme.bg,
    fontSize: 16,
    fontWeight: "900",
  },
});
