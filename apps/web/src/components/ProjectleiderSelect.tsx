/**
 * Dropdown om de projectleider (= eigenaar) van een project te wijzigen.
 * Toont alle teamleden van de huidige tenant op voornaam.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectsApi, teamApi } from '../api/client';

interface Props {
  projectId: string;
  huidigeEigenaarId?: string;
  huidigeEigenaarNaam?: string;
}

export function ProjectleiderSelect({ projectId, huidigeEigenaarId, huidigeEigenaarNaam }: Props) {
  const qc = useQueryClient();
  const teamQ = useQuery({ queryKey: ['team-leden'], queryFn: () => teamApi.leden() });
  const [fout, setFout] = useState<string | null>(null);

  const wijzig = useMutation({
    mutationFn: (eigenaarId: string) => projectsApi.setEigenaar(projectId, eigenaarId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      setFout(null);
    },
    onError: (e: unknown) => setFout(e instanceof Error ? e.message : 'Wijzigen mislukt'),
  });

  if (teamQ.isLoading) {
    return <p className="text-xs text-gray-500">Teamleden laden…</p>;
  }
  const leden = teamQ.data?.teamleden ?? [];

  return (
    <div>
      <select
        className="input"
        value={huidigeEigenaarId ?? ''}
        onChange={(e) => {
          if (e.target.value && e.target.value !== huidigeEigenaarId) {
            wijzig.mutate(e.target.value);
          }
        }}
        disabled={wijzig.isPending}
      >
        {!huidigeEigenaarId && <option value="">— kies een teamlid —</option>}
        {leden.map(l => (
          <option key={l.id} value={l.id}>
            {l.voornaam} {l.id === huidigeEigenaarId ? '(huidige)' : ''}
            {l.rol === 'BEHEERDER' && ' 🛠️'}
          </option>
        ))}
      </select>
      {huidigeEigenaarNaam && !wijzig.isPending && (
        <p className="text-xs text-gray-500 mt-1">Huidig: {huidigeEigenaarNaam}</p>
      )}
      {wijzig.isPending && <p className="text-xs text-primary-700 mt-1">Wijzigen…</p>}
      {fout && <p className="text-xs text-red-600 mt-1">{fout}</p>}
    </div>
  );
}
