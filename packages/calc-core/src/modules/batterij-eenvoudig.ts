/**
 * Batterij-eenvoudig module (cashflow-niveau).
 *
 * Bron: Accuberekening__naam_club_.xlsx
 *
 * Vereenvoudigd model dat NIET uur-voor-uur rekent maar alleen jaartotaal-
 * cijfers gebruikt. Bedoeld voor een snelle indicatie. Voor de echte engine
 * zie modules/batterij-tijdreeks.ts.
 *
 * Aannames:
 *   - Capaciteit in kWh.
 *   - Aantal volledige cycli per jaar (typ. 300 voor zelfconsumptie, 600+ voor handel).
 *   - €/cyclus omzet uit EPEX-arbitrage (spread × kWh × kabelverlies).
 *   - Investering per kWh inclusief installatie (€350–€500/kWh).
 *   - Levensduur typisch 12–15 jaar, dus annuïteit met restwaarde 0.
 */

import type {
  MaatregelModule,
  MaatregelResultaat,
  ProjectContext,
  Subsidie,
  Warning,
} from '../types/index.js';
import { dumavaSubsidie, maakBusinessCase } from '../util/business-case.js';

export interface BatterijEenvoudigInput {
  capaciteitKwh: number;
  vermogenKw: number;
  /** Aantal volledige cycli per jaar */
  cycliPerJaar: number;
  /** Gemiddelde EPEX-spread (€/kWh) tussen goedkoop en duur */
  gemiddeldeEpexSpreadPerKwh: number;
  /** Kabel/inverter-verlies bij laden+ontladen, default 0.02 (2%) */
  kabelVerliesFractie: number;
  /** Prijs per kWh capaciteit incl btw en installatie */
  prijsPerKwhInclBtw: number;
  /** Eventuele extra besparing op piekvermogen-kosten (€/jaar) */
  besparingPiekvermogenEur: number;
  extraSubsidies?: Subsidie[];
}

export interface BatterijEenvoudigResultaat extends MaatregelResultaat {
  omzetEpexEur: number;
  energieDoorvoerKwh: number;
  /** C-rate = vermogenKw / capaciteitKwh — bepaalt de prijsopslag */
  cRate: number;
  /** Effectieve prijs per kWh ná C-rate-correctie */
  effectievePrijsPerKwhInclBtw: number;
}

export const batterijEenvoudigModule: MaatregelModule<BatterijEenvoudigInput, BatterijEenvoudigResultaat> = {
  id: 'batterij-eenvoudig',
  naam: 'Batterij — snelle indicatie',

  defaultInput(_context: ProjectContext): BatterijEenvoudigInput {
    return {
      capaciteitKwh: 100,
      vermogenKw: 50,
      cycliPerJaar: 300,
      gemiddeldeEpexSpreadPerKwh: 0.12,
      kabelVerliesFractie: 0.02,
      prijsPerKwhInclBtw: 450,
      besparingPiekvermogenEur: 0,
    };
  },

  bereken(input: BatterijEenvoudigInput, context: ProjectContext): BatterijEenvoudigResultaat {
    const warnings: Warning[] = [];

    const energieDoorvoer = input.capaciteitKwh * input.cycliPerJaar * (1 - input.kabelVerliesFractie);
    const omzetEpex = energieDoorvoer * input.gemiddeldeEpexSpreadPerKwh;
    const totaleOpbrengst = omzetEpex + input.besparingPiekvermogenEur;

    // === Variabele prijs op basis van C-rate (vermogen / capaciteit) ===
    //
    // Een batterij met hoog vermogen t.o.v. capaciteit ("hoge C-rate") vereist
    // een zwaardere inverter en duurder PCS (Power Conversion System).
    // Vuistregels NL zakelijke markt 2025:
    //   - C-rate ≤ 0,3 (zelfconsumptie/PV-opslag) → ~10% korting (kleine inverter)
    //   - C-rate 0,5 (standaard) → basisprijs (input.prijsPerKwhInclBtw)
    //   - C-rate 1,0 ("snel") → +30% (zwaardere PCS)
    //   - C-rate 2,0 (handel/EPEX-arbitrage) → +90% (high-power PCS)
    //
    // Lineair model: factor = max(0,9, 1 + (cRate − 0,5) × 0,6)
    // De input `prijsPerKwhInclBtw` blijft de basis-prijs bij C=0,5.
    const cRate = input.capaciteitKwh > 0 ? input.vermogenKw / input.capaciteitKwh : 0.5;
    const cRateFactor = Math.max(0.9, 1 + (cRate - 0.5) * 0.6);
    const effectievePrijsPerKwh = input.prijsPerKwhInclBtw * cRateFactor;
    const brutoInvestering = input.capaciteitKwh * effectievePrijsPerKwh;

    if (cRate > 1.5) {
      warnings.push({
        level: 'warning',
        code: 'BATTERIJ_HOGE_CRATE',
        message: `Hoge C-rate (${cRate.toFixed(2)}) — inverter is zwaarder en kost ~${Math.round((cRateFactor - 1) * 100)}% meer per kWh. Overweeg de capaciteit te verhogen of het vermogen te verlagen voor een gunstigere prijs.`,
      });
    } else if (cRate < 0.2) {
      warnings.push({
        level: 'info',
        code: 'BATTERIJ_LAGE_CRATE',
        message: `Lage C-rate (${cRate.toFixed(2)}) — de batterij kan slechts ${Math.round(cRate * 100)}% van zijn capaciteit per uur leveren. Geschikt voor zelfconsumptie, niet voor EPEX-arbitrage.`,
      });
    }

    const subsidies: Subsidie[] = [
      dumavaSubsidie(brutoInvestering, context),
      ...(input.extraSubsidies ?? []),
    ];

    const baseResult = maakBusinessCase({
      maatregelId: 'batterij-eenvoudig',
      brutoInvestering,
      subsidies,
      // Trick: rapporteer als negatief stroomverbruik (besparing in €)
      // Maar we willen geen CO2-besparing rapporteren voor pure arbitrage
      context,
      warnings,
    });

    // Override €-besparing handmatig — komt niet uit gas/stroom-balans
    baseResult.besparingPerJaar = totaleOpbrengst;
    baseResult.terugverdientijdJaren = totaleOpbrengst > 0
      ? baseResult.nettoInvestering / totaleOpbrengst
      : Infinity;
    // CO2 is netto neutraal (energie wordt verschoven, niet bespaard) tenzij PV-curtailment
    baseResult.co2BesparingKg = 0;

    return {
      ...baseResult,
      omzetEpexEur: omzetEpex,
      energieDoorvoerKwh: energieDoorvoer,
      cRate,
      effectievePrijsPerKwhInclBtw: effectievePrijsPerKwh,
    };
  },
};
