/**
 * Generieke businesscase-wrapper en helpers.
 * Geïnspireerd door de prompt, maar uitgebreid met multi-subsidie ondersteuning.
 */

import type { Subsidie, MaatregelResultaat, MaatregelId, ProjectContext, Warning } from '../types/index.js';

export interface BusinessCaseInput {
  maatregelId: MaatregelId;
  brutoInvestering: number;
  subsidies: Subsidie[];
  besparingGasM3?: number;
  besparingStroomKwh?: number;
  extraStroomverbruikKwh?: number;
  piekVermogenKw?: number;
  context: ProjectContext;
  warnings?: Warning[];
}

/**
 * Bereken een uniforme MaatregelResultaat uit ruwe maatregel-output.
 * Geen aannames over fysica — alleen €, kWh, m³ en CO₂ aggregeren.
 */
export function maakBusinessCase(input: BusinessCaseInput): MaatregelResultaat {
  const { context } = input;
  const totaleSubsidie = input.subsidies.reduce((s, x) => s + x.bedrag, 0);
  const nettoInvestering = input.brutoInvestering - totaleSubsidie;

  // €-besparing uit gas en stroom
  const gasBesparingEur = (input.besparingGasM3 ?? 0) * context.energie.gasprijsPerM3;
  const stroomBesparingEur = (input.besparingStroomKwh ?? 0) * context.energie.stroomprijsKaalPerKwh;
  const extraStroomKostenEur = (input.extraStroomverbruikKwh ?? 0) * context.energie.stroomprijsKaalPerKwh;

  const besparingPerJaar = gasBesparingEur + stroomBesparingEur - extraStroomKostenEur;

  // CO₂ — gas en stroom
  const co2Gas = (input.besparingGasM3 ?? 0) * 2.05;
  const co2Stroom = (input.besparingStroomKwh ?? 0) * 0.337;
  const co2ExtraStroom = (input.extraStroomverbruikKwh ?? 0) * 0.337;
  const co2BesparingKg = co2Gas + co2Stroom - co2ExtraStroom;

  const terugverdientijdJaren = besparingPerJaar > 0
    ? nettoInvestering / besparingPerJaar
    : Infinity;

  return {
    maatregelId: input.maatregelId,
    brutoInvestering: input.brutoInvestering,
    subsidies: input.subsidies,
    totaleSubsidie,
    nettoInvestering,
    besparingPerJaar,
    besparingGasM3: input.besparingGasM3,
    besparingStroomKwh: input.besparingStroomKwh,
    extraStroomverbruikKwh: input.extraStroomverbruikKwh,
    co2BesparingKg,
    terugverdientijdJaren,
    piekVermogenKw: input.piekVermogenKw,
    warnings: input.warnings ?? [],
  };
}

/** Helper: maak een DUMAVA-subsidie standaard 20% op brutoInvestering */
export function dumavaSubsidie(brutoInvestering: number, context: ProjectContext): Subsidie {
  return {
    bron: 'dumava',
    naam: 'DUMAVA stap 1',
    bedrag: brutoInvestering * context.defaultSubsidiePercentages.dumava,
    percentage: context.defaultSubsidiePercentages.dumava,
  };
}

/** Helper: ISDE bijdrage (placeholder — echte ISDE is per techniek, niet percentage) */
export function isdeSubsidie(bedrag: number): Subsidie {
  return {
    bron: 'isde',
    naam: 'ISDE',
    bedrag,
  };
}

/** Helper: BOSA-sport (40% bij energiebesparende maatregelen) */
export function bosaSportSubsidie(brutoInvestering: number, context: ProjectContext): Subsidie {
  return {
    bron: 'bosa',
    naam: 'BOSA energiebesparing',
    bedrag: brutoInvestering * context.defaultSubsidiePercentages.bosa,
    percentage: context.defaultSubsidiePercentages.bosa,
  };
}

/** Helper voor het maken van een ProjectContext met sensible defaults */
export function defaultContext(partial: Partial<ProjectContext> = {}): ProjectContext {
  return {
    club: { naam: '' },
    gebouw: { bouwjaar: 1980 },
    energie: {
      stroomverbruikTotaalKwh: 15000,
      gasverbruikM3: 5000,
      stroomprijsKaalPerKwh: 0.30,
      gasprijsPerM3: 1.35,
      terugleverVergoedingPerKwh: 0.10,
      aansluitwaardeElektra: { fase: 3, ampere: 25, vermogenKw: 17.2 },
      groenOpgewekt: 'nee',
    },
    defaultSubsidiePercentages: {
      dumava: 0.20,
      derdeRegelingGemeente: 1/3,
      ias: 0.60,
      bosa: 0.40,
    },
    ...partial,
  };
}
