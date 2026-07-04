import { env } from "../config/env";

export function getSupabaseProjectRefFromEnv(): string {
  const match = env.supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/i);
  return match?.[1] ?? "unknown";
}
