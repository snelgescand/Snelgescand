/**
 * MaatregelContextAdvies — maatwerk-tips en suggesties bij het bewerken van
 * één maatregel. Gebruikt de scan-data (BVO, verbruik, bouwjaar, schema) én
 * de andere geselecteerde maatregelen om relevante kaders te tonen.
 *
 * Voorbeelden van wisselwerking die we hier opvangen:
 *   - PV: aanbevolen aantal panelen op basis van huidig + verwacht verbruik
 *         (een warmtepomp en/of e-boiler verhogen het toekomstige verbruik fors)
 *   - PV: eigen-verbruik-ratio gaat omhoog bij een batterij / EMS
 *   - Warmtepomp: vermogen-schatting op basis van BVO + huidig gas
 *   - Isolatie: Rc-doelwaarde aanbeveling op basis van bouwjaar + renovatiejaar
 *   - LED: branduren schatting uit trainingsschema
 *
 * v29: nieuw component, integreert in MaatregelDetail.
 */

export interface ContextData {
  bvoM2?: number;
  bouwjaar?: number;
  renovatiejaar?: number;
  /** Gemeten stroomverbruik (kWh/jaar) uit stap 1 */
  stroomKwhPerJaar?: number;
  /** Gemeten gasverbruik (m³/jaar) uit stap 1 */
  gasM3PerJaar?: number;
  /** Elektra-aansluitvermogen in kW — voor "past dit erin?"-checks */
  aansluitVermogenKw?: number;
  /** Gas-aansluiting G-label — relevant voor "gasloos worden" advies */
  gasAansluitingLabel?: string;
  /** Aantal douchebeurten per week uit trainingsschema */
  douchesPerWeek?: number;
  /** Uren gebruik per week uit trainingsschema */
  urenPerWeek?: number;
  /** Totaal aantal teams */
  totaalTeams?: number;
  /** Aantal douchekoppen uit gebouwgegevens */
  aantalDouchekoppen?: number;
  /** IDs van andere geselecteerde maatregelen — bepaalt wisselwerking */
  andereMaatregelen: Set<string>;
}

export interface AdviesItem {
  /** kleur/stijl van de tegel */
  type: 'info' | 'kader' | 'waarschuwing' | 'suggestie';
  titel: string;
  body: string;
  /** Optionele klikbare suggestie die een veld invult */
  suggestie?: {
    pad: string;
    waarde: number;
    knopLabel: string;
  };
}

interface Props {
  maatregelId: string;
  context: ContextData;
  /** Huidige input van deze maatregel (voor "al ingevuld" checks) */
  huidigeInput: Record<string, unknown>;
  /** Klik op een suggestie-knop vult het veld in */
  onVulIn: (pad: string, waarde: number) => void;
}

export function MaatregelContextAdvies({ maatregelId, context, huidigeInput, onVulIn }: Props) {
  const adviezen = genereerAdviezen(maatregelId, context, huidigeInput);
  if (adviezen.length === 0) return null;

  return (
    <div className="bg-gradient-to-br from-primary-50/80 to-primary-50/30 border border-primary-200 rounded-lg p-4 space-y-3 mb-4">
      <div className="flex items-center gap-2">
        <span className="text-lg">💡</span>
        <h4 className="text-sm font-semibold text-primary-900">Maatwerk-advies voor deze maatregel</h4>
      </div>
      <p className="text-xs text-gray-600 -mt-1">
        Berekend uit jouw scan-data en andere geselecteerde maatregelen — neem als startpunt en pas aan voor de werkelijke situatie.
      </p>

      <div className="space-y-2">
        {adviezen.map((a, i) => <AdviesTegel key={i} item={a} onVulIn={onVulIn} />)}
      </div>
    </div>
  );
}

function AdviesTegel({ item, onVulIn }: { item: AdviesItem; onVulIn: (pad: string, waarde: number) => void }) {
  const stijl =
    item.type === 'waarschuwing' ? 'bg-yellow-50 border-yellow-300' :
    item.type === 'suggestie' ? 'bg-white border-primary-200' :
    item.type === 'kader' ? 'bg-white border-gray-200' :
    'bg-white/80 border-gray-200';

  const icoon =
    item.type === 'waarschuwing' ? '⚠️' :
    item.type === 'suggestie' ? '💡' :
    item.type === 'kader' ? '📐' :
    'ℹ️';

  return (
    <div className={`border rounded-md p-3 ${stijl}`}>
      <p className="text-sm font-medium text-gray-900 flex items-start gap-2">
        <span>{icoon}</span>
        <span>{item.titel}</span>
      </p>
      <p className="text-xs text-gray-700 mt-1 leading-relaxed pl-6">{item.body}</p>
      {item.suggestie && (
        <div className="pl-6 mt-2">
          <button
            type="button"
            onClick={() => onVulIn(item.suggestie!.pad, item.suggestie!.waarde)}
            className="text-xs bg-accent-orange text-white px-2.5 py-1 rounded hover:bg-accent-orange/90"
          >
            ↻ {item.suggestie.knopLabel}
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function fmt(n: number): string {
  return Math.round(n).toLocaleString('nl-NL');
}

/** Schatting extra stroomverbruik (kWh/jaar) bij overstap op warmtepomp.
 *  Gas-vraag × 9,77 (kWh/m³) / SCOP 3,5. Bij ontbreken gascijfer: 30 kWh/m². */
function schatExtraVerbruikWarmtepomp(ctx: ContextData): number {
  if (ctx.gasM3PerJaar && ctx.gasM3PerJaar > 0) {
    return Math.round(ctx.gasM3PerJaar * 9.77 / 3.5);
  }
  if (ctx.bvoM2) {
    return Math.round(ctx.bvoM2 * 30);
  }
  return 0;
}

function heeftWarmtepomp(ctx: ContextData): boolean {
  return ['qton-warmtepomp', 'lmnt-warmtepomp', 'lucht-water-warmtepomp', 'lucht-lucht-warmtepomp', 'hybride-warmtepomp']
    .some(id => ctx.andereMaatregelen.has(id));
}

function heeftBatterij(ctx: ContextData): boolean {
  return ctx.andereMaatregelen.has('batterij-uitgebreid') || ctx.andereMaatregelen.has('batterij-eenvoudig');
}

function heeftEms(ctx: ContextData): boolean {
  return ctx.andereMaatregelen.has('batterij-uitgebreid');
}

/** Rc-doelwaarde per bouwjaar/renovatiejaar — bij isolatie-investering wil je
 *  meestal naar het wettelijk niveau van NU (Bouwbesluit 2025): dak 6,3, gevel
 *  4,7, vloer 3,7. We adviseren altijd dat doel. */
const RC_DOEL = {
  dak: 6.3,
  gevel: 4.7,
  vloer: 3.7,
} as const;

// ============================================================
// Hoofdfunctie — dispatch op maatregel-ID
// ============================================================
export function genereerAdviezen(
  maatregelId: string,
  ctx: ContextData,
  huidigeInput: Record<string, unknown>,
): AdviesItem[] {
  switch (maatregelId) {
    case 'zonnepanelen':           return adviesZonnepanelen(ctx, huidigeInput);
    case 'batterij-uitgebreid':    return adviesBatterij(ctx, huidigeInput, true);
    case 'batterij-eenvoudig':     return adviesBatterij(ctx, huidigeInput, false);
    case 'qton-warmtepomp':        return adviesQtonWarmtepomp(ctx, huidigeInput);
    case 'lmnt-warmtepomp':        return adviesLmntWarmtepomp(ctx, huidigeInput);
    case 'lucht-water-warmtepomp': return adviesLuchtWaterWarmtepomp(ctx, huidigeInput);
    case 'lucht-lucht-warmtepomp': return adviesLuchtLuchtWarmtepomp(ctx, huidigeInput);
    case 'hybride-warmtepomp':     return adviesHybrideWarmtepomp(ctx, huidigeInput);
    case 'warmtepompboiler':       return adviesWarmtepompboiler(ctx, huidigeInput);
    case 'pvt-tapwater':           return adviesPvtTapwater(ctx, huidigeInput);
    case 'eboiler':                return adviesEboiler(ctx, huidigeInput);
    case 'dakisolatie':            return adviesIsolatie(ctx, huidigeInput, 'dak');
    case 'spouwmuurisolatie':      return adviesIsolatie(ctx, huidigeInput, 'gevel');
    case 'vloerisolatie':          return adviesIsolatie(ctx, huidigeInput, 'vloer');
    case 'binnenverlichting':      return adviesBinnenLed(ctx, huidigeInput);
    case 'ledveldverlichting':     return adviesVeldLed(ctx, huidigeInput);
    case 'wtw':                    return adviesWtw(ctx, huidigeInput);
    case 'waterzijdig-inregelen':  return adviesWaterzijdigInregelen(ctx);
    case 'glasisolatie':           return adviesGlas(ctx);
    default: return [];
  }
}

// ============================================================
// ZONNEPANELEN
// ============================================================
function adviesZonnepanelen(ctx: ContextData, huidigeInput: Record<string, unknown>): AdviesItem[] {
  const adviezen: AdviesItem[] = [];

  const huidigVerbruik = ctx.stroomKwhPerJaar ?? 0;
  const extraWP = heeftWarmtepomp(ctx) ? schatExtraVerbruikWarmtepomp(ctx) : 0;
  const extraEboiler = ctx.andereMaatregelen.has('eboiler') ? 8000 : 0;
  const totaalVerwacht = huidigVerbruik + extraWP + extraEboiler;

  // 1. Verwacht totaalverbruik (alleen tonen als er iets te zeggen valt)
  if (totaalVerwacht > 0) {
    const onderdelen: string[] = [];
    if (huidigVerbruik > 0) onderdelen.push(`huidig ${fmt(huidigVerbruik)} kWh`);
    if (extraWP > 0) onderdelen.push(`+ ${fmt(extraWP)} door warmtepomp`);
    if (extraEboiler > 0) onderdelen.push(`+ ${fmt(extraEboiler)} door e-boiler`);

    adviezen.push({
      type: 'info',
      titel: `Verwacht totaal stroomverbruik: ≈ ${fmt(totaalVerwacht)} kWh/jaar`,
      body: `Opbouw: ${onderdelen.join(', ')}. Houd hier rekening mee bij het aantal panelen — niet alleen het huidige verbruik.`,
    });
  }

  // 2. Aanbevolen aantal panelen (425 Wp standaard, 850 kWh/kWp/jaar in NL bij goede oriëntatie)
  const wpPerPaneel = (huidigeInput.wpPerPaneel as number) ?? 425;
  const instraling = (huidigeInput.instralingsfactor as number) ?? 0.85;
  const opbrengstPerPaneelKwh = (wpPerPaneel / 1000) * 850 * instraling;
  if (totaalVerwacht > 0 && opbrengstPerPaneelKwh > 0) {
    const aantal = Math.ceil(totaalVerwacht / opbrengstPerPaneelKwh);
    const m2Dak = Math.round(aantal * 1.8);
    adviezen.push({
      type: 'suggestie',
      titel: `Aanbevolen aantal panelen: ${aantal} (100% dekking)`,
      body: `Met ${wpPerPaneel} Wp-panelen en instralingsfactor ${instraling.toFixed(2)} levert 1 paneel ≈ ${Math.round(opbrengstPerPaneelKwh)} kWh/jaar. Nodig dakoppervlak ≈ ${m2Dak} m² (1,8 m²/paneel). Bij minder dak: vul minder in, dan dek je gedeeltelijk.`,
      suggestie: { pad: 'aantalPanelen', waarde: aantal, knopLabel: `Vul ${aantal} panelen in` },
    });
  } else if (huidigVerbruik === 0) {
    adviezen.push({
      type: 'waarschuwing',
      titel: 'Geen stroomverbruik bekend — vul stap 1 eerst in',
      body: 'Zonder gemeten stroomverbruik kan ik geen aanbevolen aantal panelen berekenen. Vul het kWh/jaar in bij sectie "Energie" van stap 1.',
    });
  }

  // 3. Eigen verbruik ratio
  let eigenVerbruik = 0.20; // basis sportclub
  const redenen: string[] = ['Sportclubs zijn dagrust → basis 15-25%'];
  if (heeftBatterij(ctx)) {
    eigenVerbruik += 0.25;
    redenen.push('+25% door batterij (avond-verbruik na zonsondergang)');
  }
  if (heeftEms(ctx)) {
    eigenVerbruik += 0.05;
    redenen.push('+5% door EMS (slimme aansturing)');
  }
  if (heeftWarmtepomp(ctx)) {
    eigenVerbruik += 0.05;
    redenen.push('+5% door warmtepomp (meer dagverbruik)');
  }
  eigenVerbruik = Math.min(0.65, eigenVerbruik);

  adviezen.push({
    type: 'suggestie',
    titel: `Aanbevolen aandeel eigen verbruik: ${(eigenVerbruik * 100).toFixed(0)}%`,
    body: `${redenen.join('. ')}. Vanaf 2027 loopt de saldering uit — eigen verbruik wordt dan financieel belangrijker dan teruglevering.`,
    suggestie: { pad: 'eigenVerbruikRatio', waarde: Math.round(eigenVerbruik * 100) / 100, knopLabel: `Vul ${(eigenVerbruik * 100).toFixed(0)}% in` },
  });

  // 4. Aansluit-check
  if (ctx.aansluitVermogenKw) {
    const aantalPanelen = (huidigeInput.aantalPanelen as number) ?? 0;
    const piekKw = (aantalPanelen * wpPerPaneel) / 1000;
    if (piekKw > 0 && piekKw > ctx.aansluitVermogenKw * 0.8) {
      adviezen.push({
        type: 'waarschuwing',
        titel: `Piekvermogen (${piekKw.toFixed(0)} kW) loopt tegen aansluiting (${ctx.aansluitVermogenKw.toFixed(0)} kW) aan`,
        body: 'Bij PV groter dan ~80% van de aansluitcapaciteit kun je tegen netcongestie / afregeling lopen. Overweeg een batterij + EMS, of een verzwaring van de aansluiting (laat installateur checken).',
      });
    }
  }

  return adviezen;
}

// ============================================================
// BATTERIJ
// ============================================================
function adviesBatterij(ctx: ContextData, huidigeInput: Record<string, unknown>, uitgebreid: boolean): AdviesItem[] {
  const adviezen: AdviesItem[] = [];

  const heeftPv = ctx.andereMaatregelen.has('zonnepanelen');
  if (!heeftPv) {
    adviezen.push({
      type: 'waarschuwing',
      titel: 'Geen PV geselecteerd — batterij is minder rendabel',
      body: 'Een batterij is meestal alleen interessant in combinatie met PV (om overschotten op te slaan). Zonder PV blijft alleen Peak Shaving + EPEX-handel over.',
    });
  }

  // Capaciteit-aanbeveling op basis van avondverbruik
  // Aanname: een middelgrote sportclub draait ~5 kW vermogen op een trainingsavond
  // Bij sterk schema (>20 uur/week, veel teams): 8-10 kW
  let avondKw = 5;
  if (ctx.urenPerWeek && ctx.urenPerWeek > 20) avondKw = 8;
  if (ctx.totaalTeams && ctx.totaalTeams > 15) avondKw = 10;
  const autonomie = (huidigeInput.urenAutonomieAvond as number) ?? 4;
  const aanbevolenKwh = avondKw * autonomie;
  adviezen.push({
    type: 'suggestie',
    titel: `Aanbevolen capaciteit: ≈ ${aanbevolenKwh} kWh`,
    body: `Schatting avondverbruik ${avondKw} kW × ${autonomie} uur autonomie = ${aanbevolenKwh} kWh. Bij ruime PV-overschotten kun je groter gaan; bij krappe PV kun je kleiner.`,
    suggestie: { pad: 'capaciteitKwh', waarde: aanbevolenKwh, knopLabel: `Vul ${aanbevolenKwh} kWh in` },
  });

  // Vermogen aanbeveling — 0,5C is een gangbare verhouding (capaciteit × 0,5)
  const aanbevolenKw = Math.max(5, Math.round(aanbevolenKwh * 0.5));
  adviezen.push({
    type: 'suggestie',
    titel: `Aanbevolen vermogen: ≈ ${aanbevolenKw} kW`,
    body: 'Vuistregel: 0,5C — vermogen is ongeveer half van capaciteit. Hoger vermogen geeft meer flexibiliteit voor Peak Shaving en handel, maar is duurder.',
    suggestie: { pad: 'vermogenKw', waarde: aanbevolenKw, knopLabel: `Vul ${aanbevolenKw} kW in` },
  });

  // Aansluit-check
  if (ctx.aansluitVermogenKw && aanbevolenKw > ctx.aansluitVermogenKw * 0.7) {
    adviezen.push({
      type: 'waarschuwing',
      titel: `Vermogen batterij benadert aansluiting`,
      body: `Aansluitcapaciteit ${ctx.aansluitVermogenKw.toFixed(0)} kW vs batterij ${aanbevolenKw} kW. Bij gelijktijdig vol-vermogen + lading van warmtepomp/PV → mogelijk netverzwaring nodig. EMS lost dit deels op.`,
    });
  }

  // Uitgebreide variant — value stacking
  if (uitgebreid) {
    adviezen.push({
      type: 'info',
      titel: 'Value Stacking: combineer 3-4 verdienmodellen',
      body: 'Een batterij verdient op meerdere fronten tegelijk: eigen verbruik PV, vermijden teruglever-boete, EPEX-arbitrage, Peak Shaving, FCR-netstabilisatie. Het EMS (Energy Management System) bepaalt elk kwartier wat de meeste waarde oplevert. Zie kennisbank-artikel "BESS verdienmodellen".',
    });
  }

  return adviezen;
}

// ============================================================
// WARMTEPOMPEN (4 varianten)
// ============================================================

function vermogenSchattingWarmtepomp(ctx: ContextData): number {
  // Vermogen kW = pieklast (W/m²) × BVO / 1000
  // Pieklast hangt af van isolatiestaat. We schatten conservatief 60 W/m² voor sportclub typisch.
  if (!ctx.bvoM2) return 0;
  const isolatieFactor = ctx.renovatiejaar && ctx.bouwjaar && (ctx.renovatiejaar - ctx.bouwjaar > 10) ? 0.7 : 1.0;
  return Math.round(ctx.bvoM2 * 60 * isolatieFactor / 1000);
}

function adviesQtonWarmtepomp(ctx: ContextData, _huidigeInput: Record<string, unknown>): AdviesItem[] {
  const adviezen: AdviesItem[] = [];

  // Aantal douches per dag bepalen
  if (ctx.douchesPerWeek && ctx.douchesPerWeek > 0) {
    const douchesPerDag = ctx.douchesPerWeek / 7;
    let aanbevolen: string;
    let kortLabel: string;
    if (douchesPerDag < 30) {
      aanbevolen = 'HMA30A (350 L tank, geschikt tot ~30 douches/dag)';
      kortLabel = 'HMA30A';
    } else if (douchesPerDag < 60) {
      aanbevolen = 'HMA45A (500 L tank, geschikt tot ~50-60 douches/dag)';
      kortLabel = 'HMA45A';
    } else {
      aanbevolen = '2x HMA45A in parallel of grotere variant (>60 douches/dag)';
      kortLabel = '2x HMA45A';
    }
    adviezen.push({
      type: 'suggestie',
      titel: `Aanbevolen Q-ton model: ${kortLabel}`,
      body: `Schema-data: ${ctx.douchesPerWeek} douches/week ≈ ${Math.round(douchesPerDag)} per dag. Daarmee past: ${aanbevolen}. Q-ton gebruikt CO₂ als koudemiddel — efficiënt voor warm water tot 90°C.`,
    });
  } else {
    adviezen.push({
      type: 'info',
      titel: 'Vul trainingsschema in stap 1 voor douche-schatting',
      body: 'Q-ton is vooral een warm-watertoestel. Zonder schema kan ik geen model adviseren — vul het schema in (eventueel met de 🎲 valsspeel-knop).',
    });
  }

  // Gas-besparing potentieel
  if (ctx.gasM3PerJaar && ctx.gasM3PerJaar > 0) {
    const gasAandeelDouches = 0.35; // typisch 35% van gas gaat naar warm water bij sportclub
    const besparingM3 = Math.round(ctx.gasM3PerJaar * gasAandeelDouches);
    adviezen.push({
      type: 'kader',
      titel: `Potentiële gasbesparing: ≈ ${fmt(besparingM3)} m³/jaar`,
      body: `Typisch gaat ~35% van het sportclub-gas naar warm water. Q-ton vervangt dat volledig. Combineer met eventueel afsluiten gasaansluiting als ook ruimteverwarming wordt geëlektrificeerd → check vermijdbaar vastrecht.`,
    });
  }

  // ISDE-tip
  adviezen.push({
    type: 'info',
    titel: 'ISDE-subsidie',
    body: 'Q-ton HMA30A: €2.500 · HMA45A: €3.700 ISDE-subsidie (zakelijke tabel, indicatief 2025). Aanvragen binnen 1 jaar na facturatie.',
  });

  return adviezen;
}

function adviesLmntWarmtepomp(ctx: ContextData, _huidigeInput: Record<string, unknown>): AdviesItem[] {
  const adviezen: AdviesItem[] = [];

  // LMNT is een laag-temperatuur lucht-water warmtepomp voor ruimteverwarming
  const vermogen = vermogenSchattingWarmtepomp(ctx);
  if (vermogen > 0) {
    adviezen.push({
      type: 'suggestie',
      titel: `Geschat benodigd vermogen: ≈ ${vermogen} kW`,
      body: `Schatting BVO ${ctx.bvoM2} m² × 60 W/m² pieklast${ctx.renovatiejaar ? ` (gecorrigeerd voor renovatie ${ctx.renovatiejaar})` : ''}. LMNT levert 100% bij lage afgiftetemperatuur — controleer of de radiatoren/vloerverwarming dat aankunnen.`,
    });
  }

  // Isolatie-check
  if (ctx.bouwjaar && ctx.bouwjaar < 1990 && !ctx.renovatiejaar) {
    adviezen.push({
      type: 'waarschuwing',
      titel: `Bouwjaar ${ctx.bouwjaar} — eerst isolatie?`,
      body: 'Een all-electric warmtepomp werkt het beste bij goede isolatie (Rc dak > 4, gevel > 3,5). Bij oud gebouw zonder renovatie: overweeg eerst dakisolatie of een hybride opstelling.',
    });
  }

  // Stroom extra
  const extra = schatExtraVerbruikWarmtepomp(ctx);
  if (extra > 0) {
    adviezen.push({
      type: 'kader',
      titel: `Extra stroomverbruik: ≈ ${fmt(extra)} kWh/jaar`,
      body: `Reken hiermee in PV-dimensionering. Huidig ${fmt(ctx.stroomKwhPerJaar ?? 0)} kWh wordt ≈ ${fmt((ctx.stroomKwhPerJaar ?? 0) + extra)} kWh. Aansluiting voldoende? Check elektra-aansluitwaarde stap 1.`,
    });
  }

  return adviezen;
}

function adviesLuchtWaterWarmtepomp(ctx: ContextData, _huidigeInput: Record<string, unknown>): AdviesItem[] {
  const adviezen: AdviesItem[] = [];
  const vermogen = vermogenSchattingWarmtepomp(ctx);
  if (vermogen > 0) {
    adviezen.push({
      type: 'suggestie',
      titel: `Geschat benodigd vermogen: ≈ ${vermogen} kW`,
      body: `BVO ${ctx.bvoM2} m² × 60 W/m². Bij lage buitentemperaturen (-10°C) levert lucht/water typisch 60-70% van nominaal — laat installateur dit dimensioneren met TRY-tabellen.`,
    });
  }
  if (ctx.bouwjaar && ctx.bouwjaar < 1990 && !ctx.renovatiejaar) {
    adviezen.push({
      type: 'waarschuwing',
      titel: 'Oudere bouw — afgiftesysteem checken',
      body: 'Lucht/water werkt het best bij afgiftetemperaturen 35-45°C. Bij hoge-temperatuur radiatoren wordt SCOP lager — overweeg hybride of eerst LT-vloerverwarming aanleggen.',
    });
  }
  const extra = schatExtraVerbruikWarmtepomp(ctx);
  if (extra > 0) {
    adviezen.push({
      type: 'kader',
      titel: `Extra stroomverbruik: ≈ ${fmt(extra)} kWh/jaar`,
      body: 'Significant voor de PV-dimensionering. Reken dit mee in het aantal panelen.',
    });
  }
  return adviezen;
}

function adviesLuchtLuchtWarmtepomp(ctx: ContextData, huidigeInput: Record<string, unknown>): AdviesItem[] {
  const adviezen: AdviesItem[] = [];

  // 1. Volume-suggestie obv BVO + plafondhoogte
  if (ctx.bvoM2) {
    // Aanname: lucht/lucht doet meestal kantine of zaalruimte — niet het hele gebouw.
    // We pakken ~50% van BVO als typische bezetting van een airco-systeem.
    const ruimteAandeel = 0.5;
    const plafondHoogte = 3;
    const volume = Math.round(ctx.bvoM2 * ruimteAandeel * plafondHoogte);
    adviezen.push({
      type: 'suggestie',
      titel: `Geschat ruimtevolume: ≈ ${fmt(volume)} m³`,
      body: `Aanname: lucht/lucht-airco verwarmt typisch ~50% van BVO (kantine + zaal, niet kleedkamers/douches). Bij ${fmt(ctx.bvoM2)} m² BVO × 50% × 3 m plafond = ${fmt(volume)} m³. Pas aan als je het exacte volume kent.`,
      suggestie: { pad: 'volumeM3', waarde: volume, knopLabel: `Vul ${fmt(volume)} m³ in` },
    });
  }

  // 2. Realistische prijs
  const huidigePrijs = (huidigeInput.prijsPerKwInclBtw as number) ?? 0;
  if (huidigePrijs === 0 || huidigePrijs > 900) {
    adviezen.push({
      type: 'suggestie',
      titel: 'Realistische marktprijs: € 500-700 per kW',
      body: 'Split-units (lucht/lucht) zijn aanmerkelijk goedkoper dan lucht/water-warmtepompen. Multi-split (1 buitenunit + 3-4 binnenunits): €600-700/kW. Single-split: €500-600/kW. Beide incl. installatie. Default in deze tool is nu €600/kW.',
      suggestie: { pad: 'prijsPerKwInclBtw', waarde: 600, knopLabel: 'Vul € 600/kW in' },
    });
  }

  // 3. Vergelijking met lucht/water
  if (ctx.andereMaatregelen.has('lucht-water-warmtepomp')) {
    adviezen.push({
      type: 'waarschuwing',
      titel: 'Je hebt al lucht/water-warmtepomp geselecteerd',
      body: 'Lucht/lucht én lucht/water tegelijk inzetten is meestal dubbel werk. Lucht/water doet het hele gebouw incl. tapwater; lucht/lucht is alleen voor specifieke ruimtes (kantine, zaal) zonder cv-aansluiting. Overweeg of je beide écht nodig hebt.',
    });
  } else {
    adviezen.push({
      type: 'info',
      titel: 'Lucht/lucht vs lucht/water — welke wanneer?',
      body: 'Lucht/lucht (deze): goedkoop, geen tapwater, alleen kantine/zaal zonder cv. Lucht/water: duurder, doet het hele gebouw + tapwater, vereist goede afgiftesysteem (vloerverwarming of LT-radiatoren). Voor een sportclub met aparte douche-installatie (Q-ton of warmtepompboiler) kan lucht/lucht prima voor de kantine zijn.',
    });
  }

  // 4. Isolatie-aanname effect
  if (ctx.bouwjaar && ctx.bouwjaar < 1990 && !ctx.renovatiejaar) {
    adviezen.push({
      type: 'waarschuwing',
      titel: `Bouwjaar ${ctx.bouwjaar} — kies "slecht" isolatieniveau`,
      body: 'Oudere gebouwen zonder renovatie hebben hoge warmtevraag per m³. Bij "slecht" isolatieniveau wordt het benodigde vermogen (en dus de prijs) groter. Bij twijfel: laat een installateur de werkelijke pieklast meten.',
    });
  }

  // 5. Aandeel gas-besparing
  if (ctx.gasM3PerJaar && ctx.gasM3PerJaar > 0) {
    const aandeel = (huidigeInput.aandeelRuimteverwarmingVanGas as number) ?? 0.3;
    const besparing = Math.round(ctx.gasM3PerJaar * aandeel);
    adviezen.push({
      type: 'kader',
      titel: `Geschatte gasbesparing: ≈ ${fmt(besparing)} m³/jaar`,
      body: `${fmt(ctx.gasM3PerJaar)} m³ huidig × ${(aandeel * 100).toFixed(0)}% aandeel ruimteverwarming = ${fmt(besparing)} m³ verschuiving van gas naar stroom. Houd hier rekening mee bij PV-dimensionering.`,
    });
  }

  return adviezen;
}

function adviesHybrideWarmtepomp(ctx: ContextData, _huidigeInput: Record<string, unknown>): AdviesItem[] {
  const adviezen: AdviesItem[] = [];
  const vermogen = Math.round(vermogenSchattingWarmtepomp(ctx) * 0.6); // hybride dekt ~60-70% van pieklast
  if (vermogen > 0) {
    adviezen.push({
      type: 'suggestie',
      titel: `Geschat WP-deelvermogen: ≈ ${vermogen} kW`,
      body: 'Bij hybride dekt de warmtepomp ~60-70% van de jaarlijkse warmtevraag; de CV-ketel springt bij in piekkou. Vermogen WP-deel = ~60% van vol-vermogen.',
    });
  }
  adviezen.push({
    type: 'info',
    titel: 'Goede tussenstap voor oudere gebouwen',
    body: 'Hybride is ideaal als isolatie nog niet op niveau is voor all-electric. De gasaansluiting blijft (dus geen vastrecht-besparing), maar gas-verbruik daalt 60-80%. Latere upgrade naar all-electric mogelijk wanneer isolatie verbeterd is.',
  });
  if (ctx.gasM3PerJaar && ctx.gasM3PerJaar > 0) {
    const besparing = Math.round(ctx.gasM3PerJaar * 0.70);
    adviezen.push({
      type: 'kader',
      titel: `Verwachte gasbesparing: ≈ ${fmt(besparing)} m³/jaar`,
      body: `Typisch 70% besparing op gas bij hybride. Bij ${fmt(ctx.gasM3PerJaar)} m³ huidig → ${fmt(ctx.gasM3PerJaar - besparing)} m³ restant.`,
    });
  }
  return adviezen;
}

function adviesWarmtepompboiler(ctx: ContextData, _huidigeInput: Record<string, unknown>): AdviesItem[] {
  const adviezen: AdviesItem[] = [];
  if (ctx.douchesPerWeek && ctx.douchesPerWeek > 0) {
    const douchesPerDag = ctx.douchesPerWeek / 7;
    if (douchesPerDag > 30) {
      adviezen.push({
        type: 'waarschuwing',
        titel: `${Math.round(douchesPerDag)} douches/dag — boiler mogelijk onvoldoende`,
        body: 'Standaard warmtepompboilers hebben 200-300 L tank — voldoende voor ~15-25 douches/dag. Bij dit gebruik: overweeg Q-ton of meerdere boilers in cascade.',
      });
    } else {
      adviezen.push({
        type: 'info',
        titel: `${Math.round(douchesPerDag)} douches/dag — past binnen één boiler`,
        body: 'Een standaard 200-300 L warmtepompboiler kan dit aan. Plaats wel zodanig dat lucht-aanvoer goed is (technische ruimte ≥ 20 m³).',
      });
    }
  }
  adviezen.push({
    type: 'info',
    titel: 'ISDE-subsidie',
    body: '€750 - €1.500 ISDE-subsidie per unit (zakelijke tabel). Combineer met PV voor maximaal eigen verbruik.',
  });
  return adviezen;
}

function adviesPvtTapwater(ctx: ContextData, _huidigeInput: Record<string, unknown>): AdviesItem[] {
  return [
    {
      type: 'info',
      titel: 'PVT-panelen voor tapwater',
      body: `PVT combineert PV met thermische opwekking — perfect bij hoge warm-watervraag (douches). ${ctx.douchesPerWeek ? `${ctx.douchesPerWeek} douches/week vraagt ~${Math.round(ctx.douchesPerWeek * 17.5)} L warm water/week.` : 'Vul schema in voor schatting warmwatervraag.'} Dakoppervlak nodig: typisch 25-40 m² per 1000 L tank/dag.`,
    },
    {
      type: 'kader',
      titel: 'Combineert met PV — niet vervangt',
      body: 'PVT vervangt geen reguliere PV; het is een aanvulling. Dakplan: eerst maximale reguliere PV inschatten, dan kijken of PVT op een aparte sectie kan voor tapwater-piek.',
    },
  ];
}

function adviesEboiler(ctx: ContextData, _huidigeInput: Record<string, unknown>): AdviesItem[] {
  const adviezen: AdviesItem[] = [];
  adviezen.push({
    type: 'info',
    titel: 'E-boiler: alleen rendabel met overschot-PV of nachtstroom',
    body: 'Een e-boiler heeft een rendement van ~95% (vs warmtepompboiler 250-300%). Alleen interessant als je veel PV-overschot hebt of dynamische contracten met negatieve uren.',
  });
  if (!ctx.andereMaatregelen.has('zonnepanelen')) {
    adviezen.push({
      type: 'waarschuwing',
      titel: 'Zonder PV: e-boiler bijna nooit rendabel',
      body: 'Een warmtepompboiler is bijna altijd beter bij standaard stroom-contract. Overweeg eerst PV erbij, dan e-boiler.',
    });
  }
  return adviezen;
}

// ============================================================
// ISOLATIE
// ============================================================
function adviesIsolatie(ctx: ContextData, _huidigeInput: Record<string, unknown>, deel: 'dak' | 'gevel' | 'vloer'): AdviesItem[] {
  const adviezen: AdviesItem[] = [];

  // Renovatie-effect
  if (ctx.bouwjaar && ctx.renovatiejaar && ctx.renovatiejaar > ctx.bouwjaar + 5) {
    adviezen.push({
      type: 'info',
      titel: `Renovatie in ${ctx.renovatiejaar} — check of dit deel meegegaan is`,
      body: `Het pand is in ${ctx.renovatiejaar} gerenoveerd (bouwjaar ${ctx.bouwjaar}). Vraag het bestuur of het ${deel} toen ook is aangepakt. Zo ja: de Rc-waarde is waarschijnlijk hoger dan de standaard-aanname uit het bouwjaar.`,
    });
  } else if (ctx.bouwjaar) {
    adviezen.push({
      type: 'info',
      titel: `Verwachte huidige Rc ${deel}: standaard uit bouwjaar ${ctx.bouwjaar}`,
      body: 'De suggestieknop bij "Huidige Rc-waarde" gebruikt deze tabel-aanname. Pas aan als je betere bron-data hebt (energielabel, eerdere maatregelen).',
    });
  }

  // Doel-Rc
  const doel = RC_DOEL[deel];
  adviezen.push({
    type: 'suggestie',
    titel: `Aanbevolen doel-Rc na isolatie: ${doel} m²·K/W`,
    body: `Dit is het wettelijke niveau (Bouwbesluit 2025) voor ${deel}. Subsidies (ISDE, DUMAVA) vereisen vaak deze minimumwaarde. Goedkopere isolatie naar Rc 3,5-4,0 levert minder besparing én geen subsidie.`,
    suggestie: { pad: 'nieuweRcWaarde', waarde: doel, knopLabel: `Vul ${doel} in als doel-Rc` },
  });

  // Oppervlakte-tip
  if (ctx.bvoM2) {
    const verwachtOppervlak = deel === 'dak' ? ctx.bvoM2 : deel === 'gevel' ? ctx.bvoM2 * 0.7 : ctx.bvoM2;
    const label = deel === 'gevel' ? 'gevel (schatting ~70% van BVO)' : `${deel} (≈ BVO)`;
    adviezen.push({
      type: 'kader',
      titel: `Geschat oppervlak ${label}: ≈ ${fmt(verwachtOppervlak)} m²`,
      body: 'Bij plat dak (sportkantine vaak) = ongeveer gelijk aan BVO. Bij schuin dak: BVO × 1,15. Meet altijd na op de plattegrond als die beschikbaar is.',
    });
  }

  return adviezen;
}

// ============================================================
// LED VERLICHTING
// ============================================================
function adviesBinnenLed(ctx: ContextData, _huidigeInput: Record<string, unknown>): AdviesItem[] {
  const adviezen: AdviesItem[] = [];

  // Branduren schatting
  if (ctx.urenPerWeek && ctx.urenPerWeek > 0) {
    // Binnen-verlichting brandt ~1,5x de actieve uren (voorbereiding, opruim, kantine)
    const brandurenPerJaar = Math.round(ctx.urenPerWeek * 1.5 * 50);
    adviezen.push({
      type: 'suggestie',
      titel: `Geschatte branduren: ≈ ${fmt(brandurenPerJaar)} uur/jaar`,
      body: `Schema-uren ${ctx.urenPerWeek}/week × 1,5 (voor/na + kantine) × 50 weken. Pas aan voor 7-dagen kantinegebruik of avondopen evenementen.`,
      suggestie: { pad: 'brandurenPerJaar', waarde: brandurenPerJaar, knopLabel: `Vul ${fmt(brandurenPerJaar)} uur in` },
    });
  }

  // Aantal armaturen schatting
  if (ctx.bvoM2) {
    const armaturen = Math.ceil(ctx.bvoM2 / 12); // gemiddeld 1 armatuur per 10-15 m² in kantine/kleedkamer
    adviezen.push({
      type: 'kader',
      titel: `Geschat aantal armaturen: ≈ ${armaturen}`,
      body: `Vuistregel: 1 armatuur per ≈12 m² (kantine, kleedkamers, gangen). Voor sporthallen geldt een andere norm — gebruik veldverlichting i.p.v. binnenverlichting.`,
    });
  }

  return adviezen;
}

function adviesVeldLed(ctx: ContextData, _huidigeInput: Record<string, unknown>): AdviesItem[] {
  const adviezen: AdviesItem[] = [];
  adviezen.push({
    type: 'info',
    titel: 'Veldverlichting LED — typisch 60-70% besparing',
    body: 'Van halogeen/gasontlading naar LED bespaart 60-70% stroom. Plus: instant aan/uit (geen warmlooptijd) → kortere brandtijd mogelijk. KNVB-/sportbond-eisen voor lichtsterkte (lux) blijven gelijk — kies armaturen met passende lichtopbrengst.',
  });
  if (ctx.urenPerWeek) {
    const veldUren = Math.round(ctx.urenPerWeek * 30 * 0.6); // alleen avonden in donker seizoen
    adviezen.push({
      type: 'kader',
      titel: `Geschatte veldverlichting-branduren: ≈ ${fmt(veldUren)} uur/jaar`,
      body: 'Aanname: 30 weken donker seizoen × 60% van schema-uren in avond. Pas aan voor zomertraining of grote toernooien.',
    });
  }
  return adviezen;
}

// ============================================================
// OVERIG
// ============================================================
function adviesWtw(ctx: ContextData, _huidigeInput: Record<string, unknown>): AdviesItem[] {
  const adviezen: AdviesItem[] = [];
  if (ctx.bvoM2) {
    // Luchtdebiet voor sportkantine ~3-4 m³/(h·m²)
    const debiet = Math.round(ctx.bvoM2 * 3.5);
    adviezen.push({
      type: 'kader',
      titel: `Indicatief luchtdebiet WTW: ≈ ${fmt(debiet)} m³/h`,
      body: `BVO ${ctx.bvoM2} m² × 3,5 m³/(h·m²) — gangbaar voor kantine + kleedkamers. Sporthallen vragen meer (5-7 m³/(h·m²)).`,
    });
  }
  adviezen.push({
    type: 'info',
    titel: 'WTW combineert goed met warmtepomp',
    body: 'WTW vermindert de warmtevraag aan ruimteverwarming met 60-80% van de ventilatie-vermindering. Bij overstap naar warmtepomp wordt deze besparing groter (CV-rendement vs warmtepomp-COP).',
  });
  return adviezen;
}

function adviesWaterzijdigInregelen(ctx: ContextData): AdviesItem[] {
  return [
    {
      type: 'info',
      titel: 'Snelste no-regret maatregel',
      body: 'Waterzijdig inregelen kost weinig (typisch €500-1500) en bespaart 5-10% op gas. Verplicht voorbereiding voor latere warmtepomp-overstap (anders SCOP nooit goed).',
    },
    ...(ctx.gasM3PerJaar ? [{
      type: 'kader' as const,
      titel: `Verwachte gasbesparing: ≈ ${fmt(ctx.gasM3PerJaar * 0.075)} m³/jaar`,
      body: `7,5% van ${fmt(ctx.gasM3PerJaar)} m³ huidig gasverbruik — middenwaarde van 5-10% besparing.`,
    }] : []),
  ];
}

function adviesGlas(ctx: ContextData): AdviesItem[] {
  return [
    {
      type: 'info',
      titel: 'Voer per ruimte het glas-type in',
      body: ctx.bouwjaar && ctx.bouwjaar < 1985
        ? `Bouwjaar ${ctx.bouwjaar}: vermoedelijk enkel glas of vroeg dubbel. Loop ruimte voor ruimte na — vaak is kantine al vervangen, kleedkamers nog niet.`
        : 'Loop het gebouw door en noteer per ruimte: enkel, dubbel HR, dubbel HR+, HR++, triple. Vaak gemixt: kantine modern, kleedkamers oud.',
    },
    {
      type: 'kader',
      titel: 'Triple glas alleen rendabel bij hele goede isolatie elders',
      body: 'Triple is duur en zwaar. Als dak/gevel niet op Rc > 4 zit: HR++ is meestal slimmer. Bij volledig gerenoveerd pand met goede isolatie: triple wel zinvol.',
    },
  ];
}
