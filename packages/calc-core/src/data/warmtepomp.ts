/**
 * Warmtepomp-vuistregels.
 * Bron: Lucht water warmtepomp!A5:E8 en Hybride warmtepomp!F6:H13
 */

/* ============================================================================
 * Lucht-water warmtepomp: benodigd vermogen W/m² o.b.v. bouwjaar en WTW
 * ========================================================================== */

interface LWVermogenRow {
  jaarMin?: number;
  jaarMax?: number;
  zonderWtwWPerM2: number;
  metWtwWPerM2: number;
}

const LW_TABEL: LWVermogenRow[] = [
  { jaarMax: 1999, zonderWtwWPerM2: 90, metWtwWPerM2: 50 },
  { jaarMin: 2000, jaarMax: 2010, zonderWtwWPerM2: 80, metWtwWPerM2: 45 },
  { jaarMin: 2010, jaarMax: 2017, zonderWtwWPerM2: 60, metWtwWPerM2: 35 },
  { jaarMin: 2017, zonderWtwWPerM2: 50, metWtwWPerM2: 30 },
];

export function luchtWaterWPerM2(bouwjaar: number, metWtw: boolean): number {
  for (const row of LW_TABEL) {
    const minOK = row.jaarMin === undefined || bouwjaar > row.jaarMin;
    const maxOK = row.jaarMax === undefined || bouwjaar <= row.jaarMax;
    if (minOK && maxOK) {
      return metWtw ? row.metWtwWPerM2 : row.zonderWtwWPerM2;
    }
  }
  return metWtw ? 50 : 90;
}

/** Default COP voor lucht-water warmtepomp */
export const LW_DEFAULT_COP = 4;

/* ============================================================================
 * Lucht-lucht warmtepomp: W/m³ o.b.v. isolatieniveau
 * Bron: Lucht-lucht warmtepomp!F4:H6
 * ========================================================================== */

export type IsolatieNiveau = 'goed-weinig-ramen' | 'redelijk' | 'matig';

const LL_W_PER_M3: Record<IsolatieNiveau, number> = {
  'goed-weinig-ramen': 30,
  'redelijk': 40,
  'matig': 50,
};

export function luchtLuchtWPerM3(niveau: IsolatieNiveau): number {
  return LL_W_PER_M3[niveau];
}

export const LL_DEFAULT_COP = 4;

/* ============================================================================
 * Hybride warmtepomp: vollasturen per bouwjaar
 * Bron: Hybride warmtepomp!F6:H13
 * ========================================================================== */

interface VollastRow {
  jaarMin: number;
  jaarMax: number;
  vollasturen: number;
}

const VOLLAST_TABEL: VollastRow[] = [
  { jaarMin: 1965, jaarMax: 1974, vollasturen: 1801 },
  { jaarMin: 1975, jaarMax: 1994, vollasturen: 1749 },
  { jaarMin: 1995, jaarMax: 1999, vollasturen: 1700 },
  { jaarMin: 2000, jaarMax: 2010, vollasturen: 1649 },
  { jaarMin: 2011, jaarMax: 2015, vollasturen: 1525 },
  { jaarMin: 2016, jaarMax: 2017, vollasturen: 1400 },
  { jaarMin: 2018, jaarMax: 2020, vollasturen: 1200 },
  { jaarMin: 2021, jaarMax: 9999, vollasturen: 1001 },
];

export function hybrideVollasturen(bouwjaar: number): number {
  for (const row of VOLLAST_TABEL) {
    if (bouwjaar >= row.jaarMin && bouwjaar <= row.jaarMax) return row.vollasturen;
  }
  // pre-1965: gebruik oudste rij
  return VOLLAST_TABEL[0].vollasturen;
}

/** WTW reduceert verwarmingsgasverbruik met 40% (besparing 60%) */
export const WTW_BESPARING_FACTOR = 0.6;

/** Default beta-factor hybride warmtepomp (= percentage van gas dat warmtepomp overneemt) */
export const HYBRIDE_DEFAULT_BETA = 0.78;

export const HYBRIDE_DEFAULT_COP = 4;
