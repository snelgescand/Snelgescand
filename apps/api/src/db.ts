/**
 * Prisma-client singleton.
 *
 * In dev wordt de client herbruikt across hot reloads via globalThis,
 * zo voorkomen we connection-pool exhaustion.
 */

import { PrismaClient } from '@prisma/client';
import { isProduction } from './config.js';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__prisma ??
  new PrismaClient({
    log: isProduction() ? ['error'] : ['error', 'warn'],
  });

if (!isProduction()) {
  globalThis.__prisma = prisma;
}
