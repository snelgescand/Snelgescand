/**
 * Aanbeveling-engine: scoort welke maatregelen het meest interessant zijn
 * voor deze specifieke locatie op basis van:
 *
 *  - Bouwjaar (oudere panden → meer isolatiewinst)
 *  - Gas/stroomverbruik (hoog verbruik → grotere besparing)
 *  - Huidige situatie (status per checklist-item)
 *
 * Score van 0-100. 70+ = sterk aanbevolen. 40-70 = overwegen. <40 = lage prioriteit.
 *
 * Output bevat ook een leesbare "reden" per maatregel — de heuristieken die
 * tot deze score leidden.
 */

import type { ChecklistAntwoorden } from '../data/checklist';

export interface AanbevelingContext {
  bouwjaar?: number;
  bvoM2?: number;
  gasverbruikM3?: number;
  stroomverbruikKwh?: number;
  huidigeSituatie: ChecklistAntwoorden;
}

export interface MaatregelScore {
  maatregelId: string;
  score: number;        // 0-100
  redenen: string[];    // leesbaar lijstje
  categorie: 'sterk' | 'middel' | 'laag';
}

/**
 * Bepaalt voor alle bekende maatregel-IDs een aanbevelingsscore.
 * Onbekende maatregelen krijgen score 50 (neutraal).
 */
export function scoreAlleMaatregelen(
  beschikbareMaatregelen: string[],
  ctx: AanbevelingContext,
): MaatregelScore[] {
  return beschikbareMaatregelen.map(id => scoreMaatregel(id, ctx));
}

function scoreMaatregel(id: string, ctx: AanbevelingContext): MaatregelScore {
  const redenen: string[] = [];
  let score = 50;

  const huidig = (itemId: string) => ctx.huidigeSituatie[itemId]?.status;
  const isOud = ctx.bouwjaar !== undefined && ctx.bouwjaar < 1990;
  const isHeelOud = ctx.bouwjaar !== undefined && ctx.bouwjaar < 1975;
  const veelGas = (ctx.gasverbruikM3 ?? 0) > 4000;
  const veelStroom = (ctx.stroomverbruikKwh ?? 0) > 15000;

  switch (id) {
    // ===== ISOLATIE =====
    case 'dakisolatie':
      if (huidig('dakisolatie') === 'slecht') { score += 35; redenen.push('Dakisolatie is afwezig of slecht'); }
      else if (huidig('dakisolatie') === 'matig') { score += 20; redenen.push('Dakisolatie kan verbeterd worden'); }
      else if (huidig('dakisolatie') === 'goed') { score -= 25; redenen.push('Dak is al goed geïsoleerd'); }
      if (isHeelOud) { score += 15; redenen.push('Bouwjaar vóór 1975 — hoge winst'); }
      else if (isOud) { score += 8; redenen.push('Bouwjaar vóór 1990'); }
      if (veelGas) { score += 5; redenen.push('Hoog gasverbruik'); }
      break;

    case 'spouwmuurisolatie':
      if (huidig('gevelisolatie') === 'slecht') { score += 35; redenen.push('Gevel is niet geïsoleerd'); }
      else if (huidig('gevelisolatie') === 'matig') { score += 20; redenen.push('Gevelisolatie kan verbeterd'); }
      else if (huidig('gevelisolatie') === 'goed') { score -= 25; redenen.push('Gevel is al geïsoleerd'); }
      if (ctx.bouwjaar !== undefined && ctx.bouwjaar >= 1925 && ctx.bouwjaar < 1990) {
        score += 10; redenen.push('Bouwjaar geschikt voor spouwvulling');
      }
      if (veelGas) score += 3;
      break;

    case 'vloerisolatie':
      if (huidig('vloerisolatie') === 'slecht') { score += 30; redenen.push('Vloer is niet geïsoleerd'); }
      else if (huidig('vloerisolatie') === 'matig') { score += 15; }
      else if (huidig('vloerisolatie') === 'goed') { score -= 25; }
      if (isOud) score += 8;
      break;

    case 'glasisolatie':
      if (huidig('glas') === 'slecht') { score += 40; redenen.push('Enkel glas of slecht beglazing'); }
      else if (huidig('glas') === 'matig') { score += 22; redenen.push('Dubbel glas — HR++ veel beter'); }
      else if (huidig('glas') === 'goed') { score -= 25; redenen.push('Beglazing is al goed'); }
      if (veelGas) score += 5;
      break;

    case 'kierdichting':
      if (huidig('kierdichting') === 'slecht') { score += 20; redenen.push('Veel kieren / tochtklachten'); }
      else if (huidig('kierdichting') === 'matig') { score += 8; }
      else if (huidig('kierdichting') === 'goed') { score -= 15; }
      break;

    // ===== VERWARMING =====
    case 'waterzijdig-inregelen':
      score += 15;  // bijna altijd zinvol, lage kosten
      redenen.push('Korte TVT, weinig investering');
      if (huidig('waterzijdig-ingeregeld') === 'slecht') { score += 20; redenen.push('Nog niet ingeregeld'); }
      else if (huidig('waterzijdig-ingeregeld') === 'goed') { score -= 30; redenen.push('Reeds ingeregeld'); }
      if (veelGas) { score += 8; redenen.push('Hoog gasverbruik — grotere besparing'); }
      break;

    case 'wtw':
      if (huidig('wtw') === 'slecht') { score += 25; redenen.push('Geen WTW aanwezig'); }
      else if (huidig('wtw') === 'goed') { score -= 30; redenen.push('WTW al aanwezig'); }
      if (isOud) { score += 5; }
      if (veelGas) score += 5;
      break;

    case 'hybride-warmtepomp':
      if (huidig('cv-ketel-leeftijd') === 'matig' || huidig('cv-ketel-leeftijd') === 'slecht') {
        score += 25; redenen.push('CV-ketel is oud — hybride past nu goed');
      }
      if (huidig('warmtepomp') === 'goed') { score -= 40; redenen.push('Warmtepomp al aanwezig'); }
      if (veelGas) { score += 15; redenen.push('Hoog gasverbruik'); }
      if (huidig('dakisolatie') === 'slecht' || huidig('glas') === 'slecht') {
        score -= 10; redenen.push('Isoleren eerst — beter rendement na isolatie');
      }
      break;

    case 'lucht-water-warmtepomp':
      if (huidig('warmtepomp') === 'goed') { score -= 40; }
      if (veelGas) { score += 20; redenen.push('Hoog gasverbruik — grote besparing'); }
      if (!isOud && (huidig('dakisolatie') === 'goed' && huidig('glas') !== 'slecht')) {
        score += 10; redenen.push('Goed geïsoleerd — geschikt voor all-electric');
      }
      if ((huidig('dakisolatie') === 'slecht' || huidig('glas') === 'slecht')) {
        score -= 20; redenen.push('Eerst isoleren, anders te zware warmtepomp');
      }
      break;

    case 'warmtepompboiler':
    case 'qton-warmtepomp':
    case 'lmnt-warmtepomp':
      // Tapwater-warmtepompen — score op basis van douches
      if (huidig('douche-debiet') === 'slecht' || huidig('tapwaterboiler') === 'matig') {
        score += 20; redenen.push('Veel warm water — tapwater-warmtepomp loont');
      }
      if (veelGas) score += 10;
      if (id === 'qton-warmtepomp') {
        // Q-ton alleen relevant bij grote clubs
        if ((ctx.bvoM2 ?? 0) < 400) { score -= 25; redenen.push('Q-ton vooral voor grote clubs (>400 m²)'); }
        else { score += 10; redenen.push('Grote club — Q-ton schaalt goed'); }
      }
      break;

    // ===== VENTILATIE =====
    case 'douches-analyse':
      // Eigenlijk een analyse, niet een maatregel — toch tonen als interessant
      score += 10;
      redenen.push('Brengt douche-gasverbruik in kaart');
      if (huidig('douche-debiet') !== 'onbekend') score += 5;
      break;

    // ===== STROOM =====
    case 'binnenverlichting':
      if (huidig('led-binnen') === 'slecht') { score += 30; redenen.push('Nog geen LED binnen — snelle TVT'); }
      else if (huidig('led-binnen') === 'matig') { score += 15; redenen.push('Deels LED — rest vervangen'); }
      else if (huidig('led-binnen') === 'goed') { score -= 30; redenen.push('LED-binnen al volledig'); }
      if (veelStroom) score += 5;
      break;

    case 'ledveldverlichting':
      if (huidig('led-velden') === 'slecht') { score += 35; redenen.push('Veldverlichting niet-LED — grote besparing'); }
      else if (huidig('led-velden') === 'matig') { score += 15; }
      else if (huidig('led-velden') === 'goed') { score -= 40; }
      redenen.push('BOSA-subsidie 40% beschikbaar');
      break;

    case 'zonnepanelen':
      if (huidig('pv-dakcapaciteit') === 'goed') { score += 30; redenen.push('Dak heeft ruimte voor PV'); }
      if (huidig('pv-aanwezig') === 'goed') { score -= 20; redenen.push('PV al deels aanwezig'); }
      else if (huidig('pv-aanwezig') === 'slecht') { score += 15; redenen.push('Nog geen PV — hoog potentieel'); }
      if (veelStroom) { score += 10; redenen.push('Hoog stroomverbruik — eigen verbruik mogelijk'); }
      break;

    case 'batterij-eenvoudig':
      if (huidig('pv-aanwezig') === 'goed' || huidig('pv-aanwezig') === 'matig') {
        score += 15; redenen.push('PV aanwezig — combinatie met batterij interessant');
      } else { score -= 10; redenen.push('Eerst PV, dan batterij'); }
      score -= 5; redenen.push('Hoge investering — lange TVT');
      break;

    // ===== OVERIG =====
    case 'eboiler':
    case 'pvt-tapwater':
      score -= 5;  // nichetoepassing
      break;
  }

  // Clamp
  score = Math.max(0, Math.min(100, score));

  const categorie: MaatregelScore['categorie'] =
    score >= 70 ? 'sterk' : score >= 40 ? 'middel' : 'laag';

  return { maatregelId: id, score: Math.round(score), redenen, categorie };
}
