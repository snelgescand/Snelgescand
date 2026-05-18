/**
 * LED-veldverlichting module (buitensport).
 *
 * Bron: Rekenmodel_Sportief_Opgewekt!LED_veldverlichting
 *
 * Vervanging van halogeen/metaaldamp veldlampen door LED-spots. Het
 * verbruik per veld is hoog (8–20 kW per veld) en branduren bij
 * trainings-/wedstrijdgebruik 400–800 u/jaar.
 *
 *   verbruik_oud = aantal_velden × vermogen_per_veld_oud × branduren
 *   verbruik_nieuw = aantal_velden × vermogen_per_veld_nieuw × branduren
 *
 * Investering hoog (typ €15–€30k per veld), maar BOSA-sport 40% en soms
 * gemeentelijke bijdrage. Vaak ook lichtniveau-verbetering.
 */

import type {
  MaatregelModule,
  MaatregelResultaat,
  ProjectContext,
  Subsidie,
  Warning,
} from '../types/index.js';
import { bosaSportSubsidie, dumavaSubsidie, maakBusinessCase } from '../util/business-case.js';

export interface VeldverlichtingInput {
  aantalVelden: number;
  /** Geïnstalleerd vermogen per veld in kW (huidige situatie) */
  vermogenOudKwPerVeld: number;
  /** Idem voor LED-vervanging */
  vermogenNieuwKwPerVeld: number;
  brandurenPerJaarPerVeld: number;
  /** Investering per veld (alles incl. masten, kabels, armaturen, montage) */
  investeringPerVeldInclBtw: number;
  extraSubsidies?: Subsidie[];
}

export interface VeldverlichtingResultaat extends MaatregelResultaat {
  verbruikOudKwh: number;
  verbruikNieuwKwh: number;
}

export const ledVeldverlichtingModule: MaatregelModule<VeldverlichtingInput, VeldverlichtingResultaat> = {
  id: 'ledveldverlichting',
  naam: 'LED-veldverlichting',

  defaultInput(context: ProjectContext): VeldverlichtingInput {
    return {
      aantalVelden: context.club.aantalVelden ?? 2,
      vermogenOudKwPerVeld: 16,
      vermogenNieuwKwPerVeld: 7,
      brandurenPerJaarPerVeld: 600,
      investeringPerVeldInclBtw: 22_000,
    };
  },

  bereken(input: VeldverlichtingInput, context: ProjectContext): VeldverlichtingResultaat {
    const warnings: Warning[] = [];

    const verbruikOudKwh = input.aantalVelden * input.vermogenOudKwPerVeld * input.brandurenPerJaarPerVeld;
    const verbruikNieuwKwh = input.aantalVelden * input.vermogenNieuwKwPerVeld * input.brandurenPerJaarPerVeld;
    const besparingKwh = verbruikOudKwh - verbruikNieuwKwh;

    const brutoInvestering = input.aantalVelden * input.investeringPerVeldInclBtw;

    const subsidies: Subsidie[] = [
      dumavaSubsidie(brutoInvestering, context),
      bosaSportSubsidie(brutoInvestering, context),
      ...(input.extraSubsidies ?? []),
    ];

    const baseResult = maakBusinessCase({
      maatregelId: 'ledveldverlichting',
      brutoInvestering,
      subsidies,
      besparingStroomKwh: besparingKwh,
      piekVermogenKw: -(input.vermogenOudKwPerVeld - input.vermogenNieuwKwPerVeld) * input.aantalVelden,
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
