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
  /** Percentage van totale gas wat naar douches gaat */
  douchegasPct?: number;
  /** Kostprijs gas voor douches per jaar (€) */
  kostprijsDoucheGasJaar?: number;
  /** Kostprijs water + gas voor douches per jaar (€) */
  kostprijsDoucheTotaalJaar?: number;
  /** WC doorspoelingen per jaar */
  wcDoorspoelPerJaar?: number;
  /** Waterbesparing bij waterloos toilet (liter) */
  wcWaterbesparingLiter?: number;
  /** Kostbesparing WC water per jaar (€) */
  wcKostbesparingEur?: number;
  /** Energieverbruik t.o.v. gemiddeld: 'meer' of 'minder' */
  meerMinderEnergie?: 'meer' | 'minder';
  /** Gas-verbruik voor verwarming kantine (m³) — ~55% van totaal */
  gasKantinePerJaar?: number;
  /** Geschatte besparing m³ gas door isolatie kantine (~25% van kantine-gas) */
  besparingGasKantineM3?: number;
  /** Kostbesparing kantine isolatie per jaar (€) */
  besparingKantineEur?: number;
  /** Totaal gas-verbruik (m³/jaar) */
  totaalGasM3?: number;
  /** Totaal elektra (kWh/jaar) */
  totaalElekKwh?: number;
}

/** Bereken alle PPT-cijfers uit het project-state */
function berekenWaardes(state: Record<string, unknown>): BerekendeWaardes {
  const result: BerekendeWaardes = {};
  const PRIJS_GAS_PER_M3 = 1.35;
  const PRIJS_WATER_PER_M3 = 1.13;

  const ctx = (state.context as Record<string, unknown>) ?? {};
  const gebouw = (ctx.gebouw as Record<string, unknown>) ?? {};
  const energie = (ctx.energie as Record<string, unknown>) ?? {};
  const schema = (state.trainingsSchema as Array<Record<string, unknown>>) ?? [];

  // === Energieverbruik ===
  const gasM3 = (energie.gasM3PerJaar as number) ?? 0;
  const elekKwh = (energie.elektriciteitKwhPerJaar as number) ?? 0;
  if (gasM3 > 0) result.totaalGasM3 = gasM3;
  if (elekKwh > 0) result.totaalElekKwh = elekKwh;

  // === Douches ===
  let douchesPerWeek = 0;
  if (schema.length > 0) {
    for (const moment of schema) {
      const o13 = ((moment.aantalTeamsOnder13 as number) ?? 0) * 10;
      const v13 = ((moment.aantalTeamsVanaf13 as number) ?? 0) * 15;
      const douchePct = (moment.douchePercentage as number) ?? 0.6;
      douchesPerWeek += (o13 + v13) * douchePct;
    }
  } else {
    const koppen = (gebouw.aantalDouchekoppen as number) ?? 0;
    douchesPerWeek = koppen * 3 * 6;
  }
  douchesPerWeek = Math.round(douchesPerWeek);

  if (douchesPerWeek > 0) {
    result.douchesPerWeek = douchesPerWeek;
    result.douchesPerJaar = Math.round(douchesPerWeek * 42);
    result.gasDouchePerWeek = Math.round(douchesPerWeek * 0.5);
    result.gasDouchePerJaar = Math.round(result.douchesPerJaar * 0.5);
    result.waterDouchePerJaar = Math.round(result.douchesPerJaar * 0.05);

    // Percentage van totaal gas dat naar douches gaat
    if (gasM3 > 0) {
      result.douchegasPct = Math.round((result.gasDouchePerJaar / gasM3) * 100);
    }
    // Kostprijs
    result.kostprijsDoucheGasJaar = Math.round(result.gasDouchePerJaar * PRIJS_GAS_PER_M3);
    result.kostprijsDoucheTotaalJaar = Math.round(
      result.gasDouchePerJaar * PRIJS_GAS_PER_M3 + result.waterDouchePerJaar * PRIJS_WATER_PER_M3
    );
  }

  // === WC ===
  if (schema.length > 0) {
    let bezoekersPerWeek = 0;
    for (const moment of schema) {
      const o13 = ((moment.aantalTeamsOnder13 as number) ?? 0) * 10;
      const v13 = ((moment.aantalTeamsVanaf13 as number) ?? 0) * 15;
      bezoekersPerWeek += o13 + v13;
    }
    result.wcDoorspoelPerJaar = Math.round(bezoekersPerWeek * 42 * 2);
    result.wcWaterbesparingLiter = Math.round(result.wcDoorspoelPerJaar * 6);
    // €1,13 per m³ water → €0,00113 per liter
    result.wcKostbesparingEur = Math.round(result.wcWaterbesparingLiter * 0.00113);
  }

  // === Energieverbruik vs gemiddeld ===
  const bvo = (gebouw.bvoTotaalM2 as number) ?? 0;
  if (bvo > 0 && (gasM3 > 0 || elekKwh > 0)) {
    const primairKwh = elekKwh + gasM3 * 9.77;
    const perM2 = primairKwh / bvo;
    result.meerMinderEnergie = perM2 > 70 ? 'meer' : 'minder';
  }

  // === Kantine isolatie ===
  // Standaard sportclub-verdeling: ~55% van gas naar kantine/ruimteverwarming
  if (gasM3 > 0) {
    result.gasKantinePerJaar = Math.round(gasM3 * 0.55);
    // Bij isolatie van kantine: typisch 25% besparing op kantine-gas
    result.besparingGasKantineM3 = Math.round(result.gasKantinePerJaar * 0.25);
    result.besparingKantineEur = Math.round(result.besparingGasKantineM3 * PRIJS_GAS_PER_M3);
  }

  return result;
}

/**
 * Verwijder gele highlights uit een slide-XML.
 *
 * PowerPoint gebruikt `<a:highlight><a:srgbClr val="FFFF00"/></a:highlight>`
 * in run-properties (<a:rPr>) om tekst geel te markeren.
 */
function verwijderGeleHighlights(xml: string): string {
  return xml.replace(
    /<a:highlight>\s*<a:srgbClr val="[fF]{4}00"\s*\/>\s*<\/a:highlight>/g,
    ''
  );
}

/**
 * Vervang in een XML-string ALLE placeholders met de juiste cijfers.
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

  // 3. Verwijder ALLE gele highlights
  result = verwijderGeleHighlights(result);

  const b = vars.berekend;

  // === Slide 9 ===
  if (b.meerMinderEnergie) {
    result = result.replace(/meer\/minder/g, b.meerMinderEnergie);
  }

  // === Slide 12 — Douches ===
  if (b.douchesPerWeek !== undefined) {
    result = result.replace(/…\s*douchebeurten per week/gi, `${fmt(b.douchesPerWeek)} douchebeurten per week`);
  }
  if (b.gasDouchePerWeek !== undefined) {
    result = result.replace(/de vereniging\s*…\s*kuub gas/g, `de vereniging ${fmt(b.gasDouchePerWeek)} kuub gas`);
  }
  if (b.gasDouchePerJaar !== undefined) {
    result = result.replace(/jaarlijks ongeveer\s*…\s*kuub gas/g, `jaarlijks ongeveer ${fmt(b.gasDouchePerJaar)} kuub gas`);
  }
  if (b.douchegasPct !== undefined) {
    result = result.replace(/betekent dit\s*…\s*%/g, `betekent dit ${b.douchegasPct}%`);
  }
  if (b.kostprijsDoucheGasJaar !== undefined) {
    // Slide 12: "kost dit € …,-" — alleen de eerste gas-prijs op die slide
    result = result.replace(/€\s*1,35\)\s*kost dit\s*€\s*…/g, `€ 1,35) kost dit € ${fmt(b.kostprijsDoucheGasJaar)}`);
  }

  // === Slide 13 — Douche water ===
  if (b.douchesPerJaar !== undefined && b.waterDouchePerJaar !== undefined) {
    result = result.replace(
      /jaarlijks zo['’]n\s*…\s*keer gedoucht\.\s*Omgerekend is dat\s*…\s*m3 water per jaar/g,
      `jaarlijks zo’n ${fmt(b.douchesPerJaar)} keer gedoucht. Omgerekend is dat ${fmt(b.waterDouchePerJaar)} m³ water per jaar`,
    );
  }
  if (b.kostprijsDoucheTotaalJaar !== undefined) {
    // Tweede "kost dit €..." op slide 13 — gebruik andere context
    result = result.replace(/komt het neer op\s*€\s*…/g, `komt het neer op € ${fmt(b.kostprijsDoucheTotaalJaar)}`);
    // Algemene fallback voor "uit op € …" patroon
    result = result.replace(/uit op\s*€\s*…/g, `uit op € ${fmt(b.kostprijsDoucheTotaalJaar)}`);
  }

  // === Slide 16 — Kantine isolatie ===
  if (b.gasKantinePerJaar !== undefined) {
    result = result.replace(/er\s*…\s*m3 gas naar het verwarmen/g, `er ${fmt(b.gasKantinePerJaar)} m³ gas naar het verwarmen`);
  }
  if (b.besparingGasKantineM3 !== undefined) {
    result = result.replace(/jaarlijks ca\.\s*…\s*m3 gas/g, `jaarlijks ca. ${fmt(b.besparingGasKantineM3)} m³ gas`);
  }
  if (b.besparingKantineEur !== undefined) {
    result = result.replace(/neerkomt op een jaarlijkse besparing van\s*€\s*…/g, `neerkomt op een jaarlijkse besparing van € ${fmt(b.besparingKantineEur)}`);
  }

  // === Slide 71 — WC ===
  if (b.wcDoorspoelPerJaar !== undefined) {
    result = result.replace(/ca\.\s*…\s*keer een wc doorgespoeld/g, `ca. ${fmt(b.wcDoorspoelPerJaar)} keer een wc doorgespoeld`);
  }
  if (b.wcWaterbesparingLiter !== undefined) {
    result = result.replace(/club kan besparen is\s*…\s*liter/g, `club kan besparen is ${fmt(b.wcWaterbesparingLiter)} liter`);
  }
  if (b.wcKostbesparingEur !== undefined) {
    result = result.replace(/bespaart de club\s*€\s*…/g, `bespaart de club € ${fmt(b.wcKostbesparingEur)}`);
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
