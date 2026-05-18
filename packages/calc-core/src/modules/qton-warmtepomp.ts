/**
 * Q-ton CO₂-warmtepomp voor tapwater (Mitsubishi).
 *
 * Bron: Rekenmodel_Sportief_Opgewekt!Q-ton
 *
 * Q-ton gebruikt CO₂ als koudemiddel en kan tapwater tot 90°C leveren,
 * geschikt voor grote sportclubs en hotels. Vermogen 30 kW (HMA30A) of
 * 45 kW (HMA45A). Sterk punt: hoge COP bij lage buitentemperaturen door
 * de CO₂-thermodynamica.
 *
 * Verschillen t.o.v. de generieke warmtepompboiler:
 *   - Hogere output-temperatuur (90°C i.p.v. 65°C) → geen legionellaboiler nodig
 *   - Hogere investering (€25k–€40k afhankelijk van model)
 *   - Vaste vermogensklassen (geen vrij kiesbaar kW)
 *
 * Bij temperatuur tot 65°C levert Q-ton gemiddeld SCOP ~3.8.
 * Bij 90°C output zakt dit naar ~3.0.
 *
 * ISDE 2025: €2.500 (HMA30A) of €3.700 (HMA45A) per unit.
 */

import type {
  MaatregelModule,
  MaatregelResultaat,
  ProjectContext,
  Subsidie,
  Warning,
} from '../types/index.js';
import { dumavaSubsidie, isdeSubsidie, maakBusinessCase } from '../util/business-case.js';
import { C_WATER, GAS_LHV_KWH_M3 } from '../types/index.js';

export type QtonModel = 'HMA30A' | 'HMA45A';

interface QtonSpec {
  model: QtonModel;
  vermogenKw: number;
  scop65: number;
  scop90: number;
  prijsInclBtw: number;
  isdeBedrag: number;
}

const QTON_SPECS: Record<QtonModel, QtonSpec> = {
  HMA30A: {
    model: 'HMA30A',
    vermogenKw: 30,
    scop65: 3.8,
    scop90: 3.0,
    prijsInclBtw: 28_500,
    isdeBedrag: 2_500,
  },
  HMA45A: {
    model: 'HMA45A',
    vermogenKw: 45,
    scop65: 3.7,
    scop90: 2.9,
    prijsInclBtw: 38_500,
    isdeBedrag: 3_700,
  },
};

export interface QtonInput {
  model: QtonModel;
  aantalUnits: number;
  /** Liters tapwater per jaar */
  litersPerJaar: number;
  /** Output-temperatuur (default 65; 90 als legionellaboiler vervangen wordt) */
  warmwaterTemperatuurC: 65 | 90;
  /** Koudwater-temperatuur (default 10) */
  koudwaterTemperatuurC: number;
  /** Rendement bestaande gasketel */
  gasketelRendement: number;
  /** Optionele override van SCOP (anders product-default) */
  scopOverride?: number;
  /** Optionele override van investering totaal incl btw */
  brutoInvesteringOverride?: number;
  extraSubsidies?: Subsidie[];
}

export interface QtonResultaat extends MaatregelResultaat {
  model: QtonModel;
  vermogenKw: number;
  warmtevraagKwh: number;
  scop: number;
}

export const qtonWarmtepompModule: MaatregelModule<QtonInput, QtonResultaat> = {
  id: 'qton-warmtepomp',
  naam: 'Q-ton CO₂-warmtepomp (Mitsubishi)',

  defaultInput(_context: ProjectContext): QtonInput {
    return {
      model: 'HMA30A',
      aantalUnits: 1,
      litersPerJaar: 200_000,
      warmwaterTemperatuurC: 65,
      koudwaterTemperatuurC: 10,
      gasketelRendement: 0.95,
    };
  },

  bereken(input: QtonInput, context: ProjectContext): QtonResultaat {
    const warnings: Warning[] = [];
    const spec = QTON_SPECS[input.model];

    if (input.warmwaterTemperatuurC !== 65 && input.warmwaterTemperatuurC !== 90) {
      warnings.push({
        level: 'warning',
        code: 'TEMPERATUUR_NIET_STANDAARD',
        message: 'Q-ton-SCOP is alleen gespecificeerd voor 65°C en 90°C output.',
      });
    }
    if (input.warmwaterTemperatuurC <= input.koudwaterTemperatuurC) {
      warnings.push({ level: 'error', code: 'DT_INVALID', message: 'Warmwater-T moet > koudwater-T' });
    }

    const deltaT = input.warmwaterTemperatuurC - input.koudwaterTemperatuurC;
    const qKj = input.litersPerJaar * C_WATER * deltaT;
    const qKwh = qKj / 3600;

    const scop = input.scopOverride
      ?? (input.warmwaterTemperatuurC === 90 ? spec.scop90 : spec.scop65);

    const gasverbruikOudM3 = qKwh / GAS_LHV_KWH_M3 / input.gasketelRendement;
    const stroomverbruikNieuwKwh = qKwh / scop;

    const totaalVermogen = spec.vermogenKw * input.aantalUnits;

    // Capaciteitscheck: kunnen aantalUnits × vermogen genoeg leveren?
    // Vuistregel: piekvraag tapwater ~3× gemiddelde dagvraag
    const gemiddeldDagVraagKwh = qKwh / 365;
    const piekVraagKwh = gemiddeldDagVraagKwh * 3;
    if (piekVraagKwh > totaalVermogen * 24 * 0.6) {
      warnings.push({
        level: 'warning',
        code: 'CAPACITEIT_KRAP',
        message: `Piek tapwatervraag (${piekVraagKwh.toFixed(0)} kWh/dag) ` +
          `nadert capaciteit ${totaalVermogen} kW × 24h × 60% duty cycle.`,
      });
    }

    const brutoInvestering = input.brutoInvesteringOverride
      ?? spec.prijsInclBtw * input.aantalUnits;
    const isdeTotaal = spec.isdeBedrag * input.aantalUnits;

    const subsidies: Subsidie[] = [
      dumavaSubsidie(brutoInvestering, context),
      isdeSubsidie(isdeTotaal),
      ...(input.extraSubsidies ?? []),
    ];

    const baseResult = maakBusinessCase({
      maatregelId: 'qton-warmtepomp',
      brutoInvestering,
      subsidies,
      besparingGasM3: gasverbruikOudM3,
      extraStroomverbruikKwh: stroomverbruikNieuwKwh,
      piekVermogenKw: totaalVermogen,
      context,
      warnings,
    });

    return {
      ...baseResult,
      model: input.model,
      vermogenKw: totaalVermogen,
      warmtevraagKwh: qKwh,
      scop,
    };
  },
};

export const QTON_MODELLEN = Object.values(QTON_SPECS);
