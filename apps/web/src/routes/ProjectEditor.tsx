/**
 * Minimale Project-editor.
 *
 * Bewust simpel gehouden — sprint 3+ breidt dit uit tot een echte wizard
 * met meerdere stappen. Nu: één scherm met
 *   - club/gebouw-basisgegevens
 *   - keuze van maatregelen met defaults
 *   - knop "Bereken" die naar de API gaat en het resultaat toont
 */

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectsApi, modulesApi } from '../api/client';
import { AppHeader } from '../components/AppHeader';

interface ProjectState {
  context: {
    club?: { naam?: string };
    gebouw?: { bouwjaar?: number; bvoTotaalM2?: number };
  };
  gekozenMaatregelen: Record<string, unknown>;
}

export default function ProjectEditor() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const projectQuery = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id!),
    enabled: Boolean(id),
  });

  const modulesQuery = useQuery({
    queryKey: ['modules'],
    queryFn: () => modulesApi.list(),
  });

  const [draft, setDraft] = useState<ProjectState | null>(null);

  // Sync server-state naar lokale draft bij eerste load
  useEffect(() => {
    if (projectQuery.data?.state && !draft) {
      setDraft(projectQuery.data.state as ProjectState);
    }
  }, [projectQuery.data, draft]);

  const save = useMutation({
    mutationFn: (state: ProjectState) =>
      projectsApi.update(id!, {
        state,
        clubNaam: state.context.club?.naam ?? 'Onbekende club',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', id] }),
  });

  const bereken = useMutation({
    mutationFn: () => projectsApi.bereken(id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', id] }),
  });

  const exportPpt = useMutation({
    mutationFn: () => projectsApi.exporteerPpt(
      id!,
      `Verduurzamingsplan_${(draft?.context.club?.naam ?? 'project').replace(/[^a-zA-Z0-9]/g, '_')}.pptx`,
    ),
  });

  if (projectQuery.isLoading || !draft) return <div className="p-8 text-gray-500">Laden…</div>;

  const cached = projectQuery.data?.cachedResult;

  function update(path: 'club.naam' | 'gebouw.bouwjaar' | 'gebouw.bvoTotaalM2', value: string | number) {
    if (!draft) return;
    const next = structuredClone(draft);
    if (path === 'club.naam') next.context.club = { ...next.context.club, naam: String(value) };
    if (path === 'gebouw.bouwjaar') next.context.gebouw = { ...next.context.gebouw, bouwjaar: Number(value) };
    if (path === 'gebouw.bvoTotaalM2') next.context.gebouw = { ...next.context.gebouw, bvoTotaalM2: Number(value) };
    setDraft(next);
  }

  function toggleMaatregel(modId: string, defaultInput: unknown) {
    if (!draft) return;
    const next = structuredClone(draft);
    if (modId in next.gekozenMaatregelen) {
      delete next.gekozenMaatregelen[modId];
    } else {
      next.gekozenMaatregelen[modId] = defaultInput;
    }
    setDraft(next);
  }

  return (
    <div className="min-h-screen">
      <AppHeader rechts={
        <>
          <Link to="/projecten" className="text-sm text-gray-500 hover:underline">← Projecten</Link>
        </>
      } />

      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold">{draft.context.club?.naam || 'Nieuw project'}</h1>
          <div className="flex gap-2">
            <button
              onClick={() => save.mutate(draft)}
              className="btn-secondary"
              disabled={save.isPending}
            >
              {save.isPending ? 'Opslaan…' : 'Opslaan'}
            </button>
            <button
              onClick={() => bereken.mutate()}
              className="btn-primary"
              disabled={bereken.isPending}
            >
              {bereken.isPending ? 'Berekenen…' : 'Bereken'}
            </button>
            <button
              onClick={() => exportPpt.mutate()}
              className="btn-secondary"
              disabled={exportPpt.isPending || !cached}
              title={!cached ? 'Eerst berekenen' : 'Download PowerPoint'}
            >
              {exportPpt.isPending ? 'Exporteren…' : '↓ PowerPoint'}
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-6 grid lg:grid-cols-2 gap-6">
        {/* Inputs */}
        <section className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
          <h2 className="text-lg font-semibold">Clubgegevens</h2>
          <div>
            <label className="label">Clubnaam</label>
            <input
              className="input"
              value={draft.context.club?.naam ?? ''}
              onChange={e => update('club.naam', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Bouwjaar clubhuis</label>
              <input
                type="number"
                className="input"
                value={draft.context.gebouw?.bouwjaar ?? ''}
                onChange={e => update('gebouw.bouwjaar', e.target.value)}
              />
            </div>
            <div>
              <label className="label">BVO (m²)</label>
              <input
                type="number"
                className="input"
                value={draft.context.gebouw?.bvoTotaalM2 ?? ''}
                onChange={e => update('gebouw.bvoTotaalM2', e.target.value)}
              />
            </div>
          </div>

          <h2 className="text-lg font-semibold pt-4">Maatregelen</h2>
          {modulesQuery.data && (
            <div className="space-y-4">
              {Object.entries(modulesQuery.data.groepen).map(([groep, ids]) => (
                <div key={groep}>
                  <h3 className="font-medium text-sm text-gray-700 mb-2">{groep}</h3>
                  <div className="space-y-1">
                    {ids.map(modId => {
                      const mod = modulesQuery.data.modules.find(m => m.id === modId);
                      if (!mod) return null;
                      const checked = modId in draft.gekozenMaatregelen;
                      return (
                        <label key={modId} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleMaatregel(modId, mod.defaultInput)}
                            className="rounded"
                          />
                          {mod.naam}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Resultaten */}
        <section className="bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-lg font-semibold mb-4">Voor de penningmeester</h2>
          {!cached && (
            <p className="text-gray-500 text-sm">
              Klik op "Bereken" om de businesscase op te bouwen.
            </p>
          )}
          {cached?.rollup && (
            <dl className="space-y-2 text-sm">
              <Stat label="Bruto investering" value={`€ ${formatEur(cached.rollup.totaleInvestering)}`} />
              <Stat label="Subsidies" value={`€ ${formatEur(cached.rollup.totaleSubsidie)}`} />
              <Stat label="Netto investering" value={`€ ${formatEur(cached.rollup.nettoInvestering)}`} bold />
              <Stat label="Besparing per jaar" value={`€ ${formatEur(cached.rollup.totaleBesparingPerJaar)}`} />
              <Stat label="Gemiddelde TVT" value={`${cached.rollup.gemiddeldeTerugverdientijdJaren?.toFixed(1) ?? '∞'} jaar`} />
              <Stat label="CO₂-besparing" value={`${(cached.rollup.totaleCo2BesparingKg / 1000).toFixed(1)} ton/jaar`} />
              <Stat
                label="Aansluitwaarde voldoende?"
                value={cached.rollup.aansluitwaardeVoldoende ? '✓ ja' : '✗ nee'}
              />
            </dl>
          )}
          {cached?.rollup?.warnings?.length > 0 && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded text-sm">
              <h3 className="font-medium text-amber-900 mb-1">Waarschuwingen</h3>
              <ul className="space-y-1 text-amber-800">
                {cached.rollup.warnings.map((w: { code: string; message: string }, i: number) => (
                  <li key={i}>• {w.message}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between border-b border-gray-100 pb-1">
      <dt className="text-gray-600">{label}</dt>
      <dd className={bold ? 'font-semibold text-gray-900' : 'text-gray-900'}>{value}</dd>
    </div>
  );
}

function formatEur(n: number): string {
  return n.toLocaleString('nl-NL', { maximumFractionDigits: 0 });
}
