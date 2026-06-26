/**
 * KVK Handelsregister Basisprofiel — server-side verification only.
 * Secrets: KVK_API_KEY (required), KVK_API_BASE (optional, defaults to production)
 *
 * Test: KVK_API_BASE=https://api.kvk.nl/test/api/v1
 *       KVK_API_KEY=l7xx1f2691f2520d487b902f4e0b57a0b197
 */

const DEFAULT_KVK_API_BASE = "https://api.kvk.nl/api/v1";
const KVK_TEST_API_KEY = "l7xx1f2691f2520d487b902f4e0b57a0b197";

function jsonKvk(data, status = 200, cors = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

function isStandardUuid(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(s || "")
  );
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

/** Dutch KVK: exactly 8 digits. */
export function normalizeKvkNumber(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length !== 8) {
    return null;
  }
  return digits;
}

/** Lowercase, strip legal suffixes and punctuation for name comparison. */
function normalizeBusinessName(name) {
  return clean(name)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\b(b\.v\.|bv|n\.v\.|nv|vof|v\.o\.f\.)\b/gi, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function namesMatch(inputName, registeredNames) {
  const normalizedInput = normalizeBusinessName(inputName);
  if (!normalizedInput) {
    return false;
  }
  for (const candidate of registeredNames) {
    const normalizedCandidate = normalizeBusinessName(candidate);
    if (!normalizedCandidate) {
      continue;
    }
    if (
      normalizedInput === normalizedCandidate ||
      normalizedInput.includes(normalizedCandidate) ||
      normalizedCandidate.includes(normalizedInput)
    ) {
      return true;
    }
  }
  return false;
}

function collectRegisteredNames(profile) {
  const names = [];
  const push = (v) => {
    const s = clean(v);
    if (s) {
      names.push(s);
    }
  };
  push(profile.naam);
  push(profile.statutaireNaam);
  if (Array.isArray(profile.handelsnamen)) {
    for (const h of profile.handelsnamen) {
      push(h?.naam);
    }
  }
  const hoofd =
    profile.hoofdvestiging ||
    profile._embedded?.hoofdvestiging ||
    null;
  if (hoofd) {
    push(hoofd.eersteHandelsnaam);
    if (Array.isArray(hoofd.handelsnamen)) {
      for (const h of hoofd.handelsnamen) {
        push(h?.naam);
      }
    }
  }
  return [...new Set(names)];
}

function normalizePostcode(pc) {
  return clean(pc).replace(/\s+/g, "").toUpperCase();
}

function normalizePlace(place) {
  return clean(place).toLowerCase().replace(/\s+/g, " ");
}

function normalizeStreet(street) {
  return clean(street).toLowerCase().replace(/\s+/g, " ");
}

function pickVisitingAddress(profile) {
  const hoofd =
    profile.hoofdvestiging ||
    profile._embedded?.hoofdvestiging ||
    null;
  const eigenaar =
    profile.eigenaar || profile._embedded?.eigenaar || null;

  const fromList = (list) => {
    if (!Array.isArray(list)) {
      return null;
    }
    const bezoek = list.find(
      (a) =>
        clean(a?.type).toLowerCase() === "bezoekadres" ||
        clean(a?.type).toLowerCase() === "bezoek adres"
    );
    return bezoek || list[0] || null;
  };

  if (hoofd?.adressen) {
    const addr = fromList(hoofd.adressen);
    if (addr) {
      return addr;
    }
  }
  if (eigenaar?.adressen) {
    return fromList(eigenaar.adressen);
  }
  return null;
}

function isAddressShielded(addr) {
  const v = clean(addr?.indAfgeschermd).toLowerCase();
  return v === "ja" || v === "true" || v === "yes";
}

function addressMatches(input, kvkAddr) {
  if (!kvkAddr) {
    return { ok: false, reason: "no_kvk_address" };
  }
  if (isAddressShielded(kvkAddr)) {
    return { ok: true, shielded: true };
  }

  const inputPc = normalizePostcode(input.businessPostalCode);
  const kvkPc = normalizePostcode(kvkAddr.postcode);
  if (inputPc && kvkPc && inputPc !== kvkPc) {
    return { ok: false, reason: "postcode" };
  }

  const inputPlace = normalizePlace(input.businessCity);
  const kvkPlace = normalizePlace(kvkAddr.plaats);
  if (inputPlace && kvkPlace && inputPlace !== kvkPlace) {
    return { ok: false, reason: "plaats" };
  }

  const inputStreet = normalizeStreet(input.businessStreet);
  const kvkStreet = normalizeStreet(kvkAddr.straatnaam);
  if (inputStreet && kvkStreet && inputStreet !== kvkStreet) {
    return { ok: false, reason: "straat" };
  }

  const inputMatch = String(input.businessHouseNumber || "").match(/^\s*(\d+)/);
  const inputDigits = inputMatch ? inputMatch[1] : "";
  const kvkDigits = String(kvkAddr.huisnummer ?? "").replace(/\D/g, "").trim();
  if (inputDigits && kvkDigits && inputDigits !== kvkDigits) {
    return { ok: false, reason: "huisnummer" };
  }

  return { ok: true, shielded: false };
}

function isDeregistered(profile) {
  const endDates = [];
  const pushEnd = (block) => {
    const d = clean(block?.datumEinde);
    if (d) {
      endDates.push(d);
    }
  };
  pushEnd(profile.materieleRegistratie);
  const hoofd =
    profile.hoofdvestiging || profile._embedded?.hoofdvestiging;
  pushEnd(hoofd?.materieleRegistratie);
  pushEnd(profile.eigenaar?.materieleRegistratie);
  pushEnd(profile._embedded?.eigenaar?.materieleRegistratie);

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  for (const d of endDates) {
    const normalized = d.replace(/-/g, "").slice(0, 8);
    if (normalized.length === 8 && normalized <= today) {
      return true;
    }
  }
  return false;
}

function getKvkConfig(env) {
  const base = clean(env.KVK_API_BASE) || DEFAULT_KVK_API_BASE;
  const apiKey = clean(env.KVK_API_KEY) || (base.includes("/test/") ? KVK_TEST_API_KEY : "");
  return { base: base.replace(/\/$/, ""), apiKey };
}

async function fetchBasisprofiel(env, kvkNumber) {
  const { base, apiKey } = getKvkConfig(env);
  if (!apiKey) {
    throw new Error(
      "Missing KVK_API_KEY in Worker secrets. Run: npx wrangler secret put KVK_API_KEY"
    );
  }
  const url = `${base}/basisprofielen/${encodeURIComponent(kvkNumber)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      apikey: apiKey,
      Accept: "application/json",
    },
  });
  if (res.status === 404) {
    return { notFound: true };
  }
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`KVK API ${res.status}: ${text.slice(0, 400)}`);
  }
  try {
    return { profile: JSON.parse(text) };
  } catch {
    throw new Error("KVK API returned invalid JSON");
  }
}

export function verifyKvkProfileAgainstInput(profile, input) {
  if (isDeregistered(profile)) {
    return {
      valid: false,
      error: "Dit KVK-nummer is uitgeschreven uit het Handelsregister.",
      field: "kvkNumber",
    };
  }

  const registeredNames = collectRegisteredNames(profile);
  if (!namesMatch(input.businessName, registeredNames)) {
    return {
      valid: false,
      error:
        "De bedrijfsnaam komt niet overeen met het Handelsregister bij dit KVK-nummer.",
      field: "businessName",
    };
  }

  const kvkAddr = pickVisitingAddress(profile);
  const addrResult = addressMatches(input, kvkAddr);
  if (!addrResult.ok && !addrResult.shielded) {
    const messages = {
      postcode: "De postcode komt niet overeen met het KVK-adres.",
      plaats: "De plaats komt niet overeen met het KVK-adres.",
      straat: "De straat komt niet overeen met het KVK-adres.",
      huisnummer: "Het huisnummer komt niet overeen met het KVK-adres.",
      no_kvk_address:
        "Er is geen bezoekadres gevonden bij dit KVK-nummer; controleer je gegevens.",
    };
    return {
      valid: false,
      error: messages[addrResult.reason] || "Het adres komt niet overeen met het KVK-register.",
      field: "address",
    };
  }

  const displayName =
    registeredNames[0] || clean(profile.naam) || input.businessName;
  return {
    valid: true,
    kvkNumber: profile.kvkNummer || input.kvkNumber,
    registeredName: displayName,
    addressShielded: !!addrResult.shielded,
  };
}

import { requireAuthUser } from "./worker-auth.js";

export async function handleKvkVerify(request, env, cors = {}) {
  const logPrefix = "[kvkVerify]";
  try {
    const auth = await requireAuthUser(request, env, cors);
    if (auth.error) {
      return auth.error;
    }
    const userId = auth.userId;

    let body;
    try {
      body = await request.json();
    } catch (parseErr) {
      console.error(logPrefix, "invalid JSON", parseErr);
      return jsonKvk({ error: "Ongeldige aanvraag.", field: "body" }, 400, cors);
    }

    const kvkNumber = normalizeKvkNumber(body.kvkNumber);
    if (!kvkNumber) {
      return jsonKvk(
        {
          error: "Vul een geldig KVK-nummer in (8 cijfers).",
          field: "kvkNumber",
        },
        400,
        cors
      );
    }

    const input = {
      kvkNumber,
      businessName: clean(body.businessName),
      businessStreet: clean(body.businessStreet),
      businessHouseNumber: clean(body.businessHouseNumber),
      businessPostalCode: clean(body.businessPostalCode),
      businessCity: clean(body.businessCity),
      businessCountry: clean(body.businessCountry) || "Nederland",
    };

    if (!input.businessName) {
      return jsonKvk(
        { error: "Vul een bedrijfsnaam in.", field: "businessName" },
        400,
        cors
      );
    }

    const { base, apiKey } = getKvkConfig(env);
    if (!apiKey) {
      return jsonKvk(
        {
          error:
            "KVK-controle is niet geconfigureerd op de server (KVK_API_KEY ontbreekt).",
          field: "config",
        },
        500,
        cors
      );
    }

    console.log(logPrefix, "verify", userId, kvkNumber, base.includes("/test/"));

    const result = await fetchBasisprofiel(env, kvkNumber);
    if (result.notFound) {
      return jsonKvk(
        {
          error: "KVK-nummer niet gevonden in het Handelsregister.",
          field: "kvkNumber",
        },
        400,
        cors
      );
    }

    const verification = verifyKvkProfileAgainstInput(result.profile, input);
    if (!verification.valid) {
      return jsonKvk(
        { error: verification.error, field: verification.field },
        400,
        cors
      );
    }

    return jsonKvk(
      {
        valid: true,
        kvkNumber: verification.kvkNumber,
        registeredName: verification.registeredName,
        addressShielded: verification.addressShielded ?? false,
      },
      200,
      cors
    );
  } catch (err) {
    console.error(logPrefix, err);
    const msg =
      err instanceof Error ? err.message : "KVK-controle mislukt. Probeer het later opnieuw.";
    return jsonKvk({ error: msg, field: "server" }, 500, cors);
  }
}
