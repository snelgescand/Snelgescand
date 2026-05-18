/**
 * Berekening-service: bridge tussen het opgeslagen Project.state en calc-core.
 *
 * State-structuur in DB:
 *   {
 *     context: ProjectContext,
 *     gekozenMaatregelen: {
 *       [maatregelId]: input
 *     }
 *   }
 *
 * Per maatregel:
 *   1. Haal de module op via MODULE_REGISTRY[maatregelId]
 *   2. Roep module.bereken(input, context) aan
 *   3. Verzamel resultaten in een record
 *   4. Roep rollupProject() aan voor het samenvattend resultaat
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
  context: Partial<ProjectContext>;
  gekozenMaatregelen: Record<string, unknown>;
}

export interface BerekendProject {
  perMaatregel: Partial<Record<RegistryKey, MaatregelResultaat>>;
  rollup: ProjectResultaat;
}

export function berekenProject(rawState: unknown): BerekendProject {
  // Basic shape-check
  if (typeof rawState !== 'object' || rawState === null) {
    throw new Error('State is geen object');
  }
  const state = rawState as ProjectState;
  if (!state.context || typeof state.context !== 'object') {
    throw new Error('state.context ontbreekt');
  }
  if (!state.gekozenMaatregelen || typeof state.gekozenMaatregelen !== 'object') {
    throw new Error('state.gekozenMaatregelen ontbreekt');
  }

  const context = defaultContext(state.context);

  const resultaten: Partial<Record<RegistryKey, MaatregelResultaat>> = {};
  for (const [maatregelId, input] of Object.entries(state.gekozenMaatregelen)) {
    if (!(maatregelId in MODULE_REGISTRY)) {
      throw new Error(`Onbekende maatregel: ${maatregelId}`);
    }
    const module = MODULE_REGISTRY[maatregelId as RegistryKey];
    try {
      const resultaat = module.bereken(input as never, context);
      resultaten[maatregelId as RegistryKey] = resultaat;
    } catch (err) {
      throw new Error(
        `Berekening voor '${maatregelId}' mislukt: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  const rollup = rollupProject({
    context,
    resultaten,
  });

  return { perMaatregel: resultaten, rollup };
}
