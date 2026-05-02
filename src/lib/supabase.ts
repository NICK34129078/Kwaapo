import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

import { env, logSupabaseEnvDiagnosticsOnce } from "../config/env";

/**
 * Supabase client voor Auth (en later evt. directe DB-calls met RLS).
 * Anon key is bedoeld voor client-side gebruik; blijf RLS streng instellen.
 *
 * React Native: AsyncStorage + geen URL-session detectie; refresh aan voor langlopende sessies.
 */
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

logSupabaseEnvDiagnosticsOnce();

/** Alleen host + pad-patroon; geen keys. Tijdelijk voor Network-request-debug. */
function logSupabaseDebug(): void {
  if (!__DEV__) {
    return;
  }
  const base = env.supabaseUrl.replace(/\/$/, "");
  console.log("[Supabase] URL used (no key):", base);

  const healthUrl = `${base}/auth/v1/health`;
  void fetch(healthUrl, { method: "GET" })
    .then(async (res) => {
      const text = await res.text().catch(() => "");
      console.log("[Supabase] test fetch auth/v1/health", {
        status: res.status,
        ok: res.ok,
        bodyPreview: text.slice(0, 80),
      });
    })
    .catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[Supabase] test fetch auth/v1/health failed:", msg);
    });
}

logSupabaseDebug();
