import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../constants/theme";
import type { SpotifyTrackResult } from "../services/spotifyService";

export const AUDIO_VOLUME_LOW = 0.35;
export const AUDIO_VOLUME_NORMAL = 0.7;
export const AUDIO_VOLUME_HIGH = 1;

type VolumePreset = {
  label: string;
  value: number;
};

const VOLUME_PRESETS: VolumePreset[] = [
  { label: "Laag", value: AUDIO_VOLUME_LOW },
  { label: "Normaal", value: AUDIO_VOLUME_NORMAL },
  { label: "Hoog", value: AUDIO_VOLUME_HIGH },
];

type AudioMode = "none" | "local" | "spotify";

type Props = {
  selectedUri: string | null;
  selectedName: string | null;
  selectedSpotifyTrack: SpotifyTrackResult | null;
  volume: number;
  onLocalSelected: (uri: string, name: string) => void;
  onLocalClear: () => void;
  onSpotifyClear: () => void;
  onVolumeChange: (volume: number) => void;
  onOpenSpotifyPicker: (query?: string) => void;
};

export function AudioPickerCard({
  selectedUri,
  selectedName,
  selectedSpotifyTrack,
  volume,
  onLocalSelected,
  onLocalClear,
  onSpotifyClear,
  onVolumeChange,
  onOpenSpotifyPicker,
}: Props) {
  const mode: AudioMode = selectedSpotifyTrack
    ? "spotify"
    : selectedUri
      ? "local"
      : "none";

  const handlePickAudio = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets?.[0];
      if (!asset?.uri) {
        return;
      }

      const name =
        asset.name && asset.name.length > 0 ? asset.name : "Eigen audio";
      onLocalSelected(asset.uri, name);
    } catch {
      Alert.alert(
        "Audio kiezen mislukt",
        "Probeer het opnieuw of plaats je post zonder audio."
      );
    }
  }, [onLocalSelected]);

  const handleClear = useCallback(() => {
    if (mode === "spotify") {
      onSpotifyClear();
    } else {
      onLocalClear();
    }
  }, [mode, onLocalClear, onSpotifyClear]);

  const hasAudio = mode !== "none";

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Muziek toevoegen</Text>

      {!hasAudio ? (
        <>
          <Text style={styles.helper}>
            Voeg optioneel eigen audio of een Spotify-preview toe.
          </Text>
          <View style={styles.modeRow}>
            <Pressable
              style={styles.modeButton}
              onPress={() => {
                void handlePickAudio();
              }}
              accessibilityRole="button"
              accessibilityLabel="Eigen audio kiezen"
            >
              <Ionicons name="folder-open-outline" size={18} color={theme.bg} />
              <Text style={styles.modeButtonText}>Eigen audio</Text>
            </Pressable>
          </View>
          <View style={styles.spotifySearchRow}>
            <Ionicons name="search" size={18} color={theme.textMuted} />
            <TextInput
              style={styles.spotifySearchInput}
              placeholder="Zoek op Spotify (bijv. Drake)"
              placeholderTextColor={theme.textMuted}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              onFocus={() => onOpenSpotifyPicker()}
              onChangeText={(text) => {
                if (text.trim().length >= 2) {
                  onOpenSpotifyPicker(text);
                }
              }}
              onSubmitEditing={(e) => onOpenSpotifyPicker(e.nativeEvent.text)}
            />
            <Ionicons name="musical-notes-outline" size={18} color={theme.accent} />
          </View>
          <Text style={styles.legal}>
            Gebruik alleen audio waarvoor je toestemming hebt. Spotify: alleen
            previewfragmenten.
          </Text>
        </>
      ) : (
        <>
          <View style={styles.selectedRow}>
            {mode === "spotify" && selectedSpotifyTrack?.coverUrl ? (
              <Image
                source={{ uri: selectedSpotifyTrack.coverUrl }}
                style={styles.cover}
              />
            ) : (
              <View style={styles.iconWrap}>
                <Ionicons name="musical-notes" size={22} color={theme.accent} />
              </View>
            )}
            <View style={styles.selectedInfo}>
              <Text style={styles.fileName} numberOfLines={2}>
                {mode === "spotify"
                  ? selectedSpotifyTrack?.title ?? "Spotify-nummer"
                  : selectedName ?? "Eigen audio"}
              </Text>
              <Text style={styles.sourceLabel}>
                {mode === "spotify"
                  ? selectedSpotifyTrack?.artist ?? "Spotify"
                  : "Eigen audio"}
              </Text>
            </View>
          </View>
          <Text style={styles.volumeLabel}>Volume</Text>
          <View style={styles.volumeRow}>
            {VOLUME_PRESETS.map((preset) => {
              const active = Math.abs(volume - preset.value) < 0.01;
              return (
                <Pressable
                  key={preset.label}
                  style={[styles.volumeChip, active && styles.volumeChipActive]}
                  onPress={() => onVolumeChange(preset.value)}
                  accessibilityRole="button"
                  accessibilityLabel={`Volume ${preset.label}`}
                >
                  <Text
                    style={[
                      styles.volumeChipText,
                      active && styles.volumeChipTextActive,
                    ]}
                  >
                    {preset.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            style={styles.removeButton}
            onPress={handleClear}
            accessibilityRole="button"
            accessibilityLabel="Audio verwijderen"
          >
            <Text style={styles.removeButtonText}>Verwijderen</Text>
          </Pressable>
        </>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    marginBottom: 4,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    backgroundColor: theme.bgElevated,
    gap: 8,
    width: "100%",
    alignSelf: "stretch",
  },
  title: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "800",
    flexShrink: 1,
    flexWrap: "wrap",
  },
  helper: {
    color: theme.textMuted,
    fontSize: 13,
    lineHeight: 18,
    flexShrink: 1,
    flexWrap: "wrap",
  },
  legal: {
    color: theme.textMuted,
    fontSize: 11,
    lineHeight: 15,
    fontStyle: "italic",
    flexShrink: 1,
    flexWrap: "wrap",
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  modeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: theme.accent,
  },
  modeButtonText: {
    color: theme.bg,
    fontSize: 14,
    fontWeight: "800",
  },
  spotifySearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    backgroundColor: theme.bg,
  },
  spotifySearchInput: {
    flex: 1,
    color: theme.text,
    fontSize: 14,
    paddingVertical: 0,
  },
  modeButtonSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.accent,
    backgroundColor: theme.accentSoft,
  },
  modeButtonSecondaryText: {
    color: theme.accent,
    fontSize: 14,
    fontWeight: "800",
  },
  selectedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
  },
  selectedInfo: {
    flex: 1,
    flexShrink: 1,
  },
  sourceLabel: {
    color: theme.accent,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.accentSoft,
    flexShrink: 0,
  },
  cover: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: theme.bg,
    flexShrink: 0,
  },
  fileName: {
    flexShrink: 1,
    color: theme.text,
    fontSize: 14,
    fontWeight: "700",
  },
  volumeLabel: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  volumeRow: {
    flexDirection: "row",
    gap: 8,
  },
  volumeChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    alignItems: "center",
  },
  volumeChipActive: {
    borderColor: theme.accent,
    backgroundColor: theme.accentSoft,
  },
  volumeChipText: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  volumeChipTextActive: {
    color: theme.accent,
  },
  removeButton: {
    alignSelf: "flex-start",
    paddingVertical: 6,
  },
  removeButtonText: {
    color: "#ff8a84",
    fontSize: 13,
    fontWeight: "700",
  },
});
