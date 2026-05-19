const API_BASE = 'https://api.snelgescand.nl';

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
  const res = await fetch(url(path), {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
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
  updatedAt: string;
  eigenaar: { id: string; naam: string };
}

export const projectsApi = {
  list: () => api<{ projecten: ProjectListItem[] }>('/api/projects'),
  get: (id: string) => api<any>(`/api/projects/${id}`),
  create: (data: { clubNaam: string; state: unknown; postcode?: string; huisnummer?: string }) =>
    api<any>('/api/projects', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: unknown) =>
    api<any>(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  bereken: (id: string) =>
    api<any>(`/api/projects/${id}/bereken`, { method: 'POST' }),

  exporteerPpt: async (id: string, filename: string): Promise<void> => {
    const res = await fetch(url(`/api/projects/${id}/ppt`), {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) {
      let body: { error?: string } = {};
      try { body = await res.json(); } catch { /* empty */ }
      throw new ApiError(res.status, body.error ?? `${res.status} ${res.statusText}`);
    }
    const blob = await res.blob();
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