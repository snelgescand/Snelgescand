/**
 * LMNT modulair lucht/water-warmtepompsysteem voor tapwater.
 *
 * Bron: Rekenmodel_Sportief_Opgewekt!COP LMNT
 *
 * LMNT is een modulair systeem dat in 5–15 kW-stappen gekoppeld kan
 * worden (kasten parallel). Geschikt voor middelgrote sportclubs.
 * Output 60–65°C, SCOP 3.0–3.8 afhankelijk van buitencondities.
 *
 * Verschil t.o.v. Q-ton:
 *   - Geen 90°C-mogelijkheid (dus legionella-spoelboiler nodig)
 *   - Modulair vermogen i.p.v. vaste klassen
 *   - Lagere prijs per kW (€800–€1.200 incl. installatie)
 *
 * COP-curve is buitentemperatuur-afhankelijk; voor een SCOP-jaarwaarde
 * gebruiken we Excel-vuistregel:
 *
 *   SCOP = 3.6 - 0.1 × (T_uit - 60)/5
 *
 * Bij T_uit=60: 3.6. Bij T_uit=65: 3.5. Bij T_uit=55: 3.7.
 *
 * ISDE 2025: ~€225 per kW thermisch vermogen.
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

export interface LmntInput {
  /** Totaal thermisch vermogen (modulair, in 5 kW-stappen) */
  vermogenKw: number;
  litersPerJaar: number;
  /** Output-temperatuur, typisch 60-65°C */
  warmwaterTemperatuurC: number;
  koudwaterTemperatuurC: number;
  /** Gemiddelde buitentemperatuur stookseizoen (default 7°C voor NL) */
  buitenTemperatuurC: number;
  /** Rendement bestaande gasketel */
  gasketelRendement: number;
  /** Optionele override van SCOP */
  scopOverride?: number;
  /** €/kW thermisch incl. installatie */
  prijsPerKwInclBtw: number;
  /** ISDE per kW */
  isdeBedragPerKw: number;
  /** Of er een aparte legionella-spoelboiler (kost extra) nodig is */
  metLegionellaBoiler: boolean;
  legionellaBoilerKostenInclBtw: number;
  extraSubsidies?: Subsidie[];
}

export interface LmntResultaat extends MaatregelResultaat {
  vermogenKw: number;
  warmtevraagKwh: number;
  scop: number;
}

/**
 * SCOP-schatting op basis van output-T en gemiddelde buiten-T.
 *
 * Empirische curve uit COP LMNT-tabblad. Conservatief.
 */
function schatScopLmnt(tUit: number, tBuiten: number): number {
  const base = 3.6;
  const correctieTUit = -0.1 * (tUit - 60) / 5;
  const correctieTBuiten = 0.05 * (tBuiten - 7);
  return Math.max(2.0, Math.min(4.5, base + correctieTUit + correctieTBuiten));
}

export const lmntWarmtepompModule: MaatregelModule<LmntInput, LmntResultaat> = {
  id: 'lmnt-warmtepomp',
  naam: 'LMNT modulaire warmtepomp',

  defaultInput(_context: ProjectContext): LmntInput {
    return {
      vermogenKw: 15,
      litersPerJaar: 150_000,
      warmwaterTemperatuurC: 60,
      koudwaterTemperatuurC: 10,
      buitenTemperatuurC: 7,
      gasketelRendement: 0.95,
      prijsPerKwInclBtw: 1_000,
      isdeBedragPerKw: 225,
      metLegionellaBoiler: true,
      legionellaBoilerKostenInclBtw: 1_500,
    };
  },

  bereken(input: LmntInput, context: ProjectContext): LmntResultaat {
    const warnings: Warning[] = [];

    if (input.vermogenKw % 5 !== 0) {
      warnings.push({
        level: 'warning',
        code: 'NIET_MODULAIR',
        message: `LMNT is modulair in 5 kW-stappen; ${input.vermogenKw} kW afgerond.`,
      });
    }

    const deltaT = input.warmwaterTemperatuurC - input.koudwaterTemperatuurC;
    const qKj = input.litersPerJaar * C_WATER * deltaT;
    const qKwh = qKj / 3600;

    const scop = input.scopOverride ?? schatScopLmnt(input.warmwaterTemperatuurC, input.buitenTemperatuurC);

    const gasverbruikOudM3 = qKwh / GAS_LHV_KWH_M3 / input.gasketelRendement;
    const stroomverbruikNieuwKwh = qKwh / scop;

    const wpInvestering = input.vermogenKw * input.prijsPerKwInclBtw;
    const boilerInvestering = input.metLegionellaBoiler ? input.legionellaBoilerKostenInclBtw : 0;
    const brutoInvestering = wpInvestering + boilerInvestering;
    const isdeTotaal = input.vermogenKw * input.isdeBedragPerKw;

    const subsidies: Subsidie[] = [
      dumavaSubsidie(brutoInvestering, context),
      isdeSubsidie(isdeTotaal),
      ...(input.extraSubsidies ?? []),
    ];

    const baseResult = maakBusinessCase({
      maatregelId: 'lmnt-warmtepomp',
      brutoInvestering,
      subsidies,
      besparingGasM3: gasverbruikOudM3,
      extraStroomverbruikKwh: stroomverbruikNieuwKwh,
      piekVermogenKw: input.vermogenKw,
      context,
      warnings,
    });

    return {
      ...baseResult,
      vermogenKw: input.vermogenKw,
      warmtevraagKwh: qKwh,
      scop,
    };
  },
};
