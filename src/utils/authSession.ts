import { env } from "../config/env";
import { supabase } from "../lib/supabase";
import { clearSavedStatusCache } from "../services/savedPostsService";
import { clearSupabaseAuthStorage } from "./authSessionStorage";
import {
  bootstrapValidatedAuthSession,
  validateAuthUserFromServer,
  type AuthBootstrapResult,
  type AuthSessionDeps,
} from "./authSessionValidation";

export {
  bootstrapValidatedAuthSession,
  getSupabaseAuthStorageKey,
  isAuthSessionError,
  isValidAuthUser,
  shouldInvalidateForHttpStatus,
  validateAuthUserFromServer,
  type AuthBootstrapResult,
  type AuthSessionDeps,
} from "./authSessionValidation";

export function clearLocalAuthCaches(): void {
  clearSavedStatusCache();
}

type AuthSessionInvalidationListener = (reason: string) => void;

const invalidationListeners = new Set<AuthSessionInvalidationListener>();
let invalidationInFlight: Promise<void> | null = null;

export function onAuthSessionInvalidated(
  listener: AuthSessionInvalidationListener
): () => void {
  invalidationListeners.add(listener);
  return () => {
    invalidationListeners.delete(listener);
  };
}

function notifyAuthSessionInvalidated(reason: string): void {
  for (const listener of invalidationListeners) {
    listener(reason);
  }
}

export async function invalidateStaleAuthSession(reason: string): Promise<void> {
  if (invalidationInFlight) {
    return invalidationInFlight;
  }

  invalidationInFlight = (async () => {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // Doorgaan met handmatige opschoning.
    }
    await clearSupabaseAuthStorage();
    clearLocalAuthCaches();
    notifyAuthSessionInvalidated(reason);
  })().finally(() => {
    invalidationInFlight = null;
  });

  return invalidationInFlight;
}

export function createDefaultAuthSessionDeps(): AuthSessionDeps {
  return {
    client: supabase,
    signOutLocal: async () => {
      await supabase.auth.signOut({ scope: "local" });
    },
    clearStorage: clearSupabaseAuthStorage,
    clearCaches: clearLocalAuthCaches,
  };
}

export async function bootstrapValidatedAuthSessionWithDefaults(): Promise<AuthBootstrapResult> {
  return bootstrapValidatedAuthSession(createDefaultAuthSessionDeps());
}

export async function validateAuthUserFromServerWithDefaults(): Promise<{
  user: import("@supabase/supabase-js").User | null;
  shouldInvalidate: boolean;
}> {
  return validateAuthUserFromServer(createDefaultAuthSessionDeps());
}

export { clearSupabaseAuthStorage } from "./authSessionStorage";
