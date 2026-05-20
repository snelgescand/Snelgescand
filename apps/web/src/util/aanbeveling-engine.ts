/**
 * Aanbeveling-engine: scoort maatregelen op basis van specifieke keuzes
 * uit de huidige situatie + bouwjaar + verbruik.
 *
 * Werkt met de NIEUWE huidige-situatie-data structuur waarin elk item een
 * concrete keuze (bv. 'enkel-mix') heeft i.p.v. alleen goed/matig/slecht.
 *
 * Score 0-100:
 *  - 70+ = sterk aanbevolen
 *  - 40-69 = overweeg
 *  - <40 = lage prioriteit
 */

import { HUIDIGE_SITUATIE, type HuidigeSituatieData } from '../data/huidige-situatie';

export interface AanbevelingContext {
  bouwjaar?: number;
  bvoM2?: number;
  gasverbruikM3?: number;
  stroomverbruikKwh?: number;
  huidigeSituatie: HuidigeSituatieData;
}

export interface MaatregelScore {
  maatregelId: string;
  score: number;
  redenen: string[];
  categorie: 'sterk' | 'middel' | 'laag';
}

export function scoreAlleMaatregelen(
  beschikbareMaatregelen: string[],
  ctx: AanbevelingContext,
): MaatregelScore[] {
  return beschikbareMaatregelen.map(id => scoreMaatregel(id, ctx));
}

// Helper: pak de huidige keuze voor een item (returnt undefined als niet ingevuld)
function getKeuze(data: HuidigeSituatieData, itemId: string): string | undefined {
  const k = data[itemId]?.keuze;
  return k && k !== '' ? k : undefined;
}

// Helper: pak de score van de huidige keuze (0-100, of undefined)
function getScore(data: HuidigeSituatieData, itemId: string): number | undefined {
  const keuze = getKeuze(data, itemId);
  if (!keuze) return undefined;
  for (const cat of HUIDIGE_SITUATIE) {
    const item = cat.items.find(i => i.id === itemId);
    if (!item) continue;
    const opt = item.opties.find(o => o.waarde === keuze);
    return opt?.score;
  }
  return undefined;
}

// Helper: huidige scores onder de drempel?
function isSlecht(data: HuidigeSituatieData, itemId: string, drempel = 35): boolean {
  const s = getScore(data, itemId);
  return s !== undefined && s < drempel;
}
function isGoed(data: HuidigeSituatieData, itemId: string, drempel = 75): boolean {
  const s = getScore(data, itemId);
  return s !== undefined && s >= drempel;
}

function scoreMaatregel(id: string, ctx: AanbevelingContext): MaatregelScore {
  const redenen: string[] = [];
  let score = 50;

  const sit = ctx.huidigeSituatie;
  const isOud = ctx.bouwjaar !== undefined && ctx.bouwjaar < 1990;
  const isHeelOud = ctx.bouwjaar !== undefined && ctx.bouwjaar < 1975;
  const veelGas = (ctx.gasverbruikM3 ?? 0) > 4000;
  const veelStroom = (ctx.stroomverbruikKwh ?? 0) > 15000;

  switch (id) {
    // ===== ISOLATIE =====
    case 'dakisolatie': {
      const dak = getKeuze(sit, 'dakisolatie');
      if (dak === 'geen') { score += 40; redenen.push('Geen dakisolatie — hoogste prioriteit'); }
      else if (dak === 'beperkt') { score += 30; redenen.push('Beperkte dakisolatie (Rc < 1,3) — grote winst'); }
      else if (dak === 'matig') { score += 18; redenen.push('Matige dakisolatie — verbetering loont'); }
      else if (dak === 'modern') { score -= 15; redenen.push('Modern geïsoleerd — beperkte winst'); }
      else if (dak === 'goed') { score -= 30; redenen.push('Dak al goed geïsoleerd'); }
      if (isHeelOud) { score += 10; redenen.push('Bouwjaar < 1975'); }
      if (veelGas) score += 5;
      break;
    }
    case 'spouwmuurisolatie': {
      const gevel = getKeuze(sit, 'gevelisolatie');
      if (gevel === 'spouw-leeg') { score += 40; redenen.push('Spouw nog leeg — quick win'); }
      else if (gevel === 'geen-spouw') { score -= 20; redenen.push('Massieve muur — geen spouw mogelijk'); }
      else if (gevel === 'spouw-gevuld' || gevel === 'na-isolatie' || gevel === 'modern-bouw') {
        score -= 30; redenen.push('Gevel al geïsoleerd');
      }
      if (veelGas) score += 5;
      break;
    }
    case 'vloerisolatie': {
      const vloer = getKeuze(sit, 'vloerisolatie');
      if (vloer === 'geen') { score += 30; redenen.push('Vloer niet geïsoleerd'); }
      else if (vloer === 'beperkt') { score += 15; redenen.push('Beperkte vloerisolatie'); }
      else if (vloer === 'goed' || vloer === 'geen-kruipruimte') { score -= 25; }
      if (isOud) score += 5;
      break;
    }
    case 'glasisolatie': {
      const glas = getKeuze(sit, 'glas');
      if (glas === 'enkel') { score += 45; redenen.push('Enkel glas — zeer hoge prioriteit'); }
      else if (glas === 'enkel-mix') { score += 35; redenen.push('Deels enkel glas — vervangen loont'); }
      else if (glas === 'dubbel') { score += 20; redenen.push('Gewoon dubbel glas — upgrade naar HR++ loont'); }
      else if (glas === 'hr') { score += 5; redenen.push('HR-glas → HR++ kan, kleinere winst'); }
      else if (glas === 'hr-pp' || glas === 'triple') { score -= 30; redenen.push('Beglazing is al modern'); }
      if (veelGas) score += 5;
      break;
    }
    case 'kierdichting': {
      const kier = getKeuze(sit, 'kierdichting');
      if (kier === 'veel-tocht') { score += 25; redenen.push('Veel tochtklachten — goedkope oplossing'); }
      else if (kier === 'matig-tocht') { score += 10; }
      else if (kier === 'goed') { score -= 25; }
      break;
    }

    // ===== VERWARMING =====
    case 'waterzijdig-inregelen': {
      score += 12; redenen.push('Lage investering, snelle TVT');
      const inreg = getKeuze(sit, 'waterzijdig-ingeregeld');
      if (inreg === 'nooit') { score += 20; redenen.push('Nog nooit ingeregeld — direct doen'); }
      else if (inreg === 'lang-geleden') { score += 12; redenen.push('Lang geleden — opnieuw zinvol'); }
      else if (inreg === 'recent') { score -= 35; redenen.push('Recent gedaan, niet nodig'); }
      if (veelGas) { score += 8; redenen.push('Hoog gasverbruik'); }
      break;
    }
    case 'wtw': {
      const vent = getKeuze(sit, 'ventilatie-systeem');
      if (vent === 'natuurlijk' || vent === 'mech-afzuiging') { score += 28; redenen.push('Geen WTW aanwezig'); }
      else if (vent === 'wtw' || vent === 'co2-sturing') { score -= 35; redenen.push('WTW al aanwezig'); }
      if (isOud) score += 5;
      if (veelGas) score += 5;
      break;
    }
    case 'hybride-warmtepomp': {
      const cv = getKeuze(sit, 'verwarming-type');
      if (cv === 'hr-ketel-oud') { score += 25; redenen.push('Oude HR-ketel — hybride past goed'); }
      else if (cv === 'vr-ketel') { score += 20; redenen.push('VR-ketel — vernieuwen sowieso nodig'); }
      else if (cv === 'hr-ketel-nieuw') { score += 5; }
      else if (cv === 'hybride' || cv === 'all-electric-wp') { score -= 40; redenen.push('Al (hybride) warmtepomp'); }
      if (veelGas) { score += 15; redenen.push('Hoog gasverbruik'); }
      if (isSlecht(sit, 'dakisolatie') || isSlecht(sit, 'glas')) {
        score -= 10; redenen.push('Eerst isoleren voor beter rendement');
      }
      break;
    }
    case 'lucht-water-warmtepomp': {
      const cv = getKeuze(sit, 'verwarming-type');
      if (cv === 'all-electric-wp') { score -= 50; redenen.push('Al all-electric'); }
      if (veelGas) { score += 18; redenen.push('Hoog gasverbruik — grote besparing'); }
      if (!isOud && isGoed(sit, 'dakisolatie') && !isSlecht(sit, 'glas')) {
        score += 12; redenen.push('Goed geïsoleerd — geschikt voor all-electric');
      }
      if (isSlecht(sit, 'dakisolatie') || isSlecht(sit, 'glas', 25)) {
        score -= 20; redenen.push('Eerst isoleren, anders te zware warmtepomp');
      }
      break;
    }
    case 'warmtepompboiler':
    case 'qton-warmtepomp':
    case 'lmnt-warmtepomp': {
      const tap = getKeuze(sit, 'tapwater-type');
      if (tap === 'cv-ketel' || tap === 'gasboiler') { score += 22; redenen.push('Tapwater nog op gas'); }
      else if (tap === 'warmtepompboiler' || tap === 'qton') { score -= 35; redenen.push('Tapwater al via warmtepomp'); }
      if (isSlecht(sit, 'douche-debiet')) { score += 8; redenen.push('Hoog warmwaterverbruik'); }
      if (veelGas) score += 5;
      if (id === 'qton-warmtepomp') {
        if ((ctx.bvoM2 ?? 0) < 400) { score -= 25; redenen.push('Q-ton vooral voor grote clubs'); }
        else { score += 10; redenen.push('Grote club — Q-ton schaalt goed'); }
      }
      break;
    }
    case 'douches-analyse': {
      score += 8; redenen.push('Brengt douche-gasverbruik in kaart');
      if (isSlecht(sit, 'douche-debiet')) score += 12;
      break;
    }

    // ===== STROOM =====
    case 'binnenverlichting': {
      const led = getKeuze(sit, 'led-binnen');
      if (led === 'geen') { score += 35; redenen.push('Nog geen LED binnen — snelle TVT'); }
      else if (led === 'deels') { score += 22; redenen.push('Deels LED — rest vervangen'); }
      else if (led === 'meeste') { score += 8; }
      else if (led === 'volledig') { score -= 40; redenen.push('Binnen al volledig LED'); }
      if (veelStroom) score += 5;
      break;
    }
    case 'ledveldverlichting': {
      const led = getKeuze(sit, 'led-velden');
      if (led === 'nvt') { score = 0; redenen.push('Geen veldverlichting'); break; }
      if (led === 'halogeen') { score += 40; redenen.push('Veldverlichting niet-LED'); redenen.push('BOSA-subsidie 40%'); }
      else if (led === 'led-deels') { score += 18; }
      else if (led === 'led-volledig') { score -= 45; redenen.push('Velden al LED'); }
      break;
    }
    case 'zonnepanelen': {
      const pv = getKeuze(sit, 'pv-aanwezig');
      const dak = getKeuze(sit, 'pv-dakcapaciteit');
      if (dak === 'veel') { score += 25; redenen.push('Dak heeft veel ruimte voor PV'); }
      else if (dak === 'beperkt') { score += 8; }
      else if (dak === 'geen') { score -= 30; redenen.push('Geen dakcapaciteit'); }
      if (pv === 'geen') { score += 18; redenen.push('Nog geen PV — hoog potentieel'); }
      else if (pv === 'groot') { score -= 30; redenen.push('Al groot PV-systeem'); }
      if (veelStroom) score += 5;
      break;
    }
    case 'batterij-eenvoudig':
    case 'batterij-uitgebreid': {
      const pv = getKeuze(sit, 'pv-aanwezig');
      const bat = getKeuze(sit, 'batterij');
      if (bat === 'groot') { score -= 40; redenen.push('Batterij al aanwezig'); }
      else if (pv === 'middel' || pv === 'groot') { score += 18; redenen.push('PV aanwezig — batterij combineert goed'); }
      else if (pv === 'geen') { score -= 15; redenen.push('Eerst PV, dan batterij'); }
      if (id === 'batterij-uitgebreid') {
        score += 3;
        redenen.push('Werkelijke Excel-rekenmodel met EPEX-handel');
      }
      score -= 5; // langere TVT
      break;
    }
    case 'eboiler':
    case 'pvt-tapwater':
      score -= 5;
      break;
  }

  // === DUMAVA-bonus: maatregelen die een grote label-sprong veroorzaken ===
  // Maatregelen die zowel gas als isolatie aanpakken zijn DUMAVA-kandidaten.
  // We geven een lichte bonus aan combinaties die typisch tot 2+ label-sprongen leiden.
  const dumavaKandidaten = ['dakisolatie', 'spouwmuurisolatie', 'vloerisolatie', 'glasisolatie',
    'hybride-warmtepomp', 'lucht-water-warmtepomp', 'warmtepompboiler', 'qton-warmtepomp', 'lmnt-warmtepomp'];
  if (dumavaKandidaten.includes(id) && veelGas) {
    score += 3;
    if (score >= 70 && !redenen.some(r => r.includes('DUMAVA'))) {
      redenen.push('Onderdeel DUMAVA-pakket (kans op 30-40% subsidie)');
    }
  }

  score = Math.max(0, Math.min(100, score));
  const categorie: MaatregelScore['categorie'] =
    score >= 70 ? 'sterk' : score >= 40 ? 'middel' : 'laag';

  return { maatregelId: id, score: Math.round(score), redenen, categorie };
}
