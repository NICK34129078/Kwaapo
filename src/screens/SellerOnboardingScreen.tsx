import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../constants/theme";
import {
  fetchMySellerOnboarding,
  hasCompletedStripePayoutSetup,
  markMyStripePayoutSetupPrepared,
  markSellerPendingReview,
  resolveSellerOnboardingStep,
  updateMyBusinessInfo,
} from "../services/sellerOnboardingService";
import type { BusinessInfoPayload, SellerOnboarding, SellerType } from "../types/sellerOnboarding";

const FLOW_STEPS = [
  "Business account",
  "Verkoopaccount",
  "KVK & gegevens",
  "Uitbetalingen",
  "In controle",
  "Verkoop actief",
] as const;

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  required,
  keyboardType,
  autoCapitalize = "sentences",
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  required?: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad" | "number-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  editable?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required ? " *" : ""}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        style={[styles.input, !editable && styles.inputDisabled]}
        editable={editable}
      />
    </View>
  );
}

export function SellerOnboardingScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [onboarding, setOnboarding] = useState<SellerOnboarding | null>(null);

  const [sellerType, setSellerType] = useState<SellerType>("business");
  const [businessName, setBusinessName] = useState("");
  const [kvkNumber, setKvkNumber] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessCountry, setBusinessCountry] = useState("Nederland");
  const [businessCity, setBusinessCity] = useState("");
  const [businessPostalCode, setBusinessPostalCode] = useState("");
  const [businessStreet, setBusinessStreet] = useState("");
  const [businessHouseNumber, setBusinessHouseNumber] = useState("");

  const load = useCallback(async () => {
    const row = await fetchMySellerOnboarding();
    setOnboarding(row);
    if (row) {
      setSellerType(row.sellerType ?? "business");
      setBusinessName(row.businessName ?? row.displayName ?? "");
      setKvkNumber(row.kvkNumber ?? "");
      setVatNumber(row.vatNumber ?? "");
      setBusinessEmail(row.businessEmail ?? "");
      setBusinessPhone(row.businessPhone ?? "");
      setBusinessCountry(row.businessCountry ?? "Nederland");
      setBusinessCity(row.businessCity ?? "");
      setBusinessPostalCode(row.businessPostalCode ?? "");
      setBusinessStreet(row.businessStreet ?? "");
      setBusinessHouseNumber(row.businessHouseNumber ?? "");
      if (row.status !== "pending_review" && row.status !== "verified") {
        setStep(resolveSellerOnboardingStep(row));
      }
    }
  }, []);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  const buildPayload = useCallback((): BusinessInfoPayload => {
    return {
      sellerType,
      businessName,
      kvkNumber: sellerType === "business" ? kvkNumber : null,
      vatNumber,
      businessEmail,
      businessPhone,
      businessCountry,
      businessCity,
      businessPostalCode,
      businessStreet,
      businessHouseNumber,
    };
  }, [
    businessCity,
    businessCountry,
    businessEmail,
    businessHouseNumber,
    businessName,
    businessPhone,
    businessPostalCode,
    businessStreet,
    kvkNumber,
    sellerType,
    vatNumber,
  ]);

  const summaryAddress = useMemo(() => {
    const parts = [
      [businessStreet, businessHouseNumber].filter(Boolean).join(" ").trim(),
      [businessPostalCode, businessCity].filter(Boolean).join(" ").trim(),
      businessCountry.trim(),
    ].filter((part) => part.length > 0);
    return parts.join(", ");
  }, [
    businessCity,
    businessCountry,
    businessHouseNumber,
    businessPostalCode,
    businessStreet,
  ]);

  const onContinueToStripe = useCallback(async () => {
    setSubmitting(true);
    try {
      const updated = await updateMyBusinessInfo(buildPayload());
      setOnboarding(updated);
      setStep(2);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Opslaan mislukt.";
      Alert.alert("Fout", msg);
    } finally {
      setSubmitting(false);
    }
  }, [buildPayload]);

  const onStripeSetupPrepared = useCallback(async () => {
    setSubmitting(true);
    try {
      const updated = await markMyStripePayoutSetupPrepared();
      setOnboarding(updated);
      setStep(3);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Opslaan mislukt.";
      Alert.alert("Fout", msg);
    } finally {
      setSubmitting(false);
    }
  }, []);

  const onSubmitForReview = useCallback(async () => {
    setSubmitting(true);
    try {
      await updateMyBusinessInfo(buildPayload());
      const updated = await markSellerPendingReview();
      setOnboarding(updated);
      Alert.alert(
        "Ingediend",
        "Je gegevens worden gecontroleerd. Pas na goedkeuring kun je producten toevoegen en verkopen.",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Indienen mislukt.";
      Alert.alert("Fout", msg);
    } finally {
      setSubmitting(false);
    }
  }, [buildPayload, navigation]);

  const isPending = onboarding?.status === "pending_review";
  const isVerified = onboarding?.status === "verified";
  const isReadOnly = isPending || isVerified;
  const stripeDone = hasCompletedStripePayoutSetup(onboarding);

  const stepTitle =
    step === 1
      ? "Bedrijfsgegevens"
      : step === 2
        ? "Uitbetalingen instellen"
        : "Controle & indienen";

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
        <Text style={styles.screenTitle}>Verkoopaccount</Text>
        <View style={styles.topBarSide} />
      </View>

      <View style={styles.funnelRow}>
        {FLOW_STEPS.map((label, index) => {
          const active =
            (index <= 1 && !isPending && !isVerified) ||
            (index === 2 && step >= 1) ||
            (index === 3 && (stripeDone || step >= 2)) ||
            (index === 4 && isPending) ||
            (index === 5 && isVerified);
          return (
            <Text
              key={label}
              style={[styles.funnelChip, active && styles.funnelChipActive]}
              numberOfLines={1}
            >
              {label}
            </Text>
          );
        })}
      </View>

      <View style={styles.stepRow}>
        <View style={[styles.stepDot, step >= 1 && styles.stepDotActive]} />
        <View style={[styles.stepLine, step >= 2 && styles.stepLineActive]} />
        <View style={[styles.stepDot, step >= 2 && styles.stepDotActive]} />
        <View style={[styles.stepLine, step >= 3 && styles.stepLineActive]} />
        <View style={[styles.stepDot, step >= 3 && styles.stepDotActive]} />
      </View>
      <Text style={styles.stepLabel}>Stap {step} van 3 — {stepTitle}</Text>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="small" color={theme.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {isPending ? (
            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>In controle</Text>
              <Text style={styles.infoText}>
                We controleren je KVK- en bedrijfsgegevens. Tot de goedkeuring kun
                je geen producten toevoegen of verkopen.
              </Text>
            </View>
          ) : null}

          {isVerified ? (
            <View style={[styles.infoBox, styles.infoBoxSuccess]}>
              <Text style={styles.infoTitle}>Klaar om te verkopen</Text>
              <Text style={styles.infoText}>
                Je verkoopaccount is goedgekeurd. Je kunt nu producten toevoegen en
                officiële verkopen ontvangen.
              </Text>
            </View>
          ) : null}

          {step === 1 && !isReadOnly ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>KVK & bedrijfsgegevens</Text>
              <Text style={styles.helperBlock}>
                Vul je officiële bedrijfsgegevens in. Deze zijn nodig voordat je
                kunt verkopen en uitbetalingen ontvangt.
              </Text>
              <View style={styles.typeRow}>
                <Pressable
                  style={[
                    styles.typeChip,
                    sellerType === "business" && styles.typeChipSelected,
                  ]}
                  onPress={() => setSellerType("business")}
                  accessibilityRole="button"
                  accessibilityLabel="Bedrijf"
                >
                  <Ionicons
                    name="business-outline"
                    size={22}
                    color={sellerType === "business" ? theme.accent : theme.textMuted}
                  />
                  <Text
                    style={[
                      styles.typeChipText,
                      sellerType === "business" && styles.typeChipTextSelected,
                    ]}
                  >
                    Bedrijf
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.typeChip,
                    sellerType === "individual" && styles.typeChipSelected,
                  ]}
                  onPress={() => setSellerType("individual")}
                  accessibilityRole="button"
                  accessibilityLabel="Persoonlijk"
                >
                  <Ionicons
                    name="person-outline"
                    size={22}
                    color={sellerType === "individual" ? theme.accent : theme.textMuted}
                  />
                  <Text
                    style={[
                      styles.typeChipText,
                      sellerType === "individual" && styles.typeChipTextSelected,
                    ]}
                  >
                    Persoonlijk
                  </Text>
                </Pressable>
              </View>

              <FormField
                label={sellerType === "business" ? "Bedrijfsnaam" : "Naam / handelsnaam"}
                value={businessName}
                onChangeText={setBusinessName}
                placeholder="Bijv. Lumen Fashion B.V."
                required
                autoCapitalize="words"
              />
              {sellerType === "business" ? (
                <>
                  <FormField
                    label="KVK-nummer"
                    value={kvkNumber}
                    onChangeText={setKvkNumber}
                    placeholder="12345678"
                    required
                    keyboardType="number-pad"
                    autoCapitalize="none"
                  />
                  <Text style={styles.fieldHint}>
                    We controleren je KVK-nummer bij opslaan tegen het
                    Handelsregister.
                  </Text>
                  <FormField
                    label="BTW-nummer"
                    value={vatNumber}
                    onChangeText={setVatNumber}
                    placeholder="Optioneel"
                    autoCapitalize="characters"
                  />
                </>
              ) : null}
              <FormField
                label="Zakelijk e-mailadres"
                value={businessEmail}
                onChangeText={setBusinessEmail}
                placeholder="naam@bedrijf.nl"
                required
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <FormField
                label="Telefoon"
                value={businessPhone}
                onChangeText={setBusinessPhone}
                placeholder="Optioneel"
                keyboardType="phone-pad"
              />
              <Text style={styles.subsectionTitle}>Bedrijfsadres</Text>
              <FormField label="Land" value={businessCountry} onChangeText={setBusinessCountry} required />
              <FormField label="Stad" value={businessCity} onChangeText={setBusinessCity} required />
              <FormField
                label="Postcode"
                value={businessPostalCode}
                onChangeText={setBusinessPostalCode}
                required
                autoCapitalize="characters"
              />
              <FormField label="Straat" value={businessStreet} onChangeText={setBusinessStreet} required />
              <FormField
                label="Huisnummer"
                value={businessHouseNumber}
                onChangeText={setBusinessHouseNumber}
                required
              />
            </View>
          ) : null}

          {step === 2 && !isReadOnly ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Uitbetalingen via Stripe</Text>
              <Text style={styles.helperBlock}>
                Stripe regelt veilige uitbetalingen naar je zakelijke rekening. In
                testmodus bereiden we deze stap vooraf voor — de echte Stripe-koppeling
                volgt in een latere versie.
              </Text>
              <View style={styles.stripeCard}>
                <Ionicons name="card-outline" size={32} color={theme.accent} />
                <Text style={styles.stripeCardTitle}>Uitbetalingen nog niet actief</Text>
                <Text style={styles.stripeCardText}>
                  Na goedkeuring van je gegevens koppelen we je account aan Stripe
                  voor echte uitbetalingen.
                </Text>
              </View>
              {stripeDone ? (
                <View style={styles.doneRow}>
                  <Ionicons name="checkmark-circle" size={20} color={theme.accent} />
                  <Text style={styles.doneText}>Stap voorbereid</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {step === 3 && !isReadOnly ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Controle</Text>
              <Text style={styles.reviewHint}>
                Controleer alles en dien in. Daarna staat je status op{" "}
                <Text style={styles.reviewHintAccent}>In controle</Text>.
              </Text>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Type</Text>
                <Text style={styles.reviewValue}>
                  {sellerType === "business" ? "Bedrijf" : "Persoonlijk"}
                </Text>
              </View>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Naam</Text>
                <Text style={styles.reviewValue}>{businessName || "—"}</Text>
              </View>
              {sellerType === "business" ? (
                <View style={styles.reviewRow}>
                  <Text style={styles.reviewLabel}>KVK</Text>
                  <Text style={styles.reviewValue}>{kvkNumber || "—"}</Text>
                </View>
              ) : null}
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>E-mail</Text>
                <Text style={styles.reviewValue}>{businessEmail || "—"}</Text>
              </View>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Adres</Text>
                <Text style={styles.reviewValue}>{summaryAddress || "—"}</Text>
              </View>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Uitbetalingen</Text>
                <Text style={styles.reviewValue}>
                  {stripeDone ? "Voorbereid via Stripe" : "Nog niet ingesteld"}
                </Text>
              </View>
            </View>
          ) : null}

          {isReadOnly && onboarding ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Jouw gegevens</Text>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Bedrijfsnaam</Text>
                <Text style={styles.reviewValue}>{onboarding.businessName || "—"}</Text>
              </View>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>KVK</Text>
                <Text style={styles.reviewValue}>{onboarding.kvkNumber || "—"}</Text>
              </View>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Status</Text>
                <Text style={styles.reviewValue}>
                  {isVerified ? "Goedgekeurd" : "In controle"}
                </Text>
              </View>
            </View>
          ) : null}
        </ScrollView>
      )}

      {!loading && !isPending && !isVerified ? (
        <View style={[styles.stickyBar, { paddingBottom: insets.bottom + 10 }]}>
          {step === 1 ? (
            <Pressable
              style={[styles.primaryBtn, submitting && styles.btnDisabled]}
              onPress={() => void onContinueToStripe()}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Ga verder naar uitbetalingen"
            >
              {submitting ? (
                <ActivityIndicator size="small" color={theme.bg} />
              ) : (
                <Text style={styles.primaryBtnText}>Ga verder</Text>
              )}
            </Pressable>
          ) : null}
          {step === 2 ? (
            <>
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => setStep(1)}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityLabel="Terug"
              >
                <Text style={styles.secondaryBtnText}>Terug</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryBtn, submitting && styles.btnDisabled]}
                onPress={() => void onStripeSetupPrepared()}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityLabel="Uitbetalingen voorbereid"
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={theme.bg} />
                ) : (
                  <Text style={styles.primaryBtnText}>Uitbetalingen voorbereid</Text>
                )}
              </Pressable>
            </>
          ) : null}
          {step === 3 ? (
            <>
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => setStep(stripeDone ? 2 : 1)}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityLabel="Terug"
              >
                <Text style={styles.secondaryBtnText}>Terug</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryBtn, submitting && styles.btnDisabled]}
                onPress={() => void onSubmitForReview()}
                disabled={submitting || !stripeDone}
                accessibilityRole="button"
                accessibilityLabel="Gegevens indienen"
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={theme.bg} />
                ) : (
                  <Text style={styles.primaryBtnText}>Indienen ter controle</Text>
                )}
              </Pressable>
            </>
          ) : null}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg,
    paddingHorizontal: 16,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -8,
  },
  topBarSide: {
    width: 40,
  },
  screenTitle: {
    flex: 1,
    color: theme.text,
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
  },
  funnelRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
    justifyContent: "center",
  },
  funnelChip: {
    color: theme.textMuted,
    fontSize: 10,
    fontWeight: "700",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: theme.bgElevated,
    overflow: "hidden",
    maxWidth: 100,
  },
  funnelChipActive: {
    color: theme.accent,
    backgroundColor: theme.accentSoft,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
    paddingHorizontal: 24,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.border,
  },
  stepDotActive: {
    backgroundColor: theme.accent,
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: theme.border,
    marginHorizontal: 6,
  },
  stepLineActive: {
    backgroundColor: theme.accent,
  },
  stepLabel: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 12,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    marginBottom: 12,
  },
  sectionTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 14,
  },
  subsectionTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 8,
    marginBottom: 8,
  },
  typeRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  typeChip: {
    flex: 1,
    alignItems: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    backgroundColor: theme.bgElevated,
  },
  typeChipSelected: {
    borderColor: theme.accent,
    backgroundColor: theme.accentSoft,
  },
  typeChipText: {
    color: theme.textMuted,
    fontSize: 14,
    fontWeight: "800",
  },
  typeChipTextSelected: {
    color: theme.accent,
  },
  helperBlock: {
    color: theme.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  field: {
    marginBottom: 12,
  },
  fieldHint: {
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: -6,
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
  inputDisabled: {
    opacity: 0.7,
  },
  stripeCard: {
    alignItems: "center",
    padding: 20,
    borderRadius: 14,
    backgroundColor: theme.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    gap: 8,
  },
  stripeCardTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "900",
  },
  stripeCardText: {
    color: theme.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  doneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  doneText: {
    color: theme.accent,
    fontSize: 14,
    fontWeight: "800",
  },
  reviewHint: {
    color: theme.textMuted,
    fontSize: 13,
    marginBottom: 14,
    lineHeight: 19,
  },
  reviewHintAccent: {
    color: theme.accent,
    fontWeight: "800",
  },
  reviewRow: {
    marginBottom: 12,
  },
  reviewLabel: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4,
  },
  reviewValue: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 21,
  },
  infoBox: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: theme.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    marginBottom: 12,
  },
  infoBoxSuccess: {
    borderColor: "rgba(158, 255, 0, 0.45)",
    backgroundColor: "rgba(158, 255, 0, 0.08)",
  },
  infoTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 6,
  },
  infoText: {
    color: theme.textMuted,
    fontSize: 13,
    lineHeight: 19,
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
    gap: 10,
  },
  primaryBtn: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: theme.bg,
    fontSize: 16,
    fontWeight: "900",
  },
  secondaryBtn: {
    minHeight: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  secondaryBtnText: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "800",
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
