/**
 * RC-waardes per bouwjaar × constructiedeel.
 *
 * Bron: Inputsheet D24:K35 in Rekenmodel_Sportief_Opgewekt_v8_2_1.xlsx.
 * Deze tabel staat ook in alle isolatie-tabbladen herhaald.
 */

export type ConstructieDetail =
  | 'voor-1965-met-spouw-geen-isolatie'
  | 'voor-1965-met-spouw-nageisoleerd'
  | 'voor-1965-geen-spouw-geen-isolatie'
  | 'voor-1965-geen-spouw-nageisoleerd'
  | '1965-1974'
  | '1975-1987'
  | '1988-1991'
  | '1992-2013'
  | '2014'
  | '2015-2020'
  | 'vanaf-2021';

export type ConstructieDeel = 'gevel' | 'vloer' | 'dak' | 'glas';

interface RcRow {
  detail: ConstructieDetail;
  jaarMin?: number;
  jaarMax?: number;
  gevel: number;
  vloer: number;
  dak: number;
  glas: number;
  /** Label voor UI */
  label: string;
}

const TABEL: RcRow[] = [
  { detail: 'voor-1965-met-spouw-geen-isolatie', jaarMax: 1965,
    gevel: 0.35, vloer: 0.33, dak: 0.35, glas: 3.6,
    label: 'Vóór 1965, met spouw, isolatie afwezig' },
  { detail: 'voor-1965-met-spouw-nageisoleerd', jaarMax: 1965,
    gevel: 0.85, vloer: 0.83, dak: 0.85, glas: 2.5,
    label: 'Vóór 1965, met spouw, nageïsoleerd' },
  { detail: 'voor-1965-geen-spouw-geen-isolatie', jaarMax: 1965,
    gevel: 0.19, vloer: 0.15, dak: 0.22, glas: 4.9,
    label: 'Vóór 1965, zonder spouw, isolatie afwezig' },
  { detail: 'voor-1965-geen-spouw-nageisoleerd', jaarMax: 1965,
    gevel: 0.69, vloer: 0.65, dak: 0.72, glas: 2.7,
    label: 'Vóór 1965, zonder spouw, nageïsoleerd' },
  { detail: '1965-1974', jaarMin: 1965, jaarMax: 1974,
    gevel: 0.43, vloer: 0.17, dak: 0.86, glas: 4.9,
    label: '1965 – 1974' },
  { detail: '1975-1987', jaarMin: 1975, jaarMax: 1987,
    gevel: 1.3, vloer: 0.52, dak: 1.3, glas: 4.9,
    label: '1975 – 1987' },
  { detail: '1988-1991', jaarMin: 1988, jaarMax: 1991,
    gevel: 2.0, vloer: 1.3, dak: 2.0, glas: 4.9,
    label: '1988 – 1991' },
  { detail: '1992-2013', jaarMin: 1992, jaarMax: 2013,
    gevel: 2.5, vloer: 2.5, dak: 2.5, glas: 4.2,
    label: '1992 – 2013' },
  { detail: '2014', jaarMin: 2014, jaarMax: 2014,
    gevel: 3.5, vloer: 3.5, dak: 3.5, glas: 1.65,
    label: '2014' },
  { detail: '2015-2020', jaarMin: 2015, jaarMax: 2020,
    gevel: 4.5, vloer: 3.5, dak: 6.0, glas: 1.65,
    label: '2015 – 2020' },
  { detail: 'vanaf-2021', jaarMin: 2021,
    gevel: 4.7, vloer: 3.7, dak: 6.3, glas: 1.65,
    label: 'Vanaf 2021' },
];

/**
 * Default-keuze op basis van alleen bouwjaar (zonder kennis over spouw etc).
 * Pre-1965 default is "met spouw, isolatie afwezig" (meest voorkomende).
 */
export function rcDefault(bouwjaar: number, deel: ConstructieDeel): number {
  if (bouwjaar < 1965) {
    return TABEL.find(r => r.detail === 'voor-1965-met-spouw-geen-isolatie')![deel];
  }
  for (const r of TABEL) {
    if (r.jaarMin === undefined && r.jaarMax !== undefined && bouwjaar <= r.jaarMax) return r[deel];
    if (r.jaarMin !== undefined && r.jaarMax !== undefined && bouwjaar >= r.jaarMin && bouwjaar <= r.jaarMax) return r[deel];
    if (r.jaarMin !== undefined && r.jaarMax === undefined && bouwjaar >= r.jaarMin) return r[deel];
  }
  // fallback voor heel oude gebouwen die niet matchen
  return TABEL[0][deel];
}

/** Expliciete lookup als gebruiker een ConstructieDetail kiest */
export function rcByDetail(detail: ConstructieDetail, deel: ConstructieDeel): number {
  const row = TABEL.find(r => r.detail === detail);
  if (!row) throw new Error(`Onbekend constructie-detail: ${detail}`);
  return row[deel];
}

/** U-waarde = 1/Rc (W/m²K) */
export function uWaarde(rc: number): number {
  return 1 / rc;
}

/** Alle constructiedetails voor UI-dropdowns */
export function alleConstructieDetails(): { value: ConstructieDetail; label: string }[] {
  return TABEL.map(r => ({ value: r.detail, label: r.label }));
}
