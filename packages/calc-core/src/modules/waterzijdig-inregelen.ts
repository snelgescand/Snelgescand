/**
 * Waterzijdig Inregelen module.
 *
 * Bron: Rekenmodel_Sportief_Opgewekt!Waterzijdig_inregelen
 *
 * Het optimaliseren van de waterstromen door de cv-installatie zodat alle
 * radiatoren hun ontwerp-debiet krijgen. Resultaat is een lagere
 * aanvoertemperatuur en gemiddeld 8% (range 5–15%) besparing op gas voor
 * ruimteverwarming.
 *
 * Kosten in Excel: ~€350 per radiator/groep.
 */

import type {
  MaatregelModule,
  MaatregelResultaat,
  ProjectContext,
  Subsidie,
  Warning,
} from '../types/index.js';
import { dumavaSubsidie, maakBusinessCase } from '../util/business-case.js';

export interface WaterzijdigInregelenInput {
  /** Aantal radiator-groepen/afleveringen */
  aantalRadiatoren: number;
  /** % besparing op huidige gasverbruik voor ruimteverwarming. Default 0.08 */
  besparingsPercentage: number;
  /**
   * Gasverbruik dat aan ruimteverwarming toe te schrijven is in m³/jaar.
   * Als undefined: schat als 70% van totaal gasverbruik (rest = tapwater).
   */
  gasverbruikRuimteverwarmingM3?: number;
  kostenPerRadiatorInclBtw?: number;
  extraSubsidies?: Subsidie[];
}

export interface WaterzijdigInregelenResultaat extends MaatregelResultaat {
  besparingPercentage: number;
}

const DEFAULT_KOSTEN_PER_RADIATOR = 350;

export const waterzijdigInregelenModule: MaatregelModule<WaterzijdigInregelenInput, WaterzijdigInregelenResultaat> = {
  id: 'waterzijdig-inregelen',
  naam: 'Waterzijdig inregelen',

  defaultInput(context: ProjectContext): WaterzijdigInregelenInput {
    return {
      aantalRadiatoren: 10,
      besparingsPercentage: 0.08,
      gasverbruikRuimteverwarmingM3: context.energie.gasverbruikM3 * 0.7,
    };
  },

  bereken(input: WaterzijdigInregelenInput, context: ProjectContext): WaterzijdigInregelenResultaat {
    const warnings: Warning[] = [];
    if (input.aantalRadiatoren <= 0) {
      warnings.push({ level: 'error', code: 'GEEN_RADIATOREN', message: 'Aantal radiatoren moet > 0 zijn' });
    }
    if (input.besparingsPercentage < 0 || input.besparingsPercentage > 0.3) {
      warnings.push({
        level: 'warning',
        code: 'PCT_AFWIJKEND',
        message: 'Besparingspercentage buiten realistische range (5–15%).',
      });
    }

    const gasBasis = input.gasverbruikRuimteverwarmingM3 ?? context.energie.gasverbruikM3 * 0.7;
    const besparingM3Gas = gasBasis * input.besparingsPercentage;

    const prijs = input.kostenPerRadiatorInclBtw ?? DEFAULT_KOSTEN_PER_RADIATOR;
    const brutoInvestering = prijs * input.aantalRadiatoren;

    const subsidies: Subsidie[] = [
      dumavaSubsidie(brutoInvestering, context),
      ...(input.extraSubsidies ?? []),
    ];

    const baseResult = maakBusinessCase({
      maatregelId: 'waterzijdig-inregelen',
      brutoInvestering,
      subsidies,
      besparingGasM3: besparingM3Gas,
      context,
      warnings,
    });

    return {
      ...baseResult,
      besparingPercentage: input.besparingsPercentage,
    };
  },
};
