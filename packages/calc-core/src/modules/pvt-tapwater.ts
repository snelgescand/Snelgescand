/**
 * PVT-panelen tapwater module.
 *
 * Bron: Rekenmodel_Sportief_Opgewekt!PVT-panelen_tapwater
 *
 * PVT = PhotoVoltaic Thermal — een hybride paneel dat zowel stroom (PV)
 * als warmte (thermisch) levert. Levert via een buffer voor- of na-
 * verwarmd water aan de tapwaterinstallatie of warmtepomp.
 *
 * Excel-vuistregel:
 *   thermische opbrengst per paneel: 800–1100 kWh/jaar (afhankelijk van orientatie)
 *   stroomopbrengst per paneel: 350–400 kWh/jaar
 *
 * Investering: €1500–€1800 per paneel installed.
 */

import type {
  MaatregelModule,
  MaatregelResultaat,
  ProjectContext,
  Subsidie,
  Warning,
} from '../types/index.js';
import { dumavaSubsidie, isdeSubsidie, maakBusinessCase } from '../util/business-case.js';
import { GAS_LHV_KWH_M3 } from '../types/index.js';

export interface PvtTapwaterInput {
  aantalPanelen: number;
  thermischePbrengstPerPaneelKwhJr: number;
  stroomOpbrengstPerPaneelKwhJr: number;
  prijsPerPaneelInclBtw: number;
  /** ISDE-bedrag per paneel */
  isdeBedragPerPaneel: number;
  /** Rendement van de gasketel die nu het water verwarmt */
  gasketelRendement: number;
  extraSubsidies?: Subsidie[];
}

export interface PvtResultaat extends MaatregelResultaat {
  thermischeOpbrengstKwh: number;
  pvOpbrengstKwh: number;
}

export const pvtTapwaterModule: MaatregelModule<PvtTapwaterInput, PvtResultaat> = {
  id: 'pvt-tapwater',
  naam: 'PVT-panelen tapwater',

  defaultInput(_context: ProjectContext): PvtTapwaterInput {
    return {
      aantalPanelen: 10,
      thermischePbrengstPerPaneelKwhJr: 950,
      stroomOpbrengstPerPaneelKwhJr: 375,
      prijsPerPaneelInclBtw: 1650,
      isdeBedragPerPaneel: 750,
      gasketelRendement: 0.95,
    };
  },

  bereken(input: PvtTapwaterInput, context: ProjectContext): PvtResultaat {
    const warnings: Warning[] = [];
    if (input.aantalPanelen <= 0) {
      warnings.push({ level: 'error', code: 'GEEN_PANELEN', message: 'Aantal panelen moet > 0 zijn' });
    }

    const thermischeKwh = input.aantalPanelen * input.thermischePbrengstPerPaneelKwhJr;
    const pvKwh = input.aantalPanelen * input.stroomOpbrengstPerPaneelKwhJr;

    // Thermische opbrengst vervangt gas
    const gasbesparingM3 = thermischeKwh / GAS_LHV_KWH_M3 / input.gasketelRendement;
    // PV-opbrengst is netto stroombesparing (eigen verbruik aanname 100% in tapwater-toepassing)
    const stroombesparingKwh = pvKwh;

    const brutoInvestering = input.aantalPanelen * input.prijsPerPaneelInclBtw;
    const isdeTotaal = input.aantalPanelen * input.isdeBedragPerPaneel;

    const subsidies: Subsidie[] = [
      dumavaSubsidie(brutoInvestering, context),
      isdeSubsidie(isdeTotaal),
      ...(input.extraSubsidies ?? []),
    ];

    const baseResult = maakBusinessCase({
      maatregelId: 'pvt-tapwater',
      brutoInvestering,
      subsidies,
      besparingGasM3: gasbesparingM3,
      besparingStroomKwh: stroombesparingKwh,
      context,
      warnings,
    });

    return {
      ...baseResult,
      thermischeOpbrengstKwh: thermischeKwh,
      pvOpbrengstKwh: pvKwh,
    };
  },
};
