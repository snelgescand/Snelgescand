/**
 * Douches-module.
 *
 * Bron: Rekenmodel_Sportief_Opgewekt!"Douchen (overig)" en "Douchen (teamsporten)".
 *
 * Twee modi:
 *  - SIMPEL: aantal douchebeurten/jaar × liters/beurt × m³ gas per kuub water
 *  - GEDETAILLEERD: per dag-van-week × tijdslot matrix
 *
 * De gedetailleerde modus is nodig voor boilerdimensionering (piekberekening).
 */

import type {
  MaatregelModule,
  MaatregelResultaat,
  ProjectContext,
  
  Warning,
} from '../types/index.js';
import { maakBusinessCase } from '../util/business-case.js';

const LITER_PER_MINUUT_DEFAULT = 7;
const MINUTEN_PER_DOUCHE_DEFAULT = 5;
/**
 * Gas per kuub douchewater verwarmen (van 10°C koud naar mengtemperatuur).
 * Excel "Douchen (overig)"!E13 = 3.93 m³/kuub.
 * Excel "Douchen (teamsporten)"!U9 = 0.2/50 = 0.004 m³/L = 4 m³/kuub.
 * Beide consistent met c×ΔT × inefficiëntie ketel.
 */
const M3_GAS_PER_M3_WATER = 3.93;

/* ============================================================================
 * SIMPELE MODUS
 * ========================================================================== */

export interface DouchesSimpelInput {
  aantalDouchebeurtenPerJaar: number;
  literPerMinuut: number;
  minutenPerDouche: number;
  /** Eventueel: waterbesparende douchekoppen flag → effectieve l/min */
  waterbesparendeKoppen?: boolean;
}

/**
 * @returns gasverbruik in m³/jaar voor douchen
 */
export function berekenDouchenGasSimpel(input: DouchesSimpelInput): {
  literPerDouche: number;
  literPerJaar: number;
  m3WaterPerJaar: number;
  m3GasPerJaar: number;
} {
  const effectieveLitersMin = input.waterbesparendeKoppen ? 7 : input.literPerMinuut;
  const literPerDouche = effectieveLitersMin * input.minutenPerDouche;
  const literPerJaar = literPerDouche * input.aantalDouchebeurtenPerJaar;
  const m3WaterPerJaar = literPerJaar / 1000;
  const m3GasPerJaar = m3WaterPerJaar * M3_GAS_PER_M3_WATER;

  return { literPerDouche, literPerJaar, m3WaterPerJaar, m3GasPerJaar };
}

/* ============================================================================
 * GEDETAILLEERDE MODUS (tijdvenster-matrix)
 * ========================================================================== */

export type DagVanWeek = 'maandag' | 'dinsdag' | 'woensdag' | 'donderdag' | 'vrijdag' | 'zaterdag' | 'zondag';

export interface TijdSlot {
  /** Beginuur (decimaal, bv 18.5 voor 18:30) */
  uur: number;
  /** Percentage douchers van capaciteit per veld */
  percentage: number;
}

export interface DagSchema {
  dag: DagVanWeek;
  velden: number;            // aantal velden in gebruik die dag
  spelersPerVeld: number;    // gemiddelde teamgrootte
  tijdsloten: TijdSlot[];
}

export interface DouchesGedetailleerdInput {
  schema: DagSchema[];
  trainingsweken: number;     // default 30
  wedstrijdweken: number;     // default 25
  minutenPerDouche: number;
  literPerMinuut: number;
  /** Default-percentage voor trainingsavonden (excel U5 = 0.25) */
  defaultPctTraining: number;
  /** Default-percentage voor wedstrijd-zaterdag jeugd (U7 = 0.5) */
  defaultPctWedstrijdJeugd: number;
  /** Default-percentage voor wedstrijd ouderen (U8 = 1.0) */
  defaultPctWedstrijdOuderen: number;
}

interface DagBerekening {
  dag: DagVanWeek;
  liters: number;
  douchers: number;
  pieksleutel: number;       // hoogste % × velden × spelers
}

export function berekenDouchenGedetailleerd(input: DouchesGedetailleerdInput): {
  perDag: DagBerekening[];
  literPerJaar: number;
  m3GasPerJaar: number;
  piekUur: { dag: DagVanWeek; uur: number; liters: number } | null;
} {
  const litersPerBeurt = input.literPerMinuut * input.minutenPerDouche;
  const perDag: DagBerekening[] = [];
  let piek: { dag: DagVanWeek; uur: number; liters: number } | null = null;

  for (const dag of input.schema) {
    let dagLiters = 0;
    let dagDouchers = 0;
    let dagPiek = 0;

    for (const slot of dag.tijdsloten) {
      const douchersInSlot = slot.percentage * dag.velden * dag.spelersPerVeld;
      const litersInSlot = douchersInSlot * litersPerBeurt;

      dagLiters += litersInSlot;
      dagDouchers += douchersInSlot;
      dagPiek = Math.max(dagPiek, douchersInSlot);

      if (!piek || litersInSlot > piek.liters) {
        piek = { dag: dag.dag, uur: slot.uur, liters: litersInSlot };
      }
    }

    perDag.push({ dag: dag.dag, liters: dagLiters, douchers: dagDouchers, pieksleutel: dagPiek });
  }

  // Excel: training_dagen × 30 weken + wedstrijd_dagen × 25 weken
  const isWeekendDag = (d: DagVanWeek) => d === 'zaterdag' || d === 'zondag';
  let literPerJaar = 0;
  for (const d of perDag) {
    const weken = isWeekendDag(d.dag) ? input.wedstrijdweken : input.trainingsweken;
    literPerJaar += d.liters * weken;
  }

  const m3GasPerJaar = (literPerJaar / 1000) * M3_GAS_PER_M3_WATER;

  return { perDag, literPerJaar, m3GasPerJaar, piekUur: piek };
}

/* ============================================================================
 * Module-wrapper (output naar standaard MaatregelResultaat)
 *
 * NB: dit is een "DIAGNOSE"-module die het huidige verbruik becijfert.
 * Het is niet zelf een verduurzamingsmaatregel — die zit in warmtepompboiler,
 * pvt-tapwater, e-boiler etc. Maar voor symmetrie en UI-koppeling implementeren
 * we hem als een module.
 * ========================================================================== */

export interface DouchesAnalyseInput {
  modus: 'simpel' | 'gedetailleerd';
  simpel?: DouchesSimpelInput;
  gedetailleerd?: DouchesGedetailleerdInput;
}

export interface DouchesAnalyseResultaat extends MaatregelResultaat {
  literPerJaar: number;
  m3WaterPerJaar: number;
  m3GasPerJaar: number;
  /** Percentage van totaal gasverbruik dat naar douchen gaat */
  percentageVanTotaalGas: number;
  piekUur?: { dag: DagVanWeek; uur: number; liters: number } | null;
}

export const douchesAnalyseModule: MaatregelModule<DouchesAnalyseInput, DouchesAnalyseResultaat> = {
  // Hergebruik een bestaande id; dit is een analyse en geen maatregel — pas later op met
  // de typering, maar voldoende voor v0.
  id: 'douches-analyse' as const,
  naam: 'Douches-analyse',

  defaultInput(context: ProjectContext): DouchesAnalyseInput {
    return {
      modus: 'simpel',
      simpel: {
        aantalDouchebeurtenPerJaar: (context.club.aantalDouchekoppen ?? 6) * 250,  // ruwe schatting
        literPerMinuut: LITER_PER_MINUUT_DEFAULT,
        minutenPerDouche: MINUTEN_PER_DOUCHE_DEFAULT,
      },
    };
  },

  bereken(input: DouchesAnalyseInput, context: ProjectContext): DouchesAnalyseResultaat {
    const warnings: Warning[] = [];
    let literPerJaar = 0;
    let m3WaterPerJaar = 0;
    let m3GasPerJaar = 0;
    let piek: DouchesAnalyseResultaat['piekUur'] = null;

    if (input.modus === 'simpel') {
      if (!input.simpel) {
        warnings.push({ level: 'error', code: 'SIMPEL_LEEG', message: 'simpel input ontbreekt' });
      } else {
        const r = berekenDouchenGasSimpel(input.simpel);
        literPerJaar = r.literPerJaar;
        m3WaterPerJaar = r.m3WaterPerJaar;
        m3GasPerJaar = r.m3GasPerJaar;
      }
    } else {
      if (!input.gedetailleerd) {
        warnings.push({ level: 'error', code: 'DETAIL_LEEG', message: 'gedetailleerd input ontbreekt' });
      } else {
        const r = berekenDouchenGedetailleerd(input.gedetailleerd);
        literPerJaar = r.literPerJaar;
        m3WaterPerJaar = literPerJaar / 1000;
        m3GasPerJaar = r.m3GasPerJaar;
        piek = r.piekUur;
      }
    }

    const totaalGas = context.energie.gasverbruikM3 || 1;
    const percentageVanTotaalGas = (m3GasPerJaar / totaalGas) * 100;

    // Geen besparing — dit is een diagnose. Investering en subsidies leeg.
    const base = maakBusinessCase({
      maatregelId: 'douches-analyse',
      brutoInvestering: 0,
      subsidies: [],
      context,
      warnings,
    });

    return {
      ...base,
      literPerJaar,
      m3WaterPerJaar,
      m3GasPerJaar,
      percentageVanTotaalGas,
      piekUur: piek,
    };
  },
};
