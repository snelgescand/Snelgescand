/**
 * Zonnepanelen: staffel-prijzen, degradatie, glas-isolatie U-waardes.
 * Bron: Zonnepanelen!A10:C21 en Glasisolatie!F25:H30 in Rekenmodel_Sportief_Opgewekt.
 */

interface PvStaffelRow {
  wpMin: number;
  wpMax: number;
  prijsInclBtw: number;   // €/Wp
  prijsExclBtw: number;
}

export const PV_STAFFEL: PvStaffelRow[] = [
  { wpMin: 0,       wpMax: 5000,    prijsInclBtw: 1.39, prijsExclBtw: 1.15 },
  { wpMin: 5000,    wpMax: 10000,   prijsInclBtw: 1.38, prijsExclBtw: 1.14 },
  { wpMin: 10001,   wpMax: 20000,   prijsInclBtw: 1.36, prijsExclBtw: 1.12 },
  { wpMin: 20001,   wpMax: 30000,   prijsInclBtw: 1.33, prijsExclBtw: 1.10 },
  { wpMin: 30001,   wpMax: 40000,   prijsInclBtw: 1.31, prijsExclBtw: 1.08 },
  { wpMin: 40001,   wpMax: 50000,   prijsInclBtw: 1.28, prijsExclBtw: 1.06 },
  { wpMin: 50001,   wpMax: 60000,   prijsInclBtw: 1.26, prijsExclBtw: 1.04 },
  { wpMin: 60001,   wpMax: 80000,   prijsInclBtw: 1.23, prijsExclBtw: 1.02 },
  { wpMin: 80001,   wpMax: 100000,  prijsInclBtw: 1.21, prijsExclBtw: 1.00 },
  { wpMin: 100001,  wpMax: Infinity, prijsInclBtw: 1.19, prijsExclBtw: 0.98 },
];

export function pvPrijsPerWp(totaalWp: number, btwInbegrepen = true): number {
  for (const row of PV_STAFFEL) {
    if (totaalWp >= row.wpMin && totaalWp <= row.wpMax) {
      return btwInbegrepen ? row.prijsInclBtw : row.prijsExclBtw;
    }
  }
  return PV_STAFFEL[PV_STAFFEL.length - 1].prijsInclBtw;
}

/** Default vermogen per paneel in Wp */
export const PV_DEFAULT_PANEEL_WP = 430;

/** Default instralingsfactor NL (0.85 in Excel Waarde zonnepanelen!I7) */
export const PV_DEFAULT_INSTRALINGSFACTOR = 0.85;

/** Jaarlijkse degradatie als fractie (0.0003 = 0.03% in Excel) */
export const PV_DEGRADATIE_PER_JAAR = 0.0003;

/** Default ratio direct eigen verbruik (15% in Excel) */
export const PV_DEFAULT_EIGEN_VERBRUIK_RATIO = 0.15;

/** CO₂ besparing per kWh PV (Zonnepanelen!B26) */
export const PV_CO2_REDUCTIE_PER_KWH = 0.649;

/* ============================================================================
 * Glas-isolatie U-waardes (W/m²K) en jaarverlies (m³ gas/m²/jr bij 24x7)
 * Bron: Glasisolatie!F25:H30
 * ========================================================================== */

export type Glassoort = 'enkel' | 'dubbel' | 'hr' | 'hr-plus' | 'hr-pp' | 'hr-ppp';

interface GlasRow {
  soort: Glassoort;
  label: string;
  uWaarde: number;
  /** m³ gas/m² per jaar bij continu 24/7 verwarmen */
  m3GasPerM2PerJaar: number;
}

export const GLAS: GlasRow[] = [
  { soort: 'enkel',   label: 'Enkelglas', uWaarde: 5.8, m3GasPerM2PerJaar: 24 },
  { soort: 'dubbel',  label: 'Dubbelglas', uWaarde: 2.8, m3GasPerM2PerJaar: 11.6 },
  { soort: 'hr',      label: 'HR glas', uWaarde: 1.9, m3GasPerM2PerJaar: 7.9 },
  { soort: 'hr-plus', label: 'HR+ glas', uWaarde: 1.5, m3GasPerM2PerJaar: 6.2 },
  { soort: 'hr-pp',   label: 'HR++ glas', uWaarde: 1.1, m3GasPerM2PerJaar: 4.5 },
  { soort: 'hr-ppp',  label: 'HR+++ glas', uWaarde: 0.7, m3GasPerM2PerJaar: 2.9 },
];

export function glasInfo(soort: Glassoort): GlasRow {
  const r = GLAS.find(g => g.soort === soort);
  if (!r) throw new Error(`Onbekende glassoort: ${soort}`);
  return r;
}
