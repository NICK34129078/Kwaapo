import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { ProductListingImage } from "./ProductListingImage";
import { theme } from "../constants/theme";
import { fetchActiveProductsByOwner } from "../services/productsService";
import {
  canSellerPrepareProducts,
  fetchMySellerOnboarding,
} from "../services/sellerOnboardingService";
import type { Product } from "../types/product";
import { formatPriceEur } from "../utils/formatPrice";

const GAP = 12;

type Props = {
  ownerId: string;
  cellSize?: number;
  isOwnProfile: boolean;
  onProductCountChange?: (count: number) => void;
};

function ProductCard({
  product,
  width,
  onPress,
}: {
  product: Product;
  width: number;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const imageUri = product.images[0];

  const animateScale = useCallback(
    (toValue: number) => {
      Animated.spring(scale, {
        toValue,
        friction: 8,
        tension: 180,
        useNativeDriver: true,
      }).start();
    },
    [scale]
  );

  return (
    <Animated.View style={{ width, transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() => animateScale(0.975)}
        onPressOut={() => animateScale(1)}
        accessibilityRole="button"
        accessibilityLabel={product.name}
        style={styles.card}
      >
        <View style={styles.imageWrap}>
          <ProductListingImage
            uri={imageUri}
            style={styles.image}
            recyclingKey={`profile-shop-${product.id}`}
          />
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.productName} numberOfLines={2}>
            {product.name}
          </Text>
          <Text style={styles.productPrice}>{formatPriceEur(product.price)}</Text>
          {product.stock < 10 ? (
            <Text style={styles.lowStock}>Nog {product.stock} beschikbaar</Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function ProfileShopGrid({
  ownerId,
  isOwnProfile,
  onProductCountChange,
}: Props) {
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const [canAddProducts, setCanAddProducts] = useState(!isOwnProfile);
  const cardWidth = (width - 16 * 2 - GAP) / 2;
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchActiveProductsByOwner(ownerId);
      setProducts(rows);
      onProductCountChange?.(rows.length);
    } catch {
      setProducts([]);
      onProductCountChange?.(0);
    } finally {
      setLoading(false);
    }
  }, [onProductCountChange, ownerId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isOwnProfile) {
      setCanAddProducts(false);
      return;
    }
    void fetchMySellerOnboarding()
      .then((row) => setCanAddProducts(canSellerPrepareProducts(row)))
      .catch(() => setCanAddProducts(false));
  }, [isOwnProfile]);

  const openAddProduct = useCallback(() => {
    if (!canAddProducts) {
      navigation.navigate("SellerOnboarding");
      return;
    }
    navigation.navigate("ProductForm", {});
  }, [canAddProducts, navigation]);

  const openProduct = useCallback(
    (product: Product) => {
      navigation.navigate("ProductDetail", {
        productId: product.id,
        canManage: isOwnProfile,
      });
    },
    [isOwnProfile, navigation]
  );

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="small" color={theme.accent} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {isOwnProfile ? (
        <Pressable
          style={styles.addProductButton}
          onPress={openAddProduct}
          accessibilityRole="button"
          accessibilityLabel={
            canAddProducts ? "Product toevoegen" : "Verkoopaccount instellen"
          }
        >
          <Ionicons name="add" size={22} color={theme.bg} />
          <Text style={styles.addProductButtonText}>
            {canAddProducts ? "Product toevoegen" : "Verkoopaccount instellen"}
          </Text>
        </Pressable>
      ) : null}

      {products.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="bag-outline" size={40} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>
            {isOwnProfile ? "Nog geen producten" : "Deze winkel is leeg"}
          </Text>
          <Text style={styles.emptyText}>
            {isOwnProfile
              ? "Voeg je eerste product toe aan je winkel."
              : "Deze business heeft nog geen actieve producten."}
          </Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              width={cardWidth}
              onPress={() => openProduct(product)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  loadingWrap: {
    paddingVertical: 32,
    alignItems: "center",
  },
  addProductButton: {
    minHeight: 48,
    borderRadius: 14,
    marginBottom: 14,
    backgroundColor: theme.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  addProductButtonText: {
    color: theme.bg,
    fontSize: 15,
    fontWeight: "900",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GAP,
    paddingBottom: 20,
  },
  card: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: theme.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  imageWrap: {
    width: "100%",
    aspectRatio: 0.82,
    backgroundColor: "#101010",
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  cardBody: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  productName: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
    minHeight: 36,
  },
  productPrice: {
    color: theme.accent,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 5,
  },
  lowStock: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
    marginTop: 6,
    fontWeight: "600",
  },
  emptyWrap: {
    paddingVertical: 40,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "800",
  },
  emptyText: {
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
});
