import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../constants/theme";
import { AvatarImage } from "../components/AvatarImage";
import { useAuth } from "../context/AuthContext";
import { useAvatarPicker } from "../hooks/useAvatarPicker";
import { supabase } from "../lib/supabase";

type Props = {
  onClose: () => void;
  onSaved?: () => void;
};

type ProfileRow = {
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
};

function cleanUsernameInput(value: string): string {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

function isValidUsername(value: string): boolean {
  return /^[a-z0-9_]+$/.test(value);
}

const USERNAME_MAX_LENGTH = 30;

export function EditProfileScreen({ onClose, onSaved }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const {
    uploading: avatarUploading,
    showPicker: showAvatarPicker,
    cropModal: avatarCropModal,
  } = useAvatarPicker({
    userId: user?.id,
    onSuccess: (publicUrl) => {
      setAvatarUrl(publicUrl);
      onSaved?.();
    },
  });
  const cleanUsername = cleanUsernameInput(username);

  const canSave = useMemo(() => {
    if (saving || loading) {
      return false;
    }
    return (
      cleanUsername.length >= 3 &&
      cleanUsername.length <= USERNAME_MAX_LENGTH &&
      isValidUsername(cleanUsername)
    );
  }, [cleanUsername, loading, saving]);

  const loadProfile = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("username, display_name, avatar_url, bio")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>();

    if (error) {
      Alert.alert("Fout", "Profiel laden mislukt. Probeer opnieuw.");
      setLoading(false);
      return;
    }

    setUsername(data?.username ?? "");
    setDisplayName(data?.display_name ?? "");
    setBio(data?.bio ?? "");
    setAvatarUrl(data?.avatar_url ?? null);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const onSave = useCallback(async () => {
    if (!user?.id) {
      Alert.alert("Niet ingelogd", "Log in om je profiel te bewerken.");
      return;
    }
    if (cleanUsername.length === 0) {
      Alert.alert("Accountnaam ontbreekt", "Vul een accountnaam in.");
      return;
    }
    if (cleanUsername.length < 3) {
      Alert.alert(
        "Accountnaam te kort",
        "Gebruik minimaal 3 tekens voor je accountnaam."
      );
      return;
    }
    if (cleanUsername.length > USERNAME_MAX_LENGTH) {
      Alert.alert(
        "Accountnaam te lang",
        `Gebruik maximaal ${USERNAME_MAX_LENGTH} tekens voor je accountnaam.`
      );
      return;
    }
    if (!isValidUsername(cleanUsername)) {
      Alert.alert(
        "Ongeldige accountnaam",
        "Gebruik alleen letters, cijfers en underscore (_)."
      );
      return;
    }

    setSaving(true);
    console.log("[EditProfile] saving username", cleanUsername);
    const { error } = await supabase
      .from("profiles")
      .update({
        username: cleanUsername,
        display_name: displayName.trim(),
        bio: bio.trim(),
      })
      .eq("id", user.id);
    console.log("[EditProfile] update result", { error });
    setSaving(false);

    if (error) {
      const duplicateUsername =
        error.code === "23505" ||
        /duplicate|unique|username/i.test(error.message ?? "");
      if (duplicateUsername) {
        Alert.alert("Fout", "Deze accountnaam is al in gebruik.");
        return;
      }
      Alert.alert("Fout", error.message);
      return;
    }

    Alert.alert("Opgeslagen", "Je profiel is bijgewerkt.");
    onSaved?.();
    onClose();
  }, [bio, cleanUsername, displayName, onClose, onSaved, user?.id]);

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.topBar,
          { paddingTop: insets.top + 6, paddingBottom: 8, paddingHorizontal: 12 },
        ]}
      >
        <Pressable
          onPress={onClose}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="Sluit profiel bewerken"
        >
          <Ionicons name="close" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.title}>Profiel bewerken</Text>
        <View style={styles.iconButtonSpacer} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, 20) + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.avatarWrap}>
            <Pressable
              onPress={showAvatarPicker}
              disabled={avatarUploading}
              style={styles.avatarPressable}
              accessibilityRole="button"
              accessibilityLabel="Profielfoto wijzigen"
            >
              <AvatarImage uri={avatarUrl} style={styles.avatar} />
              {avatarUploading ? (
                <View style={styles.avatarUploadingOverlay}>
                  <ActivityIndicator size="small" color={theme.text} />
                </View>
              ) : null}
            </Pressable>
            <Pressable
              onPress={showAvatarPicker}
              disabled={avatarUploading}
              style={styles.changeAvatarBtn}
              accessibilityRole="button"
              accessibilityLabel="Profielfoto wijzigen"
            >
              <Ionicons name="camera-outline" size={16} color={theme.accent} />
              <Text style={styles.changeAvatarText}>Profielfoto wijzigen</Text>
            </Pressable>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Accountnaam</Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="@gebruikersnaam"
              placeholderTextColor={theme.textMuted}
              maxLength={USERNAME_MAX_LENGTH + 1}
              style={styles.input}
            />
            <Text style={styles.helperText}>
              Minimaal 3, maximaal 30 tekens. Alleen letters, cijfers en
              underscore (_).
            </Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Naam</Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Jouw naam"
              placeholderTextColor={theme.textMuted}
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Bio</Text>
            <TextInput
              value={bio}
              onChangeText={setBio}
              placeholder="Vertel iets over jezelf"
              placeholderTextColor={theme.textMuted}
              multiline
              textAlignVertical="top"
              maxLength={200}
              style={[styles.input, styles.bioInput]}
            />
          </View>

          <Pressable
            onPress={() => void onSave()}
            disabled={!canSave}
            style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Profiel opslaan"
          >
            {saving ? (
              <ActivityIndicator size="small" color={theme.bg} />
            ) : (
              <Text style={styles.saveText}>Save</Text>
            )}
          </Pressable>
        </ScrollView>
      )}
      {avatarCropModal}
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
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.bgElevated,
  },
  iconButtonSpacer: {
    width: 36,
    height: 36,
  },
  title: {
    color: theme.text,
    fontSize: 18,
    fontWeight: "800",
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
    gap: 14,
  },
  avatarWrap: {
    alignItems: "center",
    marginBottom: 6,
    gap: 10,
  },
  avatarPressable: {
    position: "relative",
  },
  avatar: {
    width: 112,
    height: 112,
    borderRadius: 56,
  },
  avatarUploadingOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 56,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  changeAvatarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  changeAvatarText: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "700",
  },
  field: {
    gap: 7,
  },
  label: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "700",
  },
  helperText: {
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  input: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: theme.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    color: theme.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  bioInput: {
    minHeight: 120,
  },
  saveBtn: {
    marginTop: 8,
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.accent,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveText: {
    color: theme.bg,
    fontSize: 16,
    fontWeight: "800",
  },
});
