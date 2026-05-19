/**
 * Project-routes.
 *
 * Endpoints:
 *   GET    /projects              lijst (eigen tenant)
 *   POST   /projects              nieuw
 *   GET    /projects/:id          één project + cached result
 *   PUT    /projects/:id          state updaten + cache invalideren
 *   DELETE /projects/:id          archiveren (status → GEARCHIVEERD)
 *   POST   /projects/:id/bereken  forceer herberekening + cache vullen
 *
 * Alle queries filteren op tenantId uit de auth-context.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { berekenProject } from '../services/bereken.service.js';

const projectStateSchema = z.object({
  context: z.any(),       // ProjectContext — calc-core valideert ons niet, we vertrouwen JSONB
  gekozenMaatregelen: z.record(z.string(), z.any()),  // { [maatregelId]: input }
});

const createProjectSchema = z.object({
  clubNaam: z.string().min(1).max(200),
  postcode: z.string().regex(/^\d{4}\s?[A-Z]{2}$/i).optional(),
  huisnummer: z.string().max(20).optional(),
  state: projectStateSchema,
});

const updateProjectSchema = z.object({
  clubNaam: z.string().min(1).max(200).optional(),
  postcode: z.string().regex(/^\d{4}\s?[A-Z]{2}$/i).optional(),
  huisnummer: z.string().max(20).optional(),
  status: z.enum(['DRAFT', 'IN_PROGRESS', 'AFGEROND', 'GEARCHIVEERD']).optional(),
  state: projectStateSchema.optional(),
});

export default async function projectsRoutes(app: FastifyInstance) {
  // Alle project-routes vereisen auth
  app.addHook('preHandler', app.requireAuth);

  app.get('/projects', async (req) => {
    const lijst = await prisma.project.findMany({
      where: {
        tenantId: req.user!.tenantId,
        status: { not: 'GEARCHIVEERD' },
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        clubNaam: true,
        status: true,
        postcode: true,
        huisnummer: true,
        updatedAt: true,
        eigenaar: { select: { id: true, naam: true } },
      },
      take: 200,
    });
    return { projecten: lijst };
  });

  app.post('/projects', async (req, reply) => {
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Ongeldige invoer', details: parsed.error.flatten() });
    }

    const project = await prisma.project.create({
      data: {
        tenantId: req.user!.tenantId,
        eigenaarId: req.user!.sub,
        clubNaam: parsed.data.clubNaam,
        postcode: parsed.data.postcode,
        huisnummer: parsed.data.huisnummer,
        state: parsed.data.state,
      },
    });

    return reply.code(201).send(project);
  });

  app.get('/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = await prisma.project.findFirst({
      where: { id, tenantId: req.user!.tenantId },
    });
    if (!project) return reply.code(404).send({ error: 'Niet gevonden' });
    return project;
  });

  app.put('/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Ongeldige invoer', details: parsed.error.flatten() });
    }

    const bestaat = await prisma.project.findFirst({
      where: { id, tenantId: req.user!.tenantId },
      select: { id: true },
    });
    if (!bestaat) return reply.code(404).send({ error: 'Niet gevonden' });

    // Cache invalideren bij state-mutatie
    const cacheInvalid = parsed.data.state !== undefined;
    const project = await prisma.project.update({
      where: { id },
      data: {
        ...parsed.data,
        ...(cacheInvalid ? { cachedResult: null, cachedAt: null } : {}),
      },
    });
    return project;
  });

  app.delete('/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const bestaat = await prisma.project.findFirst({
      where: { id, tenantId: req.user!.tenantId },
      select: { id: true },
    });
    if (!bestaat) return reply.code(404).send({ error: 'Niet gevonden' });

    await prisma.project.update({
      where: { id },
      data: { status: 'GEARCHIVEERD' },
    });
    return { ok: true };
  });

  app.post('/projects/:id/bereken', async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = await prisma.project.findFirst({
      where: { id, tenantId: req.user!.tenantId },
    });
    if (!project) return reply.code(404).send({ error: 'Niet gevonden' });

    try {
      const resultaat = berekenProject(project.state as unknown);
      const updated = await prisma.project.update({
        where: { id },
        data: {
          cachedResult: resultaat as never,
          cachedAt: new Date(),
        },
      });
      return updated.cachedResult;
    } catch (err: unknown) {
      // Specifieke validatie-fout (ontbrekende velden) → 400 met details
      if (err && typeof err === 'object' && err.constructor.name === 'BerekenValidatieFout') {
        const ontbrekend = (err as { ontbrekendeVelden?: string[] }).ontbrekendeVelden ?? [];
        return reply.code(400).send({
          error: 'Vul eerst alle vereiste velden in',
          message: `Ontbreekt: ${ontbrekend.join(', ')}`,
          ontbrekendeVelden: ontbrekend,
        });
      }
      app.log.error({ err, projectId: id }, 'Berekening mislukt');
      return reply.code(500).send({
        error: 'Berekening mislukt',
        message: err instanceof Error ? err.message : 'Onbekende fout',
      });
    }
  });
}
