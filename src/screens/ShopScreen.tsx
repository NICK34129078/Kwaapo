import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ProductListingImage } from "../components/ProductListingImage";
import { theme } from "../constants/theme";
import { fetchShopProducts } from "../services/productsService";
import type { Product } from "../types/product";
import { formatPriceEur } from "../utils/formatPrice";
import { SHOP_CATEGORY_FILTERS } from "../constants/shopCategories";
import { matchesProductCategory, matchesProductSearch } from "../utils/productSearch";

const GAP = 12;

function ShopProductCard({
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
        style={styles.card}
        onPress={onPress}
        onPressIn={() => animateScale(0.975)}
        onPressOut={() => animateScale(1)}
        accessibilityRole="button"
        accessibilityLabel={product.name}
      >
        <View style={styles.productImageWrap}>
          <ProductListingImage
            uri={imageUri}
            style={styles.productImage}
            recyclingKey={`shop-${product.id}`}
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

export function ShopScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cardWidth = (width - 16 * 2 - GAP) / 2;
  const [products, setProducts] = useState<Product[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Alle");
  const queryRef = useRef(query);
  const categoryRef = useRef(category);
  const skipSearchEffectRef = useRef(true);
  const fetchRequestIdRef = useRef(0);

  queryRef.current = query;
  categoryRef.current = category;

  const fetchProducts = useCallback(async () => {
    return fetchShopProducts({
      query: queryRef.current.trim(),
      category:
        categoryRef.current === "Alle" ? undefined : categoryRef.current,
      limit: 100,
    });
  }, []);

  const applyProductResults = useCallback(async () => {
    const requestId = ++fetchRequestIdRef.current;
    try {
      const rows = await fetchProducts();
      if (requestId === fetchRequestIdRef.current) {
        setProducts(rows);
      }
    } catch {
      if (requestId === fetchRequestIdRef.current) {
        setProducts([]);
      }
    }
  }, [fetchProducts]);

  useFocusEffect(
    useCallback(() => {
      setInitialLoading(true);
      void applyProductResults().finally(() => setInitialLoading(false));
    }, [applyProductResults])
  );

  useEffect(() => {
    if (skipSearchEffectRef.current) {
      skipSearchEffectRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      void applyProductResults();
    }, 280);
    return () => clearTimeout(timer);
  }, [applyProductResults, category, query]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void applyProductResults().finally(() => setRefreshing(false));
  }, [applyProductResults]);

  const filteredProducts = useMemo(() => {
    return products.filter(
      (product) =>
        matchesProductCategory(product, category) &&
        matchesProductSearch(product, query)
    );
  }, [category, products, query]);

  const openProduct = useCallback(
    (product: Product) => {
      navigation.navigate("ProductDetail", {
        productId: product.id,
        canManage: false,
      });
    },
    [navigation]
  );

  return (
    <View style={styles.root}>
      <View style={[styles.fixedHeader, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.kicker}>Kwaapo Store</Text>
        <Text style={styles.title}>Shop de nieuwste producten</Text>
        <Text style={styles.subtitle}>
          Ontdek items uit business stores en bekijk direct de content erbij.
        </Text>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={theme.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Zoek op merk, naam of product..."
            placeholderTextColor={theme.textMuted}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsContent}
        >
          {SHOP_CATEGORY_FILTERS.map((item) => {
            const selected = item === category;
            return (
              <Pressable
                key={item}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => setCategory(item)}
                accessibilityRole="button"
                accessibilityLabel={item}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {item}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <FlatList
        style={styles.productList}
        data={filteredProducts}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 110 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.accent}
            colors={[theme.accent]}
          />
        }
        renderItem={({ item }) => (
          <ShopProductCard
            product={item}
            width={cardWidth}
            onPress={() => openProduct(item)}
          />
        )}
        ListEmptyComponent={
          initialLoading ? (
            <View style={styles.emptyWrap}>
              <ActivityIndicator size="small" color={theme.accent} />
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Ionicons name="bag-outline" size={44} color={theme.textMuted} />
              <Text style={styles.emptyTitle}>Geen producten gevonden</Text>
              <Text style={styles.emptyText}>
                Probeer een andere zoekterm of categorie.
              </Text>
            </View>
          )
        }
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  content: {
    paddingHorizontal: 16,
  },
  fixedHeader: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    backgroundColor: theme.bg,
  },
  productList: {
    flex: 1,
  },
  kicker: {
    color: theme.accent,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.4,
    fontFamily: "Comic Sans MS, Comic Sans, cursive",
    marginBottom: 8,
  },
  title: {
    color: theme.text,
    fontSize: 27,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  subtitle: {
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 16,
  },
  searchWrap: {
    minHeight: 46,
    borderRadius: 16,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  searchInput: {
    flex: 1,
    color: theme.text,
    fontSize: 15,
    paddingVertical: 10,
  },
  chipsContent: {
    gap: 8,
    paddingVertical: 12,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  chipSelected: {
    backgroundColor: theme.accentSoft,
    borderColor: theme.accentBorderMuted,
  },
  chipText: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: "700",
  },
  chipTextSelected: {
    color: theme.accent,
  },
  gridRow: {
    gap: GAP,
    marginBottom: GAP,
  },
  card: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: theme.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  productImageWrap: {
    width: "100%",
    aspectRatio: 0.82,
    backgroundColor: "#101010",
    overflow: "hidden",
  },
  productImage: {
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
    paddingVertical: 56,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    color: theme.text,
    fontSize: 17,
    fontWeight: "800",
  },
  emptyText: {
    color: theme.textMuted,
    fontSize: 14,
    textAlign: "center",
  },
});