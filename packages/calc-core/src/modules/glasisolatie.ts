/**
 * Glasisolatie-module.
 *
 * Bron: Rekenmodel_Sportief_Opgewekt!Glasisolatie
 *
 * Excel gebruikt direct een lookup-tabel m³ gas/m²/jaar (bij 24x7 verwarmen)
 * in plaats van U-waarde berekeningen — dat is een vereenvoudiging, maar
 * intern consistent en sneller te begrijpen voor klanten.
 *
 * Excel-formule:
 *   B10 = (B6/24 * B8) * B7   warmteverlies oud   (m³/jaar)
 *   D10 = (D6/24 * D8) * D7   warmteverlies nieuw
 *   B13 = B10 - D10           besparing m³/jaar
 *
 * Ondersteunt meerdere glassoorten naast elkaar (zoals de prompt vereist).
 */

import type {
  MaatregelModule,
  MaatregelResultaat,
  ProjectContext,
  Subsidie,
  Warning,
} from '../types/index.js';
import { type Glassoort, glasInfo } from '../data/pv-en-glas.js';
import { dumavaSubsidie, maakBusinessCase } from '../util/business-case.js';

export interface GlasSegment {
  /** Huidige glassoort */
  huidig: Glassoort;
  /** Nieuwe glassoort */
  nieuw: Glassoort;
  /** Oppervlakte in m² */
  oppervlakteM2: number;
  /** Verwarmingsuren per dag (default 8, want clubhuis niet 24/7) */
  urenPerDag: number;
}

export interface GlasisolatieInput {
  /** Een of meerdere glassegmenten. Sommen worden over alle segmenten genomen. */
  segmenten: GlasSegment[];
  /** Kosten per m² incl btw (default 175 zoals Excel B17) */
  kostenPerM2InclBtw: number;
  /** Extra subsidies (IAS, 1/3-regeling) */
  extraSubsidies?: Subsidie[];
}

export interface GlasisolatieResultaat extends MaatregelResultaat {
  besparingPerSegment: Array<{
    huidig: Glassoort;
    nieuw: Glassoort;
    oppervlakteM2: number;
    besparingM3PerJaar: number;
  }>;
  totaalOppervlakteM2: number;
}

export const glasisolatieModule: MaatregelModule<GlasisolatieInput, GlasisolatieResultaat> = {
  id: 'glasisolatie',
  naam: 'Glasisolatie',

  defaultInput(_context: ProjectContext): GlasisolatieInput {
    return {
      segmenten: [
        {
          huidig: 'enkel',
          nieuw: 'hr-pp',
          oppervlakteM2: 20,
          urenPerDag: 8,
        },
      ],
      kostenPerM2InclBtw: 175,
    };
  },

  bereken(input: GlasisolatieInput, context: ProjectContext): GlasisolatieResultaat {
    const warnings: Warning[] = [];
    if (input.segmenten.length === 0) {
      warnings.push({ level: 'error', code: 'GEEN_SEGMENTEN', message: 'Geen glas-segmenten ingevuld' });
    }

    let totaalBesparingM3 = 0;
    let totaalOppervlak = 0;
    const perSegment: GlasisolatieResultaat['besparingPerSegment'] = [];

    for (const seg of input.segmenten) {
      const huidigInfo = glasInfo(seg.huidig);
      const nieuwInfo = glasInfo(seg.nieuw);

      // Excel: (m3PerM2PerJaar / 24 * urenPerDag) * oppervlak
      const verliesOud = (huidigInfo.m3GasPerM2PerJaar / 24) * seg.urenPerDag * seg.oppervlakteM2;
      const verliesNieuw = (nieuwInfo.m3GasPerM2PerJaar / 24) * seg.urenPerDag * seg.oppervlakteM2;
      const besparing = verliesOud - verliesNieuw;

      if (besparing < 0) {
        warnings.push({
          level: 'warning',
          code: 'SEGMENT_VERSLECHTERING',
          message: `Nieuw glas ${seg.nieuw} isoleert slechter dan huidig ${seg.huidig}`,
        });
      }

      perSegment.push({
        huidig: seg.huidig,
        nieuw: seg.nieuw,
        oppervlakteM2: seg.oppervlakteM2,
        besparingM3PerJaar: besparing,
      });
      totaalBesparingM3 += besparing;
      totaalOppervlak += seg.oppervlakteM2;
    }

    const brutoInvestering = input.kostenPerM2InclBtw * totaalOppervlak;
    const subsidies: Subsidie[] = [
      dumavaSubsidie(brutoInvestering, context),
      ...(input.extraSubsidies ?? []),
    ];

    const baseResult = maakBusinessCase({
      maatregelId: 'glasisolatie',
      brutoInvestering,
      subsidies,
      besparingGasM3: totaalBesparingM3,
      context,
      warnings,
    });

    return {
      ...baseResult,
      besparingPerSegment: perSegment,
      totaalOppervlakteM2: totaalOppervlak,
    };
  },
};
