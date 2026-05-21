/**
 * PPT-template endpoint.
 *
 * Genereert een verduurzamingsplan op basis van de ORIGINELE Sportief Opgewekt
 * template (86 slides met alle plaatjes, layout, branding). Doet drie dingen:
 *
 *   1. Tekst-placeholders vervangen ('naamvereniging' → clubnaam, [maand] → maand)
 *   2. Specifieke cijfer-placeholders ('…' / 'meer/minder') vervangen met
 *      berekende waardes (aantal douches, m³ water, energiebalans)
 *   3. Logo van de club embedden rechtsboven op slide 1
 *
 * Aanpak: een .pptx is een ZIP met XML-files per slide. Met JSZip laden we
 * de ZIP, doen string-replace op de tekst-XML, voegen het logo toe als
 * nieuwe media-file + relationship + <p:pic> shape, en re-zippen het geheel.
 * Plaatjes, layouts, themas, fonts — alles van de template blijft onaangeroerd.
 */

import type { FastifyInstance } from 'fastify';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { prisma } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = join(__dirname, '..', '..', 'templates', 'sportief-opgewekt-standaard.pptx');

const NEDERLANDSE_MAANDEN = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];

function huidigeMaandJaar(): string {
  const d = new Date();
  return `${NEDERLANDSE_MAANDEN[d.getMonth()]} ${d.getFullYear()}`;
}

/** Formatteer een getal met punt-duizendscheiding (Nederlands) */
function fmt(n: number, decimalen = 0): string {
  return n.toLocaleString('nl-NL', { minimumFractionDigits: decimalen, maximumFractionDigits: decimalen });
}

interface BerekendeWaardes {
  /** Aantal douchebeurten per week (afgerond) */
  douchesPerWeek?: number;
  /** Aantal douches per jaar */
  douchesPerJaar?: number;
  /** Gas voor douche-warmwater per week (m³) */
  gasDouchePerWeek?: number;
  /** Gas voor douche-warmwater per jaar (m³) */
  gasDouchePerJaar?: number;
  /** Water voor douches per jaar (m³) */
  waterDouchePerJaar?: number;
  /** WC doorspoelingen per jaar */
  wcDoorspoelPerJaar?: number;
  /** Waterbesparing bij waterloos toilet (liter) */
  wcWaterbesparingLiter?: number;
  /** Energieverbruik t.o.v. gemiddeld: 'meer' of 'minder' */
  meerMinderEnergie?: 'meer' | 'minder';
}

/** Bereken de PPT-cijfers uit het project-state */
function berekenWaardes(state: Record<string, unknown>): BerekendeWaardes {
  const result: BerekendeWaardes = {};

  const ctx = (state.context as Record<string, unknown>) ?? {};
  const gebouw = (ctx.gebouw as Record<string, unknown>) ?? {};
  const energie = (ctx.energie as Record<string, unknown>) ?? {};
  const schema = (state.trainingsSchema as Array<Record<string, unknown>>) ?? [];

  // === Douches ===
  // Uit trainingsschema: aantal spelers per dag × douche-percentage
  // Of fallback: aantal douchekoppen × 3 douches/dag × 6 dagen/week
  let douchesPerWeek = 0;
  if (schema.length > 0) {
    for (const moment of schema) {
      const o13 = ((moment.aantalTeamsOnder13 as number) ?? 0) * 10;  // 10 sp/team
      const v13 = ((moment.aantalTeamsVanaf13 as number) ?? 0) * 15;  // 15 sp/team
      const douchePct = (moment.douchePercentage as number) ?? 0.6;
      douchesPerWeek += (o13 + v13) * douchePct;
    }
  } else {
    const koppen = (gebouw.aantalDouchekoppen as number) ?? 0;
    douchesPerWeek = koppen * 3 * 6;  // ruwe schatting
  }
  douchesPerWeek = Math.round(douchesPerWeek);

  if (douchesPerWeek > 0) {
    result.douchesPerWeek = douchesPerWeek;
    result.douchesPerJaar = Math.round(douchesPerWeek * 42);  // 42 actieve weken/jaar
    // Per douche ~50L warm water, dat kost ~2 m³ gas (Sportief Opgewekt vuistregel: ×3,93)
    result.gasDouchePerWeek = Math.round(douchesPerWeek * 0.5);  // ~0.5 m³ gas per douche
    result.gasDouchePerJaar = Math.round(result.douchesPerJaar! * 0.5);
    result.waterDouchePerJaar = Math.round(result.douchesPerJaar! * 0.05);  // 50L = 0.05 m³
  }

  // === WC doorspoeling ===
  // Op basis van bezoekers (uit trainingsschema)
  if (schema.length > 0) {
    let bezoekersPerWeek = 0;
    for (const moment of schema) {
      const o13 = ((moment.aantalTeamsOnder13 as number) ?? 0) * 10;
      const v13 = ((moment.aantalTeamsVanaf13 as number) ?? 0) * 15;
      bezoekersPerWeek += o13 + v13;
    }
    result.wcDoorspoelPerJaar = Math.round(bezoekersPerWeek * 42 * 2);  // 2x doorspoelen per bezoek
    result.wcWaterbesparingLiter = Math.round(result.wcDoorspoelPerJaar * 6);  // 6L per spoeling
  }

  // === Energieverbruik vs gemiddeld ===
  const gasM3 = (energie.gasM3PerJaar as number) ?? 0;
  const elekKwh = (energie.elektriciteitKwhPerJaar as number) ?? 0;
  const bvo = (gebouw.bvoTotaalM2 as number) ?? 0;
  if (bvo > 0 && (gasM3 > 0 || elekKwh > 0)) {
    // WEii vuistregel: ~70 kWh/m²/jaar primair = gemiddeld sportclub
    const primairKwh = elekKwh + gasM3 * 9.77;  // 1 m³ gas ~ 9.77 kWh primair
    const perM2 = primairKwh / bvo;
    result.meerMinderEnergie = perM2 > 70 ? 'meer' : 'minder';
  }

  return result;
}

/**
 * Vervang in een XML-string alle placeholders.
 */
function vervangPlaceholders(
  xml: string,
  vars: { clubnaam: string; maandJaar: string; berekend: BerekendeWaardes },
): string {
  if (!vars.clubnaam) return xml;
  const clubnaamCap = vars.clubnaam.charAt(0).toUpperCase() + vars.clubnaam.slice(1);

  // 1. Maand-placeholder eerst (specifieker)
  let result = xml.replace(/\[maand\]\s*2025/g, vars.maandJaar);
  result = result.replace(/\[maand\]/g, NEDERLANDSE_MAANDEN[new Date().getMonth()]);

  // 2. Naamvereniging
  result = result.replace(/Naamvereniging/g, clubnaamCap);
  result = result.replace(/naamvereniging/g, vars.clubnaam);

  // 3. Specifieke cijfer-placeholders (alleen als we de waarde hebben)
  const b = vars.berekend;

  // Slide 9: "meer/minder energieverbruik dan gemiddeld"
  if (b.meerMinderEnergie) {
    result = result.replace(/meer\/minder/g, b.meerMinderEnergie);
  }

  // Slide 12: "… douchebeurten per week"
  if (b.douchesPerWeek !== undefined) {
    result = result.replace(
      /…\s*douchebeurten per week/gi,
      `${fmt(b.douchesPerWeek)} douchebeurten per week`,
    );
  }

  // Slide 12: "Per week kost dit de vereniging … kuub gas"
  if (b.gasDouchePerWeek !== undefined) {
    result = result.replace(
      /Per week kost dit de vereniging\s*…\s*kuub gas/g,
      `Per week kost dit de vereniging ${fmt(b.gasDouchePerWeek)} kuub gas`,
    );
  }

  // Slide 12: "jaarlijks ongeveer … kuub gas naar het verwarmen"
  if (b.gasDouchePerJaar !== undefined) {
    result = result.replace(
      /jaarlijks ongeveer\s*…\s*kuub gas/g,
      `jaarlijks ongeveer ${fmt(b.gasDouchePerJaar)} kuub gas`,
    );
  }

  // Slide 13: "jaarlijks zo'n … keer gedoucht. Omgerekend is dat … m3 water per jaar!"
  if (b.douchesPerJaar !== undefined && b.waterDouchePerJaar !== undefined) {
    result = result.replace(
      /jaarlijks zo['’]n\s*…\s*keer gedoucht\.\s*Omgerekend is dat\s*…\s*m3 water per jaar/g,
      `jaarlijks zo’n ${fmt(b.douchesPerJaar)} keer gedoucht. Omgerekend is dat ${fmt(b.waterDouchePerJaar)} m³ water per jaar`,
    );
  }

  // Slide 71: WC doorspoelen
  if (b.wcDoorspoelPerJaar !== undefined) {
    result = result.replace(
      /ca\.\s*…\s*keer een wc doorgespoeld/g,
      `ca. ${fmt(b.wcDoorspoelPerJaar)} keer een wc doorgespoeld`,
    );
  }
  if (b.wcWaterbesparingLiter !== undefined) {
    result = result.replace(
      /club kan besparen is\s*…\s*liter/g,
      `club kan besparen is ${fmt(b.wcWaterbesparingLiter)} liter`,
    );
  }

  return result;
}

/**
 * Voeg het clublogo toe als afbeelding rechtsboven op slide 1.
 *
 * Aanpak:
 *  1. Decodeer dataUrl → bytes, bepaal het bestandsformaat
 *  2. Voeg bytes toe aan ppt/media/clublogo.{ext}
 *  3. Voeg relationship toe in ppt/slides/_rels/slide1.xml.rels
 *  4. Injecteer <p:pic> shape vlak voor </p:spTree> in ppt/slides/slide1.xml
 */
async function voegLogoToeAanSlide1(zip: JSZip, logoDataUrl: string): Promise<boolean> {
  // dataUrl format: data:image/png;base64,iVBORw0KGgo...
  const match = logoDataUrl.match(/^data:image\/([a-z+]+);base64,(.+)$/i);
  if (!match) {
    console.warn('[PPT-template] Logo dataUrl niet herkend');
    return false;
  }

  const ext = match[1].toLowerCase() === 'svg+xml' ? 'png' : match[1].toLowerCase();
  // PowerPoint accepteert geen SVG direct — sla over als svg
  if (ext === 'svg+xml' || ext === 'svg') {
    console.warn('[PPT-template] SVG logo niet ondersteund in PPT (alleen PNG/JPG)');
    return false;
  }

  const logoBytes = Buffer.from(match[2], 'base64');
  if (logoBytes.length === 0 || logoBytes.length > 5_000_000) return false;

  const mediaPath = `ppt/media/clublogo.${ext}`;
  zip.file(mediaPath, logoBytes);

  // Relationship toevoegen aan slide1.xml.rels
  const relsPath = 'ppt/slides/_rels/slide1.xml.rels';
  const relsFile = zip.file(relsPath);
  if (!relsFile) return false;
  const relsXml = await relsFile.async('string');

  // Vind hoogste rId om geen conflict te krijgen
  const allRids = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map(m => parseInt(m[1], 10));
  const newRid = Math.max(0, ...allRids) + 1;
  const newRidStr = `rId${newRid}`;

  const newRel = `<Relationship Id="${newRidStr}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/clublogo.${ext}"/>`;
  const newRels = relsXml.replace('</Relationships>', `${newRel}</Relationships>`);
  zip.file(relsPath, newRels);

  // Pic-shape injecteren in slide1.xml — rechtsboven, ~3cm × 3cm
  // Standaard slide = 12192000 × 6858000 EMU (16:9, 25.4cm × 14.3cm)
  // Logo: 1500000 × 1500000 EMU (~4cm), x=10300000, y=300000 (rechtsboven)
  const slidePath = 'ppt/slides/slide1.xml';
  const slideFile = zip.file(slidePath);
  if (!slideFile) return false;
  const slideXml = await slideFile.async('string');

  // Bepaal hoogste shape-id om dubbel ID te voorkomen
  const allIds = [...slideXml.matchAll(/<p:cNvPr\s+id="(\d+)"/g)].map(m => parseInt(m[1], 10));
  const newShapeId = Math.max(0, ...allIds) + 1;

  const picXml = `<p:pic>
    <p:nvPicPr>
      <p:cNvPr id="${newShapeId}" name="ClubLogo"/>
      <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>
      <p:nvPr/>
    </p:nvPicPr>
    <p:blipFill>
      <a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${newRidStr}"/>
      <a:stretch><a:fillRect/></a:stretch>
    </p:blipFill>
    <p:spPr>
      <a:xfrm>
        <a:off x="10300000" y="300000"/>
        <a:ext cx="1500000" cy="1500000"/>
      </a:xfrm>
      <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
    </p:spPr>
  </p:pic>`;

  // Injecteer vlak voor </p:spTree>
  const newSlideXml = slideXml.replace('</p:spTree>', `${picXml}</p:spTree>`);
  zip.file(slidePath, newSlideXml);

  return true;
}

export default async function pptTemplateRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.post('/projects/:id/ppt-template', async (req, reply) => {
    const { id } = req.params as { id: string };

    const project = await prisma.project.findFirst({
      where: { id, tenantId: req.user!.tenantId },
      select: { id: true, clubNaam: true, state: true },
    });
    if (!project) {
      return reply.code(404).send({ error: 'Project niet gevonden' });
    }

    const state = (project.state ?? {}) as Record<string, unknown>;
    const ctx = (state.context as Record<string, unknown>) ?? {};
    const club = (ctx.club as Record<string, unknown>) ?? {};
    const logo = (state.logo as { dataUrl?: string }) ?? {};
    const clubnaam = (club.naam as string) || project.clubNaam || 'Naamvereniging';

    // Bereken cijfers vooraf
    const berekend = berekenWaardes(state);
    app.log.info({ projectId: id, clubnaam, berekend }, 'PPT-template cijfers berekend');

    // Lees de originele template
    let templateBuffer: Buffer;
    try {
      templateBuffer = readFileSync(TEMPLATE_PATH);
    } catch (e) {
      app.log.error({ err: e, path: TEMPLATE_PATH }, 'PPT-template niet gevonden');
      return reply.code(500).send({
        error: 'PPT-template ontbreekt op de server',
        details: 'apps/api/templates/sportief-opgewekt-standaard.pptx is niet aanwezig',
      });
    }

    const zip = await JSZip.loadAsync(templateBuffer);

    const vars = { clubnaam, maandJaar: huidigeMaandJaar(), berekend };

    // Vervang placeholders in alle slide-XML's
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

    // Logo toevoegen aan slide 1 als beschikbaar
    let logoToegevoegd = false;
    if (logo.dataUrl) {
      try {
        logoToegevoegd = await voegLogoToeAanSlide1(zip, logo.dataUrl);
      } catch (e) {
        app.log.warn({ err: e }, 'Logo toevoegen mislukt — PPT wordt zonder logo gegenereerd');
      }
    }

    app.log.info(
      { projectId: id, slidesMetVervanging: aantalVervangen, logoToegevoegd },
      'PPT-template klaar',
    );

    // Re-zip en verstuur
    const outBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

    const filename = `Verduurzamingsplan_${clubnaam.replace(/[^a-zA-Z0-9]/g, '_')}_Sportief_Opgewekt.pptx`;
    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(outBuffer);
  });
}
