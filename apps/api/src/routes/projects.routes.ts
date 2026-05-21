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

// Prisma Json-velden accepteren `unknown` data; we casten via `any` om de
// fout-uitvoerige Prisma-types te omzeilen. Het rekenmodel valideert zelf
// de inhoud van de state-objecten.
type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const projectStateSchema = z.object({
  context: z.any(),       // ProjectContext — calc-core valideert ons niet, we vertrouwen JSONB
  gekozenMaatregelen: z.record(z.string(), z.any()),  // { [maatregelId]: input }
}).passthrough();  // ⚠️ KRITIEK: laat overige velden door (locatie, huidigeSituatie, trainingsSchema, fotos, fase, berekendResultaat, logo)

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
        state: true,  // bevat logo — alleen logo extraheren in mapping hieronder
        eigenaar: { select: { id: true, naam: true } },
      },
      take: 200,
    });
    // Extract logo, fase en woonplaats uit de state (rest blijft op de server).
    const projecten = lijst.map((p: typeof lijst[number]) => {
      const state = (p.state as {
        logo?: { dataUrl?: string; bestandsnaam?: string };
        locatie?: { woonplaats?: string; adres?: string };
        lifecycle?: string;
      }) ?? {};
      return {
        id: p.id,
        clubNaam: p.clubNaam,
        status: p.status,
        postcode: p.postcode,
        huisnummer: p.huisnummer,
        updatedAt: p.updatedAt,
        eigenaar: p.eigenaar,
        logo: state.logo ? { dataUrl: state.logo.dataUrl, bestandsnaam: state.logo.bestandsnaam } : null,
        woonplaats: state.locatie?.woonplaats ?? null,
        lifecycle: state.lifecycle ?? null,
      };
    });
    return { projecten };
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
        state: parsed.data.state as Json,
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
    const { state, ...overigeData } = parsed.data;
    const project = await prisma.project.update({
      where: { id },
      data: {
        ...overigeData,
        ...(state !== undefined ? { state: state as Json } : {}),
        ...(cacheInvalid ? { cachedResult: null as Json, cachedAt: null } : {}),
      },
    });
    return project;
  });

  /**
   * DEDICATED locatie-endpoint — voor zekerheid. Hier kan niets verloren gaan:
   * we lezen de huidige state, mergen alleen `locatie` (en optioneel
   * gebouw-velden uit BAG zoals bouwjaar/bvo) erin, en schrijven die terug.
   *
   * Dit voorkomt elke vorm van race-condition met de gewone PUT-flow.
   */
  app.patch('/projects/:id/locatie', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      locatie: Record<string, unknown>;
      gebouwPatch?: Record<string, unknown>;  // bouwjaar/bvo/bouwhoogte uit BAG
    };

    if (!body?.locatie || typeof body.locatie !== 'object') {
      return reply.code(400).send({ error: 'locatie verplicht in body' });
    }

    const project = await prisma.project.findFirst({
      where: { id, tenantId: req.user!.tenantId },
    });
    if (!project) return reply.code(404).send({ error: 'Niet gevonden' });

    const huidigeState = (project.state as Record<string, unknown>) ?? {};
    const huidigeContext = (huidigeState.context as Record<string, unknown>) ?? {};
    const huidigeGebouw = (huidigeContext.gebouw as Record<string, unknown>) ?? {};

    const nieuweState = {
      ...huidigeState,
      locatie: body.locatie,
      ...(body.gebouwPatch ? {
        context: {
          ...huidigeContext,
          gebouw: { ...huidigeGebouw, ...body.gebouwPatch },
        },
      } : {}),
    };

    // Ook de top-level kolommen postcode/huisnummer updaten zodat het
    // adres zichtbaar is in het projectenoverzicht
    const lokatieRec = body.locatie as { postcode?: string; huisnummer?: number | string };
    const topLevelUpdates: Record<string, string> = {};
    if (lokatieRec.postcode && typeof lokatieRec.postcode === 'string') {
      topLevelUpdates.postcode = lokatieRec.postcode;
    }
    if (lokatieRec.huisnummer !== undefined && lokatieRec.huisnummer !== null) {
      topLevelUpdates.huisnummer = String(lokatieRec.huisnummer);
    }

    const updated = await prisma.project.update({
      where: { id },
      data: {
        ...topLevelUpdates,
        state: nieuweState as Json,
        cachedResult: null as Json,
        cachedAt: null,
      },
      select: { id: true, state: true, postcode: true, huisnummer: true, updatedAt: true },
    });

    app.log.info(
      { projectId: id, locatieAdres: (body.locatie as { adres?: string }).adres },
      'Locatie opgeslagen via dedicated endpoint',
    );

    return { ok: true, project: updated };
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
