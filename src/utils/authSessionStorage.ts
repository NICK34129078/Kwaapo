import AsyncStorage from "@react-native-async-storage/async-storage";

import { env } from "../config/env";
import { getSupabaseAuthStorageKey } from "./authSessionValidation";

export async function clearSupabaseAuthStorage(): Promise<void> {
  const key = getSupabaseAuthStorageKey(env.supabaseUrl);
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // Best-effort: signOut({ scope: "local" }) is de primaire bron.
  }
}
