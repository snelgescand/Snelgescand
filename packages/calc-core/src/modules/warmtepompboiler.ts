/**
 * Warmtepompboiler (tapwater) module.
 *
 * Bron: Rekenmodel_Sportief_Opgewekt!Warmtepompboiler
 *
 * Vervangt gasgestookte tapwaterbereiding door een warmtepomp-boiler met
 * COP rond 3.5 (lucht/water).
 *
 *   Q_tapwater = m × c × ΔT     (kJ)
 *   m = liters water/jaar
 *   c = 4.19 kJ/(kg·K)
 *   ΔT = 38 - 10 = 28K typisch
 *
 *   Gasverbruik vervalt: m³/jaar = Q_kWh / 8.79 (rendement gasketel ~95%)
 *   Stroomverbruik = Q_kWh / COP
 *
 * Vermogenskeuze afhankelijk van piekvraag (zie boiler-dimensionering.ts).
 *
 * ISDE-subsidie: in 2025 €750–€1500 per unit afhankelijk van vermogen.
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

export interface WarmtepompBoilerInput {
  /** Liters tapwater per jaar */
  litersPerJaar: number;
  /** Gewenste douche/tap-temperatuur in °C */
  warmwaterTemperatuurC: number;
  /** Inkomende koudwater-temperatuur in °C */
  koudwaterTemperatuurC: number;
  /** COP van de warmtepompboiler */
  cop: number;
  /** Rendement van de bestaande gasketel (om gasverbruik te corrigeren) */
  gasketelRendement: number;
  /** Aantal units */
  aantalUnits: number;
  /** Prijs per unit incl btw */
  prijsPerUnitInclBtw: number;
  /** ISDE-bijdrage per unit (in €) */
  isdeBedragPerUnit: number;
  extraSubsidies?: Subsidie[];
}

export interface WarmtepompBoilerResultaat extends MaatregelResultaat {
  warmtevraagKwh: number;
  copEffectief: number;
}

export const warmtepompBoilerModule: MaatregelModule<WarmtepompBoilerInput, WarmtepompBoilerResultaat> = {
  id: 'warmtepompboiler',
  naam: 'Warmtepompboiler tapwater',

  defaultInput(_context: ProjectContext): WarmtepompBoilerInput {
    return {
      litersPerJaar: 100_000,
      warmwaterTemperatuurC: 38,
      koudwaterTemperatuurC: 10,
      cop: 3.5,
      gasketelRendement: 0.95,
      aantalUnits: 1,
      prijsPerUnitInclBtw: 3500,
      isdeBedragPerUnit: 1000,
    };
  },

  bereken(input: WarmtepompBoilerInput, context: ProjectContext): WarmtepompBoilerResultaat {
    const warnings: Warning[] = [];
    if (input.cop <= 1) {
      warnings.push({ level: 'error', code: 'COP_INVALID', message: 'COP moet > 1 zijn' });
    }
    if (input.warmwaterTemperatuurC <= input.koudwaterTemperatuurC) {
      warnings.push({ level: 'error', code: 'DT_INVALID', message: 'Warmwater-T moet > koudwater-T zijn' });
    }

    const deltaT = input.warmwaterTemperatuurC - input.koudwaterTemperatuurC;
    // Q in kJ
    const qKj = input.litersPerJaar * C_WATER * deltaT;
    // naar kWh
    const qKwh = qKj / 3600;

    // Vervallen gasverbruik
    const gasverbruikOudM3 = qKwh / GAS_LHV_KWH_M3 / input.gasketelRendement;
    // Nieuw stroomverbruik
    const stroomverbruikNieuwKwh = qKwh / input.cop;

    const brutoInvestering = input.prijsPerUnitInclBtw * input.aantalUnits;
    const isdeTotaal = input.isdeBedragPerUnit * input.aantalUnits;

    const subsidies: Subsidie[] = [
      dumavaSubsidie(brutoInvestering, context),
      isdeSubsidie(isdeTotaal),
      ...(input.extraSubsidies ?? []),
    ];

    const baseResult = maakBusinessCase({
      maatregelId: 'warmtepompboiler',
      brutoInvestering,
      subsidies,
      besparingGasM3: gasverbruikOudM3,
      extraStroomverbruikKwh: stroomverbruikNieuwKwh,
      // piekvermogen: nominaal vermogen warmtepomp ~0.5-1.5 kW
      piekVermogenKw: 1.0 * input.aantalUnits,
      context,
      warnings,
    });

    return {
      ...baseResult,
      warmtevraagKwh: qKwh,
      copEffectief: input.cop,
    };
  },
};
