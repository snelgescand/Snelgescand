/**
 * BAG-lookup backend-proxy.
 *
 * Probeert SERVER-SIDE alle BAG-endpoints op een rij — geen CORS-issues,
 * en als één endpoint faalt valt het automatisch terug op de volgende.
 *
 *   POST /api/bag/lookup   { adresId, rd_x?, rd_y? }
 *     → { bouwjaar?, oppervlakte?, pandid?, bouwhoogteM?, plafondhoogteM?, bron, debug }
 *
 * De backend heeft geen browser-restricties, kan dus alle PDOK-services
 * raken zonder CORS-problemen. Voor de frontend is het één call met één
 * gestructureerd antwoord — veel betrouwbaarder dan client-side stapelen.
 */

import type { FastifyInstance } from 'fastify';

const UA = 'Op Naar Nul / Snelgescand.nl (info@opnaarnul.nl)';

interface BagResultaat {
  bouwjaar?: number;
  oppervlakte?: number;
  pandid?: string;
  bouwhoogteM?: number;
  plafondhoogteM?: number;
  bronnen: string[];     // bv ['PDOK-Locatieserver', 'BAG-WFS', '3D-BAG']
  geprobeerd: Array<{ endpoint: string; status: number | string; resultaat: string }>;
}

async function fetchJson(url: string, timeoutMs = 8000): Promise<{ ok: boolean; status: number; data?: unknown; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json,application/geo+json' },
      signal: controller.signal,
    });
    const ok = res.ok;
    const status = res.status;
    if (!ok) return { ok: false, status, error: `HTTP ${status}` };
    const data = await res.json();
    return { ok: true, status, data };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

export default async function bagRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.post('/bag/lookup', async (req, reply) => {
    const { adresId, rd_x, rd_y, pandid: clientPandid } = req.body as {
      adresId?: string;
      rd_x?: number;
      rd_y?: number;
      pandid?: string;
    };

    if (!adresId && !rd_x) {
      return reply.code(400).send({ error: 'adresId of rd_x/rd_y verplicht' });
    }

    const result: BagResultaat = { bronnen: [], geprobeerd: [] };

    // === 1. PDOK Locatieserver lookup ===
    if (adresId) {
      const fields = [
        'id', 'type', 'weergavenaam',
        'straatnaam', 'huisnummer', 'huisletter', 'huisnummertoevoeging',
        'postcode', 'woonplaatsnaam', 'gemeentenaam',
        'centroide_ll', 'centroide_rd',
        'bouwjaar', 'oppervlakte', 'gebruiksdoel',
        'pandid', 'nummeraanduiding_id', 'adresseerbaarobject_id',
      ].join(',');
      const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/lookup?id=${encodeURIComponent(adresId)}&fl=${fields}`;
      const r = await fetchJson(url);
      result.geprobeerd.push({ endpoint: 'PDOK-Locatieserver', status: r.status, resultaat: r.ok ? 'ok' : (r.error ?? 'fail') });

      if (r.ok) {
        const doc = (r.data as { response?: { docs?: Array<Record<string, unknown>> } })?.response?.docs?.[0];
        if (doc) {
          const eerste = <T,>(v: T | T[] | undefined): T | undefined => Array.isArray(v) ? v[0] : v;
          const som = (v: number | number[] | undefined): number | undefined => {
            if (Array.isArray(v)) { const t = v.reduce((a, b) => a + (b || 0), 0); return t > 0 ? t : undefined; }
            return v && v > 0 ? v : undefined;
          };

          const bouwjaar = eerste<number>(doc.bouwjaar as number | number[] | undefined);
          const opp = som(doc.oppervlakte as number | number[] | undefined);
          const pid = eerste<string>(doc.pandid as string | string[] | undefined);

          if (bouwjaar) { result.bouwjaar = bouwjaar; result.bronnen.push('PDOK-Locatieserver:bouwjaar'); }
          if (opp) { result.oppervlakte = opp; result.bronnen.push('PDOK-Locatieserver:oppervlakte'); }
          if (pid) { result.pandid = pid; result.bronnen.push('PDOK-Locatieserver:pandid'); }

          // Coördinaten extraheren voor fallback-queries
          const rdMatch = String(doc.centroide_rd ?? '').match(/POINT\(([^ ]+) ([^)]+)\)/);
          if (rdMatch && !rd_x) {
            (req.body as { rd_x?: number; rd_y?: number }).rd_x = parseFloat(rdMatch[1]);
            (req.body as { rd_x?: number; rd_y?: number }).rd_y = parseFloat(rdMatch[2]);
          }
        }
      }
    }

    // Effectieve coördinaten voor verdere lookups
    const effRdX = (req.body as { rd_x?: number }).rd_x ?? rd_x;
    const effRdY = (req.body as { rd_y?: number }).rd_y ?? rd_y;

    // === 2. BAG OGC v2 fallback (als bouwjaar/oppervlakte/pandid nog ontbreken) ===
    const needsBag = !result.bouwjaar || !result.oppervlakte || !result.pandid;
    if (needsBag && effRdX && effRdY) {
      const d = 8;
      const bbox = `${effRdX - d},${effRdY - d},${effRdX + d},${effRdY + d}`;
      const crs = encodeURIComponent('http://www.opengis.net/def/crs/EPSG/0/28992');
      const url = `https://api.pdok.nl/kadaster/bag/ogc/v2/collections/pand/items?bbox=${bbox}&bbox-crs=${crs}&limit=10`;
      const r = await fetchJson(url);
      result.geprobeerd.push({ endpoint: 'BAG-OGC-v2', status: r.status, resultaat: r.ok ? 'ok' : (r.error ?? 'fail') });

      if (r.ok) {
        const features = ((r.data as { features?: Array<{ properties?: Record<string, unknown>; id?: string }> })?.features) ?? [];
        if (features.length > 0) {
          const beste = kiesBestePand(features);
          if (beste) {
            if (!result.bouwjaar && beste.bouwjaar) { result.bouwjaar = beste.bouwjaar; result.bronnen.push('BAG-OGC-v2:bouwjaar'); }
            if (!result.oppervlakte && beste.oppervlakte) { result.oppervlakte = beste.oppervlakte; result.bronnen.push('BAG-OGC-v2:oppervlakte'); }
            if (!result.pandid && beste.pandid) { result.pandid = beste.pandid; result.bronnen.push('BAG-OGC-v2:pandid'); }
          }
        }
      }
    }

    // === 3. BAG WFS v2 fallback ===
    const stillNeedsBag = !result.bouwjaar || !result.oppervlakte || !result.pandid;
    if (stillNeedsBag && effRdX && effRdY) {
      const d = 8;
      const bboxWfs = `${effRdX - d},${effRdY - d},${effRdX + d},${effRdY + d},EPSG:28992`;
      const params = new URLSearchParams({
        service: 'WFS', version: '2.0.0', request: 'GetFeature',
        typeNames: 'bag:pand', bbox: bboxWfs,
        outputFormat: 'application/json', srsName: 'EPSG:28992', count: '10',
      });
      const url = `https://service.pdok.nl/lv/bag/wfs/v2_0?${params.toString()}`;
      const r = await fetchJson(url);
      result.geprobeerd.push({ endpoint: 'BAG-WFS', status: r.status, resultaat: r.ok ? 'ok' : (r.error ?? 'fail') });

      if (r.ok) {
        const features = ((r.data as { features?: Array<{ properties?: Record<string, unknown>; id?: string }> })?.features) ?? [];
        if (features.length > 0) {
          const beste = kiesBestePand(features);
          if (beste) {
            if (!result.bouwjaar && beste.bouwjaar) { result.bouwjaar = beste.bouwjaar; result.bronnen.push('BAG-WFS:bouwjaar'); }
            if (!result.oppervlakte && beste.oppervlakte) { result.oppervlakte = beste.oppervlakte; result.bronnen.push('BAG-WFS:oppervlakte'); }
            if (!result.pandid && beste.pandid) { result.pandid = beste.pandid; result.bronnen.push('BAG-WFS:pandid'); }
          }
        }
      }
    }

    // === 4. 3D BAG voor bouwhoogte ===
    const effPandid = clientPandid ?? result.pandid;
    if (effPandid) {
      const id = effPandid.startsWith('NL.IMBAG.Pand.') ? effPandid : `NL.IMBAG.Pand.${effPandid}`;
      const url = `https://api.3dbag.nl/collections/pand/items/${encodeURIComponent(id)}`;
      const r = await fetchJson(url);
      result.geprobeerd.push({ endpoint: '3D-BAG', status: r.status, resultaat: r.ok ? 'ok' : (r.error ?? 'fail') });

      if (r.ok) {
        const feature = (r.data as { feature?: { CityObjects?: Record<string, { attributes?: Record<string, number> }> }; CityObjects?: Record<string, { attributes?: Record<string, number> }> });
        const cityObjects = feature?.feature?.CityObjects ?? feature?.CityObjects ?? {};
        const firstObj = Object.values(cityObjects)[0];
        const attr = firstObj?.attributes ?? {};

        const hMaaiveld = attr.h_maaiveld;
        const hDakMediaan = attr.b3_h_dak_50p;
        if (typeof hMaaiveld === 'number' && typeof hDakMediaan === 'number') {
          const bouwhoogte = Math.max(0, hDakMediaan - hMaaiveld);
          const verdiepingen = Math.max(1, Math.round(bouwhoogte / 3));
          const plafond = Math.max(2.2, (bouwhoogte - 0.5) / verdiepingen);

          result.bouwhoogteM = Math.round(bouwhoogte * 10) / 10;
          result.plafondhoogteM = Math.round(plafond * 10) / 10;
          result.bronnen.push('3D-BAG:bouwhoogte');

          // Volume / hoogte als BVO-schatting voor wanneer we nog niets hebben
          const volume = attr.b3_volume_lod22 ?? attr.b3_volume_lod12;
          if (!result.oppervlakte && typeof volume === 'number' && bouwhoogte > 0.5) {
            const grondopp = volume / bouwhoogte;
            result.oppervlakte = Math.round(grondopp * verdiepingen);
            result.bronnen.push('3D-BAG:oppervlakte-schatting');
          }
        }
      }
    }

    app.log.info({ adresId, rd_x: effRdX, rd_y: effRdY, bronnen: result.bronnen }, 'BAG-lookup voltooid');
    return result;
  });
}

interface PandSamenvatting {
  pandid: string;
  bouwjaar?: number;
  oppervlakte?: number;
  status?: string;
}

function kiesBestePand(features: Array<{ properties?: Record<string, unknown>; id?: string }>): PandSamenvatting | null {
  // Filter weg: gesloopte/niet-gerealiseerde panden
  const actief = features.filter(f => {
    const status = String(f.properties?.status ?? '').toLowerCase();
    return !status.includes('gesloopt') && !status.includes('niet gerealiseerd');
  });
  const lijst = actief.length > 0 ? actief : features;

  // Hoogste bouwjaar eerst
  const sorted = lijst.slice().sort((a, b) => {
    const ja = Number(a.properties?.bouwjaar ?? a.properties?.oorspronkelijk_bouwjaar ?? 0);
    const jb = Number(b.properties?.bouwjaar ?? b.properties?.oorspronkelijk_bouwjaar ?? 0);
    return jb - ja;
  });

  const f = sorted[0];
  const props = f.properties ?? {};
  return {
    pandid: String(props.identificatie ?? f.id ?? ''),
    bouwjaar: Number(props.bouwjaar ?? props.oorspronkelijk_bouwjaar) || undefined,
    oppervlakte: Number(props.oppervlakte ?? props.oppervlakte_min) || undefined,
    status: props.status as string | undefined,
  };
}
