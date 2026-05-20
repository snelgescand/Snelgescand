/**
 * Aansluitwaarde-check utility.
 *
 * Bron: Rekenmodel_Sportief_Opgewekt!Toekomstige_aansluitwaarde
 *
 * Geen "maatregel" — geen kosten/besparing — maar een hulpfunctie die
 * controleert of de huidige aansluitwaarde voldoende is voor de
 * cumulatieve piekvraag na alle gekozen maatregelen.
 */

import type { AansluitingType } from '../types/index.js';
import { AANSLUITINGEN, AansluitingRow } from '../data/aansluitwaarden.js';

export interface AansluitwaardeCheckInput {
  huidigeAansluiting: AansluitingType;
  /** Som van piekvraag uit alle maatregelen (kW) — positief = extra vraag */
  extraPiekvermogenKw: number;
  /** Bestaande gemiddelde piekbelasting in kW (uit kWh/jaar × belastingsfactor) */
  bestaandePiekKw: number;
  /** Veiligheidsmarge — bv 1.2 voor 20% reserve */
  veiligheidsmarge: number;
}

export interface AansluitwaardeCheckResultaat {
  nieuwePiekKw: number;
  huidigeCapaciteitKw: number;
  voldoende: boolean;
  benodigdeOpwaardering?: AansluitingRow;
  /** Indicatie eenmalige aansluitwijziging-kosten (€) — orde van grootte */
  geschatteOpwaarderingsKosten?: number;
}

const OPWAARDERINGSKOSTEN_LOOKUP: Record<string, number> = {
  '1x35':  500,
  '1x40':  500,
  '3x25':  1500,
  '3x35':  2500,
  '3x50':  4000,
  '3x63':  6000,
  '3x80':  10_000,
  '3x100': 15_000,
  '3x125': 20_000,
  '3x160': 30_000,
  '3x200': 50_000,
};

function rowKey(r: AansluitingRow): string {
  return `${r.fase}x${r.ampere}`;
}

export function controleerAansluitwaarde(input: AansluitwaardeCheckInput): AansluitwaardeCheckResultaat {
  // Defensief: als huidigeAansluiting ontbreekt (oude project-state of merge-bug),
  // val terug op 3x25A (17,2 kW) — meest voorkomende sportclub-aansluiting.
  const huidigeKw = input.huidigeAansluiting?.vermogenKw ?? 17.2;
  const nieuwePiek = (input.bestaandePiekKw + input.extraPiekvermogenKw) * input.veiligheidsmarge;
  const voldoende = nieuwePiek <= huidigeKw;

  if (voldoende) {
    return {
      nieuwePiekKw: nieuwePiek,
      huidigeCapaciteitKw: huidigeKw,
      voldoende: true,
    };
  }

  const opwaardering = AANSLUITINGEN.find(a => a.vermogenKw >= nieuwePiek);
  const kosten = opwaardering ? OPWAARDERINGSKOSTEN_LOOKUP[rowKey(opwaardering)] : undefined;

  return {
    nieuwePiekKw: nieuwePiek,
    huidigeCapaciteitKw: huidigeKw,
    voldoende: false,
    benodigdeOpwaardering: opwaardering,
    geschatteOpwaarderingsKosten: kosten,
  };
}
