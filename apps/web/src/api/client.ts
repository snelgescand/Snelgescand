/**
 * Lichte fetch-wrapper rond de Fastify API.
 *
 * `credentials: 'include'` zorgt dat de session cookie meegestuurd wordt.
 * `Content-Type: application/json` wordt ALLEEN gezet als er een body is —
 * anders krijgt Fastify een "Body cannot be empty"-error bij POST/PUT
 * zonder payload (bv. de bereken- of logout-call).
 */

const API_BASE = (import.meta.env.VITE_API_URL ?? 'https://api.snelgescand.nl').replace(/\/+$/, '');

function url(path: string): string {
  const p = path.startsWith('/') ? path : '/' + path;
  return API_BASE + p;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  // Content-Type alleen instellen als er een body is — Fastify weigert anders
  // POST/PUT-requests zonder payload met "Body cannot be empty".
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined ?? {}),
  };
  if (options.body != null && !('Content-Type' in headers) && !('content-type' in headers)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url(path), {
    ...options,
    credentials: 'include',
    headers,
  });

  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch { /* empty body */ }
    const message = (body as { error?: string })?.error
      ?? `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, message, body);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ===== Endpoint-functies =====

export const authApi = {
  login: (email: string, wachtwoord: string, tenantSlug?: string) =>
    api<{ gebruiker: { id: string; email: string; naam: string; rol: string }; tenant: { slug: string; naam: string } }>(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify({ email, wachtwoord, tenantSlug }) },
    ),
  logout: () => api('/api/auth/logout', { method: 'POST' }),
  me: () => api<{ gebruiker: { id: string; naam: string; rol: string }; tenant: { slug: string; naam: string } }>('/api/auth/me'),
};

export interface ProjectListItem {
  id: string;
  clubNaam: string;
  status: 'DRAFT' | 'IN_PROGRESS' | 'AFGEROND' | 'GEARCHIVEERD';
  postcode?: string;
  huisnummer?: string;
  woonplaats?: string | null;
  provincie?: string | null;
  type?: string | null;
  lifecycle?: string | null;
  updatedAt: string;
  eigenaar: { id: string; naam: string };
  logo?: { dataUrl: string; bestandsnaam?: string } | null;
}

export const projectsApi = {
  list: () => api<{ projecten: ProjectListItem[] }>('/api/projects'),
  get: (id: string) => api<any>(`/api/projects/${id}`),
  create: (data: { clubNaam: string; state: unknown; postcode?: string; huisnummer?: string }) =>
    api<any>('/api/projects', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: unknown) =>
    api<any>(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    api<{ ok: boolean }>(`/api/projects/${id}`, { method: 'DELETE' }),
  setEigenaar: (id: string, eigenaarId: string) =>
    api<{ ok: boolean; eigenaar: { id: string; naam: string } }>(
      `/api/projects/${id}/eigenaar`,
      { method: 'PATCH', body: JSON.stringify({ eigenaarId }) },
    ),
  bereken: (id: string) =>
    api<any>(`/api/projects/${id}/bereken`, { method: 'POST' }),

  /** Dedicated locatie-save: kan nooit verloren gaan, merget op de server. */
  saveLocatie: (id: string, locatie: unknown, gebouwPatch?: unknown) =>
    api<{ ok: boolean; project: { id: string; updatedAt: string } }>(
      `/api/projects/${id}/locatie`,
      { method: 'PATCH', body: JSON.stringify({ locatie, gebouwPatch }) },
    ),

  exporteerPpt: async (id: string, filename: string): Promise<void> => {
    const res = await fetch(url(`/api/projects/${id}/ppt`), {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) {
      let body: { error?: string; message?: string } = {};
      try { body = await res.json(); } catch { /* ignore */ }
      const fullMessage = [body.error, body.message].filter(Boolean).join(' — ')
        || `${res.status} ${res.statusText}`;
      throw new ApiError(res.status, fullMessage, body);
    }
    const blob = await res.blob();
    if (blob.size === 0) {
      throw new ApiError(500, 'Lege PowerPoint-respons ontvangen (0 bytes)');
    }
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  },

  /**
   * Exporteer PPT op basis van de ORIGINELE Sportief Opgewekt template
   * (86 slides incl. plaatjes en branding). Placeholders worden vervangen
   * met de club-data, maar er wordt verder NIETS dynamisch berekend —
   * Bart moet zelf slides verwijderen die niet relevant zijn.
   */
  exporteerPptTemplate: async (id: string, filename: string): Promise<void> => {
    const res = await fetch(url(`/api/projects/${id}/ppt-template`), {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) {
      let body: { error?: string; message?: string } = {};
      try { body = await res.json(); } catch { /* ignore */ }
      const fullMessage = [body.error, body.message].filter(Boolean).join(' — ')
        || `${res.status} ${res.statusText}`;
      throw new ApiError(res.status, fullMessage, body);
    }
    const blob = await res.blob();
    if (blob.size === 0) throw new ApiError(500, 'Lege PowerPoint-respons ontvangen');
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  },
};

export const modulesApi = {
  list: () => api<{ modules: Array<{ id: string; naam: string; defaultInput: unknown }>; groepen: Record<string, readonly string[]> }>(
    '/api/modules',
  ),
};

export interface UserRow {
  id: string;
  email: string;
  naam: string;
  rol: 'BEHEERDER' | 'ADVISEUR';
  createdAt?: string;
  laatsteLogin?: string;
}

export const usersApi = {
  list: () => api<{ gebruikers: UserRow[] }>('/api/users'),
  create: (data: { email: string; naam: string; wachtwoord: string; rol?: 'BEHEERDER' | 'ADVISEUR' }) =>
    api<{ gebruiker: UserRow }>('/api/users', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<{ naam: string; rol: 'BEHEERDER' | 'ADVISEUR'; wachtwoord: string }>) =>
    api<{ gebruiker: UserRow }>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) =>
    api<{ ok: boolean }>(`/api/users/${id}`, { method: 'DELETE' }),
};

export const logoApi = {
  /** Probeer automatisch logo te vinden op basis van clubnaam */
  zoek: (clubnaam: string) =>
    api<{
      gevonden: boolean;
      domein?: string;
      websiteUrl?: string;
      logoUrl?: string;
      dataUrl?: string;
      mimeType?: string;
      bytes?: number;
      geprobeerd?: string[];
    }>(`/api/logo/zoek?clubnaam=${encodeURIComponent(clubnaam)}`),

  /** Download logo van een handmatig opgegeven URL */
  download: (url: string) =>
    api<{
      gevonden: boolean;
      logoUrl?: string;
      dataUrl?: string;
      mimeType?: string;
      bytes?: number;
    }>('/api/logo/download', { method: 'POST', body: JSON.stringify({ url }) }),
};

export interface BagLookupResult {
  bouwjaar?: number;
  oppervlakte?: number;
  pandid?: string;
  bouwhoogteM?: number;
  plafondhoogteM?: number;
  bronnen: string[];
  geprobeerd: Array<{ endpoint: string; status: number | string; resultaat: string }>;
}

export const bagApi = {
  /** Backend-proxy lookup — probeert serverkant alle BAG-endpoints */
  lookup: (params: { adresId?: string; rd_x?: number; rd_y?: number; pandid?: string }) =>
    api<BagLookupResult>('/api/bag/lookup', { method: 'POST', body: JSON.stringify(params) }),
};

// ===== Team-leden (voor dropdowns) =====
export interface Teamlid {
  id: string;
  voornaam: string;
  naam: string;
  rol: 'BEHEERDER' | 'ADVISEUR';
}
export const teamApi = {
  leden: () => api<{ teamleden: Teamlid[] }>('/api/users/team-leden'),
};

// ===== Tenant-instellingen (premium Excel-paneel) =====
export interface TenantInstellingen {
  prijzen: { gasPerM3: number; stroomPerKwh: number; waterPerM3: number };
  vuistregels: {
    literPerDouche: number; gasPerDouche: number; literPerSpoeling: number;
    co2GasPerM3: number; co2StroomPerKwh: number; primairFactorGas: number;
  };
  subsidies: {
    isdePct: number;
    dumavaPct: number;
    scePct: number;
    /** Per subsidie-id of deze regeling nog actief is. Default = aan (true).
     *  Uitgevinkt = NIET tonen in advies-tegels of PPT-cijfers. */
    actief?: Record<string, boolean>;
  };
}
export const instellingenApi = {
  get: () => api<{ instellingen: TenantInstellingen; defaults: TenantInstellingen }>('/api/tenant/instellingen'),
  update: (data: Partial<TenantInstellingen>) =>
    api<{ ok: boolean }>('/api/tenant/instellingen', { method: 'PATCH', body: JSON.stringify(data) }),
  reset: () => api<{ ok: boolean }>('/api/tenant/instellingen/reset', { method: 'POST' }),
};

export interface FactuurReferentie {
  id: string;
  categorie: string;
  leverancier: string;
  jaar: number;
  bedrag: number;
  toelichting?: string | null;
  invoerderId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NieuweFactuurReferentie {
  categorie: string;
  leverancier: string;
  jaar: number;
  bedrag: number;
  toelichting?: string | null;
}

export const factuurApi = {
  list: () => api<{ referenties: FactuurReferentie[]; categorieen: readonly string[] }>('/api/factuur-referenties'),
  create: (data: NieuweFactuurReferentie) =>
    api<{ referentie: FactuurReferentie }>('/api/factuur-referenties', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: NieuweFactuurReferentie) =>
    api<{ referentie: FactuurReferentie }>(`/api/factuur-referenties/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    api<{ ok: boolean }>(`/api/factuur-referenties/${id}`, { method: 'DELETE' }),
};
