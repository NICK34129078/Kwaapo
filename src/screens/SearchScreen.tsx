import React, { useCallback, useEffect, useState } from "react";
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
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { theme } from "../constants/theme";
import { AvatarImage } from "../components/AvatarImage";
import { supabase } from "../lib/supabase";

type SearchProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export function SearchScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchProfile[]>([]);

  const runSearch = useCallback(async (rawValue: string) => {
    const cleanValue = rawValue.trim();

    if (!cleanValue) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .or(`username.ilike.%${cleanValue}%,display_name.ilike.%${cleanValue}%`)
      .limit(25);

    if (error) {
      console.warn("[SearchScreen] profile search failed:", error.message);
      setResults([]);
      setLoading(false);
      return;
    }

    setResults((data ?? []) as SearchProfile[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void runSearch(query);
    }, 250);

    return () => {
      clearTimeout(timer);
    };
  }, [query, runSearch]);

  const renderItem = useCallback(
    ({ item }: { item: SearchProfile }) => {
      const title = item.display_name?.trim() || item.username?.trim() || "Gebruiker";
      const subtitle = item.username ? `@${item.username}` : "Geen gebruikersnaam";

      return (
        <Pressable
          style={styles.row}
          onPress={() => navigation.navigate("PublicProfile", { profileId: item.id })}
        >
          <AvatarImage uri={item.avatar_url} style={styles.avatar} />

          <View style={styles.rowText}>
            <Text style={styles.name} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.username} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
        </Pressable>
      );
    },
    [navigation]
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      <Text style={styles.title}>Zoeken</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Zoek op gebruikersnaam of naam"
        placeholderTextColor={theme.textMuted}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
      />

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="small" color={theme.accent} />
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.centerState}>
              <Text style={styles.emptyText}>
                {query.trim()
                  ? "Geen profielen gevonden."
                  : "Typ om profielen te zoeken."}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg,
    paddingHorizontal: 16,
  },
  title: {
    color: theme.text,
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 12,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    backgroundColor: theme.bgElevated,
    color: theme.text,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  listContent: {
    paddingBottom: 120,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.bgElevated,
  },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.bgElevated,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  avatarFallbackText: {
    color: theme.textMuted,
    fontSize: 9,
    textAlign: "center",
    lineHeight: 12,
  },
  rowText: {
    flex: 1,
  },
  name: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "600",
  },
  username: {
    color: theme.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  centerState: {
    paddingVertical: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: theme.textMuted,
    fontSize: 14,
  },
});
