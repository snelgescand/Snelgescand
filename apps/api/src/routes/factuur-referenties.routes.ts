/**
 * Factuur-referentie API — kennisbank van eerdere offerte/factuur-bedragen.
 *
 * Tekst-only opslag (geen PDF-uploads), per tenant afgeschermd.
 * - GET    /factuur-referenties              → alle voor deze tenant (ingelogd)
 * - POST   /factuur-referenties              → nieuwe toevoegen (BEHEERDER)
 * - PUT    /factuur-referenties/:id          → bewerken (BEHEERDER)
 * - DELETE /factuur-referenties/:id          → verwijderen (BEHEERDER)
 *
 * Bedoeld als snelle interne raadpleging: "wat kostte een Q-ton HMA30A in 2024?"
 * Bestanden zelf (PDF's) horen niet hier — die zijn vertrouwelijk en bewaar je elders.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';

/** Categorieën — vrij invulbaar, maar deze suggesties helpen consistentie. */
export const FACTUUR_CATEGORIEEN = [
  'qton',
  'lmnt',
  'lucht-water-wp',
  'warmtepompboiler',
  'pv-zonnepanelen',
  'pvt',
  'batterij',
  'isolatie-dak',
  'isolatie-gevel',
  'isolatie-vloer',
  'beglazing',
  'kierdichting',
  'veldverlichting',
  'binnenverlichting',
  'ventilatie',
  'wtw',
  'overig',
] as const;

const factuurSchema = z.object({
  categorie: z.string().min(1).max(50),
  leverancier: z.string().min(1).max(200),
  jaar: z.number().int().min(2000).max(2100),
  bedrag: z.number().int().min(0).max(10_000_000), // tot 10M, ruim genoeg
  toelichting: z.string().max(1000).optional().nullable(),
});

export default async function factuurReferentiesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  // === Lezen — iedereen ingelogd binnen tenant ===
  app.get('/factuur-referenties', async (req) => {
    const rows = await prisma.factuurReferentie.findMany({
      where: { tenantId: req.user!.tenantId },
      orderBy: [{ categorie: 'asc' }, { jaar: 'desc' }, { createdAt: 'desc' }],
    });
    return { referenties: rows, categorieen: FACTUUR_CATEGORIEEN };
  });

  // === Aanmaken — alleen BEHEERDER ===
  app.post('/factuur-referenties', async (req, reply) => {
    if (req.user!.rol !== 'BEHEERDER') {
      return reply.code(403).send({ error: 'Alleen beheerders mogen factuur-referenties toevoegen' });
    }
    const parsed = factuurSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Ongeldige invoer', details: parsed.error.flatten() });
    }
    const created = await prisma.factuurReferentie.create({
      data: {
        ...parsed.data,
        tenantId: req.user!.tenantId,
        invoerderId: req.user!.sub,
      },
    });
    return { referentie: created };
  });

  // === Bewerken — alleen BEHEERDER, alleen binnen eigen tenant ===
  app.put<{ Params: { id: string } }>('/factuur-referenties/:id', async (req, reply) => {
    if (req.user!.rol !== 'BEHEERDER') {
      return reply.code(403).send({ error: 'Alleen beheerders mogen factuur-referenties bewerken' });
    }
    const parsed = factuurSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Ongeldige invoer', details: parsed.error.flatten() });
    }
    // Eerst controleren of de referentie bij deze tenant hoort (tenant-isolatie)
    const bestaand = await prisma.factuurReferentie.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!bestaand) {
      return reply.code(404).send({ error: 'Niet gevonden' });
    }
    const updated = await prisma.factuurReferentie.update({
      where: { id: req.params.id },
      data: parsed.data,
    });
    return { referentie: updated };
  });

  // === Verwijderen — alleen BEHEERDER, alleen binnen eigen tenant ===
  app.delete<{ Params: { id: string } }>('/factuur-referenties/:id', async (req, reply) => {
    if (req.user!.rol !== 'BEHEERDER') {
      return reply.code(403).send({ error: 'Alleen beheerders mogen factuur-referenties verwijderen' });
    }
    const bestaand = await prisma.factuurReferentie.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!bestaand) {
      return reply.code(404).send({ error: 'Niet gevonden' });
    }
    await prisma.factuurReferentie.delete({ where: { id: req.params.id } });
    return { ok: true };
  });
}
