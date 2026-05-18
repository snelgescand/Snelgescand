/**
 * Modules-route: leveert de UI een lijst van alle beschikbare maatregelen
 * + groepering + default-inputs.
 *
 * Hierdoor kan de frontend dynamisch een "kies maatregel"-dropdown vullen
 * zonder de modulestructuur hard te coderen.
 */

import type { FastifyInstance } from 'fastify';
import {
  MODULE_REGISTRY,
  MAATREGEL_GROEPEN,
  defaultContext,
  type RegistryKey,
} from '@sportief-opgewekt/calc-core';

export default async function modulesRoutes(app: FastifyInstance) {
  // Publiek leesbaar — geen auth-eis voor metadata
  app.get('/modules', async () => {
    const ctx = defaultContext();
    const modules = (Object.entries(MODULE_REGISTRY) as [RegistryKey, typeof MODULE_REGISTRY[RegistryKey]][])
      .map(([id, mod]) => ({
        id,
        naam: mod.naam,
        defaultInput: mod.defaultInput(ctx),
      }));
    return {
      modules,
      groepen: MAATREGEL_GROEPEN,
    };
  });
}
