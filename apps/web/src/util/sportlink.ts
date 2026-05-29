/**
 * Sportlink-koppeling — privé bonds-API via CORS-proxy (alleen voetbal).
 *
 * Werking:
 *  1. Login via OAuth password-grant → access token (gecached)
 *  2. Clubs ophalen via de memberportal-API → gebruiker kiest een club
 *  3. Wedstrijden ophalen voor die club → drukste weekend bepalen
 *
 * De proxy is nodig omdat de bonds-API geen CORS-headers stuurt naar browsers.
 */

// ── Configuratie ─────────────────────────────────────────────────────────────
// Pas alleen deze drie waarden aan als de proxy-URL of inloggegevens wijzigen.
const CORS_PROXY   = 'https://cors-proxy.clubinfoproxy.workers.dev/proxy?url=';
const SPORTLINK_BASE = 'https://app-vnl-production.sportlink.com';
const SPORTLINK_USERNAME = 'rxxnrextolzwlqsspy@hthlm.com';
const SPORTLINK_PASSWORD = 'test1234';
// ─────────────────────────────────────────────────────────────────────────────

const CLUBS_ENDPOINT = '/entity/common/memberportal/app/club/Clubs?v=1';
const TOKEN_ENDPOINT = '/oauth/token';

function proxiedUrl(path: string): string {
  return `${CORS_PROXY}${encodeURIComponent(`${SPORTLINK_BASE}${path}`)}`;
}

/* ============================================================
   Types
============================================================ */

export interface SportlinkClub {
  id: string;
  naam: string;
}

export interface SportlinkWedstrijd {
  datum: Date;
  tijd: string;
  thuisteam: string;
  uitteam: string;
  competitiesoort: string;
}

export interface DruksteWeekend {
  zaterdag: Date;
  label: string;
  wedstrijden: SportlinkWedstrijd[];
  aantal: number;
}

export interface UurRijData {
  dag: 'maandag' | 'dinsdag' | 'woensdag' | 'donderdag' | 'vrijdag' | 'zaterdag' | 'zondag';
  uur: number;
  personen: number;
}

interface OAuthTokenResponse {
  access_token: string;
  expires_in?: number;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

/* ============================================================
   Token cache
============================================================ */

let tokenCache: CachedToken | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.accessToken;
  }

  const res = await fetch(proxiedUrl(TOKEN_ENDPOINT), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      username: SPORTLINK_USERNAME,
      password: SPORTLINK_PASSWORD,
      grant_type: 'password',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sportlink login mislukt (${res.status}): ${text}`);
  }

  const data = (await res.json()) as OAuthTokenResponse;
  if (!data.access_token) throw new Error('Geen access token ontvangen van Sportlink.');

  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000,
  };
  return data.access_token;
}

/* ============================================================
   Authenticated request helper
============================================================ */

async function sportlinkRequest<T>(endpoint: string): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(proxiedUrl(endpoint), {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sportlink request mislukt (${res.status}): ${text}`);
  }
  return res.json();
}

/* ============================================================
   Clubs ophalen
   Geeft een gesorteerde lijst van clubs terug zodat de gebruiker
   er één kan kiezen in de UI.
============================================================ */

export async function haalClubsOp(): Promise<SportlinkClub[]> {
  const raw = await sportlinkRequest<unknown>(CLUBS_ENDPOINT);

  // Debug: log de ruwe response zodat we de structuur kunnen zien
  console.log('[Sportlink] clubs raw response:', JSON.stringify(raw).slice(0, 500));

  // De API kan een platte array zijn, of een object met een geneste array.
  let lijst: Array<Record<string, unknown>> = [];
  if (Array.isArray(raw)) {
    lijst = raw as Array<Record<string, unknown>>;
  } else if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    for (const val of Object.values(obj)) {
      if (Array.isArray(val)) {
        lijst = val as Array<Record<string, unknown>>;
        break;
      }
    }
  }

  console.log('[Sportlink] aantal clubs gevonden:', lijst.length);
  if (lijst.length > 0) {
    console.log('[Sportlink] eerste club keys:', Object.keys(lijst[0]));
    console.log('[Sportlink] eerste club:', JSON.stringify(lijst[0]));
  }

  return lijst
    .map(c => ({
      id: String(c.ClientId ?? c.clientId ?? c.Id ?? c.id ?? ''),
      naam: String(c.Naam ?? c.naam ?? c.Name ?? c.name ?? c.ClubNaam ?? c.clubnaam ?? ''),
    }))
    .filter(c => c.id && c.naam)
    .sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
}

/* ============================================================
   Wedstrijden ophalen voor een gekozen club
   clubId: de id uit haalClubsOp() — gekozen door de gebruiker.
============================================================ */

export async function haalThuisProgramma(clubId: string): Promise<SportlinkWedstrijd[]> {
  const raw = await sportlinkRequest<unknown>(CLUBS_ENDPOINT);
  const lijst = Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [];
  const wedstrijden: SportlinkWedstrijd[] = [];

  for (const item of lijst) {
    // Filter op de gekozen club
    const rawId = String(item.ClientId ?? item.clientId ?? item.id ?? '');
    if (rawId !== clubId) continue;

    const datum = parseSportlinkDatum(item.wedstrijddatum);
    if (!datum) continue;

    wedstrijden.push({
      datum,
      tijd: typeof item.tijd === 'string' ? item.tijd : '',
      thuisteam: String(item.thuisteam ?? ''),
      uitteam: String(item.uitteam ?? ''),
      competitiesoort: String(item.competitiesoort ?? ''),
    });
  }
  return wedstrijden;
}

/* ============================================================
   Weekend analyse
============================================================ */

export function vindDruksteWeekend(wedstrijden: SportlinkWedstrijd[]): DruksteWeekend | null {
  if (!wedstrijden.length) return null;

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

/**
 * Zet de wedstrijden van een weekend om naar douche-uur-rijen.
 * Spelers douchen ~2 uur na aanvang (wedstrijd ~1,5u + omkleden).
 */
export function weekendNaarUurRijen(weekend: DruksteWeekend, teamgrootte: number): UurRijData[] {
  const acc = new Map<string, UurRijData>();
  for (const w of weekend.wedstrijden) {
    const dag = dagNaam(w.datum);
    const aanvang = parseUur(w.tijd);
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

/* ============================================================
   Helpers
============================================================ */

function parseSportlinkDatum(v: unknown): Date | null {
  if (typeof v !== 'string' || !v.trim()) return null;
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

function zaterdagVan(d: Date): Date {
  const dag = d.getDay();
  const verschuiving = dag === 0 ? -1 : 6 - dag;
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
