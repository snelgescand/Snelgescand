/**
 * Lucht/lucht-warmtepomp module (splitsystemen).
 *
 * Bron: Rekenmodel_Sportief_Opgewekt!Lucht_lucht_WP
 *
 * Een lucht/lucht-WP (airco-systeem) verwarmt rechtstreeks de lucht in
 * een ruimte zonder cv-radiatoren. Geschikt voor open ruimtes zoals
 * kantines of zaalruimtes. Typische SCOP 3.0–4.0.
 *
 * Excel rekent met W/m³ (volume) i.p.v. W/m² omdat het zaalverwarming
 * is met grote plafondhoogte. Standaardwaardes uit data/warmtepomp.ts.
 */

import type {
  MaatregelModule,
  MaatregelResultaat,
  ProjectContext,
  Subsidie,
  Warning,
} from '../types/index.js';
import { dumavaSubsidie, isdeSubsidie, maakBusinessCase } from '../util/business-case.js';
import { luchtLuchtWPerM3, type IsolatieNiveau } from '../data/warmtepomp.js';

export interface LuchtLuchtWPInput {
  /** Volume van de te verwarmen ruimte in m³ */
  volumeM3: number;
  /** Isolatieniveau t.b.v. W/m³-bepaling */
  isolatieNiveau: IsolatieNiveau;
  /** Specifiek vermogen W/m³ (overschrijft isolatieNiveau) */
  watPerM3?: number;
  /** Seasonal COP */
  scop: number;
  /** Aandeel van gasverbruik dat deze ruimte verwarmt */
  aandeelRuimteverwarmingVanGas: number;
  /** Prijs per kW vermogen incl. installatie */
  prijsPerKwInclBtw: number;
  /** ISDE-bedrag per kW */
  isdeBedragPerKw: number;
  extraSubsidies?: Subsidie[];
}

export interface LuchtLuchtWPResultaat extends MaatregelResultaat {
  vermogenKw: number;
  warmtevraagKwh: number;
  scop: number;
}

export const luchtLuchtWarmtepompModule: MaatregelModule<LuchtLuchtWPInput, LuchtLuchtWPResultaat> = {
  id: 'lucht-lucht-warmtepomp',
  naam: 'Lucht/lucht-warmtepomp',

  defaultInput(context: ProjectContext): LuchtLuchtWPInput {
    const bvo = context.gebouw.bvoTotaalM2 ?? 200;
    const hoogte = context.gebouw.plafondhoogteM ?? 3;
    return {
      volumeM3: bvo * hoogte,
      isolatieNiveau: 'redelijk',
      scop: 3.5,
      aandeelRuimteverwarmingVanGas: 0.3,
      // Lucht/lucht-warmtepompen (split-units) zijn aanmerkelijk goedkoper dan
      // lucht/water-systemen — typisch €500-€700/kW incl. installatie (NL markt 2025).
      // Eerdere default was €1.200/kW, dat is meer een lucht/water-prijs en gaf
      // onrealistisch hoge investeringsbedragen op de PPT.
      prijsPerKwInclBtw: 600,
      isdeBedragPerKw: 100,
    };
  },

  bereken(input: LuchtLuchtWPInput, context: ProjectContext): LuchtLuchtWPResultaat {
    const warnings: Warning[] = [];

    const wPerM3 = input.watPerM3 ?? luchtLuchtWPerM3(input.isolatieNiveau);
    const vermogenKw = (wPerM3 * input.volumeM3) / 1000;

    const gasRuimteverwarmingM3 = context.energie.gasverbruikM3 * input.aandeelRuimteverwarmingVanGas;
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
      maatregelId: 'lucht-lucht-warmtepomp',
      brutoInvestering,
      subsidies,
      besparingGasM3: gasRuimteverwarmingM3,
      extraStroomverbruikKwh: stroomverbruikKwh,
      piekVermogenKw: vermogenKw,
      context,
      warnings,
    });

    return {
      ...baseResult,
      vermogenKw,
      warmtevraagKwh,
      scop: input.scop,
    };
  },
};
