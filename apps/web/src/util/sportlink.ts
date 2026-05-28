/**
 * Sportlink koppeling via VNL app API + CORS proxy
 *
 * Features:
 * - Automatische login via username/password
 * - OAuth token caching
 * - Alle requests automatisch via proxy
 * - Clubs ophalen via memberportal API
 * - Behoud van bestaande weekend-logica
 */

const CORS_PROXY =
  'https://cors-proxy.clubinfoproxy.workers.dev/proxy?url=';

const SPORTLINK_BASE =
  'https://app-vnl-production.sportlink.com';

const CLUBS_ENDPOINT =
  '/entity/common/memberportal/app/club/Clubs?v=1';

const TOKEN_ENDPOINT = '/oauth/token';

function proxiedUrl(url: string): string {
  return `${CORS_PROXY}${encodeURIComponent(url)}`;
}

/* ============================================================
   Types
============================================================ */

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
  dag:
    | 'maandag'
    | 'dinsdag'
    | 'woensdag'
    | 'donderdag'
    | 'vrijdag'
    | 'zaterdag'
    | 'zondag';

  uur: number;
  personen: number;
}

interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

/* ============================================================
   Config
============================================================ */

const SPORTLINK_USERNAME = 'rxxnrextolzwlqsspy@hthlm.com';
const SPORTLINK_PASSWORD = 'test1234';

if (!SPORTLINK_USERNAME) {
  console.warn(
    'SPORTLINK_USERNAME ontbreekt'
  );
}

if (!SPORTLINK_PASSWORD) {
  console.warn(
    'SPORTLINK_PASSWORD ontbreekt'
  );
}

/* ============================================================
   Token cache
============================================================ */

let tokenCache: CachedToken | null = null;

async function getAccessToken(): Promise<string> {
  if (
    tokenCache &&
    Date.now() < tokenCache.expiresAt
  ) {
    return tokenCache.accessToken;
  }

  if (
    !SPORTLINK_USERNAME ||
    !SPORTLINK_PASSWORD
  ) {
    throw new Error(
      'Sportlink credentials ontbreken. Zet SPORTLINK_USERNAME en SPORTLINK_PASSWORD.'
    );
  }

  const url = proxiedUrl(
    `${SPORTLINK_BASE}${TOKEN_ENDPOINT}`
  );

  const body = new URLSearchParams({
    username: SPORTLINK_USERNAME,
    password: SPORTLINK_PASSWORD,
    grant_type: 'password',
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type':
        'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();

    throw new Error(
      `Sportlink login mislukt (${res.status}): ${text}`
    );
  }

  const data =
    (await res.json()) as OAuthTokenResponse;

  if (!data.access_token) {
    throw new Error(
      'Geen access token ontvangen van Sportlink.'
    );
  }

  const expiresIn =
    (data.expires_in ?? 3600) - 60;

  tokenCache = {
    accessToken: data.access_token,
    expiresAt:
      Date.now() + expiresIn * 1000,
  };

  return data.access_token;
}

/* ============================================================
   Generic authenticated request
============================================================ */

async function sportlinkRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAccessToken();

  const url = proxiedUrl(
    `${SPORTLINK_BASE}${endpoint}`
  );

  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();

    throw new Error(
      `Sportlink request failed (${res.status}): ${text}`
    );
  }

  return res.json();
}

/* ============================================================
   Clubs ophalen
============================================================ */

export async function haalClubsOp() {
  return sportlinkRequest(CLUBS_ENDPOINT);
}

/* ============================================================
   Wedstrijden ophalen uit clubs response
============================================================ */

export async function haalThuisProgramma() {
  const clubs = await haalClubsOp();

  const wedstrijden: SportlinkWedstrijd[] =
    [];

  if (!Array.isArray(clubs)) {
    return wedstrijden;
  }

  for (const raw of clubs) {
    const datum = parseSportlinkDatum(
      raw?.wedstrijddatum
    );

    if (!datum) continue;

    wedstrijden.push({
      datum,
      tijd:
        typeof raw?.tijd === 'string'
          ? raw.tijd
          : '',
      thuisteam: String(
        raw?.thuisteam ?? ''
      ),
      uitteam: String(
        raw?.uitteam ?? ''
      ),
      competitiesoort: String(
        raw?.competitiesoort ?? ''
      ),
    });
  }

  return wedstrijden;
}

/* ============================================================
   Weekend analyse
============================================================ */

export function vindDruksteWeekend(
  wedstrijden: SportlinkWedstrijd[]
): DruksteWeekend | null {
  if (!wedstrijden.length) {
    return null;
  }

  const perWeekend = new Map<
    string,
    SportlinkWedstrijd[]
  >();

  for (const w of wedstrijden) {
    const zat = zaterdagVan(w.datum);

    const sleutel = zat
      .toISOString()
      .slice(0, 10);

    const lijst =
      perWeekend.get(sleutel) ?? [];

    lijst.push(w);

    perWeekend.set(
      sleutel,
      lijst
    );
  }

  let beste: {
    zaterdag: Date;
    lijst: SportlinkWedstrijd[];
  } | null = null;

  for (const [
    sleutel,
    lijst,
  ] of perWeekend) {
    if (
      !beste ||
      lijst.length >
        beste.lijst.length
    ) {
      beste = {
        zaterdag: new Date(
          sleutel + 'T00:00:00'
        ),
        lijst,
      };
    }
  }

  if (!beste) {
    return null;
  }

  beste.lijst.sort(
    (a, b) =>
      a.datum.getTime() -
        b.datum.getTime() ||
      a.tijd.localeCompare(
        b.tijd
      )
  );

  return {
    zaterdag: beste.zaterdag,
    label: weekendLabel(
      beste.zaterdag
    ),
    wedstrijden: beste.lijst,
    aantal:
      beste.lijst.length,
  };
}

export function weekendNaarUurRijen(
  weekend: DruksteWeekend,
  teamgrootte: number
): UurRijData[] {
  const acc = new Map<
    string,
    UurRijData
  >();

  for (const w of weekend.wedstrijden) {
    const dag = dagNaam(
      w.datum
    );

    const aanvang =
      parseUur(w.tijd);

    const doucheUur =
      Math.max(
        0,
        Math.min(
          23,
          (aanvang ?? 14) + 2
        )
      );

    const sleutel = `${dag}-${doucheUur}`;

    const bestaand =
      acc.get(sleutel);

    if (bestaand) {
      bestaand.personen +=
        teamgrootte;
    } else {
      acc.set(sleutel, {
        dag,
        uur: doucheUur,
        personen:
          teamgrootte,
      });
    }
  }

  return [...acc.values()].sort(
    (a, b) =>
      a.uur - b.uur
  );
}

/* ============================================================
   Helpers
============================================================ */

function parseSportlinkDatum(
  v: unknown
): Date | null {
  if (
    typeof v !== 'string' ||
    !v.trim()
  ) {
    return null;
  }

  let d = new Date(v);

  if (!isNaN(d.getTime())) {
    return d;
  }

  const m = v.match(
    /^(\d{1,2})-(\d{1,2})-(\d{4})/
  );

  if (m) {
    d = new Date(
      Number(m[3]),
      Number(m[2]) - 1,
      Number(m[1])
    );

    if (
      !isNaN(d.getTime())
    ) {
      return d;
    }
  }

  return null;
}

function parseUur(
  tijd: string
): number | null {
  const m = tijd.match(
    /(\d{1,2})[:.](\d{2})/
  );

  if (!m) {
    return null;
  }

  const u = Number(m[1]);

  return u >= 0 &&
    u <= 23
    ? u
    : null;
}

function zaterdagVan(
  d: Date
): Date {
  const dag =
    d.getDay();

  const verschuiving =
    dag === 0
      ? -1
      : 6 - dag;

  const zat =
    new Date(d);

  zat.setHours(
    0,
    0,
    0,
    0
  );

  zat.setDate(
    zat.getDate() +
      verschuiving
  );

  return zat;
}

const DAG_NAMEN = [
  'zondag',
  'maandag',
  'dinsdag',
  'woensdag',
  'donderdag',
  'vrijdag',
  'zaterdag',
] as const;

function dagNaam(
  d: Date
): UurRijData['dag'] {
  return DAG_NAMEN[
    d.getDay()
  ];
}

function weekendLabel(
  zaterdag: Date
): string {
  const zondag =
    new Date(zaterdag);

  zondag.setDate(
    zondag.getDate() + 1
  );

  const fmt = (
    x: Date
  ) =>
    x.toLocaleDateString(
      'nl-NL',
      {
        day: 'numeric',
        month: 'short',
      }
    );

  return `za ${fmt(
    zaterdag
  )} – zo ${fmt(
    zondag
  )} ${zaterdag.getFullYear()}`;
}