/**
 * Downloads-route — serveert statische bestanden uit `apps/api/templates/`
 * als download. Wordt o.a. gebruikt voor de Verduurzamingsreis-PPT die
 * vanuit de kennisbank gedownload kan worden.
 *
 *   GET /downloads/verduurzamingsreis.pptx
 *
 * Veilig: alléén een whitelist van bekende bestanden wordt geserveerd —
 * geen pad-traversal mogelijk.
 */

import type { FastifyInstance } from 'fastify';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const TEMPLATE_DIR = join(process.cwd(), 'templates');

/** Whitelist: alleen deze bestanden mogen via /downloads geserveerd worden. */
const TOEGESTANE_BESTANDEN: Record<string, { bestandsnaam: string; mimeType: string }> = {
  'verduurzamingsreis.pptx': {
    bestandsnaam: 'Verduurzamingsreis - Op Naar Nul.pptx',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  },
};

export default async function downloadsRoutes(app: FastifyInstance) {
  // Auth blijft vereist — anders kunnen externen het bestand binnenharken
  app.addHook('preHandler', app.requireAuth);

  app.get('/downloads/:bestand', async (req, reply) => {
    const { bestand } = req.params as { bestand: string };
    const config = TOEGESTANE_BESTANDEN[bestand];
    if (!config) {
      return reply.code(404).send({ error: 'Bestand niet beschikbaar' });
    }

    const pad = join(TEMPLATE_DIR, bestand);
    try {
      statSync(pad); // throws als niet bestaat
      const buffer = readFileSync(pad);
      const veiligeBestandsnaam = encodeURIComponent(config.bestandsnaam);
      return reply
        .header('Content-Type', config.mimeType)
        .header(
          'Content-Disposition',
          `attachment; filename*=UTF-8''${veiligeBestandsnaam}`,
        )
        .send(buffer);
    } catch (e) {
      app.log.error({ err: e, pad }, 'Download-bestand niet vindbaar op server');
      return reply.code(404).send({
        error: 'Bestand niet aanwezig op server',
        details: `Het bestand ${bestand} ontbreekt in apps/api/templates/. Upload het naar de server.`,
      });
    }
  });
}
