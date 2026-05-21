/**
 * PDOK Locatieserver — gratis, publieke API van Kadaster.
 *
 * Documentatie: https://api.pdok.nl/bzk/locatieserver/search/v3_1/ui/
 *
 * Geen API-key nodig. Rate limits zijn ruim (10 req/sec).
 *
 * Twee soorten queries:
 *   - free: vrije zoekterm (autosuggest)
 *   - lookup: één ID → volledige adresgegevens incl. coördinaten
 */

const PDOK_BASE = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1';

export interface PdokSuggestie {
  id: string;
  weergavenaam: string;
  type: 'adres' | 'postcode' | 'woonplaats' | 'gemeente' | 'provincie';
  score: number;
}

export interface PdokAdres {
  id: string;
  weergavenaam: string;
  postcode: string;
  huisnummer: number;
  huisnummertoevoeging?: string;
  straatnaam: string;
  woonplaatsnaam: string;
  provincienaam: string;
  // RD-coördinaten (EPSG:28992)
  rd_x: number;
  rd_y: number;
  // WGS84 (lat/lon)
  lat: number;
  lon: number;
  // Bouwjaar uit BAG (alleen voor verblijfsobjecten)
  bouwjaar?: number;
  // Vloeroppervlakte uit BAG (m²)
  oppervlakte?: number;
  // BAG verblijfsobject-ID
  adresseerbaarobject_id?: string;
  pandid?: string;
}

/**
 * Suggesties ophalen op basis van een vrije zoekterm.
 * Geschikt voor autocomplete in een formulierveld.
 */
export async function pdokSuggest(query: string): Promise<PdokSuggestie[]> {
  if (!query || query.length < 3) return [];

  const url = `${PDOK_BASE}/suggest?q=${encodeURIComponent(query)}&rows=8&fq=type:adres`;
  const res = await fetch(url);
  if (!res.ok) return [];

  const data = await res.json();
  const docs = data?.response?.docs ?? [];
  return docs.map((d: { id: string; weergavenaam: string; type: PdokSuggestie['type']; score: number }) => ({
    id: d.id,
    weergavenaam: d.weergavenaam,
    type: d.type,
    score: d.score,
  }));
}

/**
 * Volledige adresgegevens ophalen voor een geselecteerde suggestie.
 */
export async function pdokLookup(id: string): Promise<PdokAdres | null> {
  // EXPLICIETE fl-parameter — `fl=*` geeft soms niet alle BAG-velden mee.
  // Door specifiek bouwjaar/oppervlakte/pandid op te vragen forceren we PDOK
  // die ook daadwerkelijk te retourneren.
  const fields = [
    'id', 'type', 'weergavenaam', 'score',
    'straatnaam', 'huisnummer', 'huisletter', 'huisnummertoevoeging',
    'postcode', 'woonplaatsnaam', 'gemeentenaam', 'provincienaam',
    'centroide_ll', 'centroide_rd',
    'bouwjaar', 'oppervlakte', 'gebruiksdoel',
    'pandid', 'nummeraanduiding_id', 'adresseerbaarobject_id',
  ].join(',');

  const url = `${PDOK_BASE}/lookup?id=${encodeURIComponent(id)}&fl=${fields}`;
  console.log('[PDOK] Lookup URL:', url);
  const res = await fetch(url);
  if (!res.ok) {
    console.warn('[PDOK] Lookup mislukt:', res.status, res.statusText);
    return null;
  }

  const data = await res.json();
  const doc = data?.response?.docs?.[0];
  console.log('[PDOK] Volledige doc uit lookup:', doc);
  if (!doc) return null;

  // Centroide is een WKT POINT-string: "POINT(x y)"
  const rd = parseWktPoint(doc.centroide_rd);
  const ll = parseWktPoint(doc.centroide_ll);

  // KRITIEK: PDOK retourneert bouwjaar en oppervlakte als ARRAY
  // (omdat een adres uit meerdere panden kan bestaan).
  const eerste = <T,>(v: T | T[] | undefined): T | undefined =>
    Array.isArray(v) ? v[0] : v;

  const som = (v: number | number[] | undefined): number | undefined => {
    if (Array.isArray(v)) {
      const totaal = v.reduce((a, b) => a + (b || 0), 0);
      return totaal > 0 ? totaal : undefined;
    }
    return v && v > 0 ? v : undefined;
  };

  const adres: PdokAdres = {
    id: doc.id,
    weergavenaam: doc.weergavenaam,
    postcode: doc.postcode,
    huisnummer: doc.huisnummer,
    huisnummertoevoeging: doc.huisnummertoevoeging,
    straatnaam: doc.straatnaam,
    woonplaatsnaam: doc.woonplaatsnaam,
    provincienaam: doc.provincienaam,
    rd_x: rd?.x ?? 0,
    rd_y: rd?.y ?? 0,
    lat: ll?.y ?? 0,
    lon: ll?.x ?? 0,
    bouwjaar: eerste<number>(doc.bouwjaar),
    oppervlakte: som(doc.oppervlakte),
    adresseerbaarobject_id: eerste<string>(doc.adresseerbaarobject_id),
    pandid: eerste<string>(doc.pandid),
  };

  console.log('[PDOK] Genormaliseerd:', {
    bouwjaar: adres.bouwjaar,
    oppervlakte: adres.oppervlakte,
    pandid: adres.pandid,
    coords: `${adres.rd_x}, ${adres.rd_y}`,
  });

  return adres;
}

function parseWktPoint(wkt: string | undefined): { x: number; y: number } | null {
  if (!wkt) return null;
  const m = wkt.match(/POINT\(([^ ]+) ([^)]+)\)/);
  if (!m) return null;
  return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
}

/**
 * Fallback: zoek het pand direct op via PDOK BAG-services op coördinaten.
 *
 * Wordt gebruikt als PDOK Locatieserver geen bouwjaar of pandid teruggeeft.
 *
 * Strategie (in volgorde):
 *  1. Nieuwe BAG OGC API v2 (sinds 2025): https://api.pdok.nl/kadaster/bag/ogc/v2
 *     De oude v1 (lv/bag/ogc/v1) is uitgefaseerd en geeft 404.
 *  2. BAG WFS v2.0 fallback: stabiele service, al jaren beschikbaar
 *     https://service.pdok.nl/lv/bag/wfs/v2_0
 */
export interface BagPand {
  identificatie: string;
  oorspronkelijkBouwjaar?: number;
  oppervlakte?: number;
  status?: string;
  bron?: 'BAG-OGC-v2' | 'BAG-WFS';
}

export async function fetchBagPandViaCoordinaten(rd_x: number, rd_y: number): Promise<BagPand | null> {
  if (!rd_x || !rd_y) {
    console.warn('[BAG] Geen RD-coördinaten voor pand-lookup');
    return null;
  }

  // Probeer eerst BAG OGC v2 (nieuwe endpoint)
  const ogc = await tryBagOgcV2(rd_x, rd_y);
  if (ogc) return ogc;

  // Fallback naar BAG WFS — stabiele service
  const wfs = await tryBagWfs(rd_x, rd_y);
  if (wfs) return wfs;

  console.warn('[BAG] Beide endpoints faalden — pand niet gevonden');
  return null;
}

/** Nieuwe BAG OGC API v2 — sinds 2025 in productie */
async function tryBagOgcV2(rd_x: number, rd_y: number): Promise<BagPand | null> {
  const d = 8;  // bbox van ~16m rondom
  const bbox = `${rd_x - d},${rd_y - d},${rd_x + d},${rd_y + d}`;
  // bbox-crs als percent-encoded URI (http, niet https)
  const crsParam = encodeURIComponent('http://www.opengis.net/def/crs/EPSG/0/28992');
  const url = `https://api.pdok.nl/kadaster/bag/ogc/v2/collections/pand/items?bbox=${bbox}&bbox-crs=${crsParam}&limit=10`;

  console.log('[BAG-OGC-v2] Lookup URL:', url);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/geo+json' } });
    if (!res.ok) {
      console.warn('[BAG-OGC-v2] Failed:', res.status, res.statusText);
      return null;
    }
    const data = await res.json();
    const features = (data?.features ?? []) as Array<{ properties?: Record<string, unknown>; id?: string }>;
    console.log('[BAG-OGC-v2] Found', features.length, 'pand(en)');
    if (features.length === 0) return null;

    return kiesBestePand(features, 'BAG-OGC-v2');
  } catch (e) {
    console.warn('[BAG-OGC-v2] Error:', e);
    return null;
  }
}

/** BAG WFS v2.0 — stabiele service met jaren ervaring */
async function tryBagWfs(rd_x: number, rd_y: number): Promise<BagPand | null> {
  const d = 8;
  // BAG WFS verwacht bbox in formaat: minX,minY,maxX,maxY,EPSG:CODE
  const bbox = `${rd_x - d},${rd_y - d},${rd_x + d},${rd_y + d},EPSG:28992`;
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: 'bag:pand',
    bbox,
    outputFormat: 'application/json',
    srsName: 'EPSG:28992',
    count: '10',
  });
  const url = `https://service.pdok.nl/lv/bag/wfs/v2_0?${params.toString()}`;
  console.log('[BAG-WFS] Lookup URL:', url);

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      console.warn('[BAG-WFS] Failed:', res.status, res.statusText);
      return null;
    }
    const data = await res.json();
    const features = (data?.features ?? []) as Array<{ properties?: Record<string, unknown>; id?: string }>;
    console.log('[BAG-WFS] Found', features.length, 'pand(en)');
    if (features.length === 0) return null;

    return kiesBestePand(features, 'BAG-WFS');
  } catch (e) {
    console.warn('[BAG-WFS] Error:', e);
    return null;
  }
}

/** Kies het beste pand uit een lijst features: hoogste bouwjaar, status 'in gebruik'. */
function kiesBestePand(
  features: Array<{ properties?: Record<string, unknown>; id?: string }>,
  bron: 'BAG-OGC-v2' | 'BAG-WFS',
): BagPand | null {
  // Filter weg: gesloopte panden / panden in aanbouw
  const actief = features.filter(f => {
    const status = String(f.properties?.status ?? '').toLowerCase();
    return !status.includes('gesloopt') && !status.includes('niet gerealiseerd');
  });
  const lijst = actief.length > 0 ? actief : features;

  // Sorteer op bouwjaar (hoogste eerst = waarschijnlijk grootste/recentste pand)
  const sorted = lijst.slice().sort((a, b) => {
    const ja = Number(a.properties?.bouwjaar ?? a.properties?.oorspronkelijk_bouwjaar ?? 0);
    const jb = Number(b.properties?.bouwjaar ?? b.properties?.oorspronkelijk_bouwjaar ?? 0);
    return jb - ja;
  });

  const f = sorted[0];
  const props = f.properties ?? {};
  const result: BagPand = {
    identificatie: String(props.identificatie ?? f.id ?? ''),
    oorspronkelijkBouwjaar: Number(props.bouwjaar ?? props.oorspronkelijk_bouwjaar) || undefined,
    oppervlakte: Number(props.oppervlakte ?? props.oppervlakte_min) || undefined,
    status: props.status as string | undefined,
    bron,
  };
  console.log(`[${bron}] Beste pand:`, result);
  return result;
}

/**
 * Geef de URL terug naar een luchtfoto-tegel via de PDOK WMS-service.
 *
 * "Luchtfoto Actueel Ortho 25cm RGB" — gratis, publiek, geen key nodig.
 * Documentatie: https://www.pdok.nl/introductie/-/article/luchtfoto-pdok
 *
 * @param rdX RD-X coördinaat (EPSG:28992)
 * @param rdY RD-Y coördinaat
 * @param breedteMeter halve breedte van de bbox in meter (default 50m = 100m totaal zicht)
 * @param pixelBreedte breedte van de uitvoer in pixels
 */
export function luchtfotoUrl(rdX: number, rdY: number, breedteMeter = 50, pixelBreedte = 600): string {
  const minX = rdX - breedteMeter;
  const maxX = rdX + breedteMeter;
  const minY = rdY - breedteMeter;
  const maxY = rdY + breedteMeter;

  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetMap',
    LAYERS: 'Actueel_ortho25',
    STYLES: '',
    CRS: 'EPSG:28992',
    BBOX: `${minX},${minY},${maxX},${maxY}`,
    WIDTH: pixelBreedte.toString(),
    HEIGHT: pixelBreedte.toString(),
    FORMAT: 'image/jpeg',
  });

  return `https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0?${params.toString()}`;
}

/**
 * Haal 3D BAG-hoogtegegevens op voor een pand.
 *
 * Bron: 3DBAG REST API (TU Delft, gratis open data).
 * Endpoint: https://api.3dbag.nl/collections/pand/items/NL.IMBAG.Pand.{pandid}
 *
 * Retourneert hoogte tot mediane dakhoogte (b3_h_dak_50p) en max dakhoogte,
 * en een geschatte plafondhoogte (gebouwhoogte - 0,5 m dak-marge,
 * gedeeld door aantal verdiepingen — voor sportclubhuis meestal 1).
 */
export interface Bag3dHoogte {
  /** Maaiveld-hoogte t.o.v. NAP (m) */
  hMaaiveld?: number;
  /** Mediane dakhoogte t.o.v. NAP (m) */
  hDakMediaan?: number;
  /** Maximale dakhoogte t.o.v. NAP (m) — nokhoogte */
  hDakMax?: number;
  /** Berekende bouwhoogte (dak - maaiveld), in meter */
  bouwhoogteM?: number;
  /** Geschatte plafondhoogte voor 1-verdieping clubhuis (bouwhoogte - 0,5 m dak) */
  geschattePlafondhoogteM?: number;
  /** Aantal verdiepingen (heuristiek: bouwhoogte / 3) */
  geschatteVerdiepingen?: number;
  /** Volume volgens 3D BAG (m³) */
  volumeM3?: number;
  /** Geschatte BVO uit 3D BAG: volume / bouwhoogte × aantal verdiepingen */
  geschatteOppervlakteM2?: number;
}

export async function fetch3dBagHoogte(pandid: string): Promise<Bag3dHoogte | null> {
  if (!pandid) return null;
  // 3D BAG ID-format: NL.IMBAG.Pand.{pandid}
  const formattedId = pandid.startsWith('NL.IMBAG.Pand.') ? pandid : `NL.IMBAG.Pand.${pandid}`;
  const url = `https://api.3dbag.nl/collections/pand/items/${encodeURIComponent(formattedId)}`;

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();

    // CityJSONFeature structuur — attributen zitten op city_objects niveau
    const feature = data?.feature ?? data?.features?.[0] ?? data;
    const cityObjects = feature?.CityObjects ?? {};
    const firstObj = Object.values(cityObjects)[0] as { attributes?: Record<string, number> } | undefined;
    const attr = firstObj?.attributes ?? {};

    const hMaaiveld = attr.h_maaiveld;
    // Mediane dakhoogte: b3_h_dak_50p, max: b3_h_dak_max (oude naam: b3_h_dak_70p ook mogelijk)
    const hDakMediaan = attr.b3_h_dak_50p ?? attr['b3_h_dak_50p'];
    const hDakMax = attr.b3_h_dak_max ?? attr['b3_h_dak_max'] ?? attr.b3_h_dak_70p;
    // Volume in m³ — voor BVO-schatting bij meerdere verdiepingen
    const volume = attr.b3_volume_lod22 ?? attr.b3_volume_lod12 ?? attr['b3_volume_lod22'];

    if (typeof hMaaiveld !== 'number' || typeof hDakMediaan !== 'number') {
      return { hMaaiveld, hDakMediaan, hDakMax, volumeM3: typeof volume === 'number' ? volume : undefined };
    }

    const bouwhoogte = Math.max(0, hDakMediaan - hMaaiveld);
    // Heuristiek: typische verdiepingshoogte 3 m, plafond = bouwhoogte - 0,5m dak
    const verdiepingen = Math.max(1, Math.round(bouwhoogte / 3));
    const plafondPerVerdieping = Math.max(2.2, (bouwhoogte - 0.5) / verdiepingen);

    // BVO-schatting uit volume: volume / bouwhoogte × verdiepingen
    // (volume / hoogte = grondoppervlak; × verdiepingen = totale BVO)
    let geschatteBvo: number | undefined;
    if (typeof volume === 'number' && bouwhoogte > 0.5) {
      const grondoppervlak = volume / bouwhoogte;
      geschatteBvo = Math.round(grondoppervlak * verdiepingen);
    }

    return {
      hMaaiveld,
      hDakMediaan,
      hDakMax,
      bouwhoogteM: Math.round(bouwhoogte * 10) / 10,
      geschattePlafondhoogteM: Math.round(plafondPerVerdieping * 10) / 10,
      geschatteVerdiepingen: verdiepingen,
      volumeM3: typeof volume === 'number' ? Math.round(volume) : undefined,
      geschatteOppervlakteM2: geschatteBvo,
    };
  } catch (e) {
    console.warn('3D BAG fetch mislukt:', e);
    return null;
  }
}
