/**
 * Beheer-pagina — voor BEHEERDERS.
 *
 * Twee onderdelen:
 *   1. Gebruikers-beheer (aanmaken/wijzigen/verwijderen accounts)
 *   2. Aannames-overrides (default-waarden voor de berekening tweaken)
 *
 * Alleen toegankelijk voor gebruikers met rol BEHEERDER.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi, usersApi, type UserRow } from '../api/client';
import { AppHeader } from '../components/AppHeader';
import { Footer } from '../components/Footer';
import { AannamesEditor } from '../components/AannamesEditor';

export function Beheer() {
  const meQ = useQuery({ queryKey: ['me'], queryFn: authApi.me });
  const [actieve, setActieve] = useState<'gebruikers' | 'aannames'>('gebruikers');

  const isBeheerder = meQ.data?.gebruiker.rol === 'BEHEERDER';

  return (
    <div className="min-h-screen bg-sunrise flex flex-col">
      <AppHeader rechts={null} />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">
        <div className="mb-4">
          <Link to="/projecten" className="text-sm text-gray-600 hover:text-primary-700">← Terug naar projecten</Link>
        </div>

        <h1 className="text-2xl font-bold text-primary-900 mb-2">Beheer</h1>
        <p className="text-sm text-gray-600 mb-6">
          {isBeheerder
            ? 'Wijzig accounts en defaults voor je tenant.'
            : 'Sommige onderdelen zijn alleen zichtbaar voor beheerders.'}
        </p>

        {/* Snelkoppeling naar premium-paneel */}
        {isBeheerder && (
          <div className="card p-4 mb-6 bg-accent-orange/5 border border-accent-orange/30">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-primary-900 mb-1">⚙️ Berekening-instellingen</h3>
                <p className="text-xs text-gray-700">
                  Pas prijzen, vuistregels en subsidie-percentages aan voor jouw organisatie.
                  Werkt door in de PPT-export en kostenramingen.
                </p>
              </div>
              <Link
                to="/beheer/instellingen"
                className="shrink-0 text-sm px-3 py-1.5 bg-accent-orange text-white rounded hover:bg-accent-orange/90"
              >
                Open paneel →
              </Link>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6 flex gap-1">
          <button
            onClick={() => setActieve('gebruikers')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              actieve === 'gebruikers'
                ? 'border-accent-orange text-primary-900'
                : 'border-transparent text-gray-500 hover:text-primary-700'
            }`}
          >
            Gebruikers
          </button>
          <button
            onClick={() => setActieve('aannames')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              actieve === 'aannames'
                ? 'border-accent-orange text-primary-900'
                : 'border-transparent text-gray-500 hover:text-primary-700'
            }`}
          >
            Aannames & berekeningen
          </button>
        </div>

        {actieve === 'gebruikers' && (
          isBeheerder ? <GebruikersTab huidigeUserId={meQ.data?.gebruiker.id ?? ''} />
                      : <p className="text-sm text-gray-500 italic">Alleen voor beheerders.</p>
        )}

        {actieve === 'aannames' && <AannamesEditor />}
      </main>

      <Footer />
    </div>
  );
}

/* ============================================================
 * Gebruikers-tab
 * ============================================================ */

function GebruikersTab({ huidigeUserId }: { huidigeUserId: string }) {
  const qc = useQueryClient();
  const lijstQ = useQuery({ queryKey: ['users'], queryFn: usersApi.list });
  const [maakNieuw, setMaakNieuw] = useState(false);
  const [bewerkId, setBewerkId] = useState<string | null>(null);

  const verwijder = useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (err: unknown) => alert(err instanceof Error ? err.message : 'Verwijderen mislukt'),
  });

  if (lijstQ.isLoading) return <p className="text-sm text-gray-500">Laden…</p>;

  const gebruikers = lijstQ.data?.gebruikers ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-600">{gebruikers.length} gebruiker(s) in deze organisatie.</p>
        <button onClick={() => setMaakNieuw(true)} className="btn-accent text-sm">
          + Nieuwe gebruiker
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-primary-50/50 text-primary-900">
              <th className="text-left px-4 py-2 font-medium">Naam</th>
              <th className="text-left px-4 py-2 font-medium">E-mail</th>
              <th className="text-left px-4 py-2 font-medium">Rol</th>
              <th className="text-left px-4 py-2 font-medium">Laatste login</th>
              <th className="text-right px-4 py-2 font-medium w-32">Acties</th>
            </tr>
          </thead>
          <tbody>
            {gebruikers.map(g => (
              <tr key={g.id} className="border-t border-gray-100">
                <td className="px-4 py-2.5">
                  {g.naam}
                  {g.id === huidigeUserId && <span className="ml-2 text-xs text-primary-700">(jij)</span>}
                </td>
                <td className="px-4 py-2.5 text-gray-600">{g.email}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs ${
                    g.rol === 'BEHEERDER' ? 'bg-accent-orange/15 text-accent-orange-dark' :
                    'bg-primary-100 text-primary-800'
                  }`}>{g.rol}</span>
                </td>
                <td className="px-4 py-2.5 text-gray-500 text-xs">
                  {g.laatsteLogin ? new Date(g.laatsteLogin).toLocaleDateString('nl-NL') : 'nooit'}
                </td>
                <td className="px-4 py-2.5 text-right space-x-2 whitespace-nowrap">
                  <button onClick={() => setBewerkId(g.id)} className="text-xs text-primary-700 hover:underline">
                    Bewerk
                  </button>
                  {g.id !== huidigeUserId && (
                    <button
                      onClick={() => {
                        if (confirm(`Weet je zeker dat je ${g.naam} wilt verwijderen?`)) verwijder.mutate(g.id);
                      }}
                      className="text-xs text-red-600 hover:underline"
                      disabled={verwijder.isPending}
                    >
                      Verwijder
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {gebruikers.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500 italic">Nog geen gebruikers.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {maakNieuw && (
        <GebruikerModal
          onClose={() => setMaakNieuw(false)}
          onSaved={() => { setMaakNieuw(false); qc.invalidateQueries({ queryKey: ['users'] }); }}
        />
      )}

      {bewerkId && (
        <GebruikerModal
          gebruiker={gebruikers.find(g => g.id === bewerkId)}
          onClose={() => setBewerkId(null)}
          onSaved={() => { setBewerkId(null); qc.invalidateQueries({ queryKey: ['users'] }); }}
        />
      )}
    </div>
  );
}

/* ============================================================
 * GebruikerModal — create + edit
 * ============================================================ */

interface ModalProps {
  gebruiker?: UserRow;
  onClose: () => void;
  onSaved: () => void;
}

function GebruikerModal({ gebruiker, onClose, onSaved }: ModalProps) {
  const editing = !!gebruiker;
  const [naam, setNaam] = useState(gebruiker?.naam ?? '');
  const [email, setEmail] = useState(gebruiker?.email ?? '');
  const [wachtwoord, setWachtwoord] = useState('');
  const [rol, setRol] = useState<UserRow['rol']>(gebruiker?.rol ?? 'ADVISEUR');
  const [fout, setFout] = useState<string | null>(null);

  const opslaan = useMutation({
    mutationFn: async () => {
      setFout(null);
      if (editing) {
        const patch: Partial<{ naam: string; rol: UserRow['rol']; wachtwoord: string }> = {};
        if (naam !== gebruiker!.naam) patch.naam = naam;
        if (rol !== gebruiker!.rol) patch.rol = rol;
        if (wachtwoord) patch.wachtwoord = wachtwoord;
        if (Object.keys(patch).length === 0) return;
        return usersApi.update(gebruiker!.id, patch);
      } else {
        if (!wachtwoord || wachtwoord.length < 8) throw new Error('Wachtwoord min. 8 tekens');
        return usersApi.create({ email, naam, wachtwoord, rol });
      }
    },
    onSuccess: onSaved,
    onError: (err: unknown) => setFout(err instanceof Error ? err.message : 'Opslaan mislukt'),
  });

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-primary-900 mb-3">
          {editing ? `Wijzig ${gebruiker!.naam}` : 'Nieuwe gebruiker'}
        </h3>
        <div className="space-y-3">
          <div>
            <label className="label text-sm">Naam</label>
            <input className="input" value={naam} onChange={e => setNaam(e.target.value)} placeholder="bv. Jan Jansen" />
          </div>
          <div>
            <label className="label text-sm">E-mailadres</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={editing}
              placeholder="bv. jan@club.nl"
            />
            {editing && <p className="text-xs text-gray-500 mt-1">E-mailadres kan niet meer gewijzigd worden</p>}
          </div>
          <div>
            <label className="label text-sm">Wachtwoord {editing && '(leeg laten om niet te wijzigen)'}</label>
            <input
              type="password"
              className="input"
              value={wachtwoord}
              onChange={e => setWachtwoord(e.target.value)}
              placeholder={editing ? '••••••••' : 'Min. 8 tekens'}
            />
          </div>
          <div>
            <label className="label text-sm">Rol</label>
            <select className="input" value={rol} onChange={e => setRol(e.target.value as UserRow['rol'])}>
              <option value="ADVISEUR">Adviseur (projecten maken)</option>
              <option value="BEHEERDER">Beheerder (volledige toegang)</option>
            </select>
          </div>
          {fout && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{fout}</p>}
        </div>
        <div className="flex gap-2 mt-5 justify-end">
          <button className="btn-secondary text-sm" onClick={onClose}>Annuleer</button>
          <button
            className="btn-accent text-sm"
            disabled={opslaan.isPending || !naam || (!editing && (!email || !wachtwoord))}
            onClick={() => opslaan.mutate()}
          >
            {opslaan.isPending ? 'Opslaan…' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  );
}
