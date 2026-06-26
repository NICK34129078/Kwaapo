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
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../constants/theme";
import {
  refreshStripeConnectStatus,
  startStripeConnectOnboarding,
  startStripePayoutManagement,
} from "../services/stripeConnectService";
import {
  fetchMySellerOnboarding,
  hasCompletedStripePayoutSetup,
  isSellerFullyReadyForLiveSales,
  isStripePayoutFullyActive,
  markSellerPendingReview,
  resolveSellerDashboardUI,
  resolveSellerOnboardingStep,
  sellerPayoutStatusLabel,
  updateMyBusinessInfo,
} from "../services/sellerOnboardingService";
import type { BusinessInfoPayload, SellerOnboarding, SellerType } from "../types/sellerOnboarding";

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
      setStep(resolveSellerOnboardingStep(row));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load().finally(() => setLoading(false));
    }, [load])
  );

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

  const onContinueFromStep1 = useCallback(async () => {
    const resumeStep = resolveSellerOnboardingStep(onboarding);
    if (resumeStep >= 2) {
      setStep(resumeStep);
      return;
    }

    setSubmitting(true);
    try {
      const updated = await updateMyBusinessInfo(buildPayload());
      setOnboarding(updated);
      setStep(resolveSellerOnboardingStep(updated));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Opslaan mislukt.";
      Alert.alert("Fout", msg);
    } finally {
      setSubmitting(false);
    }
  }, [buildPayload, onboarding]);

  const refreshOnboardingFromServer = useCallback(async () => {
    const row = await fetchMySellerOnboarding();
    setOnboarding(row);
    return row;
  }, []);

  const stripeDone = hasCompletedStripePayoutSetup(onboarding);
  const dashboardUI = resolveSellerDashboardUI(onboarding);
  const stripePayoutsActive = isStripePayoutFullyActive(onboarding);
  const stripePayoutLabel = sellerPayoutStatusLabel(onboarding);
  const hasConnectAccount = !!onboarding?.stripeConnectAccountId;

  const stripeButtonLabel = !hasConnectAccount
    ? "Uitbetalingen instellen"
    : stripePayoutsActive
      ? "Status vernieuwen"
      : "Doorgaan met uitbetalingen instellen";

  const onStartStripeConnect = useCallback(async () => {
    setSubmitting(true);
    try {
      if (stripePayoutsActive) {
        await refreshStripeConnectStatus();
        const row = await refreshOnboardingFromServer();
        if (isStripePayoutFullyActive(row)) {
          Alert.alert("Uitbetalingen actief", "Je Stripe-uitbetalingen zijn ingesteld.");
        }
        return;
      }

      const result = await startStripeConnectOnboarding();
      const row = await refreshOnboardingFromServer();
      if (result.ok) {
        if (hasCompletedStripePayoutSetup(row)) {
          setStep(3);
        }
        if (isStripePayoutFullyActive(row)) {
          Alert.alert("Uitbetalingen actief", "Je Stripe-uitbetalingen zijn ingesteld.");
        }
        return;
      }
      Alert.alert("Stripe", result.message);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe onboarding mislukt.";
      Alert.alert("Fout", msg);
    } finally {
      setSubmitting(false);
    }
  }, [refreshOnboardingFromServer, stripePayoutsActive]);

  const onSubmitForReview = useCallback(async () => {
    setSubmitting(true);
    try {
      await updateMyBusinessInfo(buildPayload());
      const updated = await markSellerPendingReview();
      setOnboarding(updated);
      if (isSellerFullyReadyForLiveSales(updated)) {
        Alert.alert(
          "Verkoopaccount actief",
          "Je kunt nu producten toevoegen en verkopen. Uitbetalingen worden verwerkt via Stripe.",
          [{ text: "OK", onPress: () => navigation.goBack() }]
        );
      } else {
        Alert.alert(
          "Nog niet volledig actief",
          "Rond Stripe-verificatie en bedrijfsgegevens af. Uitbetalingen worden verwerkt via Stripe.",
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Activeren mislukt.";
      Alert.alert("Fout", msg);
    } finally {
      setSubmitting(false);
    }
  }, [buildPayload, navigation]);

  const onManagePayoutAccount = useCallback(async () => {
    setSubmitting(true);
    try {
      const result = await startStripePayoutManagement();
      const row = await refreshOnboardingFromServer();
      setOnboarding(row);
      if (!result.ok) {
        Alert.alert("Stripe", result.message);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe openen mislukt.";
      Alert.alert("Fout", msg);
    } finally {
      setSubmitting(false);
    }
  }, [refreshOnboardingFromServer]);

  const onboardingComplete = isSellerFullyReadyForLiveSales(onboarding);
  const showWizard = !onboardingComplete;
  const resumeStep = resolveSellerOnboardingStep(onboarding);

  useEffect(() => {
    if (step === 2 && showWizard) {
      void refreshOnboardingFromServer().catch(() => undefined);
    }
  }, [refreshOnboardingFromServer, showWizard, step]);

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
          {!onboardingComplete && onboarding ? (
            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>{dashboardUI.title}</Text>
              <Text style={styles.infoText}>{dashboardUI.message}</Text>
            </View>
          ) : null}

          {onboardingComplete ? (
            <View style={[styles.infoBox, styles.infoBoxSuccess]}>
              <Text style={styles.infoTitle}>Je verkoopaccount is actief</Text>
              <Text style={styles.infoText}>
                Uitbetalingen gaan veilig via Stripe naar je opgegeven rekening.
              </Text>
            </View>
          ) : null}

          {step === 1 && showWizard ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>KVK & bedrijfsgegevens</Text>
              <Text style={styles.helperBlock}>
                Vul je officiële bedrijfsgegevens in. Deze zijn nodig voordat je
                kunt verkopen en uitbetalingen ontvangt.
              </Text>

              <FormField
                label={sellerType === "business" ? "Bedrijfsnaam" : "Naam / handelsnaam"}
                value={businessName}
                onChangeText={setBusinessName}
                placeholder="Bijv. Kwaapo Fashion B.V."
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

          {step === 2 && showWizard ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Uitbetalingen instellen</Text>
              {!hasConnectAccount ? (
                <Text style={styles.helperBlock}>
                  Stripe opent een beveiligde pagina. Vul daar je bankrekening en
                  identiteitsgegevens in. Wij slaan je bankgegevens niet op.
                </Text>
              ) : !stripeDone ? (
                <Text style={styles.helperBlock}>
                  Je bent nog niet klaar met Stripe. Ga verder met de beveiligde
                  Stripe-pagina om je uitbetalingen af te ronden.
                </Text>
              ) : stripePayoutsActive ? (
                <Text style={styles.helperBlock}>
                  Uitbetalingen actief. Je kunt doorgaan naar controle en indienen.
                </Text>
              ) : (
                <Text style={styles.helperBlock}>
                  Stripe controleert je gegevens. Dit kan even duren.
                </Text>
              )}
              <View
                style={[
                  styles.stripeCard,
                  stripePayoutsActive && styles.stripeCardSuccess,
                ]}
              >
                <Ionicons
                  name={stripePayoutsActive ? "checkmark-circle" : "card-outline"}
                  size={32}
                  color={stripePayoutsActive ? theme.accent : theme.textMuted}
                />
                <Text style={styles.stripeCardTitle}>{stripePayoutLabel}</Text>
                <Text style={styles.stripeCardText}>
                  {stripePayoutsActive
                    ? "Uitbetalingen worden verwerkt via Stripe."
                    : stripeDone
                      ? "Stripe controleert je gegevens. Dit kan even duren."
                      : "Open Stripe om je bankrekening en identiteit te bevestigen. Kwaapo slaat geen bankgegevens op."}
                </Text>
              </View>
              {hasConnectAccount ? (
                <Pressable
                  style={[styles.secondaryBtn, styles.inlineManageBtn]}
                  onPress={() => void onManagePayoutAccount()}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityLabel="Uitbetalingsrekening beheren"
                >
                  <Text style={styles.secondaryBtnText}>
                    Uitbetalingsrekening beheren
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {step === 3 && showWizard ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Controle</Text>
              <Text style={styles.reviewHint}>
                Controleer je gegevens. Je verkoopaccount wordt automatisch actief
                zodra KVK en Stripe volledig zijn afgerond.
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
                <Text style={styles.reviewValue}>{stripePayoutLabel}</Text>
              </View>
            </View>
          ) : null}

          {onboardingComplete && onboarding ? (
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
                <Text style={styles.reviewValue}>Actief</Text>
              </View>
              <Pressable
                style={[styles.secondaryBtn, styles.inlineManageBtn]}
                onPress={() => void onManagePayoutAccount()}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityLabel="Uitbetalingsrekening beheren"
              >
                <Text style={styles.secondaryBtnText}>
                  Uitbetalingsrekening beheren
                </Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      )}

      {!loading && showWizard ? (
        <View style={[styles.stickyBar, { paddingBottom: insets.bottom + 10 }]}>
          {step === 1 ? (
            <Pressable
              style={[styles.primaryBtn, submitting && styles.btnDisabled]}
              onPress={() => void onContinueFromStep1()}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Ga verder"
            >
              {submitting ? (
                <ActivityIndicator size="small" color={theme.bg} />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {resumeStep >= 3
                    ? "Ga verder naar controle"
                    : resumeStep === 2
                      ? "Ga verder naar uitbetalingen"
                      : "Opslaan en verder"}
                </Text>
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
                onPress={() => void onStartStripeConnect()}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityLabel={stripeButtonLabel}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={theme.bg} />
                ) : (
                  <Text style={styles.primaryBtnText}>{stripeButtonLabel}</Text>
                )}
              </Pressable>
              {stripeDone ? (
                <Pressable
                  style={styles.secondaryBtn}
                  onPress={() => setStep(3)}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityLabel="Ga verder naar controle"
                >
                  <Text style={styles.secondaryBtnText}>Ga verder naar controle</Text>
                </Pressable>
              ) : null}
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
                accessibilityLabel="Status controleren en activeren"
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={theme.bg} />
                ) : (
                  <Text style={styles.primaryBtnText}>Status controleren</Text>
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
  stripeCardSuccess: {
    backgroundColor: theme.accentLight,
    borderColor: theme.accentBorderStrong,
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
    borderColor: theme.accentBorderStrong,
    backgroundColor: theme.accentFaint,
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
  inlineManageBtn: {
    marginTop: 14,
    alignSelf: "stretch",
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
