/**
 * Spouwmuurisolatie-module.
 *
 * Bron: Rekenmodel_Sportief_Opgewekt!Spouwmuurisolatie
 *
 * Zelfde fysica als dakisolatie maar typisch lagere Rc-verbetering en
 * lagere prijs per m² (€20–30 vulkosten).
 */

import type {
  MaatregelModule,
  MaatregelResultaat,
  ProjectContext,
  Subsidie,
  Warning,
} from '../types/index.js';
import { rcDefault } from '../data/rc-waarden.js';
import { dumavaSubsidie, maakBusinessCase } from '../util/business-case.js';

export interface SpouwmuurInput {
  oppervlakteM2: number;
  huidigeRcWaarde?: number;
  nieuweRcWaarde: number;   // typ 1.3 voor gevulde spouw
  stookurenPerJaar: number;
  binnenBuitenDeltaT: number;
  kostenPerM2InclBtw?: number;
  extraSubsidies?: Subsidie[];
}

export interface SpouwmuurResultaat extends MaatregelResultaat {
  uWaardeOud: number;
  uWaardeNieuw: number;
  besparingKwh: number;
}

const DEFAULT_PRIJS_PER_M2 = 27.5; // markttarief incl btw voor parelvulling

const MJ_PER_M3_GAS = 31.65;

export const spouwmuurisolatieModule: MaatregelModule<SpouwmuurInput, SpouwmuurResultaat> = {
  id: 'spouwmuurisolatie',
  naam: 'Spouwmuurisolatie',

  defaultInput(context: ProjectContext): SpouwmuurInput {
    return {
      oppervlakteM2: (context.gebouw.bvoTotaalM2 ?? 200) * 0.6, // ruwe schatting gevel-opp = 60% bvo
      huidigeRcWaarde: rcDefault(context.gebouw.bouwjaar, 'gevel'),
      nieuweRcWaarde: 1.3,
      stookurenPerJaar: 1500,
      binnenBuitenDeltaT: 8,
    };
  },

  bereken(input: SpouwmuurInput, context: ProjectContext): SpouwmuurResultaat {
    const warnings: Warning[] = [];
    if (input.oppervlakteM2 <= 0) {
      warnings.push({ level: 'error', code: 'OPP_LEEG', message: 'Oppervlakte moet > 0 zijn' });
    }

    const rcOud = input.huidigeRcWaarde ?? rcDefault(context.gebouw.bouwjaar, 'gevel');
    const rcNieuw = input.nieuweRcWaarde;

    if (rcNieuw <= rcOud) {
      warnings.push({
        level: 'warning',
        code: 'GEEN_VERBETERING',
        message: 'Nieuwe Rc-waarde niet hoger dan huidige.',
      });
    }

    const uOud = 1 / rcOud;
    const uNieuw = 1 / rcNieuw;

    const verliesOudW = input.oppervlakteM2 * input.binnenBuitenDeltaT * uOud;
    const verliesNieuwW = input.oppervlakteM2 * input.binnenBuitenDeltaT * uNieuw;
    const besparingW = verliesOudW - verliesNieuwW;

    const besparingJoules = input.stookurenPerJaar * (besparingW * 3600);
    const besparingKwh = besparingJoules / 3_600_000;
    const besparingMj = besparingKwh * 3.6;
    const besparingM3Gas = besparingMj / MJ_PER_M3_GAS;

    const prijsPerM2 = input.kostenPerM2InclBtw ?? DEFAULT_PRIJS_PER_M2;
    const brutoInvestering = prijsPerM2 * input.oppervlakteM2;

    const subsidies: Subsidie[] = [
      dumavaSubsidie(brutoInvestering, context),
      ...(input.extraSubsidies ?? []),
    ];

    const baseResult = maakBusinessCase({
      maatregelId: 'spouwmuurisolatie',
      brutoInvestering,
      subsidies,
      besparingGasM3: besparingM3Gas,
      context,
      warnings,
    });

    return {
      ...baseResult,
      uWaardeOud: uOud,
      uWaardeNieuw: uNieuw,
      besparingKwh,
    };
  },
};
