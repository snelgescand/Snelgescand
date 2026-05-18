/**
 * WTW-unit (Warmte Terug Winning ventilatie) module.
 *
 * Bron: Rekenmodel_Sportief_Opgewekt!WTW-unit
 *
 * Een WTW-unit wint warmte terug uit afgevoerde lucht en draagt deze
 * over op de aangevoerde verse lucht. Rendement (η) ligt tussen 0.7 en 0.95.
 *
 * Besparing op gas:
 *   ventilatieverlies_zonder = V_lucht × ρ × cp × ΔT × stookuren
 *   besparing = ventilatieverlies × η_wtw
 *
 * Waarbij:
 *   V_lucht in m³/s
 *   ρ = 1.2 kg/m³
 *   cp = 1.005 kJ/(kg·K)
 *
 * Excel gebruikt vuistregel: 0.0009 m³ gas/m³_lucht/K bij 24K ΔT.
 */

import type {
  MaatregelModule,
  MaatregelResultaat,
  ProjectContext,
  Subsidie,
  Warning,
} from '../types/index.js';
import { dumavaSubsidie, isdeSubsidie, maakBusinessCase } from '../util/business-case.js';

const RHO_LUCHT = 1.2;
const CP_LUCHT_KJ_KGK = 1.005;
const MJ_PER_M3_GAS = 31.65;

export interface WtwInput {
  /** Ventilatiedebiet in m³/uur */
  ventilatiedebietM3PerUur: number;
  /** Rendement WTW (default 0.85) */
  rendement: number;
  /** Stookuren per jaar dat ventilatie aanstaat */
  stookurenPerJaar: number;
  /** Gemiddeld temperatuurverschil binnen-buiten tijdens stookuren */
  binnenBuitenDeltaT: number;
  /** Bruto investering, default uit prijs per m³/uur capaciteit */
  brutoInvestering?: number;
  /** Default €/m³/u capaciteit (incl btw, installatie) */
  prijsPerM3PerUurInclBtw?: number;
  /** Extra elektriciteitsverbruik door de WTW-unit zelf (kWh/jaar) */
  eigenStroomverbruikKwh?: number;
  /** Extra subsidies */
  extraSubsidies?: Subsidie[];
  /** ISDE-bijdrage in € indien van toepassing */
  isdeBedrag?: number;
}

export interface WtwResultaat extends MaatregelResultaat {
  besparingKwh: number;
}

const DEFAULT_PRIJS_PER_M3_PER_UUR = 12; // €/m³·h, ruwe markttarief incl installatie

export const wtwModule: MaatregelModule<WtwInput, WtwResultaat> = {
  id: 'wtw',
  naam: 'WTW ventilatie-unit',

  defaultInput(context: ProjectContext): WtwInput {
    const bvo = context.gebouw.bvoTotaalM2 ?? 200;
    // vuistregel ventilatiedebiet: 4 m³/uur per m² gebruiksoppervlak
    return {
      ventilatiedebietM3PerUur: bvo * 4,
      rendement: 0.85,
      stookurenPerJaar: 1500,
      binnenBuitenDeltaT: 14,
      eigenStroomverbruikKwh: bvo * 2, // ruwe schatting
    };
  },

  bereken(input: WtwInput, context: ProjectContext): WtwResultaat {
    const warnings: Warning[] = [];

    if (input.rendement < 0 || input.rendement > 1) {
      warnings.push({ level: 'error', code: 'RENDEMENT_INVALID', message: 'Rendement moet tussen 0 en 1 zijn' });
    }

    // m³/uur → m³/s
    const debietM3Sec = input.ventilatiedebietM3PerUur / 3600;
    // Warmtestroom in kW bij ΔT (zonder WTW)
    const verliesKw = debietM3Sec * RHO_LUCHT * CP_LUCHT_KJ_KGK * input.binnenBuitenDeltaT;
    // Energie per jaar in kWh (zonder WTW)
    const verliesKwhPerJaar = verliesKw * input.stookurenPerJaar;
    // Besparing dankzij WTW
    const besparingKwh = verliesKwhPerJaar * input.rendement;
    // Conversie naar m³ gas (kWh / 8.79)
    const besparingMj = besparingKwh * 3.6;
    const besparingM3Gas = besparingMj / MJ_PER_M3_GAS;

    const prijs = input.prijsPerM3PerUurInclBtw ?? DEFAULT_PRIJS_PER_M3_PER_UUR;
    const brutoInvestering = input.brutoInvestering ?? prijs * input.ventilatiedebietM3PerUur;

    const subsidies: Subsidie[] = [dumavaSubsidie(brutoInvestering, context)];
    if (input.isdeBedrag && input.isdeBedrag > 0) {
      subsidies.push(isdeSubsidie(input.isdeBedrag));
    }
    if (input.extraSubsidies) {
      subsidies.push(...input.extraSubsidies);
    }

    const baseResult = maakBusinessCase({
      maatregelId: 'wtw',
      brutoInvestering,
      subsidies,
      besparingGasM3: besparingM3Gas,
      extraStroomverbruikKwh: input.eigenStroomverbruikKwh,
      piekVermogenKw: (input.eigenStroomverbruikKwh ?? 0) / Math.max(input.stookurenPerJaar, 1),
      context,
      warnings,
    });

    return {
      ...baseResult,
      besparingKwh,
    };
  },
};
