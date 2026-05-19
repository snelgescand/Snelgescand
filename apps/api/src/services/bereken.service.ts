/**
 * Berekening-service: bridge tussen Project.state JSONB en calc-core.
 *
 * Defensief geprogrammeerd. Twee niveaus van validatie:
 *  1. Minimaal: kunnen we überhaupt rekenen? (energieverbruik + prijzen)
 *  2. Per maatregel: vul ontbrekende velden aan met defaults uit registry
 *
 * Bij ontbrekende minimale velden: geeft duidelijke foutmelding terug
 * met welke velden ingevuld moeten worden.
 */

import {
  MODULE_REGISTRY,
  rollupProject,
  defaultContext,
  type MaatregelResultaat,
  type ProjectContext,
  type RegistryKey,
  type ProjectResultaat,
} from '@sportief-opgewekt/calc-core';

interface ProjectState {
  context?: Partial<ProjectContext>;
  gekozenMaatregelen?: Record<string, unknown>;
}

export interface BerekendProject {
  perMaatregel: Partial<Record<RegistryKey, MaatregelResultaat>>;
  rollup: ProjectResultaat;
  overgeslagen: Array<{ id: string; reden: string }>;
}

export class BerekenValidatieFout extends Error {
  constructor(public ontbrekendeVelden: string[]) {
    super(`Niet alle vereiste velden zijn ingevuld: ${ontbrekendeVelden.join(', ')}`);
  }
}

export function berekenProject(rawState: unknown): BerekendProject {
  const state: ProjectState = (typeof rawState === 'object' && rawState !== null)
    ? rawState as ProjectState
    : {};

  // Stap 1: minimale validatie
  const energie = (state.context?.energie ?? {}) as Record<string, unknown>;
  const ontbreken: string[] = [];
  if (!isPositief(energie.gasverbruikM3)) ontbreken.push('gasverbruik per jaar');
  if (!isPositief(energie.stroomverbruikTotaalKwh)) ontbreken.push('stroomverbruik per jaar');
  if (!isPositief(energie.gasprijsPerM3)) ontbreken.push('gasprijs');
  if (!isPositief(energie.stroomprijsKaalPerKwh)) ontbreken.push('stroomprijs');

  if (ontbreken.length > 0) {
    throw new BerekenValidatieFout(ontbreken);
  }

  // Stap 2: context opbouwen met defaults (deep merge voor energie/gebouw)
  const baseCtx = defaultContext();
  const userCtx = state.context ?? {};
  const context = {
    ...baseCtx,
    ...userCtx,
    club: { ...baseCtx.club, ...(userCtx.club ?? {}) },
    gebouw: { ...baseCtx.gebouw, ...(userCtx.gebouw ?? {}) },
    energie: { ...baseCtx.energie, ...(userCtx.energie ?? {}) },
  };

  const resultaten: Partial<Record<RegistryKey, MaatregelResultaat>> = {};
  const overgeslagen: Array<{ id: string; reden: string }> = [];

  const gekozen = state.gekozenMaatregelen ?? {};

  for (const [maatregelId, input] of Object.entries(gekozen)) {
    if (!(maatregelId in MODULE_REGISTRY)) {
      overgeslagen.push({ id: maatregelId, reden: 'Onbekende maatregel' });
      continue;
    }
    const module = MODULE_REGISTRY[maatregelId as RegistryKey];

    // Stap 3: per maatregel — merge user-input met defaults
    const defaults = module.defaultInput(context) as unknown as Record<string, unknown>;
    const userInput = (input && typeof input === 'object') ? input as Record<string, unknown> : {};
    const samengevoegd = { ...defaults, ...userInput } as Record<string, unknown>;

    // Verwijder undefined / null waardes zodat ze niet de defaults overschrijven
    for (const k of Object.keys(samengevoegd)) {
      const v = samengevoegd[k];
      if (v === undefined || v === null || v === '') {
        samengevoegd[k] = defaults[k];
      }
    }

    try {
      const resultaat = module.bereken(samengevoegd as never, context);
      resultaten[maatregelId as RegistryKey] = resultaat;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      overgeslagen.push({ id: maatregelId, reden: msg });
    }
  }

  const rollup = rollupProject({ context, resultaten });

  return sanitize({ perMaatregel: resultaten, rollup, overgeslagen });
}

function isPositief(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/**
 * Vervang Infinity/NaN door null voor JSON-serialisatie.
 */
function sanitize<T>(obj: T): T {
  if (typeof obj !== 'object' || obj === null) {
    if (typeof obj === 'number' && !Number.isFinite(obj)) {
      return null as unknown as T;
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitize) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out[k] = sanitize(v);
  }
  return out as T;
}
