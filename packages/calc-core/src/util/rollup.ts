/**
 * Penningmeester-rollup.
 *
 * Bron: Rekenmodel_Sportief_Opgewekt!Voor_de_penningmeester
 *
 * Telt alle gekozen maatregelen op tot één project-niveau samenvatting:
 *   - totale investering
 *   - totale subsidie
 *   - netto-investering
 *   - jaarlijkse besparing (€)
 *   - gemiddelde TVT (gewogen op investering)
 *   - CO2-besparing
 *   - nieuw piekvermogen + aansluitwaarde-check
 */

import type {
  MaatregelResultaat,
  MaatregelId,
  ProjectContext,
  ProjectResultaat,
  Warning,
} from '../types/index.js';
import { controleerAansluitwaarde } from './aansluitwaarde-check.js';

export interface RollupInput {
  context: ProjectContext;
  /** Map met de berekende resultaten per maatregel (alleen actieve maatregelen) */
  resultaten: Partial<Record<MaatregelId, MaatregelResultaat>>;
  /** Geschatte bestaande piekbelasting (kW). Default = jaarverbruik / 2500. */
  bestaandePiekKw?: number;
  /** Veiligheidsmarge voor aansluitwaarde-check (default 1.2) */
  aansluitwaardeMarge?: number;
}

export function rollupProject(input: RollupInput): ProjectResultaat {
  const { context, resultaten } = input;
  const warnings: Warning[] = [];

  let totaleInvestering = 0;
  let totaleSubsidie = 0;
  let nettoInvestering = 0;
  let totaleBesparing = 0;
  let totaleGasM3 = 0;
  let totaleStroomKwh = 0;
  let totaalExtraStroom = 0;
  let totaleCo2 = 0;
  let totaalPiek = 0;

  // Voor gewogen TVT
  let tvtNoemer = 0;
  let tvtTeller = 0;

  for (const r of Object.values(resultaten) as MaatregelResultaat[]) {
    if (!r) continue;
    totaleInvestering += r.brutoInvestering;
    totaleSubsidie += r.totaleSubsidie;
    nettoInvestering += r.nettoInvestering;
    totaleBesparing += r.besparingPerJaar;
    totaleGasM3 += r.besparingGasM3 ?? 0;
    totaleStroomKwh += r.besparingStroomKwh ?? 0;
    totaalExtraStroom += r.extraStroomverbruikKwh ?? 0;
    totaleCo2 += r.co2BesparingKg;
    totaalPiek += r.piekVermogenKw ?? 0;

    if (r.terugverdientijdJaren > 0 && Number.isFinite(r.terugverdientijdJaren)) {
      tvtNoemer += r.nettoInvestering;
      tvtTeller += r.nettoInvestering * r.terugverdientijdJaren;
    }

    warnings.push(...r.warnings);
  }

  const bestaandePiek = input.bestaandePiekKw
    ?? Math.max((context.energie?.stroomverbruikTotaalKwh ?? 0) / 2500, 0);

  // Defensief: zorg dat aansluitwaardeElektra altijd vermogenKw heeft
  const aansluiting = context.energie?.aansluitwaardeElektra
    ?? { fase: 3 as 1 | 3, ampere: 25, vermogenKw: 17.2 };

  const aansluitcheck = controleerAansluitwaarde({
    huidigeAansluiting: aansluiting,
    extraPiekvermogenKw: totaalPiek,
    bestaandePiekKw: bestaandePiek,
    veiligheidsmarge: input.aansluitwaardeMarge ?? 1.2,
  });

  if (!aansluitcheck.voldoende) {
    warnings.push({
      level: 'warning',
      code: 'AANSLUITWAARDE',
      message: `Aansluitwaarde ${aansluiting.vermogenKw} kW ` +
        `is onvoldoende voor nieuwe piek ${aansluitcheck.nieuwePiekKw.toFixed(1)} kW. ` +
        (aansluitcheck.benodigdeOpwaardering
          ? `Opwaarderen naar ${aansluitcheck.benodigdeOpwaardering.label} (~€${aansluitcheck.geschatteOpwaarderingsKosten}).`
          : 'Geen passende aansluiting gevonden — grootverbruik nodig.'),
    });
  }

  const gemTvt = tvtNoemer > 0 ? tvtTeller / tvtNoemer : Infinity;

  // Maak een MaatregelId-volledig record voor de typing
  const perMaatregel = resultaten as Record<MaatregelId, MaatregelResultaat | undefined>;

  return {
    totaleInvestering,
    totaleSubsidie,
    nettoInvestering,
    totaleBesparingPerJaar: totaleBesparing,
    gemiddeldeTerugverdientijdJaren: gemTvt,
    totaleBesparingGasM3: totaleGasM3,
    totaleBesparingStroomKwh: totaleStroomKwh,
    totaalExtraStroomverbruikKwh: totaalExtraStroom,
    totaleCo2BesparingKg: totaleCo2,
    totaalToegevoegdPiekvermogenKw: totaalPiek,
    nieuwePiekBelastingKw: aansluitcheck.nieuwePiekKw,
    aansluitwaardeVoldoende: aansluitcheck.voldoende,
    perMaatregel,
    warnings,
  };
}
