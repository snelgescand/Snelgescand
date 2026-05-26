/**
 * DUMAVA-regime bepaling — strikt volgens RVO 2025-regels.
 *
 * Officiële regels (rvo.nl, gevalideerd 2025):
 *
 *   A. Losse maatregelen (1-3 maatregelen)
 *      • 20% op bruto investering
 *      • Geen labelsprong-eis
 *      • Min. €5.000 subsidie (min. €25.000 investering)
 *
 *   B. Integraal verduurzamingsproject P.1 (4+ maatregelen)
 *      • 30% op bruto investering
 *      • Verplicht 1: Maatwerkadvies (A.2) volgens BRL9500-MWA-U
 *      • Verplicht 2: ≥3 labelsprong
 *      • Verplicht 3: eindlabel MINIMAAL B (= A of B)
 *
 *   C. Integraal hoge energieprestatie P.2 (4+ maatregelen)
 *      • 40% op bruto investering — ALLEEN voor kleine onderneming
 *      • Verplichtingen 1+2+3 van P.1
 *      • Verplicht 4: renovatiestandaard (hoge energieprestatie per bijlage 4)
 *      • Verplicht 5: kleine onderneming (<250 fte EN <€50M omzet)
 *      • Grote onderneming → max 30% ongeacht renovatiestandaard
 *
 *   D. Geen DUMAVA — als 4+ maatregelen niet voldoen aan P.1/P.2
 *
 * Wordt aangeroepen door zowel `lokaal-bereken.ts` (frontend) als
 * `bereken.service.ts` (backend) zodat ze identieke DUMAVA-uitkomsten geven.
 */

import type { MaatregelResultaat, ProjectContext } from '../types/index.js';

export type DumavaRegime = 'losse' | 'integraal_p1' | 'integraal_p2' | 'geen';

export interface DumavaRegimeResultaat {
  regime: DumavaRegime;
  percentage: number;
  naam: string;
  /** Vrije-tekst-uitleg voor in de UI/warning */
  uitleg: string;
  /** Detail-info voor diagnostics */
  aantalMaatregelen: number;
  aantalLabelStappen: number;
  labelHuidig?: string;
  labelNa?: string;
  eindlabelOkVoorIntegraal: boolean;
  renovatiestandaard: boolean;
  grooteOnderneming: boolean;
}

/** Schaal A=0 (beste) ... G=6 (slechtste). NaN-veilig. */
const LABEL_RANG = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
function rangVoor(label?: string): number {
  if (!label) return -1;
  const idx = LABEL_RANG.indexOf(label.toUpperCase());
  return idx;
}

/**
 * Bepaal het DUMAVA-regime voor een project, op basis van het aantal
 * maatregelen, energielabel-info en organisatiegrootte.
 */
export function bepaalDumavaRegime(
  aantalMaatregelen: number,
  context: ProjectContext,
): DumavaRegimeResultaat {
  const labelInfo = context.energielabel;
  const labelHuidig = labelInfo?.huidig?.toUpperCase();
  const labelNa = labelInfo?.verwachtNa?.toUpperCase();
  const huidigRang = rangVoor(labelHuidig);
  const naRang = rangVoor(labelNa);
  const aantalLabelStappen = (huidigRang >= 0 && naRang >= 0) ? (huidigRang - naRang) : 0;
  // Eindlabel ≥ B betekent A of B → naRang ≤ 1
  const eindlabelOkVoorIntegraal = naRang >= 0 && naRang <= 1;
  const renovatiestandaard = labelInfo?.renovatiestandaard === true;
  const grooteOnderneming = context.organisatie?.grooteOnderneming === true;

  const basis = {
    aantalMaatregelen,
    aantalLabelStappen,
    labelHuidig,
    labelNa,
    eindlabelOkVoorIntegraal,
    renovatiestandaard,
    grooteOnderneming,
  };

  if (aantalMaatregelen === 0) {
    return { ...basis, regime: 'geen', percentage: 0, naam: '', uitleg: 'Geen maatregelen gekozen' };
  }
  if (aantalMaatregelen <= 3) {
    return {
      ...basis, regime: 'losse', percentage: 0.20, naam: 'DUMAVA losse maatregelen',
      uitleg: `${aantalMaatregelen} maatregel(en) → losse-regime 20%`,
    };
  }
  // 4+ maatregelen: check eisen voor integraal
  if (aantalLabelStappen >= 3 && eindlabelOkVoorIntegraal) {
    if (renovatiestandaard && !grooteOnderneming) {
      return {
        ...basis, regime: 'integraal_p2', percentage: 0.40,
        naam: 'DUMAVA integraal verduurzamingsproject (hoge energieprestatie)',
        uitleg: `${aantalMaatregelen} maatregelen + ${aantalLabelStappen} labelstappen naar ${labelNa} + renovatiestandaard + kleine onderneming → 40%`,
      };
    }
    return {
      ...basis, regime: 'integraal_p1', percentage: 0.30,
      naam: 'DUMAVA integraal verduurzamingsproject',
      uitleg: `${aantalMaatregelen} maatregelen + ${aantalLabelStappen} labelstappen naar ${labelNa} (≥B) → 30%`,
    };
  }
  return { ...basis, regime: 'geen', percentage: 0, naam: '',
    uitleg: 'Niet voldoende voor integraal-regime' };
}

/**
 * Pas DUMAVA-regime toe op alle resultaten (mutates in-place de DUMAVA-rij).
 * Verwijdert DUMAVA bij regime 'geen', vervangt bedrag/percentage/naam anders.
 *
 * Voegt ook een waarschuwing toe aan elk resultaat om de gebruiker te informeren
 * waarom DUMAVA wel/niet/anders toegekend is.
 */
export function pasDumavaRegimeToe<T extends MaatregelResultaat>(
  resultaten: Record<string, T | undefined>,
  context: ProjectContext,
): { regime: DumavaRegimeResultaat; warningPerMaatregel: Record<string, string> } {
  const aantalMaatregelen = Object.values(resultaten).filter(r => r && r.brutoInvestering > 0).length;
  const regime = bepaalDumavaRegime(aantalMaatregelen, context);
  const warningPerMaatregel: Record<string, string> = {};

  for (const id of Object.keys(resultaten)) {
    const res = resultaten[id];
    if (!res || !res.subsidies) continue;
    const dumavaIdx = res.subsidies.findIndex(s => s.bron === 'dumava');
    if (dumavaIdx < 0) continue;

    let nieuweSubsidies = [...res.subsidies];
    let warning = '';

    if (regime.regime === 'geen') {
      nieuweSubsidies = nieuweSubsidies.filter((_, i) => i !== dumavaIdx);
      if (aantalMaatregelen === 0) {
        warning = 'DUMAVA niet toegekend: geen maatregelen gekozen.';
      } else if (regime.aantalLabelStappen < 3) {
        warning = `DUMAVA niet toegekend: bij 4+ maatregelen is minimaal 3 labelstappen verplicht (nu ${regime.aantalLabelStappen}). Vul huidig + verwacht energielabel in stap 1 in. Of kies maximaal 3 maatregelen voor losse 20%-subsidie.`;
      } else if (!regime.eindlabelOkVoorIntegraal) {
        warning = `DUMAVA niet toegekend: eindlabel moet minimaal B zijn voor integraal-regime (nu ${regime.labelNa ?? 'onbekend'}). Voeg meer schil-maatregelen toe om naar B/A te komen, of kies maximaal 3 maatregelen voor losse 20%.`;
      } else {
        warning = 'DUMAVA niet toegekend: voorwaarden integraal-regime niet vervuld.';
      }
    } else {
      const nieuwBedrag = res.brutoInvestering * regime.percentage;
      nieuweSubsidies[dumavaIdx] = {
        ...nieuweSubsidies[dumavaIdx],
        naam: regime.naam,
        bedrag: nieuwBedrag,
        percentage: regime.percentage,
      };
      if (regime.regime === 'integraal_p1') {
        warning = `${regime.uitleg}. Tip: bij renovatiestandaard (A++/A+++) + kleine onderneming kan dit 40% worden. Maatwerkadvies (A.2) verplicht voor de aanvraag.`;
      } else if (regime.regime === 'integraal_p2') {
        warning = `${regime.uitleg}. Maatwerkadvies (A.2) verplicht voor de aanvraag.`;
      }
    }

    const totSub = nieuweSubsidies.reduce((s, x) => s + x.bedrag, 0);
    resultaten[id] = {
      ...res,
      subsidies: nieuweSubsidies,
      totaleSubsidie: totSub,
      nettoInvestering: res.brutoInvestering - totSub,
    } as T;
    if (warning) warningPerMaatregel[id] = warning;
  }

  return { regime, warningPerMaatregel };
}
