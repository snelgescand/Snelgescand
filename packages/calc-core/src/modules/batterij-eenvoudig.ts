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

    const brutoInvestering = input.capaciteitKwh * input.prijsPerKwhInclBtw;

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
    };
  },
};
