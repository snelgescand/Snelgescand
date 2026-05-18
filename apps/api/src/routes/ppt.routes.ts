/**
 * PPT-export route.
 *
 * Synchroon model voor MVP: API spawnt python-pptx sidecar, streamt het
 * resultaat direct naar de client als .pptx download. Geen background job,
 * geen BullMQ, geen status-polling. Dat komt pas als rendering > 5 sec
 * gaat duren (sprint 7+).
 *
 * Beveiliging:
 *   - Vereist auth
 *   - Project moet bij dezelfde tenant horen
 *   - Sidecar krijgt alleen project-data, geen env/secrets
 */

import type { FastifyInstance } from 'fastify';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../db.js';
import { berekenProject } from '../services/bereken.service.js';
import { getConfig } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// scripts/ ligt naast src/ in de api-package
const SCRIPTS_DIR = path.resolve(__dirname, '..', '..', 'scripts');
const DEFAULT_TEMPLATE = path.join(SCRIPTS_DIR, 'TEMPLATE_v2.pptx');

export default async function pptRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.post('/projects/:id/ppt', async (req, reply) => {
    const { id } = req.params as { id: string };
    const cfg = getConfig();

    const project = await prisma.project.findFirst({
      where: { id, tenantId: req.user!.tenantId },
    });
    if (!project) return reply.code(404).send({ error: 'Niet gevonden' });

    // Bereken het project on-the-fly (negeer cache, willen verse output)
    let resultaat: unknown;
    try {
      resultaat = berekenProject(project.state as unknown);
    } catch (err: unknown) {
      return reply.code(400).send({
        error: 'Berekening mislukt voor PPT-export',
        message: err instanceof Error ? err.message : String(err),
      });
    }

    // Bouw de payload die de python sidecar verwacht
    const state = project.state as { context?: unknown };
    const payload = {
      context: state.context ?? {},
      rollup: (resultaat as { rollup: unknown }).rollup,
      perMaatregel: (resultaat as { perMaatregel: unknown }).perMaatregel,
      project: {
        id: project.id,
        clubNaam: project.clubNaam,
        status: project.status,
      },
    };

    // Spawn sidecar
    const scriptPath = path.join(SCRIPTS_DIR, 'generate_pptx.py');
    const templatePath = (cfg.PPTX_SIDECAR_SCRIPT as string).endsWith('.pptx')
      ? cfg.PPTX_SIDECAR_SCRIPT
      : DEFAULT_TEMPLATE;

    const proc = spawn('python3', [scriptPath, templatePath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Stuur JSON naar stdin
    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();

    // Verzamel stderr voor diagnostiek
    let stderrBuf = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString();
    });

    // Verzamel stdout (de .pptx bytes) in een buffer
    const chunks: Buffer[] = [];
    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));

    const exitCode: number = await new Promise(resolve => {
      proc.on('close', code => resolve(code ?? -1));
      proc.on('error', () => resolve(-1));
    });

    if (exitCode !== 0) {
      req.log.error({ exitCode, stderr: stderrBuf, projectId: id }, 'PPT generator faalde');
      return reply.code(500).send({
        error: 'PPT-export mislukt',
        details: stderrBuf.slice(0, 500),
      });
    }

    const pptxBuffer = Buffer.concat(chunks);

    // Log de export (optioneel: PptExport-row aanmaken voor audit)
    await prisma.pptExport.create({
      data: {
        projectId: project.id,
        status: 'KLAAR',
        fileSizeBytes: pptxBuffer.length,
        klaarOp: new Date(),
      },
    });

    const veiligeNaam = project.clubNaam.replace(/[^a-zA-Z0-9-]+/g, '_').slice(0, 50);
    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
      .header('Content-Disposition', `attachment; filename="Verduurzamingsplan_${veiligeNaam}.pptx"`)
      .send(pptxBuffer);
  });
}
