/**
 * Dakisolatie-module.
 *
 * Bron: Rekenmodel_Sportief_Opgewekt!Dakisolatie!A1:F58
 *
 * Berekening:
 *   U_oud   = 1 / Rc_oud                          W/(m²·K)
 *   U_nieuw = 1 / Rc_nieuw
 *   ΔWarmteverlies = opp × ΔT × (U_oud - U_nieuw)  W
 *   Energie/jaar  = stookuren × 3600 × ΔW         J
 *                 = stookuren × ΔW / 1000         kWh × 3.6 → MJ
 *   Gasbesparing  = MJ / 31.65                    m³ aardgas
 *
 * In Excel:
 *   J19 = J18 / 31.65   (J18 = besparing kWh, J19 = besparing m³)
 *   Maar J18 = J17 / 3.6e6 (J17 = besparing in joules)
 *   En J19 = m3 = kWh / 8.79 ≈ kWh / (31.65/3.6)
 *
 * Subsidie:
 *   Dumava standaard 20% op brutoInvestering.
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

export interface DakisolatieInput {
  /** Te isoleren oppervlakte in m² */
  oppervlakteM2: number;
  /** Huidige Rc-waarde. Indien undefined: afleiden uit bouwjaar */
  huidigeRcWaarde?: number;
  /** Nieuwe gewenste Rc-waarde (default 3.5 zoals Excel) */
  nieuweRcWaarde: number;
  /** Type isolatiemateriaal — bepaalt prijs/m² */
  isolatieType: 'houtwol' | 'cellulose' | 'strobalen' | 'standaard';
  /** Stookuren per jaar (default 1500 in Excel) */
  stookurenPerJaar: number;
  /** Binnen-buiten temperatuurverschil tijdens stookuren (default 8K) */
  binnenBuitenDeltaT: number;
  /** Eventueel manueel ingevulde kosten per m² incl btw (overschrijft type) */
  kostenPerM2InclBtw?: number;
  /** Extra subsidies (boven Dumava) */
  extraSubsidies?: Subsidie[];
}

export interface DakisolatieResultaat extends MaatregelResultaat {
  /** Voor visualisatie/UI */
  uWaardeOud: number;
  uWaardeNieuw: number;
  warmteverliesOudW: number;
  warmteverliesNieuwW: number;
  besparingKwh: number;
}

const PRIJZEN_PER_M2: Record<DakisolatieInput['isolatieType'], number> = {
  houtwol: 37.5,
  cellulose: 52.5,
  strobalen: 27.5,
  standaard: 100,   // generieke marktprijs uit Excel-toelichting
};

const ARBEIDSKOSTEN_PER_M2 = 35;
const OVERIGE_KOSTEN_PER_M2 = 15;

const MJ_PER_M3_GAS = 31.65;

export const dakisolatieModule: MaatregelModule<DakisolatieInput, DakisolatieResultaat> = {
  id: 'dakisolatie',
  naam: 'Dakisolatie',

  defaultInput(context: ProjectContext): DakisolatieInput {
    return {
      oppervlakteM2: context.gebouw.bvoTotaalM2 ?? 200,
      huidigeRcWaarde: rcDefault(context.gebouw.bouwjaar, 'dak'),
      nieuweRcWaarde: 3.5,
      isolatieType: 'standaard',
      stookurenPerJaar: 1500,
      binnenBuitenDeltaT: 8,
    };
  },

  bereken(input: DakisolatieInput, context: ProjectContext): DakisolatieResultaat {
    const warnings: Warning[] = [];

    if (input.oppervlakteM2 <= 0) {
      warnings.push({ level: 'error', code: 'OPP_LEEG', message: 'Oppervlakte moet > 0 zijn' });
    }
    if (input.nieuweRcWaarde <= (input.huidigeRcWaarde ?? 0)) {
      warnings.push({
        level: 'warning',
        code: 'GEEN_VERBETERING',
        message: 'Nieuwe Rc-waarde is niet hoger dan huidige — geen besparing.',
      });
    }

    const rcOud = input.huidigeRcWaarde ?? rcDefault(context.gebouw.bouwjaar, 'dak');
    const rcNieuw = input.nieuweRcWaarde;

    const uOud = 1 / rcOud;
    const uNieuw = 1 / rcNieuw;

    // Warmteverlies bij ΔT (in W)
    const verliesOudW = input.oppervlakteM2 * input.binnenBuitenDeltaT * uOud;
    const verliesNieuwW = input.oppervlakteM2 * input.binnenBuitenDeltaT * uNieuw;
    const besparingW = verliesOudW - verliesNieuwW;

    // Besparing per jaar in joules (Excel J17)
    const besparingJoules = input.stookurenPerJaar * (besparingW * 3600);
    const besparingKwh = besparingJoules / 3_600_000;

    // Besparing in m³ aardgas (Excel deelt MJ door 31.65)
    const besparingMj = besparingKwh * 3.6;
    const besparingM3Gas = besparingMj / MJ_PER_M3_GAS;

    // Kosten
    const prijsPerM2 = input.kostenPerM2InclBtw
      ?? (PRIJZEN_PER_M2[input.isolatieType] + ARBEIDSKOSTEN_PER_M2 + OVERIGE_KOSTEN_PER_M2);
    const brutoInvestering = prijsPerM2 * input.oppervlakteM2;

    const subsidies: Subsidie[] = [
      dumavaSubsidie(brutoInvestering, context),
      ...(input.extraSubsidies ?? []),
    ];

    const baseResult = maakBusinessCase({
      maatregelId: 'dakisolatie',
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
      warmteverliesOudW: verliesOudW,
      warmteverliesNieuwW: verliesNieuwW,
      besparingKwh,
    };
  },
};
