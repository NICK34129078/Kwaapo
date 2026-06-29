import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../constants/theme";
import {
  resolveSpotifyTrack,
  searchSpotifyTracks,
  type SpotifyTrackResult,
} from "../services/spotifyService";

type Props = {
  visible: boolean;
  bottomInset: number;
  initialQuery?: string;
  onSelect: (track: SpotifyTrackResult) => void;
  onClose: () => void;
};

function formatDurationMs(ms: number | null): string {
  if (ms == null || ms <= 0) {
    return "";
  }
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export function SpotifySoundPickerPanel({
  visible,
  bottomInset,
  initialQuery = "",
  onSelect,
  onClose,
}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SpotifyTrackResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      setQuery(initialQuery);
    } else {
      setQuery("");
      setResults([]);
      setError(null);
      setLoading(false);
      setResolvingId(null);
    }
  }, [visible, initialQuery]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    debounceRef.current = setTimeout(() => {
      void (async () => {
        try {
          const tracks = await searchSpotifyTracks(trimmed);
          setResults(tracks);
        } catch (e) {
          setResults([]);
          setError(
            e instanceof Error ? e.message : "Zoeken mislukt. Probeer het opnieuw."
          );
        } finally {
          setLoading(false);
        }
      })();
    }, 300);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, visible]);

  const handlePick = useCallback(
    async (track: SpotifyTrackResult) => {
      if (!track.hasPreview) {
        return;
      }
      setResolvingId(track.spotifyTrackId);
      setError(null);
      try {
        const resolved = await resolveSpotifyTrack(track.spotifyTrackId);
        onSelect(resolved);
        onClose();
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Nummer laden mislukt. Probeer het opnieuw."
        );
      } finally {
        setResolvingId(null);
      }
    },
    [onClose, onSelect]
  );

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Sluit Spotify-zoeker"
      />
      <View style={[styles.sheet, { paddingBottom: bottomInset + 16 }]}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Kies een geluid</Text>
            <Text style={styles.subtitle}>
              Previewfragment via Spotify. Geen volledige nummers.
            </Text>
          </View>
          <Pressable
            style={styles.closeBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Sluit Spotify-zoeker"
          >
            <Ionicons name="close" size={22} color={theme.text} />
          </Pressable>
        </View>

        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Zoek op titel of artiest"
          placeholderTextColor={theme.textMuted}
          autoCorrect={false}
          autoCapitalize="none"
          autoFocus
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : query.trim().length < 2 ? (
          <Text style={styles.hint}>Typ minimaal 2 tekens om te zoeken.</Text>
        ) : results.length === 0 ? (
          <Text style={styles.hint}>Geen nummers gevonden.</Text>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item) => item.spotifyTrackId}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            renderItem={({ item }) => {
              const disabled = !item.hasPreview;
              const busy = resolvingId === item.spotifyTrackId;
              return (
                <Pressable
                  style={[styles.row, disabled && styles.rowDisabled]}
                  onPress={() => {
                    void handlePick(item);
                  }}
                  disabled={disabled || busy}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title} van ${item.artist}`}
                >
                  {item.coverUrl ? (
                    <Image source={{ uri: item.coverUrl }} style={styles.cover} />
                  ) : (
                    <View style={styles.coverPlaceholder}>
                      <Ionicons name="musical-notes" size={18} color={theme.accent} />
                    </View>
                  )}
                  <View style={styles.rowText}>
                    <Text style={styles.trackTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.trackArtist} numberOfLines={1}>
                      {item.artist}
                      {item.durationMs ? ` · ${formatDurationMs(item.durationMs)}` : ""}
                    </Text>
                    {disabled ? (
                      <Text style={styles.noPreview}>Geen preview beschikbaar</Text>
                    ) : null}
                  </View>
                  {busy ? (
                    <ActivityIndicator color={theme.accent} size="small" />
                  ) : (
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={disabled ? theme.textMuted : theme.text}
                    />
                  )}
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    elevation: 100,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    maxHeight: "85%",
    minHeight: 320,
    backgroundColor: theme.bgElevated,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: theme.text,
    fontSize: 17,
    fontWeight: "800",
  },
  subtitle: {
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.bg,
  },
  search: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: theme.text,
    fontSize: 15,
    marginBottom: 8,
    backgroundColor: theme.bg,
  },
  list: {
    flexGrow: 1,
    maxHeight: 420,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  rowDisabled: {
    opacity: 0.45,
  },
  cover: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: theme.bg,
  },
  coverPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.accentSoft,
  },
  rowText: {
    flex: 1,
  },
  trackTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "700",
  },
  trackArtist: {
    color: theme.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  noPreview: {
    color: "#ff8a84",
    fontSize: 11,
    marginTop: 2,
  },
  hint: {
    color: theme.textMuted,
    fontSize: 13,
    paddingVertical: 16,
    textAlign: "center",
  },
  centered: {
    paddingVertical: 24,
    alignItems: "center",
  },
  errorText: {
    color: "#ff8a84",
    fontSize: 12,
    marginBottom: 6,
  },
});
