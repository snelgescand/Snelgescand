/**
 * Project-lifecycle: de fasen waarin een project zich kan bevinden.
 *
 * Dit is een 'sub-status' bovenop de Prisma `status` enum (DRAFT/IN_PROGRESS/AFGEROND/GEARCHIVEERD).
 * De lifecycle wordt in `state.lifecycle` opgeslagen (binnen JSON-state, dus geen
 * migration nodig).
 */

export type LifecycleFase =
  | 'concept'
  | 'scan-gepland'
  | 'scan-uitgevoerd'
  | 'rapport-opgesteld'
  | 'offertes-aangevraagd'
  | 'in-uitvoering'
  | 'opgeleverd'
  | 'archief';

export interface LifecycleInfo {
  fase: LifecycleFase;
  label: string;
  korte: string;
  kleurClass: string;       // tailwind voor badge background
  tekstClass: string;       // tailwind voor badge text
  ondertitel: string;
}

export const LIFECYCLE_FASEN: LifecycleInfo[] = [
  {
    fase: 'concept',
    label: 'Concept',
    korte: 'Concept',
    kleurClass: 'bg-gray-100',
    tekstClass: 'text-gray-700',
    ondertitel: 'Net aangemaakt, basisgegevens in te vullen',
  },
  {
    fase: 'scan-gepland',
    label: 'Scan gepland',
    korte: '📅 Gepland',
    kleurClass: 'bg-blue-100',
    tekstClass: 'text-blue-700',
    ondertitel: 'Locatiebezoek staat in de agenda',
  },
  {
    fase: 'scan-uitgevoerd',
    label: 'Scan uitgevoerd',
    korte: '✓ Gescand',
    kleurClass: 'bg-cyan-100',
    tekstClass: 'text-cyan-800',
    ondertitel: 'Bezoek gedaan, gegevens worden verwerkt',
  },
  {
    fase: 'rapport-opgesteld',
    label: 'Rapport opgesteld',
    korte: '📄 Rapport',
    kleurClass: 'bg-primary-100',
    tekstClass: 'text-primary-800',
    ondertitel: 'Rapport en presentatie zijn gereed',
  },
  {
    fase: 'offertes-aangevraagd',
    label: 'Offertes aangevraagd',
    korte: '💰 Offertes',
    kleurClass: 'bg-purple-100',
    tekstClass: 'text-purple-700',
    ondertitel: 'Club vraagt offertes op bij installateurs',
  },
  {
    fase: 'in-uitvoering',
    label: 'In uitvoering',
    korte: '🔨 Bouw',
    kleurClass: 'bg-accent-orange/15',
    tekstClass: 'text-accent-orange-dark',
    ondertitel: 'Maatregelen worden geïnstalleerd',
  },
  {
    fase: 'opgeleverd',
    label: 'Opgeleverd',
    korte: '🎉 Opgeleverd',
    kleurClass: 'bg-green-100',
    tekstClass: 'text-green-700',
    ondertitel: 'Maatregelen zijn opgeleverd, club is verduurzaamd',
  },
  {
    fase: 'archief',
    label: 'Archief',
    korte: '📦 Archief',
    kleurClass: 'bg-gray-100',
    tekstClass: 'text-gray-500',
    ondertitel: 'Project gearchiveerd',
  },
];

export const DEFAULT_FASE: LifecycleFase = 'concept';

export function vindFase(fase: LifecycleFase | undefined): LifecycleInfo {
  return LIFECYCLE_FASEN.find(f => f.fase === fase) ?? LIFECYCLE_FASEN[0];
}
