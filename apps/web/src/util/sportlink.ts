/**
 * Sportlink-koppeling — PUBLIEKE widget-API (data.sportlink.com).
 *
 * Dit is dezelfde publieke API die clubs op hun eigen website gebruiken om hun
 * wedstrijdprogramma te tonen. Er is alléén een publieke `client_id` van de club
 * nodig — geen inlog en geen (gereverse-engineerde) bonds-secrets.
 *
 * We halen het hele seizoen aan THUIS-wedstrijden op (thuis=JA, uit=NEE), want
 * alleen thuiswedstrijden zorgen voor douchegebruik op de eigen accommodatie.
 * Daaruit bepalen we het drukste weekend en zetten dat om naar uur-rijen.
 *
 * Bron-API ontdekt via de open-source "Sportlink Club Info Viewer"
 * (data.sportlink.com/programma?...&client_id=...). Velden uit die response:
 *   wedstrijddatum, tijd, thuisteam, uitteam, competitiesoort, veld, accommodatie.
 */

const SPORTLINK_PROGRAMMA_URL = 'https://data.sportlink.com/programma';

export interface SportlinkWedstrijd {
  datum: Date;
  tijd: string;          // "HH:MM" indien bekend
  thuisteam: string;
  uitteam: string;
  competitiesoort: string;
}

export interface DruksteWeekend {
  /** Zaterdag-datum die het weekend aanduidt (voor weergave). */
  zaterdag: Date;
  label: string;          // bv. "za 12 okt – zo 13 okt 2025"
  wedstrijden: SportlinkWedstrijd[];
  aantal: number;
}

/** Haal het thuis-programma (heel seizoen) op via de publieke Sportlink-widget-API. */
export async function haalThuisProgramma(clientId: string, aantalDagen = 400): Promise<SportlinkWedstrijd[]> {
  const id = clientId.trim();
  if (!id) throw new Error('Geen Sportlink client_id ingevuld.');

  const params = new URLSearchParams({
    gebruiklokaleteamgegevens: 'NEE',
    aantaldagen: String(aantalDagen),
    eigenwedstrijden: 'JA',
    thuis: 'JA',
    uit: 'NEE',
    client_id: id,
  });
  const url = `${SPORTLINK_PROGRAMMA_URL}?${params.toString()}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch (e) {
    throw new Error('Kon Sportlink niet bereiken (mogelijk CORS of netwerk). Controleer de client_id.');
  }
  if (!res.ok) {
    throw new Error(`Sportlink gaf status ${res.status}. Controleer of de client_id klopt.`);
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error('Sportlink gaf geen geldige JSON terug (verkeerde client_id?).');
  }
  if (!Array.isArray(data)) {
    throw new Error('Onverwacht antwoord van Sportlink (geen wedstrijdlijst).');
  }

  const wedstrijden: SportlinkWedstrijd[] = [];
  for (const raw of data as Array<Record<string, unknown>>) {
    const datum = parseSportlinkDatum(raw.wedstrijddatum);
    if (!datum) continue;
    wedstrijden.push({
      datum,
      tijd: typeof raw.tijd === 'string' ? raw.tijd : '',
      thuisteam: String(raw.thuisteam ?? ''),
      uitteam: String(raw.uitteam ?? ''),
      competitiesoort: String(raw.competitiesoort ?? ''),
    });
  }
  return wedstrijden;
}

/**
 * Bepaal het drukste weekend (zaterdag + zondag samen) op aantal thuiswedstrijden.
 * Doordeweekse wedstrijden worden bij het dichtstbijzijnde weekend opgeteld voor
 * de telling, maar de uur-rijen behouden hun eigen dag.
 */
export function vindDruksteWeekend(wedstrijden: SportlinkWedstrijd[]): DruksteWeekend | null {
  if (!wedstrijden.length) return null;

  // Groepeer per weekend-sleutel = de zaterdag van dat weekend (ISO).
  const perWeekend = new Map<string, SportlinkWedstrijd[]>();
  for (const w of wedstrijden) {
    const zat = zaterdagVan(w.datum);
    const sleutel = zat.toISOString().slice(0, 10);
    const lijst = perWeekend.get(sleutel) ?? [];
    lijst.push(w);
    perWeekend.set(sleutel, lijst);
  }

  let beste: { zaterdag: Date; lijst: SportlinkWedstrijd[] } | null = null;
  for (const [sleutel, lijst] of perWeekend) {
    if (!beste || lijst.length > beste.lijst.length) {
      beste = { zaterdag: new Date(sleutel + 'T00:00:00'), lijst };
    }
  }
  if (!beste) return null;

  beste.lijst.sort((a, b) => a.datum.getTime() - b.datum.getTime() || a.tijd.localeCompare(b.tijd));
  return {
    zaterdag: beste.zaterdag,
    label: weekendLabel(beste.zaterdag),
    wedstrijden: beste.lijst,
    aantal: beste.lijst.length,
  };
}

export interface UurRijData {
  dag: 'maandag' | 'dinsdag' | 'woensdag' | 'donderdag' | 'vrijdag' | 'zaterdag' | 'zondag';
  uur: number;            // 0-23 — het uur waarin gedoucht wordt
  personen: number;
}

/**
 * Zet de wedstrijden van een weekend om naar douche-uur-rijen.
 *
 * Aanname: spelers van een thuiswedstrijd douchen ~2 uur na aanvang (eind wedstrijd
 * + nazit). Per thuiswedstrijd komt ~1 team (teamgrootte) onder de douche. Meerdere
 * wedstrijden in hetzelfde uur worden opgeteld.
 */
export function weekendNaarUurRijen(weekend: DruksteWeekend, teamgrootte: number): UurRijData[] {
  const acc = new Map<string, UurRijData>();
  for (const w of weekend.wedstrijden) {
    const dag = dagNaam(w.datum);
    const aanvang = parseUur(w.tijd);
    // Douche-uur = aanvang + 2u (wedstrijd ~1,5u + omkleden). Onbekende tijd → 14:00.
    const doucheUur = Math.max(0, Math.min(23, (aanvang ?? 14) + 2));
    const sleutel = `${dag}-${doucheUur}`;
    const bestaand = acc.get(sleutel);
    if (bestaand) {
      bestaand.personen += teamgrootte;
    } else {
      acc.set(sleutel, { dag, uur: doucheUur, personen: teamgrootte });
    }
  }
  return [...acc.values()].sort((a, b) => a.uur - b.uur);
}

/* ===================== helpers ===================== */

function parseSportlinkDatum(v: unknown): Date | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  // Probeer ISO (YYYY-MM-DD…) eerst, dan DD-MM-YYYY.
  let d = new Date(v);
  if (!isNaN(d.getTime())) return d;
  const m = v.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (m) {
    d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function parseUur(tijd: string): number | null {
  const m = tijd.match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  const u = Number(m[1]);
  return u >= 0 && u <= 23 ? u : null;
}

/** Geef de zaterdag (00:00) van het weekend waartoe deze datum hoort. */
function zaterdagVan(d: Date): Date {
  const dag = d.getDay(); // 0=zo, 1=ma, ... 6=za
  const verschuiving = dag === 0 ? -1 : 6 - dag; // zo → vorige za; anders naar komende za
  const zat = new Date(d);
  zat.setHours(0, 0, 0, 0);
  zat.setDate(zat.getDate() + verschuiving);
  return zat;
}

const DAG_NAMEN = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'] as const;
function dagNaam(d: Date): UurRijData['dag'] {
  return DAG_NAMEN[d.getDay()];
}

function weekendLabel(zaterdag: Date): string {
  const zondag = new Date(zaterdag);
  zondag.setDate(zondag.getDate() + 1);
  const fmt = (x: Date) => x.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  return `za ${fmt(zaterdag)} – zo ${fmt(zondag)} ${zaterdag.getFullYear()}`;
}
