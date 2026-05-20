/**
 * User-management endpoints — alleen toegankelijk voor admins.
 *
 *   GET    /users           lijst gebruikers (eigen tenant)
 *   POST   /users           maak nieuwe gebruiker
 *   PATCH  /users/:id       wijzig naam/rol/wachtwoord
 *   DELETE /users/:id       verwijder gebruiker (niet jezelf)
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import argon2 from 'argon2';
import { prisma } from '../db.js';

const createUserSchema = z.object({
  email: z.string().email().max(200),
  naam: z.string().min(1).max(100),
  wachtwoord: z.string().min(8).max(200),
  rol: z.enum(['BEHEERDER', 'ADVISEUR']).default('ADVISEUR'),
});

const updateUserSchema = z.object({
  naam: z.string().min(1).max(100).optional(),
  rol: z.enum(['BEHEERDER', 'ADVISEUR']).optional(),
  wachtwoord: z.string().min(8).max(200).optional(),
});

/**
 * Helper: alleen BEHEERDER mag user-management doen.
 */
function vereisBeheerder(req: { user?: { rol?: string } }, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) {
  if (req.user?.rol !== 'BEHEERDER') {
    reply.code(403).send({ error: 'Alleen beheerders mogen accounts beheren' });
    return false;
  }
  return true;
}

export default async function usersRoutes(app: FastifyInstance) {
  // Alle user-routes vereisen auth
  app.addHook('preHandler', app.requireAuth);

  // ===== Lijst =====
  app.get('/users', async (req, reply) => {
    if (!vereisBeheerder(req, reply)) return;

    const lijst = await prisma.user.findMany({
      where: { tenantId: req.user!.tenantId },
      select: {
        id: true,
        email: true,
        naam: true,
        rol: true,
        createdAt: true,
        laatsteLogin: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    return { gebruikers: lijst };
  });

  // ===== Aanmaken =====
  app.post('/users', async (req, reply) => {
    if (!vereisBeheerder(req, reply)) return;

    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Ongeldige invoer', details: parsed.error.flatten() });
    }

    // Email mag niet al bestaan binnen dezelfde tenant
    const dup = await prisma.user.findFirst({
      where: { email: parsed.data.email.toLowerCase(), tenantId: req.user!.tenantId },
      select: { id: true },
    });
    if (dup) {
      return reply.code(409).send({ error: 'Een gebruiker met dit e-mailadres bestaat al' });
    }

    const passwordHash = await argon2.hash(parsed.data.wachtwoord);

    const gebruiker = await prisma.user.create({
      data: {
        email: parsed.data.email.toLowerCase(),
        naam: parsed.data.naam,
        passwordHash,
        rol: parsed.data.rol,
        tenantId: req.user!.tenantId,
      },
      select: { id: true, email: true, naam: true, rol: true, createdAt: true },
    });

    return reply.code(201).send({ gebruiker });
  });

  // ===== Wijzigen =====
  app.patch('/users/:id', async (req, reply) => {
    if (!vereisBeheerder(req, reply)) return;

    const { id } = req.params as { id: string };
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Ongeldige invoer', details: parsed.error.flatten() });
    }

    const bestaat = await prisma.user.findFirst({
      where: { id, tenantId: req.user!.tenantId },
      select: { id: true, rol: true },
    });
    if (!bestaat) return reply.code(404).send({ error: 'Gebruiker niet gevonden' });

    // Veiligheid: een beheerder mag niet zichzelf degraderen tot non-beheerder
    if (bestaat.id === req.user!.sub && parsed.data.rol && parsed.data.rol !== 'BEHEERDER') {
      return reply.code(400).send({ error: 'Je kunt jezelf niet degraderen' });
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.naam !== undefined) data.naam = parsed.data.naam;
    if (parsed.data.rol !== undefined) data.rol = parsed.data.rol;
    if (parsed.data.wachtwoord !== undefined) {
      data.passwordHash = await argon2.hash(parsed.data.wachtwoord);
    }

    const gebruiker = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, naam: true, rol: true },
    });

    return { gebruiker };
  });

  // ===== Verwijderen =====
  app.delete('/users/:id', async (req, reply) => {
    if (!vereisBeheerder(req, reply)) return;

    const { id } = req.params as { id: string };

    // Een beheerder mag niet zichzelf verwijderen
    if (id === req.user!.sub) {
      return reply.code(400).send({ error: 'Je kunt jezelf niet verwijderen' });
    }

    const bestaat = await prisma.user.findFirst({
      where: { id, tenantId: req.user!.tenantId },
      select: { id: true },
    });
    if (!bestaat) return reply.code(404).send({ error: 'Gebruiker niet gevonden' });

    // Check of er nog projecten zijn van deze gebruiker — die moeten eerst gemigreerd
    const projecten = await prisma.project.count({
      where: { eigenaarId: id, status: { not: 'GEARCHIVEERD' } },
    });
    if (projecten > 0) {
      return reply.code(409).send({
        error: 'Deze gebruiker heeft nog actieve projecten',
        message: `Gebruiker heeft ${projecten} actieve project(en). Archiveer of draag eerst over.`,
      });
    }

    await prisma.user.delete({ where: { id } });
    return { ok: true };
  });
}
