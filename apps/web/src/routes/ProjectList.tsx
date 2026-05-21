import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { authApi, projectsApi } from '../api/client';
import { AppHeader } from '../components/AppHeader';
import { Footer } from '../components/Footer';
import { vindFase, type LifecycleFase } from '../data/lifecycle';

export default function ProjectList() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list(),
  });

  const me = useQuery({ queryKey: ['me'], queryFn: () => authApi.me() });
  const [bevestigVerwijderen, setBevestigVerwijderen] = useState<{ id: string; naam: string } | null>(null);

  const create = useMutation({
    mutationFn: () => projectsApi.create({
      clubNaam: 'Nieuw project',
      state: {
        context: { club: { naam: '' }, gebouw: {}, energie: {} },
        locatie: {},
        huidigeSituatie: {},
        fotos: [],
        gekozenMaatregelen: {},
        lifecycle: 'concept',
      },
    }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      nav(`/projecten/${p.id}`);
    },
  });

  const verwijder = useMutation({
    mutationFn: (id: string) => projectsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      setBevestigVerwijderen(null);
    },
    onError: (err: unknown) => {
      alert('Verwijderen mislukt: ' + (err instanceof Error ? err.message : 'onbekend'));
    },
  });

  const logout = useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      qc.clear();
      nav('/login');
    },
  });

  return (
    <div className="min-h-screen">
      <AppHeader rechts={
        <>
          <Link to="/kennisbank" className="text-sm text-gray-700 hover:text-primary-700">Kennisbank</Link>
          {me.data?.gebruiker.rol === 'BEHEERDER' && (
            <>
              <span className="text-gray-300">·</span>
              <Link to="/beheer" className="text-sm text-gray-700 hover:text-primary-700">Beheer</Link>
            </>
          )}
          {me.data && <span className="text-gray-500">·</span>}
          {me.data && <span className="text-sm text-gray-600">{me.data.gebruiker.naam}</span>}
          <button onClick={() => logout.mutate()} className="text-sm text-gray-500 hover:text-accent-orange">Uitloggen</button>
        </>
      } />

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Header met CTA */}
        <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-primary-900">Energiescans</h1>
            <p className="text-gray-600 mt-1">Maak snel een verduurzamingsplan voor een sportclub of ander gebouw.</p>
          </div>
          <button onClick={() => create.mutate()} className="btn-accent text-base px-5 py-2.5" disabled={create.isPending}>
            {create.isPending ? 'Bezig…' : '+ Nieuw project'}
          </button>
        </div>

        {isLoading && <p className="text-gray-500">Laden…</p>}

        {/* Lege staat */}
        {data && data.projecten.length === 0 && (
          <div className="card p-12 text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-primary-50 flex items-center justify-center">
              <span className="text-3xl">📋</span>
            </div>
            <h2 className="text-xl font-semibold text-primary-900 mb-2">Nog geen projecten</h2>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              Maak je eerste energiescan aan. Vul postcode + huisnummer in en we vullen automatisch het bouwjaar en de oppervlakte voor je in.
            </p>
            <button onClick={() => create.mutate()} className="btn-accent" disabled={create.isPending}>
              + Maak eerste project
            </button>
          </div>
        )}

        {/* Projecten-grid */}
        {data && data.projecten.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.projecten.map(p => {
              const fase = vindFase(p.lifecycle as LifecycleFase | undefined);
              const lokatie = [p.postcode, p.huisnummer].filter(Boolean).join(' ');
              const plaats = p.woonplaats ?? '';
              return (
                <div key={p.id} className="card-hover relative group">
                  <Link to={`/projecten/${p.id}`} className="block p-5">
                    <div className="flex items-start gap-3 mb-2">
                      {p.logo?.dataUrl ? (
                        <img
                          src={p.logo.dataUrl}
                          alt={`Logo ${p.clubNaam}`}
                          className="w-10 h-10 object-contain rounded bg-white border border-gray-100 shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded bg-primary-50 border border-primary-100 flex items-center justify-center shrink-0">
                          <span className="text-primary-700 text-base font-bold">
                            {p.clubNaam.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-primary-900 group-hover:text-primary-700 transition-colors truncate">
                          {p.clubNaam}
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {lokatie && plaats
                            ? `${lokatie}, ${plaats}`
                            : lokatie || plaats || 'Geen adres'}
                        </p>
                      </div>
                    </div>

                    {/* Lifecycle badge */}
                    <div className="mt-3 mb-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${fase.kleurClass} ${fase.tekstClass}`}>
                        {fase.korte}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-gray-500 pt-3 border-t border-primary-50">
                      <span className="truncate">{p.eigenaar.naam}</span>
                      <span className="shrink-0 ml-2">{new Date(p.updatedAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</span>
                    </div>
                  </Link>

                  {/* Delete-knop in de hoek (alleen zichtbaar bij hover) */}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setBevestigVerwijderen({ id: p.id, naam: p.clubNaam });
                    }}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"
                    title="Project verwijderen"
                  >
                    🗑
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Bevestigingsmodal voor verwijderen */}
        {bevestigVerwijderen && (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4"
               onClick={() => setBevestigVerwijderen(null)}>
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-primary-900 mb-2">Project verwijderen?</h3>
              <p className="text-sm text-gray-700 mb-4">
                Weet je zeker dat je <strong>{bevestigVerwijderen.naam}</strong> definitief wilt verwijderen?
                Deze actie kan niet ongedaan worden gemaakt.
              </p>
              <div className="flex gap-2 justify-end">
                <button className="btn-secondary text-sm" onClick={() => setBevestigVerwijderen(null)}>
                  Annuleer
                </button>
                <button
                  className="text-sm px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  disabled={verwijder.isPending}
                  onClick={() => verwijder.mutate(bevestigVerwijderen.id)}
                >
                  {verwijder.isPending ? 'Verwijderen…' : 'Ja, verwijder'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer-tip */}
        <div className="mt-8 text-center text-xs text-gray-500">
          Vragen over berekeningen of aannames? Zie de{' '}
          <Link to="/kennisbank" className="text-primary-700 hover:underline">Kennisbank</Link>.
        </div>
      </main>
      <Footer />
    </div>
  );
}
