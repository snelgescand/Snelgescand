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
 * Fallback: zoek het pand direct op via de BAG2 OGC API (op coördinaten).
 *
 * Wordt gebruikt als PDOK Locatieserver geen bouwjaar of pandid teruggeeft
 * (komt voor bij sommige nieuwere of incomplete BAG-records).
 *
 * Bron: https://api.pdok.nl/lv/bag/ogc/v1 — gratis, geen key nodig.
 */
export interface BagPand {
  identificatie: string;
  oorspronkelijkBouwjaar?: number;
  oppervlakte?: number;
  status?: string;
}

export async function fetchBagPandViaCoordinaten(rd_x: number, rd_y: number): Promise<BagPand | null> {
  if (!rd_x || !rd_y) return null;

  // Bbox van ~10m rondom het adres-centroïde
  const d = 5;
  const bbox = `${rd_x - d},${rd_y - d},${rd_x + d},${rd_y + d}`;
  const url = `https://api.pdok.nl/lv/bag/ogc/v1/collections/pand/items?` +
    `bbox=${bbox}&bbox-crs=https://www.opengis.net/def/crs/EPSG/0/28992&limit=10`;

  console.log('[BAG-OGC] Fallback lookup URL:', url);

  try {
    const res = await fetch(url, { headers: { Accept: 'application/geo+json' } });
    if (!res.ok) {
      console.warn('[BAG-OGC] Failed:', res.status, res.statusText);
      return null;
    }
    const data = await res.json();
    const features = (data?.features ?? []) as Array<{ properties?: Record<string, unknown>; id?: string }>;
    console.log('[BAG-OGC] Found', features.length, 'pand(en) in bbox');
    if (features.length === 0) return null;

    // Pak het pand met het hoogste bouwjaar (= meest waarschijnlijk bewoond/in gebruik)
    const sorted = features.slice().sort((a, b) => {
      const ja = Number(a.properties?.oorspronkelijk_bouwjaar ?? 0);
      const jb = Number(b.properties?.oorspronkelijk_bouwjaar ?? 0);
      return jb - ja;
    });
    const f = sorted[0];
    const props = f.properties ?? {};
    const result: BagPand = {
      identificatie: String(props.identificatie ?? f.id ?? ''),
      oorspronkelijkBouwjaar: Number(props.oorspronkelijk_bouwjaar) || undefined,
      oppervlakte: Number(props.oppervlakte) || undefined,
      status: props.status as string | undefined,
    };
    console.log('[BAG-OGC] Beste pand:', result);
    return result;
  } catch (e) {
    console.warn('[BAG-OGC] Error:', e);
    return null;
  }
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
