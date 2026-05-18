/**
 * Auth-routes: login, logout, me.
 *
 * GEEN registratie-route — accounts worden alleen door BEHEERDER
 * aangemaakt of via seed-script.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import {
  hashWachtwoord,
  verifieerWachtwoord,
  wisSessieCookie,
  zetSessieCookie,
} from '../plugins/auth.js';

const loginSchema = z.object({
  email: z.string().email(),
  wachtwoord: z.string().min(1),
  // Voor multi-tenant SSO via slug. Zonder slug: kijk in alle tenants
  // (in praktijk vaak unieke email).
  tenantSlug: z.string().optional(),
});

export default async function authRoutes(app: FastifyInstance) {
  app.post('/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Ongeldige invoer', details: parsed.error.flatten() });
    }
    const { email, wachtwoord, tenantSlug } = parsed.data;

    const where = tenantSlug
      ? { email, tenant: { slug: tenantSlug } }
      : { email };

    const gebruiker = await prisma.user.findFirst({
      where,
      include: { tenant: true },
    });

    // Belangrijk: zelfde response-tijd ongeacht of user bestaat,
    // om timing-attacks te bemoeilijken.
    const dummy = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdA$abcdef';
    const valid = gebruiker
      ? await verifieerWachtwoord(gebruiker.passwordHash, wachtwoord)
      : await verifieerWachtwoord(dummy, wachtwoord);

    if (!gebruiker || !valid) {
      return reply.code(401).send({ error: 'Onjuiste inloggegevens' });
    }

    await prisma.user.update({
      where: { id: gebruiker.id },
      data: { laatsteLogin: new Date() },
    });

    zetSessieCookie(reply, {
      sub: gebruiker.id,
      tenantId: gebruiker.tenantId,
      rol: gebruiker.rol,
    });

    return {
      gebruiker: {
        id: gebruiker.id,
        email: gebruiker.email,
        naam: gebruiker.naam,
        rol: gebruiker.rol,
      },
      tenant: {
        id: gebruiker.tenant.id,
        slug: gebruiker.tenant.slug,
        naam: gebruiker.tenant.naam,
      },
    };
  });

  app.post('/logout', async (_req, reply) => {
    wisSessieCookie(reply);
    return { ok: true };
  });

  app.get('/me', { preHandler: app.requireAuth }, async (req) => {
    const gebruiker = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.sub },
      include: { tenant: true },
    });
    return {
      gebruiker: {
        id: gebruiker.id,
        email: gebruiker.email,
        naam: gebruiker.naam,
        rol: gebruiker.rol,
      },
      tenant: {
        id: gebruiker.tenant.id,
        slug: gebruiker.tenant.slug,
        naam: gebruiker.tenant.naam,
        branding: gebruiker.tenant.branding,
      },
    };
  });

  // BEHEERDER-only: gebruiker aanmaken binnen eigen tenant.
  const createUserSchema = z.object({
    email: z.string().email(),
    wachtwoord: z.string().min(12),
    naam: z.string().min(1),
    rol: z.enum(['ADVISEUR', 'BEHEERDER']).default('ADVISEUR'),
  });
  app.post('/users', { preHandler: app.requireBeheerder }, async (req, reply) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Ongeldige invoer', details: parsed.error.flatten() });
    }
    const { email, wachtwoord, naam, rol } = parsed.data;

    const bestaat = await prisma.user.findFirst({
      where: { tenantId: req.user!.tenantId, email },
    });
    if (bestaat) {
      return reply.code(409).send({ error: 'Email bestaat al binnen tenant' });
    }

    const gebruiker = await prisma.user.create({
      data: {
        tenantId: req.user!.tenantId,
        email,
        naam,
        rol,
        passwordHash: await hashWachtwoord(wachtwoord),
      },
    });

    return {
      id: gebruiker.id,
      email: gebruiker.email,
      naam: gebruiker.naam,
      rol: gebruiker.rol,
    };
  });
}

// Exporteer ook hashWachtwoord voor seed-script
export { hashWachtwoord };
