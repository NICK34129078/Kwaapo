import React, { useEffect, useRef } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ProductListingImage } from "./ProductListingImage";
import { theme } from "../constants/theme";
import type { Product } from "../types/product";
import { formatPriceEur } from "../utils/formatPrice";

type Props = {
  product: Product;
  bottomInset: number;
  onPress: () => void;
  onDismiss: () => void;
  visible: boolean;
};

export function ProductReelShopCard({
  product,
  bottomInset,
  onPress,
  onDismiss,
  visible,
}: Props) {
  const slide = useRef(new Animated.Value(24)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      return;
    }
    slide.setValue(24);
    opacity.setValue(0);
    Animated.parallel([
      Animated.timing(slide, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, slide, visible, product.id]);

  if (!visible) {
    return null;
  }

  const imageUri = product.images[0];
  const inStock = product.stock > 0;

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          bottom: bottomInset + 8,
          opacity,
          transform: [{ translateY: slide }],
        },
      ]}
      pointerEvents="box-none"
    >
      <Pressable
        style={styles.card}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={`Bekijk product ${product.name}`}
      >
        {imageUri ? (
          <ProductListingImage
            uri={imageUri}
            style={styles.thumb}
            recyclingKey={`reel-shop-${product.id}`}
          />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <Ionicons name="bag-outline" size={18} color={theme.textMuted} />
          </View>
        )}
        <View style={styles.body}>
          <Text style={styles.eyebrow}>Te koop</Text>
          <Text style={styles.name} numberOfLines={2}>
            {product.name}
          </Text>
          <Text style={styles.price}>{formatPriceEur(product.price)}</Text>
          {!inStock ? (
            <Text style={styles.stockHint}>Niet op voorraad</Text>
          ) : null}
        </View>
        <View style={styles.cta}>
          <Text style={styles.ctaText}>Bekijk product</Text>
          <Ionicons name="chevron-forward" size={14} color={theme.bg} />
        </View>
      </Pressable>
      <Pressable
        style={styles.dismissBtn}
        onPress={onDismiss}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Productkaart sluiten"
      >
        <Ionicons name="close" size={16} color={theme.textMuted} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 12,
    right: 72,
    zIndex: 20,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 16,
    backgroundColor: "rgba(12,12,12,0.88)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: theme.bgElevated,
  },
  thumbFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: theme.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  name: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17,
  },
  price: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  stockHint: {
    color: "#f5c542",
    fontSize: 11,
    marginTop: 2,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.accent,
  },
  ctaText: {
    color: theme.bg,
    fontSize: 11,
    fontWeight: "900",
  },
  dismissBtn: {
    position: "absolute",
    top: -8,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.75)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
});
