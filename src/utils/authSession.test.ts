import test from "node:test";
import assert from "node:assert/strict";
import type { Session, User } from "@supabase/supabase-js";

import {
  bootstrapValidatedAuthSession,
  getSupabaseAuthStorageKey,
  isAuthSessionError,
  isValidAuthUser,
  type AuthSessionDeps,
} from "./authSessionValidation";

const VALID_USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function makeUser(id = VALID_USER_ID): User {
  return {
    id,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
  } as User;
}

function makeSession(user: User): Session {
  return {
    access_token: "access",
    refresh_token: "refresh",
    expires_in: 3600,
    token_type: "bearer",
    user,
  } as Session;
}

type TrackedDeps = AuthSessionDeps & {
  signOutCount: number;
  clearedStorage: boolean;
  clearedCaches: boolean;
};

function makeDeps(overrides: {
  session?: Session | null;
  sessionError?: { message: string; status?: number } | null;
  user?: User | null;
  userError?: { message: string; status?: number } | null;
}): TrackedDeps {
  const state = {
    signOutCount: 0,
    clearedStorage: false,
    clearedCaches: false,
  };

  return {
    get signOutCount() {
      return state.signOutCount;
    },
    get clearedStorage() {
      return state.clearedStorage;
    },
    get clearedCaches() {
      return state.clearedCaches;
    },
    client: {
      auth: {
        getSession: async () => ({
          data: { session: overrides.session ?? null },
          error: (overrides.sessionError as any) ?? null,
        }),
        getUser: async () => ({
          data: { user: overrides.user ?? null },
          error: (overrides.userError as any) ?? null,
        }),
        signOut: async () => {
          state.signOutCount += 1;
          return { error: null };
        },
      },
    },
    signOutLocal: async () => {
      state.signOutCount += 1;
    },
    clearStorage: async () => {
      state.clearedStorage = true;
    },
    clearCaches: () => {
      state.clearedCaches = true;
    },
  };
}

test("getSupabaseAuthStorageKey derives AsyncStorage key from project ref", () => {
  assert.equal(
    getSupabaseAuthStorageKey("https://mvngamvkdtcprgiizcvk.supabase.co"),
    "sb-mvngamvkdtcprgiizcvk-auth-token"
  );
});

test("isValidAuthUser requires UUID id", () => {
  assert.equal(isValidAuthUser(makeUser()), true);
  assert.equal(isValidAuthUser({ ...makeUser(), id: "" } as User), false);
  assert.equal(isValidAuthUser(null), false);
});

test("isAuthSessionError detects invalid refresh token and 401", () => {
  assert.equal(
    isAuthSessionError({ message: "Invalid Refresh Token: Refresh Token Not Found" }),
    true
  );
  assert.equal(isAuthSessionError({ status: 401, message: "Unauthorized" }), true);
  assert.equal(isAuthSessionError({ message: "Network timeout" }), false);
});

test("bootstrap without stored session returns guest state", async () => {
  const deps = makeDeps({ session: null });
  const result = await bootstrapValidatedAuthSession(deps);
  assert.equal(result.session, null);
  assert.equal(result.user, null);
  assert.equal(result.loginRequired, false);
});

test("bootstrap with stored session and valid getUser keeps user logged in", async () => {
  const user = makeUser();
  const session = makeSession(user);
  const deps = makeDeps({ session, user });
  const result = await bootstrapValidatedAuthSession(deps);
  assert.equal(result.session, session);
  assert.equal(result.user?.id, VALID_USER_ID);
  assert.equal(result.loginRequired, false);
});

test("deleted auth.users: stored session + failing getUser clears local auth", async () => {
  const user = makeUser();
  const session = makeSession(user);
  const deps = makeDeps({
    session,
    user: null,
    userError: { message: "User from sub claim in JWT does not exist", status: 403 },
  });

  const result = await bootstrapValidatedAuthSession(deps);

  assert.equal(result.session, null);
  assert.equal(result.user, null);
  assert.equal(result.loginRequired, true);
  assert.equal(deps.clearedStorage, true);
  assert.equal(deps.clearedCaches, true);
  assert.ok(deps.signOutCount >= 1);
});

test("deleted user cold-start scenario: login required then guest on relaunch", async () => {
  const user = makeUser();
  const session = makeSession(user);
  const deps = makeDeps({
    session,
    user: null,
    userError: { message: "User not found" },
  });

  const firstLaunch = await bootstrapValidatedAuthSession(deps);
  assert.equal(firstLaunch.loginRequired, true);
  assert.equal(firstLaunch.user, null);

  const secondLaunch = await bootstrapValidatedAuthSession(
    makeDeps({ session: null, user: null })
  );
  assert.equal(secondLaunch.loginRequired, false);
  assert.equal(secondLaunch.user, null);
});
