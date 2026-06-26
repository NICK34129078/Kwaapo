/**
 * App-brede legal/support configuratie.
 * TODO(juridisch): laat alle teksten reviewen vóór publieke release.
 */

export const LEGAL_DISCLAIMER =
  "Deze voorwaarden moeten vóór publieke release juridisch worden gecontroleerd en aangepast aan de definitieve bedrijfsstructuur, landen en betaalflow.";

/** Vul in vóór App Store submission. Publiceer dezelfde privacy policy op het web. */
export const PRIVACY_POLICY_WEB_URL = "[INVULLEN: https://jouwdomein.nl/privacy]";

/** Support e-mail voor App Store Connect en in-app contact. */
export const SUPPORT_EMAIL = "[INVULLEN: support@jouwdomein.nl]";

export const CURRENT_APP_TERMS_VERSION = "2026-06-25";

export type PolicyId =
  | "privacy"
  | "terms"
  | "community"
  | "marketplace"
  | "seller"
  | "prohibited"
  | "refunds"
  | "copyright"
  | "contact"
  | "account_deletion";

export type PolicyDocument = {
  id: PolicyId;
  title: string;
  version: string;
  sections: Array<{ title: string; body: string }>;
};

const privacyPolicy: PolicyDocument = {
  id: "privacy",
  title: "Privacybeleid",
  version: "2026-06-25",
  sections: [
    {
      title: "Wie wij zijn",
      body:
        "Lumen/Kwaapo is een social-media- en marketplace-app. Dit privacybeleid beschrijft welke gegevens wij verwerken wanneer je de app gebruikt. Contact: " +
        SUPPORT_EMAIL,
    },
    {
      title: "Welke gegevens we verzamelen",
      body:
        "Account: e-mailadres, wachtwoord (via Supabase Auth, niet leesbaar voor ons), gebruikers-ID.\n" +
        "Profiel: gebruikersnaam, weergavenaam, bio, profielfoto.\n" +
        "Content: video’s, foto’s, captions, hashtags, likes, volgers, opgeslagen posts.\n" +
        "Shop: productinformatie, prijzen, voorraad, categorieën, productfoto’s.\n" +
        "Bestellingen: naam, e-mail, telefoon, bezorgadres, orderregels, betaal- en verzendstatus.\n" +
        "Verkoper: bedrijfsnaam, KVK-gegevens (via KVK API), Stripe Connect-status (geen bankgegevens in onze database).\n" +
        "Technisch: app-logs en foutdiagnostiek kunnen tijdelijk op je apparaat of in serverlogs verschijnen.",
    },
    {
      title: "Waarvoor we gegevens gebruiken",
      body:
        "Account aanmaken en beveiligen; content tonen en personaliseren; marketplace en checkout faciliteren; seller onboarding en uitbetalingen via Stripe; moderation en veiligheid; support.",
    },
    {
      title: "Derde partijen",
      body:
        "Supabase (database, auth, storage, realtime); Stripe (betalingen en Connect); Cloudflare Workers/R2 (video-opslag en API); Expo (app-platform); KVK API (bedrijfsverificatie). Deze partijen verwerken gegevens namens ons volgens hun eigen voorwaarden.",
    },
    {
      title: "Bewaartermijn en verwijdering",
      body:
        "Profiel- en contentgegevens blijven bewaard zolang je account actief is. Je kunt accountverwijdering aanvragen in Instellingen. Order- en betalingsgegevens kunnen langer bewaard blijven voor wettelijke, fiscale en fraude-preventiedoeleinden.",
    },
    {
      title: "Jouw rechten",
      body:
        "Je kunt je gegevens inzien, corrigeren of verwijdering aanvragen via Instellingen → Contact & support. Wettelijke rechten (AVG/GDPR) blijven van toepassing.",
    },
    {
      title: "Beveiliging",
      body:
        "We gebruiken Row Level Security in Supabase, server-side betalingsvalidatie, en scheiden gevoelige sleutels van de app. Geen systeem is 100% veilig; meld incidenten via " +
        SUPPORT_EMAIL,
    },
  ],
};

const termsOfUse: PolicyDocument = {
  id: "terms",
  title: "Gebruikersvoorwaarden",
  version: CURRENT_APP_TERMS_VERSION,
  sections: [
    {
      title: "Acceptatie",
      body:
        "Door Lumen/Kwaapo te gebruiken ga je akkoord met deze voorwaarden en ons privacybeleid. Je moet minimaal 16 jaar zijn of toestemming van een ouder/verzorger hebben waar wettelijk vereist.",
    },
    {
      title: "Je account",
      body:
        "Je bent verantwoordelijk voor je inloggegevens en activiteit op je account. Geef geen valse identiteit op. Misbruik, spam en illegale activiteit zijn verboden.",
    },
    {
      title: "User-generated content",
      body:
        "Je behoudt rechten op content die je plaatst, maar verleent ons een licentie om die content te hosten, tonen en distribueren binnen de app. Je garandeert dat je de rechten hebt om content te plaatsen.",
    },
    {
      title: "Marketplace",
      body:
        "Het platform faciliteert de marketplace en betaling tussen kopers en verkopers. Verkopers blijven verantwoordelijk voor juistheid van listings, verpakking en verzending. Wettelijke consumentenrechten blijven van toepassing.",
    },
    {
      title: "Moderatie",
      body:
        "We kunnen content verwijderen, accounts beperken of schorsen bij schending van onze community guidelines, prohibited items policy of wetgeving.",
    },
    {
      title: "Aansprakelijkheid",
      body:
        "De app wordt geleverd ‘as is’. We streven naar betrouwbaarheid maar garanderen geen ononderbroken beschikbaarheid. Onze aansprakelijkheid is beperkt voor zover wettelijk toegestaan.",
    },
  ],
};

const communityGuidelines: PolicyDocument = {
  id: "community",
  title: "Community Guidelines",
  version: "2026-06-25",
  sections: [
    {
      title: "Respectvol gedrag",
      body:
        "Geen pesten, intimidatie, haat, bedreigingen of doxxing. Behandel anderen zoals je zelf behandeld wilt worden.",
    },
    {
      title: "Veilige content",
      body:
        "Geen pornografie, seksuele content met minderjarigen, geweld, zelfbeschadiging, illegale activiteiten of gevaarlijke uitdagingen.",
    },
    {
      title: "Eerlijkheid",
      body:
        "Geen spam, scams, misleidende claims, nep-engagement of impersonatie van anderen of merken.",
    },
    {
      title: "Melden en blokkeren",
      body:
        "Gebruik ‘Melden’ op posts of producten en ‘Blokkeer’ op profielen. We beoordelen meldingen en nemen passende maatregelen.",
    },
  ],
};

const marketplaceTerms: PolicyDocument = {
  id: "marketplace",
  title: "Marketplace-voorwaarden",
  version: "2026-06-25",
  sections: [
    {
      title: "Rol van het platform",
      body:
        "Het platform faciliteert de marketplace en betaling. De verkoper blijft verantwoordelijk voor de juistheid van zijn listing, verpakking en verzending. Wettelijke rechten van consumenten en gebruikers blijven altijd van toepassing.",
    },
    {
      title: "Kopers",
      body:
        "Controleer productinformatie, verkoper en prijs vóór aankoop. Betaal alleen via de in-app checkout (Stripe). Deel geen betaalgegevens buiten de app.",
    },
    {
      title: "Verkopers",
      body:
        "Alleen geverifieerde verkopers met geaccepteerde seller-voorwaarden mogen actieve listings publiceren. Verstuur het juiste product naar het juiste adres.",
    },
    {
      title: "Fraude en verboden items",
      body:
        "Meld frauduleuze, verboden of misleidende listings via ‘Rapporteer product’. We kunnen listings verwijderen en accounts schorsen.",
    },
    {
      title: "Disputes",
      body:
        "Geschillen over levering of productkwaliteit worden vooralsnog via support afgehandeld (" +
        SUPPORT_EMAIL +
        "). Een volledig dispute center kan later worden toegevoegd.",
    },
  ],
};

const prohibitedItems: PolicyDocument = {
  id: "prohibited",
  title: "Verboden producten",
  version: "2026-06-25",
  sections: [
    {
      title: "Niet toegestaan",
      body:
        "Wapens, munitie, explosieven; drugs, illegale middelen, tabak/nicotine waar verboden; gestolen goederen; namaak; porno of seksuele diensten; dieren/wildlife waar illegaal; persoonsgegevens van derden; bank-/identiteitsgegevens; accounts te koop; producten die lokale wetgeving schenden.",
    },
    {
      title: "Beperkt of review",
      body:
        "Mogelijk beperkte categorieën (bijv. cosmetica, voedingssupplementen) kunnen handmatige review vereisen. Het platform kan listings blokkeren of verwijderen.",
    },
    {
      title: "Melden",
      body:
        "Zie je een verboden listing? Rapporteer via de productpagina. Client-side waarschuwingen zijn hulpmiddelen, geen vervanging voor moderatie.",
    },
  ],
};

const refundPolicy: PolicyDocument = {
  id: "refunds",
  title: "Retour, annulering & disputes",
  version: "2026-06-25",
  sections: [
    {
      title: "Annulering vóór betaling",
      body:
        "Checkout die niet is afgerond brengt geen kosten in rekening. Gereserveerde voorraad wordt vrijgegeven.",
    },
    {
      title: "Na betaling",
      body:
        "Retourzendingen en refunds worden case-by-case afgehandeld via support. Wettelijke herroepingsrechten voor consumenten blijven van toepassing waar van toepassing.",
    },
    {
      title: "Stripe",
      body:
        "Terugbetalingen worden verwerkt via Stripe volgens ons interne beleid en wettelijke verplichtingen.",
    },
  ],
};

const copyrightPolicy: PolicyDocument = {
  id: "copyright",
  title: "Auteursrecht & IP",
  version: "2026-06-25",
  sections: [
    {
      title: "Jouw content",
      body:
        "Plaats geen content waarvan je de rechten niet bezit. Muziek in reels moet van jou zijn of via onze bibliotheek beschikbaar.",
    },
    {
      title: "Inbreuk melden",
      body:
        "Meld auteursrecht- of merkinbreuk via support (" +
        SUPPORT_EMAIL +
        ") met bewijs van rechthebbendom en URL/ID van de content.",
    },
  ],
};

const contactPolicy: PolicyDocument = {
  id: "contact",
  title: "Contact & support",
  version: "2026-06-25",
  sections: [
    {
      title: "Support",
      body:
        "E-mail: " +
        SUPPORT_EMAIL +
        "\n\nVoor privacyverzoeken, accountverwijdering, data-export of disputes: vermeld je gebruikersnaam en het e-mailadres van je account.",
    },
    {
      title: "Dataverzoeken",
      body:
        "Vraag je gegevens op, correctie of verwijdering via Instellingen → Account verwijderen of mail ons. We reageren binnen redelijke termijn volgens AVG.",
    },
  ],
};

const accountDeletionPolicy: PolicyDocument = {
  id: "account_deletion",
  title: "Account verwijderen",
  version: "2026-06-25",
  sections: [
    {
      title: "Hoe verwijderen",
      body:
        "Ga naar Profiel → Instellingen → Account verwijderen. Bevestig in de modal. Je wordt uitgelogd na de aanvraag.",
    },
    {
      title: "Wat gebeurt er",
      body:
        "Profiel wordt geanonimiseerd, posts worden verborgen, producten gedeactiveerd. Auth-account wordt binnen onze verwerkingstermijn verwijderd.",
    },
    {
      title: "Wat we kunnen bewaren",
      body:
        "Order-, betalings- en fiscale gegevens kunnen wettelijk verplicht bewaard blijven. Deze gegevens zijn niet meer publiek gekoppeld aan je profiel.",
    },
  ],
};

export const APP_POLICIES: Record<PolicyId, PolicyDocument> = {
  privacy: privacyPolicy,
  terms: termsOfUse,
  community: communityGuidelines,
  marketplace: marketplaceTerms,
  seller: {
    id: "seller",
    title: "Seller-voorwaarden",
    version: "2026-06-26",
    sections: [],
  },
  prohibited: prohibitedItems,
  refunds: refundPolicy,
  copyright: copyrightPolicy,
  contact: contactPolicy,
  account_deletion: accountDeletionPolicy,
};

export function getPolicyById(id: PolicyId): PolicyDocument {
  return APP_POLICIES[id];
}

export const SETTINGS_LEGAL_LINKS: Array<{
  label: string;
  policyId: PolicyId;
}> = [
  { label: "Privacybeleid", policyId: "privacy" },
  { label: "Gebruikersvoorwaarden", policyId: "terms" },
  { label: "Community Guidelines", policyId: "community" },
  { label: "Marketplace-voorwaarden", policyId: "marketplace" },
  { label: "Seller-voorwaarden", policyId: "seller" },
  { label: "Verboden producten", policyId: "prohibited" },
  { label: "Retour & disputes", policyId: "refunds" },
  { label: "Auteursrecht", policyId: "copyright" },
  { label: "Account verwijderen", policyId: "account_deletion" },
];
