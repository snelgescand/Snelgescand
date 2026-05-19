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
  const url = `${PDOK_BASE}/lookup?id=${encodeURIComponent(id)}&fl=*`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  const doc = data?.response?.docs?.[0];
  if (!doc) return null;

  // Centroide is een WKT POINT-string: "POINT(x y)"
  const rd = parseWktPoint(doc.centroide_rd);
  const ll = parseWktPoint(doc.centroide_ll);

  return {
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
    bouwjaar: doc.bouwjaar,
    oppervlakte: doc.oppervlakte,
    adresseerbaarobject_id: doc.adresseerbaarobject_id,
    pandid: Array.isArray(doc.pandid) ? doc.pandid[0] : doc.pandid,
  };
}

function parseWktPoint(wkt: string | undefined): { x: number; y: number } | null {
  if (!wkt) return null;
  const m = wkt.match(/POINT\(([^ ]+) ([^)]+)\)/);
  if (!m) return null;
  return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
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
