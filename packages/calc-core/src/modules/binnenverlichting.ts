/**
 * Binnenverlichting (LED-conversie) module.
 *
 * Bron: Rekenmodel_Sportief_Opgewekt!Binnenverlichting
 *
 * Bereken besparing van vervanging van armaturen door LED.
 *
 *   verbruik_oud = aantal × wattage_oud × branduren / 1000  (kWh)
 *   verbruik_nieuw = aantal × wattage_nieuw × branduren / 1000
 *   besparing = verbruik_oud - verbruik_nieuw
 *
 * Investering: kostenPerArmatuur × aantal.
 */

import type {
  MaatregelModule,
  MaatregelResultaat,
  ProjectContext,
  Subsidie,
  Warning,
} from '../types/index.js';
import { dumavaSubsidie, maakBusinessCase } from '../util/business-case.js';

export interface BinnenverlichtingInput {
  aantalArmaturen: number;
  wattageOudPerArmatuur: number;
  wattageNieuwPerArmatuur: number;
  brandurenPerJaar: number;
  kostenPerArmatuurInclBtw: number;
  extraSubsidies?: Subsidie[];
}

export interface BinnenverlichtingResultaat extends MaatregelResultaat {
  verbruikOudKwh: number;
  verbruikNieuwKwh: number;
}

export const binnenverlichtingModule: MaatregelModule<BinnenverlichtingInput, BinnenverlichtingResultaat> = {
  id: 'binnenverlichting',
  naam: 'LED binnenverlichting',

  defaultInput(_context: ProjectContext): BinnenverlichtingInput {
    return {
      aantalArmaturen: 30,
      wattageOudPerArmatuur: 58,        // TL-buis met conventioneel voorschakelapparaat
      wattageNieuwPerArmatuur: 24,       // LED-vervanger
      brandurenPerJaar: 1500,
      kostenPerArmatuurInclBtw: 75,
    };
  },

  bereken(input: BinnenverlichtingInput, context: ProjectContext): BinnenverlichtingResultaat {
    const warnings: Warning[] = [];
    if (input.wattageNieuwPerArmatuur >= input.wattageOudPerArmatuur) {
      warnings.push({
        level: 'warning',
        code: 'GEEN_VERBETERING',
        message: 'Nieuw wattage niet lager dan oud — geen besparing.',
      });
    }

    const verbruikOudKwh = (input.aantalArmaturen * input.wattageOudPerArmatuur * input.brandurenPerJaar) / 1000;
    const verbruikNieuwKwh = (input.aantalArmaturen * input.wattageNieuwPerArmatuur * input.brandurenPerJaar) / 1000;
    const besparingKwh = verbruikOudKwh - verbruikNieuwKwh;

    const brutoInvestering = input.aantalArmaturen * input.kostenPerArmatuurInclBtw;

    const subsidies: Subsidie[] = [
      dumavaSubsidie(brutoInvestering, context),
      ...(input.extraSubsidies ?? []),
    ];

    const baseResult = maakBusinessCase({
      maatregelId: 'binnenverlichting',
      brutoInvestering,
      subsidies,
      besparingStroomKwh: besparingKwh,
      // Bij LED is de piekreductie ook gelijk aan vermogensverschil
      piekVermogenKw: -(input.aantalArmaturen * (input.wattageOudPerArmatuur - input.wattageNieuwPerArmatuur)) / 1000,
      context,
      warnings,
    });

    return {
      ...baseResult,
      verbruikOudKwh,
      verbruikNieuwKwh,
    };
  },
};
