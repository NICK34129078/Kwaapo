import React, { useCallback } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import type { AppTheme } from "../constants/themeTokens";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";

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

type Props = {
  selectedUri: string | null;
  selectedName: string | null;
  volume: number;
  onSelected: (uri: string, name: string) => void;
  onClear: () => void;
  onVolumeChange: (volume: number) => void;
};

export function AudioPickerCard({
  selectedUri,
  selectedName,
  volume,
  onSelected,
  onClear,
  onVolumeChange,
}: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

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
      onSelected(asset.uri, name);
    } catch {
      Alert.alert(
        "Audio kiezen mislukt",
        "Probeer het opnieuw of plaats je post zonder audio."
      );
    }
  }, [onSelected]);

  const hasAudio = !!selectedUri;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Muziek toevoegen</Text>
      {!hasAudio ? (
        <>
          <Text style={styles.helper}>
            Voeg optioneel eigen audio toe aan je post.
          </Text>
          <Text style={styles.legal}>
            Gebruik alleen audio waarvoor je toestemming hebt.
          </Text>
          <Pressable
            style={styles.pickButton}
            onPress={() => {
              void handlePickAudio();
            }}
            accessibilityRole="button"
            accessibilityLabel="Audio kiezen"
          >
            <Ionicons name="musical-notes-outline" size={18} color={theme.bg} />
            <Text style={styles.pickButtonText}>Audio kiezen</Text>
          </Pressable>
        </>
      ) : (
        <>
          <View style={styles.selectedRow}>
            <View style={styles.iconWrap}>
              <Ionicons name="musical-notes" size={22} color={theme.accent} />
            </View>
            <View style={styles.selectedInfo}>
              <Text style={styles.fileName} numberOfLines={2}>
                {selectedName ?? "Eigen audio"}
              </Text>
              <Text style={styles.sourceLabel}>Eigen audio</Text>
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
            onPress={onClear}
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

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
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
      overflow: "hidden",
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
    pickButton: {
      marginTop: 4,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: theme.accent,
    },
    pickButtonText: {
      color: theme.bg,
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
}
