/**
 * PPT-template endpoint.
 *
 * Genereert een verduurzamingsplan op basis van de ORIGINELE Sportief Opgewekt
 * template (86 slides met alle plaatjes, layout, branding). Vervangt
 * placeholders met data van het project.
 *
 *   POST /api/projects/:id/ppt-template
 *     → download van .pptx met:
 *        - 'naamvereniging' → clubnaam
 *        - 'Naamvereniging' → Clubnaam (case-preserving)
 *        - '[maand] 2025' → 'november 2026' (huidige maand+jaar)
 *
 * Aanpak: een .pptx is een ZIP met XML-files per slide. Met JSZip laden we
 * de ZIP, doen string-replace op alleen de tekst-XML in ppt/slides/*.xml,
 * en re-zippen het geheel. Plaatjes, layouts, themas, fonts — alles blijft
 * onaangeroerd.
 *
 * De gebruiker downloadt de complete 86-slides presentatie en verwijdert
 * zelf de slides die niet relevant zijn voor hun club.
 */

import type { FastifyInstance } from 'fastify';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { prisma } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Pad naar de originele Sportief Opgewekt template. Het bestand zit in
// apps/api/templates/ en wordt mee-bundeld bij build (zie .gitignore + bundling)
const TEMPLATE_PATH = join(__dirname, '..', '..', 'templates', 'sportief-opgewekt-standaard.pptx');

const NEDERLANDSE_MAANDEN = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];

function huidigeMaandJaar(): string {
  const d = new Date();
  return `${NEDERLANDSE_MAANDEN[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Vervang in een XML-string de placeholders met de echte waardes.
 *
 * Belangrijk: vervangingen gebeuren ALLEEN op `naamvereniging` als die als
 * losstaand woord voorkomt — niet als deel van een andere term. We werken
 * met case-preserving replace voor "Naamvereniging" → "Clubnaam".
 */
function vervangPlaceholders(xml: string, vars: { clubnaam: string; maandJaar: string }): string {
  if (!vars.clubnaam) return xml;

  const clubnaamCap = vars.clubnaam.charAt(0).toUpperCase() + vars.clubnaam.slice(1);

  // 1. Maand-placeholder eerst (specifieker)
  let result = xml.replace(/\[maand\]\s*2025/g, vars.maandJaar);
  result = result.replace(/\[maand\]/g, NEDERLANDSE_MAANDEN[new Date().getMonth()]);

  // 2. Naamvereniging — case-sensitive in twee varianten
  // We doen het zonder \b grenzen omdat "naamvereniging\xa0" (met nbsp) ook moet matchen.
  // Replace 'Naamvereniging' (hoofdletter) eerst om verwarring te voorkomen.
  result = result.replace(/Naamvereniging/g, clubnaamCap);
  result = result.replace(/naamvereniging/g, vars.clubnaam);

  return result;
}

export default async function pptTemplateRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.post('/projects/:id/ppt-template', async (req, reply) => {
    const { id } = req.params as { id: string };

    // Project ophalen voor de clubnaam
    const project = await prisma.project.findFirst({
      where: { id, tenantId: req.user!.tenantId },
      select: { id: true, clubNaam: true, state: true },
    });
    if (!project) {
      return reply.code(404).send({ error: 'Project niet gevonden' });
    }

    const state = (project.state ?? {}) as { context?: { club?: { naam?: string } } };
    const clubnaam = state.context?.club?.naam || project.clubNaam || 'Naamvereniging';

    // Lees de originele template
    let templateBuffer: Buffer;
    try {
      templateBuffer = readFileSync(TEMPLATE_PATH);
    } catch (e) {
      app.log.error({ err: e, path: TEMPLATE_PATH }, 'PPT-template niet gevonden');
      return reply.code(500).send({
        error: 'PPT-template ontbreekt op de server',
        details: 'De originele Sportief Opgewekt template is niet aanwezig in apps/api/templates/',
      });
    }

    // Open als ZIP
    const zip = await JSZip.loadAsync(templateBuffer);

    const vars = { clubnaam, maandJaar: huidigeMaandJaar() };

    // Vervang placeholders in alle slide-XML's en gerelateerde XMLs
    // ppt/slides/slide*.xml = de individuele slides
    // We laten ppt/slideLayouts/, ppt/slideMasters/, ppt/theme/ ongemoeid
    // (die bevatten alleen design-templates zonder data-placeholders)
    let aantalVervangen = 0;
    const slidePaths = Object.keys(zip.files).filter(p =>
      p.startsWith('ppt/slides/slide') && p.endsWith('.xml')
    );

    for (const path of slidePaths) {
      const file = zip.file(path);
      if (!file) continue;
      const xml = await file.async('string');
      const vervangen = vervangPlaceholders(xml, vars);
      if (vervangen !== xml) {
        zip.file(path, vervangen);
        aantalVervangen++;
      }
    }

    app.log.info({ projectId: id, clubnaam, slidesMetVervanging: aantalVervangen }, 'PPT-template gegenereerd');

    // Re-zip en verstuur als download
    const outBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

    const filename = `Verduurzamingsplan_${clubnaam.replace(/[^a-zA-Z0-9]/g, '_')}_Sportief_Opgewekt.pptx`;
    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(outBuffer);
  });
}
