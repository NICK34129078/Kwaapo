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
import { useAuth } from "../context/AuthContext";
import {
  getMainCategoryDef,
  SHOP_AUDIENCES,
  SHOP_FEED_TABS,
  SHOP_SUBCATEGORIES,
  type ShopAudienceCode,
  type ShopFeedTabId,
  type ShopMainCategoryCode,
} from "../constants/shopCategories";
import {
  fetchShopFeedBatch,
  SHOP_FEED_BATCH_SIZE,
  type ShopFeedMode,
} from "../services/shopFeedService";
import {
  mergeProductIntoList,
  subscribeProductCatalog,
} from "../services/productCatalogRefresh";
import type { Product } from "../types/product";
import { formatPriceEur } from "../utils/formatPrice";
import {
  BoundedSeenIds,
  excludeIdsForRpc,
} from "../utils/boundedSeenIds";
import {
  filterUnseenProducts,
  SHOP_WINDOW,
  trimShopProductWindow,
} from "../utils/shopRollingWindow";

const GAP = 12;
const LOW_STOCK_THRESHOLD = 5;

function ShopProductSkeleton({ width }: { width: number }) {
  return (
    <View style={[styles.card, { width }]}>
      <View style={[styles.productImageWrap, styles.skeletonBlock]} />
      <View style={styles.cardBody}>
        <View style={[styles.skeletonLine, { width: "70%" }]} />
        <View style={[styles.skeletonLine, { width: "45%", marginTop: 8 }]} />
      </View>
    </View>
  );
}

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
          {product.brand?.trim() ? (
            <Text style={styles.productBrand} numberOfLines={1}>
              {product.brand.trim()}
            </Text>
          ) : null}
          <Text style={styles.productName} numberOfLines={2}>
            {product.name}
          </Text>
          <Text style={styles.productPrice}>{formatPriceEur(product.price)}</Text>
          {product.stock > 0 && product.stock <= LOW_STOCK_THRESHOLD ? (
            <Text style={styles.lowStock}>Nog {product.stock} beschikbaar</Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

function resolveFeedMode(
  feedTab: ShopFeedTabId,
  hasUser: boolean,
  hasQuery: boolean
): ShopFeedMode {
  if (hasQuery) {
    return "browse";
  }
  if (feedTab === "voor_jou" && hasUser) {
    return "personalized";
  }
  return "browse";
}

function subtitleForTab(feedTab: ShopFeedTabId, hasUser: boolean): string {
  if (feedTab === "voor_jou") {
    return hasUser
      ? "Producten die passen bij jouw interesses."
      : "Log in voor persoonlijke aanbevelingen — nu zie je alle beschikbare producten.";
  }
  if (feedTab === "browse") {
    return "Ontdek alle producten die nu beschikbaar zijn.";
  }
  const def = getMainCategoryDef(feedTab);
  return def ? `Shop ${def.label.toLowerCase()} — filter op type.` : "";
}

export function ShopScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const cardWidth = (width - 16 * 2 - GAP) / 2;

  const [feedTab, setFeedTab] = useState<ShopFeedTabId>("voor_jou");
  const [audienceFilter, setAudienceFilter] = useState<ShopAudienceCode | null>(null);
  const [subcategoryFilter, setSubcategoryFilter] = useState<string | null>(null);
  const [audienceStepDone, setAudienceStepDone] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  const productsRef = useRef<Product[]>([]);
  const loadMoreInFlightRef = useRef(false);
  const fetchRequestIdRef = useRef(0);
  const seenProductIdsRef = useRef(new BoundedSeenIds(SHOP_WINDOW.SEEN_MAX));
  const scrollYRef = useRef(0);

  productsRef.current = products;

  const mainCategoryFilter = useMemo((): ShopMainCategoryCode | null => {
    if (feedTab === "voor_jou" || feedTab === "browse") {
      return null;
    }
    return feedTab;
  }, [feedTab]);

  const mainDef = getMainCategoryDef(mainCategoryFilter ?? undefined);
  const showAudienceRow =
    !!mainDef?.hasAudienceStep && !query.trim();
  const showSubcategoryRow =
    !query.trim() &&
    !!mainCategoryFilter &&
    (mainDef?.hasAudienceStep ? audienceStepDone : true);

  const feedFilters = useMemo(
    () => ({
      mainCategory: mainCategoryFilter,
      audience: audienceFilter,
      subcategory: subcategoryFilter,
      query: query.trim() || null,
    }),
    [audienceFilter, mainCategoryFilter, query, subcategoryFilter]
  );

  const fetchBatch = useCallback(
    async (excludeIds: string[], mode: ShopFeedMode) => {
      return fetchShopFeedBatch({
        mode,
        limit: SHOP_FEED_BATCH_SIZE,
        excludeProductIds: excludeIds,
        filters: feedFilters,
      });
    },
    [feedFilters]
  );

  const registerProductsInSeen = useCallback((items: readonly Product[]) => {
    seenProductIdsRef.current.addMany(items.map((p) => p.id));
  }, []);

  const applyShopWindowTrim = useCallback(() => {
    setProducts((prev) => {
      const { trimmed } = trimShopProductWindow(prev, {
        scrollY: scrollYRef.current,
      });
      return trimmed;
    });
  }, []);

  useEffect(() => {
    if (products.length <= SHOP_WINDOW.MAX) {
      return;
    }
    applyShopWindowTrim();
  }, [applyShopWindowTrim, products.length]);

  const appendProducts = useCallback(
    (incoming: Product[]) => {
      if (incoming.length === 0) {
        return;
      }
      setProducts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const combined = [...prev];
        for (const product of incoming) {
          if (seen.has(product.id)) {
            continue;
          }
          seen.add(product.id);
          combined.push(product);
        }
        const { trimmed } = trimShopProductWindow(combined, {
          scrollY: scrollYRef.current,
        });
        return trimmed;
      });
    },
    []
  );

  const loadFirstBatch = useCallback(async () => {
    const requestId = ++fetchRequestIdRef.current;
    const trimmedQuery = query.trim();
    const mode = resolveFeedMode(feedTab, !!user?.id, trimmedQuery.length > 0);

    try {
      seenProductIdsRef.current.reset();
      scrollYRef.current = 0;
      const result = await fetchBatch([], mode);
      if (requestId !== fetchRequestIdRef.current) {
        return;
      }
      registerProductsInSeen(result.products);
      setProducts(result.products.slice(0, SHOP_WINDOW.TARGET));
      setHasMore(result.hasMore);
    } catch {
      if (requestId === fetchRequestIdRef.current) {
        setProducts([]);
        setHasMore(false);
      }
    }
  }, [feedTab, fetchBatch, query, registerProductsInSeen, user?.id]);

  const loadMore = useCallback(async () => {
    if (loadMoreInFlightRef.current || !hasMore || initialLoading) {
      return;
    }
    loadMoreInFlightRef.current = true;
    setLoadingMore(true);
    try {
      const exclude = excludeIdsForRpc(seenProductIdsRef.current, SHOP_WINDOW.SEEN_MAX);
      let mode = resolveFeedMode(feedTab, !!user?.id, query.trim().length > 0);
      let result = await fetchBatch(exclude, mode);
      if (result.products.length === 0 && mode === "personalized") {
        result = await fetchBatch(exclude, "browse");
      }
      const unique = filterUnseenProducts(result.products, seenProductIdsRef.current);
      if (unique.length === 0) {
        setHasMore(false);
        return;
      }
      registerProductsInSeen(unique);
      appendProducts(unique);
      setHasMore(result.hasMore);
    } finally {
      loadMoreInFlightRef.current = false;
      setLoadingMore(false);
    }
  }, [appendProducts, feedTab, fetchBatch, hasMore, initialLoading, query, registerProductsInSeen, user?.id]);

  useEffect(() => {
    const delay = query.trim().length > 0 ? 280 : 0;
    const timer = setTimeout(() => {
      setInitialLoading(true);
      setHasMore(true);
      void loadFirstBatch().finally(() => setInitialLoading(false));
    }, delay);
    return () => clearTimeout(timer);
  }, [loadFirstBatch, query]);

  useFocusEffect(
    useCallback(() => {
      void loadFirstBatch();
    }, [loadFirstBatch])
  );

  useEffect(() => {
    return subscribeProductCatalog((event) => {
      if (event.kind === "created" || event.kind === "updated") {
        if (event.product.isActive && event.product.stock > 0 && !query.trim()) {
          setProducts((prev) => mergeProductIntoList(prev, event.product));
        }
      }
      void loadFirstBatch();
    });
  }, [loadFirstBatch, query]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setHasMore(true);
    void loadFirstBatch().finally(() => setRefreshing(false));
  }, [loadFirstBatch]);

  const resetToBrowseAll = useCallback(() => {
    setFeedTab("browse");
    setAudienceFilter(null);
    setSubcategoryFilter(null);
    setAudienceStepDone(false);
    setQuery("");
  }, []);

  const onFeedTabPress = useCallback((tab: ShopFeedTabId) => {
    setFeedTab(tab);
    setAudienceFilter(null);
    setSubcategoryFilter(null);
    setAudienceStepDone(false);
  }, []);

  const openProduct = useCallback(
    (product: Product) => {
      navigation.navigate("ProductDetail", {
        productId: product.id,
        canManage: false,
      });
    },
    [navigation]
  );

  const listEmpty = !initialLoading && products.length === 0;

  return (
    <View style={styles.root}>
      <View style={[styles.fixedHeader, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.kicker}>Kwaapo Store</Text>
        <Text style={styles.title}>Shop voor jou</Text>
        <Text style={styles.subtitle}>{subtitleForTab(feedTab, !!user?.id)}</Text>

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
          {SHOP_FEED_TABS.map((item) => {
            const selected = feedTab === item.id;
            return (
              <Pressable
                key={item.id}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => onFeedTabPress(item.id)}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {showAudienceRow ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsContentSecondary}
          >
            <Pressable
              style={[
                styles.chipSmall,
                audienceStepDone && !audienceFilter && styles.chipSelected,
              ]}
              onPress={() => {
                setAudienceFilter(null);
                setSubcategoryFilter(null);
                setAudienceStepDone(true);
              }}
            >
              <Text
                style={[
                  styles.chipText,
                  audienceStepDone && !audienceFilter && styles.chipTextSelected,
                ]}
              >
                Alles
              </Text>
            </Pressable>
            {SHOP_AUDIENCES.map((item) => {
              const selected = audienceFilter === item.code;
              return (
                <Pressable
                  key={item.code}
                  style={[styles.chipSmall, selected && styles.chipSelected]}
                  onPress={() => {
                    setAudienceFilter(item.code);
                    setSubcategoryFilter(null);
                    setAudienceStepDone(true);
                  }}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {showSubcategoryRow && mainCategoryFilter ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsContentSecondary}
          >
            <Pressable
              style={[styles.chipSmall, !subcategoryFilter && styles.chipSelected]}
              onPress={() => setSubcategoryFilter(null)}
            >
              <Text style={[styles.chipText, !subcategoryFilter && styles.chipTextSelected]}>
                Alles
              </Text>
            </Pressable>
            {(SHOP_SUBCATEGORIES[mainCategoryFilter] ?? []).map((item) => {
              const selected = subcategoryFilter === item.code;
              return (
                <Pressable
                  key={item.code}
                  style={[styles.chipSmall, selected && styles.chipSelected]}
                  onPress={() =>
                    setSubcategoryFilter(selected ? null : item.code)
                  }
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
      </View>

      <FlatList
        style={styles.productList}
        data={products}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 110 },
          products.length === 0 && styles.contentEmpty,
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
        ListHeaderComponent={
          initialLoading && products.length === 0 ? (
            <View style={styles.skeletonGrid}>
              <View style={styles.gridRow}>
                <ShopProductSkeleton width={cardWidth} />
                <ShopProductSkeleton width={cardWidth} />
              </View>
              <View style={styles.gridRow}>
                <ShopProductSkeleton width={cardWidth} />
                <ShopProductSkeleton width={cardWidth} />
              </View>
              <View style={styles.gridRow}>
                <ShopProductSkeleton width={cardWidth} />
                <ShopProductSkeleton width={cardWidth} />
              </View>
            </View>
          ) : null
        }
        ListEmptyComponent={
          listEmpty ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="bag-outline" size={44} color={theme.textMuted} />
              <Text style={styles.emptyTitle}>Hier is nog niets</Text>
              <Text style={styles.emptyText}>
                Probeer een andere categorie of bekijk alles.
              </Text>
              <Pressable style={styles.emptyBtn} onPress={resetToBrowseAll}>
                <Text style={styles.emptyBtnText}>Bekijk alles</Text>
              </Pressable>
            </View>
          ) : null
        }
        ListFooterComponent={
          products.length > 0 ? (
            <View style={styles.footer}>
              {loadingMore ? (
                <ActivityIndicator size="small" color={theme.accent} />
              ) : !hasMore ? (
                <Text style={styles.footerText}>Je hebt alles gezien.</Text>
              ) : null}
            </View>
          ) : null
        }
        onEndReached={() => {
          void loadMore();
        }}
        onEndReachedThreshold={1 - SHOP_WINDOW.LOAD_TRIGGER_RATIO}
        onScroll={(e) => {
          scrollYRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        maintainVisibleContentPosition={{
          minIndexForVisible: 0,
          autoscrollToTopThreshold: 10,
        }}
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
  contentEmpty: {
    flexGrow: 1,
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
    paddingVertical: 8,
  },
  chipsContentSecondary: {
    gap: 8,
    paddingBottom: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  chipSmall: {
    paddingHorizontal: 12,
    paddingVertical: 7,
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
  skeletonGrid: {
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
    backgroundColor: theme.bgElevated,
    overflow: "hidden",
  },
  productImage: {
    width: "100%",
    height: "100%",
  },
  skeletonBlock: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  cardBody: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  productBrand: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 2,
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
    fontSize: 11,
    marginTop: 6,
    fontWeight: "600",
  },
  emptyWrap: {
    paddingVertical: 56,
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
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
  emptyBtn: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: theme.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.accentBorderMuted,
  },
  emptyBtnText: {
    color: theme.accent,
    fontWeight: "800",
    fontSize: 14,
  },
  footer: {
    paddingVertical: 20,
    alignItems: "center",
  },
  footerText: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
});
