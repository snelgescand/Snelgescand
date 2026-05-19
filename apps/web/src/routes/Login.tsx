import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { authApi, ApiError } from '../api/client';
import { BRANDING } from '../branding';

export default function Login() {
  const [email, setEmail] = useState('');
  const [wachtwoord, setWachtwoord] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const nav = useNavigate();
  const qc = useQueryClient();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBezig(true);
    try {
      await authApi.login(email, wachtwoord);
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
    <div className="min-h-screen flex items-center justify-center px-4 bg-sunrise">
      {/* Decoratieve cirkels achter login-kaart, geinspireerd op ONN-logo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full border-[40px] border-primary-600/10" />
        <div className="absolute -bottom-40 -right-40 w-[28rem] h-[28rem] rounded-full border-[40px] border-accent-orange/10" />
      </div>

      <form onSubmit={onSubmit} className="relative w-full max-w-md bg-white rounded-2xl shadow-xl p-8 space-y-5">
        <div className="flex flex-col items-center pb-2">
          <img src={BRANDING.logo.primary} alt={BRANDING.logo.primaryAlt} className="h-14 mb-4" />
          <h1 className="text-2xl font-bold text-primary-700">{BRANDING.applicatieNaam}</h1>
          <p className="text-sm text-gray-600 mt-1">{BRANDING.applicatieOndertitel}</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div>
          <label className="label" htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="username"
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
            autoComplete="current-password"
            className="input"
            value={wachtwoord}
            onChange={e => setWachtwoord(e.target.value)}
          />
        </div>

        <button type="submit" disabled={bezig} className="btn-primary w-full disabled:opacity-50">
          {bezig ? 'Bezig…' : 'Inloggen'}
        </button>

        <p className="text-xs text-gray-500 text-center pt-2">
          Een platform van {BRANDING.organisatieNaam}
          <br />
          <span className="text-gray-400">Website door Bart Cornelissen</span>
        </p>
      </form>
    </div>
  );
}
