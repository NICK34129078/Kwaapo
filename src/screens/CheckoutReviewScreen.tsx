import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../constants/theme";
import { ProductListingImage } from "../components/ProductListingImage";
import { AvatarImage } from "../components/AvatarImage";
import {
  fetchProductById,
  fetchProductSeller,
} from "../services/productsService";
import {
  canSellerAcceptSales,
  getPublicSellerBusinessName,
  isVerifiedBusinessSellerForBuyers,
} from "../services/sellerOnboardingService";
import type { Product } from "../types/product";
import type { ProductSeller } from "../services/productsService";
import { fetchProductVariants } from "../services/productVariantService";
import { formatPriceEur } from "../utils/formatPrice";
import { isProductPurchasable, productUsesVariantCheckout } from "../utils/productStock";

export function CheckoutReviewScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const productId: string | undefined = route.params?.productId;
  const routeQuantity = Number(route.params?.quantity ?? 1);
  const routeSize: string | null = route.params?.size ?? null;
  const routeProductVariantId: string | null = route.params?.productVariantId ?? null;
  const routeSelectedVariantType: string | null = route.params?.selectedVariantType ?? null;
  const routeSelectedVariantValue: string | null = route.params?.selectedVariantValue ?? null;

  const [product, setProduct] = useState<Product | null>(null);
  const [seller, setSeller] = useState<ProductSeller | null>(null);
  const [variantStock, setVariantStock] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const quantity = useMemo(
    () => Math.max(1, Math.floor(Number.isFinite(routeQuantity) ? routeQuantity : 1)),
    [routeQuantity]
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
        if (row) {
          const sellerRow = await fetchProductSeller(row.ownerId).catch(() => null);
          if (mounted) {
            setSeller(sellerRow);
          }
          if (row.usesVariants && row.variantsReady && routeProductVariantId) {
            const variants = await fetchProductVariants(row.id);
            const variant = variants.find((v) => v.id === routeProductVariantId) ?? null;
            if (mounted) {
              setVariantStock(variant?.stock ?? null);
            }
          } else if (mounted) {
            setVariantStock(null);
          }
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

  const displaySize = routeSelectedVariantValue ?? routeSize;

  const total = useMemo(
    () => (product?.price ?? 0) * quantity,
    [product?.price, quantity]
  );

  const verifiedBusiness = useMemo(
    () => (seller ? isVerifiedBusinessSellerForBuyers(seller) : false),
    [seller]
  );

  const sellerLabel = useMemo(() => {
    if (!seller) {
      return "Onbekende verkoper";
    }
    return getPublicSellerBusinessName(seller, verifiedBusiness);
  }, [seller, verifiedBusiness]);

  const canBuy = useMemo(() => {
    if (!product || !seller) {
      return false;
    }
    if (!product.isActive || !canSellerAcceptSales(seller)) {
      return false;
    }
    if (usesVariantCheckout) {
      if (!routeProductVariantId) {
        return false;
      }
      return isProductPurchasable(product, { variantStock, quantity });
    }
    if (product.sizes.length > 0 && !routeSize) {
      return false;
    }
    return isProductPurchasable(product, { quantity });
  }, [product, quantity, routeProductVariantId, routeSize, seller, usesVariantCheckout, variantStock]);

  const onContinue = useCallback(() => {
    if (!product) {
      return;
    }
    if (!canBuy) {
      if (usesVariantCheckout && routeProductVariantId && variantStock != null && variantStock < quantity) {
        Alert.alert(
          "Maat uitverkocht",
          "Deze maat is net uitverkocht. Kies een andere maat."
        );
        return;
      }
      Alert.alert(
        "Niet beschikbaar",
        "Dit product is momenteel tijdelijk niet beschikbaar voor aankoop."
      );
      return;
    }
    navigation.navigate("CheckoutInfo", {
      productId: product.id,
      quantity,
      size: displaySize,
      productVariantId: routeProductVariantId,
      selectedVariantType: routeSelectedVariantType,
      selectedVariantValue: routeSelectedVariantValue ?? displaySize,
    });
  }, [canBuy, displaySize, navigation, product, quantity, routeProductVariantId, routeSelectedVariantType, routeSelectedVariantValue]);

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
        <Text style={styles.screenTitle}>Bestelling afronden</Text>
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
        <>
          <ScrollView
            contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.productCard}>
              {product.images[0] ? (
                <ProductListingImage
                  uri={product.images[0]}
                  style={styles.productImage}
                  recyclingKey={`checkout-review-${product.id}`}
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
                {displaySize ? (
                  <Text style={styles.metaText}>Maat: {displaySize}</Text>
                ) : null}
                <Text style={styles.metaText}>Aantal: {quantity}</Text>
                <Text style={styles.productPrice}>{formatPriceEur(total)}</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Verkoper</Text>
              <View style={styles.sellerRow}>
                <AvatarImage uri={seller?.avatarUrl} style={styles.sellerAvatar} />
                <View style={styles.sellerText}>
                  <Text style={styles.sellerName}>{sellerLabel}</Text>
                  {verifiedBusiness ? (
                    <View style={styles.verifiedBadge}>
                      <Ionicons name="shield-checkmark" size={12} color={theme.accent} />
                      <Text style={styles.verifiedText}>Geverifieerde zakelijke verkoper</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>

            <View style={styles.totalsCard}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Subtotaal</Text>
                <Text style={styles.totalValue}>{formatPriceEur(total)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabelStrong}>Totaal</Text>
                <Text style={styles.totalValueStrong}>{formatPriceEur(total)}</Text>
              </View>
              <Text style={styles.stripeNote}>
                Betalingen worden veilig verwerkt via Stripe.
              </Text>
            </View>
          </ScrollView>

          <View style={[styles.stickyBar, { paddingBottom: insets.bottom + 10 }]}>
            <Pressable
              style={[styles.primaryBtn, !canBuy && styles.primaryBtnDisabled]}
              onPress={onContinue}
              disabled={!canBuy}
              accessibilityRole="button"
              accessibilityLabel="Naar betalen"
            >
              <Text style={styles.primaryBtnText}>Naar betalen</Text>
            </Pressable>
            {!canBuy ? (
              <Text style={styles.blockedHint}>
                {usesVariantCheckout && routeProductVariantId && variantStock != null && variantStock < quantity
                  ? "Deze maat is net uitverkocht. Kies een andere maat."
                  : "Dit product is momenteel tijdelijk niet beschikbaar voor aankoop."}
              </Text>
            ) : null}
          </View>
        </>
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
    marginBottom: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: theme.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  productImage: {
    width: 88,
    height: 88,
    borderRadius: 14,
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
    justifyContent: "center",
  },
  productName: {
    color: theme.text,
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 22,
  },
  metaText: {
    color: theme.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  productPrice: {
    color: theme.accent,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 8,
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  sectionLabel: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  sellerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sellerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.bgElevated,
  },
  sellerText: {
    flex: 1,
    minWidth: 0,
  },
  sellerName: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "800",
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  verifiedText: {
    color: theme.accent,
    fontSize: 11,
    fontWeight: "700",
  },
  totalsCard: {
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: theme.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    gap: 10,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: {
    color: theme.textMuted,
    fontSize: 14,
  },
  totalLabelStrong: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "900",
  },
  totalValue: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "700",
  },
  totalValueStrong: {
    color: theme.accent,
    fontSize: 24,
    fontWeight: "900",
  },
  stripeNote: {
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
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
  primaryBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnDisabled: {
    opacity: 0.45,
  },
  primaryBtnText: {
    color: theme.bg,
    fontSize: 16,
    fontWeight: "900",
  },
  blockedHint: {
    color: theme.textMuted,
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 17,
  },
});
