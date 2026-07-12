import {
  LEGAL_PLACEHOLDERS,
  RETENTION_PLACEHOLDERS,
} from "./legalPlaceholders";
import type { TermsBlock } from "./termsOfUseContent";

export type PrivacyBlock = TermsBlock;

export type PrivacyChapter = {
  id: string;
  number: number;
  title: string;
  blocks: PrivacyBlock[];
};

const P = LEGAL_PLACEHOLDERS;
const R = RETENTION_PLACEHOLDERS;

export const PRIVACY_SUMMARY_POINTS: string[] = [
  "Wij gebruiken gegevens om Kwaapo te laten werken: account, feed, shop en betalingen.",
  "Wij gebruiken interacties en kijkgedrag om jouw feed relevanter te maken.",
  "Wij verkopen jouw persoonsgegevens niet aan derden.",
  "Je kunt je gegevens bekijken, corrigeren en verwijdering aanvragen.",
  "Je kunt je account verwijderen via Instellingen → Account verwijderen.",
  "Voor betalingen werken wij met Stripe; Kwaapo slaat geen volledige kaartnummers op.",
];

export const PRIVACY_DEVELOPER_JURIST_NOTE =
  "Ontwikkelaarsnotitie: deze privacyverklaring is opgesteld op basis van de actuele Kwaapo-codebase en moet vóór publicatie in de App Store en op het web juridisch worden gecontroleerd en aangevuld met definitieve bedrijfsgegevens, bewaartermijnen en contractuele waarborgen voor internationale doorgifte.";

export const REQUIRED_PRIVACY_SECTION_IDS: readonly string[] = [
  "controller",
  "scope",
  "data",
  "purposes",
  "legal-bases",
  "personalization",
  "visibility",
  "minors",
  "sharing",
  "transfers",
  "retention",
  "deletion",
  "rights",
  "supervisory",
  "security",
  "breaches",
  "tracking",
  "notifications",
  "marketplace",
  "moderation",
  "automated",
  "from-others",
  "cookies",
  "changes",
  "contact",
];

export const PRIVACY_RETENTION_ROWS: Array<{
  category: string;
  period: string;
  note: string;
}> = [
  {
    category: "Account- en profielgegevens (actief account)",
    period: R.ACCOUNT_ACTIVE,
    note: "Zolang je account actief is en je niet om verwijdering vraagt.",
  },
  {
    category: "Verwijderde of geanonimiseerde accounts",
    period: R.DELETED_ACCOUNT,
    note: "Na accountverwijdering; auth-login volgt in verwerkingstermijn.",
  },
  {
    category: "Posts, video's en thumbnails",
    period: R.POSTS_MEDIA,
    note: "Bij verwijdering worden posts gemarkeerd als verwijderd; media in R2 kan apart worden opgeschoond.",
  },
  {
    category: "Reacties, likes, saves, follows",
    period: R.INTERACTIONS,
    note: "Gekoppeld aan account of content; kan anonimiseren bij verwijdering.",
  },
  {
    category: "Ranking-, kijk- en interessegegevens",
    period: R.RANKING,
    note: "video_views, content_interactions, tag/creator-voorkeuren.",
  },
  {
    category: "Meldingen en moderatiedossiers",
    period: R.REPORTS,
    note: "Bewijs bij veiligheid en naleving kan langer nodig zijn.",
  },
  {
    category: "Support- en contactberichten",
    period: R.SUPPORT,
    note: "Opgeslagen in contact_messages en verzonden via e-mailprovider.",
  },
  {
    category: "Beveiligings- en serverlogs",
    period: R.SECURITY_LOGS,
    note: "Cloudflare Worker-logs en beveiligingsgebeurtenissen.",
  },
  {
    category: "Marketplace-producten",
    period: R.POSTS_MEDIA,
    note: "Actieve producten worden gedeactiveerd bij accountverwijdering.",
  },
  {
    category: "Betaalde orders en ordercommunicatie",
    period: R.ORDERS,
    note: "Gedeeld tussen koper en verkoper voor fulfillment.",
  },
  {
    category: "Fiscale en wettelijke administratie",
    period: R.FISCAL,
    note: "Order- en uitbetalingsgegevens waar de wet dit vereist.",
  },
  {
    category: "Stripe-referenties en disputes",
    period: R.STRIPE,
    note: "Checkout-sessies, Connect-accounts, refunds — beheerd door Stripe.",
  },
  {
    category: "Back-ups",
    period: R.BACKUPS,
    note: "Kunnen verwijderde gegevens tijdelijk bevatten tot rotatie.",
  },
];

export const PRIVACY_CHAPTERS: PrivacyChapter[] = [
  {
    id: "controller",
    number: 1,
    title: "Wie is verantwoordelijk?",
    blocks: [
      {
        type: "paragraph",
        text: `Voor de verwerking van persoonsgegevens via de Kwaapo-app en bijbehorende diensten is ${P.LEGAL_NAME} (handelsnaam: ${P.TRADE_NAME}) de verwerkingsverantwoordelijke, tenzij hieronder anders staat vermeld.`,
      },
      {
        type: "bullets",
        items: [
          `KvK-nummer: ${P.KVK}`,
          `Vestigingsadres: ${P.ADDRESS}`,
          `Privacycontact: ${P.PRIVACY_EMAIL}`,
          `Algemeen contact: ${P.CONTACT_EMAIL}`,
          `Functionaris Gegevensbescherming (indien van toepassing): ${P.DPO}`,
          `EU-vertegenwoordiger (indien van toepassing): ${P.EU_REPRESENTATIVE}`,
        ],
      },
      {
        type: "paragraph",
        text: "Kwaapo is zelf verantwoordelijk voor het beheer van accounts, profielen, content, sociale interacties, feed-personalisatie, marketplace-functionaliteit, moderatie, support en de technische infrastructuur die wij inzetten (waaronder Supabase, Cloudflare Workers/R2 en integraties met Stripe).",
      },
      {
        type: "paragraph",
        text: "Wanneer je als verkoper via Kwaapo producten verkoopt, ben jij in beginsel zelf verwerkingsverantwoordelijke voor de persoonsgegevens van kopers die je nodig hebt om een bestelling te verzenden (zoals naam en afleveradres). Kwaapo verwerkt die gegevens mede om de transactie te faciliteren, fraude te voorkomen en geschillen af te handelen.",
      },
    ],
  },
  {
    id: "scope",
    number: 2,
    title: "Voor wie geldt dit privacybeleid?",
    blocks: [
      {
        type: "paragraph",
        text: "Dit privacybeleid geldt voor iedereen die met Kwaapo in aanraking komt en van wie wij persoonsgegevens verwerken, waaronder:",
      },
      {
        type: "bullets",
        items: [
          "gebruikers met een Kwaapo-account;",
          "bezoekers van een eventuele Kwaapo-webpagina of webpreview;",
          "kopers in de marketplace;",
          "verkopers en zakelijke accounts;",
          "personen die in content van gebruikers voorkomen (bijvoorbeeld in video's of reacties);",
          "personen die contact opnemen met support of een privacyverzoek indienen;",
          "personen zonder account van wie gegevens indirect via een gebruiker worden aangeleverd (bijvoorbeeld een verzendadres dat een koper invult).",
        ],
      },
      {
        type: "notice",
        title: "Versie en ingang",
        body: `Laatst bijgewerkt: ${P.EFFECTIVE_DATE}. Versie: ${P.VERSION}.`,
      },
    ],
  },
  {
    id: "data",
    number: 3,
    title: "Welke persoonsgegevens verzamelen wij?",
    blocks: [
      {
        type: "paragraph",
        text: "Hieronder beschrijven wij concreet welke categorieën persoonsgegevens Kwaapo verwerkt op basis van de huidige app. Wij verzamelen alleen gegevens die nodig zijn voor de functies die je gebruikt.",
      },
      {
        type: "subsection",
        title: "A. Account- en profielgegevens",
        paragraphs: [
          "Via Supabase Authentication en het profiel in onze database verwerken wij onder meer:",
        ],
        bullets: [
          "gebruikers-ID (UUID);",
          "e-mailadres;",
          "wachtwoord — opgeslagen als hash door Supabase Auth; Kwaapo kan je wachtwoord niet lezen;",
          "gebruikersnaam (username);",
          "profielnaam (display_name);",
          "profielfoto (avatar_url);",
          "bio;",
          "accountstatus en account_deletion_status;",
          "privacy-instelling (is_private voor een privéaccount);",
          "verificatie- en onboardingstatus voor verkopers;",
          "taal- en voorkeurinstellingen in de app;",
          "acceptatie van gebruikersvoorwaarden (versie en tijdstip).",
        ],
      },
      {
        type: "subsection",
        title: "B. Content en communicatie",
        paragraphs: ["Wanneer je content plaatst of communiceert, verwerken wij onder meer:"],
        bullets: [
          "video's en afbeeldingen die je uploadt;",
          "thumbnails;",
          "captions en hashtags;",
          "reacties op posts;",
          "likes;",
          "shares en opgeslagen posts (saves);",
          "in-app meldingen en activiteit;",
          "rapportages van content of gebruikers;",
          "berichten via het contact- en helpdeskformulier;",
          "optionele Spotify-trackmetadata als je geluid kiest bij een upload.",
        ],
      },
      {
        type: "subsection",
        title: "C. Sociale gegevens",
        paragraphs: ["Voor sociale functies verwerken wij:"],
        bullets: [
          "volgers en accounts die jij volgt (follows);",
          "volgverzoeken bij privéaccounts (follow_requests);",
          "blokkades (user_blocks);",
          "gemute of niet-geïnteresseerd ingestelde content of creators;",
          "interacties met andere gebruikers (likes, reacties, follows).",
        ],
      },
      {
        type: "subsection",
        title: "D. Kijk- en gebruiksgedrag",
        paragraphs: [
          "Om de feed te personaliseren verwerken en afleiden wij gegevens over hoe je Kwaapo gebruikt. Dit omvat onder meer:",
        ],
        bullets: [
          "bekeken posts en video's (video_views);",
          "kijktijd (watch_ms);",
          "likes, reacties, saves en follows;",
          "niet-geïnteresseerd-acties;",
          "content-interacties (content_interactions);",
          "tag- en creator-voorkeuren (user_tag_preferences, user_creator_preferences);",
          "creator-affinity scores afgeleid uit gedrag;",
          "volgorde van aanbevolen content in je feed.",
        ],
      },
      {
        type: "notice",
        title: "Afgeleide gegevens",
        body: "Sommige interesse- en rankinggegevens worden niet direct door jou ingevuld, maar afgeleid uit je gedrag in de app. Dit helpt ons om content te rangschikken — het is geen oordeel over jou als persoon.",
      },
      {
        type: "subsection",
        title: "E. Marketplacegegevens",
        paragraphs: ["Als verkoper of koper verwerken wij onder meer:"],
        bullets: [
          "producttitel, beschrijving, prijs, maat, merk en staat;",
          "productfoto's;",
          "voorraad en verkoopstatus;",
          "winkel- en verkopersprofiel;",
          "favorieten en winkelinteracties.",
        ],
      },
      {
        type: "subsection",
        title: "F. Bestel- en verzendgegevens",
        paragraphs: ["Bij een aankoop verwerken wij:"],
        bullets: [
          "koper- en verkoper-ID;",
          "ordernummer en orderregels;",
          "aankoopprijs en platformkosten;",
          "betaal- en verzendstatus;",
          "afleveradres en contactgegevens die je invult voor verzending;",
          "trackinginformatie indien door verkoper verstrekt;",
          "geschillen, refunds en ordercommunicatie.",
        ],
      },
      {
        type: "subsection",
        title: "G. Betaalgegevens",
        paragraphs: [
          "Betalingen worden verwerkt door Stripe. Kwaapo ontvangt geen volledige creditcardnummers of CVC-codes. Wij verwerken wel:",
        ],
        bullets: [
          "Stripe Checkout-sessiereferenties;",
          "betaalstatus en orderkoppeling;",
          "Stripe Connect-accountstatus voor verkopers;",
          "KVK- en bedrijfsgegevens voor verkopersverificatie;",
          "uitbetalingsstatus, refunds, chargebacks en fraudesignalen via Stripe.",
        ],
      },
      {
        type: "subsection",
        title: "H. Technische gegevens",
        paragraphs: ["Voor werking en beveiliging verwerken wij technische gegevens zoals:"],
        bullets: [
          "IP-adres in serverrequests naar onze Cloudflare Workers;",
          "apparaatmodel en besturingssysteem (via Expo/React Native);",
          "appversie;",
          "taal en tijdzone;",
          "sessie- en authenticatietokens;",
          "push token (Expo push token) indien je push toestaat;",
          "fout- en beveiligingslogs;",
          "request identifiers in worker-logs.",
        ],
      },
      {
        type: "subsection",
        title: "I. Camera, foto's en microfoon",
        paragraphs: [
          "Kwaapo vraagt toegang tot camera, fotobibliotheek en microfoon wanneer je content wilt opnemen of uploaden. Je kiest zelf wat je uploadt. Media wordt via onze Cloudflare Worker naar R2-opslag geüpload. Je kunt toestemming op iOS en Android intrekken via je apparaatinstellingen; zonder toestemming kun je geen nieuwe foto's of video's via die bron uploaden.",
        ],
      },
      {
        type: "subsection",
        title: "J. Locatiegegevens",
        paragraphs: [
          "Kwaapo vraagt geen GPS-locatie in de app. Wel kan een globale regio worden afgeleid uit je IP-adres of handmatig door jou ingevoerde adresgegevens bij checkout of verkopersregistratie.",
        ],
      },
      {
        type: "subsection",
        title: "K. Gegevens van verkopers en bedrijven",
        paragraphs: ["Voor verkopers verwerken wij aanvullend:"],
        bullets: [
          "bedrijfsnaam en contactgegevens;",
          "adres;",
          "KvK-gegevens via de KVK API;",
          "Stripe Connect onboardingstatus;",
          "seller status en verkoopvoorwaarden-acceptatie.",
        ],
      },
      {
        type: "subsection",
        title: "L. Moderatie- en veiligheidsgegevens",
        paragraphs: ["Bij meldingen en handhaving verwerken wij:"],
        bullets: [
          "inhoud van meldingen (post_reports, moderation_reports);",
          "onderzochte content en communicatie;",
          "overtredingen, waarschuwingen en blokkades;",
          "verwijderde content en bewijsstukken;",
          "veiligheids- en frauderisico-indicatoren.",
        ],
      },
    ],
  },
  {
    id: "purposes",
    number: 4,
    title: "Waarom gebruiken wij deze gegevens?",
    blocks: [
      {
        type: "paragraph",
        text: "Wij gebruiken persoonsgegevens alleen voor onderstaande doelen. Per doel geven we aan welke categorieën uit hoofdstuk 3 betrokken zijn.",
      },
      {
        type: "numbered",
        items: [
          "Account aanmaken en beveiligen — A, H.",
          "Profiel tonen en beheren — A, C.",
          "Content uploaden, opslaan en afspelen — B, I; opslag via Cloudflare R2.",
          "Sociale functies uitvoeren (volgen, liken, reageren, delen, opslaan) — B, C.",
          "Feed personaliseren en aanbevelingen rangschikken — D.",
          "Zoekresultaten en shop-aanbevelingen verbeteren — D, E.",
          "Marketplace laten werken — E, F.",
          "Betalingen en uitbetalingen verwerken via Stripe — F, G, K.",
          "Orders en verzending faciliteren — F; gegevens gedeeld met verkoper/koper.",
          "Klantenservice leveren — B (contactberichten), F.",
          "Fraude en misbruik voorkomen — G, H, L.",
          "Content modereren en communityveiligheid — B, L.",
          "Wetgeving naleven — F, G, K.",
          "App-prestaties en fouten analyseren — H (beperkt tot console/feed-observability in de app).",
          "Meldingen versturen (push en in-app) — B, H.",
          "Geschillen, refunds en chargebacks afhandelen — F, G.",
          "Rechten van gebruikers uitvoeren — alle relevante categorieën.",
          "Communicatie over belangrijke wijzigingen — A.",
          "Bewijs bewaren bij fraude, klachten of juridische procedures — L, F, G.",
        ],
      },
    ],
  },
  {
    id: "legal-bases",
    number: 5,
    title: "Juridische grondslagen (AVG)",
    blocks: [
      {
        type: "paragraph",
        text: "Wij verwerken persoonsgegevens alleen als een wettelijke grondslag van toepassing is. Hieronder per type verwerking.",
      },
      {
        type: "subsection",
        title: "Uitvoering van een overeenkomst",
        paragraphs: [
          "Grondslag voor alles wat nodig is om Kwaapo te leveren zoals je van ons mag verwachten: account, profiel, content plaatsen, feed bekijken, kopen, verkopen, orders afhandelen en support.",
        ],
      },
      {
        type: "subsection",
        title: "Wettelijke verplichting",
        paragraphs: [
          "Voor fiscale en administratieve bewaarplichten van orders en uitbetalingen, en wanneer wij verplicht zijn te reageren op bevoegde autoriteiten.",
        ],
      },
      {
        type: "subsection",
        title: "Gerechtvaardigd belang",
        paragraphs: [
          "Voor feed-personalisatie, beveiliging, fraudepreventie, moderatie en beperkte technische logging. Ons belang: een veilige, werkende en relevante app. Wij wegen dit af tegen jouw privacyrechten. Je kunt bezwaar maken via",
          `${P.PRIVACY_EMAIL} (zie hoofdstuk 14).`,
        ],
      },
      {
        type: "subsection",
        title: "Toestemming",
        paragraphs: [
          "Voor pushmeldingen op je apparaat, uploads van media via camera/microfoon, en waar de wet toestemming vereist. Toestemming is vrijwillig, kan worden ingetrokken via apparaatinstellingen of app-instellingen, en heeft geen terugwerkende kracht. Zonder toestemming kunnen bepaalde functies (zoals push) niet werken.",
        ],
      },
    ],
  },
  {
    id: "personalization",
    number: 6,
    title: "Gepersonaliseerde feed en profilering",
    blocks: [
      {
        type: "paragraph",
        text: "Kwaapo gebruikt interacties en kijkgedrag om je feed relevanter te maken. Dit gebeurt via ranking in onze database (RPC's zoals get_personalized_feed) en aanvullende signalen in de app.",
      },
      {
        type: "bullets",
        items: [
          "Signalen: kijktijd, likes, saves, follows, reacties, niet-geïnteresseerd, tag- en creator-voorkeuren.",
          "Doel: volgorde van posts bepalen en creators spreiden — geen juridisch of financieel besluit over jou.",
          "Aanbevelingen kunnen veranderen naarmate je gedrag verandert.",
          "Blokkades, mutes en privéaccounts beperken wat zichtbaar en rankbaar is.",
          "Recently viewed en creator-affinity worden gebruikt om herhaling te verminderen en interesses te verfijnen.",
        ],
      },
      {
        type: "paragraph",
        text: "Deze profilering heeft geen juridische of vergelijkbare ingrijpende gevolgen in de zin van artikel 22 AVG: het bepaalt alleen welke content je waarschijnlijk eerder ziet. Je kunt je gedrag beïnvloeden door content te liken, te volgen, niet-geïnteresseerd te kiezen of accounts te blokkeren. Een aparte 'reset interesses'-knop is op dit moment niet beschikbaar in de app.",
      },
    ],
  },
  {
    id: "visibility",
    number: 7,
    title: "Zichtbaarheid van content en profielen",
    blocks: [
      {
        type: "bullets",
        items: [
          "Openbare profielen: username, display_name, bio, avatar en posts zijn zichtbaar voor andere gebruikers.",
          "Privéaccounts (is_private): alleen goedgekeurde volgers zien je posts.",
          "Likes, reacties en volgersaantallen kunnen zichtbaar zijn afhankelijk van de context in de app.",
          "Openbare content kan buiten Kwaapo worden bekeken, gedeeld of vastgelegd door anderen.",
          "Verwijdering op Kwaapo verwijdert niet automatisch kopieën die anderen hebben gemaakt.",
          "E-mailadres, betaalgegevens, verzendadres en interne ID's zijn niet openbaar.",
        ],
      },
      {
        type: "paragraph",
        text: "Je kunt je profiel bewerken in de app en privacy-instellingen zoals een privéaccount aanpassen waar die functie beschikbaar is.",
      },
    ],
  },
  {
    id: "minors",
    number: 8,
    title: "Minderjarigen",
    blocks: [
      {
        type: "paragraph",
        text: "Kwaapo is bedoeld voor gebruikers van 16 jaar en ouder. Bij registratie moet je bevestigen dat je minimaal 16 bent. Wij voeren op dit moment geen aparte leeftijdsverificatie met identiteitsbewijs uit.",
      },
      {
        type: "bullets",
        items: [
          "Je mag je leeftijd niet vervalsen.",
          "Als wij ontdekken dat een account onder de 16 is, kunnen wij het beperken of verwijderen.",
          "Ouders of wettelijke vertegenwoordigers kunnen contact opnemen via " + P.PRIVACY_EMAIL + ".",
          "Waar toestemming de grondslag is, is toestemming van een ouder nodig voor kinderen onder 16.",
          "Kwaapo beoogt geen opzettelijke verwerking van accounts onder de minimumleeftijd.",
        ],
      },
    ],
  },
  {
    id: "sharing",
    number: 9,
    title: "Met wie delen wij gegevens?",
    blocks: [
      {
        type: "paragraph",
        text: "Wij verkopen je persoonsgegevens niet. Wij delen gegevens alleen met onderstaande categorieën ontvangers, voor zover nodig voor de dienst.",
      },
      {
        type: "subsection",
        title: "Supabase",
        paragraphs: [
          "Database, authenticatie, Realtime, Edge Functions. Gegevens: vrijwel alle app-categorieën. Verwerker. Privacy: supabase.com/privacy",
        ],
      },
      {
        type: "subsection",
        title: "Cloudflare (Workers en R2)",
        paragraphs: [
          "Video-uploads, API, media-opslag. Gegevens: content, technische metadata, IP. Verwerker. Privacy: cloudflare.com/privacypolicy",
        ],
      },
      {
        type: "subsection",
        title: "Stripe",
        paragraphs: [
          "Checkout en Connect voor verkopers. Gegevens: betaal- en orderreferenties, verkopersidentificatie. Zelfstandig verantwoordelijke voor betaalverwerking. Privacy: stripe.com/privacy",
        ],
      },
      {
        type: "subsection",
        title: "Expo / pushdiensten",
        paragraphs: [
          "Push tokens en notificatie-aflevering via Apple APNS en Google FCM. Verwerker. Privacy: expo.dev/privacy",
        ],
      },
      {
        type: "subsection",
        title: "Resend",
        paragraphs: [
          "E-mail voor contactformulier (Edge Function send-contact-message). Gegevens: e-mail, berichtinhoud. Verwerker.",
        ],
      },
      {
        type: "subsection",
        title: "KVK API",
        paragraphs: [
          "Verificatie van bedrijfsgegevens van verkopers. Gegevens: KvK-nummer en bedrijfsnaam. Verwerker / overheidsbron.",
        ],
      },
      {
        type: "subsection",
        title: "Spotify Web API",
        paragraphs: [
          "Zoeken en koppelen van geluid bij uploads. Gegevens: trackmetadata, geen Spotify-account van jou. Verwerker.",
        ],
      },
      {
        type: "subsection",
        title: "Apple en Google",
        paragraphs: [
          "App-distributie en push-infrastructuur. Geen Google Sign-In of Apple Sign In geconfigureerd in de huidige app.",
        ],
      },
      {
        type: "subsection",
        title: "Andere gebruikers",
        paragraphs: [
          "Kopers en verkopers zien order- en verzendgegevens die nodig zijn voor de transactie. Verkopers kunnen zelfstandig verwerkingsverantwoordelijke zijn voor aflevering.",
        ],
      },
      {
        type: "subsection",
        title: "Bevoegde autoriteiten",
        paragraphs: [
          "Alleen wanneer de wet dit vereist of ter bescherming van rechten en veiligheid.",
        ],
      },
    ],
  },
  {
    id: "transfers",
    number: 10,
    title: "Internationale doorgifte",
    blocks: [
      {
        type: "paragraph",
        text: "Sommige leveranciers verwerken gegevens buiten de Europese Economische Ruimte (EER), waaronder Cloudflare, Stripe, Supabase en Resend. Wij zorgen voor passende waarborgen zoals standaardcontractbepalingen (SCC's), adequaatheidsbesluiten waar van toepassing, en aanvullende technische maatregelen.",
      },
      {
        type: "paragraph",
        text: `Een kopie van relevante waarborgen kun je opvragen via ${P.PRIVACY_EMAIL}. Definitieve contractuele details moeten nog worden ingevuld na juridische review.`,
      },
    ],
  },
  {
    id: "retention",
    number: 11,
    title: "Hoe lang bewaren wij gegevens?",
    blocks: [
      {
        type: "paragraph",
        text: "Wij bewaren gegevens niet langer dan nodig, behalve wanneer de wet of beveiligingsbelangen langere bewaaring vereisen. Onderstaande termijnen zijn placeholders tot definitieve juridische/fiscale afstemming.",
      },
      {
        type: "notice",
        title: "Bewaartermijnentabel",
        body: "Zie de tabel op deze pagina voor categorieën en termijnen.",
      },
      {
        type: "paragraph",
        text: "Gegevens kunnen eerder worden verwijderd of geanonimiseerd wanneer ze niet meer nodig zijn, bijvoorbeeld na een geslaagd privacyverzoek of accountverwijdering, met uitzondering van gegevens die wij wettelijk moeten bewaren.",
      },
    ],
  },
  {
    id: "deletion",
    number: 12,
    title: "Account verwijderen",
    blocks: [
      {
        type: "paragraph",
        text: "Je kunt accountverwijdering starten via Instellingen → Account verwijderen in de app. Dit roept de functie request_account_deletion aan.",
      },
      {
        type: "numbered",
        items: [
          "Je profiel wordt direct verborgen en geanonimiseerd (username, display_name, bio, avatar).",
          "Posts worden gemarkeerd als verwijderd (is_deleted).",
          "Actieve producten worden gedeactiveerd.",
          "Je wordt uitgelogd; inloggen met hetzelfde account werkt niet meer zodra auth is verwijderd.",
          "Je auth-account (login) wordt verwijderd binnen onze verwerkingstermijn — dit is nog niet altijd direct bij de knop.",
          "Order- en betalingsgegevens kunnen bewaard blijven voor wettelijke en geschil-doeleinden, losgekoppeld van je profiel.",
          "Stripe Connect-accounts van verkopers moeten apart worden afgehandeld volgens Stripe-regels.",
          "Openstaande orders, refunds of geschillen kunnen afhandeling vertragen.",
          "Hetzelfde e-mailadres kun je later eventueel opnieuw gebruiken voor een nieuw account.",
        ],
      },
    ],
  },
  {
    id: "rights",
    number: 13,
    title: "Jouw privacyrechten",
    blocks: [
      {
        type: "paragraph",
        text: "Onder de AVG heb je de volgende rechten. Wij reageren in beginsel binnen één maand; complexe verzoeken kunnen met twee maanden worden verlengd met uitleg.",
      },
      {
        type: "bullets",
        items: [
          "Recht op informatie en inzage — welke gegevens wij van je hebben.",
          "Recht op rectificatie — onjuiste profielgegevens corrigeren in de app of via verzoek.",
          "Recht op verwijdering — account verwijderen of gericht verzoek.",
          "Recht op beperking — tijdelijk minder verwerken.",
          "Recht op dataportabiliteit — export waar technisch mogelijk (nu via verzoek, geen automatische exportknop).",
          "Recht van bezwaar — tegen verwerking op basis van gerechtvaardigd belang.",
          "Recht om toestemming in te trekken — voor push en media-toegang.",
          "Rechten rond geautomatiseerde besluitvorming — zie hoofdstuk 22.",
          "Klacht bij de Autoriteit Persoonsgegevens — zie hoofdstuk 14.",
        ],
      },
      {
        type: "paragraph",
        text: `Dien verzoeken in via ${P.PRIVACY_EMAIL} of Instellingen → Contact & support. Wij kunnen redelijke identificatie vragen. Verzoeken zijn in beginsel kosteloos; misbruik of excessieve verzoeken kunnen worden geweigerd of belast conform de AVG.`,
      },
    ],
  },
  {
    id: "supervisory",
    number: 14,
    title: "Klacht bij de toezichthouder",
    blocks: [
      {
        type: "paragraph",
        text: "Je hebt het recht een klacht in te dienen bij de Autoriteit Persoonsgegevens (AP). Je mag eerst contact met ons opnemen, maar dat is niet verplicht voordat je naar de AP stapt.",
      },
      {
        type: "bullets",
        items: [
          "Autoriteit Persoonsgegevens",
          "Website: autoriteitpersoonsgegevens.nl",
          "Postadres: Postbus 93374, 2509 AJ Den Haag",
        ],
      },
    ],
  },
  {
    id: "security",
    number: 15,
    title: "Beveiliging",
    blocks: [
      {
        type: "paragraph",
        text: "Geen enkel systeem is 100% veilig, maar wij nemen passende maatregelen:",
      },
      {
        type: "bullets",
        items: [
          "Versleutelde verbindingen (HTTPS/TLS) naar API's en workers.",
          "Supabase Row Level Security (RLS) op databasetabellen.",
          "Authenticatie via Supabase Auth; workers valideren JWT's server-side.",
          "Beperkte toegang tot productiesystemen voor bevoegde medewerkers.",
          "Logging en monitoring via Cloudflare en beperkte app-diagnostiek.",
          "Back-ups via onze hostingproviders.",
          "Betalingen via PCI-compliant Stripe — geen kaartopslag bij Kwaapo.",
        ],
      },
      {
        type: "paragraph",
        text: "Jij bent zelf verantwoordelijk voor een sterk wachtwoord en het beveiligen van je apparaat.",
      },
    ],
  },
  {
    id: "breaches",
    number: 16,
    title: "Datalekken",
    blocks: [
      {
        type: "paragraph",
        text: "Bij een vermoedelijk datalek onderzoeken wij het risico, nemen passende maatregelen, melden het aan de AP wanneer de wet dat vereist, en informeren getroffen gebruikers wanneer er waarschijnlijk een hoog risico voor hun rechten is.",
      },
      {
        type: "paragraph",
        text: `Meld een mogelijk datalek via ${P.PRIVACY_EMAIL}.`,
      },
    ],
  },
  {
    id: "tracking",
    number: 17,
    title: "Tracking, analytics en Apple Privacy",
    blocks: [
      {
        type: "paragraph",
        text: "De huidige Kwaapo-app gebruikt geen advertentienetwerken, geen IDFA/ATT-tracking, geen Firebase Analytics, Sentry of vergelijkbare third-party analytics-SDK's in package.json.",
      },
      {
        type: "bullets",
        items: [
          "Feed-observability logt beperkt naar de console tijdens ontwikkeling — geen commerciële tracking.",
          "Geen cross-app tracking over websites of apps van derden.",
          "Als wij in de toekomst analytics of tracking toevoegen, passen wij dit beleid en de App Store Privacy Labels aan en vragen wij toestemming waar vereist.",
        ],
      },
    ],
  },
  {
    id: "notifications",
    number: 18,
    title: "Pushnotificaties en communicatie",
    blocks: [
      {
        type: "paragraph",
        text: "Kwaapo kan pushmeldingen sturen voor sociale activiteit, orders en verkopersupdates. Hiervoor slaan wij een Expo push token op (push_device_tokens) nadat je toestemming geeft op je apparaat.",
      },
      {
        type: "bullets",
        items: [
          "Je kunt push uitschakelen in je apparaatinstellingen of via app-voorkeuren waar beschikbaar.",
          "In-app notificaties zijn onderdeel van de dienst en vereisen een account.",
          "Serviceberichten over orders of beveiliging kunnen nodig zijn om de dienst te leveren.",
          "Wij sturen op dit moment geen aparte marketing-pushcampagnes via derde advertentienetwerken.",
          "Contactformulier-e-mails zijn transactioneel/support — geen nieuwsbrief zonder toestemming.",
        ],
      },
    ],
  },
  {
    id: "marketplace",
    number: 19,
    title: "Marketplace en koper/verkopergegevens",
    blocks: [
      {
        type: "paragraph",
        text: "Bij een bestelling ziet de verkoper de gegevens die nodig zijn om te verzenden (zoals naam en afleveradres). De koper ziet product- en verkopersinformatie. Betaalgegevens worden via Stripe verwerkt — niet rechtstreeks tussen partijen gedeeld.",
      },
      {
        type: "bullets",
        items: [
          "Verkopers worden zakelijk geverifieerd via KVK en Stripe Connect.",
          "Kwaapo bewaart ordergegevens voor fraude, refunds en geschillen.",
          "Verkopers hebben eigen AVG-verplichtingen jegens kopers voor fulfillment.",
          "Zie ook de marketplace- en seller-voorwaarden in de app.",
        ],
      },
    ],
  },
  {
    id: "moderation",
    number: 20,
    title: "Moderatie en illegale content",
    blocks: [
      {
        type: "paragraph",
        text: "Bij meldingen verwerken wij de inhoud van de melding, je user-ID en de gemelde content. Moderators (menselijk) en geautomatiseerde filters kunnen content beoordelen. Bewijs kan worden bewaard in moderatiedossiers.",
      },
      {
        type: "paragraph",
        text: "Wij kunnen informatie aan autoriteiten verstrekken wanneer de wet dat vereist. Tegen maatregelen kun je bezwaar maken via support of " + P.PRIVACY_EMAIL + ". Zie ook de communityrichtlijnen en gebruikersvoorwaarden.",
      },
    ],
  },
  {
    id: "automated",
    number: 21,
    title: "Geautomatiseerde besluitvorming",
    blocks: [
      {
        type: "paragraph",
        text: "Kwaapo gebruikt geautomatiseerde systemen om: (1) feed en aanbevelingen te rangschikken; (2) fraude- en misbruiksignalen te detecteren; (3) content te modereren. Deze beslissingen hebben geen juridische of vergelijkbare ingrijpende gevolgen zoals kredietweigering — ze bepalen contentvolgorde, zichtbaarheid of accountbeperkingen binnen het platform.",
      },
      {
        type: "paragraph",
        text: "Bij account- of contentmaatregelen kun je contact opnemen voor menselijke herbeoordeling via " + P.CONTACT_EMAIL + ".",
      },
    ],
  },
  {
    id: "from-others",
    number: 22,
    title: "Gegevens die anderen over jou aanleveren",
    blocks: [
      {
        type: "bullets",
        items: [
          "Reacties en mentions waarin jij voorkomt;",
          "Rapportages over jouw content of gedrag;",
          "Beeldmateriaal geplaatst door andere gebruikers;",
          "Verzendgegevens die een koper invult bij jou als verkoper;",
          "Gegevens die Stripe terugkoppelt over betalingen;",
          "Meldingen van mogelijke overtredingen door derden.",
        ],
      },
    ],
  },
  {
    id: "cookies",
    number: 23,
    title: "Cookies en website",
    blocks: [
      {
        type: "paragraph",
        text: `De Kwaapo-app is primair een native app. De webpreview (Expo web op poort 8082) is voor ontwikkeling en testen. Een publieke website op https://${P.WEB_DOMAIN}/privacy is gepland om dezelfde tekst te tonen als in de app.`,
      },
      {
        type: "bullets",
        items: [
          "Functionele opslag: sessie/local storage voor login en voorkeuren in webpreview.",
          "Geen advertentiecookies of third-party tracking cookies geconfigureerd.",
          "Serverlogs van hosting kunnen IP en user-agent bewaren.",
          "Bij een publieke website kan een cookiebanner nodig zijn — nog niet live.",
        ],
      },
    ],
  },
  {
    id: "changes",
    number: 24,
    title: "Wijzigingen in dit privacybeleid",
    blocks: [
      {
        type: "paragraph",
        text: "Wij kunnen dit beleid wijzigen bij nieuwe functies, wetgeving of leveranciers. Belangrijke wijzigingen communiceren wij via de app, e-mail of een melding. Datum en versienummer worden bovenaan bijgewerkt. Waar de wet nieuwe toestemming vereist, vragen wij die opnieuw. Oudere versies kun je opvragen via " + P.PRIVACY_EMAIL + ".",
      },
    ],
  },
  {
    id: "contact",
    number: 25,
    title: "Contact",
    blocks: [
      {
        type: "bullets",
        items: [
          `${P.LEGAL_NAME} (${P.TRADE_NAME})`,
          `${P.ADDRESS}`,
          `KvK: ${P.KVK}`,
          `Privacy: ${P.PRIVACY_EMAIL}`,
          `Contact: ${P.CONTACT_EMAIL}`,
          `Klachten: ${P.COMPLAINTS_EMAIL}`,
          `FG/DPO: ${P.DPO}`,
        ],
      },
      {
        type: "paragraph",
        text: "Gebruik de knoppen onderaan deze pagina voor contact, privacyverzoeken, accountverwijdering en gerelateerde documenten.",
      },
    ],
  },
];

export function getPrivacyTocItems(): Array<{ id: string; title: string; number: number }> {
  return PRIVACY_CHAPTERS.map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    number: chapter.number,
  }));
}

function collectTextFromBlock(block: PrivacyBlock): string[] {
  switch (block.type) {
    case "paragraph":
      return [block.text];
    case "subsection":
      return [block.title, ...block.paragraphs, ...(block.bullets ?? [])];
    case "numbered":
    case "bullets":
      return block.items;
    case "notice":
      return [block.title, block.body];
    default:
      return [];
  }
}

export function findPrivacyPlaceholdersInContent(): string[] {
  const placeholderPattern = /\[[^\]]+\]/g;
  const allText: string[] = [...PRIVACY_SUMMARY_POINTS, PRIVACY_DEVELOPER_JURIST_NOTE];

  for (const row of PRIVACY_RETENTION_ROWS) {
    allText.push(row.category, row.period, row.note);
  }

  for (const chapter of PRIVACY_CHAPTERS) {
    allText.push(chapter.id, chapter.title);
    for (const block of chapter.blocks) {
      allText.push(...collectTextFromBlock(block));
    }
  }

  const found = new Set<string>();
  for (const text of allText) {
    const matches = text.match(placeholderPattern);
    if (!matches) {
      continue;
    }
    for (const match of matches) {
      found.add(match);
    }
  }
  return [...found].sort();
}

/** Enkele bron voor app én toekomstige webpagina https://[DOMEIN]/privacy */
export const PRIVACY_POLICY_DOCUMENT = {
  title: "Privacybeleid",
  subtitle: "Hoe Kwaapo jouw persoonsgegevens gebruikt en beschermt",
  version: P.VERSION,
  effectiveDate: P.EFFECTIVE_DATE,
  summary: PRIVACY_SUMMARY_POINTS,
  chapters: PRIVACY_CHAPTERS,
  retentionRows: PRIVACY_RETENTION_ROWS,
} as const;
