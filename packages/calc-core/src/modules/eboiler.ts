/**
 * E-boiler (elektrische boiler) module.
 *
 * Bron: Rekenmodel_Sportief_Opgewekt!E-boiler
 *
 * Simpele elektrische weerstandsboiler — vervangt gas door stroom 1:1 op
 * energie-basis (rendement ~99%). Veel hoger stroomverbruik dan een
 * warmtepompboiler maar veel goedkoper qua aanschaf.
 *
 *   Q_kWh = m × c × ΔT / 3600
 *   stroomverbruik = Q_kWh / 0.99
 *
 * Vooral interessant in combinatie met PV-overschot of als noodboiler.
 *
 * KOMT NIET IN AANMERKING VOOR ISDE.
 */

import type {
  MaatregelModule,
  MaatregelResultaat,
  ProjectContext,
  Subsidie,
  Warning,
} from '../types/index.js';
import { dumavaSubsidie, maakBusinessCase } from '../util/business-case.js';
import { C_WATER, GAS_LHV_KWH_M3 } from '../types/index.js';

export interface EBoilerInput {
  litersPerJaar: number;
  warmwaterTemperatuurC: number;
  koudwaterTemperatuurC: number;
  /** Rendement e-boiler ~0.99 */
  rendement: number;
  /** Rendement bestaande gasketel ~0.95 */
  gasketelRendement: number;
  /** Vermogen e-boiler in kW (voor piekberekening) */
  vermogenKw: number;
  brutoInvestering: number;
  extraSubsidies?: Subsidie[];
}

export interface EBoilerResultaat extends MaatregelResultaat {
  warmtevraagKwh: number;
}

export const eBoilerModule: MaatregelModule<EBoilerInput, EBoilerResultaat> = {
  id: 'eboiler',
  naam: 'Elektrische boiler',

  defaultInput(_context: ProjectContext): EBoilerInput {
    return {
      litersPerJaar: 50_000,
      warmwaterTemperatuurC: 60,
      koudwaterTemperatuurC: 10,
      rendement: 0.99,
      gasketelRendement: 0.95,
      vermogenKw: 9,
      brutoInvestering: 2500,
    };
  },

  bereken(input: EBoilerInput, context: ProjectContext): EBoilerResultaat {
    const warnings: Warning[] = [];

    const deltaT = input.warmwaterTemperatuurC - input.koudwaterTemperatuurC;
    const qKj = input.litersPerJaar * C_WATER * deltaT;
    const qKwh = qKj / 3600;

    const gasverbruikOudM3 = qKwh / GAS_LHV_KWH_M3 / input.gasketelRendement;
    const stroomverbruikNieuwKwh = qKwh / input.rendement;

    const subsidies: Subsidie[] = [
      dumavaSubsidie(input.brutoInvestering, context),
      ...(input.extraSubsidies ?? []),
    ];

    const baseResult = maakBusinessCase({
      maatregelId: 'eboiler',
      brutoInvestering: input.brutoInvestering,
      subsidies,
      besparingGasM3: gasverbruikOudM3,
      extraStroomverbruikKwh: stroomverbruikNieuwKwh,
      piekVermogenKw: input.vermogenKw,
      context,
      warnings,
    });

    const aansluitVermogen = context.energie?.aansluitwaardeElektra?.vermogenKw ?? 17.2;
    if (input.vermogenKw > aansluitVermogen * 0.5) {
      warnings.push({
        level: 'warning',
        code: 'PIEK_TE_HOOG',
        message: `E-boiler van ${input.vermogenKw} kW belast aansluiting (${aansluitVermogen} kW) zwaar.`,
      });
    }

    return {
      ...baseResult,
      warmtevraagKwh: qKwh,
      warnings,
    };
  },
};
