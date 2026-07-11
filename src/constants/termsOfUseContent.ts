import { LEGAL_PLACEHOLDERS } from "./legalPlaceholders";
import { PLATFORM_FEE_PERCENT_LABEL } from "./platformFee";

export type TermsBlock =
  | { type: "paragraph"; text: string }
  | { type: "subsection"; title: string; paragraphs: string[]; bullets?: string[] }
  | { type: "numbered"; items: string[] }
  | { type: "bullets"; items: string[] }
  | { type: "notice"; title: string; body: string };

export type TermsChapter = {
  id: string;
  number: number;
  title: string;
  blocks: TermsBlock[];
};

const PLATFORM_FEE_REFERENCE_TEXT =
  PLATFORM_FEE_PERCENT_LABEL === "12,5%" || PLATFORM_FEE_PERCENT_LABEL === "12.5%"
    ? `De huidige platformvergoeding voor verkopers bedraagt ${PLATFORM_FEE_PERCENT_LABEL} van het order-subtotaal, zoals nu is ingesteld in de appconfiguratie.`
    : `De platformvergoeding voor verkopers volgt de actuele appconfiguratie en staat nu op ${PLATFORM_FEE_PERCENT_LABEL}.`;

export const TERMS_SUMMARY_POINTS: string[] = [
  "Je moet minimaal 16 jaar oud zijn.",
  "Plaats alleen content en producten waarvoor je toestemming hebt.",
  "Behandel andere gebruikers respectvol.",
  "Verkopers zijn verantwoordelijk voor hun aanbod en verzending.",
  "Kwaapo kan content, producten of accounts beperken of verwijderen.",
  "Meld problemen, illegale content en verdachte producten via de meldfunctie.",
];

export const TERMS_YOUTH_SUMMARY: {
  title: string;
  items: string[];
  disclaimer: string;
} = {
  title: "De belangrijkste regels in gewone taal",
  items: [
    "Doe je niet voor als iemand anders.",
    "Plaats alleen wat van jou is of waarvoor je toestemming hebt.",
    "Verkoop alleen echte, legale producten.",
    "Wees eerlijk over de staat van een product.",
    "Verstuur verkochte producten op tijd.",
    "Pest, bedreig of bedrieg niemand.",
    "Meld verdachte of illegale content.",
    "Bij ernstige of herhaalde overtredingen kan je account worden verwijderd.",
  ],
  disclaimer:
    "Deze samenvatting helpt je op weg, maar vervangt niet de volledige gebruikersvoorwaarden hierboven.",
};

export const REQUIRED_TERMS_SECTION_IDS: readonly string[] = [
  "about",
  "definitions",
  "age",
  "account",
  "platform-use",
  "content",
  "prohibited",
  "moderation",
  "ip-kwaapo",
  "marketplace",
  "sellers",
  "buyers",
  "payments",
  "shipping",
  "returns",
  "reviews",
  "availability",
  "termination",
  "privacy",
  "external",
  "liability",
  "indemnity",
  "force-majeure",
  "complaints",
  "changes",
  "law",
  "final",
];

export const TERMS_CHAPTERS: TermsChapter[] = [
  {
    id: "about",
    number: 1,
    title: "Over deze voorwaarden",
    blocks: [
      {
        type: "paragraph",
        text: `Deze gebruikersvoorwaarden gelden voor iedereen die Kwaapo gebruikt, met of zonder account. Samen met het privacybeleid, de community guidelines en de specifieke seller-voorwaarden vormen zij de volledige basisafspraken voor gebruik van het platform. Als regels elkaar raken, geldt de uitleg die consumentenbescherming en veiligheid het beste waarborgt.`,
      },
      {
        type: "paragraph",
        text: `Door een account aan te maken, in te loggen of functies van de app te gebruiken, sluit je een overeenkomst met ${LEGAL_PLACEHOLDERS.LEGAL_NAME} (${LEGAL_PLACEHOLDERS.TRADE_NAME}), gevestigd op ${LEGAL_PLACEHOLDERS.ADDRESS} en ingeschreven bij de Kamer van Koophandel onder ${LEGAL_PLACEHOLDERS.KVK}. Voor vragen kun je contact opnemen via ${LEGAL_PLACEHOLDERS.CONTACT_EMAIL}. Deze versie gaat in op ${LEGAL_PLACEHOLDERS.EFFECTIVE_DATE} en heeft versienummer ${LEGAL_PLACEHOLDERS.VERSION}.`,
      },
    ],
  },
  {
    id: "definitions",
    number: 2,
    title: "Definities",
    blocks: [
      {
        type: "paragraph",
        text: "In deze voorwaarden betekenen bepaalde woorden altijd hetzelfde, zodat er zo min mogelijk misverstanden ontstaan. Begrippen in enkelvoud gelden ook in meervoud en andersom wanneer de context dat logisch maakt.",
      },
      {
        type: "numbered",
        items: [
          "App of Platform: de Kwaapo-app, website en bijbehorende diensten.",
          "Gebruiker: iedere natuurlijke persoon die de app bezoekt of gebruikt.",
          "Account: persoonlijk profiel met inloggegevens waarmee je functies van het platform gebruikt.",
          "Content: alle tekst, foto, video, audio, reacties, reviews en andere informatie die via het platform wordt gedeeld.",
          "Verkoper: gebruiker die producten aanbiedt of verkoopt via de marketplace.",
          "Koper: gebruiker die producten bestelt via de marketplace.",
          "Listing: productpagina met omschrijving, prijs, voorraad, foto’s en voorwaarden van de verkoper.",
          "Overeenkomst op afstand: koopovereenkomst tussen koper en verkoper die via het platform tot stand komt.",
          "Dwingend recht: wettelijke regels waarvan niet in het nadeel van consumenten mag worden afgeweken.",
          "Werkdag: maandag tot en met vrijdag, met uitzondering van officiële Nederlandse feestdagen.",
        ],
      },
    ],
  },
  {
    id: "age",
    number: 3,
    title: "Leeftijd en bevoegdheid",
    blocks: [
      {
        type: "subsection",
        title: "Minimumleeftijd en juiste gegevens",
        paragraphs: [
          "Je moet minimaal 16 jaar oud zijn om een account te maken of actief te gebruiken. Je mag geen onjuiste geboortedatum opgeven of doen alsof je ouder bent om beperkingen te omzeilen. Als wij redelijke twijfel hebben over je leeftijd, kunnen wij aanvullende verificatie vragen.",
          "Gebruik je het platform namens een bedrijf of organisatie, dan verklaar je dat je bevoegd bent om die partij te vertegenwoordigen. Zonder die bevoegdheid mag je geen zakelijke verplichtingen aangaan via Kwaapo. Wij kunnen bewijs van vertegenwoordigingsbevoegdheid opvragen voordat zakelijke functies worden vrijgegeven.",
        ],
        bullets: [
          "Accounts van personen jonger dan 16 jaar kunnen worden beperkt, geschorst of verwijderd.",
          "Bij signalen van misleiding over leeftijd kunnen wij toegang tijdelijk blokkeren in afwachting van controle.",
          "Voor minderjarigen gaan wij extra zorgvuldig om met persoonsgegevens en contactverzoeken.",
        ],
      },
      {
        type: "notice",
        title: "Belangrijk over AVG en toestemming",
        body: "In Nederland is de digitale toestemmingsleeftijd onder de AVG 16 jaar. Waar toestemming nodig is voor verwerking van gegevens, vragen wij die op een manier die past bij de leeftijd van de gebruiker en de wettelijke regels.",
      },
    ],
  },
  {
    id: "account",
    number: 4,
    title: "Account en beveiliging",
    blocks: [
      {
        type: "paragraph",
        text: "Je account is persoonlijk en bedoeld voor jouw eigen gebruik. Je houdt je gegevens actueel, volledig en correct, zodat support, betalingen en veiligheidscontroles goed kunnen werken. Je mag geen account aanmaken namens iemand anders zonder toestemming.",
      },
      {
        type: "bullets",
        items: [
          "Gebruik een sterk wachtwoord en deel je inloggegevens niet met anderen.",
          "Het overdragen, verhuren of verkopen van accounts is niet toegestaan.",
          "Gebruik van bots, scripts of geautomatiseerde accountaanmaak is verboden.",
          "Meld verdacht gebruik of mogelijk misbruik direct via " + LEGAL_PLACEHOLDERS.CONTACT_EMAIL + ".",
          "Wij kunnen veiligheidscontroles uitvoeren, zoals extra verificatie bij ongebruikelijke login-activiteit.",
        ],
      },
      {
        type: "paragraph",
        text: "Je blijft verantwoordelijk voor activiteiten die via jouw account plaatsvinden, behalve voor zover dat wettelijk niet redelijk is. Als je denkt dat iemand toegang heeft gekregen tot je account, wijzig dan direct je wachtwoord en neem contact op met support. Wij mogen tijdelijke maatregelen nemen om schade voor jou of andere gebruikers te beperken.",
      },
    ],
  },
  {
    id: "platform-use",
    number: 5,
    title: "Toegestaan gebruik van het platform",
    blocks: [
      {
        type: "paragraph",
        text: "Kwaapo is bedoeld voor creatief delen, eerlijke interactie en legale handel in toegestane producten. Je gebruikt het platform respectvol en zonder andere gebruikers, verkopers, kopers of systemen te hinderen. Je handelt altijd in lijn met wetgeving, deze voorwaarden en onze communityregels.",
      },
      {
        type: "bullets",
        items: [
          "Geen technische verstoring, overbelasting of doelbewuste sabotage van de app.",
          "Geen scraping, datamining, reverse engineering of geautomatiseerd kopieren van platformdata.",
          "Geen spam, kettingberichten, nep-engagement of misleidende groeitrucs.",
          "Geen pogingen om beveiliging, toegangsniveaus of moderatiecontroles te omzeilen.",
          "Wij mogen ranking, aanbevelingen en zichtbaarheid van content aanpassen op basis van kwaliteit, relevantie en veiligheid.",
        ],
      },
    ],
  },
  {
    id: "content",
    number: 6,
    title: "Jouw content en rechten",
    blocks: [
      {
        type: "paragraph",
        text: "Je bent zelf verantwoordelijk voor alle content die je plaatst, uploadt of deelt via Kwaapo. Je garandeert dat je daarvoor de rechten, toestemmingen en wettelijke grondslag hebt, inclusief toestemming van herkenbare personen waar nodig. Je content mag geen inbreuk maken op auteursrechten, merkrechten, portretrechten of privacyrechten.",
      },
      {
        type: "subsection",
        title: "Licentie aan Kwaapo",
        paragraphs: [
          "Voor het technisch kunnen leveren van de dienst geef je Kwaapo een niet-exclusieve, wereldwijde en royaltyvrije licentie om jouw content te hosten, op te slaan, te verwerken, te reproduceren en te tonen binnen de app en gekoppelde kanalen. Deze licentie is beperkt tot exploitatie, beveiliging, moderatie, ondersteuning en redelijke promotie van het platform. Wij claimen geen eigendom op jouw content.",
          "De licentie eindigt in principe wanneer jij content verwijdert of je account sluit. Technische back-ups, archiefkopieën en gegevens die wij wettelijk moeten bewaren, kunnen nog tijdelijk aanwezig blijven. Zodra dat redelijk en toegestaan is, worden ook die restkopieën verwijderd of geanonimiseerd.",
        ],
      },
    ],
  },
  {
    id: "prohibited",
    number: 7,
    title: "Verboden content, gedrag en producten",
    blocks: [
      {
        type: "paragraph",
        text: "Om de community veilig te houden, is bepaalde content en activiteit strikt verboden. De onderstaande lijst is uitgebreid, maar niet limitatief: ook vergelijkbaar schadelijk of onrechtmatig gedrag kan worden aangepakt. Bij twijfel kun je vooraf contact opnemen met support.",
      },
      {
        type: "bullets",
        items: [
          "Content die aanzet tot haat, discriminatie, pesten, bedreiging of intimidatie.",
          "Seksuele content met minderjarigen, seksuele uitbuiting, grooming of niet-consensuele seksuele beelden.",
          "Expliete pornografische content, seksuele diensten of seksuele chantage.",
          "Verheerlijking van geweld, terrorisme, extremisme of gevaarlijke challenges.",
          "Promotie van zelfbeschadiging, suïcide-instructies of eetstoornisverheerlijking.",
          "Illegale goederen of diensten, waaronder drugs, wapens, munitie en explosieven.",
          "Gestolen goederen, namaakproducten, inbreukmakende kopieën en fraudeproducten.",
          "Scams, phishing, oplichting, betaalfraude, piramidespellen of financieel misbruik.",
          "Malware, hacks, tools voor onbevoegde toegang of instructies voor cyberaanvallen.",
          "Doxxing, delen van vertrouwelijke persoonsgegevens of identiteitsdocumenten van derden.",
          "Impersonatie van personen, merken of overheidsinstanties zonder duidelijke toestemming.",
          "Spam, massaberichten, kunstmatige volgers/likes of misleidende engagement-methodes.",
          "Verkoop van accounts, illegale loterijen, gokdiensten zonder vergunning of witwasconstructies.",
          "Misleidende productinformatie over staat, herkomst, authenticiteit of levering.",
        ],
      },
      {
        type: "notice",
        title: "Snelle handhaving",
        body: "Bij ernstige risico’s voor veiligheid, fraude of minderjarigen mogen wij direct content verwijderen of accounts beperken zonder voorafgaande waarschuwing. Waar redelijk leggen wij daarna uit welke regel is overtreden en welke vervolgstappen mogelijk zijn.",
      },
    ],
  },
  {
    id: "moderation",
    number: 8,
    title: "Moderatie, meldingen en beroep",
    blocks: [
      {
        type: "paragraph",
        text: "Kwaapo combineert geautomatiseerde signalen met menselijke beoordeling om onveilige of onrechtmatige content te beperken. Gebruikers kunnen content, profielen en listings melden via de meldfunctie in de app. Wij nemen maatregelen die passen bij de ernst en context van een overtreding.",
      },
      {
        type: "bullets",
        items: [
          "Mogelijke maatregelen: waarschuwing, de-prioritering, verwijdering, tijdelijke beperkingen of accountschorsing.",
          "Bij herhaalde of ernstige overtredingen kunnen wij accounts permanent sluiten.",
          "Wij documenteren moderatiebesluiten waar dat nodig is voor transparantie en klachtenafhandeling.",
          "Waar toepasselijk handelen wij in lijn met relevante regels uit de Digital Services Act (DSA).",
          "Je kunt bezwaar maken tegen een besluit via " + LEGAL_PLACEHOLDERS.CONTACT_EMAIL + ".",
        ],
      },
      {
        type: "paragraph",
        text: "Bij een bezwaar kijken we opnieuw naar de feiten en de context van de melding. Als een besluit onjuist blijkt, herstellen we content of accounttoegang zo snel als redelijk mogelijk. Misbruik van het beroepsproces kan zelf ook tot beperkingen leiden.",
      },
    ],
  },
  {
    id: "ip-kwaapo",
    number: 9,
    title: "Intellectueel eigendom van Kwaapo",
    blocks: [
      {
        type: "paragraph",
        text: "De app, software, vormgeving, teksten, logo’s, merknaam Kwaapo en andere platformonderdelen zijn beschermd door intellectuele eigendomsrechten. Deze rechten blijven van Kwaapo of van licentiegevers die toestemming hebben gegeven voor gebruik. Je krijgt alleen een beperkte, herroepbare gebruikslicentie om de dienst normaal te gebruiken.",
      },
      {
        type: "paragraph",
        text: "Je mag geen onderdelen van de dienst kopieren, verkopen, sublicenseren of commercieel exploiteren zonder voorafgaande schriftelijke toestemming. Ook mag je onze merknamen en beeldmerken niet gebruiken op een manier die verwarring over herkomst of samenwerking kan veroorzaken. Overtreding kan leiden tot verwijdering van content, accountmaatregelen en juridische stappen.",
      },
    ],
  },
  {
    id: "marketplace",
    number: 10,
    title: "Rol van Kwaapo in de marketplace",
    blocks: [
      {
        type: "paragraph",
        text: "Kwaapo faciliteert het contact tussen kopers en verkopers, de productweergave en de betaalinfrastructuur. Tenzij uitdrukkelijk anders vermeld, is Kwaapo zelf niet de verkoper van aangeboden producten. De koopovereenkomst komt direct tot stand tussen koper en verkoper.",
      },
      {
        type: "paragraph",
        text: "Verkopers blijven verantwoordelijk voor correcte productinformatie, eigendom, kwaliteit, levering en naleving van consumentenrecht. Kwaapo kan hulpmiddelen bieden voor veiligheid en afhandeling, maar neemt de primaire contractuele verplichtingen van de verkoper niet over. Deze rolverdeling is bedoeld om transparant te zijn volgens Nederlandse consumentenregels en richtlijnen van de ACM.",
      },
    ],
  },
  {
    id: "sellers",
    number: 11,
    title: "Aanvullende regels voor verkopers",
    blocks: [
      {
        type: "subsection",
        title: "Verantwoordelijkheden van verkopers",
        paragraphs: [
          "Als verkoper zorg je dat listings volledig, waarheidsgetrouw en actueel zijn, inclusief duidelijke informatie over staat, maat, prijs en verzendvoorwaarden. Je verkoopt alleen producten die je rechtmatig mag aanbieden en die passen binnen onze beleidsregels. Je reageert tijdig op vragen van kopers en op supportverzoeken over bestellingen.",
          PLATFORM_FEE_REFERENCE_TEXT +
            " Door een listing te plaatsen accepteer je dat deze vergoeding wordt ingehouden volgens de actuele checkout-instellingen.",
        ],
        bullets: [
          "Je respecteert toepasselijke consumentenwetgeving, inclusief informatieplichten en herroepingsregels waar van toepassing.",
          "Je verstrekt op verzoek redelijke bewijsstukken over authenticiteit, eigendom of zakelijke status.",
          "Bij vermoedens van fraude, misleiding of verboden handel kunnen uitbetalingen worden gepauzeerd.",
        ],
      },
    ],
  },
  {
    id: "buyers",
    number: 12,
    title: "Aanvullende regels voor kopers",
    blocks: [
      {
        type: "paragraph",
        text: "Als koper controleer je vóór aankoop de listing, prijs, productstaat, verzendinformatie en verkopersprofiel. Je gebruikt alleen toegestane betaalmethoden via de in-app checkout en probeert betalingen niet buiten het platform om te sturen. Misbruik van claims, chargebacks of retourrecht is niet toegestaan.",
      },
      {
        type: "bullets",
        items: [
          "Stel vragen aan de verkoper als informatie ontbreekt of onduidelijk is.",
          "Meld verdachte listings of fraude direct via de meldfunctie en support.",
          "Bewaar relevante communicatie en bewijs, bijvoorbeeld foto’s en ordergegevens.",
          "Betaal op tijd en gebruik correcte leveringsgegevens om vertraging te voorkomen.",
        ],
      },
    ],
  },
  {
    id: "payments",
    number: 13,
    title: "Betalingen en uitbetalingen",
    blocks: [
      {
        type: "paragraph",
        text: "Betalingen op Kwaapo worden verwerkt via Stripe of gekoppelde betaaldiensten. Tijdens checkout tonen we de prijsopbouw, inclusief eventuele kosten en toepasselijke vergoedingen, zodat je vooraf ziet wat je betaalt. Betaalgegevens worden verwerkt volgens de beveiligingsstandaarden van de betaalprovider.",
      },
      {
        type: "paragraph",
        text: "Uitbetalingen aan verkopers kunnen worden vertraagd bij risico-indicatoren, compliancecontroles, lopende klachten of wettelijke verplichtingen. Kwaapo kan aanvullende informatie vragen om witwassen, fraude of misbruik tegen te gaan. Een vertraagde uitbetaling betekent niet automatisch dat een verkoper een overtreding heeft begaan.",
      },
    ],
  },
  {
    id: "shipping",
    number: 14,
    title: "Verzending en levering",
    blocks: [
      {
        type: "paragraph",
        text: "De verkoper is verantwoordelijk voor correcte verpakking, juiste adressering en tijdige verzending. Vermelde levertijden zijn indicatief, tenzij uitdrukkelijk een bindende termijn is afgesproken. De verkoper moet redelijke track-and-trace of ander verzendbewijs kunnen overleggen wanneer daarom wordt gevraagd.",
      },
      {
        type: "paragraph",
        text: "Bij schade, verlies of niet-ontvangst beoordelen koper en verkoper eerst samen de feiten en beschikbare bewijsstukken. Kwaapo kan ondersteunend optreden bij de communicatie en dossieropbouw, maar neemt niet automatisch de leveringsverplichting over. Wettelijke rechten van consumenten blijven onverminderd van kracht.",
      },
    ],
  },
  {
    id: "returns",
    number: 15,
    title: "Retouren, herroeping en refunds",
    blocks: [
      {
        type: "paragraph",
        text: "Retouren en refunds worden verder uitgewerkt in het aparte retour- en refundbeleid dat in de app beschikbaar is. Dit hoofdstuk geeft de hoofdlijnen en vervangt dat aparte beleid niet. Bij verschil tussen teksten geldt de uitleg die het best aansluit op dwingend consumentenrecht.",
      },
      {
        type: "paragraph",
        text: "Bij consumentenkoop kan in veel gevallen een wettelijke bedenktijd van 14 dagen gelden, afhankelijk van producttype, staat van het product en wettelijke uitzonderingen. Een algemene regel 'geen retouren ooit' is daarom niet toegestaan waar de wet herroeping verplicht stelt. Verkopers moeten per bestelling duidelijk communiceren hoe retouren en terugbetalingen worden afgehandeld.",
      },
    ],
  },
  {
    id: "reviews",
    number: 16,
    title: "Reviews en beoordelingen",
    blocks: [
      {
        type: "paragraph",
        text: "Reviews helpen de community, maar moeten eerlijk, relevant en gebaseerd op echte ervaring zijn. Je mag geen valse reviews plaatsen, reviews ruilen tegen verborgen voordelen of druk uitoefenen op anderen om beoordelingen te wijzigen. Kwaapo kan controles uitvoeren op reviewpatronen die op manipulatie wijzen.",
      },
      {
        type: "bullets",
        items: [
          "Houd reviews feitelijk en respectvol, zonder beledigingen of discriminatie.",
          "Deel geen gevoelige persoonsgegevens in een review.",
          "Verkopers mogen reageren op reviews, maar niet intimideren of misleiden.",
          "Wij mogen reviews verwijderen of markeren bij aanwijzingen van fraude of misbruik.",
        ],
      },
    ],
  },
  {
    id: "availability",
    number: 17,
    title: "Beschikbaarheid van de dienst",
    blocks: [
      {
        type: "paragraph",
        text: "Wij verbeteren Kwaapo voortdurend en kunnen functies toevoegen, wijzigen of verwijderen. Soms doen we gepland onderhoud of noodonderhoud om prestaties, veiligheid of compliance te verbeteren. Daardoor kan de dienst tijdelijk beperkt beschikbaar zijn.",
      },
      {
        type: "paragraph",
        text: "Wij streven naar een stabiele ervaring, maar geven geen garantie op ononderbroken of foutloze beschikbaarheid. Storingen bij externe leveranciers kunnen invloed hebben op uploads, betalingen, notificaties of inloggen. Waar mogelijk communiceren we belangrijke verstoringen via de app of supportkanalen.",
      },
    ],
  },
  {
    id: "termination",
    number: 18,
    title: "Beëindiging en accountsluiting",
    blocks: [
      {
        type: "paragraph",
        text: "Je kunt je account op elk moment beëindigen via de beschikbare instellingen of via support. Wij kunnen een account beperken of beëindigen bij ernstige of herhaalde overtredingen, fraude-indicatoren of wettelijke verplichtingen. Waar redelijk leggen we uit waarom een maatregel is genomen.",
      },
      {
        type: "paragraph",
        text: "Na accountverwijdering kunnen bepaalde gegevens tijdelijk bewaard blijven voor beveiliging, administratie of wettelijke bewaarplichten. Als oude sessiegegevens nog lokaal op je apparaat staan, kan het nodig zijn opnieuw in te loggen of je opnieuw te registreren om functies te gebruiken. Verplichtingen die naar hun aard doorlopen, zoals betalings- of aansprakelijkheidsregels, blijven gelden.",
      },
    ],
  },
  {
    id: "privacy",
    number: 19,
    title: "Privacy en persoonsgegevens",
    blocks: [
      {
        type: "paragraph",
        text: "Wij verwerken persoonsgegevens om de app te laten werken, veiligheid te verbeteren, betalingen te ondersteunen en support te bieden. Hoe we dat precies doen, staat uitgebreid in het privacybeleid van Kwaapo. Dit hoofdstuk is alleen een korte samenvatting en geen volledige herhaling van dat beleid.",
      },
      {
        type: "paragraph",
        text: "Voor details over categorieen gegevens, grondslagen, bewaartermijnen, rechten en contactpunten, raadpleeg je het privacybeleid in de app en op de publieke policy-pagina. Verzoeken over inzage, correctie, verwijdering of bezwaar kun je sturen naar " +
          LEGAL_PLACEHOLDERS.CONTACT_EMAIL +
          ". Bij conflict tussen samenvatting en privacybeleid geldt het privacybeleid, tenzij dwingend recht anders bepaalt.",
      },
    ],
  },
  {
    id: "external",
    number: 20,
    title: "Diensten van derden",
    blocks: [
      {
        type: "paragraph",
        text: "Kwaapo maakt gebruik van externe infrastructuur en diensten, waaronder Stripe (betalingen), Supabase (auth/database), Cloudflare (edge en opslag) en Apple (app-distributie en platformdiensten). Deze partijen kunnen eigen voorwaarden en privacyregels hanteren voor hun deel van de verwerking. Kwaapo selecteert leveranciers zorgvuldig, maar beheert niet alle onderdelen van hun systemen.",
      },
      {
        type: "paragraph",
        text: "Wanneer je functionaliteit gebruikt die direct van een derde partij komt, kun je ook gebonden zijn aan aanvullende voorwaarden van die partij. Storingen, updates of beleidswijzigingen bij derden kunnen invloed hebben op onderdelen van de app. Wij proberen impact te beperken, maar kunnen externe dienstverlening niet volledig garanderen.",
      },
    ],
  },
  {
    id: "liability",
    number: 21,
    title: "Aansprakelijkheid",
    blocks: [
      {
        type: "paragraph",
        text: "Kwaapo levert een platformdienst en doet redelijke inspanningen voor veiligheid, betrouwbaarheid en correcte werking. Toch kunnen fouten, vertragingen of onverwachte uitkomsten optreden, vooral bij afhankelijkheid van externe partijen en gebruikerscontent. Wij zijn niet automatisch aansprakelijk voor elke schade die ontstaat door gebruik van het platform.",
      },
      {
        type: "paragraph",
        text: "Aansprakelijkheidsbeperkingen gelden niet voor schade die volgens dwingend recht niet mag worden uitgesloten, zoals opzet of bewuste roekeloosheid waar toepasselijk. Voor consumenten blijven alle verplichte wettelijke rechten volledig intact. Er geldt geen vaste euro-cap in deze voorwaarden; per situatie wordt gekeken naar wet, omstandigheden en redelijkheid.",
      },
    ],
  },
  {
    id: "indemnity",
    number: 22,
    title: "Vrijwaring (beperkt)",
    blocks: [
      {
        type: "paragraph",
        text: "Als jij deze voorwaarden schendt of onrechtmatig handelt, kun je verplicht zijn Kwaapo te vrijwaren voor redelijke kosten en schadeclaims van derden die daar direct uit voortkomen. Deze vrijwaring geldt alleen voor zover de claim aantoonbaar verband houdt met jouw handelen of content. Wij informeren je zo snel mogelijk over een relevante claim en geven je de kans om te reageren.",
      },
      {
        type: "paragraph",
        text: "Voor consumenten wordt deze vrijwaringsbepaling beperkt toegepast en nooit in strijd met dwingend consumentenrecht. Er wordt altijd gekeken naar proportionaliteit, eigen rol van partijen en de omstandigheden van het geval. Kwaapo zal geen onredelijke of buitensporige vergoeding eisen.",
      },
    ],
  },
  {
    id: "force-majeure",
    number: 23,
    title: "Overmacht",
    blocks: [
      {
        type: "paragraph",
        text: "Bij overmacht hoeft Kwaapo verplichtingen tijdelijk niet na te komen voor zover nakoming redelijkerwijs onmogelijk is. Denk aan grote storingen, cyberincidenten, stroomuitval, netwerkproblemen, overheidsmaatregelen, natuurrampen of uitval van essentiële leveranciers. Wij proberen de gevolgen te beperken en herstellen de dienstverlening zodra dat redelijk kan.",
      },
      {
        type: "paragraph",
        text: "Als een overmachtssituatie lang duurt, zoeken we een redelijke oplossing met betrokken gebruikers voor openstaande verplichtingen. Rechten die volgens dwingend recht blijven gelden, worden daarbij gerespecteerd. Overmacht ontslaat partijen niet van verplichtingen die losstaan van de verhindering.",
      },
    ],
  },
  {
    id: "complaints",
    number: 24,
    title: "Klachten en geschillenmelding",
    blocks: [
      {
        type: "paragraph",
        text: "Heb je een klacht over content, een bestelling, een moderatiebesluit of onze dienstverlening, meld dit zo volledig mogelijk via de in-app meldfunctie en/of per e-mail. Voeg relevante informatie toe, zoals order-ID, gebruikersnaam, screenshots en een duidelijke omschrijving van het probleem. Zo kunnen we sneller en eerlijker beoordelen.",
      },
      {
        type: "paragraph",
        text: `Voor formele klachten kun je contact opnemen via ${LEGAL_PLACEHOLDERS.COMPLAINTS_EMAIL}. Algemene vragen en supportverzoeken lopen via ${LEGAL_PLACEHOLDERS.CONTACT_EMAIL}. Wij streven ernaar binnen een redelijke termijn te reageren en, waar mogelijk, in overleg tot een praktische oplossing te komen.`,
      },
    ],
  },
  {
    id: "changes",
    number: 25,
    title: "Wijzigingen van de voorwaarden",
    blocks: [
      {
        type: "paragraph",
        text: "Kwaapo kan deze voorwaarden aanpassen als wetgeving, platformfunctionaliteit, veiligheidsrisico’s of bedrijfsvoering daarom vragen. Bij materiele wijzigingen informeren we gebruikers via de app, e-mail of andere passende kanalen. De nieuwste versie wordt altijd beschikbaar gemaakt met een duidelijke ingangsdatum.",
      },
      {
        type: "paragraph",
        text: "Als je de dienst na de ingangsdatum blijft gebruiken, geldt dat als aanvaarding van de aangepaste voorwaarden, voor zover wettelijk toegestaan. Als je niet akkoord bent, kun je stoppen met gebruik en je account sluiten. Dwingende consumentenrechten blijven ook na wijzigingen van kracht.",
      },
    ],
  },
  {
    id: "law",
    number: 26,
    title: "Toepasselijk recht en bevoegde rechter",
    blocks: [
      {
        type: "paragraph",
        text: "Op deze voorwaarden en het gebruik van Kwaapo is Nederlands recht van toepassing. Deze rechtskeuze beperkt consumenten niet in de bescherming die zij op grond van dwingende regels van hun woonland binnen de EU kunnen hebben. Waar wetgeving dat vereist, gelden aanvullende lokale beschermingsregels.",
      },
      {
        type: "paragraph",
        text: "Geschillen worden in beginsel voorgelegd aan de bevoegde rechter in Nederland, tenzij dwingend consumentenrecht een andere bevoegde rechter aanwijst. Partijen proberen eerst in redelijkheid tot een oplossing te komen via de klachtenprocedure. Deze stap doet niets af aan het recht om tijdig juridische stappen te nemen.",
      },
    ],
  },
  {
    id: "final",
    number: 27,
    title: "Slotbepalingen",
    blocks: [
      {
        type: "paragraph",
        text: "Als een bepaling in deze voorwaarden ongeldig of onafdwingbaar blijkt, blijven de overige bepalingen volledig van kracht. De ongeldige bepaling wordt dan uitgelegd of vervangen op een manier die juridisch houdbaar is en zo dicht mogelijk bij het oorspronkelijke doel blijft. Dit heet scheidbaarheid (severability).",
      },
      {
        type: "paragraph",
        text: "Kwaapo mag rechten en verplichtingen uit deze voorwaarden overdragen aan een groepsmaatschappij, opvolger of partij bij een bedrijfsoverdracht, mits gebruikersrechten niet onredelijk worden aangetast. Jij mag je rechten en verplichtingen niet overdragen zonder onze voorafgaande toestemming, behalve waar de wet anders bepaalt. Deze voorwaarden vormen samen met de expliciet genoemde beleidsdocumenten de volledige overeenkomst tussen jou en Kwaapo.",
      },
    ],
  },
];

export function getTermsTocItems(): { id: string; number: number; title: string }[] {
  return TERMS_CHAPTERS.map((chapter) => ({
    id: chapter.id,
    number: chapter.number,
    title: chapter.title,
  }));
}

function collectTextFromBlock(block: TermsBlock): string[] {
  switch (block.type) {
    case "paragraph":
      return [block.text];
    case "subsection":
      return [...block.paragraphs, ...(block.bullets ?? [])];
    case "numbered":
    case "bullets":
      return block.items;
    case "notice":
      return [block.title, block.body];
    default:
      return [];
  }
}

export function findTermsPlaceholdersInContent(): string[] {
  const placeholderPattern = /\[[^[\]]+\]/g;
  const allText: string[] = [
    ...TERMS_SUMMARY_POINTS,
    TERMS_YOUTH_SUMMARY.title,
    ...TERMS_YOUTH_SUMMARY.items,
    TERMS_YOUTH_SUMMARY.disclaimer,
  ];

  for (const chapter of TERMS_CHAPTERS) {
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
  return Array.from(found).sort((a, b) => a.localeCompare(b));
}

export const TERMS_DEVELOPER_JURIST_NOTE =
  "Concepttekst voor productontwikkeling. Laat een bevoegde jurist deze voorwaarden volledig controleren en aanpassen voordat je publiceert.";

/**
 * DEVELOPER NOTE
 * Deze voorwaarden zijn bedoeld als uitgebreide productbasis en niet als definitief juridisch advies.
 * Publiceer deze tekst pas nadat een jurist de volledige inhoud, bedrijfsgegevens en compliance-risico's heeft gevalideerd.
 */
