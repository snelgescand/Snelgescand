/**
 * PPT-template endpoint.
 *
 * Genereert een verduurzamingsplan op basis van de ORIGINELE Sportief Opgewekt
 * template (86 slides met alle plaatjes, layout, branding). Doet drie dingen:
 *
 *   1. Tekst-placeholders vervangen ('naamvereniging' → clubnaam, [maand] → maand)
 *   2. Specifieke cijfer-placeholders ('…' / 'meer/minder') vervangen met
 *      berekende waardes (aantal douches, m³ water, energiebalans)
 *   3. Logo van de club embedden rechtsboven op slide 1
 *
 * Aanpak: een .pptx is een ZIP met XML-files per slide. Met JSZip laden we
 * de ZIP, doen string-replace op de tekst-XML, voegen het logo toe als
 * nieuwe media-file + relationship + <p:pic> shape, en re-zippen het geheel.
 * Plaatjes, layouts, themas, fonts — alles van de template blijft onaangeroerd.
 */

import type { FastifyInstance } from 'fastify';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { prisma } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = join(__dirname, '..', '..', 'templates', 'sportief-opgewekt-standaard.pptx');

const NEDERLANDSE_MAANDEN = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];

function huidigeMaandJaar(): string {
  const d = new Date();
  return `${NEDERLANDSE_MAANDEN[d.getMonth()]} ${d.getFullYear()}`;
}

/** Formatteer een getal met punt-duizendscheiding (Nederlands) */
function fmt(n: number, decimalen = 0): string {
  return n.toLocaleString('nl-NL', { minimumFractionDigits: decimalen, maximumFractionDigits: decimalen });
}

interface BerekendeWaardes {
  // === Locatie ===
  adres?: string;
  woonplaats?: string;
  provincie?: string;
  postcode?: string;

  // === Club ===
  typeVereniging?: string;
  projectleider?: string;

  // === Gebouw ===
  bouwjaar?: number;
  renovatiejaar?: number;
  bvoM2?: number;
  bouwhoogteM?: number;
  aantalDouchekoppen?: number;

  // === Gasaansluiting ===
  /** G-label: G4, G6, G10, G16, G25, G40, G65, G100, G160, "geen" of undefined */
  gasAansluitingLabel?: string;
  /** Maximumcapaciteit gasmeter in m³/h */
  gasAansluitingM3PerUur?: number;
  /** Geschatte vermijdbare vastrecht-kosten gas per jaar in € (bij gasloos worden) */
  vastrechtGasVermijdbaarPerJaar?: number;

  // === Trainingsschema ===
  aantalTeamsOnder13?: number;
  aantalTeamsVanaf13?: number;
  totaalTeams?: number;
  urenPerWeek?: number;

  // === Energie ===
  totaalGasM3?: number;
  totaalElekKwh?: number;
  /** Primair energieverbruik (kWh/m²/jaar) — WEii-indicator */
  weiiScore?: number;
  /** Geschatte CO2-uitstoot per jaar (kg) */
  co2KgPerJaar?: number;
  /** CO2 in tonnen voor leesbaarheid */
  co2TonPerJaar?: number;
  /** Energielabel-schatting o.b.v. WEii */
  energielabelSchatting?: string;

  // === Douches ===
  douchesPerWeek?: number;
  douchesPerJaar?: number;
  gasDouchePerWeek?: number;
  gasDouchePerJaar?: number;
  waterDouchePerJaar?: number;
  douchegasPct?: number;
  kostprijsDoucheGasJaar?: number;
  kostprijsDoucheTotaalJaar?: number;

  // === WC ===
  wcDoorspoelPerJaar?: number;
  wcWaterbesparingLiter?: number;
  wcKostbesparingEur?: number;

  // === Kantine ===
  gasKantinePerJaar?: number;
  besparingGasKantineM3?: number;
  besparingKantineEur?: number;

  // === Vergelijk gemiddeld ===
  meerMinderEnergie?: 'meer' | 'minder';

  // === Maatregelen uit cachedResult ===
  totaalInvestering?: number;
  totaalBesparingPerJaar?: number;
  totaalTerugverdientijd?: number;
  totaalCo2BesparingTon?: number;
  /** Lijst van geselecteerde maatregelen met cijfers */
  gekozenMaatregelen?: Array<{
    naam: string;
    investering: number;
    besparingPerJaar: number;
    tvt: number;
  }>;
}

/** Bereken alle PPT-cijfers uit het project-state */
function berekenWaardes(
  state: Record<string, unknown>,
  cachedResult: Record<string, unknown> | null,
  eigenaarNaam: string | null,
  tenantInst: {
    prijzen?: { gasPerM3?: number; stroomPerKwh?: number; waterPerM3?: number };
    vuistregels?: { gasPerDouche?: number; co2GasPerM3?: number; co2StroomPerKwh?: number; primairFactorGas?: number; literPerSpoeling?: number };
  } | null,
): BerekendeWaardes {
  const result: BerekendeWaardes = {};
  // Tenant overrides → defaults
  const PRIJS_GAS_PER_M3 = tenantInst?.prijzen?.gasPerM3 ?? 1.35;
  const PRIJS_WATER_PER_M3 = tenantInst?.prijzen?.waterPerM3 ?? 1.13;
  const PRIJS_STROOM_PER_KWH = tenantInst?.prijzen?.stroomPerKwh ?? 0.30;
  const GAS_PER_DOUCHE = tenantInst?.vuistregels?.gasPerDouche ?? 0.5;
  const CO2_GAS = tenantInst?.vuistregels?.co2GasPerM3 ?? 1.78;
  const CO2_STROOM = tenantInst?.vuistregels?.co2StroomPerKwh ?? 0.34;
  const PRIMAIR_GAS = tenantInst?.vuistregels?.primairFactorGas ?? 9.77;
  const LITER_PER_SPOELING = tenantInst?.vuistregels?.literPerSpoeling ?? 6;

  const ctx = (state.context as Record<string, unknown>) ?? {};
  const club = (ctx.club as Record<string, unknown>) ?? {};
  const gebouw = (ctx.gebouw as Record<string, unknown>) ?? {};
  const energie = (ctx.energie as Record<string, unknown>) ?? {};
  const locatie = (state.locatie as Record<string, unknown>) ?? {};
  const schema = (state.trainingsSchema as Array<Record<string, unknown>>) ?? [];

  // === Locatie ===
  if (locatie.adres) result.adres = String(locatie.adres);
  if (locatie.woonplaats) result.woonplaats = String(locatie.woonplaats);
  if (locatie.provincie) result.provincie = String(locatie.provincie);
  if (locatie.postcode) result.postcode = String(locatie.postcode);

  // === Club ===
  if (club.type) result.typeVereniging = String(club.type);
  if (eigenaarNaam) result.projectleider = eigenaarNaam;

  // === Gebouw ===
  if (gebouw.bouwjaar) result.bouwjaar = Number(gebouw.bouwjaar);
  if (gebouw.renovatiejaar) result.renovatiejaar = Number(gebouw.renovatiejaar);
  if (gebouw.bvoTotaalM2) result.bvoM2 = Number(gebouw.bvoTotaalM2);
  if (gebouw.bouwhoogteM) result.bouwhoogteM = Number(gebouw.bouwhoogteM);
  if (gebouw.aantalDouchekoppen) result.aantalDouchekoppen = Number(gebouw.aantalDouchekoppen);

  // === Gasaansluiting + vermijdbaar vastrecht ===
  // Geschatte all-in vastrecht-kosten per jaar (NL-netbeheer gemiddelde 2025):
  // transport + capaciteit + meettarief, gewogen over Liander/Stedin/Enexis/Coteq.
  // Vermijdbaar = wat de club bespaart bij definitief verwijderen van de aansluiting.
  const gasVastrechtPerJaar: Record<string, number> = {
    'G4':   230,
    'G6':   270,
    'G10':  350,
    'G16':  450,
    'G25':  550,
    'G40':  1380,   // Liander 2025: €115,20/maand × 12
    'G65':  2250,
    'G100': 3460,
    'G160': 5530,
  };
  const gasLabel = energie.gasAansluitingLabel as string | undefined;
  const gasM3PerUur = energie.gasAansluitingM3PerUur as number | undefined;
  if (gasLabel) result.gasAansluitingLabel = gasLabel;
  if (gasM3PerUur !== undefined) result.gasAansluitingM3PerUur = gasM3PerUur;
  if (gasLabel && gasLabel !== 'geen' && gasVastrechtPerJaar[gasLabel]) {
    result.vastrechtGasVermijdbaarPerJaar = gasVastrechtPerJaar[gasLabel];
  }

  // === Trainingsschema → teams aggregatie ===
  if (schema.length > 0) {
    // Maximum aantal teams op één moment (= grootste team-aantal)
    let maxO13 = 0, maxV13 = 0;
    let urenPerWeek = 0;
    for (const m of schema) {
      const o13 = (m.aantalTeamsOnder13 as number) ?? 0;
      const v13 = (m.aantalTeamsVanaf13 as number) ?? 0;
      if (o13 > maxO13) maxO13 = o13;
      if (v13 > maxV13) maxV13 = v13;
      const start = String(m.startTijd ?? '0:00');
      const eind = String(m.eindTijd ?? '0:00');
      const [sh, sm] = start.split(':').map(Number);
      const [eh, em] = eind.split(':').map(Number);
      const duur = ((eh ?? 0) + (em ?? 0) / 60) - ((sh ?? 0) + (sm ?? 0) / 60);
      if (duur > 0) urenPerWeek += duur;
    }
    if (maxO13 > 0) result.aantalTeamsOnder13 = maxO13;
    if (maxV13 > 0) result.aantalTeamsVanaf13 = maxV13;
    if (maxO13 + maxV13 > 0) result.totaalTeams = maxO13 + maxV13;
    if (urenPerWeek > 0) result.urenPerWeek = Math.round(urenPerWeek * 10) / 10;
  }

  // === Energieverbruik ===
  const gasM3 = (energie.gasM3PerJaar as number) ?? (energie.gasverbruikM3 as number) ?? 0;
  const elekKwh = (energie.elektriciteitKwhPerJaar as number) ?? (energie.stroomverbruikTotaalKwh as number) ?? 0;
  if (gasM3 > 0) result.totaalGasM3 = gasM3;
  if (elekKwh > 0) result.totaalElekKwh = elekKwh;

  // WEii-score = primair kWh / m²
  const bvo = (gebouw.bvoTotaalM2 as number) ?? 0;
  if (bvo > 0 && (gasM3 > 0 || elekKwh > 0)) {
    const primairKwh = elekKwh + gasM3 * PRIMAIR_GAS;
    result.weiiScore = Math.round(primairKwh / bvo);
  }

  // CO2: gas + elektra (NL-mix)
  if (gasM3 > 0 || elekKwh > 0) {
    result.co2KgPerJaar = Math.round(gasM3 * CO2_GAS + elekKwh * CO2_STROOM);
    result.co2TonPerJaar = Math.round(result.co2KgPerJaar / 1000 * 10) / 10;
  }

  // Energielabel-schatting o.b.v. WEii (sportclub-norm, indicatief)
  if (result.weiiScore !== undefined) {
    const w = result.weiiScore;
    if (w <= 30) result.energielabelSchatting = 'A++ tot A';
    else if (w <= 50) result.energielabelSchatting = 'B';
    else if (w <= 70) result.energielabelSchatting = 'C (gemiddelde sportclub)';
    else if (w <= 100) result.energielabelSchatting = 'D';
    else if (w <= 150) result.energielabelSchatting = 'E';
    else if (w <= 200) result.energielabelSchatting = 'F';
    else result.energielabelSchatting = 'G';
  }

  // === Douches ===
  let douchesPerWeek = 0;
  if (schema.length > 0) {
    for (const moment of schema) {
      const o13 = ((moment.aantalTeamsOnder13 as number) ?? 0) * 10;
      const v13 = ((moment.aantalTeamsVanaf13 as number) ?? 0) * 15;
      const douchePct = (moment.douchePercentage as number) ?? 0.6;
      douchesPerWeek += (o13 + v13) * douchePct;
    }
  } else {
    const koppen = (gebouw.aantalDouchekoppen as number) ?? 0;
    douchesPerWeek = koppen * 3 * 6;
  }
  douchesPerWeek = Math.round(douchesPerWeek);

  if (douchesPerWeek > 0) {
    result.douchesPerWeek = douchesPerWeek;
    result.douchesPerJaar = Math.round(douchesPerWeek * 42);
    result.gasDouchePerWeek = Math.round(douchesPerWeek * GAS_PER_DOUCHE);
    result.gasDouchePerJaar = Math.round(result.douchesPerJaar * GAS_PER_DOUCHE);
    result.waterDouchePerJaar = Math.round(result.douchesPerJaar * 0.05);
    if (gasM3 > 0) {
      result.douchegasPct = Math.round((result.gasDouchePerJaar / gasM3) * 100);
    }
    result.kostprijsDoucheGasJaar = Math.round(result.gasDouchePerJaar * PRIJS_GAS_PER_M3);
    result.kostprijsDoucheTotaalJaar = Math.round(
      result.gasDouchePerJaar * PRIJS_GAS_PER_M3 + result.waterDouchePerJaar * PRIJS_WATER_PER_M3
    );
  }

  // === WC ===
  if (schema.length > 0) {
    let bezoekersPerWeek = 0;
    for (const moment of schema) {
      const o13 = ((moment.aantalTeamsOnder13 as number) ?? 0) * 10;
      const v13 = ((moment.aantalTeamsVanaf13 as number) ?? 0) * 15;
      bezoekersPerWeek += o13 + v13;
    }
    result.wcDoorspoelPerJaar = Math.round(bezoekersPerWeek * 42 * 2);
    result.wcWaterbesparingLiter = Math.round(result.wcDoorspoelPerJaar * LITER_PER_SPOELING);
    result.wcKostbesparingEur = Math.round(result.wcWaterbesparingLiter * (PRIJS_WATER_PER_M3 / 1000));
  }

  // === Vergelijk met gemiddeld ===
  if (result.weiiScore !== undefined) {
    result.meerMinderEnergie = result.weiiScore > 70 ? 'meer' : 'minder';
  }

  // === Kantine ===
  if (gasM3 > 0) {
    result.gasKantinePerJaar = Math.round(gasM3 * 0.55);
    result.besparingGasKantineM3 = Math.round(result.gasKantinePerJaar * 0.25);
    result.besparingKantineEur = Math.round(result.besparingGasKantineM3 * PRIJS_GAS_PER_M3);
  }

  // === Maatregelen uit cachedResult ===
  if (cachedResult && typeof cachedResult === 'object') {
    const totaal = (cachedResult.totaal as Record<string, number>) ?? {};
    if (totaal.investering !== undefined) result.totaalInvestering = Math.round(totaal.investering);
    if (totaal.besparingPerJaar !== undefined) result.totaalBesparingPerJaar = Math.round(totaal.besparingPerJaar);
    if (totaal.terugverdientijdJaren !== undefined) result.totaalTerugverdientijd = Math.round(totaal.terugverdientijdJaren * 10) / 10;

    // CO2-besparing totaal — uit per-maatregel
    const maatregelen = (cachedResult.maatregelen as Array<Record<string, unknown>>) ?? [];
    const lijst: Array<{ naam: string; investering: number; besparingPerJaar: number; tvt: number }> = [];
    let co2Totaal = 0;
    for (const m of maatregelen) {
      const naam = String(m.naam ?? m.maatregelId ?? '');
      const inv = Math.round(Number(m.brutoInvestering ?? m.investering ?? 0));
      const besp = Math.round(Number(m.besparingPerJaar ?? 0));
      const tvt = Math.round(Number(m.terugverdientijdJaren ?? 0) * 10) / 10;
      if (naam && (inv > 0 || besp > 0)) {
        lijst.push({ naam, investering: inv, besparingPerJaar: besp, tvt });
      }
      const co2 = Number(m.co2BesparingKgPerJaar ?? 0);
      if (co2 > 0) co2Totaal += co2;
    }
    if (lijst.length > 0) result.gekozenMaatregelen = lijst;
    if (co2Totaal > 0) result.totaalCo2BesparingTon = Math.round(co2Totaal / 1000 * 10) / 10;
  }

  // Stroomprijs gebruikt voor mogelijke €-berekeningen elders
  void PRIJS_STROOM_PER_KWH;

  return result;
}

/**
 * Verwijder gele highlights uit een slide-XML.
 *
 * PowerPoint gebruikt `<a:highlight><a:srgbClr val="FFFF00"/></a:highlight>`
 * in run-properties (<a:rPr>) om tekst geel te markeren.
 */
function verwijderGeleHighlights(xml: string): string {
  return xml.replace(
    /<a:highlight>\s*<a:srgbClr val="[fF]{4}00"\s*\/>\s*<\/a:highlight>/g,
    ''
  );
}

/**
 * Vervang in een XML-string ALLE placeholders met de juiste cijfers.
 */
function vervangPlaceholders(
  xml: string,
  vars: { clubnaam: string; maandJaar: string; berekend: BerekendeWaardes },
): string {
  if (!vars.clubnaam) return xml;
  const clubnaamCap = vars.clubnaam.charAt(0).toUpperCase() + vars.clubnaam.slice(1);

  // 1. Maand-placeholder eerst (specifieker)
  let result = xml.replace(/\[maand\]\s*2025/g, vars.maandJaar);
  result = result.replace(/\[maand\]/g, NEDERLANDSE_MAANDEN[new Date().getMonth()]);

  // 2. Naamvereniging
  result = result.replace(/Naamvereniging/g, clubnaamCap);
  result = result.replace(/naamvereniging/g, vars.clubnaam);

  // 3. Verwijder ALLE gele highlights
  result = verwijderGeleHighlights(result);

  const b = vars.berekend;

  // === Slide 9 ===
  if (b.meerMinderEnergie) {
    result = result.replace(/meer\/minder/g, b.meerMinderEnergie);
  }

  // === Slide 12 — Douches ===
  if (b.douchesPerWeek !== undefined) {
    result = result.replace(/…\s*douchebeurten per week/gi, `${fmt(b.douchesPerWeek)} douchebeurten per week`);
  }
  if (b.gasDouchePerWeek !== undefined) {
    result = result.replace(/de vereniging\s*…\s*kuub gas/g, `de vereniging ${fmt(b.gasDouchePerWeek)} kuub gas`);
  }
  if (b.gasDouchePerJaar !== undefined) {
    result = result.replace(/jaarlijks ongeveer\s*…\s*kuub gas/g, `jaarlijks ongeveer ${fmt(b.gasDouchePerJaar)} kuub gas`);
  }
  if (b.douchegasPct !== undefined) {
    result = result.replace(/betekent dit\s*…\s*%/g, `betekent dit ${b.douchegasPct}%`);
  }
  if (b.kostprijsDoucheGasJaar !== undefined) {
    // Slide 12: "kost dit € …,-" — alleen de eerste gas-prijs op die slide
    result = result.replace(/€\s*1,35\)\s*kost dit\s*€\s*…/g, `€ 1,35) kost dit € ${fmt(b.kostprijsDoucheGasJaar)}`);
  }

  // === Slide 13 — Douche water ===
  if (b.douchesPerJaar !== undefined && b.waterDouchePerJaar !== undefined) {
    result = result.replace(
      /jaarlijks zo['’]n\s*…\s*keer gedoucht\.\s*Omgerekend is dat\s*…\s*m3 water per jaar/g,
      `jaarlijks zo’n ${fmt(b.douchesPerJaar)} keer gedoucht. Omgerekend is dat ${fmt(b.waterDouchePerJaar)} m³ water per jaar`,
    );
  }
  if (b.kostprijsDoucheTotaalJaar !== undefined) {
    // Tweede "kost dit €..." op slide 13 — gebruik andere context
    result = result.replace(/komt het neer op\s*€\s*…/g, `komt het neer op € ${fmt(b.kostprijsDoucheTotaalJaar)}`);
    // Algemene fallback voor "uit op € …" patroon
    result = result.replace(/uit op\s*€\s*…/g, `uit op € ${fmt(b.kostprijsDoucheTotaalJaar)}`);
  }

  // === Slide 16 — Kantine isolatie ===
  if (b.gasKantinePerJaar !== undefined) {
    result = result.replace(/er\s*…\s*m3 gas naar het verwarmen/g, `er ${fmt(b.gasKantinePerJaar)} m³ gas naar het verwarmen`);
  }
  if (b.besparingGasKantineM3 !== undefined) {
    result = result.replace(/jaarlijks ca\.\s*…\s*m3 gas/g, `jaarlijks ca. ${fmt(b.besparingGasKantineM3)} m³ gas`);
  }
  if (b.besparingKantineEur !== undefined) {
    result = result.replace(/neerkomt op een jaarlijkse besparing van\s*€\s*…/g, `neerkomt op een jaarlijkse besparing van € ${fmt(b.besparingKantineEur)}`);
  }

  // === Slide 71 — WC ===
  if (b.wcDoorspoelPerJaar !== undefined) {
    result = result.replace(/ca\.\s*…\s*keer een wc doorgespoeld/g, `ca. ${fmt(b.wcDoorspoelPerJaar)} keer een wc doorgespoeld`);
  }
  if (b.wcWaterbesparingLiter !== undefined) {
    result = result.replace(/club kan besparen is\s*…\s*liter/g, `club kan besparen is ${fmt(b.wcWaterbesparingLiter)} liter`);
  }
  if (b.wcKostbesparingEur !== undefined) {
    result = result.replace(/bespaart de club\s*€\s*…/g, `bespaart de club € ${fmt(b.wcKostbesparingEur)}`);
  }

  return result;
}

/**
 * Voeg het clublogo toe als afbeelding rechtsboven op slide 1.
 *
 * Aanpak:
 *  1. Decodeer dataUrl → bytes, bepaal het bestandsformaat
 *  2. Voeg bytes toe aan ppt/media/clublogo.{ext}
 *  3. Voeg relationship toe in ppt/slides/_rels/slide1.xml.rels
 *  4. Injecteer <p:pic> shape vlak voor </p:spTree> in ppt/slides/slide1.xml
 */
async function voegLogoToeAanSlide1(zip: JSZip, logoDataUrl: string): Promise<boolean> {
  // dataUrl format: data:image/png;base64,iVBORw0KGgo...
  const match = logoDataUrl.match(/^data:image\/([a-z+]+);base64,(.+)$/i);
  if (!match) {
    console.warn('[PPT-template] Logo dataUrl niet herkend');
    return false;
  }

  const ext = match[1].toLowerCase() === 'svg+xml' ? 'png' : match[1].toLowerCase();
  // PowerPoint accepteert geen SVG direct — sla over als svg
  if (ext === 'svg+xml' || ext === 'svg') {
    console.warn('[PPT-template] SVG logo niet ondersteund in PPT (alleen PNG/JPG)');
    return false;
  }

  const logoBytes = Buffer.from(match[2], 'base64');
  if (logoBytes.length === 0 || logoBytes.length > 5_000_000) return false;

  const mediaPath = `ppt/media/clublogo.${ext}`;
  zip.file(mediaPath, logoBytes);

  // Relationship toevoegen aan slide1.xml.rels
  const relsPath = 'ppt/slides/_rels/slide1.xml.rels';
  const relsFile = zip.file(relsPath);
  if (!relsFile) return false;
  const relsXml = await relsFile.async('string');

  // Vind hoogste rId om geen conflict te krijgen
  const allRids = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map(m => parseInt(m[1], 10));
  const newRid = Math.max(0, ...allRids) + 1;
  const newRidStr = `rId${newRid}`;

  const newRel = `<Relationship Id="${newRidStr}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/clublogo.${ext}"/>`;
  const newRels = relsXml.replace('</Relationships>', `${newRel}</Relationships>`);
  zip.file(relsPath, newRels);

  // Pic-shape injecteren in slide1.xml — rechtsboven, ~3cm × 3cm
  // Standaard slide = 12192000 × 6858000 EMU (16:9, 25.4cm × 14.3cm)
  // Logo: 1500000 × 1500000 EMU (~4cm), x=10300000, y=300000 (rechtsboven)
  const slidePath = 'ppt/slides/slide1.xml';
  const slideFile = zip.file(slidePath);
  if (!slideFile) return false;
  const slideXml = await slideFile.async('string');

  // Bepaal hoogste shape-id om dubbel ID te voorkomen
  const allIds = [...slideXml.matchAll(/<p:cNvPr\s+id="(\d+)"/g)].map(m => parseInt(m[1], 10));
  const newShapeId = Math.max(0, ...allIds) + 1;

  const picXml = `<p:pic>
    <p:nvPicPr>
      <p:cNvPr id="${newShapeId}" name="ClubLogo"/>
      <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>
      <p:nvPr/>
    </p:nvPicPr>
    <p:blipFill>
      <a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${newRidStr}"/>
      <a:stretch><a:fillRect/></a:stretch>
    </p:blipFill>
    <p:spPr>
      <a:xfrm>
        <a:off x="10300000" y="300000"/>
        <a:ext cx="1500000" cy="1500000"/>
      </a:xfrm>
      <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
    </p:spPr>
  </p:pic>`;

  // Injecteer vlak voor </p:spTree>
  const newSlideXml = slideXml.replace('</p:spTree>', `${picXml}</p:spTree>`);
  zip.file(slidePath, newSlideXml);

  return true;
}

/** Escape voor XML — voorkom corrupte PPTX bij speciale tekens in tekst */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Voeg een nieuw tekstvak toe aan een slide met scan-data in twee kolommen.
 *
 * Gebruikt als pragmatisch alternatief voor het invoegen van een hele nieuwe slide:
 * Bart krijgt alle bekende cijfers in één blokje op de bestaande slide, kan het
 * verplaatsen of weghalen in PowerPoint zelf.
 */
async function voegScanSamenvattingToe(
  zip: JSZip,
  slideIndex: number,
  titel: string,
  regels: Array<{ label: string; waarde: string }>,
  positie: { x: number; y: number; breedte: number; hoogte: number },
): Promise<boolean> {
  const slidePath = `ppt/slides/slide${slideIndex}.xml`;
  const slideFile = zip.file(slidePath);
  if (!slideFile) return false;
  const slideXml = await slideFile.async('string');

  const allIds = [...slideXml.matchAll(/<p:cNvPr\s+id="(\d+)"/g)].map(m => parseInt(m[1], 10));
  const newId = Math.max(0, ...allIds) + 1;

  // Bouw paragrafen — titel + regels label/waarde
  const titelXml = `<a:p>
    <a:pPr/>
    <a:r>
      <a:rPr lang="nl-NL" sz="1400" b="1">
        <a:solidFill><a:srgbClr val="1F4E5C"/></a:solidFill>
      </a:rPr>
      <a:t>${xmlEscape(titel)}</a:t>
    </a:r>
  </a:p>`;
  const regelsXml = regels.map(r => `<a:p>
    <a:pPr/>
    <a:r>
      <a:rPr lang="nl-NL" sz="1000">
        <a:solidFill><a:srgbClr val="666666"/></a:solidFill>
      </a:rPr>
      <a:t>${xmlEscape(r.label)}: </a:t>
    </a:r>
    <a:r>
      <a:rPr lang="nl-NL" sz="1000" b="1">
        <a:solidFill><a:srgbClr val="222222"/></a:solidFill>
      </a:rPr>
      <a:t>${xmlEscape(r.waarde)}</a:t>
    </a:r>
  </a:p>`).join('');

  const sp = `<p:sp>
    <p:nvSpPr>
      <p:cNvPr id="${newId}" name="ScanSamenvatting"/>
      <p:cNvSpPr txBox="1"/>
      <p:nvPr/>
    </p:nvSpPr>
    <p:spPr>
      <a:xfrm>
        <a:off x="${positie.x}" y="${positie.y}"/>
        <a:ext cx="${positie.breedte}" cy="${positie.hoogte}"/>
      </a:xfrm>
      <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
      <a:solidFill><a:srgbClr val="F4F8FA"/></a:solidFill>
      <a:ln w="6350"><a:solidFill><a:srgbClr val="D0DCE2"/></a:solidFill></a:ln>
    </p:spPr>
    <p:txBody>
      <a:bodyPr wrap="square" lIns="91440" tIns="91440" rIns="91440" bIns="91440" anchor="t"/>
      <a:lstStyle/>
      ${titelXml}
      ${regelsXml}
    </p:txBody>
  </p:sp>`;

  const newXml = slideXml.replace('</p:spTree>', `${sp}</p:spTree>`);
  zip.file(slidePath, newXml);
  return true;
}

/**
 * Voeg een tabel-achtig tekstvak met geselecteerde maatregelen + cijfers toe.
 * Komt op een gepaste slide (typisch de "Voor de penningmeester"-slide).
 */
async function voegMaatregelenTabelToe(
  zip: JSZip,
  slideIndex: number,
  maatregelen: Array<{ naam: string; investering: number; besparingPerJaar: number; tvt: number }>,
  totaal: { investering?: number; besparing?: number; tvt?: number },
): Promise<boolean> {
  if (maatregelen.length === 0) return false;
  const slidePath = `ppt/slides/slide${slideIndex}.xml`;
  const slideFile = zip.file(slidePath);
  if (!slideFile) return false;
  const slideXml = await slideFile.async('string');

  const allIds = [...slideXml.matchAll(/<p:cNvPr\s+id="(\d+)"/g)].map(m => parseInt(m[1], 10));
  const newId = Math.max(0, ...allIds) + 1;

  const fmtEur = (n: number) => '€ ' + n.toLocaleString('nl-NL');
  const fmtTvt = (n: number) => n === Infinity || n > 99 ? '> 99 jaar' : `${n.toFixed(1)} jaar`;

  // Header-regel
  const headerXml = `<a:p>
    <a:pPr/>
    <a:r>
      <a:rPr lang="nl-NL" sz="1100" b="1">
        <a:solidFill><a:srgbClr val="1F4E5C"/></a:solidFill>
      </a:rPr>
      <a:t>Geselecteerde maatregelen — financieel overzicht</a:t>
    </a:r>
  </a:p>`;

  const rijenXml = maatregelen.map(m => `<a:p>
    <a:pPr/>
    <a:r>
      <a:rPr lang="nl-NL" sz="900"/>
      <a:t>• ${xmlEscape(m.naam)} — </a:t>
    </a:r>
    <a:r>
      <a:rPr lang="nl-NL" sz="900" b="1"/>
      <a:t>${fmtEur(m.investering)} investering · ${fmtEur(m.besparingPerJaar)}/jaar besparing · TVT ${fmtTvt(m.tvt)}</a:t>
    </a:r>
  </a:p>`).join('');

  const totaalRegel = totaal.investering !== undefined ? `<a:p>
    <a:pPr><a:spcBef><a:spcPts val="600"/></a:spcBef></a:pPr>
    <a:r>
      <a:rPr lang="nl-NL" sz="1000" b="1">
        <a:solidFill><a:srgbClr val="1F4E5C"/></a:solidFill>
      </a:rPr>
      <a:t>Totaal: ${fmtEur(totaal.investering)} · ${fmtEur(totaal.besparing ?? 0)}/jaar${totaal.tvt !== undefined ? ` · TVT ${fmtTvt(totaal.tvt)}` : ''}</a:t>
    </a:r>
  </a:p>` : '';

  const sp = `<p:sp>
    <p:nvSpPr>
      <p:cNvPr id="${newId}" name="MaatregelenTabel"/>
      <p:cNvSpPr txBox="1"/>
      <p:nvPr/>
    </p:nvSpPr>
    <p:spPr>
      <a:xfrm>
        <a:off x="500000" y="1800000"/>
        <a:ext cx="11200000" cy="4500000"/>
      </a:xfrm>
      <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
      <a:solidFill><a:srgbClr val="F4F8FA"/></a:solidFill>
      <a:ln w="6350"><a:solidFill><a:srgbClr val="D0DCE2"/></a:solidFill></a:ln>
    </p:spPr>
    <p:txBody>
      <a:bodyPr wrap="square" lIns="180000" tIns="180000" rIns="180000" bIns="180000" anchor="t"/>
      <a:lstStyle/>
      ${headerXml}
      ${rijenXml}
      ${totaalRegel}
    </p:txBody>
  </p:sp>`;

  const newXml = slideXml.replace('</p:spTree>', `${sp}</p:spTree>`);
  zip.file(slidePath, newXml);
  return true;
}

export default async function pptTemplateRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.post('/projects/:id/ppt-template', async (req, reply) => {
    const { id } = req.params as { id: string };

    const project = await prisma.project.findFirst({
      where: { id, tenantId: req.user!.tenantId },
      select: {
        id: true, clubNaam: true, state: true, cachedResult: true,
        eigenaar: { select: { naam: true } },
      },
    });
    if (!project) {
      return reply.code(404).send({ error: 'Project niet gevonden' });
    }

    // Tenant-instellingen ophalen voor prijzen + vuistregels
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.user!.tenantId },
      select: { instellingen: true },
    });
    const tenantInst = (tenant?.instellingen as {
      prijzen?: { gasPerM3?: number; stroomPerKwh?: number; waterPerM3?: number };
      vuistregels?: { gasPerDouche?: number; co2GasPerM3?: number; co2StroomPerKwh?: number; primairFactorGas?: number; literPerSpoeling?: number };
    } | null) ?? null;

    const state = (project.state ?? {}) as Record<string, unknown>;
    const ctx = (state.context as Record<string, unknown>) ?? {};
    const club = (ctx.club as Record<string, unknown>) ?? {};
    const logo = (state.logo as { dataUrl?: string }) ?? {};
    const clubnaam = (club.naam as string) || project.clubNaam || 'Naamvereniging';
    const eigenaarNaam = project.eigenaar?.naam ?? null;
    const cachedResult = (project.cachedResult as Record<string, unknown> | null) ?? null;

    // Bereken cijfers vooraf
    const berekend = berekenWaardes(state, cachedResult, eigenaarNaam, tenantInst);
    app.log.info({ projectId: id, clubnaam, berekendKeys: Object.keys(berekend) }, 'PPT-template cijfers berekend');

    // Lees de originele template
    let templateBuffer: Buffer;
    try {
      templateBuffer = readFileSync(TEMPLATE_PATH);
    } catch (e) {
      app.log.error({ err: e, path: TEMPLATE_PATH }, 'PPT-template niet gevonden');
      return reply.code(500).send({
        error: 'PPT-template ontbreekt op de server',
        details: 'apps/api/templates/sportief-opgewekt-standaard.pptx is niet aanwezig',
      });
    }

    const zip = await JSZip.loadAsync(templateBuffer);

    const vars = { clubnaam, maandJaar: huidigeMaandJaar(), berekend };

    // Vervang placeholders in alle slide-XML's
    let aantalVervangen = 0;
    const slidePaths = Object.keys(zip.files).filter(p =>
      p.startsWith('ppt/slides/slide') && p.endsWith('.xml')
    );
    for (const path of slidePaths) {
      const file = zip.file(path);
      if (!file) continue;
      const xml = await file.async('string');
      const vervangen = vervangPlaceholders(xml, vars);
      if (vervangen !== xml) {
        zip.file(path, vervangen);
        aantalVervangen++;
      }
    }

    // Logo toevoegen aan slide 1 als beschikbaar
    let logoToegevoegd = false;
    if (logo.dataUrl) {
      try {
        logoToegevoegd = await voegLogoToeAanSlide1(zip, logo.dataUrl);
      } catch (e) {
        app.log.warn({ err: e }, 'Logo toevoegen mislukt — PPT wordt zonder logo gegenereerd');
      }
    }

    // === Scan-samenvatting tekstvak op slide 1 (onder titel, links) ===
    try {
      const regels: Array<{ label: string; waarde: string }> = [];
      if (berekend.adres) {
        regels.push({ label: 'Locatie', waarde: `${berekend.adres}${berekend.woonplaats ? ', ' + berekend.woonplaats : ''}` });
      }
      if (berekend.typeVereniging) {
        regels.push({ label: 'Type vereniging', waarde: berekend.typeVereniging });
      }
      if (berekend.bouwjaar) {
        const renovatie = berekend.renovatiejaar && berekend.renovatiejaar > berekend.bouwjaar
          ? ` (renovatie ${berekend.renovatiejaar})` : '';
        regels.push({ label: 'Bouwjaar', waarde: `${berekend.bouwjaar}${renovatie}` });
      }
      if (berekend.bvoM2) {
        regels.push({ label: 'Oppervlakte (BVO)', waarde: `${fmt(berekend.bvoM2)} m²` });
      }
      if (berekend.bouwhoogteM) {
        regels.push({ label: 'Bouwhoogte', waarde: `${berekend.bouwhoogteM.toFixed(1)} m` });
      }
      if (berekend.totaalTeams) {
        regels.push({
          label: 'Teams',
          waarde: `${berekend.totaalTeams} totaal (${berekend.aantalTeamsOnder13 ?? 0} <13 jr, ${berekend.aantalTeamsVanaf13 ?? 0} ≥13 jr)`,
        });
      }
      if (berekend.urenPerWeek) {
        regels.push({ label: 'Uren gebruik/week', waarde: `${berekend.urenPerWeek}` });
      }
      if (berekend.totaalGasM3) {
        regels.push({ label: 'Gasverbruik', waarde: `${fmt(berekend.totaalGasM3)} m³/jaar` });
      }
      if (berekend.gasAansluitingLabel) {
        const lbl = berekend.gasAansluitingLabel === 'geen'
          ? 'geen (gasloos)'
          : `${berekend.gasAansluitingLabel}${berekend.gasAansluitingM3PerUur ? ` (${berekend.gasAansluitingM3PerUur} m³/h)` : ''}`;
        regels.push({ label: 'Gasaansluiting', waarde: lbl });
      }
      if (berekend.vastrechtGasVermijdbaarPerJaar) {
        regels.push({
          label: 'Vermijdbaar vastrecht gas',
          waarde: `± € ${fmt(berekend.vastrechtGasVermijdbaarPerJaar)}/jaar bij gasloos`,
        });
      }
      if (berekend.totaalElekKwh) {
        regels.push({ label: 'Stroomverbruik', waarde: `${fmt(berekend.totaalElekKwh)} kWh/jaar` });
      }
      if (berekend.weiiScore) {
        regels.push({
          label: 'WEii-score',
          waarde: `${berekend.weiiScore} kWh/m²${berekend.energielabelSchatting ? ` — label ${berekend.energielabelSchatting}` : ''}`,
        });
      }
      if (berekend.co2TonPerJaar) {
        regels.push({ label: 'CO₂-uitstoot', waarde: `${berekend.co2TonPerJaar} ton/jaar` });
      }
      if (berekend.projectleider) {
        regels.push({ label: 'Projectleider', waarde: berekend.projectleider });
      }
      if (regels.length > 0) {
        await voegScanSamenvattingToe(
          zip, 1, 'Scan-gegevens', regels,
          { x: 300000, y: 4800000, breedte: 6000000, hoogte: 1900000 },
        );

        // === Tweede tekstvak op slide 2 "Uitgangspunten" met dezelfde data ===
        // Slide 2 is in de Sportief Opgewekt-template de Uitgangspunten-slide.
        // Hier plakken we de scan-data in een breder formaat (volle breedte, lager).
        try {
          await voegScanSamenvattingToe(
            zip, 2, 'Uitgangspunten van deze scan', regels,
            { x: 500000, y: 1500000, breedte: 11000000, hoogte: 4800000 },
          );
        } catch (e) {
          app.log.warn({ err: e }, 'Uitgangspunten op slide 2 mislukt');
        }
      }
    } catch (e) {
      app.log.warn({ err: e }, 'Scan-samenvatting tekstvak op slide 1 mislukt');
    }

    // === Maatregelen-tabel toevoegen aan slide 77 ("Voor de penningmeester") ===
    let maatregelenBox = false;
    try {
      if (berekend.gekozenMaatregelen && berekend.gekozenMaatregelen.length > 0) {
        maatregelenBox = await voegMaatregelenTabelToe(
          zip, 77, berekend.gekozenMaatregelen,
          {
            investering: berekend.totaalInvestering,
            besparing: berekend.totaalBesparingPerJaar,
            tvt: berekend.totaalTerugverdientijd,
          },
        );
      }
    } catch (e) {
      app.log.warn({ err: e }, 'Maatregelen-tabel op slide 77 mislukt');
    }

    app.log.info(
      { projectId: id, slidesMetVervanging: aantalVervangen, logoToegevoegd, maatregelenBox },
      'PPT-template klaar',
    );

    // Re-zip en verstuur
    const outBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

    const filename = `Verduurzamingsplan_${clubnaam.replace(/[^a-zA-Z0-9]/g, '_')}_Sportief_Opgewekt.pptx`;
    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(outBuffer);
  });
}
