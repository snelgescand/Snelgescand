import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { authApi, projectsApi } from '../api/client';
import { AppHeader } from '../components/AppHeader';
import { Footer } from '../components/Footer';

export default function ProjectList() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list(),
  });

  const me = useQuery({ queryKey: ['me'], queryFn: () => authApi.me() });

  const create = useMutation({
    mutationFn: () => projectsApi.create({
      clubNaam: 'Nieuw project',
      state: {
        context: { club: { naam: '' }, gebouw: {}, energie: {} },
        locatie: {},
        huidigeSituatie: {},
        fotos: [],
        gekozenMaatregelen: {},
      },
    }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      nav(`/projecten/${p.id}`);
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
            {data.projecten.map(p => (
              <Link
                key={p.id}
                to={`/projecten/${p.id}`}
                className="card-hover p-5 block group"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-primary-900 group-hover:text-primary-700 transition-colors">
                    {p.clubNaam}
                  </h3>
                  <StatusBadge status={p.status} />
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  {p.postcode && p.huisnummer
                    ? `${p.postcode} ${p.huisnummer}`
                    : 'Geen adres ingevuld'}
                </p>
                <div className="flex items-center justify-between text-xs text-gray-500 pt-3 border-t border-primary-50">
                  <span>{p.eigenaar.naam}</span>
                  <span>{new Date(p.updatedAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</span>
                </div>
              </Link>
            ))}
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

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-700',
    IN_PROGRESS: 'bg-accent-orange/15 text-accent-orange-dark',
    AFGEROND: 'bg-primary-100 text-primary-700',
    GEARCHIVEERD: 'bg-gray-100 text-gray-400',
  };
  const labels: Record<string, string> = {
    DRAFT: 'Concept',
    IN_PROGRESS: 'Bezig',
    AFGEROND: 'Afgerond',
    GEARCHIVEERD: 'Archief',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${styles[status] ?? styles.DRAFT}`}>
      {labels[status] ?? status}
    </span>
  );
}
