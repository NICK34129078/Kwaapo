/**
 * Client-side remote security smoke test (anon key + optional test account passwords via env).
 * Usage:
 *   node scripts/verify-feed-rpc-security-remote.mjs
 *
 * Optional env (for full JWT tests):
 *   TEST_ACCOUNT_A_EMAIL, TEST_ACCOUNT_A_PASSWORD
 *   TEST_ACCOUNT_B_UUID (default: nicoisgay profile id)
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const env = { ...loadEnv(), ...process.env };
const url = env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error("Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const ACCOUNT_A = {
  id: "294fed69-355a-48d3-a1bb-80977dbbf356",
  email: env.TEST_ACCOUNT_A_EMAIL,
  password: env.TEST_ACCOUNT_A_PASSWORD,
};
const ACCOUNT_B_ID = env.TEST_ACCOUNT_B_UUID ?? "3fc12b2a-34ff-415a-801e-f374290a8c21";

const supabase = createClient(url, anonKey);

const results = [];

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`PASS ${name}${detail ? `: ${detail}` : ""}`);
}

function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
}

async function main() {
  // 1. Public apply_* must not be callable
  const { error: tagErr } = await supabase.rpc("apply_tag_preference", {
    p_user_id: ACCOUNT_B_ID,
    p_tag: "client_hack",
    p_score_delta: 999,
  });
  if (tagErr && /Could not find the function|42883|PGRST202/i.test(tagErr.message)) {
    pass("client rpc apply_tag_preference missing/blocked", tagErr.message);
  } else if (tagErr) {
    pass("client rpc apply_tag_preference blocked", tagErr.message);
  } else {
    fail("client rpc apply_tag_preference", "unexpected success");
  }

  const { error: creatorErr } = await supabase.rpc("apply_creator_affinity", {
    p_viewer_id: ACCOUNT_A.id,
    p_creator_id: ACCOUNT_B_ID,
    p_score_delta: 999,
  });
  if (creatorErr && /Could not find the function|42883|PGRST202/i.test(creatorErr.message)) {
    pass("client rpc apply_creator_affinity missing/blocked", creatorErr.message);
  } else if (creatorErr) {
    pass("client rpc apply_creator_affinity blocked", creatorErr.message);
  } else {
    fail("client rpc apply_creator_affinity", "unexpected success");
  }

  // 2. Explore feed anon
  const { data: explore, error: exploreErr } = await supabase.rpc("get_explore_feed", {
    p_limit: 3,
    p_exclude_post_ids: [],
  });
  if (exploreErr) fail("anon get_explore_feed", exploreErr.message);
  else pass("anon get_explore_feed", `${(explore ?? []).length} rows`);

  if (!ACCOUNT_A.email || !ACCOUNT_A.password) {
    console.warn(
      "SKIP authenticated client tests: set TEST_ACCOUNT_A_EMAIL and TEST_ACCOUNT_A_PASSWORD in env"
    );
    const failed = results.filter((r) => !r.ok);
    process.exit(failed.length ? 1 : 0);
  }

  const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
    email: ACCOUNT_A.email,
    password: ACCOUNT_A.password,
  });
  if (signInErr || !signInData.session) {
    fail("sign in account A", signInErr?.message ?? "no session");
    process.exit(1);
  }
  pass("sign in account A", signInData.user.id);

  // 3. RLS direct insert into B prefs
  const { error: insertBErr } = await supabase.from("user_tag_preferences").insert({
    user_id: ACCOUNT_B_ID,
    tag: "client_rls_hack",
    score: 999,
  });
  if (insertBErr) pass("A direct insert B prefs blocked", insertBErr.message);
  else fail("A direct insert B prefs", "unexpected success");

  // 4. RLS direct self insert
  const { error: insertSelfErr } = await supabase.from("user_tag_preferences").insert({
    user_id: ACCOUNT_A.id,
    tag: "client_self_hack",
    score: 999,
  });
  if (insertSelfErr) pass("A direct self insert prefs blocked", insertSelfErr.message);
  else fail("A direct self insert prefs", "unexpected success");

  // 5. Read own prefs
  const { data: ownPrefs, error: readErr } = await supabase
    .from("user_tag_preferences")
    .select("tag, score")
    .eq("user_id", ACCOUNT_A.id)
    .limit(5);
  if (readErr) fail("A read own prefs", readErr.message);
  else pass("A read own prefs", `${(ownPrefs ?? []).length} rows`);

  // 6. record_content_interactions
  const postId = explore?.[0]?.id;
  if (postId) {
    const { data: ciData, error: ciErr } = await supabase.rpc("record_content_interactions", {
      p_events: [
        {
          post_id: postId,
          event_type: "photo_dwell",
          watch_duration_ms: 2500,
        },
      ],
    });
    if (ciErr) fail("A record_content_interactions", ciErr.message);
    else pass("A record_content_interactions", JSON.stringify(ciData));
  } else {
    console.warn("SKIP record_content_interactions: no explore post id");
  }

  // 7. Personalized feed A
  const { data: feedA, error: feedAErr } = await supabase.rpc("get_personalized_feed", {
    p_limit: 5,
    p_exclude_post_ids: [],
  });
  if (feedAErr) fail("A get_personalized_feed", feedAErr.message);
  else pass("A get_personalized_feed", `${(feedA ?? []).length} rows`);

  await supabase.auth.signOut();

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error(`\n${failed.length} check(s) failed`);
    process.exit(1);
  }
  console.log(`\nAll ${results.length} client checks passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
