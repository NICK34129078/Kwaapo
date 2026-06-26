/** Huidige seller policy-versie — verhoog bij inhoudelijke wijzigingen. */
export const CURRENT_SELLER_TERMS_VERSION = "2026-06-26";

/** TODO(juridisch): laat deze tekst reviewen vóór publieke livegang. */
export const SELLER_TERMS_SECTIONS: Array<{ title: string; body: string }> = [
  {
    title: "Jouw verantwoordelijkheid als verkoper",
    body:
      "Als verkoper ben je zelf verantwoordelijk voor het juist verpakken en verzenden van verkochte producten. Je moet elk verkocht product naar het afleveradres sturen dat bij de bestelling wordt weergegeven.",
  },
  {
    title: "Controle vóór verzending",
    body:
      "Controleer vóór verzending altijd het product, de variant of maat, de koper en het afleveradres. Markeer een bestelling alleen als verzonden wanneer het pakket daadwerkelijk is afgegeven of verzonden.",
  },
  {
    title: "Fouten en aansprakelijkheid",
    body:
      "Je bent verantwoordelijk voor fouten die ontstaan doordat je het verkeerde product, de verkeerde koper of het verkeerde afleveradres gebruikt. Het platform faciliteert de bestelling en betaling, maar neemt niet de praktische verzendhandeling van de seller over.",
  },
  {
    title: "Meldingen en badges",
    body:
      "Meldingen, badges en orderinformatie zijn hulpmiddelen. De seller blijft zelf verantwoordelijk voor tijdige en correcte verwerking van elke bestelling.",
  },
];

export const SELLER_TERMS_ACCEPT_LABEL =
  "Ik ga akkoord met de seller-voorwaarden en begrijp mijn verzendverantwoordelijkheid.";
