import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AvatarImage } from "../components/AvatarImage";
import { ProductListingImage } from "../components/ProductListingImage";
import { ProductSellerBusinessInfoModal } from "../components/ProductSellerBusinessInfoModal";
import { useAuth } from "../context/AuthContext";
import { useAuthPrompt } from "../context/AuthPromptContext";
import {
  deleteProduct,
  fetchProductById,
  fetchProductSeller,
  setProductActive,
  type ProductSeller,
} from "../services/productsService";
import { fetchPostsByProductId } from "../services/postsService";
import type { Product } from "../types/product";
import type { UserVideoPost } from "../types/userVideoPost";
import { formatPriceEur } from "../utils/formatPrice";
import {
  isProductSaved,
  saveProductLocally,
  unsaveProductLocally,
} from "../services/savedProductsService";
import {
  canSellerAcceptSales,
  getPublicSellerBusinessName,
  isVerifiedBusinessSellerForBuyers,
  shouldWarnUnverifiedSeller,
} from "../services/sellerOnboardingService";
import { ReportReasonSheet } from "../components/ReportReasonSheet";
import { PRODUCT_REPORT_REASONS } from "../constants/moderationReasons";
import { reportProduct } from "../services/moderationService";
import { getReadableErrorMessage } from "../utils/getReadableErrorMessage";
import { fetchProductVariants } from "../services/productVariantService";
import type { ProductVariant } from "../types/productVariant";

const THUMB_CHIP_SIZE = 58;
const THUMB_CHIP_GAP = 8;

function ProductImageCarousel({
  images,
  width,
  height,
  imageIndex,
  onIndexChange,
}: {
  images: string[];
  width: number;
  height: number;
  imageIndex: number;
  onIndexChange: (index: number) => void;
}) {
  const styles = useThemedStyles(createStyles);

  const listRef = useRef<FlatList<string>>(null);

  const getItemLayout = useCallback(
    (_: ArrayLike<string> | null | undefined, index: number) => ({
      length: width,
      offset: width * index,
      index,
    }),
    [width]
  );

  const scrollToIndex = useCallback(
    (index: number, animated: boolean) => {
      listRef.current?.scrollToOffset({
        offset: width * index,
        animated,
      });
    },
    [width]
  );

  useEffect(() => {
    scrollToIndex(imageIndex, true);
  }, [imageIndex, scrollToIndex]);

  const onMomentumScrollEnd = useCallback(
    (ev: NativeSyntheticEvent<NativeScrollEvent>) => {
      const page = Math.round(ev.nativeEvent.contentOffset.x / width);
      const next = Math.min(Math.max(0, page), images.length - 1);
      if (next !== imageIndex) {
        onIndexChange(next);
      }
    },
    [imageIndex, images.length, onIndexChange, width]
  );

  return (
    <View style={{ width, height }}>
      <FlatList
        ref={listRef}
        data={images}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        bounces={false}
        nestedScrollEnabled
        scrollEventThrottle={16}
        removeClippedSubviews={false}
        keyExtractor={(uri, idx) => `${uri}-${idx}`}
        getItemLayout={getItemLayout}
        onMomentumScrollEnd={onMomentumScrollEnd}
        {...(Platform.OS === "android"
          ? {
              snapToInterval: width,
              snapToAlignment: "start" as const,
              disableIntervalMomentum: true,
            }
          : {})}
        renderItem={({ item, index }) => (
          <View style={{ width, height }}>
            <ProductListingImage
              uri={item}
              style={styles.hero}
              recyclingKey={`product-hero-${item}-${index}`}
            />
          </View>
        )}
      />
      {images.length > 1 ? (
        <View style={styles.heroDotsRow} pointerEvents="none">
          {images.map((uri, i) => (
            <View
              key={`${uri}-${i}`}
              style={[styles.heroDot, i === imageIndex && styles.heroDotActive]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function ProductDetailScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const { openAuthPrompt } = useAuthPrompt();
  const productId: string | undefined = route.params?.productId;
  const canManage: boolean = route.params?.canManage === true;

  const [product, setProduct] = useState<Product | null>(null);
  const [seller, setSeller] = useState<ProductSeller | null>(null);
  const [relatedPosts, setRelatedPosts] = useState<UserVideoPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [businessInfoVisible, setBusinessInfoVisible] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const thumbListRef = useRef<FlatList<string>>(null);

  const heroHeight = Math.min(width * 1.05, 460);
  const thumbSnapInterval = THUMB_CHIP_SIZE + THUMB_CHIP_GAP;

  const load = useCallback(async () => {
    if (!productId) {
      setProduct(null);
      return;
    }
    const row = await fetchProductById(productId);
    setProduct(row);
    setSelectedSize(null);
    setSelectedVariantId(null);
    setVariants([]);

    if (row?.usesVariants && row.variantsReady) {
      const variantRows = await fetchProductVariants(productId);
      setVariants(variantRows);
    }

    if (row) {
      const [sellerRow, posts] = await Promise.all([
        fetchProductSeller(row.ownerId).catch(() => null),
        fetchPostsByProductId(row.id).catch(() => []),
      ]);
      setSeller(sellerRow);
      setRelatedPosts(posts);
    } else {
      setSeller(null);
      setRelatedPosts([]);
    }
  }, [productId]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (!product?.id || canManage) {
      setIsSaved(false);
      return;
    }
    void isProductSaved(product.id).then(setIsSaved).catch(() => setIsSaved(false));
  }, [canManage, product?.id]);

  const images = product?.images ?? [];
  const heroUri = images[imageIndex] ?? images[0];

  const verifiedBusinessSeller = useMemo(
    () => (seller ? isVerifiedBusinessSellerForBuyers(seller) : false),
    [seller]
  );

  const sellerDisplayName = useMemo(() => {
    if (!seller) {
      return t("productDetail.unknownSeller");
    }
    return getPublicSellerBusinessName(seller, verifiedBusinessSeller);
  }, [seller, verifiedBusinessSeller, t]);

  const sellerUsername = useMemo(() => {
    if (!seller?.username?.trim()) {
      return null;
    }
    return `@${seller.username.trim()}`;
  }, [seller?.username]);

  const sellerSubtitle = useMemo(() => {
    if (verifiedBusinessSeller) {
      return sellerUsername;
    }
    if (sellerUsername) {
      return t("productDetail.soldBy", { handle: sellerUsername });
    }
    return t("productDetail.soldByUnknown");
  }, [sellerUsername, verifiedBusinessSeller, t]);

  const showSellerVerificationWarning = useMemo(() => {
    if (!seller || canManage) {
      return false;
    }
    return shouldWarnUnverifiedSeller({
      status: seller.sellerOnboardingStatus,
    });
  }, [canManage, seller]);

  const onEdit = useCallback(() => {
    if (!product) {
      return;
    }
    navigation.navigate("ProductForm", { productId: product.id });
  }, [navigation, product]);

  const onToggleActive = useCallback(async () => {
    if (!product) {
      return;
    }
    setBusy(true);
    try {
      const updated = await setProductActive(product.id, !product.isActive);
      setProduct(updated);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("productDetail.statusChangeFailed");
      Alert.alert(t("alerts.error"), msg);
    } finally {
      setBusy(false);
    }
  }, [product, t]);

  const onDelete = useCallback(() => {
    if (!product) {
      return;
    }
    Alert.alert(
      t("productDetail.deleteTitle"),
      t("productDetail.deleteMessage", { name: product.name }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                await deleteProduct(product.id);
                navigation.goBack();
              } catch (e) {
                const msg =
                  e instanceof Error ? e.message : t("productDetail.deleteFailed");
                Alert.alert(t("alerts.error"), msg);
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ]
    );
  }, [navigation, product, t]);

  const onSubmitProductReport = useCallback(
    async (reason: string) => {
      if (!product?.id || reportBusy) {
        return;
      }
      if (!user) {
        openAuthPrompt({ message: t("productDetail.reportLogin") });
        return;
      }
      setReportBusy(true);
      try {
        const { duplicate } = await reportProduct(product.id, reason);
        Alert.alert(
          t("productDetail.thanks"),
          duplicate
            ? t("productDetail.reportDuplicate")
            : t("productDetail.reportReceived")
        );
      } catch (e) {
        Alert.alert(
          t("productDetail.reportFailed"),
          getReadableErrorMessage(e, t("productDetail.tryAgainLater"))
        );
      } finally {
        setReportBusy(false);
      }
    },
    [openAuthPrompt, product?.id, reportBusy, t, user]
  );

  const usesVariantCheckout = useMemo(
    () => !!(product?.usesVariants && product?.variantsReady),
    [product]
  );

  const selectedVariant = useMemo(
    () => variants.find((v) => v.id === selectedVariantId) ?? null,
    [selectedVariantId, variants]
  );

  const sellerSalesActive = useMemo(() => {
    if (!seller || !product) {
      return false;
    }
    if (!canSellerAcceptSales(seller) || !product.isActive) {
      return false;
    }
    if (usesVariantCheckout) {
      return variants.some((v) => v.isActive && v.stock > 0);
    }
    return product.stock > 0;
  }, [product, seller, usesVariantCheckout, variants]);

  const buyBlockedBySize = useMemo(() => {
    if (!product) {
      return true;
    }
    if (usesVariantCheckout) {
      return !selectedVariant || selectedVariant.stock <= 0;
    }
    if (product.sizes.length > 0) {
      return !selectedSize;
    }
    return false;
  }, [product, selectedSize, selectedVariant, usesVariantCheckout]);

  const onBuyNow = useCallback(() => {
    if (!product) {
      return;
    }
    if (!sellerSalesActive) {
      Alert.alert(
        t("productDetail.unavailable"),
        t("productDetail.unavailableMessage")
      );
      return;
    }
    if (buyBlockedBySize) {
      Alert.alert(t("productDetail.chooseSizeTitle"), t("productDetail.chooseSizeMessage"));
      return;
    }
    navigation.navigate("CheckoutReview", {
      productId: product.id,
      quantity: 1,
      size: selectedVariant?.optionValue ?? selectedSize,
      productVariantId: selectedVariant?.id ?? null,
      selectedVariantType: selectedVariant ? "size" : null,
      selectedVariantValue: selectedVariant?.optionValue ?? selectedSize,
    });
  }, [
    buyBlockedBySize,
    navigation,
    product,
    selectedSize,
    selectedVariant,
    sellerSalesActive,
    t,
  ]);

  const onToggleSave = useCallback(() => {
    if (!product) {
      return;
    }
    if (!user) {
      openAuthPrompt({ message: t("productDetail.saveLogin") });
      return;
    }
    const next = !isSaved;
    setIsSaved(next);
    void (next ? saveProductLocally(product.id) : unsaveProductLocally(product.id)).catch(
      () => {
        setIsSaved(!next);
        Alert.alert(t("productDetail.saveFailed"), t("productDetail.tryAgain"));
      }
    );
  }, [isSaved, openAuthPrompt, product, t, user]);

  const onSellerPress = useCallback(() => {
    if (!seller?.id) {
      return;
    }
    if (seller.id === user?.id) {
      navigation.navigate("MainTabs", { screen: "Profile" });
      return;
    }
    navigation.navigate("PublicProfile", { profileId: seller.id });
  }, [navigation, seller?.id, user?.id]);

  const openRelatedPost = useCallback(
    (post: UserVideoPost) => {
      if (!post.ownerProfileId) {
        return;
      }
      navigation.navigate("ProfileReels", {
        profileId: post.ownerProfileId,
        initialPostId: post.id,
        posts: relatedPosts,
        isOwnProfile: post.ownerProfileId === user?.id,
      });
    },
    [navigation, relatedPosts, user?.id]
  );

  const selectImageIndex = useCallback(
    (index: number) => {
      setImageIndex(index);
      thumbListRef.current?.scrollToOffset({
        offset: thumbSnapInterval * index,
        animated: true,
      });
    },
    [thumbSnapInterval]
  );

  useEffect(() => {
    if (images.length === 0) {
      return;
    }
    const safeIndex = Math.min(imageIndex, images.length - 1);
    if (safeIndex !== imageIndex) {
      setImageIndex(safeIndex);
      return;
    }
    thumbListRef.current?.scrollToOffset({
      offset: thumbSnapInterval * safeIndex,
      animated: false,
    });
  }, [imageIndex, images.length, thumbSnapInterval]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.topBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
        >
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </Pressable>
        <Text style={styles.screenTitle} numberOfLines={1}>
          {t("productDetail.title")}
        </Text>
        {canManage ? (
          <Pressable
            onPress={onEdit}
            style={styles.topBtn}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t("common.edit")}
          >
            <Ionicons name="create-outline" size={24} color={theme.accent} />
          </Pressable>
        ) : product ? (
          <Pressable
            onPress={() => {
              if (!user) {
                openAuthPrompt({ message: t("productDetail.reportLogin") });
                return;
              }
              setReportVisible(true);
            }}
            style={styles.topBtn}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t("productDetail.reportProduct")}
          >
            <Ionicons name="flag-outline" size={22} color={theme.text} />
          </Pressable>
        ) : (
          <View style={styles.topBtn} />
        )}
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="small" color={theme.accent} />
        </View>
      ) : !product ? (
        <View style={styles.centerState}>
          <Text style={styles.emptyText}>{t("productDetail.notFound")}</Text>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={{ paddingBottom: insets.bottom + 112 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.heroWrap, { height: heroHeight }]}>
              {images.length > 1 ? (
                <ProductImageCarousel
                  images={images}
                  width={width}
                  height={heroHeight}
                  imageIndex={imageIndex}
                  onIndexChange={setImageIndex}
                />
              ) : heroUri ? (
                <ProductListingImage
                  uri={heroUri}
                  style={styles.hero}
                  recyclingKey={`product-hero-${heroUri}`}
                />
              ) : (
                <View style={[styles.hero, styles.heroFallback]}>
                  <Ionicons name="image-outline" size={54} color={theme.textMuted} />
                </View>
              )}
              {!product.isActive && canManage ? (
                <View style={styles.inactiveBadge}>
                  <Text style={styles.inactiveBadgeText}>{t("productDetail.inactive")}</Text>
                </View>
              ) : null}
            </View>

            {images.length > 1 ? (
              <FlatList
                ref={thumbListRef}
                horizontal
                data={images}
                keyExtractor={(uri, idx) => `${uri}-${idx}`}
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                nestedScrollEnabled
                snapToInterval={thumbSnapInterval}
                snapToAlignment="start"
                contentContainerStyle={styles.thumbRow}
                {...(Platform.OS === "android" ? { disableIntervalMomentum: true } : {})}
                renderItem={({ item, index }) => (
                  <Pressable
                    onPress={() => selectImageIndex(index)}
                    style={[
                      styles.thumbChip,
                      index === imageIndex && styles.thumbChipActive,
                      index < images.length - 1 && styles.thumbChipSpacing,
                    ]}
                  >
                    <ProductListingImage
                      uri={item}
                      style={styles.thumbChipImg}
                      recyclingKey={`product-thumb-${item}-${index}`}
                    />
                  </Pressable>
                )}
              />
            ) : null}

            <View style={styles.body}>
              <Text style={styles.name}>{product.name}</Text>
              <Text style={styles.price}>{formatPriceEur(product.price)}</Text>
              <View style={styles.metaGrid}>
                <View style={styles.metaPill}>
                  <Text style={styles.metaLabel}>{t("productDetail.brand")}</Text>
                  <Text style={styles.metaValue}>{product.brand || t("productDetail.unknown")}</Text>
                </View>
                <View style={styles.metaPill}>
                  <Text style={styles.metaLabel}>{t("productDetail.category")}</Text>
                  <Text style={styles.metaValue}>{product.category || t("productDetail.other")}</Text>
                </View>
                <View style={styles.metaPill}>
                  <Text style={styles.metaLabel}>{t("productDetail.stock")}</Text>
                  <Text style={styles.metaValue}>
                    {product.stock > 0
                      ? t("productDetail.inStock", { count: product.stock })
                      : t("productDetail.notInStock")}
                  </Text>
                </View>
              </View>

              {showSellerVerificationWarning ? (
                <View style={styles.verifyWarning}>
                  <Ionicons name="information-circle-outline" size={20} color="#f5c542" />
                  <Text style={styles.verifyWarningText}>
                    {t("productDetail.verifyWarning")}
                  </Text>
                </View>
              ) : null}

              <View style={styles.sellerBlock}>
                <Text style={styles.sellerSectionEyebrow}>{t("productDetail.soldByEyebrow")}</Text>
                <View style={styles.sellerRow}>
                  <AvatarImage uri={seller?.avatarUrl} style={styles.sellerAvatar} />
                  <View style={styles.sellerTextWrap}>
                    <Text style={styles.sellerName} numberOfLines={2}>
                      {sellerDisplayName}
                    </Text>
                    {verifiedBusinessSeller ? (
                      <View style={styles.verifiedBadge}>
                        <Ionicons
                          name="shield-checkmark"
                          size={13}
                          color={theme.accent}
                        />
                        <Text style={styles.verifiedBadgeText}>
                          {t("productDetail.verifiedSeller")}
                        </Text>
                      </View>
                    ) : null}
                    <Text style={styles.sellerUsername} numberOfLines={1}>
                      {sellerSubtitle}
                    </Text>
                    {verifiedBusinessSeller && seller?.kvkNumber?.trim() ? (
                      <Text style={styles.sellerKvk}>
                        KVK: {seller.kvkNumber.trim()}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.sellerActions}>
                  {verifiedBusinessSeller ? (
                    <Pressable
                      style={styles.sellerActionBtn}
                      onPress={() => setBusinessInfoVisible(true)}
                      accessibilityRole="button"
                      accessibilityLabel={t("productDetail.viewBusinessInfo")}
                    >
                      <Text style={styles.sellerActionBtnText}>
                        {t("productDetail.viewBusinessInfo")}
                      </Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    style={[
                      styles.sellerActionBtn,
                      verifiedBusinessSeller && styles.sellerActionBtnSecondary,
                    ]}
                    onPress={onSellerPress}
                    disabled={!seller?.id}
                    accessibilityRole="button"
                    accessibilityLabel={t("productDetail.viewSellerProfile")}
                  >
                    <Text
                      style={[
                        styles.sellerActionBtnText,
                        verifiedBusinessSeller && styles.sellerActionBtnTextSecondary,
                      ]}
                    >
                      {t("productDetail.viewSellerProfile")}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {!canManage ? (
                <Text style={styles.marketplaceNote}>
                  {t("productDetail.marketplaceNote")}
                </Text>
              ) : null}

              {usesVariantCheckout && variants.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>{t("productDetail.chooseSize")}</Text>
                  <View style={styles.sizeRow}>
                    {variants.map((variant) => {
                      const selected = selectedVariantId === variant.id;
                      const out = variant.stock <= 0;
                      return (
                        <Pressable
                          key={variant.id}
                          style={[
                            styles.sizeChip,
                            selected && styles.sizeChipSelected,
                            out && styles.sizeChipDisabled,
                          ]}
                          onPress={() => {
                            if (out) {
                              return;
                            }
                            setSelectedVariantId(variant.id);
                            setSelectedSize(variant.optionValue);
                          }}
                          disabled={out}
                          accessibilityRole="button"
                          accessibilityLabel={t("productDetail.sizeAccessibility", {
                            size: variant.optionValue,
                          })}
                        >
                          <Text
                            style={[
                              styles.sizeChipText,
                              selected && styles.sizeChipTextSelected,
                              out && styles.sizeChipTextDisabled,
                              out && styles.sizeChipTextStrike,
                            ]}
                          >
                            {variant.optionValue}
                          </Text>
                          {out ? (
                            <Text style={styles.sizeOutLabel}>{t("shop.outOfStock")}</Text>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                  {selectedVariant && selectedVariant.stock > 0 ? (
                    <Text style={styles.sizeStockHint}>
                      {t("productDetail.sizeStockHint", {
                        count: selectedVariant.stock,
                        size: selectedVariant.optionValue,
                      })}
                    </Text>
                  ) : null}
                </View>
              ) : product.sizes.length > 0 && !usesVariantCheckout ? (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>{t("productDetail.chooseSize")}</Text>
                  <View style={styles.sizeRow}>
                    {product.sizes.map((size) => {
                      const selected = selectedSize === size;
                      return (
                        <Pressable
                          key={size}
                          style={[styles.sizeChip, selected && styles.sizeChipSelected]}
                          onPress={() => setSelectedSize(size)}
                          accessibilityRole="button"
                          accessibilityLabel={t("productDetail.sizeAccessibility", { size })}
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

              {product.description?.trim() ? (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>{t("productDetail.description")}</Text>
                  <Text style={styles.description}>{product.description.trim()}</Text>
                </View>
              ) : null}

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t("productDetail.videosWithProduct")}</Text>
                {relatedPosts.length === 0 ? (
                  <Text style={styles.mutedText}>
                    {t("productDetail.noRelatedReels")}
                  </Text>
                ) : (
                  <FlatList
                    horizontal
                    data={relatedPosts}
                    keyExtractor={(item) => item.id}
                    showsHorizontalScrollIndicator={false}
                    decelerationRate="fast"
                    nestedScrollEnabled
                    snapToInterval={114}
                    snapToAlignment="start"
                    contentContainerStyle={styles.relatedList}
                    {...(Platform.OS === "android" ? { disableIntervalMomentum: true } : {})}
                    renderItem={({ item, index }) => (
                      <Pressable
                        style={[
                          styles.relatedCard,
                          index < relatedPosts.length - 1 && styles.relatedCardSpacing,
                        ]}
                        onPress={() => openRelatedPost(item)}
                        accessibilityRole="button"
                        accessibilityLabel={t("productDetail.openReel")}
                      >
                        {item.thumbnailUrl || item.imageUrl ? (
                          <ProductListingImage
                            uri={item.thumbnailUrl ?? item.imageUrl}
                            style={styles.relatedThumb}
                            recyclingKey={`related-${item.id}`}
                          />
                        ) : (
                          <View style={[styles.relatedThumb, styles.heroFallback]}>
                            <Ionicons name="play-circle" size={26} color={theme.textMuted} />
                          </View>
                        )}
                        <View style={styles.relatedPlay}>
                          <Ionicons name="play" size={14} color="#fff" />
                        </View>
                      </Pressable>
                    )}
                  />
                )}
              </View>

              {canManage ? (
                <View style={styles.manageActions}>
                  <Pressable
                    style={styles.managePrimary}
                    onPress={onEdit}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={t("productDetail.editProduct")}
                  >
                    <Text style={styles.managePrimaryText}>{t("common.edit")}</Text>
                  </Pressable>
                  <Pressable
                    style={styles.manageSecondary}
                    onPress={() => void onToggleActive()}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={
                      product.isActive
                        ? t("productDetail.deactivateProduct")
                        : t("productDetail.activateProduct")
                    }
                  >
                    <Text style={styles.manageSecondaryText}>
                      {product.isActive ? t("productDetail.deactivate") : t("productDetail.activate")}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.manageDanger}
                    onPress={onDelete}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={t("productDetail.deleteTitle")}
                  >
                    <Text style={styles.manageDangerText}>{t("common.delete")}</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </ScrollView>

          {!canManage ? (
            <View style={[styles.stickyBar, { paddingBottom: insets.bottom + 10 }]}>
              <View style={styles.stickyActions}>
                <Pressable
                  style={styles.saveBtn}
                  onPress={onToggleSave}
                  accessibilityRole="button"
                  accessibilityLabel={
                    isSaved ? t("productDetail.removeFromSaved") : t("productDetail.saveProduct")
                  }
                >
                  <Ionicons
                    name={isSaved ? "bookmark" : "bookmark-outline"}
                    size={22}
                    color={theme.text}
                  />
                  <Text style={styles.saveBtnText}>{t("productDetail.save")}</Text>
                </Pressable>
                  <Pressable
                  style={[
                    styles.buyBtn,
                    (!sellerSalesActive || buyBlockedBySize) && styles.buyBtnDisabled,
                  ]}
                  onPress={onBuyNow}
                  disabled={!sellerSalesActive}
                  accessibilityRole="button"
                  accessibilityLabel={
                    sellerSalesActive
                      ? buyBlockedBySize
                        ? t("productDetail.chooseSizeFirst")
                        : t("productDetail.buyNow")
                      : t("productDetail.buyUnavailable")
                  }
                >
                  <Text style={styles.buyBtnText}>
                    {!sellerSalesActive
                      ? t("productDetail.notForSaleYet")
                      : buyBlockedBySize
                        ? t("productDetail.chooseSizeFirst")
                        : t("productDetail.buyNow")}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          <ProductSellerBusinessInfoModal
            visible={businessInfoVisible}
            seller={seller}
            verifiedBusiness={verifiedBusinessSeller}
            onClose={() => setBusinessInfoVisible(false)}
          />
          <ReportReasonSheet
            visible={reportVisible}
            onClose={() => setReportVisible(false)}
            onSubmit={(reason) => void onSubmitProductReport(reason)}
            busy={reportBusy}
            title={t("productDetail.reportProduct")}
            subtitle={t("productDetail.reportSubtitle")}
            reasons={PRODUCT_REPORT_REASONS}
          />
        </>
      )}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  topBtn: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  screenTitle: {
    flex: 1,
    color: theme.text,
    fontSize: 17,
    fontWeight: "800",
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
  heroWrap: {
    position: "relative",
    marginHorizontal: 16,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: theme.bgElevated,
  },
  hero: {
    width: "100%",
    height: "100%",
    backgroundColor: theme.bgElevated,
  },
  heroFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.bgElevated,
  },
  inactiveBadge: {
    position: "absolute",
    top: 14,
    left: 14,
    backgroundColor: "rgba(0,0,0,0.72)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  inactiveBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  heroDotsRow: {
    position: "absolute",
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  heroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  heroDotActive: {
    width: 18,
    backgroundColor: theme.accent,
  },
  thumbRow: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  thumbChip: {
    width: THUMB_CHIP_SIZE,
    height: THUMB_CHIP_SIZE,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "transparent",
  },
  thumbChipSpacing: {
    marginRight: THUMB_CHIP_GAP,
  },
  thumbChipActive: {
    borderColor: theme.accent,
  },
  thumbChipImg: {
    width: "100%",
    height: "100%",
    backgroundColor: theme.bgElevated,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  name: {
    color: theme.text,
    fontSize: 25,
    fontWeight: "900",
    lineHeight: 31,
    letterSpacing: -0.3,
  },
  price: {
    color: theme.accent,
    fontSize: 25,
    fontWeight: "900",
    marginTop: 8,
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
  },
  metaPill: {
    flexGrow: 1,
    minWidth: "31%",
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  metaLabel: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  metaValue: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "700",
  },
  section: {
    marginTop: 22,
  },
  sectionLabel: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.45,
    marginBottom: 9,
  },
  sectionTitle: {
    color: theme.text,
    fontSize: 17,
    fontWeight: "900",
    marginBottom: 12,
  },
  sizeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  sizeChip: {
    minWidth: 52,
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    backgroundColor: theme.bgElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  sizeChipSelected: {
    borderColor: theme.accent,
    backgroundColor: theme.accentSoft,
    borderWidth: 1.5,
  },
  sizeChipText: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "800",
  },
  sizeChipTextSelected: {
    color: theme.accent,
  },
  sizeChipDisabled: {
    opacity: 0.5,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  sizeChipTextDisabled: {
    color: theme.textMuted,
  },
  sizeChipTextStrike: {
    textDecorationLine: "line-through",
  },
  sizeOutLabel: {
    color: theme.textMuted,
    fontSize: 9,
    fontWeight: "700",
    marginTop: 2,
    textTransform: "uppercase",
  },
  sizeStockHint: {
    color: theme.textMuted,
    fontSize: 13,
    marginTop: 10,
    fontWeight: "600",
  },
  description: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 15,
    lineHeight: 23,
  },
  mutedText: {
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  relatedList: {
    paddingRight: 4,
  },
  relatedCard: {
    width: 104,
    height: 136,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: theme.bgElevated,
  },
  relatedCardSpacing: {
    marginRight: 10,
  },
  relatedThumb: {
    width: "100%",
    height: "100%",
    backgroundColor: theme.bgElevated,
  },
  relatedPlay: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  verifyWarning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 20,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255, 193, 7, 0.1)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 193, 7, 0.35)",
  },
  verifyWarningText: {
    flex: 1,
    color: theme.text,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  sellerBlock: {
    marginTop: 22,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    gap: 14,
  },
  marketplaceNote: {
    marginTop: 12,
    color: theme.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  sellerSectionEyebrow: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  sellerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  sellerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.bgElevated,
  },
  sellerAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  sellerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  sellerName: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22,
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: theme.accentLight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.accentBorder,
  },
  verifiedBadgeText: {
    color: theme.accent,
    fontSize: 11,
    fontWeight: "700",
  },
  sellerUsername: {
    color: theme.textMuted,
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
  sellerKvk: {
    color: theme.textMuted,
    fontSize: 12,
    marginTop: 4,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  sellerActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sellerActionBtn: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: "46%",
    borderRadius: 12,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    backgroundColor: theme.accent,
  },
  sellerActionBtnSecondary: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  sellerActionBtnText: {
    color: theme.bg,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  sellerActionBtnTextSecondary: {
    color: theme.text,
  },
  manageActions: {
    paddingTop: 22,
    gap: 10,
  },
  managePrimary: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  managePrimaryText: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "800",
  },
  manageSecondary: {
    borderRadius: 12,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  manageSecondaryText: {
    color: theme.textMuted,
    fontSize: 14,
    fontWeight: "700",
  },
  manageDanger: {
    borderRadius: 12,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  manageDangerText: {
    color: "#ff8a84",
    fontSize: 14,
    fontWeight: "800",
  },
  stickyBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: "rgba(11,11,11,0.94)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
  },
  stickyActions: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  saveBtn: {
    minWidth: 84,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    backgroundColor: theme.bgElevated,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    gap: 4,
  },
  saveBtnText: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: "800",
  },
  buyBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  buyBtnDisabled: {
    opacity: 0.75,
  },
  buyBtnText: {
    color: theme.bg,
    fontSize: 17,
    fontWeight: "900",
  },
});
}

