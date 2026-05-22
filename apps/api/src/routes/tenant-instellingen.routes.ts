/**
 * Tenant-instellingen endpoint — "premium Excel" voor berekening-parameters.
 *
 * Iedereen mag de instellingen LEZEN (voor zichtbaarheid in calc-flows),
 * alleen BEHEERDERS mogen ze WIJZIGEN.
 *
 *   GET    /tenant/instellingen     → huidige instellingen of defaults
 *   PATCH  /tenant/instellingen     → wijzigen (beheerder)
 *
 * Schema van de instellingen-JSON:
 *
 *   {
 *     "prijzen": {
 *       "gasPerM3": 1.35,            // €/m³ gas (kaal + transport)
 *       "stroomPerKwh": 0.30,        // €/kWh stroom (kaal)
 *       "waterPerM3": 1.13           // €/m³ water (incl. zuiveringsheffing)
 *     },
 *     "vuistregels": {
 *       "literPerDouche": 35,        // L warm water per douche
 *       "gasPerDouche": 0.5,         // m³ gas per douche-warmwater
 *       "literPerSpoeling": 6,       // L water per WC-spoeling
 *       "co2GasPerM3": 1.78,         // kg CO₂ per m³ gas
 *       "co2StroomPerKwh": 0.34,     // kg CO₂ per kWh (NL-mix)
 *       "primairFactorGas": 9.77     // kWh primair per m³ gas (voor WEii)
 *     },
 *     "subsidies": {
 *       "isdePct": 30,               // ISDE subsidie %
 *       "dumavaPct": 30,             // DUMAVA subsidie %
 *       "scePct": 0                  // SCE subsidie %
 *     }
 *   }
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';

/** Default-waardes — gebruikt als de tenant geen eigen instellingen heeft */
export const DEFAULT_INSTELLINGEN = {
  prijzen: {
    gasPerM3: 1.35,
    stroomPerKwh: 0.30,
    waterPerM3: 1.13,
  },
  vuistregels: {
    literPerDouche: 35,
    gasPerDouche: 0.5,
    literPerSpoeling: 6,
    co2GasPerM3: 1.78,
    co2StroomPerKwh: 0.34,
    primairFactorGas: 9.77,
  },
  subsidies: {
    isdePct: 30,
    dumavaPct: 30,
    scePct: 0,
  },
} as const;

const instellingenSchema = z.object({
  prijzen: z.object({
    gasPerM3: z.number().min(0).max(20),
    stroomPerKwh: z.number().min(0).max(5),
    waterPerM3: z.number().min(0).max(20),
  }).optional(),
  vuistregels: z.object({
    literPerDouche: z.number().min(0).max(200),
    gasPerDouche: z.number().min(0).max(10),
    literPerSpoeling: z.number().min(0).max(50),
    co2GasPerM3: z.number().min(0).max(10),
    co2StroomPerKwh: z.number().min(0).max(2),
    primairFactorGas: z.number().min(0).max(20),
  }).optional(),
  subsidies: z.object({
    isdePct: z.number().min(0).max(100),
    dumavaPct: z.number().min(0).max(100),
    scePct: z.number().min(0).max(100),
  }).optional(),
});

export default async function tenantInstellingenRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  // === Lezen — iedereen ===
  app.get('/tenant/instellingen', async (req) => {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.user!.tenantId },
      select: { instellingen: true },
    });
    const huidige = (tenant?.instellingen as Record<string, unknown>) ?? {};

    // Merge met defaults — zo krijg je áltijd alle velden terug
    return {
      instellingen: {
        prijzen: { ...DEFAULT_INSTELLINGEN.prijzen, ...((huidige.prijzen as Record<string, unknown>) ?? {}) },
        vuistregels: { ...DEFAULT_INSTELLINGEN.vuistregels, ...((huidige.vuistregels as Record<string, unknown>) ?? {}) },
        subsidies: { ...DEFAULT_INSTELLINGEN.subsidies, ...((huidige.subsidies as Record<string, unknown>) ?? {}) },
      },
      defaults: DEFAULT_INSTELLINGEN,
    };
  });

  // === Wijzigen — alleen beheerder ===
  app.patch('/tenant/instellingen', async (req, reply) => {
    if (req.user!.rol !== 'BEHEERDER') {
      return reply.code(403).send({ error: 'Alleen beheerders mogen instellingen wijzigen' });
    }

    const parsed = instellingenSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Ongeldige invoer', details: parsed.error.flatten() });
    }

    // Merge met huidige (zodat partial-updates werken)
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.user!.tenantId },
      select: { instellingen: true },
    });
    const huidige = (tenant?.instellingen as Record<string, unknown>) ?? {};

    const nieuw = {
      ...huidige,
      ...(parsed.data.prijzen ? { prijzen: parsed.data.prijzen } : {}),
      ...(parsed.data.vuistregels ? { vuistregels: parsed.data.vuistregels } : {}),
      ...(parsed.data.subsidies ? { subsidies: parsed.data.subsidies } : {}),
    };

    await prisma.tenant.update({
      where: { id: req.user!.tenantId },
      data: { instellingen: nieuw },
    });

    return { ok: true };
  });

  // === Reset naar defaults (beheerder) ===
  app.post('/tenant/instellingen/reset', async (req, reply) => {
    if (req.user!.rol !== 'BEHEERDER') {
      return reply.code(403).send({ error: 'Alleen beheerders mogen instellingen wijzigen' });
    }

    await prisma.tenant.update({
      where: { id: req.user!.tenantId },
      data: { instellingen: null },
    });

    return { ok: true };
  });
}
