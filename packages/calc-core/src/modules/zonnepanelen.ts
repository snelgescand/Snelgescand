/**
 * Zonnepanelen-module.
 *
 * Bron: Rekenmodel_Sportief_Opgewekt!Zonnepanelen + Waarde_zonnepanelen
 *
 * Belangrijkste mechanica:
 *   - Investering = totaalWp × prijsPerWp_staffel
 *   - Jaaropbrengst_jr_n = aantalPanelen × wpPerPaneel × 0.85 / 1000 × (1 - degradatie)^n
 *   - Eigen verbruik (default 15%) wordt vergoed met stroomprijs.
 *   - Terugleveroverschot wordt vergoed met terugleververgoeding.
 *   - Salderingsregeling wordt afgebouwd 2027 → 2031 (Excel model).
 *
 * Voor de 25-jaar projectie returnen we een array met jaar-resultaten.
 */

import type {
  MaatregelModule,
  MaatregelResultaat,
  ProjectContext,
  Subsidie,
  Warning,
} from '../types/index.js';
import { maakBusinessCase } from '../util/business-case.js';
import {
  PV_DEFAULT_PANEEL_WP,
  PV_DEFAULT_INSTRALINGSFACTOR,
  PV_DEGRADATIE_PER_JAAR,
  PV_DEFAULT_EIGEN_VERBRUIK_RATIO,
  PV_CO2_REDUCTIE_PER_KWH,
  pvPrijsPerWp,
} from '../data/pv-en-glas.js';

export interface ZonnepanelenInput {
  aantalPanelen: number;
  wpPerPaneel: number;
  /** Instralingsfactor — combineert orientatie en hellingshoek (default 0.85) */
  instralingsfactor: number;
  /** Aandeel direct eigen verbruik (default 0.15) */
  eigenVerbruikRatio: number;
  /** Aantal jaren voor projectie (default 15, zoals Waarde_zonnepanelen) */
  projectieJaren: number;
  /** Optionele override van staffel-prijs */
  prijsPerWpInclBtw?: number;
  /** BTW-teruggave voor sportverenigingen vaak 0, gebouwen soms 100% */
  btwTeruggave?: number;
  /** Verwachte salderingsafbouw — Excel: 64% in 2027, 36% 2028, 36% 2029, 36% 2030, 0% 2031+ */
  salderingPercentagePerJaar?: number[];
  extraSubsidies?: Subsidie[];
}

export interface PvJaarResultaat {
  jaar: number;
  opbrengstKwh: number;
  eigenVerbruikKwh: number;
  teruggeleverdKwh: number;
  besparingEur: number;
  vergoedingEur: number;
  totaalEur: number;
}

export interface ZonnepanelenResultaat extends MaatregelResultaat {
  totaalWp: number;
  opbrengstJaar1Kwh: number;
  prijsPerWp: number;
  projectie: PvJaarResultaat[];
  cumulatiefRendementEur: number;
}

const DEFAULT_SALDERING = [1, 1, 0.64, 0.36, 0.36, 0.36, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

export const zonnepanelenModule: MaatregelModule<ZonnepanelenInput, ZonnepanelenResultaat> = {
  id: 'zonnepanelen',
  naam: 'Zonnepanelen (PV)',

  defaultInput(_context: ProjectContext): ZonnepanelenInput {
    return {
      aantalPanelen: 50,
      wpPerPaneel: PV_DEFAULT_PANEEL_WP,
      instralingsfactor: PV_DEFAULT_INSTRALINGSFACTOR,
      eigenVerbruikRatio: PV_DEFAULT_EIGEN_VERBRUIK_RATIO,
      projectieJaren: 15,
      btwTeruggave: 0,
    };
  },

  bereken(input: ZonnepanelenInput, context: ProjectContext): ZonnepanelenResultaat {
    const warnings: Warning[] = [];

    if (input.aantalPanelen <= 0 || input.wpPerPaneel <= 0) {
      warnings.push({ level: 'error', code: 'PV_LEEG', message: 'Geen panelen of vermogen' });
    }

    const totaalWp = input.aantalPanelen * input.wpPerPaneel;
    const prijsPerWp = input.prijsPerWpInclBtw ?? pvPrijsPerWp(totaalWp, true);
    const brutoInvestering = totaalWp * prijsPerWp - (input.btwTeruggave ?? 0);

    // Jaar 1 opbrengst (kWh)
    const opbrengstJaar1Kwh = (totaalWp / 1000) * 875 * input.instralingsfactor;
    // 875 = standaard nationaal NL kWh/kWp/jr bij optimaal — Excel-conventie

    const salderingPerJaar = input.salderingPercentagePerJaar ?? DEFAULT_SALDERING;

    const stroomprijs = context.energie.stroomprijsKaalPerKwh;
    const terugleverPrijs = context.energie.terugleverVergoedingPerKwh ?? 0.05;

    const projectie: PvJaarResultaat[] = [];
    let cumulatief = 0;

    for (let n = 0; n < input.projectieJaren; n++) {
      const degradatieFactor = Math.pow(1 - PV_DEGRADATIE_PER_JAAR, n);
      const opbrengst = opbrengstJaar1Kwh * degradatieFactor;
      const eigenVerbruik = opbrengst * input.eigenVerbruikRatio;
      const teruggeleverd = opbrengst - eigenVerbruik;

      const saldering = salderingPerJaar[n] ?? 0;
      // Saldering: aandeel teruggeleverd dat tegen stroomprijs wordt verrekend
      const teruggeleverdGesaldeerd = teruggeleverd * saldering;
      const teruggeleverdOpTerugleververgoeding = teruggeleverd * (1 - saldering);

      const besparingEur = eigenVerbruik * stroomprijs;
      const vergoedingEur = teruggeleverdGesaldeerd * stroomprijs + teruggeleverdOpTerugleververgoeding * terugleverPrijs;
      const totaal = besparingEur + vergoedingEur;
      cumulatief += totaal;

      projectie.push({
        jaar: n + 1,
        opbrengstKwh: opbrengst,
        eigenVerbruikKwh: eigenVerbruik,
        teruggeleverdKwh: teruggeleverd,
        besparingEur,
        vergoedingEur,
        totaalEur: totaal,
      });
    }

    const subsidies: Subsidie[] = [
      // PV komt niet altijd in aanmerking voor Dumava — alleen als onderdeel van breder pakket
      ...(input.extraSubsidies ?? []),
    ];

    // Voor de samenvattende businesscase gebruiken we jaar-1 totaal als "besparingPerJaar"
    // én forceren we de stroombesparing zodat de €-vergelijking met andere maatregelen klopt.
    const jaar1 = projectie[0];

    const baseResult = maakBusinessCase({
      maatregelId: 'zonnepanelen',
      brutoInvestering,
      subsidies,
      besparingStroomKwh: jaar1?.eigenVerbruikKwh ?? 0,
      // teruglevering wordt niet als CO2-besparing geboekt in standaard CO2-rekening,
      // maar wij rekenen 'm wel mee als stroomverbruik-vermindering elders
      piekVermogenKw: -totaalWp / 1000, // negatief = piekreductie
      context,
      warnings,
    });

    // Override CO2 (PV gebruikt eigen factor 0.649, Excel-conventie)
    const co2Totaal = (jaar1?.opbrengstKwh ?? 0) * PV_CO2_REDUCTIE_PER_KWH;
    baseResult.co2BesparingKg = co2Totaal;

    // Vervangen besparingPerJaar door volledig jaar-1 saldo (saldering + teruglever):
    baseResult.besparingPerJaar = jaar1?.totaalEur ?? 0;
    baseResult.terugverdientijdJaren = baseResult.besparingPerJaar > 0
      ? baseResult.nettoInvestering / baseResult.besparingPerJaar
      : Infinity;

    return {
      ...baseResult,
      totaalWp,
      opbrengstJaar1Kwh,
      prijsPerWp,
      projectie,
      cumulatiefRendementEur: cumulatief,
    };
  },
};
