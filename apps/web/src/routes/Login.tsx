import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { authApi, ApiError } from '../api/client';
import { BRANDING } from '../branding';

export default function Login() {
  const [email, setEmail] = useState('');
  const [wachtwoord, setWachtwoord] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const nav = useNavigate();
  const qc = useQueryClient();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBezig(true);
    try {
      await authApi.login(email, wachtwoord, tenantSlug || undefined);
      await qc.invalidateQueries({ queryKey: ['me'] });
      nav('/projecten', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Inloggen mislukt');
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-md bg-white rounded-lg shadow p-6 space-y-4">
        <div className="flex flex-col items-center pb-2">
          <img src={BRANDING.logo.src} alt={BRANDING.logo.alt} className="h-12 mb-3" />
          <p className="text-sm text-gray-600">{BRANDING.applicatieOndertitel}</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
            {error}
          </div>
        )}

        <div>
          <label className="label" htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            required
            className="input"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="wachtwoord">Wachtwoord</label>
          <input
            id="wachtwoord"
            type="password"
            required
            className="input"
            value={wachtwoord}
            onChange={e => setWachtwoord(e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="tenant">Tenant-slug (optioneel)</label>
          <input
            id="tenant"
            type="text"
            placeholder="bv. mijn-bureau"
            className="input"
            value={tenantSlug}
            onChange={e => setTenantSlug(e.target.value)}
          />
        </div>

        <button type="submit" disabled={bezig} className="btn-primary w-full disabled:opacity-50">
          {bezig ? 'Bezig…' : 'Inloggen'}
        </button>
      </form>
    </div>
  );
}
