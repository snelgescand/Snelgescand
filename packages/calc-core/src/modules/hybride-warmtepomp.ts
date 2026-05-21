/**
 * Hybride warmtepomp-module.
 *
 * Bron: Rekenmodel_Sportief_Opgewekt!"Hybride warmtepomp"
 *
 * Logica:
 *  - Verdeling van gasverbruik over clubgebouw / kleedkamers / overige ruimtes.
 *  - WTW reduceert gas met 40% per ruimte waar WTW aanwezig is.
 *  - Beta-factor: percentage van het gasverbruik dat de warmtepomp overneemt.
 *  - Resterend gas blijft op de CV.
 *
 *  Benodigd vermogen WP per ruimte:
 *    P_wp_kW = (gas_m3 × 10.1) / vollasturen × beta
 *  (Excel B23, met 10.1 = primaire energie factor; zie FORMULES.md noot)
 *
 *  Stroomverbruik WP:
 *    kWh = gasbesparing_m3 × 10.1 / COP
 */

import type {
  MaatregelModule,
  MaatregelResultaat,
  ProjectContext,
  Subsidie,
  Warning,
} from '../types/index.js';
import {
  hybrideVollasturen,
  WTW_BESPARING_FACTOR,
  HYBRIDE_DEFAULT_BETA,
  HYBRIDE_DEFAULT_COP,
} from '../data/warmtepomp.js';
import { dumavaSubsidie, maakBusinessCase } from '../util/business-case.js';

const GAS_PRIMARY_KWH_M3 = 10.1; // zie FORMULES.md voor uitleg

export interface RuimteGasverbruik {
  /** Gasverbruik specifiek voor deze ruimte (m³/jaar) */
  gasverbruikM3: number;
  /** WTW aanwezig in deze ruimte? */
  heeftWtw: boolean;
}

export interface HybrideWarmtepompInput {
  /** Gasverbruik per ruimte (clubgebouw / kleedkamers / overige) */
  perRuimte: {
    clubgebouw: RuimteGasverbruik;
    kleedkamers: RuimteGasverbruik;
    overigeRuimtes: RuimteGasverbruik;
  };
  /** Beta-factor: aandeel gas dat warmtepomp overneemt (default 0.78) */
  beta: number;
  /** COP-waarde van de warmtepomp (default 4) */
  cop: number;
  /** Bruto investering (€ incl btw) */
  brutoInvestering: number;
  /** Extra subsidies (ISDE bv) */
  extraSubsidies?: Subsidie[];
}

export interface HybrideWarmtepompResultaat extends MaatregelResultaat {
  benodigdVermogenKwPerRuimte: {
    clubgebouw: number;
    kleedkamers: number;
    overigeRuimtes: number;
    totaal: number;
  };
  /** Gas dat de WP nog wel laat gebruiken (= gas × (1 - beta)) */
  resterendGasverbruikM3: number;
}

export const hybrideWarmtepompModule: MaatregelModule<HybrideWarmtepompInput, HybrideWarmtepompResultaat> = {
  id: 'hybride-warmtepomp',
  naam: 'Hybride warmtepomp',

  defaultInput(context: ProjectContext): HybrideWarmtepompInput {
    // Default-verdeling als geen ruimte-info beschikbaar: 60% club, 25% kleedkamers, 15% overig
    const totaal = context.energie.gasverbruikM3 * 0.7; // 30% naar douches/keuken (ruwe schatting)
    // Default investering: ~€12.000-€18.000 incl. installatie. We pakken
    // een conservatief gemiddelde dat overschrijfbaar is per project.
    return {
      perRuimte: {
        clubgebouw: { gasverbruikM3: totaal * 0.6, heeftWtw: false },
        kleedkamers: { gasverbruikM3: totaal * 0.25, heeftWtw: false },
        overigeRuimtes: { gasverbruikM3: totaal * 0.15, heeftWtw: false },
      },
      beta: HYBRIDE_DEFAULT_BETA,
      cop: HYBRIDE_DEFAULT_COP,
      brutoInvestering: 14_000,  // typisch €12-18k voor sportclub-formaat
    };
  },

  bereken(input: HybrideWarmtepompInput, context: ProjectContext): HybrideWarmtepompResultaat {
    const warnings: Warning[] = [];
    const bouwjaar = context.gebouw.bouwjaar;
    const vollasturen = hybrideVollasturen(bouwjaar);

    if (input.beta <= 0 || input.beta > 1) {
      warnings.push({
        level: 'warning',
        code: 'BETA_BUITEN_RANGE',
        message: 'Beta-factor moet tussen 0 en 1 liggen.',
      });
    }

    // Netto gas per ruimte (na WTW)
    const nettoGas = (r: RuimteGasverbruik) =>
      r.heeftWtw ? r.gasverbruikM3 * WTW_BESPARING_FACTOR : r.gasverbruikM3;

    const nettoClub = nettoGas(input.perRuimte.clubgebouw);
    const nettoKleed = nettoGas(input.perRuimte.kleedkamers);
    const nettoOverig = nettoGas(input.perRuimte.overigeRuimtes);

    // Excel: P_wp = (m³ × 10.1 / vollasturen) × beta
    const kwClub = (nettoClub * GAS_PRIMARY_KWH_M3 / vollasturen) * input.beta;
    const kwKleed = (nettoKleed * GAS_PRIMARY_KWH_M3 / vollasturen) * input.beta;
    const kwOverig = (nettoOverig * GAS_PRIMARY_KWH_M3 / vollasturen) * input.beta;
    const kwTotaal = kwClub + kwKleed + kwOverig;

    // Gas-besparing
    const totaalGasNa = nettoClub + nettoKleed + nettoOverig;
    const besparingM3 = totaalGasNa * input.beta;
    const resterend = totaalGasNa - besparingM3;

    // Extra stroomverbruik
    const extraStroomKwh = (besparingM3 * GAS_PRIMARY_KWH_M3) / input.cop;

    const subsidies: Subsidie[] = [
      dumavaSubsidie(input.brutoInvestering, context),
      ...(input.extraSubsidies ?? []),
    ];

    const base = maakBusinessCase({
      maatregelId: 'hybride-warmtepomp',
      brutoInvestering: input.brutoInvestering,
      subsidies,
      besparingGasM3: besparingM3,
      extraStroomverbruikKwh: extraStroomKwh,
      piekVermogenKw: kwTotaal,
      context,
      warnings,
    });

    return {
      ...base,
      benodigdVermogenKwPerRuimte: {
        clubgebouw: kwClub,
        kleedkamers: kwKleed,
        overigeRuimtes: kwOverig,
        totaal: kwTotaal,
      },
      resterendGasverbruikM3: resterend,
    };
  },
};
