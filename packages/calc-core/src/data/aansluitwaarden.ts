/**
 * Aansluitwaardes en bijbehorend piekvermogen.
 * Bron: Batterij!G2:I13 in Rekenmodel_Sportief_Opgewekt.
 */

import type { AansluitingType } from '../types/index.js';

export interface AansluitingRow {
  label: string;
  fase: 1 | 3;
  ampere: number;
  vermogenKw: number;
  /** Capaciteitstarief Liander 2025 €/jaar (vast tarief per aansluitcategorie) */
  capaciteitstariefEur?: number;
}

export const AANSLUITINGEN: AansluitingRow[] = [
  { label: '1x16 A', fase: 1, ampere: 16, vermogenKw: 3.68, capaciteitstariefEur: 349.7868 },
  { label: '1x25 A', fase: 1, ampere: 25, vermogenKw: 5.75, capaciteitstariefEur: 349.7868 },
  { label: '1x35 A', fase: 1, ampere: 35, vermogenKw: 8.05, capaciteitstariefEur: 349.7868 },
  { label: '1x40 A', fase: 1, ampere: 40, vermogenKw: 9.2,  capaciteitstariefEur: 349.7868 },
  { label: '1x80 A', fase: 1, ampere: 80, vermogenKw: 18.4 },
  { label: '3x25 A', fase: 3, ampere: 25, vermogenKw: 17.2, capaciteitstariefEur: 349.7868 },
  { label: '3x35 A', fase: 3, ampere: 35, vermogenKw: 24.1, capaciteitstariefEur: 1748.934 },
  { label: '3x40 A', fase: 3, ampere: 40, vermogenKw: 27.6, capaciteitstariefEur: 1748.934 },
  { label: '3x50 A', fase: 3, ampere: 50, vermogenKw: 34.5, capaciteitstariefEur: 2623.4 },
  { label: '3x63 A', fase: 3, ampere: 63, vermogenKw: 43.47, capaciteitstariefEur: 3497.868 },
  { label: '3x80 A', fase: 3, ampere: 80, vermogenKw: 55.2, capaciteitstariefEur: 4372.335 },
  // Grootverbruik — uit Excel Batterij-sheet (tarieven 2025).
  // Bij grootverbruik is het kW-contract gangbaarder dan ampere.
  // We modelleren ze als virtuele "3xN A"-rijen voor consistentie.
  { label: 'Grootverbruik 80 kW',  fase: 3, ampere: 116, vermogenKw: 80 },
  { label: 'Grootverbruik 100 kW', fase: 3, ampere: 144, vermogenKw: 100 },
  { label: 'Grootverbruik 136 kW', fase: 3, ampere: 196, vermogenKw: 136 },
  { label: 'Grootverbruik 175 kW', fase: 3, ampere: 252, vermogenKw: 175 },
  { label: 'Grootverbruik 250 kW', fase: 3, ampere: 360, vermogenKw: 250 },
  { label: 'Grootverbruik 500 kW', fase: 3, ampere: 720, vermogenKw: 500 },
  { label: 'Grootverbruik 1000 kW', fase: 3, ampere: 1440, vermogenKw: 1000 },
];

/** Grootverbruik: vanaf 3x80A — geldt apart tarief (zie ACM-tarieven) */
export const KLEINVERBRUIK_GRENS_KW = 55.2;

export function aansluitingByLabel(label: string): AansluitingRow {
  const row = AANSLUITINGEN.find(a => a.label === label);
  if (!row) throw new Error(`Onbekende aansluiting: ${label}`);
  return row;
}

export function aansluitingToType(row: AansluitingRow): AansluitingType {
  return {
    fase: row.fase,
    ampere: row.ampere as AansluitingType['ampere'],
    vermogenKw: row.vermogenKw,
  };
}

/** Voor UI-dropdown: alle aansluitingen */
export function alleAansluitingen() {
  return AANSLUITINGEN.map(a => ({ value: a.label, label: a.label, vermogen: a.vermogenKw }));
}
