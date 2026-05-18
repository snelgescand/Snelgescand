/**
 * Vloerisolatie-module.
 *
 * Bron: Rekenmodel_Sportief_Opgewekt!Vloerisolatie
 *
 * Zelfde fysica als dak/spouw maar typisch hogere prijs per m² (PIR/EPS-pir
 * vanaf €45/m² incl. arbeid), en grondvloer-ΔT is lager (gemiddeld 6K).
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

export interface VloerisolatieInput {
  oppervlakteM2: number;
  huidigeRcWaarde?: number;
  nieuweRcWaarde: number;   // typ 3.5
  isolatieType: 'pir' | 'eps' | 'spuiterspray' | 'standaard';
  stookurenPerJaar: number;
  binnenBuitenDeltaT: number;
  kostenPerM2InclBtw?: number;
  extraSubsidies?: Subsidie[];
}

export interface VloerisolatieResultaat extends MaatregelResultaat {
  uWaardeOud: number;
  uWaardeNieuw: number;
  besparingKwh: number;
}

const PRIJZEN_PER_M2: Record<VloerisolatieInput['isolatieType'], number> = {
  pir: 65,
  eps: 50,
  spuiterspray: 55,
  standaard: 60,
};

const MJ_PER_M3_GAS = 31.65;

export const vloerisolatieModule: MaatregelModule<VloerisolatieInput, VloerisolatieResultaat> = {
  id: 'vloerisolatie',
  naam: 'Vloerisolatie',

  defaultInput(context: ProjectContext): VloerisolatieInput {
    return {
      oppervlakteM2: context.gebouw.bvoTotaalM2 ?? 200,
      huidigeRcWaarde: rcDefault(context.gebouw.bouwjaar, 'vloer'),
      nieuweRcWaarde: 3.5,
      isolatieType: 'standaard',
      stookurenPerJaar: 1500,
      binnenBuitenDeltaT: 6,
    };
  },

  bereken(input: VloerisolatieInput, context: ProjectContext): VloerisolatieResultaat {
    const warnings: Warning[] = [];
    if (input.oppervlakteM2 <= 0) {
      warnings.push({ level: 'error', code: 'OPP_LEEG', message: 'Oppervlakte moet > 0 zijn' });
    }

    const rcOud = input.huidigeRcWaarde ?? rcDefault(context.gebouw.bouwjaar, 'vloer');
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

    const prijsPerM2 = input.kostenPerM2InclBtw ?? PRIJZEN_PER_M2[input.isolatieType];
    const brutoInvestering = prijsPerM2 * input.oppervlakteM2;

    const subsidies: Subsidie[] = [
      dumavaSubsidie(brutoInvestering, context),
      ...(input.extraSubsidies ?? []),
    ];

    const baseResult = maakBusinessCase({
      maatregelId: 'vloerisolatie',
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
