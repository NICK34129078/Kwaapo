import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../constants/theme";
import { SHOP_PRODUCT_CATEGORIES } from "../constants/shopCategories";
import { useAuth } from "../context/AuthContext";
import {
  canSellerPrepareProducts,
  fetchMySellerOnboarding,
  isSellerPayoutReadyForSales,
} from "../services/sellerOnboardingService";
import {
  createProduct,
  fetchProductById,
  updateProduct,
} from "../services/productsService";
import {
  formatSizesForInput,
  parsePriceInput,
  parseSizesInput,
} from "../utils/formatPrice";
import {
  MAX_PRODUCT_IMAGES,
  uploadProductImages,
} from "../utils/uploadProductImage";
import { createUuidV4 } from "../utils/uuid";
import { parseHashtagInput } from "../utils/hashtags";

type ImageDraft = {
  uri: string;
  isRemote: boolean;
};

export function ProductFormScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const productId: string | undefined = route.params?.productId;
  const isEdit = !!productId;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceText, setPriceText] = useState("");
  const [category, setCategory] = useState("");
  const [tagsDraft, setTagsDraft] = useState("");
  const [brand, setBrand] = useState("");
  const [stockText, setStockText] = useState("0");
  const [sizesText, setSizesText] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [images, setImages] = useState<ImageDraft[]>([]);
  const [payoutReady, setPayoutReady] = useState(false);

  useEffect(() => {
    if (productId) {
      return;
    }
    void (async () => {
      try {
        const onboarding = await fetchMySellerOnboarding();
        const ready = isSellerPayoutReadyForSales(onboarding);
        setPayoutReady(ready);
        if (!ready) {
          setIsActive(false);
        }
        if (!canSellerPrepareProducts(onboarding)) {
          Alert.alert(
            "Zakelijk account nodig",
            "Alleen zakelijke verkopers kunnen producten voorbereiden.",
            [
              {
                text: "Verkoopaccount",
                onPress: () => {
                  navigation.replace("SellerOnboarding");
                },
              },
              {
                text: "Terug",
                style: "cancel",
                onPress: () => navigation.goBack(),
              },
            ]
          );
        }
      } catch {
        navigation.goBack();
      }
    })();
  }, [navigation, productId]);

  useEffect(() => {
    if (!productId) {
      return;
    }
    setLoading(true);
    void (async () => {
      try {
        const [product, onboarding] = await Promise.all([
          fetchProductById(productId),
          fetchMySellerOnboarding(),
        ]);
        const ready = isSellerPayoutReadyForSales(onboarding);
        setPayoutReady(ready);
        if (!product) {
          Alert.alert("Fout", "Product niet gevonden.");
          navigation.goBack();
          return;
        }
        setName(product.name);
        setDescription(product.description ?? "");
        setPriceText(String(product.price).replace(".", ","));
        setCategory(product.category ?? "");
        setTagsDraft(product.tags.map((tag) => `#${tag}`).join(" "));
        setBrand(product.brand ?? "");
        setStockText(String(product.stock));
        setSizesText(formatSizesForInput(product.sizes));
        setIsActive(ready ? product.isActive : false);
        setImages(
          product.images.map((uri) => ({ uri, isRemote: true }))
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Laden mislukt.";
        Alert.alert("Fout", msg);
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    })();
  }, [navigation, productId]);

  const canSave = useMemo(() => {
    if (saving || loading) {
      return false;
    }
    return name.trim().length >= 2 && parsePriceInput(priceText) !== null;
  }, [loading, name, priceText, saving]);

  const pickImages = useCallback(async () => {
    const remaining = MAX_PRODUCT_IMAGES - images.length;
    if (remaining <= 0) {
      Alert.alert("Maximum bereikt", `Maximaal ${MAX_PRODUCT_IMAGES} foto's.`);
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Toegang nodig",
        "Sta toegang tot je galerij toe om foto's te kiezen."
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.85,
    });
    if (result.canceled || !result.assets.length) {
      return;
    }
    const next = result.assets
      .filter((asset) => asset.uri)
      .map((asset) => ({ uri: asset.uri, isRemote: false }));
    setImages((prev) => [...prev, ...next].slice(0, MAX_PRODUCT_IMAGES));
  }, [images.length]);

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const onSave = useCallback(async () => {
    if (!user?.id) {
      Alert.alert("Niet ingelogd", "Log in om producten te beheren.");
      return;
    }
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      Alert.alert("Naam ontbreekt", "Vul een productnaam in.");
      return;
    }
    const price = parsePriceInput(priceText);
    if (price === null) {
      Alert.alert("Ongeldige prijs", "Vul een geldige prijs in.");
      return;
    }
    const stockParsed = parseInt(stockText.replace(/\D/g, ""), 10);
    const stock = Number.isFinite(stockParsed) ? Math.max(0, stockParsed) : 0;
    const sizes = parseSizesInput(sizesText);
    const tags = parseHashtagInput(tagsDraft);

    setSaving(true);
    try {
      const targetId = productId ?? createUuidV4();
      const localUris = images.map((img) => img.uri);
      const uploadedUrls = await uploadProductImages(
        user.id,
        targetId,
        localUris
      );

      const payload = {
        name: trimmedName,
        description: description.trim() || null,
        price,
        category: category.trim() || null,
        brand: brand.trim() || null,
        tags,
        stock,
        images: uploadedUrls,
        sizes,
        isActive: payoutReady ? isActive : false,
      };

      if (isEdit && productId) {
        await updateProduct(productId, payload);
      } else {
        await createProduct(payload, targetId);
      }
      navigation.goBack();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Opslaan mislukt.";
      Alert.alert("Fout", msg);
    } finally {
      setSaving(false);
    }
  }, [
    brand,
    category,
    description,
    images,
    payoutReady,
    isActive,
    isEdit,
    name,
    navigation,
    priceText,
    productId,
    sizesText,
    stockText,
    tagsDraft,
    user?.id,
  ]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Terug"
        >
          <Ionicons name="close" size={26} color={theme.text} />
        </Pressable>
        <Text style={styles.screenTitle}>
          {isEdit ? "Product bewerken" : "Product toevoegen"}
        </Text>
        <Pressable
          onPress={() => void onSave()}
          disabled={!canSave}
          style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Opslaan"
        >
          {saving ? (
            <ActivityIndicator size="small" color={theme.accent} />
          ) : (
            <Text style={[styles.saveBtnText, !canSave && styles.saveBtnTextDisabled]}>
              Opslaan
            </Text>
          )}
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="small" color={theme.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.form,
            { paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.label}>Foto's</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.imageRow}
          >
            <Pressable
              style={styles.addImageBtn}
              onPress={() => void pickImages()}
              accessibilityRole="button"
              accessibilityLabel="Foto's toevoegen"
            >
              <Ionicons name="camera-outline" size={28} color={theme.accent} />
              <Text style={styles.addImageText}>Toevoegen</Text>
            </Pressable>
            {images.map((img, index) => (
              <View key={`${img.uri}-${index}`} style={styles.imageWrap}>
                <Image source={{ uri: img.uri }} style={styles.imageThumb} />
                <Pressable
                  style={styles.removeImageBtn}
                  onPress={() => removeImage(index)}
                  accessibilityRole="button"
                  accessibilityLabel="Foto verwijderen"
                >
                  <Ionicons name="close-circle" size={22} color="#fff" />
                </Pressable>
              </View>
            ))}
          </ScrollView>

          <Text style={styles.label}>Naam *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Productnaam"
            placeholderTextColor={theme.textMuted}
            maxLength={120}
          />

          <Text style={styles.label}>Beschrijving</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Beschrijf je product..."
            placeholderTextColor={theme.textMuted}
            multiline
            maxLength={2000}
          />

          <View style={styles.rowInputs}>
            <View style={styles.halfField}>
              <Text style={styles.label}>Prijs *</Text>
              <TextInput
                style={styles.input}
                value={priceText}
                onChangeText={setPriceText}
                placeholder="29,99"
                placeholderTextColor={theme.textMuted}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.halfField}>
              <Text style={styles.label}>Voorraad</Text>
              <TextInput
                style={styles.input}
                value={stockText}
                onChangeText={setStockText}
                placeholder="0"
                placeholderTextColor={theme.textMuted}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <Text style={styles.label}>Categorie</Text>
          <Text style={styles.categoryHint}>
            Kies een filter zodat klanten je product sneller vinden in de Store.
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryChipRow}
          >
            {SHOP_PRODUCT_CATEGORIES.map((item) => {
              const selected = category === item;
              return (
                <Pressable
                  key={item}
                  style={[styles.categoryChip, selected && styles.categoryChipSelected]}
                  onPress={() => setCategory(selected ? "" : item)}
                  accessibilityRole="button"
                  accessibilityLabel={item}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      selected && styles.categoryChipTextSelected,
                    ]}
                  >
                    {item}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.label}>Stijltags</Text>
          <Text style={styles.categoryHint}>
            Helpt de shop jouw product te matchen met interesses (bijv. summer beach
            oldmoney). Max 10 tags, zonder # in de database.
          </Text>
          <TextInput
            style={styles.input}
            value={tagsDraft}
            onChangeText={setTagsDraft}
            placeholder="#summer #beach #casual"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Merk</Text>
          <TextInput
            style={styles.input}
            value={brand}
            onChangeText={setBrand}
            placeholder="Merknaam"
            placeholderTextColor={theme.textMuted}
            maxLength={80}
          />

          <Text style={styles.label}>Maten</Text>
          <TextInput
            style={styles.input}
            value={sizesText}
            onChangeText={setSizesText}
            placeholder="S, M, L, XL"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="characters"
          />
          <Text style={styles.hint}>Scheid maten met komma's.</Text>

          <View style={styles.switchRow}>
            <View style={styles.switchTextWrap}>
              <Text style={styles.switchLabel}>Product actief</Text>
              <Text style={styles.switchHint}>
                {payoutReady
                  ? "Inactieve producten zijn niet zichtbaar in je winkel-tab."
                  : "Rond Stripe-uitbetalingen af om producten publiek te activeren."}
              </Text>
            </View>
            <Switch
              value={isActive}
              onValueChange={(next) => {
                if (next && !payoutReady) {
                  Alert.alert(
                    "Stripe nog niet klaar",
                    "Je kunt concepten opslaan, maar pas publiceren zodra uitbetalingen volledig zijn ingesteld."
                  );
                  return;
                }
                setIsActive(next);
              }}
              disabled={!payoutReady}
              trackColor={{ false: theme.border, true: theme.accentSoft }}
              thumbColor={isActive ? theme.accent : theme.textMuted}
            />
          </View>
        </ScrollView>
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
    marginBottom: 4,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtn: {
    minWidth: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    color: theme.accent,
    fontSize: 16,
    fontWeight: "700",
  },
  saveBtnTextDisabled: {
    color: theme.textMuted,
  },
  screenTitle: {
    flex: 1,
    color: theme.text,
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  form: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  label: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 12,
  },
  categoryHint: {
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 8,
  },
  categoryChipRow: {
    gap: 8,
    paddingBottom: 4,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  categoryChipSelected: {
    backgroundColor: theme.accentSoft,
    borderColor: theme.accentBorderMuted,
  },
  categoryChipText: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: "700",
  },
  categoryChipTextSelected: {
    color: theme.accent,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.text,
    fontSize: 15,
    backgroundColor: theme.bgElevated,
  },
  textArea: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  rowInputs: {
    flexDirection: "row",
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  hint: {
    color: theme.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  imageRow: {
    gap: 10,
    paddingVertical: 4,
  },
  addImageBtn: {
    width: 88,
    height: 88,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    backgroundColor: theme.bgElevated,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  addImageText: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: "600",
  },
  imageWrap: {
    position: "relative",
  },
  imageThumb: {
    width: 88,
    height: 88,
    borderRadius: 12,
    backgroundColor: theme.bgElevated,
  },
  removeImageBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 11,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: theme.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  switchTextWrap: {
    flex: 1,
  },
  switchLabel: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "600",
  },
  switchHint: {
    color: theme.textMuted,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 17,
  },
});
