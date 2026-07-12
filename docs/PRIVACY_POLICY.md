# Privacybeleid

Hoe Kwaapo jouw persoonsgegevens gebruikt en beschermt

**Versie:** [VERSIENUMMER]  
**Laatst bijgewerkt:** [INGANGSDATUM]

## Samenvatting

- Wij gebruiken gegevens om Kwaapo te laten werken: account, feed, shop en betalingen.
- Wij gebruiken interacties en kijkgedrag om jouw feed relevanter te maken.
- Wij verkopen jouw persoonsgegevens niet aan derden.
- Je kunt je gegevens bekijken, corrigeren en verwijdering aanvragen.
- Je kunt je account verwijderen via Instellingen → Account verwijderen.
- Voor betalingen werken wij met Stripe; Kwaapo slaat geen volledige kaartnummers op.

---

## 1. Wie is verantwoordelijk?

Voor de verwerking van persoonsgegevens via de Kwaapo-app en bijbehorende diensten is [JURIDISCHE BEDRIJFSNAAM] (handelsnaam: [HANDELSNAAM]) de verwerkingsverantwoordelijke, tenzij hieronder anders staat vermeld.

- KvK-nummer: [KVK-NUMMER]
- Vestigingsadres: [VESTIGINGSADRES]
- Privacycontact: [PRIVACY-E-MAIL]
- Algemeen contact: [CONTACT-E-MAIL]
- Functionaris Gegevensbescherming (indien van toepassing): [FUNCTIONARIS GEGEVENSBESCHERMING INDIEN VAN TOEPASSING]
- EU-vertegenwoordiger (indien van toepassing): [EU-VERTEGENWOORDIGER INDIEN VAN TOEPASSING]

Kwaapo is zelf verantwoordelijk voor het beheer van accounts, profielen, content, sociale interacties, feed-personalisatie, marketplace-functionaliteit, moderatie, support en de technische infrastructuur die wij inzetten (waaronder Supabase, Cloudflare Workers/R2 en integraties met Stripe).

Wanneer je als verkoper via Kwaapo producten verkoopt, ben jij in beginsel zelf verwerkingsverantwoordelijke voor de persoonsgegevens van kopers die je nodig hebt om een bestelling te verzenden (zoals naam en afleveradres). Kwaapo verwerkt die gegevens mede om de transactie te faciliteren, fraude te voorkomen en geschillen af te handelen.

## 2. Voor wie geldt dit privacybeleid?

Dit privacybeleid geldt voor iedereen die met Kwaapo in aanraking komt en van wie wij persoonsgegevens verwerken, waaronder:

- gebruikers met een Kwaapo-account;
- bezoekers van een eventuele Kwaapo-webpagina of webpreview;
- kopers in de marketplace;
- verkopers en zakelijke accounts;
- personen die in content van gebruikers voorkomen (bijvoorbeeld in video's of reacties);
- personen die contact opnemen met support of een privacyverzoek indienen;
- personen zonder account van wie gegevens indirect via een gebruiker worden aangeleverd (bijvoorbeeld een verzendadres dat een koper invult).

**Versie en ingang:** Laatst bijgewerkt: [INGANGSDATUM]. Versie: [VERSIENUMMER].

## 3. Welke persoonsgegevens verzamelen wij?

Hieronder beschrijven wij concreet welke categorieën persoonsgegevens Kwaapo verwerkt op basis van de huidige app. Wij verzamelen alleen gegevens die nodig zijn voor de functies die je gebruikt.

### A. Account- en profielgegevens

Via Supabase Authentication en het profiel in onze database verwerken wij onder meer:

- gebruikers-ID (UUID);
- e-mailadres;
- wachtwoord — opgeslagen als hash door Supabase Auth; Kwaapo kan je wachtwoord niet lezen;
- gebruikersnaam (username);
- profielnaam (display_name);
- profielfoto (avatar_url);
- bio;
- accountstatus en account_deletion_status;
- privacy-instelling (is_private voor een privéaccount);
- verificatie- en onboardingstatus voor verkopers;
- taal- en voorkeurinstellingen in de app;
- acceptatie van gebruikersvoorwaarden (versie en tijdstip).

### B. Content en communicatie

Wanneer je content plaatst of communiceert, verwerken wij onder meer:

- video's en afbeeldingen die je uploadt;
- thumbnails;
- captions en hashtags;
- reacties op posts;
- likes;
- shares en opgeslagen posts (saves);
- in-app meldingen en activiteit;
- rapportages van content of gebruikers;
- berichten via het contact- en helpdeskformulier;
- optionele Spotify-trackmetadata als je geluid kiest bij een upload.

### C. Sociale gegevens

Voor sociale functies verwerken wij:

- volgers en accounts die jij volgt (follows);
- volgverzoeken bij privéaccounts (follow_requests);
- blokkades (user_blocks);
- gemute of niet-geïnteresseerd ingestelde content of creators;
- interacties met andere gebruikers (likes, reacties, follows).

### D. Kijk- en gebruiksgedrag

Om de feed te personaliseren verwerken en afleiden wij gegevens over hoe je Kwaapo gebruikt. Dit omvat onder meer:

- bekeken posts en video's (video_views);
- kijktijd (watch_ms);
- likes, reacties, saves en follows;
- niet-geïnteresseerd-acties;
- content-interacties (content_interactions);
- tag- en creator-voorkeuren (user_tag_preferences, user_creator_preferences);
- creator-affinity scores afgeleid uit gedrag;
- volgorde van aanbevolen content in je feed.

**Afgeleide gegevens:** Sommige interesse- en rankinggegevens worden niet direct door jou ingevuld, maar afgeleid uit je gedrag in de app. Dit helpt ons om content te rangschikken — het is geen oordeel over jou als persoon.

### E. Marketplacegegevens

Als verkoper of koper verwerken wij onder meer:

- producttitel, beschrijving, prijs, maat, merk en staat;
- productfoto's;
- voorraad en verkoopstatus;
- winkel- en verkopersprofiel;
- favorieten en winkelinteracties.

### F. Bestel- en verzendgegevens

Bij een aankoop verwerken wij:

- koper- en verkoper-ID;
- ordernummer en orderregels;
- aankoopprijs en platformkosten;
- betaal- en verzendstatus;
- afleveradres en contactgegevens die je invult voor verzending;
- trackinginformatie indien door verkoper verstrekt;
- geschillen, refunds en ordercommunicatie.

### G. Betaalgegevens

Betalingen worden verwerkt door Stripe. Kwaapo ontvangt geen volledige creditcardnummers of CVC-codes. Wij verwerken wel:

- Stripe Checkout-sessiereferenties;
- betaalstatus en orderkoppeling;
- Stripe Connect-accountstatus voor verkopers;
- KVK- en bedrijfsgegevens voor verkopersverificatie;
- uitbetalingsstatus, refunds, chargebacks en fraudesignalen via Stripe.

### H. Technische gegevens

Voor werking en beveiliging verwerken wij technische gegevens zoals:

- IP-adres in serverrequests naar onze Cloudflare Workers;
- apparaatmodel en besturingssysteem (via Expo/React Native);
- appversie;
- taal en tijdzone;
- sessie- en authenticatietokens;
- push token (Expo push token) indien je push toestaat;
- fout- en beveiligingslogs;
- request identifiers in worker-logs.

### I. Camera, foto's en microfoon

Kwaapo vraagt toegang tot camera, fotobibliotheek en microfoon wanneer je content wilt opnemen of uploaden. Je kiest zelf wat je uploadt. Media wordt via onze Cloudflare Worker naar R2-opslag geüpload. Je kunt toestemming op iOS en Android intrekken via je apparaatinstellingen; zonder toestemming kun je geen nieuwe foto's of video's via die bron uploaden.

### J. Locatiegegevens

Kwaapo vraagt geen GPS-locatie in de app. Wel kan een globale regio worden afgeleid uit je IP-adres of handmatig door jou ingevoerde adresgegevens bij checkout of verkopersregistratie.

### K. Gegevens van verkopers en bedrijven

Voor verkopers verwerken wij aanvullend:

- bedrijfsnaam en contactgegevens;
- adres;
- KvK-gegevens via de KVK API;
- Stripe Connect onboardingstatus;
- seller status en verkoopvoorwaarden-acceptatie.

### L. Moderatie- en veiligheidsgegevens

Bij meldingen en handhaving verwerken wij:

- inhoud van meldingen (post_reports, moderation_reports);
- onderzochte content en communicatie;
- overtredingen, waarschuwingen en blokkades;
- verwijderde content en bewijsstukken;
- veiligheids- en frauderisico-indicatoren.

## 4. Waarom gebruiken wij deze gegevens?

Wij gebruiken persoonsgegevens alleen voor onderstaande doelen. Per doel geven we aan welke categorieën uit hoofdstuk 3 betrokken zijn.

1. Account aanmaken en beveiligen — A, H.
2. Profiel tonen en beheren — A, C.
3. Content uploaden, opslaan en afspelen — B, I; opslag via Cloudflare R2.
4. Sociale functies uitvoeren (volgen, liken, reageren, delen, opslaan) — B, C.
5. Feed personaliseren en aanbevelingen rangschikken — D.
6. Zoekresultaten en shop-aanbevelingen verbeteren — D, E.
7. Marketplace laten werken — E, F.
8. Betalingen en uitbetalingen verwerken via Stripe — F, G, K.
9. Orders en verzending faciliteren — F; gegevens gedeeld met verkoper/koper.
10. Klantenservice leveren — B (contactberichten), F.
11. Fraude en misbruik voorkomen — G, H, L.
12. Content modereren en communityveiligheid — B, L.
13. Wetgeving naleven — F, G, K.
14. App-prestaties en fouten analyseren — H (beperkt tot console/feed-observability in de app).
15. Meldingen versturen (push en in-app) — B, H.
16. Geschillen, refunds en chargebacks afhandelen — F, G.
17. Rechten van gebruikers uitvoeren — alle relevante categorieën.
18. Communicatie over belangrijke wijzigingen — A.
19. Bewijs bewaren bij fraude, klachten of juridische procedures — L, F, G.

## 5. Juridische grondslagen (AVG)

Wij verwerken persoonsgegevens alleen als een wettelijke grondslag van toepassing is. Hieronder per type verwerking.

### Uitvoering van een overeenkomst

Grondslag voor alles wat nodig is om Kwaapo te leveren zoals je van ons mag verwachten: account, profiel, content plaatsen, feed bekijken, kopen, verkopen, orders afhandelen en support.

### Wettelijke verplichting

Voor fiscale en administratieve bewaarplichten van orders en uitbetalingen, en wanneer wij verplicht zijn te reageren op bevoegde autoriteiten.

### Gerechtvaardigd belang

Voor feed-personalisatie, beveiliging, fraudepreventie, moderatie en beperkte technische logging. Ons belang: een veilige, werkende en relevante app. Wij wegen dit af tegen jouw privacyrechten. Je kunt bezwaar maken via

[PRIVACY-E-MAIL] (zie hoofdstuk 14).

### Toestemming

Voor pushmeldingen op je apparaat, uploads van media via camera/microfoon, en waar de wet toestemming vereist. Toestemming is vrijwillig, kan worden ingetrokken via apparaatinstellingen of app-instellingen, en heeft geen terugwerkende kracht. Zonder toestemming kunnen bepaalde functies (zoals push) niet werken.

## 6. Gepersonaliseerde feed en profilering

Kwaapo gebruikt interacties en kijkgedrag om je feed relevanter te maken. Dit gebeurt via ranking in onze database (RPC's zoals get_personalized_feed) en aanvullende signalen in de app.

- Signalen: kijktijd, likes, saves, follows, reacties, niet-geïnteresseerd, tag- en creator-voorkeuren.
- Doel: volgorde van posts bepalen en creators spreiden — geen juridisch of financieel besluit over jou.
- Aanbevelingen kunnen veranderen naarmate je gedrag verandert.
- Blokkades, mutes en privéaccounts beperken wat zichtbaar en rankbaar is.
- Recently viewed en creator-affinity worden gebruikt om herhaling te verminderen en interesses te verfijnen.

Deze profilering heeft geen juridische of vergelijkbare ingrijpende gevolgen in de zin van artikel 22 AVG: het bepaalt alleen welke content je waarschijnlijk eerder ziet. Je kunt je gedrag beïnvloeden door content te liken, te volgen, niet-geïnteresseerd te kiezen of accounts te blokkeren. Een aparte 'reset interesses'-knop is op dit moment niet beschikbaar in de app.

## 7. Zichtbaarheid van content en profielen

- Openbare profielen: username, display_name, bio, avatar en posts zijn zichtbaar voor andere gebruikers.
- Privéaccounts (is_private): alleen goedgekeurde volgers zien je posts.
- Likes, reacties en volgersaantallen kunnen zichtbaar zijn afhankelijk van de context in de app.
- Openbare content kan buiten Kwaapo worden bekeken, gedeeld of vastgelegd door anderen.
- Verwijdering op Kwaapo verwijdert niet automatisch kopieën die anderen hebben gemaakt.
- E-mailadres, betaalgegevens, verzendadres en interne ID's zijn niet openbaar.

Je kunt je profiel bewerken in de app en privacy-instellingen zoals een privéaccount aanpassen waar die functie beschikbaar is.

## 8. Minderjarigen

Kwaapo is bedoeld voor gebruikers van 16 jaar en ouder. Bij registratie moet je bevestigen dat je minimaal 16 bent. Wij voeren op dit moment geen aparte leeftijdsverificatie met identiteitsbewijs uit.

- Je mag je leeftijd niet vervalsen.
- Als wij ontdekken dat een account onder de 16 is, kunnen wij het beperken of verwijderen.
- Ouders of wettelijke vertegenwoordigers kunnen contact opnemen via [PRIVACY-E-MAIL].
- Waar toestemming de grondslag is, is toestemming van een ouder nodig voor kinderen onder 16.
- Kwaapo beoogt geen opzettelijke verwerking van accounts onder de minimumleeftijd.

## 9. Met wie delen wij gegevens?

Wij verkopen je persoonsgegevens niet. Wij delen gegevens alleen met onderstaande categorieën ontvangers, voor zover nodig voor de dienst.

### Supabase

Database, authenticatie, Realtime, Edge Functions. Gegevens: vrijwel alle app-categorieën. Verwerker. Privacy: supabase.com/privacy

### Cloudflare (Workers en R2)

Video-uploads, API, media-opslag. Gegevens: content, technische metadata, IP. Verwerker. Privacy: cloudflare.com/privacypolicy

### Stripe

Checkout en Connect voor verkopers. Gegevens: betaal- en orderreferenties, verkopersidentificatie. Zelfstandig verantwoordelijke voor betaalverwerking. Privacy: stripe.com/privacy

### Expo / pushdiensten

Push tokens en notificatie-aflevering via Apple APNS en Google FCM. Verwerker. Privacy: expo.dev/privacy

### Resend

E-mail voor contactformulier (Edge Function send-contact-message). Gegevens: e-mail, berichtinhoud. Verwerker.

### KVK API

Verificatie van bedrijfsgegevens van verkopers. Gegevens: KvK-nummer en bedrijfsnaam. Verwerker / overheidsbron.

### Spotify Web API

Zoeken en koppelen van geluid bij uploads. Gegevens: trackmetadata, geen Spotify-account van jou. Verwerker.

### Apple en Google

App-distributie en push-infrastructuur. Geen Google Sign-In of Apple Sign In geconfigureerd in de huidige app.

### Andere gebruikers

Kopers en verkopers zien order- en verzendgegevens die nodig zijn voor de transactie. Verkopers kunnen zelfstandig verwerkingsverantwoordelijke zijn voor aflevering.

### Bevoegde autoriteiten

Alleen wanneer de wet dit vereist of ter bescherming van rechten en veiligheid.

## 10. Internationale doorgifte

Sommige leveranciers verwerken gegevens buiten de Europese Economische Ruimte (EER), waaronder Cloudflare, Stripe, Supabase en Resend. Wij zorgen voor passende waarborgen zoals standaardcontractbepalingen (SCC's), adequaatheidsbesluiten waar van toepassing, en aanvullende technische maatregelen.

Een kopie van relevante waarborgen kun je opvragen via [PRIVACY-E-MAIL]. Definitieve contractuele details moeten nog worden ingevuld na juridische review.

## 11. Hoe lang bewaren wij gegevens?

Wij bewaren gegevens niet langer dan nodig, behalve wanneer de wet of beveiligingsbelangen langere bewaaring vereisen. Onderstaande termijnen zijn placeholders tot definitieve juridische/fiscale afstemming.

**Bewaartermijnentabel:** Zie de tabel op deze pagina voor categorieën en termijnen.

Gegevens kunnen eerder worden verwijderd of geanonimiseerd wanneer ze niet meer nodig zijn, bijvoorbeeld na een geslaagd privacyverzoek of accountverwijdering, met uitzondering van gegevens die wij wettelijk moeten bewaren.

## 12. Account verwijderen

Je kunt accountverwijdering starten via Instellingen → Account verwijderen in de app. Dit roept de functie request_account_deletion aan.

1. Je profiel wordt direct verborgen en geanonimiseerd (username, display_name, bio, avatar).
2. Posts worden gemarkeerd als verwijderd (is_deleted).
3. Actieve producten worden gedeactiveerd.
4. Je wordt uitgelogd; inloggen met hetzelfde account werkt niet meer zodra auth is verwijderd.
5. Je auth-account (login) wordt verwijderd binnen onze verwerkingstermijn — dit is nog niet altijd direct bij de knop.
6. Order- en betalingsgegevens kunnen bewaard blijven voor wettelijke en geschil-doeleinden, losgekoppeld van je profiel.
7. Stripe Connect-accounts van verkopers moeten apart worden afgehandeld volgens Stripe-regels.
8. Openstaande orders, refunds of geschillen kunnen afhandeling vertragen.
9. Hetzelfde e-mailadres kun je later eventueel opnieuw gebruiken voor een nieuw account.

## 13. Jouw privacyrechten

Onder de AVG heb je de volgende rechten. Wij reageren in beginsel binnen één maand; complexe verzoeken kunnen met twee maanden worden verlengd met uitleg.

- Recht op informatie en inzage — welke gegevens wij van je hebben.
- Recht op rectificatie — onjuiste profielgegevens corrigeren in de app of via verzoek.
- Recht op verwijdering — account verwijderen of gericht verzoek.
- Recht op beperking — tijdelijk minder verwerken.
- Recht op dataportabiliteit — export waar technisch mogelijk (nu via verzoek, geen automatische exportknop).
- Recht van bezwaar — tegen verwerking op basis van gerechtvaardigd belang.
- Recht om toestemming in te trekken — voor push en media-toegang.
- Rechten rond geautomatiseerde besluitvorming — zie hoofdstuk 22.
- Klacht bij de Autoriteit Persoonsgegevens — zie hoofdstuk 14.

Dien verzoeken in via [PRIVACY-E-MAIL] of Instellingen → Contact & support. Wij kunnen redelijke identificatie vragen. Verzoeken zijn in beginsel kosteloos; misbruik of excessieve verzoeken kunnen worden geweigerd of belast conform de AVG.

## 14. Klacht bij de toezichthouder

Je hebt het recht een klacht in te dienen bij de Autoriteit Persoonsgegevens (AP). Je mag eerst contact met ons opnemen, maar dat is niet verplicht voordat je naar de AP stapt.

- Autoriteit Persoonsgegevens
- Website: autoriteitpersoonsgegevens.nl
- Postadres: Postbus 93374, 2509 AJ Den Haag

## 15. Beveiliging

Geen enkel systeem is 100% veilig, maar wij nemen passende maatregelen:

- Versleutelde verbindingen (HTTPS/TLS) naar API's en workers.
- Supabase Row Level Security (RLS) op databasetabellen.
- Authenticatie via Supabase Auth; workers valideren JWT's server-side.
- Beperkte toegang tot productiesystemen voor bevoegde medewerkers.
- Logging en monitoring via Cloudflare en beperkte app-diagnostiek.
- Back-ups via onze hostingproviders.
- Betalingen via PCI-compliant Stripe — geen kaartopslag bij Kwaapo.

Jij bent zelf verantwoordelijk voor een sterk wachtwoord en het beveiligen van je apparaat.

## 16. Datalekken

Bij een vermoedelijk datalek onderzoeken wij het risico, nemen passende maatregelen, melden het aan de AP wanneer de wet dat vereist, en informeren getroffen gebruikers wanneer er waarschijnlijk een hoog risico voor hun rechten is.

Meld een mogelijk datalek via [PRIVACY-E-MAIL].

## 17. Tracking, analytics en Apple Privacy

De huidige Kwaapo-app gebruikt geen advertentienetwerken, geen IDFA/ATT-tracking, geen Firebase Analytics, Sentry of vergelijkbare third-party analytics-SDK's in package.json.

- Feed-observability logt beperkt naar de console tijdens ontwikkeling — geen commerciële tracking.
- Geen cross-app tracking over websites of apps van derden.
- Als wij in de toekomst analytics of tracking toevoegen, passen wij dit beleid en de App Store Privacy Labels aan en vragen wij toestemming waar vereist.

## 18. Pushnotificaties en communicatie

Kwaapo kan pushmeldingen sturen voor sociale activiteit, orders en verkopersupdates. Hiervoor slaan wij een Expo push token op (push_device_tokens) nadat je toestemming geeft op je apparaat.

- Je kunt push uitschakelen in je apparaatinstellingen of via app-voorkeuren waar beschikbaar.
- In-app notificaties zijn onderdeel van de dienst en vereisen een account.
- Serviceberichten over orders of beveiliging kunnen nodig zijn om de dienst te leveren.
- Wij sturen op dit moment geen aparte marketing-pushcampagnes via derde advertentienetwerken.
- Contactformulier-e-mails zijn transactioneel/support — geen nieuwsbrief zonder toestemming.

## 19. Marketplace en koper/verkopergegevens

Bij een bestelling ziet de verkoper de gegevens die nodig zijn om te verzenden (zoals naam en afleveradres). De koper ziet product- en verkopersinformatie. Betaalgegevens worden via Stripe verwerkt — niet rechtstreeks tussen partijen gedeeld.

- Verkopers worden zakelijk geverifieerd via KVK en Stripe Connect.
- Kwaapo bewaart ordergegevens voor fraude, refunds en geschillen.
- Verkopers hebben eigen AVG-verplichtingen jegens kopers voor fulfillment.
- Zie ook de marketplace- en seller-voorwaarden in de app.

## 20. Moderatie en illegale content

Bij meldingen verwerken wij de inhoud van de melding, je user-ID en de gemelde content. Moderators (menselijk) en geautomatiseerde filters kunnen content beoordelen. Bewijs kan worden bewaard in moderatiedossiers.

Wij kunnen informatie aan autoriteiten verstrekken wanneer de wet dat vereist. Tegen maatregelen kun je bezwaar maken via support of [PRIVACY-E-MAIL]. Zie ook de communityrichtlijnen en gebruikersvoorwaarden.

## 21. Geautomatiseerde besluitvorming

Kwaapo gebruikt geautomatiseerde systemen om: (1) feed en aanbevelingen te rangschikken; (2) fraude- en misbruiksignalen te detecteren; (3) content te modereren. Deze beslissingen hebben geen juridische of vergelijkbare ingrijpende gevolgen zoals kredietweigering — ze bepalen contentvolgorde, zichtbaarheid of accountbeperkingen binnen het platform.

Bij account- of contentmaatregelen kun je contact opnemen voor menselijke herbeoordeling via [CONTACT-E-MAIL].

## 22. Gegevens die anderen over jou aanleveren

- Reacties en mentions waarin jij voorkomt;
- Rapportages over jouw content of gedrag;
- Beeldmateriaal geplaatst door andere gebruikers;
- Verzendgegevens die een koper invult bij jou als verkoper;
- Gegevens die Stripe terugkoppelt over betalingen;
- Meldingen van mogelijke overtredingen door derden.

## 23. Cookies en website

De Kwaapo-app is primair een native app. De webpreview (Expo web op poort 8082) is voor ontwikkeling en testen. Een publieke website op https://[DOMEIN]/privacy is gepland om dezelfde tekst te tonen als in de app.

- Functionele opslag: sessie/local storage voor login en voorkeuren in webpreview.
- Geen advertentiecookies of third-party tracking cookies geconfigureerd.
- Serverlogs van hosting kunnen IP en user-agent bewaren.
- Bij een publieke website kan een cookiebanner nodig zijn — nog niet live.

## 24. Wijzigingen in dit privacybeleid

Wij kunnen dit beleid wijzigen bij nieuwe functies, wetgeving of leveranciers. Belangrijke wijzigingen communiceren wij via de app, e-mail of een melding. Datum en versienummer worden bovenaan bijgewerkt. Waar de wet nieuwe toestemming vereist, vragen wij die opnieuw. Oudere versies kun je opvragen via [PRIVACY-E-MAIL].

## 25. Contact

- [JURIDISCHE BEDRIJFSNAAM] ([HANDELSNAAM])
- [VESTIGINGSADRES]
- KvK: [KVK-NUMMER]
- Privacy: [PRIVACY-E-MAIL]
- Contact: [CONTACT-E-MAIL]
- Klachten: [KLACHTEN-E-MAIL]
- FG/DPO: [FUNCTIONARIS GEGEVENSBESCHERMING INDIEN VAN TOEPASSING]

Gebruik de knoppen onderaan deze pagina voor contact, privacyverzoeken, accountverwijdering en gerelateerde documenten.

## Bewaartermijnen

| Categorie | Termijn | Toelichting |
| --- | --- | --- |
| Account- en profielgegevens (actief account) | [BEWAARTERMIJN: account zolang actief] | Zolang je account actief is en je niet om verwijdering vraagt. |
| Verwijderde of geanonimiseerde accounts | [BEWAARTERMIJN: verwijderde accounts] | Na accountverwijdering; auth-login volgt in verwerkingstermijn. |
| Posts, video's en thumbnails | [BEWAARTERMIJN: posts en media] | Bij verwijdering worden posts gemarkeerd als verwijderd; media in R2 kan apart worden opgeschoond. |
| Reacties, likes, saves, follows | [BEWAARTERMIJN: likes, reacties, follows] | Gekoppeld aan account of content; kan anonimiseren bij verwijdering. |
| Ranking-, kijk- en interessegegevens | [BEWAARTERMIJN: ranking- en kijkgegevens] | video_views, content_interactions, tag/creator-voorkeuren. |
| Meldingen en moderatiedossiers | [BEWAARTERMIJN: meldingen en moderatie] | Bewijs bij veiligheid en naleving kan langer nodig zijn. |
| Support- en contactberichten | [BEWAARTERMIJN: supportberichten] | Opgeslagen in contact_messages en verzonden via e-mailprovider. |
| Beveiligings- en serverlogs | [BEWAARTERMIJN: beveiligingslogs] | Cloudflare Worker-logs en beveiligingsgebeurtenissen. |
| Marketplace-producten | [BEWAARTERMIJN: posts en media] | Actieve producten worden gedeactiveerd bij accountverwijdering. |
| Betaalde orders en ordercommunicatie | [BEWAARTERMIJN: betaalde orders] | Gedeeld tussen koper en verkoper voor fulfillment. |
| Fiscale en wettelijke administratie | [BEWAARTERMIJN: fiscale administratie] | Order- en uitbetalingsgegevens waar de wet dit vereist. |
| Stripe-referenties en disputes | [BEWAARTERMIJN: Stripe-referenties] | Checkout-sessies, Connect-accounts, refunds — beheerd door Stripe. |
| Back-ups | [BEWAARTERMIJN: back-ups] | Kunnen verwijderde gegevens tijdelijk bevatten tot rotatie. |

---

*Ontwikkelaarsnotitie: deze privacyverklaring is opgesteld op basis van de actuele Kwaapo-codebase en moet vóór publicatie in de App Store en op het web juridisch worden gecontroleerd en aangevuld met definitieve bedrijfsgegevens, bewaartermijnen en contractuele waarborgen voor internationale doorgifte.*
