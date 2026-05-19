/**
 * Berekening-service: bridge tussen Project.state JSONB en calc-core.
 *
 * Defensief geprogrammeerd:
 *  - Lege of incomplete state → werkt met defaults uit calc-core
 *  - Onbekende maatregel-id → wordt overgeslagen met log-melding ipv crash
 *  - Crashende module → wordt gevangen, rollup gaat door met andere modules
 *  - Resultaat is altijd JSON-serializable (geen Infinity/NaN)
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
  // Andere velden (locatie, fotos) negeren we hier — niet relevant voor rekenen
}

export interface BerekendProject {
  perMaatregel: Partial<Record<RegistryKey, MaatregelResultaat>>;
  rollup: ProjectResultaat;
  /** Maatregelen die zijn overgeslagen door fouten — voor frontend-feedback */
  overgeslagen: Array<{ id: string; reden: string }>;
}

export function berekenProject(rawState: unknown): BerekendProject {
  const state: ProjectState = (typeof rawState === 'object' && rawState !== null)
    ? rawState as ProjectState
    : {};

  // Robuuste context — defaults vullen ontbrekende velden aan
  const context = defaultContext(state.context ?? {});

  const resultaten: Partial<Record<RegistryKey, MaatregelResultaat>> = {};
  const overgeslagen: Array<{ id: string; reden: string }> = [];

  const gekozen = state.gekozenMaatregelen ?? {};

  for (const [maatregelId, input] of Object.entries(gekozen)) {
    if (!(maatregelId in MODULE_REGISTRY)) {
      overgeslagen.push({ id: maatregelId, reden: 'Onbekende maatregel' });
      continue;
    }
    const module = MODULE_REGISTRY[maatregelId as RegistryKey];

    // Als input null/undefined is, gebruik defaultInput
    const veiligeInput = (input && typeof input === 'object')
      ? input
      : module.defaultInput(context);

    try {
      const resultaat = module.bereken(veiligeInput as never, context);
      resultaten[maatregelId as RegistryKey] = resultaat;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      overgeslagen.push({ id: maatregelId, reden: msg });
    }
  }

  const rollup = rollupProject({ context, resultaten });

  // Sanitize Infinity/NaN naar null voor JSON-serialisatie
  return sanitize({ perMaatregel: resultaten, rollup, overgeslagen });
}

/**
 * Vervang Infinity/NaN door null in een dieper object — Postgres JSONB
 * accepteert die waardes niet, en JSON.stringify maakt ze tot "null"
 * waardoor TypeScript-types kunnen breken.
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
