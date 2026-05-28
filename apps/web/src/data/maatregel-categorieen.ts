/**
 * Maatregel-categorieën voor stap 2.
 *
 * Groepeert maatregelen logisch zodat de gebruiker:
 *  1. snel ziet welke maatregelen bij elkaar horen (douches vs ruimteverwarming vs stroom)
 *  2. per categorie een slimme suggestie krijgt op basis van scan-data uit stap 1
 *  3. begrijpt welke maatregelen elkaar uitsluiten (bv. lucht-water VS hybride VS Q-ton)
 */

export type Categorie =
  | 'tapwater'
  | 'ruimteverwarming'
  | 'schil'
  | 'opwekking'
  | 'verbruik'
  | 'water'
  | 'overig';

export interface CategorieInfo {
  id: Categorie;
  titel: string;
  icoon: string;
  omschrijving: string;
  /** Volgorde in stap 2 */
  volgorde: number;
}

export const CATEGORIEEN: CategorieInfo[] = [
  {
    id: 'tapwater',
    titel: 'Warm tapwater (douches & kraan)',
    icoon: '🚿',
    omschrijving: 'Hoge temperatuur (60-65°C). Sportclubs verbruiken vaak veel warm water voor douches.',
    volgorde: 1,
  },
  {
    id: 'ruimteverwarming',
    titel: 'Ruimteverwarming (CV-water)',
    icoon: '🔥',
    omschrijving: 'Lage temperatuur (35-55°C). Kantine, kleedkamers, gangen. Werkt het best met goed geïsoleerd gebouw.',
    volgorde: 2,
  },
  {
    id: 'schil',
    titel: 'Gebouwschil & isolatie',
    icoon: '🏠',
    omschrijving: 'Eerst isoleren, dan verwarmen. Voorkomt energieverlies via dak, gevel, vloer en ramen.',
    volgorde: 3,
  },
  {
    id: 'opwekking',
    titel: 'Eigen opwekking & opslag',
    icoon: '☀️',
    omschrijving: 'Zonnepanelen, eventueel batterij. Bij sportclubs ligt vraag vooral in avond/weekend.',
    volgorde: 4,
  },
  {
    id: 'verbruik',
    titel: 'Stroomverbruik verminderen',
    icoon: '💡',
    omschrijving: 'LED-verlichting binnen en op de velden — vaak grootste stroomverbruiker bij sportclub.',
    volgorde: 5,
  },
  {
    id: 'water',
    titel: 'Waterbesparing',
    icoon: '💧',
    omschrijving: 'Toiletten en waterloze armaturen — bespaart drinkwater en daarmee kosten.',
    volgorde: 6,
  },
  {
    id: 'overig',
    titel: 'Overige optimalisaties',
    icoon: '⚙️',
    omschrijving: 'Inregelen, ventilatie en meer.',
    volgorde: 7,
  },
];

/** Maatregel-ID → categorie */
export const MAATREGEL_CATEGORIE: Record<string, Categorie> = {
  // Tapwater
  'douches-analyse': 'tapwater',
  'qton-warmtepomp': 'tapwater',
  'warmtepompboiler': 'tapwater',
  'eboiler': 'tapwater',
  'boiler-dimensionering': 'tapwater',
  'pvt-tapwater': 'tapwater',

  // Ruimteverwarming (CV)
  'lucht-water-warmtepomp': 'ruimteverwarming',
  'lucht-lucht-warmtepomp': 'ruimteverwarming',
  'hybride-warmtepomp': 'ruimteverwarming',
  'lmnt-warmtepomp': 'ruimteverwarming',
  'waterzijdig-inregelen': 'ruimteverwarming',
  'wtw': 'ruimteverwarming',

  // Schil
  'dakisolatie': 'schil',
  'spouwmuurisolatie': 'schil',
  'vloerisolatie': 'schil',
  'glasisolatie': 'schil',

  // Opwekking
  'zonnepanelen': 'opwekking',
  'batterij-eenvoudig': 'opwekking',
  'batterij-uitgebreid': 'opwekking',
  'batterij-tijdreeks': 'opwekking',

  // Verbruik
  'binnenverlichting': 'verbruik',
  'ledveldverlichting': 'verbruik',
};

/**
 * Welke maatregelen voor warm water/verwarming kunnen wat?
 *
 * Sommige warmtepompen doen alleen tapwater (hoge T, ~60°C), andere alleen CV-water
 * (lage T, ~40°C), en sommige kunnen ALLEBEI dankzij CO₂ als koudemiddel of een
 * bypass-systeem.
 */
export type WarmtepompType = 'tapwater' | 'cv' | 'beide';

export const WARMTEPOMP_TYPE: Record<string, WarmtepompType> = {
  'qton-warmtepomp': 'tapwater',         // Q-ton CO₂ levert 90°C — ALLEEN tapwater (geen LT-CV mogelijk)
  'pvt-tapwater': 'tapwater',
  'warmtepompboiler': 'tapwater',
  'eboiler': 'tapwater',
  'lucht-water-warmtepomp': 'cv',        // Typisch lage T (35-55°C)
  'lucht-lucht-warmtepomp': 'cv',        // Lucht (kan ook koelen)
  'hybride-warmtepomp': 'cv',            // CV-vervanger ipv tapwater
  'lmnt-warmtepomp': 'beide',            // LMNT (lucht/water modulair) kan tap én CV
};

/**
 * Slimme suggestie per categorie op basis van scan-data uit stap 1.
 *
 * Krijgt de project-context en retourneert tekstadvies + relevante context-cijfers.
 */
export interface ScanContext {
  bvoM2?: number;
  bouwjaar?: number;
  gasM3PerJaar?: number;
  elektriciteitKwhPerJaar?: number;
  aantalDouchekoppen?: number;
  /** Berekend uit trainingsschema: douches per week */
  douchesPerWeek?: number;
  /** Berekend: gas voor douches/jaar */
  gasDouchePerJaar?: number;
  /** Berekend: gas voor verwarming/jaar */
  gasRuimteverwarmingPerJaar?: number;
  /** Gebouw isolatie-score 0-100 uit huidige situatie */
  schilScore?: number;
}

export interface Suggestie {
  korteSamenvatting: string;
  uitleg: string;
  context: Array<{ label: string; waarde: string }>;
  /** Aanbevolen maatregel-IDs binnen deze categorie (in volgorde van prioriteit) */
  aanbevolen?: string[];
  /** Vergelijking van varianten als die er zijn */
  vergelijking?: Array<{
    titel: string;
    type: WarmtepompType;
    voordelen: string[];
    nadelen: string[];
    gechiktVoor: string;
  }>;
}

export function bouwSuggestie(categorie: Categorie, ctx: ScanContext): Suggestie | null {
  switch (categorie) {
    case 'tapwater':
      return tapwaterSuggestie(ctx);
    case 'ruimteverwarming':
      return ruimteverwarmingSuggestie(ctx);
    case 'schil':
      return schilSuggestie(ctx);
    case 'opwekking':
      return opwekkingSuggestie(ctx);
    case 'verbruik':
      return verbruikSuggestie(ctx);
    case 'water':
      return waterSuggestie(ctx);
    default:
      return null;
  }
}

function fmt(n: number | undefined, eenheid = ''): string {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString('nl-NL') + (eenheid ? ' ' + eenheid : '');
}

function tapwaterSuggestie(ctx: ScanContext): Suggestie {
  const douchesPerWeek = ctx.douchesPerWeek ?? 0;
  const veelDouches = douchesPerWeek > 200;
  const veelGasDouche = (ctx.gasDouchePerJaar ?? 0) > 2000;

  const context = [
    { label: 'Douches per week', waarde: fmt(ctx.douchesPerWeek) },
    { label: 'Gas voor douches/jaar', waarde: fmt(ctx.gasDouchePerJaar, 'm³') },
    { label: 'Aantal douchekoppen', waarde: fmt(ctx.aantalDouchekoppen) },
  ];

  let korteSamenvatting: string;
  let uitleg: string;
  let aanbevolen: string[];

  if (veelDouches || veelGasDouche) {
    korteSamenvatting = 'Veel warm tapwater nodig — focus op tapwater-warmtepomp';
    uitleg = `Met ${fmt(douchesPerWeek)} douches per week is dit een grote energie-post. ` +
      `Een Q-ton CO₂-warmtepomp is hier ideaal: hoge temperatuur (tot 90°C), uitstekend voor douche-warmwater. ` +
      `Let op: een Q-ton levert alléén tapwater — voor ruimteverwarming is een aparte (lucht/water-)warmtepomp nodig. ` +
      `PVT-collectoren combineren stroom en warm water — ` +
      `interessant als je het dak nog niet vol hebt liggen met gewone PV.`;
    aanbevolen = ['qton-warmtepomp', 'pvt-tapwater', 'boiler-dimensionering'];
  } else if (douchesPerWeek > 50) {
    korteSamenvatting = 'Gemiddeld warm-water-gebruik — warmtepompboiler is voldoende';
    uitleg = `Met ${fmt(douchesPerWeek)} douches per week is een warmtepompboiler vaak een goede balans ` +
      `tussen investering en besparing. Q-ton is overkill als de vraag-pieken klein blijven. ` +
      `Alleen interessant bij seizoens-pieken (wedstrijddagen).`;
    aanbevolen = ['warmtepompboiler', 'boiler-dimensionering'];
  } else {
    korteSamenvatting = 'Beperkt tapwater-gebruik — eenvoudige e-boiler voldoet';
    uitleg = `Met ${fmt(douchesPerWeek)} douches per week is de warm-water-vraag laag. ` +
      `Een e-boiler aangestuurd door PV is dan simpeler en goedkoper dan een warmtepomp.`;
    aanbevolen = ['eboiler'];
  }

  const vergelijking = [
    {
      titel: 'Q-ton CO₂-warmtepomp',
      type: 'tapwater' as const,
      voordelen: [
        'Hoge temperatuur (tot 90°C) → ideaal voor douches',
        'CO₂ als koudemiddel (geen F-gassen)',
        'Alleen voor TAPWATER (90°C is te hoog voor LT-CV)',
        'Hoge SCOP (>3,5) bij sportclub-profielen',
      ],
      nadelen: [
        'Hoge investering (€40-55k incl. boilervat)',
        'Buitenunit nodig — geluid en ruimte',
        'Voor ruimteverwarming heb je een aparte WP nodig (of kies LMNT)',
      ],
      gechiktVoor: 'Sportclubs met >200 douches/week of >2000 m³ gas/jaar douche',
    },
    {
      titel: 'Warmtepompboiler',
      type: 'tapwater' as const,
      voordelen: [
        'Lagere investering (€5-15k)',
        'Binnen op te stellen (technische ruimte)',
        'Simpele installatie',
      ],
      nadelen: [
        'Lagere temperatuur dan Q-ton — soms naverwarming nodig',
        'Beperkt vermogen — voor pieken extra buffer nodig',
      ],
      gechiktVoor: 'Sportclubs met 50-200 douches/week',
    },
    {
      titel: 'PVT-collectoren',
      type: 'tapwater' as const,
      voordelen: [
        'Combineert PV én warm water — efficient daklicht',
        'Verlengt de levensduur van PV (door koeling)',
        'Voorverwarming van douche-water bespaart gas',
      ],
      nadelen: [
        'Specialistische installateur nodig',
        'Werkt vooral in zomer (lage opbrengst winter)',
        'Verlies bij hoge buitentemperatuur',
      ],
      gechiktVoor: 'Clubs met onbenutte dakruimte en seizoens-piek (zomer)',
    },
  ];

  return { korteSamenvatting, uitleg, context, aanbevolen, vergelijking };
}

function ruimteverwarmingSuggestie(ctx: ScanContext): Suggestie {
  const gasTotaal = ctx.gasM3PerJaar ?? 0;
  const gasRuimte = ctx.gasRuimteverwarmingPerJaar ?? (gasTotaal * 0.55);
  const slechtIsolatie = (ctx.schilScore ?? 50) < 40;
  const bouwjaarOud = (ctx.bouwjaar ?? 2000) < 1992;

  const context = [
    { label: 'Gas ruimteverwarming/jaar', waarde: fmt(Math.round(gasRuimte), 'm³') },
    { label: 'BVO', waarde: fmt(ctx.bvoM2, 'm²') },
    { label: 'Bouwjaar', waarde: fmt(ctx.bouwjaar) },
    { label: 'Isolatie-score (stap 1)', waarde: ctx.schilScore !== undefined ? `${ctx.schilScore}/100` : '—' },
  ];

  let korteSamenvatting: string;
  let uitleg: string;
  let aanbevolen: string[];

  if (slechtIsolatie || bouwjaarOud) {
    korteSamenvatting = 'Eerst isoleren — daarna warmtepomp';
    uitleg = `${bouwjaarOud ? `Bouwjaar ${ctx.bouwjaar}: ` : ''}Het gebouw lijkt matig of slecht geïsoleerd. ` +
      `Een lucht-water warmtepomp werkt het BEST met goede isolatie (Rc ≥ 3,5 voor dak). ` +
      `Tijdelijke oplossing: hybride warmtepomp (combinatie WP + bestaande CV-ketel) — vangt pieken op. ` +
      `Investeer eerst in dakisolatie + HR++-glas, dan pas in een full-electric warmtepomp.`;
    aanbevolen = ['hybride-warmtepomp', 'waterzijdig-inregelen', 'wtw'];
  } else if (gasRuimte > 5000) {
    korteSamenvatting = 'Veel ruimteverwarming — full-electric warmtepomp interessant';
    uitleg = `Met ca. ${fmt(Math.round(gasRuimte))} m³ gas voor verwarming is een lucht-water warmtepomp ` +
      `(volledig elektrisch) financieel aantrekkelijk. Bij goede isolatie haal je SCOP ~3,5. ` +
      `Combineer met PV voor lagere stroomkosten. Bij twijfel of de isolatie wel klopt: kies hybride.`;
    aanbevolen = ['lucht-water-warmtepomp', 'hybride-warmtepomp', 'waterzijdig-inregelen'];
  } else {
    korteSamenvatting = 'Beperkte ruimteverwarming-vraag — optimaliseer eerst';
    uitleg = `Het gas-verbruik voor verwarming is relatief beperkt. ` +
      `Begin met waterzijdig inregelen (kost weinig, levert 5-15% besparing op). ` +
      `Een grote investering in een warmtepomp is hier minder snel terugverdiend.`;
    aanbevolen = ['waterzijdig-inregelen', 'hybride-warmtepomp'];
  }

  const vergelijking = [
    {
      titel: 'Lucht-water warmtepomp (full-electric)',
      type: 'cv' as const,
      voordelen: [
        'Vervangt CV-ketel volledig — gasloos',
        'Lage CO₂-uitstoot',
        'Subsidie ISDE/SCE beschikbaar',
      ],
      nadelen: [
        'Vereist goed geïsoleerd gebouw (Rc ≥ 3,5)',
        'Hoge investering (€25-40k)',
        'Kan moeite hebben met piekvraag (koudste dagen)',
      ],
      gechiktVoor: 'Geïsoleerde gebouwen, bouwjaar ≥1992 of na-geïsoleerd',
    },
    {
      titel: 'Hybride warmtepomp',
      type: 'cv' as const,
      voordelen: [
        'Werkt met BESTAANDE CV-ketel als backup',
        'Lagere investering (€8-15k)',
        'Pakt 60-80% van de gasvraag weg',
        'Subsidie ISDE',
      ],
      nadelen: [
        'CV-ketel blijft nodig (gas)',
        'Vervanging niet 100% gasloos',
      ],
      gechiktVoor: 'Matig geïsoleerde gebouwen of tussenstap voor later',
    },
    {
      titel: 'LMNT voor zowel tapwater als CV',
      type: 'beide' as const,
      voordelen: [
        'Eén lucht/water-systeem voor douches ÉN ruimteverwarming',
        'Modulair op te schalen (5-150 kW per unit)',
        'Tapwater 55-65°C, ruimteverwarming op LT 35-50°C',
      ],
      nadelen: [
        'Vereist LT-afgiftesysteem voor verwarming (vloer of LT-radiator)',
        'Buffer + legionellaboiler nodig (lagere T dan Q-ton)',
        'Vermogen moet beide pieken aankunnen — 25-50 kW typisch',
      ],
      gechiktVoor: 'Clubs met douche-vraag én verwarmings-vraag, mét LT-afgifte (Q-ton kan dit NIET — alleen tapwater)',
    },
  ];

  return { korteSamenvatting, uitleg, context, aanbevolen, vergelijking };
}

function schilSuggestie(ctx: ScanContext): Suggestie {
  const score = ctx.schilScore ?? 50;
  const bouwjaar = ctx.bouwjaar ?? 2000;

  const context = [
    { label: 'Bouwjaar', waarde: fmt(bouwjaar) },
    { label: 'BVO', waarde: fmt(ctx.bvoM2, 'm²') },
    { label: 'Isolatie-score (stap 1)', waarde: `${score}/100` },
  ];

  let korteSamenvatting: string;
  let uitleg: string;
  let aanbevolen: string[];

  if (score < 30) {
    korteSamenvatting = 'Schil is een groot probleem — begin hier';
    uitleg = `Score ${score}/100: de gebouwschil is slecht geïsoleerd. ` +
      `Elke euro die je hier investeert, vermindert direct alle andere kosten (verwarming, warmtepomp-dimensionering). ` +
      `Begin met dakisolatie (Rc 6,0) en HR++ glas — die hebben de kortste terugverdientijd.`;
    aanbevolen = ['dakisolatie', 'glasisolatie', 'spouwmuurisolatie', 'vloerisolatie'];
  } else if (score < 60) {
    korteSamenvatting = 'Schil matig — gerichte verbeteringen mogelijk';
    uitleg = `Score ${score}/100: er zijn nog wins te boeken. ` +
      `Kijk vooral naar dak en gevel: die hebben grote oppervlakken. ` +
      `Glas alleen vervangen als het nog enkel of oud-dubbel is.`;
    aanbevolen = ['dakisolatie', 'spouwmuurisolatie', 'glasisolatie'];
  } else {
    korteSamenvatting = 'Schil al redelijk goed — geen prioriteit';
    uitleg = `Score ${score}/100: de schil is al redelijk geïsoleerd. ` +
      `Focus liever op installaties (warmtepomp, PV) — daar zit nu meer rendement.`;
    aanbevolen = ['glasisolatie'];
  }

  return { korteSamenvatting, uitleg, context, aanbevolen };
}

function opwekkingSuggestie(ctx: ScanContext): Suggestie {
  const elek = ctx.elektriciteitKwhPerJaar ?? 0;
  const veel = elek > 30000;

  const context = [
    { label: 'Elektriciteitsverbruik/jaar', waarde: fmt(elek, 'kWh') },
    { label: 'BVO', waarde: fmt(ctx.bvoM2, 'm²') },
  ];

  let korteSamenvatting: string;
  let uitleg: string;
  let aanbevolen: string[];

  if (elek === 0) {
    korteSamenvatting = 'Vul eerst stroomverbruik in stap 1 in';
    uitleg = `Zonder elektriciteitsverbruik kan ik geen advies geven over PV-dimensionering.`;
    aanbevolen = ['zonnepanelen'];
  } else if (veel) {
    korteSamenvatting = 'Groot dakoppervlak benutten — PV + eventueel batterij';
    uitleg = `Met ${fmt(elek)} kWh/jaar verbruik is een PV-installatie van 30-80 kWp realistisch. ` +
      `Sportclubs hebben hun piekverbruik vooral in avond/weekend — een batterij kan helpen om PV-overschot ` +
      `'s avonds te benutten (avond-autonomie 4-5 uur). Belangrijk: vanaf 2027 wordt salderingsregeling afgebouwd, ` +
      `dus batterij wordt rendabeler.`;
    aanbevolen = ['zonnepanelen', 'batterij-eenvoudig', 'batterij-uitgebreid'];
  } else {
    korteSamenvatting = 'PV is meestal interessant — batterij later overwegen';
    uitleg = `Begin met zonnepanelen voor het dagverbruik. Bij beperkt verbruik is een batterij vaak nog niet rendabel — ` +
      `wacht tot de salderingsregeling afgebouwd is en de batterijprijzen verder dalen.`;
    aanbevolen = ['zonnepanelen'];
  }

  return { korteSamenvatting, uitleg, context, aanbevolen };
}

function verbruikSuggestie(ctx: ScanContext): Suggestie {
  const elek = ctx.elektriciteitKwhPerJaar ?? 0;

  const context = [
    { label: 'Elektriciteitsverbruik/jaar', waarde: fmt(elek, 'kWh') },
  ];

  return {
    korteSamenvatting: 'LED-verlichting bespaart vaak 50-70%',
    uitleg: `Bij veel sportclubs is veldverlichting + binnenverlichting samen verantwoordelijk voor 40-60% van het stroomverbruik. ` +
      `Vervanging door LED (vooral van halogeen of metaalhalide veldarmaturen) heeft een terugverdientijd van 3-6 jaar. ` +
      `Subsidie SCE en gemeentelijke regelingen vaak beschikbaar.`,
    context,
    aanbevolen: ['ledveldverlichting', 'binnenverlichting'],
  };
}

function waterSuggestie(ctx: ScanContext): Suggestie {
  const douches = ctx.douchesPerWeek ?? 0;

  const context = [
    { label: 'Douches per week', waarde: fmt(douches) },
  ];

  return {
    korteSamenvatting: 'Waterloze toiletten besparen drinkwater',
    uitleg: `Naast de douches verbruikt een sportclub ook veel water aan toiletten. ` +
      `Waterloze of urinaal-systemen kunnen 10.000-50.000 liter per jaar besparen. ` +
      `Lage investering, kort terug te verdienen.`,
    context,
  };
}
