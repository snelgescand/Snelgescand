/**
 * PPT-export — pure Node-implementatie met pptxgenjs.
 *
 * Geen python sidecar nodig (werkt niet op Render free tier). Maakt
 * een rapport-presentatie on-the-fly met de Op Naar Nul-stijl.
 *
 * Inhoud van het rapport:
 *  - Voorblad (clubnaam + datum)
 *  - Uitgangspunten (bouwjaar, BVO, gas, stroom, prijzen)
 *  - Huidige situatie (checklist-items met status)
 *  - Per maatregel: investering, subsidie, besparing, TVT, CO₂
 *  - Voor de penningmeester (totaalrollup)
 *  - Aanbevelingen / volgende stappen
 *
 * Op een latere sprint: vervang door python-pptx sidecar als Bart een
 * eigen template wil gebruiken.
 */

import type { FastifyInstance } from 'fastify';
import PptxGenJS from 'pptxgenjs';
import { prisma } from '../db.js';
import { berekenProject, BerekenValidatieFout } from '../services/bereken.service.js';

// ONN-kleuren (hex zonder #)
const ONN_TEAL = '006579';
const ONN_DONKER = '042D34';
const ONN_ORANJE = 'DE533E';
const ONN_CREME = 'FFEFCE';
const ONN_GRIJS = '64748B';

export default async function pptRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.post('/projects/:id/ppt', async (req, reply) => {
    const { id } = req.params as { id: string };

    const project = await prisma.project.findFirst({
      where: { id, tenantId: req.user!.tenantId },
    });
    if (!project) return reply.code(404).send({ error: 'Niet gevonden' });

    // Bereken eerst (negeer cache — willen verse data)
    let berekend;
    try {
      berekend = berekenProject(project.state as unknown);
    } catch (err: unknown) {
      if (err instanceof BerekenValidatieFout) {
        return reply.code(400).send({
          error: 'Vul eerst alle vereiste velden in voordat je exporteert',
          message: err.message,
        });
      }
      app.log.error({ err, projectId: id }, 'PPT bereken-stap mislukt');
      return reply.code(500).send({
        error: 'Berekening voor PPT mislukt',
        message: err instanceof Error ? err.message : String(err),
      });
    }

    try {
      const state = project.state as Record<string, unknown>;
      const buffer = await maakPresentatie({
        clubNaam: project.clubNaam,
        state,
        berekend,
      });

      const veiligeNaam = project.clubNaam.replace(/[^a-zA-Z0-9-]+/g, '_').slice(0, 50);

      // Audit
      await prisma.pptExport.create({
        data: {
          projectId: project.id,
          status: 'KLAAR',
          fileSizeBytes: buffer.length,
          klaarOp: new Date(),
        },
      });

      return reply
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
        .header('Content-Disposition', `attachment; filename="Verduurzamingsplan_${veiligeNaam}.pptx"`)
        .send(buffer);
    } catch (err: unknown) {
      app.log.error({ err, projectId: id }, 'PPT generatie mislukt');
      return reply.code(500).send({
        error: 'PowerPoint-export mislukt',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

// ============================================================
// Presentatie-generator
// ============================================================

interface PresentatieInput {
  clubNaam: string;
  state: Record<string, unknown>;
  berekend: ReturnType<typeof berekenProject>;
}

async function maakPresentatie({ clubNaam, state, berekend }: PresentatieInput): Promise<Buffer> {
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';
  pres.title = `Verduurzamingsplan ${clubNaam}`;
  pres.author = 'Op Naar Nul';
  pres.company = 'Op Naar Nul';

  const context = (state.context as Record<string, Record<string, unknown>> | undefined) ?? {};
  const gebouw = context.gebouw ?? {};
  const energie = context.energie ?? {};
  const locatie = (state.locatie as Record<string, unknown> | undefined) ?? {};
  const huidigeSituatie = (state.huidigeSituatie as Record<string, { status: string; notitie?: string }> | undefined) ?? {};

  // Slide 1 — Voorblad
  const s1 = pres.addSlide();
  s1.background = { color: ONN_CREME };
  s1.addText('Verduurzamingsplan', { x: 0.5, y: 0.5, w: 12, h: 0.6, fontSize: 18, color: ONN_GRIJS });
  s1.addText(clubNaam, { x: 0.5, y: 1.2, w: 12, h: 1.5, fontSize: 54, bold: true, color: ONN_TEAL, fontFace: 'Calibri' });
  if (locatie.adres) {
    s1.addText(String(locatie.adres), { x: 0.5, y: 2.6, w: 12, h: 0.4, fontSize: 14, color: ONN_DONKER });
  }
  s1.addText(`Opgesteld: ${new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    { x: 0.5, y: 6.8, w: 12, h: 0.3, fontSize: 11, color: ONN_GRIJS });
  s1.addText('Op Naar Nul · Snelgescand.nl', { x: 0.5, y: 7.1, w: 12, h: 0.3, fontSize: 11, color: ONN_TEAL });

  // Slide 2 — Uitgangspunten
  const s2 = pres.addSlide();
  s2.background = { color: 'FFFFFF' };
  addSlideHeader(s2, 'Uitgangspunten');
  const ugRows: Array<[string, string]> = [
    ['Bouwjaar clubhuis', gebouw.bouwjaar ? String(gebouw.bouwjaar) : '—'],
    ['Bruto vloeroppervlak', gebouw.bvoTotaalM2 ? `${gebouw.bvoTotaalM2} m²` : '—'],
    ['Plafondhoogte', gebouw.plafondhoogteM ? `${gebouw.plafondhoogteM} m` : '—'],
    ['Gasverbruik per jaar', energie.gasverbruikM3 ? `${formatGetal(energie.gasverbruikM3 as number)} m³` : '—'],
    ['Stroomverbruik per jaar', energie.stroomverbruikTotaalKwh ? `${formatGetal(energie.stroomverbruikTotaalKwh as number)} kWh` : '—'],
    ['Gasprijs', energie.gasprijsPerM3 ? `€ ${(energie.gasprijsPerM3 as number).toFixed(2)} / m³` : '—'],
    ['Stroomprijs', energie.stroomprijsKaalPerKwh ? `€ ${(energie.stroomprijsKaalPerKwh as number).toFixed(2)} / kWh` : '—'],
  ];
  addLabelValueRows(s2, ugRows, 0.7, 1.6, 5.5);

  // Slide 3 — Huidige situatie (indien ingevuld)
  const ingevuld = Object.values(huidigeSituatie).filter(v => v?.status && v.status !== 'onbekend');
  if (ingevuld.length > 0) {
    const s3 = pres.addSlide();
    s3.background = { color: 'FFFFFF' };
    addSlideHeader(s3, 'Huidige situatie');
    const goed = Object.entries(huidigeSituatie).filter(([_, v]) => v?.status === 'goed').map(([k]) => k);
    const aandacht = Object.entries(huidigeSituatie).filter(([_, v]) => v?.status === 'matig' || v?.status === 'slecht');

    if (goed.length > 0) {
      s3.addText('✓ Wat al goed gaat', { x: 0.7, y: 1.6, w: 6, h: 0.4, fontSize: 16, bold: true, color: ONN_TEAL });
      s3.addText(goed.map(k => `• ${formatItemId(k)}`).join('\n'),
        { x: 0.7, y: 2.0, w: 6, h: 4.5, fontSize: 13, color: ONN_DONKER, valign: 'top' });
    }
    if (aandacht.length > 0) {
      s3.addText('⚠ Aandachtspunten', { x: 7.0, y: 1.6, w: 6, h: 0.4, fontSize: 16, bold: true, color: ONN_ORANJE });
      const aandachtTekst = aandacht.map(([k, v]) => {
        const label = formatItemId(k);
        const notitie = v.notitie ? ` — ${v.notitie}` : '';
        return `• ${label}${notitie}`;
      }).join('\n');
      s3.addText(aandachtTekst, { x: 7.0, y: 2.0, w: 6, h: 4.5, fontSize: 13, color: ONN_DONKER, valign: 'top' });
    }
  }

  // Slide 4 — Voor de penningmeester
  const r = berekend.rollup;
  const s4 = pres.addSlide();
  s4.background = { color: 'FFFFFF' };
  addSlideHeader(s4, 'Voor de penningmeester');
  const penRows: Array<[string, string]> = [
    ['Bruto investering', `€ ${formatGetal(r.totaleInvestering)}`],
    ['Totale subsidies', `€ ${formatGetal(r.totaleSubsidie)}`],
    ['Netto investering', `€ ${formatGetal(r.nettoInvestering)}`],
    ['Besparing per jaar', `€ ${formatGetal(r.totaleBesparingPerJaar)}`],
    ['Gemiddelde TVT', formatTVT(r.gemiddeldeTerugverdientijdJaren)],
    ['CO₂-besparing', `${(r.totaleCo2BesparingKg / 1000).toFixed(1)} ton/jaar`],
    ['Aansluitwaarde voldoende?', r.aansluitwaardeVoldoende ? 'Ja' : 'Nee'],
  ];
  addLabelValueRows(s4, penRows, 0.7, 1.6, 5.5, true);

  // Slide(s) per maatregel
  for (const [maatregelId, resultaat] of Object.entries(berekend.perMaatregel)) {
    if (!resultaat) continue;
    const s = pres.addSlide();
    s.background = { color: 'FFFFFF' };
    addSlideHeader(s, `Maatregel: ${formatItemId(maatregelId)}`);
    const rows: Array<[string, string]> = [
      ['Bruto investering', `€ ${formatGetal(resultaat.brutoInvestering)}`],
      ['Subsidies', `€ ${formatGetal(resultaat.totaleSubsidie)}`],
      ['Netto investering', `€ ${formatGetal(resultaat.nettoInvestering)}`],
      ['Besparing per jaar', `€ ${formatGetal(resultaat.besparingPerJaar)}`],
      ['Terugverdientijd', formatTVT(resultaat.terugverdientijdJaren)],
      ['CO₂-besparing', `${formatGetal(resultaat.co2BesparingKg)} kg/jaar`],
    ];
    addLabelValueRows(s, rows, 0.7, 1.6, 5.5);
  }

  // Slide laatste — colofon
  const sEinde = pres.addSlide();
  sEinde.background = { color: ONN_CREME };
  sEinde.addText('Aan de slag?', { x: 0.5, y: 2.0, w: 12, h: 0.8, fontSize: 36, bold: true, color: ONN_TEAL });
  sEinde.addText('Op Naar Nul ondersteunt sportclubs met de uitvoering van verduurzamingsplannen.',
    { x: 0.5, y: 3.0, w: 12, h: 0.6, fontSize: 14, color: ONN_DONKER });
  sEinde.addText('opnaarnul.nl  ·  info@opnaarnul.nl',
    { x: 0.5, y: 6.8, w: 12, h: 0.4, fontSize: 14, color: ONN_TEAL });

  // Genereer als buffer
  const data = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
  return data;
}

function addSlideHeader(slide: PptxGenJS.Slide, titel: string) {
  slide.addText(titel, { x: 0.5, y: 0.4, w: 12, h: 0.7, fontSize: 28, bold: true, color: ONN_TEAL });
  // Onderlijn
  slide.addShape('rect' as never, { x: 0.5, y: 1.1, w: 1.0, h: 0.04, fill: { color: ONN_ORANJE }, line: { color: ONN_ORANJE } });
}

function addLabelValueRows(slide: PptxGenJS.Slide, rows: Array<[string, string]>, x: number, yStart: number, breedte: number, highlight = false) {
  const rowH = 0.55;
  rows.forEach(([label, value], i) => {
    const y = yStart + i * rowH;
    slide.addText(label, { x, y, w: breedte * 0.55, h: rowH, fontSize: 14, color: ONN_GRIJS, valign: 'middle' });
    slide.addText(value, {
      x: x + breedte * 0.55, y, w: breedte * 0.45, h: rowH,
      fontSize: highlight && i === 2 ? 20 : 14,
      bold: highlight && (i === 2 || i === 3),
      color: highlight && i === 2 ? ONN_ORANJE : ONN_DONKER,
      valign: 'middle',
    });
  });
}

function formatGetal(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('nl-NL');
}

function formatTVT(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return 'n.v.t.';
  if (n > 100) return '> 100 jaar';
  return `${n.toFixed(1)} jaar`;
}

function formatItemId(id: string): string {
  return id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
