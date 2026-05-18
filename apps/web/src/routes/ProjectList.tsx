import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { authApi, projectsApi } from '../api/client';
import { AppHeader } from '../components/AppHeader';

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
        context: { club: { naam: 'Nieuw project' }, gebouw: { bouwjaar: 1990, bvoTotaalM2: 250 } },
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
          {me.data && <span className="text-gray-600">{me.data.gebruiker.naam} · {me.data.tenant.naam}</span>}
          <button onClick={() => logout.mutate()} className="text-gray-600 hover:text-gray-900">Uitloggen</button>
        </>
      } />

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Projecten</h2>
          <button onClick={() => create.mutate()} className="btn-primary" disabled={create.isPending}>
            {create.isPending ? 'Bezig…' : 'Nieuw project'}
          </button>
        </div>

        {isLoading && <p className="text-gray-500">Laden…</p>}

        {data && data.projecten.length === 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
            Nog geen projecten. Maak er eentje aan om te beginnen.
          </div>
        )}

        {data && data.projecten.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                  <th className="px-4 py-3">Club</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Eigenaar</th>
                  <th className="px-4 py-3">Laatst bewerkt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.projecten.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link to={`/projecten/${p.id}`} className="font-medium text-primary-700 hover:underline">
                        {p.clubNaam}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{p.status}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{p.eigenaar.naam}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(p.updatedAt).toLocaleDateString('nl-NL')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
