/**
 * Logo-lookup endpoint.
 *
 * Probeert op basis van clubnaam een paar gangbare domein-varianten
 * (clubnaam.nl, vvclubnaam.nl, etc), fetcht de homepage, en extraheert
 * `<meta property="og:image">` of `<link rel="apple-touch-icon">`.
 *
 * Returnt voor de eerste werkende kandidaat een base64 dataUrl van het logo.
 */

import type { FastifyInstance } from 'fastify';

const TIMEOUT_MS = 5000;
const USER_AGENT = 'Mozilla/5.0 (compatible; OpNaarNulBot/1.0; +https://snelgescand.nl)';

/**
 * Genereer kandidaat-domeinen voor een clubnaam.
 *
 * Voor "VV Voorbeeld" → ['vvvoorbeeld.nl', 'voorbeeld.nl', 'svvoorbeeld.nl', ...].
 * Voor "Hockeyclub Zandvoort" → ['hczandvoort.nl', 'zandvoort.nl', 'mhczandvoort.nl', ...].
 */
function genereerKandidaten(clubnaam: string): string[] {
  const schoon = clubnaam
    .toLowerCase()
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim();

  // Splits in tokens
  const tokens = schoon.split(/\s+/).filter(t => t.length > 0);
  if (tokens.length === 0) return [];

  // Verwijder prefixen "vv", "sv", "rkvv", "hc", "mhc", "tc", etc.
  const verenigingsPrefixes = ['vv', 'sv', 'rkvv', 'hc', 'mhc', 'tc', 'mvv', 'fc', 'hv', 'avv', 'sc', 'asv', 'gsv', 'cvv', 'rvv', 'wsv'];
  const eerste = tokens[0];
  const isPrefix = verenigingsPrefixes.includes(eerste);
  const restNaam = isPrefix ? tokens.slice(1).join('') : tokens.join('');
  const volleNaam = tokens.join('');

  // Bouw kandidaten op
  const kandidaten = new Set<string>();
  if (volleNaam) {
    kandidaten.add(`${volleNaam}.nl`);
    kandidaten.add(`www.${volleNaam}.nl`);
  }
  if (restNaam && restNaam !== volleNaam) {
    kandidaten.add(`${restNaam}.nl`);
    kandidaten.add(`www.${restNaam}.nl`);
    // Met populaire sportclub-prefixen
    for (const p of ['vv', 'sv', 'hc', 'mhc', 'rkvv']) {
      kandidaten.add(`${p}${restNaam}.nl`);
      kandidaten.add(`www.${p}${restNaam}.nl`);
    }
  }
  // Bv. naam met streepjes
  if (tokens.length > 1) {
    kandidaten.add(`${tokens.join('-')}.nl`);
  }

  return Array.from(kandidaten);
}

/**
 * Fetch een URL met timeout. Returnt null bij elke fout.
 */
async function fetchMetTimeout(url: string, timeoutMs = TIMEOUT_MS): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, 'Accept': '*/*' },
      redirect: 'follow',
    });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse HTML en extraheer logo-URL via og:image / apple-touch-icon / icon link.
 *
 * Volgorde van voorkeur:
 * 1. og:image (groot, gericht op deelbaar materiaal)
 * 2. apple-touch-icon (vaak 180x180 logo)
 * 3. shortcut icon / icon (favicon, soms wel mooi)
 */
function extraheerLogoUrl(html: string, baseUrl: string): string | null {
  // og:image
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
         ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (og) return resolveUrl(og[1], baseUrl);

  // apple-touch-icon (en precomposed)
  const apple = html.match(/<link[^>]+rel=["']apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["']/i)
            ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']apple-touch-icon[^"']*["']/i);
  if (apple) return resolveUrl(apple[1], baseUrl);

  // shortcut icon / icon
  const icon = html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i)
           ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i);
  if (icon) return resolveUrl(icon[1], baseUrl);

  return null;
}

function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

/**
 * Fetch een logo URL en encodeer als base64 dataUrl.
 * Returnt null als de URL niet bereikbaar is of geen geldig image is.
 */
async function fetchEnEncodeer(url: string): Promise<{ dataUrl: string; bytes: number; mimeType: string } | null> {
  const res = await fetchMetTimeout(url, TIMEOUT_MS);
  if (!res || !res.ok) return null;
  const ct = res.headers.get('content-type') ?? 'image/png';
  if (!ct.startsWith('image/')) return null;

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0 || buf.length > 2_000_000) return null;  // max 2MB

  return {
    dataUrl: `data:${ct};base64,${buf.toString('base64')}`,
    bytes: buf.length,
    mimeType: ct,
  };
}

export default async function logoRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  /**
   * Zoek logo op basis van clubnaam.
   * Probeert verschillende domein-varianten en returnt de eerste werkende.
   */
  app.get('/logo/zoek', async (req, reply) => {
    const { clubnaam } = req.query as { clubnaam?: string };
    if (!clubnaam || clubnaam.length < 2) {
      return reply.code(400).send({ error: 'clubnaam querystring verplicht' });
    }

    const kandidaten = genereerKandidaten(clubnaam);
    app.log.info({ clubnaam, kandidaten }, 'Logo-zoek gestart');

    for (const domain of kandidaten) {
      const startUrl = `https://${domain}`;
      const res = await fetchMetTimeout(startUrl);
      if (!res || !res.ok) continue;

      const html = await res.text();
      const logoUrl = extraheerLogoUrl(html, startUrl);
      if (!logoUrl) continue;

      const logo = await fetchEnEncodeer(logoUrl);
      if (!logo) continue;

      app.log.info({ clubnaam, domain, logoUrl, bytes: logo.bytes }, 'Logo gevonden');
      return {
        gevonden: true,
        domein: domain,
        websiteUrl: startUrl,
        logoUrl,
        dataUrl: logo.dataUrl,
        mimeType: logo.mimeType,
        bytes: logo.bytes,
      };
    }

    return {
      gevonden: false,
      geprobeerd: kandidaten,
    };
  });

  /**
   * Download een logo van een URL die de gebruiker opgeeft.
   * Handmatige fallback als auto-zoek niet werkt.
   */
  app.post('/logo/download', async (req, reply) => {
    const { url } = req.body as { url?: string };
    if (!url || !/^https?:\/\//.test(url)) {
      return reply.code(400).send({ error: 'URL verplicht en moet beginnen met http(s)://' });
    }

    // Als de URL een HTML-pagina is, eerst og:image eruit halen
    const res = await fetchMetTimeout(url);
    if (!res || !res.ok) {
      return reply.code(404).send({ error: 'URL niet bereikbaar', status: res?.status ?? 0 });
    }

    const ct = res.headers.get('content-type') ?? '';
    let logoUrl = url;

    if (ct.startsWith('text/html')) {
      const html = await res.text();
      const found = extraheerLogoUrl(html, url);
      if (!found) {
        return reply.code(404).send({ error: 'Geen logo gevonden op deze pagina' });
      }
      logoUrl = found;
    } else if (!ct.startsWith('image/')) {
      return reply.code(400).send({ error: `Onverwacht content-type: ${ct}` });
    }

    const logo = await fetchEnEncodeer(logoUrl);
    if (!logo) {
      return reply.code(400).send({ error: 'Logo kon niet gedownload of geëncodeerd worden' });
    }

    return {
      gevonden: true,
      logoUrl,
      dataUrl: logo.dataUrl,
      mimeType: logo.mimeType,
      bytes: logo.bytes,
    };
  });
}
