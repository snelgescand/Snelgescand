/**
 * Schema-import — zet een aangeleverd trainingsschema (PDF, foto, Excel of een
 * weblink) om naar gestructureerde trainingsmomenten via Groq (Llama 4 Scout).
 *
 * Verwerking per type:
 *   - Foto (JPG/PNG/WebP) → Groq vision (image_url data-URI)
 *   - PDF                 → tekst-extractie via unpdf → Groq tekst
 *   - Excel/CSV           → SheetJS → CSV-tekst → Groq tekst
 *   - Weblink             → fetch + HTML-strip → Groq tekst
 *
 * De gebruiker krijgt het resultaat als PREVIEW en bevestigt zelf voordat het
 * schema wordt toegepast — AI-output wordt nooit blind overgenomen.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as XLSX from 'xlsx';
import { extractText, getDocumentProxy } from 'unpdf';
import { callAi, parseAiJson, AiError, type AiContentPart } from '../lib/groq.js';

const importSchema = z.object({
  bron: z.enum(['bestand', 'url']),
  bestand: z.object({
    data: z.string().min(1),
    mediaType: z.string().min(1),
    naam: z.string().optional(),
  }).optional(),
  url: z.string().url().optional(),
  sportCategorie: z.enum(['teamsport', 'racketsport', 'individueel', 'baansport']).optional(),
});

const momentSchema = z.object({
  dag: z.enum(['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag']),
  startTijd: z.string().regex(/^\d{1,2}:\d{2}$/),
  eindTijd: z.string().regex(/^\d{1,2}:\d{2}$/),
  aantalTeamsOnder13: z.number().int().min(0).max(99),
  aantalTeamsVanaf13: z.number().int().min(0).max(99),
  type: z.enum(['training', 'wedstrijd', 'sociaal']),
});

function bouwSysteemPrompt(cat: string): string {
  const eenheidUitleg: Record<string, string> = {
    teamsport: 'teams (aantalTeamsOnder13 = jeugdteams <13 jaar, aantalTeamsVanaf13 = teams van 13 jaar en ouder incl. senioren)',
    racketsport: 'bezette banen (aantalTeamsOnder13 = single/jeugd-banen, aantalTeamsVanaf13 = dubbel/senior-banen)',
    individueel: 'aanwezige sporters (aantalTeamsOnder13 = jeugdsporters <13, aantalTeamsVanaf13 = sporters 13+)',
    baansport: 'bezette zwembanen (aantalTeamsOnder13 = jeugd-lesbanen, aantalTeamsVanaf13 = senior-banen)',
  };
  return [
    'Je bent een data-extractie-assistent voor een Nederlandse sportclub-energietool.',
    'Je krijgt een trainingsschema (tabel, foto, tekst of webpagina) en zet het om naar JSON.',
    '',
    'Geef een JSON-object terug met een sleutel "momenten": een array van trainingsmomenten.',
    'Elk moment heeft exact deze velden:',
    '  - dag: "maandag"|"dinsdag"|"woensdag"|"donderdag"|"vrijdag"|"zaterdag"|"zondag"',
    '  - startTijd: "HH:MM" (24-uurs, bv "19:00")',
    '  - eindTijd: "HH:MM"',
    '  - aantalTeamsOnder13: geheel getal - ' + (eenheidUitleg[cat] ?? eenheidUitleg.teamsport),
    '  - aantalTeamsVanaf13: geheel getal',
    '  - type: "training"|"wedstrijd"|"sociaal"',
    '',
    'REGELS:',
    '- Antwoord met geldige JSON, niets anders.',
    '- Behoud de structuur van het schema; verzin geen momenten die er niet staan.',
    '- Ontbreekt een tijd? Schat een redelijke trainingstijd (19:00-20:30 of 20:30-22:00).',
    '- Staat het aantal teams/banen niet expliciet? Tel het aantal genoemde groepen per tijdslot.',
    '- Wedstrijden staan meestal in het weekend; doordeweekse blokken zijn meestal trainingen.',
    '- Maximaal 60 momenten; bij een groter schema pak je de meest representatieve week.',
    '- Voorbeeld: {"momenten":[{"dag":"maandag","startTijd":"19:00","eindTijd":"20:30","aantalTeamsOnder13":0,"aantalTeamsVanaf13":2,"type":"training"}]}',
  ].join('\n');
}

function excelNaarTekst(base64: string): string {
  const buf = Buffer.from(base64, 'base64');
  const wb = XLSX.read(buf, { type: 'buffer' });
  const delen: string[] = [];
  for (const naam of wb.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[naam]);
    if (csv.trim()) delen.push('### Tabblad: ' + naam + '\n' + csv);
  }
  return delen.join('\n\n').slice(0, 25_000);
}

async function pdfNaarTekst(base64: string): Promise<string> {
  const buf = Buffer.from(base64, 'base64');
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  return (Array.isArray(text) ? text.join('\n') : text).slice(0, 25_000);
}

async function urlNaarTekst(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { 'user-agent': 'Mozilla/5.0 SnelgescandBot' } });
  if (!res.ok) throw new AiError(502, 'Kon de pagina niet ophalen (' + res.status + ').');
  const html = await res.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 25_000);
}

export default async function schemaImportRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.post('/schema-import', async (req, reply) => {
    const parsed = importSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Ongeldige invoer', details: parsed.error.flatten() });
    }
    const o = parsed.data;
    const systeem = bouwSysteemPrompt(o.sportCategorie ?? 'teamsport');
    const instructie = 'Hieronder staat het trainingsschema. Zet het om naar het JSON-object met "momenten" zoals beschreven.';

    try {
      let content: string | AiContentPart[];

      if (o.bron === 'bestand') {
        if (!o.bestand) return reply.code(400).send({ error: 'Geen bestand meegestuurd.' });
        const mt = o.bestand.mediaType.toLowerCase();
        const naam = (o.bestand.naam ?? '').toLowerCase();

        if (mt.startsWith('image/')) {
          content = [
            { type: 'text', text: instructie },
            { type: 'image_url', image_url: { url: 'data:' + mt + ';base64,' + o.bestand.data } },
          ];
        } else if (mt === 'application/pdf' || naam.endsWith('.pdf')) {
          const tekst = await pdfNaarTekst(o.bestand.data);
          if (!tekst || tekst.trim().length < 40) {
            return reply.code(422).send({ error: 'Uit deze PDF kwam te weinig tekst - waarschijnlijk een gescande PDF. Maak er een foto van (JPG/PNG) en upload die.' });
          }
          content = instructie + '\n\nSchema-tekst uit PDF:\n\n' + tekst;
        } else if (mt.includes('spreadsheet') || mt.includes('excel') || /\.(xlsx|xls|csv)$/.test(naam)) {
          const tekst = excelNaarTekst(o.bestand.data);
          if (!tekst) return reply.code(400).send({ error: 'Kon geen data uit het Excel-bestand lezen.' });
          content = instructie + '\n\nSchema-data uit spreadsheet:\n\n' + tekst;
        } else {
          return reply.code(400).send({ error: 'Bestandstype "' + mt + '" wordt niet ondersteund. Gebruik een foto (JPG/PNG), PDF of Excel.' });
        }
      } else {
        if (!o.url) return reply.code(400).send({ error: 'Geen URL meegestuurd.' });
        const tekst = await urlNaarTekst(o.url);
        if (!tekst || tekst.length < 50) {
          return reply.code(400).send({ error: 'De pagina bevatte te weinig leesbare tekst. Probeer een directe link, of upload een foto/PDF.' });
        }
        content = instructie + '\n\nInhoud van ' + o.url + ':\n\n' + tekst;
      }

      const antwoord = await callAi({ system: systeem, content, jsonMode: true, maxTokens: 4096 });

      let ruwe: unknown;
      try {
        ruwe = parseAiJson<{ momenten?: unknown }>(antwoord);
      } catch {
        return reply.code(422).send({ error: 'De AI gaf geen geldige JSON terug. Probeer een duidelijker schema of een ander formaat.' });
      }
      const lijst: unknown = Array.isArray(ruwe)
        ? ruwe
        : (ruwe && typeof ruwe === 'object' && Array.isArray((ruwe as { momenten?: unknown }).momenten))
          ? (ruwe as { momenten: unknown }).momenten
          : null;
      if (!Array.isArray(lijst)) {
        return reply.code(422).send({ error: 'Verwacht een lijst van trainingsmomenten, maar kreeg iets anders.' });
      }

      const momenten: z.infer<typeof momentSchema>[] = [];
      let overgeslagen = 0;
      for (const item of lijst) {
        const m = momentSchema.safeParse(item);
        if (m.success) momenten.push(m.data);
        else overgeslagen++;
      }

      if (momenten.length === 0) {
        return reply.code(422).send({ error: 'Geen bruikbare trainingsmomenten herkend. Controleer of het schema dagen, tijden en teams/banen bevat.' });
      }

      const toelichting = overgeslagen > 0
        ? momenten.length + ' momenten herkend (' + overgeslagen + ' regels overgeslagen). Controleer het resultaat hieronder.'
        : momenten.length + ' trainingsmomenten herkend. Controleer het resultaat hieronder voordat je het toepast.';

      return { momenten, toelichting };
    } catch (err) {
      if (err instanceof AiError) {
        return reply.code(err.status >= 400 && err.status < 600 ? err.status : 502).send({ error: err.message });
      }
      req.log.error(err);
      return reply.code(500).send({ error: 'Onverwachte fout bij het verwerken van het schema.' });
    }
  });
}
