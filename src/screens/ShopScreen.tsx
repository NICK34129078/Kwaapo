import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
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
import { theme } from "../constants/theme";
import { fetchActiveProducts } from "../services/productsService";
import type { Product } from "../types/product";
import { formatPriceEur } from "../utils/formatPrice";

const CATEGORIES = [
  "Alle",
  "Kleding",
  "Schoenen",
  "Accessoires",
  "Elektronica",
  "Sport",
  "Overig",
];
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
  const imageOpacity = useRef(new Animated.Value(0)).current;
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

  const fadeIn = useCallback(() => {
    Animated.timing(imageOpacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [imageOpacity]);

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
          {imageUri ? (
            <Animated.View style={[styles.imageFill, { opacity: imageOpacity }]}>
              <Image source={{ uri: imageUri }} style={styles.productImage} onLoad={fadeIn} />
            </Animated.View>
          ) : (
            <View style={[styles.productImage, styles.imageFallback]}>
              <Ionicons name="image-outline" size={30} color={theme.textMuted} />
            </View>
          )}
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Alle");

  const load = useCallback(async () => {
    const rows = await fetchActiveProducts(100);
    setProducts(rows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load().finally(() => setLoading(false));
    }, [load])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  }, [load]);

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((product) => {
      const categoryMatch =
        category === "Alle" ||
        (product.category ?? "").trim().toLowerCase() === category.toLowerCase();
      if (!categoryMatch) {
        return false;
      }
      if (q.length === 0) {
        return true;
      }
      const haystack = [
        product.name,
        product.brand ?? "",
        product.category ?? "",
        product.description ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
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

  const listHeader = (
    <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
      <Text style={styles.kicker}>TikTok Shop meets Instagram Shop</Text>
      <Text style={styles.title}>Shop de nieuwste producten</Text>
      <Text style={styles.subtitle}>
        Ontdek items uit business stores en bekijk direct de content erbij.
      </Text>
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={theme.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Zoek producten..."
          placeholderTextColor={theme.textMuted}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsContent}
      >
        {CATEGORIES.map((item) => {
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
  );

  return (
    <View style={styles.root}>
      {loading && !refreshing ? (
        <View style={[styles.loadingState, { paddingTop: insets.top }]}>
          <ActivityIndicator size="small" color={theme.accent} />
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          ListHeaderComponent={listHeader}
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
            <View style={styles.emptyWrap}>
              <Ionicons name="bag-outline" size={44} color={theme.textMuted} />
              <Text style={styles.emptyTitle}>Geen producten gevonden</Text>
              <Text style={styles.emptyText}>
                Probeer een andere zoekterm of categorie.
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 16,
  },
  header: {
    paddingBottom: 8,
  },
  kicker: {
    color: theme.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
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
    borderColor: "rgba(158, 255, 0, 0.55)",
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
  },
  imageFill: {
    flex: 1,
  },
  productImage: {
    width: "100%",
    height: "100%",
  },
  imageFallback: {
    alignItems: "center",
    justifyContent: "center",
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