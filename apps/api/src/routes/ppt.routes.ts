/**
 * PPT-export met native PptxGenJS charts in Op Naar Nul-stijl.
 *
 * Inhoud:
 *   1. Voorblad
 *   2. Uitgangspunten
 *   3. Huidige situatie (indien ingevuld)
 *   4. Energiebalans (pie chart — huidig gas)
 *   5. Voor de penningmeester (totaalrollup)
 *   6. Kasstroom-grafiek over 15 jaar (area chart)
 *   7. Waterverbruik per dag (indien gedetailleerd ingevuld)
 *   8. Per maatregel — investering en besparing
 *   9. Colofon
 */

import type { FastifyInstance } from 'fastify';
import PptxGenJS from 'pptxgenjs';
import { prisma } from '../db.js';
import { berekenProject, BerekenValidatieFout } from '../services/bereken.service.js';

const ONN_TEAL = '006579';
const ONN_TEAL_LIGHT = '5DA4AE';
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

    let berekend: any;
    const state = project.state as Record<string, unknown>;

    // 1. Voorkeur: gebruik het door de frontend opgeslagen berekendResultaat.
    //    Dit voorkomt dat we calc-core opnieuw moeten draaien (en daar potentieel op crashen).
    if (state.berekendResultaat && typeof state.berekendResultaat === 'object') {
      const cached = state.berekendResultaat as Record<string, unknown>;
      if (cached.rollup && cached.perMaatregel) {
        berekend = cached;
      }
    }

    // 2. Geen cached: probeer opnieuw te berekenen op de backend (fallback).
    if (!berekend) {
      try {
        berekend = berekenProject(state);
      } catch (err: unknown) {
        if (err instanceof BerekenValidatieFout) {
          return reply.code(400).send({
            error: 'Vul eerst alle vereiste velden in voordat je exporteert',
            message: err.message,
          });
        }
        app.log.error({ err, projectId: id }, 'PPT bereken-stap mislukt');
        return reply.code(400).send({
          error: 'Geen berekening beschikbaar — klik eerst op Bereken in de UI',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    try {
      const buffer = await maakPresentatie({
        clubNaam: project.clubNaam,
        state,
        berekend,
      });

      const veiligeNaam = project.clubNaam.replace(/[^a-zA-Z0-9-]+/g, '_').slice(0, 50);

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
  const gekozen = (state.gekozenMaatregelen as Record<string, Record<string, unknown>> | undefined) ?? {};
  const logo = state.logo as { dataUrl?: string; bestandsnaam?: string } | undefined;
  const trainingsSchema = (state.trainingsSchema as Array<Record<string, unknown>> | undefined) ?? [];

  const r = berekend.rollup;
  const gasM3 = (energie.gasverbruikM3 as number) ?? 0;
  const stroomKwh = (energie.stroomverbruikTotaalKwh as number) ?? 0;
  const gasprijs = (energie.gasprijsPerM3 as number) ?? 1.35;
  const stroomprijs = (energie.stroomprijsKaalPerKwh as number) ?? 0.30;

  // ============================================================
  // Slide 1: Voorblad
  // ============================================================
  const s1 = pres.addSlide();
  s1.background = { color: ONN_CREME };
  if (logo?.dataUrl) {
    try {
      s1.addImage({
        data: logo.dataUrl,
        x: 10.5, y: 0.5, w: 2.2, h: 2.2,
        sizing: { type: 'contain', w: 2.2, h: 2.2 },
      });
    } catch { /* ongeldig logo-formaat */ }
  }
  s1.addText('Een duurzaam plan voor', { x: 0.5, y: 1.5, w: 9.5, h: 0.5, fontSize: 22, color: ONN_GRIJS });
  s1.addText(clubNaam, { x: 0.5, y: 2.1, w: 9.5, h: 1.4, fontSize: 52, bold: true, color: ONN_TEAL });
  if (locatie.adres) {
    s1.addText(String(locatie.adres), { x: 0.5, y: 3.6, w: 12, h: 0.4, fontSize: 16, color: ONN_DONKER });
  }
  s1.addText(`in vervolg op locatiebezoek ${new Date().toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}`,
    { x: 0.5, y: 4.1, w: 12, h: 0.4, fontSize: 14, color: ONN_GRIJS, italic: true });
  s1.addText('Op Naar Nul · Snelgescand.nl', { x: 0.5, y: 7.1, w: 12, h: 0.3, fontSize: 12, color: ONN_TEAL, bold: true });

  // ============================================================
  // Slide 2: Uitgangspunten
  // ============================================================
  const s2 = pres.addSlide();
  addSlideHeader(s2, `Uitgangspunten ${clubNaam}`);
  s2.addText('Alle prijzen in dit voorstel zijn inclusief BTW, en waar van toepassing ODE en Energiebelasting.',
    { x: 0.5, y: 1.2, w: 12.3, h: 0.4, fontSize: 11, color: ONN_GRIJS, italic: true });

  // Twee kolommen: Gebouw + Energie
  s2.addText('Gebouw', { x: 0.7, y: 1.8, w: 5.5, h: 0.4, fontSize: 16, bold: true, color: ONN_TEAL });
  const gebouwRows: Array<[string, string]> = [
    ['Bouwjaar', gebouw.bouwjaar ? String(gebouw.bouwjaar) : '—'],
    ['Bruto vloeroppervlak', gebouw.bvoTotaalM2 ? `${formatGetal(gebouw.bvoTotaalM2 as number)} m²` : '—'],
    ['Plafondhoogte', gebouw.plafondhoogteM ? `${gebouw.plafondhoogteM} m` : '—'],
    ['Type sportvereniging', String(gebouw.typeSport ?? '—')],
    ['Aantal velden/banen', gebouw.aantalVeldenBanen ? String(gebouw.aantalVeldenBanen) : '—'],
    ['Aantal leden', gebouw.aantalLeden ? String(gebouw.aantalLeden) : '—'],
    ['Aantal kleedkamers', gebouw.aantalKleedkamers ? String(gebouw.aantalKleedkamers) : '—'],
    ['Aantal douchekoppen', gebouw.aantalDouchekoppen ? String(gebouw.aantalDouchekoppen) : '—'],
  ];
  addLabelValueRows(s2, gebouwRows, 0.7, 2.3, 5.5);

  s2.addText('Energie', { x: 7.2, y: 1.8, w: 5.5, h: 0.4, fontSize: 16, bold: true, color: ONN_TEAL });
  const energieRows: Array<[string, string]> = [
    ['Gasverbruik per jaar', gasM3 ? `${formatGetal(gasM3)} m³` : '—'],
    ['Stroomverbruik per jaar', stroomKwh ? `${formatGetal(stroomKwh)} kWh` : '—'],
    ['Gasprijs', `€ ${gasprijs.toFixed(2)} / m³`],
    ['Stroomprijs', `€ ${stroomprijs.toFixed(2)} / kWh`],
    ['Aansluitwaarde', String(energie.aansluitwaardeLabel ?? '—')],
    ['Huidige gaskosten/jaar', `€ ${formatGetal(gasM3 * gasprijs)}`],
    ['Huidige stroomkosten/jaar', `€ ${formatGetal(stroomKwh * stroomprijs)}`],
    ['Totale energiekosten/jaar', `€ ${formatGetal(gasM3 * gasprijs + stroomKwh * stroomprijs)}`],
  ];
  addLabelValueRows(s2, energieRows, 7.2, 2.3, 5.5);

  // ============================================================
  // Slide 3: De verduurzamingsroute (overview)
  // ============================================================
  const s3 = pres.addSlide();
  addSlideHeader(s3, 'De verduurzamingsroute');
  s3.addText('Een overzicht van de maatregelen die we voor jullie hebben uitgewerkt:',
    { x: 0.5, y: 1.2, w: 12.3, h: 0.5, fontSize: 14, color: ONN_DONKER });

  const aantalMaatregelen = Object.keys(berekend.perMaatregel).filter(k => berekend.perMaatregel[k as keyof typeof berekend.perMaatregel]).length;
  s3.addText(`${aantalMaatregelen} maatregelen geanalyseerd`,
    { x: 0.5, y: 1.8, w: 12.3, h: 0.5, fontSize: 24, bold: true, color: ONN_TEAL });

  // Vier hoeken: Warmte besparen / Warmte opwekken / Stroom besparen / Stroom opwekken
  const cats: Array<{ titel: string; ids: string[]; x: number; y: number; kleur: string }> = [
    { titel: '🔥 Warmte besparen', ids: ['dakisolatie', 'spouwmuurisolatie', 'vloerisolatie', 'glasisolatie', 'waterzijdig-inregelen', 'wtw'], x: 0.5, y: 2.5, kleur: ONN_TEAL },
    { titel: '♨️ Warmte opwekken', ids: ['warmtepompboiler', 'qton-warmtepomp', 'lmnt-warmtepomp', 'eboiler', 'pvt-tapwater', 'lucht-water-warmtepomp', 'lucht-lucht-warmtepomp', 'hybride-warmtepomp'], x: 6.7, y: 2.5, kleur: ONN_ORANJE },
    { titel: '💡 Stroom besparen', ids: ['binnenverlichting', 'ledveldverlichting'], x: 0.5, y: 5.0, kleur: ONN_TEAL },
    { titel: '☀️ Stroom opwekken & opslaan', ids: ['zonnepanelen', 'batterij-eenvoudig', 'batterij-uitgebreid'], x: 6.7, y: 5.0, kleur: ONN_ORANJE },
  ];
  for (const cat of cats) {
    const gekozenInCat = cat.ids.filter(id => id in berekend.perMaatregel && berekend.perMaatregel[id as keyof typeof berekend.perMaatregel]);
    s3.addText(cat.titel, { x: cat.x, y: cat.y, w: 6, h: 0.4, fontSize: 16, bold: true, color: cat.kleur });
    if (gekozenInCat.length > 0) {
      const tekst = gekozenInCat.map(id => `✓ ${formatItemId(id)}`).join('\n');
      s3.addText(tekst, { x: cat.x, y: cat.y + 0.5, w: 6, h: 1.8, fontSize: 12, color: ONN_DONKER, valign: 'top' });
    } else {
      s3.addText('(geen maatregelen gekozen in deze categorie)',
        { x: cat.x, y: cat.y + 0.5, w: 6, h: 0.4, fontSize: 11, color: ONN_GRIJS, italic: true });
    }
  }

  // ============================================================
  // Slide 4-5: Goed gedaan / Dit kan beter (uit huidigeSituatie)
  // ============================================================
  const goed = Object.entries(huidigeSituatie).filter(([, v]) => v?.status === 'goed');
  const aandacht = Object.entries(huidigeSituatie).filter(([, v]) => v?.status === 'matig' || v?.status === 'slecht');

  if (goed.length > 0) {
    const sg = pres.addSlide();
    addSlideHeader(sg, 'Goed gedaan');
    sg.addText('Dit is al uitstekend voor elkaar:', { x: 0.5, y: 1.2, w: 12, h: 0.4, fontSize: 14, color: ONN_DONKER });
    const tekst = goed.map(([k, v]) => {
      const notitie = v.notitie ? ` — ${v.notitie}` : '';
      return `✓ ${formatItemId(k)}${notitie}`;
    }).join('\n');
    sg.addText(tekst, { x: 0.7, y: 1.9, w: 12, h: 5.5, fontSize: 16, color: ONN_TEAL, valign: 'top' });
    sg.addText('Allemaal prima voor elkaar!', { x: 0.5, y: 7.0, w: 12, h: 0.4, fontSize: 14, bold: true, color: ONN_TEAL, italic: true });
  }

  if (aandacht.length > 0) {
    const sa = pres.addSlide();
    addSlideHeader(sa, 'Dit kan beter');
    sa.addText('Hier zien we ruimte voor verbetering:', { x: 0.5, y: 1.2, w: 12, h: 0.4, fontSize: 14, color: ONN_DONKER });
    const tekst = aandacht.map(([k, v]) => {
      const notitie = v.notitie ? ` — ${v.notitie}` : '';
      return `⚠ ${formatItemId(k)}${notitie}`;
    }).join('\n');
    sa.addText(tekst, { x: 0.7, y: 1.9, w: 12, h: 5.5, fontSize: 16, color: ONN_ORANJE, valign: 'top' });
    sa.addText('Werk aan de winkel!', { x: 0.5, y: 7.0, w: 12, h: 0.4, fontSize: 14, bold: true, color: ONN_ORANJE, italic: true });
  }

  // ============================================================
  // Slide 6: Bouwkundig — start situatie + energielabel-inschatting
  // ============================================================
  if (gasM3 > 0 && stroomKwh > 0 && gebouw.bvoTotaalM2) {
    const sLabel = pres.addSlide();
    addSlideHeader(sLabel, 'Bouwkundig: start situatie');
    sLabel.addText(`${clubNaam} wil stappen zetten richting een duurzamer gebouw. We beginnen met het inzichtelijk maken waar we nu staan.`,
      { x: 0.5, y: 1.2, w: 12.3, h: 0.8, fontSize: 13, color: ONN_DONKER, valign: 'top' });

    // Paris Proof berekening (eenvoudig)
    const bvo = gebouw.bvoTotaalM2 as number;
    const totaalKwhEquivalent = stroomKwh + gasM3 * 9.769; // 1 m³ gas ≈ 9,769 kWh
    const kwhPerM2 = totaalKwhEquivalent / bvo;
    const parisProofGrens = 70; // kWh/m²/jaar voor sportgebouw
    const verschil = kwhPerM2 - parisProofGrens;

    sLabel.addText('Energieverbruik per m²', { x: 0.7, y: 2.3, w: 5.5, h: 0.4, fontSize: 16, bold: true, color: ONN_TEAL });
    sLabel.addText(`${kwhPerM2.toFixed(0)} kWh/m²/jaar`,
      { x: 0.7, y: 2.8, w: 5.5, h: 0.8, fontSize: 36, bold: true, color: verschil > 30 ? ONN_ORANJE : verschil > 0 ? '#D97706' : ONN_TEAL });
    sLabel.addText(`Paris Proof grens: ${parisProofGrens} kWh/m²/jaar`,
      { x: 0.7, y: 3.7, w: 5.5, h: 0.4, fontSize: 12, color: ONN_GRIJS });

    sLabel.addText(verschil > 0 ? `${verschil.toFixed(0)} kWh/m² boven de norm` : `${Math.abs(verschil).toFixed(0)} kWh/m² onder de norm — top!`,
      { x: 0.7, y: 4.2, w: 5.5, h: 0.4, fontSize: 13, color: verschil > 0 ? ONN_ORANJE : ONN_TEAL, bold: true });

    sLabel.addText('Het energielabel is een theoretische inschatting van de energieprestatie. De WEii toont het werkelijke energieverbruik. Deze combinatie helpt te bepalen of het gebouw op weg is naar een Paris Proof-gebouw.',
      { x: 7.0, y: 2.3, w: 5.7, h: 4.0, fontSize: 12, color: ONN_DONKER, valign: 'top' });
    sLabel.addText('NB: Dit energielabel is niet definitief bepaald. Een EPA-U adviseur kan voor jullie een definitief energielabel afgeven.',
      { x: 0.5, y: 6.7, w: 12.3, h: 0.5, fontSize: 11, color: ONN_GRIJS, italic: true });
  }

  // ============================================================
  // Slide 7: Gas — waar gaat het naartoe?
  // ============================================================
  if (gasM3 > 0) {
    const sGas = pres.addSlide();
    addSlideHeader(sGas, 'Gas — waar gaat het naartoe?');

    // BVO verdeling als beschikbaar
    const bvoTotaal = (gebouw.bvoTotaalM2 as number) ?? 0;
    const aantalKleed = (gebouw.aantalKleedkamers as number) ?? 0;
    // Schatting: kleedkamer ~12 m², kantine ~50% rest, overig 50%
    const bvoKleed = aantalKleed * 12;
    const bvoRest = Math.max(0, bvoTotaal - bvoKleed);
    const bvoKantine = bvoRest * 0.6;
    const bvoOverig = bvoRest * 0.4;

    // Gasverdeling: 30% douchen (douche-zwaartepunt) + rest over ruimtes naar BVO
    const douchen = 0.30;
    const verwarming = 0.65;
    const keuken = 0.05;
    const gasDouchen = gasM3 * douchen;
    const gasKeuken = gasM3 * keuken;
    const gasVerwarming = gasM3 * verwarming;
    const gasKantine = bvoRest > 0 ? gasVerwarming * (bvoKantine / bvoRest) : gasVerwarming * 0.6;
    const gasKleed = bvoTotaal > 0 ? gasVerwarming * (bvoKleed / bvoTotaal) : gasVerwarming * 0.2;
    const gasOverig = gasVerwarming - gasKantine - gasKleed;

    sGas.addChart(pres.ChartType.doughnut, [{
      name: 'Gasverbruik',
      labels: ['Kantine', 'Kleedkamers', 'Overige ruimtes', 'Douchen', 'Keuken'],
      values: [Math.round(gasKantine), Math.round(gasKleed), Math.round(gasOverig), Math.round(gasDouchen), Math.round(gasKeuken)],
    }], {
      x: 0.5, y: 1.5, w: 6.5, h: 5.5,
      chartColors: [ONN_TEAL, ONN_TEAL_LIGHT, '#94A3B8', ONN_ORANJE, '#FCD34D'],
      showLegend: true, legendPos: 'b', legendFontSize: 11,
      showPercent: true, dataLabelFontSize: 10, dataLabelColor: 'FFFFFF',
    });

    // Tabel rechts
    sGas.addText('Verdeling gasverbruik', { x: 7.5, y: 1.7, w: 5.3, h: 0.4, fontSize: 16, bold: true, color: ONN_TEAL });
    const gasRows: Array<[string, string]> = [
      ['Kantine', `${formatGetal(gasKantine)} m³ (€ ${formatGetal(gasKantine * gasprijs)})`],
      ['Kleedkamers', `${formatGetal(gasKleed)} m³ (€ ${formatGetal(gasKleed * gasprijs)})`],
      ['Overige ruimtes', `${formatGetal(gasOverig)} m³ (€ ${formatGetal(gasOverig * gasprijs)})`],
      ['Douchen (warmwater)', `${formatGetal(gasDouchen)} m³ (€ ${formatGetal(gasDouchen * gasprijs)})`],
      ['Keuken', `${formatGetal(gasKeuken)} m³ (€ ${formatGetal(gasKeuken * gasprijs)})`],
      ['Totaal', `${formatGetal(gasM3)} m³ (€ ${formatGetal(gasM3 * gasprijs)})`],
    ];
    addLabelValueRows(sGas, gasRows, 7.5, 2.3, 5.3);
  }

  // ============================================================
  // Slide 8: Water & douchen (uit trainingsschema)
  // ============================================================
  if (trainingsSchema.length > 0) {
    const sDouch = pres.addSlide();
    addSlideHeader(sDouch, 'Douchen op de club');

    // Sport-bewuste cijfers (gespiegelde versie van frontend SPORT_CONFIGS)
    const typeVer = ((context.club as Record<string, unknown>)?.type as string ?? '').toLowerCase();
    const sportCfg = sportConfigVoorPPT(typeVer);
    const LITERS = 35;

    let totaalDoucheBeurtenWk = 0;
    let totaalLitersWk = 0;
    for (const m of trainingsSchema) {
      const groep1Aantal = ((m.aantalTeamsOnder13 as number) ?? (m.aantalOnder13 as number) ?? 0);
      const groep2Aantal = ((m.aantalTeamsVanaf13 as number) ?? (m.aantalVanaf13 as number) ?? 0);
      const personen1 = groep1Aantal * sportCfg.personenPerEenheid1;
      const personen2 = groep2Aantal * sportCfg.personenPerEenheid2;
      const type = m.type as string;
      const dag = m.dag as string;
      if (type === 'sociaal') continue;

      const pct1 = type === 'wedstrijd'
        ? (dag === 'zondag' && sportCfg.categorie === 'teamsport' ? 1.0 : sportCfg.douchePct.groep1.wedstrijd)
        : sportCfg.douchePct.groep1.training;
      const pct2 = type === 'wedstrijd' ? sportCfg.douchePct.groep2.wedstrijd : sportCfg.douchePct.groep2.training;
      const douches = (m.metDouche === false) ? 0 : personen1 * pct1 + personen2 * pct2;
      totaalDoucheBeurtenWk += douches;
      totaalLitersWk += douches * LITERS;
    }
    const doucheBeurtenPerJr = totaalDoucheBeurtenWk * 48;  // 48 actieve weken
    const litersPerJr = totaalLitersWk * 48;
    const m3PerJr = litersPerJr / 1000;
    const gasDouchenSchatting = m3PerJr * 0.093; // ~0,093 m³ gas / liter warmwater (37→10°C met 80% rendement)

    sDouch.addText('Op basis van het trainings- en wedstrijdschema:',
      { x: 0.5, y: 1.2, w: 12, h: 0.5, fontSize: 13, color: ONN_DONKER });

    const douchRows: Array<[string, string]> = [
      ['Douchebeurten per week', formatGetal(totaalDoucheBeurtenWk)],
      ['Liter warmwater per week', `${formatGetal(totaalLitersWk)} L`],
      ['Douchebeurten per jaar', formatGetal(doucheBeurtenPerJr)],
      ['Liter warmwater per jaar', `${formatGetal(litersPerJr)} L (${m3PerJr.toFixed(1)} m³)`],
      ['Geschat gasverbruik douchen', `${formatGetal(gasDouchenSchatting)} m³ / jaar`],
      ['Gaskosten douchen', `€ ${formatGetal(gasDouchenSchatting * gasprijs)} / jaar`],
      ['Aandeel van gasverbruik', gasM3 > 0 ? `${((gasDouchenSchatting / gasM3) * 100).toFixed(0)} %` : '—'],
    ];
    addLabelValueRows(sDouch, douchRows, 0.7, 1.9, 6.0);

    sDouch.addText('Douchen is duur — maar door over te stappen van direct gas-gestookte boiler naar warmtepompboiler, Q-ton of PVT kan dit gas (en dus deze kosten) drastisch omlaag.',
      { x: 7.0, y: 1.9, w: 5.8, h: 3.0, fontSize: 12, color: ONN_DONKER, valign: 'top' });
    sDouch.addText('Met 7 liter water per minuut en 5 minuten douchen haal je 28 douchebeurten uit 1 m³ water. Per kuub warm tapwater is ongeveer 0,1 m³ gas nodig.',
      { x: 7.0, y: 5.0, w: 5.8, h: 1.5, fontSize: 11, color: ONN_GRIJS, italic: true, valign: 'top' });
  }

  // ============================================================
  // Sectie-tussenslides + per-maatregel slides
  // ============================================================
  const groepen: Array<{ kop: string; subkop: string; ids: string[] }> = [
    { kop: 'Slim Besparen', subkop: 'Warmte', ids: ['waterzijdig-inregelen', 'dakisolatie', 'spouwmuurisolatie', 'vloerisolatie', 'glasisolatie', 'wtw'] },
    { kop: 'Slim Opwekken', subkop: 'Warmte', ids: ['warmtepompboiler', 'qton-warmtepomp', 'lmnt-warmtepomp', 'eboiler', 'pvt-tapwater', 'lucht-water-warmtepomp', 'lucht-lucht-warmtepomp', 'hybride-warmtepomp'] },
    { kop: 'Slim Besparen', subkop: 'Stroom', ids: ['binnenverlichting', 'ledveldverlichting'] },
    { kop: 'Slim Opwekken & Opslaan', subkop: 'Stroom', ids: ['zonnepanelen', 'batterij-eenvoudig', 'batterij-uitgebreid'] },
  ];

  for (const groep of groepen) {
    const heeftMaatregelen = groep.ids.some(id => berekend.perMaatregel[id as keyof typeof berekend.perMaatregel]);
    if (!heeftMaatregelen) continue;

    // Tussenslide
    const sTussen = pres.addSlide();
    sTussen.background = { color: ONN_TEAL };
    sTussen.addText(groep.kop, { x: 0.5, y: 2.5, w: 12, h: 1.2, fontSize: 60, bold: true, color: 'FFFFFF' });
    sTussen.addText(groep.subkop, { x: 0.5, y: 3.8, w: 12, h: 0.8, fontSize: 40, color: ONN_CREME });

    // Per-maatregel slide
    for (const id of groep.ids) {
      const resultaat = berekend.perMaatregel[id as keyof typeof berekend.perMaatregel];
      if (!resultaat) continue;

      const sM = pres.addSlide();
      addSlideHeader(sM, formatItemId(id));

      // Tekst-blok links: korte uitleg
      const uitleg = MAATREGEL_UITLEG[id] ?? 'Een verduurzamingsmaatregel uit de catalogus.';
      sM.addText(uitleg, { x: 0.5, y: 1.3, w: 6.5, h: 5.3, fontSize: 12, color: ONN_DONKER, valign: 'top' });

      // Tabel rechts: bedragen
      sM.addText('Businesscase', { x: 7.3, y: 1.3, w: 5.5, h: 0.4, fontSize: 16, bold: true, color: ONN_TEAL });
      const matRows: Array<[string, string]> = [
        ['Bruto investering', `€ ${formatGetal(resultaat.brutoInvestering)}`],
        ['Subsidies', `€ ${formatGetal(resultaat.totaleSubsidie)}`],
        ['Netto investering', `€ ${formatGetal(resultaat.nettoInvestering)}`],
        ['Besparing per jaar', `€ ${formatGetal(resultaat.besparingPerJaar)}`],
        ['Terugverdientijd', formatTVT(resultaat.terugverdientijdJaren)],
        ['CO₂-besparing', `${formatGetal(resultaat.co2BesparingKg)} kg/jaar`],
      ];
      addLabelValueRows(sM, matRows, 7.3, 1.8, 5.5, true);

      // Waarschuwingen (indien)
      if (resultaat.warnings.length > 0) {
        const warnsTekst = resultaat.warnings.map(w => `⚠ ${w.message}`).join('\n');
        sM.addText(warnsTekst, { x: 0.5, y: 6.6, w: 12.3, h: 0.8, fontSize: 10, color: ONN_ORANJE, italic: true, valign: 'top' });
      }
    }
  }

  // ============================================================
  // Aansluitwaarde-slide
  // ============================================================
  if (energie.aansluitwaardeElektra) {
    const aw = energie.aansluitwaardeElektra as { vermogenKw: number };
    const sAansl = pres.addSlide();
    addSlideHeader(sAansl, 'Aansluitwaarde');
    sAansl.addText('Als je meer gaat verwarmen met warmtepompen, ga je meer stroom gebruiken. De meterkast moet dit wel aankunnen.',
      { x: 0.5, y: 1.3, w: 12.3, h: 0.6, fontSize: 13, color: ONN_DONKER });

    const awRows: Array<[string, string]> = [
      ['Huidige aansluitwaarde', `${energie.aansluitwaardeLabel ?? '—'} (${aw.vermogenKw} kW)`],
      ['Aansluiting voldoende?', r.aansluitwaardeVoldoende ? '✓ Ja' : '✗ Nee — verzwaring of batterij nodig'],
    ];
    addLabelValueRows(sAansl, awRows, 0.7, 2.2, 6.0);

    if (!r.aansluitwaardeVoldoende) {
      sAansl.addText('💡 Tip: een batterij kan piekvraag opvangen zonder dat er een nieuwe netaansluiting nodig is. ' +
                     'Vaak goedkoper én sneller gerealiseerd (gem. wachttijd netverzwaring 1–3 jaar bij netbeheerders).',
        { x: 7.0, y: 2.2, w: 5.8, h: 4.5, fontSize: 12, color: ONN_ORANJE, valign: 'top' });
    }
  }

  // ============================================================
  // Voor de penningmeester — totaaltabel
  // ============================================================
  const sPen = pres.addSlide();
  addSlideHeader(sPen, 'Voor de penningmeester');
  sPen.addText('Prijzen zijn ramingen, definitieve prijzen bij uitvraag offertes na engineering.',
    { x: 0.5, y: 1.1, w: 12.3, h: 0.3, fontSize: 11, color: ONN_GRIJS, italic: true });

  // Tabel-headers
  sPen.addText('Maatregel',           { x: 0.5,  y: 1.6, w: 4.5, h: 0.4, fontSize: 12, bold: true, color: ONN_TEAL });
  sPen.addText('Bruto investering',   { x: 5.0,  y: 1.6, w: 2.0, h: 0.4, fontSize: 12, bold: true, color: ONN_TEAL, align: 'right' });
  sPen.addText('Subsidies',           { x: 7.1,  y: 1.6, w: 1.5, h: 0.4, fontSize: 12, bold: true, color: ONN_TEAL, align: 'right' });
  sPen.addText('Netto invest.',       { x: 8.7,  y: 1.6, w: 1.7, h: 0.4, fontSize: 12, bold: true, color: ONN_TEAL, align: 'right' });
  sPen.addText('Besparing/jr',        { x: 10.5, y: 1.6, w: 1.5, h: 0.4, fontSize: 12, bold: true, color: ONN_TEAL, align: 'right' });
  sPen.addText('TVT',                 { x: 12.1, y: 1.6, w: 0.8, h: 0.4, fontSize: 12, bold: true, color: ONN_TEAL, align: 'right' });

  // Tabel-rijen
  let yPos = 2.05;
  const rowH = 0.38;
  for (const [id, resultaat] of Object.entries(berekend.perMaatregel)) {
    if (!resultaat) continue;
    if (yPos > 6.5) break;
    sPen.addText(formatItemId(id),                               { x: 0.5,  y: yPos, w: 4.5, h: rowH, fontSize: 11, color: ONN_DONKER });
    sPen.addText(`€ ${formatGetal(resultaat.brutoInvestering)}`, { x: 5.0,  y: yPos, w: 2.0, h: rowH, fontSize: 11, align: 'right' });
    sPen.addText(`€ ${formatGetal(resultaat.totaleSubsidie)}`,   { x: 7.1,  y: yPos, w: 1.5, h: rowH, fontSize: 11, align: 'right' });
    sPen.addText(`€ ${formatGetal(resultaat.nettoInvestering)}`, { x: 8.7,  y: yPos, w: 1.7, h: rowH, fontSize: 11, align: 'right', bold: true });
    sPen.addText(`€ ${formatGetal(resultaat.besparingPerJaar)}`, { x: 10.5, y: yPos, w: 1.5, h: rowH, fontSize: 11, align: 'right' });
    sPen.addText(formatTVT(resultaat.terugverdientijdJaren),     { x: 12.1, y: yPos, w: 0.8, h: rowH, fontSize: 11, align: 'right' });
    yPos += rowH;
  }

  // Totaal-rij
  yPos = Math.max(yPos, 6.6);
  sPen.addShape('rect' as never, { x: 0.5, y: yPos, w: 12.4, h: 0.04, fill: { color: ONN_TEAL }, line: { color: ONN_TEAL } });
  yPos += 0.05;
  sPen.addText('TOTAAL',                                          { x: 0.5,  y: yPos, w: 4.5, h: rowH, fontSize: 12, bold: true, color: ONN_TEAL });
  sPen.addText(`€ ${formatGetal(r.totaleInvestering)}`,          { x: 5.0,  y: yPos, w: 2.0, h: rowH, fontSize: 12, bold: true, color: ONN_TEAL, align: 'right' });
  sPen.addText(`€ ${formatGetal(r.totaleSubsidie)}`,             { x: 7.1,  y: yPos, w: 1.5, h: rowH, fontSize: 12, bold: true, color: ONN_TEAL, align: 'right' });
  sPen.addText(`€ ${formatGetal(r.nettoInvestering)}`,           { x: 8.7,  y: yPos, w: 1.7, h: rowH, fontSize: 12, bold: true, color: ONN_TEAL, align: 'right' });
  sPen.addText(`€ ${formatGetal(r.totaleBesparingPerJaar)}`,     { x: 10.5, y: yPos, w: 1.5, h: rowH, fontSize: 12, bold: true, color: ONN_TEAL, align: 'right' });
  sPen.addText(formatTVT(r.gemiddeldeTerugverdientijdJaren),     { x: 12.1, y: yPos, w: 0.8, h: rowH, fontSize: 12, bold: true, color: ONN_TEAL, align: 'right' });

  // ============================================================
  // Kasstroom 15 jaar
  // ============================================================
  const netto = r.nettoInvestering ?? 0;
  const besparingPerJr = r.totaleBesparingPerJaar ?? 0;
  if (besparingPerJr > 0) {
    const sKas = pres.addSlide();
    addSlideHeader(sKas, 'Cumulatief netto rendement (15 jaar)');
    const jaren = Array.from({ length: 16 }, (_, i) => i);
    const cum: number[] = [];
    let saldo = -netto;
    cum.push(Math.round(saldo));
    for (let j = 1; j <= 15; j++) {
      saldo += besparingPerJr;
      cum.push(Math.round(saldo));
    }
    sKas.addChart(pres.ChartType.area, [{
      name: 'Cumulatief netto (€)',
      labels: jaren.map(j => `Jaar ${j}`),
      values: cum,
    }], {
      x: 0.7, y: 1.6, w: 11.5, h: 5.2,
      chartColors: [ONN_TEAL], showLegend: false,
      catAxisLabelFontSize: 10, valAxisLabelFontSize: 10,
      catAxisLabelColor: ONN_DONKER, valAxisLabelColor: ONN_DONKER, lineSize: 2,
    });

    // Break-even tekst
    const breakEvenJaar = jaren.find(j => cum[j] >= 0);
    if (breakEvenJaar !== undefined && breakEvenJaar > 0) {
      sKas.addText(`📈 Break-even na ${breakEvenJaar} jaar. Daarna pure winst: € ${formatGetal(besparingPerJr)} per jaar besparing.`,
        { x: 0.7, y: 6.9, w: 11.5, h: 0.4, fontSize: 13, bold: true, color: ONN_TEAL });
    }
  }

  // ============================================================
  // CO2-impact slide
  // ============================================================
  if (r.totaleCo2BesparingKg > 0) {
    const sCo2 = pres.addSlide();
    addSlideHeader(sCo2, 'CO₂-impact');
    const co2Ton = r.totaleCo2BesparingKg / 1000;
    sCo2.addText(`${co2Ton.toFixed(1)} ton CO₂ per jaar`,
      { x: 0.5, y: 1.7, w: 12, h: 1.0, fontSize: 48, bold: true, color: ONN_TEAL });
    sCo2.addText('Dat is gelijk aan:', { x: 0.5, y: 3.0, w: 12, h: 0.4, fontSize: 14, color: ONN_DONKER });

    // Vergelijkingen
    const bomen = co2Ton * 45;  // 1 ton CO2 = ~45 bomen 1 jaar
    const auto = co2Ton * 5000; // ~5000 km/auto/ton
    const vluchten = co2Ton * 2.4; // AMS-PAR ~420 kg
    const vergelijkRows: Array<[string, string]> = [
      ['🌳 Bomen 1 jaar laten groeien', formatGetal(bomen)],
      ['🚗 Autokilometers vermeden', `${formatGetal(auto)} km`],
      ['✈️ Vluchten AMS → Parijs', formatGetal(vluchten)],
    ];
    addLabelValueRows(sCo2, vergelijkRows, 0.7, 3.5, 6.0);
  }

  // ============================================================
  // Conclusie / vervolgstappen
  // ============================================================
  const sConcl = pres.addSlide();
  addSlideHeader(sConcl, 'Conclusie & vervolgstappen');
  sConcl.addText(`Op basis van deze quickscan kan ${clubNaam} met een netto investering van € ${formatGetal(r.nettoInvestering)} jaarlijks € ${formatGetal(r.totaleBesparingPerJaar)} besparen en ${(r.totaleCo2BesparingKg/1000).toFixed(1)} ton CO₂ uitstoot voorkomen.`,
    { x: 0.5, y: 1.3, w: 12.3, h: 1.0, fontSize: 14, color: ONN_DONKER, valign: 'top' });

  sConcl.addText('Vervolgstappen', { x: 0.5, y: 2.5, w: 12, h: 0.4, fontSize: 18, bold: true, color: ONN_TEAL });
  const stappen = [
    '1. Bespreek dit voorstel intern met bestuur, sponsors en gemeente',
    '2. Vraag DUMAVA-subsidie aan vóór start (verplicht vooraf!)',
    '3. Vraag offertes op bij erkende installateurs voor de gekozen maatregelen',
    '4. Voer een Blowerdoortest uit om luchtdichtheid in kaart te brengen',
    '5. Plan de uitvoering in een logische volgorde (eerst isolatie, dan opwekking)',
  ];
  sConcl.addText(stappen.join('\n'),
    { x: 0.7, y: 3.0, w: 12, h: 3.0, fontSize: 13, color: ONN_DONKER, valign: 'top' });

  sConcl.addText('Hulp nodig? Op Naar Nul ondersteunt sportclubs met de uitvoering van verduurzamingsplannen.',
    { x: 0.5, y: 6.2, w: 12, h: 0.4, fontSize: 12, italic: true, color: ONN_GRIJS });
  sConcl.addText('opnaarnul.nl · info@opnaarnul.nl',
    { x: 0.5, y: 6.7, w: 12, h: 0.4, fontSize: 14, bold: true, color: ONN_TEAL });

  // ============================================================
  // Slide laatste: Colofon
  // ============================================================
  const sEinde = pres.addSlide();
  sEinde.background = { color: ONN_CREME };
  sEinde.addText('Aan de slag?', { x: 0.5, y: 2.0, w: 12, h: 0.8, fontSize: 36, bold: true, color: ONN_TEAL });
  sEinde.addText('Op Naar Nul ondersteunt sportclubs met de uitvoering van verduurzamingsplannen.',
    { x: 0.5, y: 3.0, w: 12, h: 0.6, fontSize: 14, color: ONN_DONKER });
  sEinde.addText('opnaarnul.nl  ·  info@opnaarnul.nl',
    { x: 0.5, y: 6.6, w: 12, h: 0.4, fontSize: 14, color: ONN_TEAL });
  sEinde.addText('Rapport gegenereerd door Snelgescand.nl',
    { x: 0.5, y: 7.0, w: 12, h: 0.3, fontSize: 10, color: ONN_GRIJS });

  // pptxgenjs return-type normaliseren
  const raw = await pres.write({ outputType: 'nodebuffer' });
  if (Buffer.isBuffer(raw)) return raw;
  if (raw instanceof Uint8Array) return Buffer.from(raw);
  if (typeof raw === 'string') return Buffer.from(raw, 'base64');
  throw new Error(`Onverwacht PPT-buffertype: ${typeof raw}`);
}

// Uitleg-teksten per maatregel — krijgt eigen slide in de PPT
const MAATREGEL_UITLEG: Record<string, string> = {
  'waterzijdig-inregelen':
    'Waterzijdig inregelen betekent dat het CV-systeem wordt uitgebalanceerd. Door de radiatoren te voorzien van slimme thermostaatknoppen krijgt elke radiator precies de juiste hoeveelheid water. ' +
    'Daardoor hoeft de CV-ketel niet zo vaak op volle kracht te draaien — minder gasverbruik én meer comfort. Bij een ongelijk afgestelde installatie worden niet alle radiatoren even warm; de ketel blijft maar branden om de koudste plek te verwarmen.',
  'dakisolatie':
    'De meeste warmte gaat verloren via het dak — hier valt dus ook de meeste besparing te realiseren. Met dakisolatie naar Rc 3,5 of hoger voldoe je aan het Bouwbesluit; Rc 6,0 is BENG-niveau. ' +
    'Dakisolatie is over het algemeen een dure maatregel, maar het voorkomt ook toekomstige problemen zoals lekkages en zorgt ervoor dat warmte beter binnen blijft.',
  'spouwmuurisolatie':
    'Spouwmuurisolatie is een snelle en relatief eenvoudige oplossing. Door parels of schuim in de spouw te blazen krijg je een isolatiewaarde van Rc 1,3 — een prima boost voor weinig geld. ' +
    'Voorwaarden: geen vocht in de spouw, geen vervuiling, geen beschadigingen aan de gevel. De dagelijkse gang van zaken op de club gaat gewoon door.',
  'vloerisolatie':
    'Een ouder clubgebouw met kruipruimte verliest warmte via de vloer. Door de vloer te isoleren voorkom je een koude val en tocht over de vloer. ' +
    'Bespaart tot 15% op je gas! Combineer met bodemfolie, kierdichting en luchtdichte vloerdoorvoeren voor maximaal effect.',
  'glasisolatie':
    'Bij glasisolatie geldt: hoe lager de U-waarde, hoe beter. Enkelglas 5,8 U → dubbel 2,8 → HR 2,0 → HR+ 1,5 → HR++ 1,2 → HR+++ 0,7 U. ' +
    'Naast warmtebehoud voorkomt nieuw glas ook tocht langs bewegende delen in kozijnen — comfort en besparing in één.',
  'wtw':
    'WTW (Warmte Terug Winning) wint warmte uit afgevoerde lucht terug naar verse aanvoerlucht. ' +
    'Moderne units halen 85% rendement. Op warme zomerdagen koelt een WTW juist de binnenkomende warme lucht af. Voorwaarde: goede isolatie — anders ontsnapt de warmte alsnog.',
  'warmtepompboiler':
    'Een warmtepompboiler heeft een rendement van ~300% (COP 3) — voor elke kWh stroom levert hij 3 kWh warmte. ' +
    '75% van de warmte komt uit een onuitputtelijke bron (lucht). Aanschafprijs is hoger dan een elektrische boiler, maar de operationele kosten zijn veel lager.',
  'qton-warmtepomp':
    'De Q-ton is een hoog-temperatuur warmtepomp die werkt met CO₂ als koudemiddel — ook bij -25°C levert hij 90°C uitgaand water. ' +
    'Ideaal voor het verwarmen van douchewater op sportclubs. Met buffervaten zorg je dat ook de piekvraag bij wedstrijden wordt afgevangen. NB: prijzen verschillen per leverancier; ga uit van offertes.',
  'lmnt-warmtepomp':
    'LMNT is een Nederlandse propaan-warmtepomp die hoge temperaturen (tot 75°C) haalt — geschikt voor bestaande radiatoren zonder ze te hoeven vervangen. ' +
    'Werkt ook bij lage buitentemperaturen. Geluidsarme uitvoering geschikt voor woongebieden.',
  'eboiler':
    'Een elektrische boiler heeft 100% rendement — niet héél efficiënt vergeleken met een warmtepomp, maar wel goedkoop in aanschaf en bij overschot-PV een prima oplossing als noodboiler.',
  'pvt-tapwater':
    'PVT-panelen wekken tegelijk stroom én warmte op. De voorkant is een gewoon PV-paneel, de achterkant heeft een warmtewisselaar. ' +
    'Door de dubbelfunctie minder dakoppervlak nodig. Vaak een goede optie voor sportclubs met krappe daken.',
  'lucht-water-warmtepomp':
    'Een lucht-water warmtepomp gebruikt buitenlucht als warmtebron en geeft warmte af aan water (vloerverwarming/radiatoren). ' +
    'Kan ook koelen — dat scheelt extra apparatuur in de zomer. Combinatie met WTW verhoogt het rendement van de pomp aanzienlijk.',
  'lucht-lucht-warmtepomp':
    'Lucht-lucht warmtepomp blaast warme of koude lucht direct in de ruimte — vergelijkbaar met een airco met verwarmingsfunctie. ' +
    'Voor clubs met wisselend gebruik handig: directe verwarming bij piekuren. Geen tapwater-functie.',
  'hybride-warmtepomp':
    'Een hybride warmtepomp werkt náást een bestaande CV-ketel. Tot ~-3°C werkt alleen de warmtepomp; daaronder springt de ketel bij. ' +
    'Ideaal als er net een nieuwe CV-ketel is geïnstalleerd: leg een basis voor een duurzame toekomst zonder grote investering ineens.',
  'binnenverlichting':
    'Een halogeen verbruikt ~20 W, een LED slechts ~4 W. Bewegingsmelders in kleedkamers en toiletten voorkomen dat lampen onnodig branden. ' +
    'Investering is laag, terugverdientijd vaak < 2 jaar.',
  'ledveldverlichting':
    'De grootste stroomverbruiker op buitensportaccommodaties. Conventionele gas-ontbrandingslampen ~2150 W; LED-veldarmaturen ~1500 W (en op trainingsstand dimbaar tot 1050 W = 70%). ' +
    'Door betere lichtspreiding kunnen vaak minder armaturen volstaan voor hetzelfde lichtniveau.',
  'zonnepanelen':
    'PV-panelen op het dak van het clubhuis (en eventueel een sportveld-overkapping). Zomaar het dak volleggen is vaak niet het meest rendabel — ' +
    'kijk naar wat je zelf gebruikt als de zon schijnt, en de aansluiting in de meterkast.',
  'batterij-eenvoudig':
    'Een snelle batterij-indicatie op basis van jaartotalen. Voor de complete businesscase: kies "Batterij — volledige berekening".',
  'batterij-uitgebreid':
    'Een batterij levert vijf voordelen tegelijk: (1) meer eigen verbruik van PV-stroom, (2) vermijden van boete op teruglevering, (3) EPEX-handelsvoordeel ’s zomers, ' +
    '(4) opvangen van piekvraag waardoor netverzwaring vermeden kan worden, (5) noodstroom bij stroomuitval. ' +
    'Met name peakshaving en het optimaliseren van eigen stroombehoefte zijn voor sportclubs zeer interessant.',
};

/**
 * Mini sport-config voor PPT-rapport — gespiegelde versie van de frontend
 * SPORT_CONFIGS in apps/web/src/components/TrainingsSchema.tsx. Houd in sync.
 */
interface MiniSportConfig {
  categorie: 'teamsport' | 'racketsport' | 'individueel' | 'baansport';
  personenPerEenheid1: number;
  personenPerEenheid2: number;
  douchePct: {
    groep1: { training: number; wedstrijd: number };
    groep2: { training: number; wedstrijd: number };
  };
}
function sportConfigVoorPPT(typeVer: string): MiniSportConfig {
  const map: Record<string, MiniSportConfig> = {
    voetbal:   { categorie: 'teamsport', personenPerEenheid1: 10, personenPerEenheid2: 15, douchePct: { groep1: { training: 0.25, wedstrijd: 0.50 }, groep2: { training: 0.85, wedstrijd: 1.00 } } },
    hockey:    { categorie: 'teamsport', personenPerEenheid1: 10, personenPerEenheid2: 15, douchePct: { groep1: { training: 0.30, wedstrijd: 0.65 }, groep2: { training: 0.90, wedstrijd: 1.00 } } },
    korfbal:   { categorie: 'teamsport', personenPerEenheid1: 8,  personenPerEenheid2: 11, douchePct: { groep1: { training: 0.20, wedstrijd: 0.50 }, groep2: { training: 0.80, wedstrijd: 0.95 } } },
    handbal:   { categorie: 'teamsport', personenPerEenheid1: 12, personenPerEenheid2: 14, douchePct: { groep1: { training: 0.35, wedstrijd: 0.75 }, groep2: { training: 0.90, wedstrijd: 1.00 } } },
    rugby:     { categorie: 'teamsport', personenPerEenheid1: 18, personenPerEenheid2: 22, douchePct: { groep1: { training: 0.75, wedstrijd: 1.00 }, groep2: { training: 1.00, wedstrijd: 1.00 } } },
    volleybal: { categorie: 'teamsport', personenPerEenheid1: 8,  personenPerEenheid2: 10, douchePct: { groep1: { training: 0.20, wedstrijd: 0.40 }, groep2: { training: 0.55, wedstrijd: 0.80 } } },
    honkbal:   { categorie: 'teamsport', personenPerEenheid1: 10, personenPerEenheid2: 14, douchePct: { groep1: { training: 0.15, wedstrijd: 0.30 }, groep2: { training: 0.35, wedstrijd: 0.55 } } },
    tennis:    { categorie: 'racketsport', personenPerEenheid1: 2, personenPerEenheid2: 4, douchePct: { groep1: { training: 0.05, wedstrijd: 0.08 }, groep2: { training: 0.05, wedstrijd: 0.08 } } },
    padel:     { categorie: 'racketsport', personenPerEenheid1: 2, personenPerEenheid2: 4, douchePct: { groep1: { training: 0.10, wedstrijd: 0.15 }, groep2: { training: 0.15, wedstrijd: 0.20 } } },
    badminton: { categorie: 'racketsport', personenPerEenheid1: 2, personenPerEenheid2: 4, douchePct: { groep1: { training: 0.05, wedstrijd: 0.10 }, groep2: { training: 0.05, wedstrijd: 0.10 } } },
    squash:    { categorie: 'racketsport', personenPerEenheid1: 2, personenPerEenheid2: 2, douchePct: { groep1: { training: 0.30, wedstrijd: 0.50 }, groep2: { training: 0.50, wedstrijd: 0.70 } } },
    atletiek:  { categorie: 'individueel', personenPerEenheid1: 1, personenPerEenheid2: 1, douchePct: { groep1: { training: 0.20, wedstrijd: 0.40 }, groep2: { training: 0.40, wedstrijd: 0.65 } } },
    zwemmen:   { categorie: 'baansport', personenPerEenheid1: 6, personenPerEenheid2: 6, douchePct: { groep1: { training: 1.00, wedstrijd: 1.00 }, groep2: { training: 1.00, wedstrijd: 1.00 } } },
    multi:     { categorie: 'teamsport', personenPerEenheid1: 10, personenPerEenheid2: 15, douchePct: { groep1: { training: 0.30, wedstrijd: 0.55 }, groep2: { training: 0.75, wedstrijd: 0.90 } } },
  };
  return map[typeVer] ?? map.voetbal;
}

function addSlideHeader(slide: PptxGenJS.Slide, titel: string) {
  slide.background = { color: 'FFFFFF' };
  slide.addText(titel, { x: 0.5, y: 0.4, w: 12, h: 0.7, fontSize: 28, bold: true, color: ONN_TEAL });
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
