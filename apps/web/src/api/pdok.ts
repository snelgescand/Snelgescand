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

  // KRITIEK: PDOK retourneert bouwjaar en oppervlakte als ARRAY
  // (omdat een adres uit meerdere panden kan bestaan). We nemen het eerste
  // ofwel het maximum, afhankelijk van wat zinnig is.
  const eerste = <T,>(v: T | T[] | undefined): T | undefined =>
    Array.isArray(v) ? v[0] : v;

  const som = (v: number | number[] | undefined): number | undefined => {
    if (Array.isArray(v)) return v.reduce((a, b) => a + (b || 0), 0);
    return v;
  };

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
    // bouwjaar: meestal één getal, pak het eerste als array
    bouwjaar: eerste<number>(doc.bouwjaar),
    // oppervlakte: bij meerdere panden tellen we op (= totaal BVO)
    oppervlakte: som(doc.oppervlakte),
    adresseerbaarobject_id: eerste<string>(doc.adresseerbaarobject_id),
    pandid: eerste<string>(doc.pandid),
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
