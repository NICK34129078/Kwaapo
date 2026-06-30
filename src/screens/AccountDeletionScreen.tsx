import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import type { AppTheme } from "../constants/themeTokens";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import { LEGAL_DISCLAIMER } from "../constants/appPolicies";
import { requestAccountDeletion } from "../services/accountDeletionService";
import { useAuth } from "../context/AuthContext";
import { getReadableErrorMessage } from "../utils/getReadableErrorMessage";

export function AccountDeletionScreen() {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const openConfirm = useCallback(() => {
    setConfirmVisible(true);
  }, []);

  const closeConfirm = useCallback(() => {
    if (!busy) {
      setConfirmVisible(false);
    }
  }, [busy]);

  const onConfirmDelete = useCallback(async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await requestAccountDeletion(reason);
      setConfirmVisible(false);
      await signOut();
      Alert.alert(
        "Verwijdering aangevraagd",
        "Je profiel is direct verborgen en je bent uitgelogd. Je login wordt binnen onze verwerkingstermijn definitief verwijderd. Order- en betalingsgegevens kunnen wettelijk bewaard blijven, maar zijn niet meer gekoppeld aan je profiel."
      );
      navigation.navigate("MainTabs", { screen: "Profile" });
    } catch (e) {
      Alert.alert(
        "Mislukt",
        getReadableErrorMessage(e, "Account verwijderen mislukt. Probeer het opnieuw.")
      );
    } finally {
      setBusy(false);
    }
  }, [busy, navigation, reason, signOut]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.topBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Terug"
        >
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </Pressable>
        <Text style={styles.screenTitle}>Account verwijderen</Text>
        <View style={styles.topBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 32 },
        ]}
      >
        <Text style={styles.disclaimer}>{LEGAL_DISCLAIMER}</Text>
        <Text style={styles.body}>
          Na bevestiging wordt je profiel direct verborgen en geanonimiseerd, worden posts
          en actieve producten gedeactiveerd, en log je uit. Je login (auth-account) wordt
          daarna door ons team of automatisch verwijderd binnen de verwerkingstermijn —
          dit is nog geen directe volledige verwijdering van alle backend-records.
        </Text>
        <Text style={styles.body}>
          Bestellingen en betalingsgegevens kunnen wettelijk verplicht bewaard blijven
          voor fiscale, fraude- of geschilafhandelingsdoeleinden. Deze gegevens zijn niet
          meer publiek gekoppeld aan je profiel.
        </Text>
        <Text style={styles.label}>Reden (optioneel)</Text>
        <TextInput
          style={styles.input}
          value={reason}
          onChangeText={setReason}
          placeholder="Waarom wil je je account verwijderen?"
          placeholderTextColor={theme.textMuted}
          multiline
          maxLength={500}
          editable={!busy}
        />
        <Pressable
          style={[styles.deleteBtn, busy && styles.deleteBtnDisabled]}
          onPress={openConfirm}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Verwijdering aanvragen"
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.deleteBtnText}>Account verwijderen</Text>
          )}
        </Pressable>
        <Pressable
          style={styles.cancelBtn}
          onPress={() => navigation.goBack()}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Annuleren"
        >
          <Text style={styles.cancelBtnText}>Annuleren</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={confirmVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Weet je het zeker?</Text>
            <Text style={styles.modalBody}>
              Je vraagt verwijdering aan — je profiel wordt direct verborgen en je wordt
              uitgelogd. Volledige verwijdering van je login volgt in onze verwerkingstermijn.
            </Text>
            <Pressable
              style={[styles.modalDelete, busy && styles.deleteBtnDisabled]}
              onPress={() => void onConfirmDelete()}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.deleteBtnText}>Ja, verwijder mijn account</Text>
              )}
            </Pressable>
            <Pressable style={styles.modalCancel} onPress={closeConfirm} disabled={busy}>
              <Text style={styles.cancelBtnText}>Terug</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    minHeight: 48,
  },
  topBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  screenTitle: {
    flex: 1,
    textAlign: "center",
    color: theme.text,
    fontSize: 17,
    fontWeight: "700",
  },
  content: { paddingHorizontal: 20, paddingTop: 12 },
  disclaimer: {
    color: theme.textMuted,
    fontSize: 13,
    fontStyle: "italic",
    marginBottom: 16,
    lineHeight: 19,
  },
  body: {
    color: theme.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 14,
  },
  label: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 12,
    color: theme.text,
    minHeight: 88,
    textAlignVertical: "top",
    marginBottom: 20,
  },
  deleteBtn: {
    backgroundColor: "#c0392b",
    borderRadius: 14,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  deleteBtnDisabled: { opacity: 0.6 },
  deleteBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  cancelBtn: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: { color: theme.textMuted, fontSize: 16, fontWeight: "600" },
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.overlay,
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: theme.bgElevated,
    borderRadius: 16,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  modalTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10,
  },
  modalBody: {
    color: theme.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 18,
  },
  modalDelete: {
    backgroundColor: "#c0392b",
    borderRadius: 12,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  modalCancel: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  });
}
