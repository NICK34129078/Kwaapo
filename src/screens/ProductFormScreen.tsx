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

import {

  categoryRequiresAudience,

  getSizeMode,

  isCategoryReadyForSizeQuestion,

  sizeModeRequiresVariants,

} from "../constants/productSizePresets";

import {

  resolveMainCategoryFromLegacyCategory,

  type ShopAudienceCode,

  type ShopMainCategoryCode,

} from "../constants/shopCategories";

import { useAuth } from "../context/AuthContext";

import {

  buildCategoryPayload,

  ProductCategoryPicker,

  type ProductCategorySection,

} from "../components/ProductCategoryPicker";

import {

  canSellerPrepareProducts,

  fetchMySellerOnboarding,

  isSellerPayoutReadyForSales,

} from "../services/sellerOnboardingService";

import {

  createProduct,

  fetchProductById,

  updateProductDetails,

} from "../services/productsService";

import { emitProductCatalogEvent } from "../services/productCatalogRefresh";

import { formatProductDetailsSaveError } from "../utils/formatAppError";

import { parsePriceInput } from "../utils/formatPrice";

import {

  MAX_PRODUCT_IMAGES,

  uploadProductImages,

} from "../utils/uploadProductImage";

import { createUuidV4 } from "../utils/uuid";

import { ProductStockSection } from "../components/ProductStockSection";

import { ProductVariantStockSection } from "../components/ProductVariantStockSection";

import {

  ProductVariantSizeEditor,

  variantMapToInputs,

  type VariantStockMap,

} from "../components/ProductVariantSizeEditor";

import { setupNewProductWithVariants } from "../services/productVariantService";

import { parseHashtagInput } from "../utils/hashtags";

import { getProductPublishBlockers } from "../utils/productPublishValidation";

import { ChoiceCard, ChoiceCardGrid } from "../components/ChoiceCardGrid";

import type { Product } from "../types/product";



type ImageDraft = {

  uri: string;

  isRemote: boolean;

};



type FormStepId = "basics" | "category" | "audience" | "productType" | "inventory";



function buildFormSteps(mainCategory: ShopMainCategoryCode | null): FormStepId[] {

  const steps: FormStepId[] = ["basics", "category"];

  if (categoryRequiresAudience(mainCategory)) {

    steps.push("audience");

  }

  steps.push("productType", "inventory");

  return steps;

}



function stepToCategorySection(step: FormStepId): ProductCategorySection | null {

  if (step === "category") {

    return "main";

  }

  if (step === "audience") {

    return "audience";

  }

  if (step === "productType") {

    return "type";

  }

  return null;

}



function SimpleStockStepper({

  stockText,

  onChangeStockText,

}: {

  stockText: string;

  onChangeStockText: (next: string) => void;

}) {

  const stockNum = Math.max(0, parseInt(stockText, 10) || 0);

  return (

    <View style={styles.simpleStockBlock}>

      <Text style={styles.stepSectionTitle}>Voorraad</Text>

      <View style={styles.simpleStockStepper}>

        <Pressable

          style={[styles.simpleStockBtn, stockNum <= 0 && styles.simpleStockBtnDisabled]}

          onPress={() => onChangeStockText(String(Math.max(0, stockNum - 1)))}

          disabled={stockNum <= 0}

        >

          <Ionicons name="remove" size={26} color={theme.text} />

        </Pressable>

        <TextInput

          style={styles.simpleStockInput}

          value={stockText}

          onChangeText={(t) => {

            const parsed = parseInt(t.replace(/\D/g, ""), 10);

            onChangeStockText(t.trim() === "" ? "0" : String(Math.max(0, parsed || 0)));

          }}

          keyboardType="number-pad"

          selectTextOnFocus

        />

        <Pressable

          style={styles.simpleStockBtn}

          onPress={() => onChangeStockText(String(stockNum + 1))}

        >

          <Ionicons name="add" size={26} color={theme.text} />

        </Pressable>

      </View>

      <Text style={styles.simpleStockHint}>Totaal op voorraad: {stockNum}</Text>

    </View>

  );

}



export function ProductFormScreen() {

  const navigation = useNavigation<any>();

  const route = useRoute<any>();

  const insets = useSafeAreaInsets();

  const { user } = useAuth();

  const productId: string | undefined = route.params?.productId;

  const openStockAdd: boolean = route.params?.openStockAdd === true;

  const isEdit = !!productId;



  const [loading, setLoading] = useState(isEdit);

  const [saving, setSaving] = useState(false);

  const [wizardIndex, setWizardIndex] = useState(0);

  const [name, setName] = useState("");

  const [description, setDescription] = useState("");

  const [priceText, setPriceText] = useState("");

  const [mainCategory, setMainCategory] = useState<ShopMainCategoryCode | null>(null);

  const [audience, setAudience] = useState<ShopAudienceCode | null>(null);

  const [subcategory, setSubcategory] = useState<string | null>(null);

  const [tagsDraft, setTagsDraft] = useState("");

  const [brand, setBrand] = useState("");

  const [stockText, setStockText] = useState("0");

  const [liveStock, setLiveStock] = useState(0);

  const [stockChangePending, setStockChangePending] = useState(false);

  const [sizeVariantMode, setSizeVariantMode] = useState<"unset" | "yes" | "no">("unset");

  const [variantStockMap, setVariantStockMap] = useState<VariantStockMap>({});

  const [usesVariants, setUsesVariants] = useState(false);

  const [variantsReady, setVariantsReady] = useState(false);

  const [loadedProduct, setLoadedProduct] = useState<Product | null>(null);

  const [isActive, setIsActive] = useState(false);

  const [images, setImages] = useState<ImageDraft[]>([]);

  const [payoutReady, setPayoutReady] = useState(false);



  const formSteps = useMemo(() => buildFormSteps(mainCategory), [mainCategory]);

  const currentStep = formSteps[wizardIndex] ?? formSteps[0]!;

  const progressLabel = !isEdit

    ? `Stap ${wizardIndex + 1} van ${formSteps.length}`

    : null;



  const sizeMode = useMemo(

    () => getSizeMode(mainCategory, subcategory),

    [mainCategory, subcategory]

  );



  const categoryReadyForSizes = useMemo(

    () => isCategoryReadyForSizeQuestion(mainCategory, audience, subcategory),

    [audience, mainCategory, subcategory]

  );



  const useVariantStockFlow = useMemo(

    () =>

      (sizeModeRequiresVariants(sizeMode) || sizeVariantMode === "yes") &&

      categoryReadyForSizes,

    [categoryReadyForSizes, sizeMode, sizeVariantMode]

  );



  const showOptionalSizeQuestion = useMemo(

    () =>

      !isEdit &&

      categoryReadyForSizes &&

      sizeMode === "optional_sizes" &&

      sizeVariantMode === "unset",

    [categoryReadyForSizes, isEdit, sizeMode, sizeVariantMode]

  );



  const showVariantSizeEditor = useMemo(

    () =>

      !isEdit &&

      categoryReadyForSizes &&

      (sizeModeRequiresVariants(sizeMode) || sizeVariantMode === "yes"),

    [categoryReadyForSizes, isEdit, sizeMode, sizeVariantMode]

  );



  const showSimpleStockInput = useMemo(() => {

    if (isEdit) {

      return false;

    }

    if (!categoryReadyForSizes) {

      return false;

    }

    if (useVariantStockFlow) {

      return false;

    }

    if (sizeMode === "optional_sizes" && sizeVariantMode === "unset") {

      return false;

    }

    return true;

  }, [categoryReadyForSizes, isEdit, sizeMode, sizeVariantMode, useVariantStockFlow]);



  const publishDraft = useMemo(

    () => ({

      name,

      imageCount: images.length,

      priceValid: parsePriceInput(priceText) !== null,

      mainCategory,

      audience,

      subcategory,

      stockText,

      sizeVariantMode: sizeModeRequiresVariants(sizeMode) ? ("yes" as const) : sizeVariantMode,

      variantStockMap,

      payoutReady,

    }),

    [

      audience,

      images.length,

      mainCategory,

      name,

      payoutReady,

      priceText,

      sizeMode,

      sizeVariantMode,

      stockText,

      subcategory,

      variantStockMap,

    ]

  );



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

                onPress: () => navigation.replace("SellerOnboarding"),

              },

              { text: "Terug", style: "cancel", onPress: () => navigation.goBack() },

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

        setMainCategory(

          (product.mainCategory as ShopMainCategoryCode | null) ??

            resolveMainCategoryFromLegacyCategory(product.category)

        );

        setAudience((product.audience as ShopAudienceCode | null) ?? null);

        setSubcategory(product.subcategory ?? null);

        setTagsDraft(product.tags.map((tag) => `#${tag}`).join(" "));

        setBrand(product.brand ?? "");

        setStockText(String(product.stock));

        setLiveStock(product.stock);

        setUsesVariants(product.usesVariants);

        setVariantsReady(product.variantsReady);

        setLoadedProduct(product);

        if (product.usesVariants && product.variantsReady) {

          setSizeVariantMode("yes");

        } else {

          setSizeVariantMode("no");

        }

        setIsActive(ready ? product.isActive : false);

        setImages(product.images.map((uri) => ({ uri, isRemote: true })));

      } catch (e) {

        const msg = e instanceof Error ? e.message : "Laden mislukt.";

        Alert.alert("Fout", msg);

        navigation.goBack();

      } finally {

        setLoading(false);

      }

    })();

  }, [navigation, productId]);



  useEffect(() => {

    if (isEdit) {

      return;

    }

    setSizeVariantMode("unset");

    setVariantStockMap({});

  }, [audience, isEdit, mainCategory, subcategory]);



  useEffect(() => {

    if (isEdit || !categoryReadyForSizes) {

      return;

    }

    if (sizeModeRequiresVariants(sizeMode)) {

      setSizeVariantMode("yes");

    } else if (sizeMode === "no_sizes") {

      setSizeVariantMode("no");

    }

  }, [categoryReadyForSizes, isEdit, sizeMode]);



  useEffect(() => {

    if (isEdit) {

      return;

    }

    if (wizardIndex >= formSteps.length) {

      setWizardIndex(Math.max(0, formSteps.length - 1));

    }

  }, [formSteps.length, isEdit, wizardIndex]);



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



  const validateWizardStep = useCallback((): string | null => {

    if (currentStep === "basics") {

      if (name.trim().length < 2) {

        return "Vul een productnaam in.";

      }

      if (parsePriceInput(priceText) === null) {

        return "Vul een geldige prijs in.";

      }

      return null;

    }

    if (currentStep === "category") {

      if (!mainCategory) {

        return "Kies eerst een categorie.";

      }

      return null;

    }

    if (currentStep === "audience") {

      if (!audience) {

        return "Kies voor wie dit product is.";

      }

      return null;

    }

    if (currentStep === "productType") {

      if (!subcategory) {

        return "Kies welk product je verkoopt.";

      }

      return null;

    }

    return null;

  }, [audience, currentStep, mainCategory, name, priceText, subcategory]);



  const canWizardAdvance = useMemo(() => validateWizardStep() === null, [
    validateWizardStep,
  ]);



  const onWizardNext = useCallback(() => {

    const err = validateWizardStep();

    if (err) {

      Alert.alert("Nog niet compleet", err);

      return;

    }

    if (wizardIndex < formSteps.length - 1) {

      setWizardIndex((i) => i + 1);

    }

  }, [formSteps.length, validateWizardStep, wizardIndex]);



  const onWizardBack = useCallback(() => {

    if (wizardIndex > 0) {

      setWizardIndex((i) => i - 1);

    } else {

      navigation.goBack();

    }

  }, [navigation, wizardIndex]);



  const onToggleActive = useCallback(

    (next: boolean) => {

      if (next && !payoutReady) {

        Alert.alert(

          "Stripe nog niet klaar",

          "Je kunt concepten opslaan, maar pas publiceren zodra uitbetalingen volledig zijn ingesteld."

        );

        return;

      }

      if (next) {

        const blockers = getProductPublishBlockers(publishDraft);

        if (blockers.length > 0) {

          Alert.alert(

            "Nog niet klaar voor live",

            blockers.map((b) => `• ${b}`).join("\n")

          );

          return;

        }

      }

      setIsActive(next);

    },

    [payoutReady, publishDraft]

  );



  const onSave = useCallback(async () => {

    if (!user?.id) {

      Alert.alert("Niet ingelogd", "Log in om producten te beheren.");

      return;

    }

    if (isEdit && stockChangePending) {

      Alert.alert(

        "Voorraad nog niet opgeslagen",

        "Bevestig je voorraadwijziging in de voorraadsectie met ‘Bevestigen’, of sluit het venster met ‘Annuleren’."

      );

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



    if (isActive) {

      const blockers = getProductPublishBlockers(publishDraft);

      if (blockers.length > 0) {

        Alert.alert(

          "Nog niet klaar voor live",

          blockers.map((b) => `• ${b}`).join("\n")

        );

        return;

      }

    }



    const stockParsed = parseInt(stockText.replace(/\D/g, ""), 10);

    const initialStock = Number.isFinite(stockParsed) ? Math.max(0, stockParsed) : 0;

    const sizes = useVariantStockFlow ? Object.keys(variantStockMap) : [];



    if (!isEdit && showOptionalSizeQuestion) {

      Alert.alert(

        "Maatkeuze",

        "Geef aan of dit product verschillende maten heeft."

      );

      return;

    }



    if (!isEdit && useVariantStockFlow) {

      const keys = Object.keys(variantStockMap);

      if (keys.length === 0) {

        Alert.alert("Maten ontbreken", "Kies minimaal één maat.");

        return;

      }

      if (isActive && variantMapToInputs(variantStockMap).reduce((s, i) => s + i.stock, 0) <= 0) {

        Alert.alert("Voorraad ontbreekt", "Stel voorraad in voor minimaal één maat.");

        return;

      }

    }



    const categoryPayload = buildCategoryPayload(mainCategory, audience, subcategory);

    const tags = parseHashtagInput(tagsDraft);



    setSaving(true);

    try {

      const targetId = productId ?? createUuidV4();

      const localUris = images.map((img) => img.uri);

      const uploadedUrls = await uploadProductImages(user.id, targetId, localUris);



      const detailsPayload = {

        name: trimmedName,

        description: description.trim() || null,

        price,

        category: categoryPayload.category,

        mainCategory: categoryPayload.mainCategory,

        audience: categoryPayload.audience,

        subcategory: categoryPayload.subcategory,

        brand: brand.trim() || null,

        tags,

        images: uploadedUrls,

        sizes,

        isActive: payoutReady ? isActive : false,

      };



      let savedProductId = productId ?? targetId;



      if (isEdit && productId) {

        await updateProductDetails(productId, detailsPayload);

      } else if (!isEdit && useVariantStockFlow) {

        await createProduct({ ...detailsPayload, stock: 0 }, targetId);

        await setupNewProductWithVariants(targetId, variantMapToInputs(variantStockMap));

        savedProductId = targetId;

      } else {

        const created = await createProduct(

          { ...detailsPayload, stock: initialStock },

          targetId

        );

        savedProductId = created.id;

      }



      const savedProduct = await fetchProductById(savedProductId);

      if (savedProduct) {

        emitProductCatalogEvent(

          isEdit

            ? { kind: "updated", product: savedProduct }

            : { kind: "created", product: savedProduct }

        );

      } else {

        emitProductCatalogEvent({ kind: "refresh" });

      }



      const isConcept = savedProduct ? !savedProduct.isActive : !detailsPayload.isActive;

      Alert.alert(

        isEdit ? "Product opgeslagen" : "Product toegevoegd",

        isEdit

          ? "Je wijzigingen zijn opgeslagen."

          : isConcept

            ? "Je product staat klaar als concept."

            : "Je product staat nu in je winkel.",

        [{ text: "OK", onPress: () => navigation.goBack() }]

      );

    } catch (e) {

      if (__DEV__) {

        console.warn("[ProductForm] save failed", e);

      }

      Alert.alert("Fout", formatProductDetailsSaveError(e));

    } finally {

      setSaving(false);

    }

  }, [

    audience,

    brand,

    description,

    images,

    isActive,

    isEdit,

    mainCategory,

    name,

    navigation,

    payoutReady,

    priceText,

    productId,

    publishDraft,

    showOptionalSizeQuestion,

    stockChangePending,

    stockText,

    subcategory,

    tagsDraft,

    useVariantStockFlow,

    user?.id,

    variantStockMap,

  ]);



  const renderBasics = () => (

    <>

      <Text style={styles.stepSectionTitle}>Productfoto's</Text>

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



      <Text style={styles.label}>Productnaam *</Text>

      <TextInput

        style={styles.input}

        value={name}

        onChangeText={setName}

        placeholder="Productnaam"

        placeholderTextColor={theme.textMuted}

        maxLength={120}

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

      </View>



      <Text style={styles.label}>Merk (optioneel)</Text>

      <TextInput

        style={styles.input}

        value={brand}

        onChangeText={setBrand}

        placeholder="Merknaam"

        placeholderTextColor={theme.textMuted}

        maxLength={80}

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

    </>

  );



  const renderInventory = () => {

    if (!categoryReadyForSizes) {

      return (

        <Text style={styles.blockedHint}>

          Kies eerst categorie{categoryRequiresAudience(mainCategory) ? ", doelgroep" : ""} en

          producttype voordat je voorraad kunt instellen.

        </Text>

      );

    }



    return (

      <>

        {showOptionalSizeQuestion ? (

          <View style={styles.variantQuestionCard}>

            <Text style={styles.variantQuestionTitle}>

              Heeft dit product verschillende maten?

            </Text>

            <ChoiceCardGrid>
              <ChoiceCard
                label="Ja, meerdere maten"
                selected={sizeVariantMode === "yes"}
                onPress={() => setSizeVariantMode("yes")}
              />
              <ChoiceCard
                label="Nee, één voorraad"
                selected={sizeVariantMode === "no"}
                onPress={() => setSizeVariantMode("no")}
              />
            </ChoiceCardGrid>

          </View>

        ) : null}



        {showVariantSizeEditor ? (

          <ProductVariantSizeEditor

            mainCategory={mainCategory}

            audience={audience}

            subcategory={subcategory}

            value={variantStockMap}

            onChange={setVariantStockMap}

          />

        ) : null}



        {showSimpleStockInput ? (

          <SimpleStockStepper stockText={stockText} onChangeStockText={setStockText} />

        ) : null}



        <Text style={styles.label}>Tags (optioneel)</Text>

        <TextInput

          style={styles.input}

          value={tagsDraft}

          onChangeText={setTagsDraft}

          placeholder="#summer #beach #casual"

          placeholderTextColor={theme.textMuted}

          autoCapitalize="none"

          autoCorrect={false}

        />



        <View style={styles.switchRow}>

          <View style={styles.switchTextWrap}>

            <Text style={styles.switchLabel}>Live zetten</Text>

            <Text style={styles.switchHint}>

              {payoutReady

                ? "Concepten blijven privé. Live producten zijn zichtbaar in je winkel."

                : "Rond Stripe-uitbetalingen af om producten publiek te activeren."}

            </Text>

          </View>

          <Switch

            value={isActive}

            onValueChange={onToggleActive}

            disabled={!payoutReady}

            trackColor={{ false: theme.border, true: theme.accentSoft }}

            thumbColor={isActive ? theme.accent : theme.textMuted}

          />

        </View>



        {isActive ? (

          <View style={styles.checklistCard}>

            <Text style={styles.checklistTitle}>Checklist live product</Text>

            {getProductPublishBlockers(publishDraft).length === 0 ? (

              <Text style={styles.checklistOk}>Alles is ingevuld — je kunt live zetten.</Text>

            ) : (

              getProductPublishBlockers(publishDraft).map((item) => (

                <Text key={item} style={styles.checklistItem}>

                  • {item}

                </Text>

              ))

            )}

          </View>

        ) : null}

      </>

    );

  };



  const renderWizardStep = () => {

    const categorySection = stepToCategorySection(currentStep);

    if (currentStep === "basics") {

      return renderBasics();

    }

    if (categorySection) {

      return (

        <ProductCategoryPicker

          mainCategory={mainCategory}

          audience={audience}

          subcategory={subcategory}

          onMainCategoryChange={setMainCategory}

          onAudienceChange={setAudience}

          onSubcategoryChange={setSubcategory}

          section={categorySection}

        />

      );

    }

    if (currentStep === "inventory") {

      return renderInventory();

    }

    return null;

  };



  const renderEditForm = () => (

    <>

      {renderBasics()}

      <Text style={styles.label}>Categorie</Text>

      <ProductCategoryPicker

        mainCategory={mainCategory}

        audience={audience}

        subcategory={subcategory}

        onMainCategoryChange={setMainCategory}

        onAudienceChange={setAudience}

        onSubcategoryChange={setSubcategory}

      />

      {!categoryReadyForSizes ? null : showOptionalSizeQuestion ? (

        <View style={styles.variantQuestionCard}>

          <Text style={styles.variantQuestionTitle}>

            Heeft dit product verschillende maten?

          </Text>

          <ChoiceCardGrid>
            <ChoiceCard
              label="Ja, meerdere maten"
              selected={sizeVariantMode === "yes"}
              onPress={() => setSizeVariantMode("yes")}
            />
            <ChoiceCard
              label="Nee, één voorraad"
              selected={sizeVariantMode === "no"}
              onPress={() => setSizeVariantMode("no")}
            />
          </ChoiceCardGrid>

        </View>

      ) : null}

      {isEdit && loadedProduct?.variantsReady ? (

        <ProductVariantStockSection

          product={loadedProduct}

          onProductStockChanged={setLiveStock}

          onPendingChange={setStockChangePending}

        />

      ) : isEdit && loadedProduct ? (

        <>

          <ProductVariantStockSection

            product={loadedProduct}

            onProductStockChanged={setLiveStock}

            onPendingChange={setStockChangePending}

          />

          {!loadedProduct.usesVariants ? (

            <ProductStockSection

              productId={productId!}

              stock={liveStock}

              onStockChanged={setLiveStock}

              onPendingChange={setStockChangePending}

              openAddOnMount={openStockAdd}

            />

          ) : null}

        </>

      ) : null}

      <Text style={styles.label}>Tags</Text>

      <TextInput

        style={styles.input}

        value={tagsDraft}

        onChangeText={setTagsDraft}

        placeholder="#summer #beach"

        placeholderTextColor={theme.textMuted}

        autoCapitalize="none"

      />

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

          onValueChange={onToggleActive}

          disabled={!payoutReady}

          trackColor={{ false: theme.border, true: theme.accentSoft }}

          thumbColor={isActive ? theme.accent : theme.textMuted}

        />

      </View>

    </>

  );



  const isLastWizardStep = !isEdit && wizardIndex >= formSteps.length - 1;



  return (

    <View style={[styles.root, { paddingTop: insets.top }]}>

      <View style={styles.topBar}>

        <Pressable

          onPress={isEdit ? () => navigation.goBack() : onWizardBack}

          style={styles.backBtn}

          hitSlop={10}

          accessibilityRole="button"

          accessibilityLabel="Terug"

        >

          <Ionicons name={isEdit ? "close" : "arrow-back"} size={26} color={theme.text} />

        </Pressable>

        <View style={styles.titleWrap}>

          <Text style={styles.screenTitle}>

            {isEdit ? "Product bewerken" : "Product toevoegen"}

          </Text>

          {progressLabel ? (

            <Text style={styles.progressLabel}>{progressLabel}</Text>

          ) : null}

        </View>

        <Pressable

          onPress={() => void onSave()}

          disabled={!canSave || saving}

          style={[styles.saveBtn, (!canSave || saving) && styles.saveBtnDisabled]}

          hitSlop={10}

          accessibilityRole="button"

          accessibilityLabel="Opslaan"

        >

          {saving ? (

            <ActivityIndicator size="small" color={theme.accent} />

          ) : (

            <Text

              style={[

                styles.saveBtnText,

                (!canSave || saving) && styles.saveBtnTextDisabled,

              ]}

            >

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

        <>

          <ScrollView

            contentContainerStyle={[

              styles.form,

              { paddingBottom: insets.bottom + 100 },

            ]}

            keyboardShouldPersistTaps="handled"

            showsVerticalScrollIndicator={false}

          >

            {isEdit ? renderEditForm() : renderWizardStep()}

          </ScrollView>



          {!isEdit ? (

            <View

              style={[

                styles.footerBar,

                { paddingBottom: insets.bottom + 12 },

              ]}

            >

              {isLastWizardStep ? (

                <Pressable

                  style={[styles.footerPrimaryBtn, saving && styles.footerBtnDisabled]}

                  onPress={() => void onSave()}

                  disabled={saving || !canSave}

                >

                  {saving ? (

                    <ActivityIndicator color={theme.bg} />

                  ) : (

                    <Text style={styles.footerPrimaryText}>Product opslaan</Text>

                  )}

                </Pressable>

              ) : (

                <Pressable
                  style={[
                    styles.footerPrimaryBtn,
                    !canWizardAdvance && styles.footerBtnDisabled,
                  ]}
                  onPress={onWizardNext}
                  disabled={!canWizardAdvance}
                >

                  <Text style={styles.footerPrimaryText}>Volgende</Text>

                  <Ionicons name="arrow-forward" size={20} color={theme.bg} />

                </Pressable>

              )}

            </View>

          ) : null}

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

    marginBottom: 4,

  },

  backBtn: {

    width: 44,

    height: 44,

    alignItems: "center",

    justifyContent: "center",

  },

  titleWrap: {

    flex: 1,

    alignItems: "center",

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

    color: theme.text,

    fontSize: 17,

    fontWeight: "700",

    textAlign: "center",

  },

  progressLabel: {

    color: theme.textMuted,

    fontSize: 12,

    fontWeight: "600",

    marginTop: 2,

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

  stepSectionTitle: {

    color: theme.text,

    fontSize: 20,

    fontWeight: "800",

    marginBottom: 12,

    marginTop: 4,

  },

  label: {

    color: theme.textMuted,

    fontSize: 13,

    fontWeight: "600",

    marginBottom: 6,

    marginTop: 12,

  },

  blockedHint: {

    color: theme.textMuted,

    fontSize: 15,

    lineHeight: 22,

    paddingVertical: 12,

  },

  variantQuestionCard: {

    gap: 12,

    padding: 18,

    borderRadius: 18,

    backgroundColor: theme.bgElevated,

    borderWidth: StyleSheet.hairlineWidth,

    borderColor: theme.border,

    marginTop: 8,

  },

  variantQuestionTitle: {

    color: theme.text,

    fontWeight: "800",

    fontSize: 17,

    lineHeight: 24,

  },

  variantChoiceRow: {

    gap: 10,

  },

  variantChoiceBtn: {

    paddingVertical: 16,

    paddingHorizontal: 14,

    borderRadius: 14,

    borderWidth: StyleSheet.hairlineWidth,

    borderColor: theme.border,

    backgroundColor: "rgba(255,255,255,0.04)",

    alignItems: "center",

  },

  variantChoiceBtnPrimary: {

    backgroundColor: theme.accentSoft,

    borderColor: theme.accentBorderMuted,

  },

  variantChoiceText: {

    color: theme.textMuted,

    fontWeight: "700",

    fontSize: 15,

    textAlign: "center",

  },

  variantChoiceTextSelected: {

    color: theme.accent,

    fontWeight: "800",

    fontSize: 15,

    textAlign: "center",

  },

  simpleStockBlock: {

    gap: 10,

    marginTop: 4,

  },

  simpleStockStepper: {

    flexDirection: "row",

    alignItems: "center",

    justifyContent: "center",

    gap: 20,

    paddingVertical: 8,

  },

  simpleStockBtn: {

    width: 52,

    height: 52,

    borderRadius: 14,

    alignItems: "center",

    justifyContent: "center",

    backgroundColor: theme.bgElevated,

    borderWidth: StyleSheet.hairlineWidth,

    borderColor: theme.border,

  },

  simpleStockBtnDisabled: {

    opacity: 0.35,

  },

  simpleStockInput: {

    minWidth: 64,

    height: 52,

    borderRadius: 14,

    borderWidth: StyleSheet.hairlineWidth,

    borderColor: theme.border,

    backgroundColor: theme.bgElevated,

    color: theme.text,

    fontSize: 22,

    fontWeight: "900",

    textAlign: "center",

  },

  simpleStockHint: {

    color: theme.textMuted,

    fontSize: 13,

    fontWeight: "600",

    textAlign: "center",

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

  imageRow: {

    gap: 10,

    paddingVertical: 4,

    marginBottom: 8,

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

  checklistCard: {

    marginTop: 12,

    padding: 14,

    borderRadius: 14,

    backgroundColor: theme.bgElevated,

    borderWidth: StyleSheet.hairlineWidth,

    borderColor: theme.border,

    gap: 6,

  },

  checklistTitle: {

    color: theme.text,

    fontWeight: "800",

    fontSize: 14,

  },

  checklistOk: {

    color: theme.accent,

    fontSize: 13,

    lineHeight: 19,

  },

  checklistItem: {

    color: theme.textMuted,

    fontSize: 13,

    lineHeight: 19,

  },

  footerBar: {

    position: "absolute",

    left: 0,

    right: 0,

    bottom: 0,

    paddingHorizontal: 16,

    paddingTop: 12,

    backgroundColor: theme.bg,

    borderTopWidth: StyleSheet.hairlineWidth,

    borderTopColor: theme.border,

  },

  footerPrimaryBtn: {

    flexDirection: "row",

    alignItems: "center",

    justifyContent: "center",

    gap: 8,

    backgroundColor: theme.accent,

    borderRadius: 16,

    paddingVertical: 16,

    minHeight: 56,

  },

  footerBtnDisabled: {

    opacity: 0.6,

  },

  footerPrimaryText: {

    color: theme.bg,

    fontSize: 17,

    fontWeight: "800",

  },

});


