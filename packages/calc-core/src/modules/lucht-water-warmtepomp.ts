/**
 * Lucht/water-warmtepomp module (volledige vervanging van gasketel).
 *
 * Bron: Rekenmodel_Sportief_Opgewekt!Lucht_water_WP
 *
 * Algoritme:
 *   1. Bepaal warmtevraag uit BVO × W/m² (afhankelijk van bouwjaar en
 *      eventuele WTW).
 *   2. Bepaal benodigd vermogen.
 *   3. Bepaal stroomverbruik = warmtevraag_kWh / COP (seizoens-COP / SCOP).
 *   4. Gas dat vervalt = oude gasverbruik (ruimteverwarming).
 *
 * In Excel zit een inconsistentie: gas wordt naar primaire energie gerekend
 * met 10.1 kWh/m³ in plaats van 8.79. Wij volgen Excel hier (zie
 * GAS_EXCEL_WP_KWH_M3 in types/index.ts) zodat businesscases reproduceren.
 *
 * ISDE: per kW vermogen, in 2025 ongeveer €225–€500/kW.
 */

import type {
  MaatregelModule,
  MaatregelResultaat,
  ProjectContext,
  Subsidie,
  Warning,
} from '../types/index.js';
import { dumavaSubsidie, isdeSubsidie, maakBusinessCase } from '../util/business-case.js';
import { luchtWaterWPerM2 } from '../data/warmtepomp.js';

export interface LuchtWaterWPInput {
  /** Te verwarmen oppervlakte in m² */
  oppervlakteM2: number;
  /** Aanwezigheid WTW (verlaagt benodigd vermogen) */
  heeftWtw: boolean;
  /** Specifiek vermogen W/m². Default uit bouwjaar+WTW */
  watPerM2?: number;
  /** Seasonal COP */
  scop: number;
  /** Aandeel van huidige gasverbruik dat aan ruimteverwarming toekomt */
  aandeelRuimteverwarmingVanGas: number;
  /** Prijs per kW vermogen incl. installatie */
  prijsPerKwInclBtw: number;
  /** ISDE-bedrag per kW (in €) */
  isdeBedragPerKw: number;
  extraSubsidies?: Subsidie[];
}

export interface LuchtWaterWPResultaat extends MaatregelResultaat {
  vermogenKw: number;
  warmtevraagKwh: number;
  scop: number;
}

export const luchtWaterWarmtepompModule: MaatregelModule<LuchtWaterWPInput, LuchtWaterWPResultaat> = {
  id: 'lucht-water-warmtepomp',
  naam: 'Lucht/water-warmtepomp',

  defaultInput(context: ProjectContext): LuchtWaterWPInput {
    return {
      oppervlakteM2: context.gebouw.bvoTotaalM2 ?? 200,
      heeftWtw: false,
      scop: 3.5,
      aandeelRuimteverwarmingVanGas: 0.7,
      prijsPerKwInclBtw: 1500,
      isdeBedragPerKw: 300,
    };
  },

  bereken(input: LuchtWaterWPInput, context: ProjectContext): LuchtWaterWPResultaat {
    const warnings: Warning[] = [];
    if (input.scop <= 1) {
      warnings.push({ level: 'error', code: 'SCOP_INVALID', message: 'SCOP moet > 1 zijn' });
    }

    const wPerM2 = input.watPerM2 ?? luchtWaterWPerM2(context.gebouw.bouwjaar, input.heeftWtw);
    const vermogenKw = (wPerM2 * input.oppervlakteM2) / 1000;

    const gasRuimteverwarmingM3 = context.energie.gasverbruikM3 * input.aandeelRuimteverwarmingVanGas;
    // Warmtevraag in kWh (Excel-conventie: 10.1 kWh/m³, gasketelrendement 0.95 al inbegrepen)
    const warmtevraagKwh = gasRuimteverwarmingM3 * 10.1 * 0.95;
    const stroomverbruikKwh = warmtevraagKwh / input.scop;

    const brutoInvestering = vermogenKw * input.prijsPerKwInclBtw;
    const isdeTotaal = vermogenKw * input.isdeBedragPerKw;

    const subsidies: Subsidie[] = [
      dumavaSubsidie(brutoInvestering, context),
      isdeSubsidie(isdeTotaal),
      ...(input.extraSubsidies ?? []),
    ];

    const baseResult = maakBusinessCase({
      maatregelId: 'lucht-water-warmtepomp',
      brutoInvestering,
      subsidies,
      besparingGasM3: gasRuimteverwarmingM3,
      extraStroomverbruikKwh: stroomverbruikKwh,
      piekVermogenKw: vermogenKw,
      context,
      warnings,
    });

    if (vermogenKw > context.energie.aansluitwaardeElektra.vermogenKw * 0.6) {
      warnings.push({
        level: 'warning',
        code: 'AANSLUITING_KRAP',
        message: `WP van ${vermogenKw.toFixed(1)} kW gecombineerd met basisverbruik kan aansluitwaarde overschrijden.`,
      });
    }

    return {
      ...baseResult,
      vermogenKw,
      warmtevraagKwh,
      scop: input.scop,
      warnings,
    };
  },
};
