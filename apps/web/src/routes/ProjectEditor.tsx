/**
 * Project-editor met detailformulieren per maatregel.
 *
 * UX:
 *  - Maatregelen-keuze: checkbox-lijst aan de linkerkant
 *  - Per gekozen maatregel: uitklap-paneel met detail-velden
 *  - Auto-save 2 sec na laatste wijziging
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectsApi, modulesApi, ApiError } from '../api/client';
import { AppHeader } from '../components/AppHeader';
import { AdresZoeker } from '../components/AdresZoeker';
import { Luchtfoto } from '../components/Luchtfoto';
import { FotoUpload, type ProjectFoto } from '../components/FotoUpload';
import { InfoTooltip } from '../components/InfoTooltip';
import { MaatregelDetail } from '../components/MaatregelDetail';
import type { PdokAdres } from '../api/pdok';

interface Locatie {
  adres?: string;
  postcode?: string;
  huisnummer?: number;
  woonplaats?: string;
  rd_x?: number;
  rd_y?: number;
  lat?: number;
  lon?: number;
}

interface ProjectState {
  context: {
    club?: { naam?: string };
    gebouw?: { bouwjaar?: number; bvoTotaalM2?: number; plafondhoogteM?: number };
    energie?: { gasverbruikM3?: number; stroomverbruikTotaalKwh?: number; stroomprijsKaalPerKwh?: number; gasprijsPerM3?: number };
  };
  locatie?: Locatie;
  fotos?: ProjectFoto[];
  gekozenMaatregelen: Record<string, unknown>;
}

const LEGE_STATE: ProjectState = {
  context: {
    club: { naam: '' },
    gebouw: { bouwjaar: 1990, bvoTotaalM2: 250, plafondhoogteM: 3 },
    energie: { gasverbruikM3: 5000, stroomverbruikTotaalKwh: 20000, gasprijsPerM3: 1.35, stroomprijsKaalPerKwh: 0.30 },
  },
  locatie: {},
  fotos: [],
  gekozenMaatregelen: {},
};

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
  const [berekenFout, setBerekenFout] = useState<string | null>(null);
  const autoSaveTimer = useRef<number | null>(null);

  useEffect(() => {
    if (projectQuery.data?.state && !draft) {
      const s = projectQuery.data.state as Partial<ProjectState>;
      setDraft({
        ...LEGE_STATE,
        ...s,
        context: {
          ...LEGE_STATE.context,
          ...(s.context ?? {}),
          club: { ...LEGE_STATE.context.club, ...(s.context?.club ?? {}) },
          gebouw: { ...LEGE_STATE.context.gebouw, ...(s.context?.gebouw ?? {}) },
          energie: { ...LEGE_STATE.context.energie, ...(s.context?.energie ?? {}) },
        },
        locatie: { ...LEGE_STATE.locatie, ...(s.locatie ?? {}) },
        fotos: s.fotos ?? [],
        gekozenMaatregelen: s.gekozenMaatregelen ?? {},
      });
    }
  }, [projectQuery.data, draft]);

  const save = useMutation({
    mutationFn: (state: ProjectState) =>
      projectsApi.update(id!, {
        state,
        clubNaam: state.context.club?.naam || 'Onbekend project',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', id] }),
  });

  const bereken = useMutation({
    mutationFn: () => projectsApi.bereken(id!),
    onSuccess: () => {
      setBerekenFout(null);
      qc.invalidateQueries({ queryKey: ['project', id] });
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setBerekenFout(err.message);
      } else {
        setBerekenFout('Berekening mislukt — onbekende fout');
      }
    },
  });

  const exportPpt = useMutation({
    mutationFn: () => projectsApi.exporteerPpt(
      id!,
      `Verduurzamingsplan_${(draft?.context.club?.naam ?? 'project').replace(/[^a-zA-Z0-9]/g, '_')}.pptx`,
    ),
  });

  function updateDraft(updater: (s: ProjectState) => ProjectState) {
    if (!draft) return;
    const next = updater(draft);
    setDraft(next);
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = window.setTimeout(() => save.mutate(next), 2000);
  }

  function adresGekozen(adres: PdokAdres) {
    updateDraft(s => ({
      ...s,
      locatie: {
        adres: adres.weergavenaam,
        postcode: adres.postcode,
        huisnummer: adres.huisnummer,
        woonplaats: adres.woonplaatsnaam,
        rd_x: adres.rd_x,
        rd_y: adres.rd_y,
        lat: adres.lat,
        lon: adres.lon,
      },
      context: {
        ...s.context,
        gebouw: {
          ...s.context.gebouw,
          bouwjaar: adres.bouwjaar ?? s.context.gebouw?.bouwjaar,
          bvoTotaalM2: adres.oppervlakte ?? s.context.gebouw?.bvoTotaalM2,
        },
      },
    }));
  }

  if (projectQuery.isLoading || !draft) return <div className="p-8 text-gray-500">Laden…</div>;
  if (projectQuery.isError) return <div className="p-8 text-red-600">Project niet gevonden.</div>;

  const cached = projectQuery.data?.cachedResult;
  const gekozenIds = Object.keys(draft.gekozenMaatregelen);

  return (
    <div className="min-h-screen pb-12">
      <AppHeader rechts={
        <>
          <Link to="/kennisbank" className="text-sm text-gray-600 hover:text-primary-700">Kennisbank</Link>
          <Link to="/projecten" className="text-sm text-gray-600 hover:text-primary-700">← Projecten</Link>
        </>
      } />

      {/* Sub-header: titel + actieknoppen */}
      <div className="bg-white/80 backdrop-blur border-b border-primary-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-primary-900">{draft.context.club?.naam || 'Nieuw project'}</h1>
            <p className="text-xs text-gray-500">
              {save.isPending ? 'Opslaan…' :
                save.isSuccess ? '✓ Opgeslagen' : 'Wijzig om op te slaan'}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setBerekenFout(null); bereken.mutate(); }} className="btn-accent" disabled={bereken.isPending}>
              {bereken.isPending ? 'Berekenen…' : 'Bereken'}
            </button>
            <button onClick={() => exportPpt.mutate()} className="btn-secondary" disabled={exportPpt.isPending || !cached}>
              {exportPpt.isPending ? 'Exporteren…' : '↓ PowerPoint'}
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-6 grid lg:grid-cols-[3fr_2fr] gap-6">
        {/* ===== LINKER KOLOM ===== */}
        <div className="space-y-5">

          <Sectie titel="Project">
            <Veld label="Naam van de club of organisatie" tooltip="Komt op alle slides van het rapport.">
              <input
                className="input"
                value={draft.context.club?.naam ?? ''}
                onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, club: { ...s.context.club, naam: e.target.value } } }))}
              />
            </Veld>
          </Sectie>

          <Sectie titel="Locatie">
            <Veld label="Adres opzoeken" tooltip="Begin te typen: postcode + huisnummer (bv. '6512AB 23') of straatnaam + plaats. Bouwjaar en oppervlakte worden automatisch opgehaald uit BAG.">
              <AdresZoeker initieel={draft.locatie?.adres ?? ''} onAdresGekozen={adresGekozen} />
            </Veld>
            {draft.locatie?.adres && (
              <p className="text-xs text-primary-700 mt-2">✓ {draft.locatie.adres}</p>
            )}
          </Sectie>

          <Sectie titel="Gebouw">
            <div className="grid grid-cols-2 gap-3">
              <Veld label="Bouwjaar" tooltip="Bepaalt standaard Rc-waardes en warmtepomp-vermogen.">
                <input type="number" className="input"
                  value={draft.context.gebouw?.bouwjaar ?? ''}
                  onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, gebouw: { ...s.context.gebouw, bouwjaar: Number(e.target.value) } } }))} />
              </Veld>
              <Veld label="BVO (m²)" tooltip="Bruto vloeroppervlak — uit BAG, overschrijfbaar.">
                <input type="number" className="input"
                  value={draft.context.gebouw?.bvoTotaalM2 ?? ''}
                  onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, gebouw: { ...s.context.gebouw, bvoTotaalM2: Number(e.target.value) } } }))} />
              </Veld>
            </div>
            <Veld label="Plafondhoogte (m)" tooltip="Gemiddelde vrije hoogte. Relevant voor warmtepompen die op volume rekenen.">
              <input type="number" step="0.1" className="input"
                value={draft.context.gebouw?.plafondhoogteM ?? 3}
                onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, gebouw: { ...s.context.gebouw, plafondhoogteM: Number(e.target.value) } } }))} />
            </Veld>
          </Sectie>

          <Sectie titel="Energieverbruik">
            <div className="grid grid-cols-2 gap-3">
              <Veld label="Gas (m³/jaar)" tooltip="Totaal gasverbruik per jaar uit jaaroverzicht energieleverancier.">
                <input type="number" className="input"
                  value={draft.context.energie?.gasverbruikM3 ?? ''}
                  onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, energie: { ...s.context.energie, gasverbruikM3: Number(e.target.value) } } }))} />
              </Veld>
              <Veld label="Stroom (kWh/jaar)" tooltip="Bruto verbruik — exclusief teruglevering.">
                <input type="number" className="input"
                  value={draft.context.energie?.stroomverbruikTotaalKwh ?? ''}
                  onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, energie: { ...s.context.energie, stroomverbruikTotaalKwh: Number(e.target.value) } } }))} />
              </Veld>
              <Veld label="Gasprijs (€/m³)" tooltip="Daadwerkelijk betaalde prijs incl. BTW + heffingen.">
                <input type="number" step="0.01" className="input"
                  value={draft.context.energie?.gasprijsPerM3 ?? 1.35}
                  onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, energie: { ...s.context.energie, gasprijsPerM3: Number(e.target.value) } } }))} />
              </Veld>
              <Veld label="Stroomprijs (€/kWh)" tooltip="Kale stroomprijs (exclusief belasting/netbeheer).">
                <input type="number" step="0.01" className="input"
                  value={draft.context.energie?.stroomprijsKaalPerKwh ?? 0.30}
                  onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, energie: { ...s.context.energie, stroomprijsKaalPerKwh: Number(e.target.value) } } }))} />
              </Veld>
            </div>
          </Sectie>

          {/* Maatregelen kiezen */}
          <Sectie titel="Maatregelen kiezen">
            <p className="text-xs text-gray-500 mb-3">
              Vink aan wat je wilt meenemen. Per maatregel kun je daarna details aanpassen.
            </p>
            {modulesQuery.data && (
              <div className="space-y-4">
                {Object.entries(modulesQuery.data.groepen).map(([groep, ids]) => (
                  <div key={groep}>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-primary-600 mb-1.5">{groep}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                      {ids.map(modId => {
                        const mod = modulesQuery.data.modules.find(m => m.id === modId);
                        if (!mod) return null;
                        const checked = modId in draft.gekozenMaatregelen;
                        return (
                          <label key={modId} className={`flex items-center gap-2 text-sm px-2 py-1.5 rounded cursor-pointer transition-colors ${checked ? 'bg-primary-50 text-primary-900' : 'hover:bg-gray-50 text-gray-700'}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => updateDraft(s => {
                                const next = { ...s.gekozenMaatregelen };
                                if (modId in next) delete next[modId];
                                else next[modId] = mod.defaultInput;
                                return { ...s, gekozenMaatregelen: next };
                              })}
                              className="rounded text-primary-600 focus:ring-primary-500"
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
          </Sectie>

          {/* Detail-panelen per gekozen maatregel */}
          {gekozenIds.length > 0 && (
            <Sectie titel="Details per maatregel" tooltipTekst="Klap een paneel uit om de standaardwaardes voor die maatregel aan te passen — bv. specifieke oppervlaktes, COP, of trainingstijden.">
              <div className="space-y-2">
                {gekozenIds.map(modId => {
                  const mod = modulesQuery.data?.modules.find(m => m.id === modId);
                  return (
                    <MaatregelDetail
                      key={modId}
                      maatregelId={modId}
                      maatregelNaam={mod?.naam ?? modId}
                      input={draft.gekozenMaatregelen[modId] as Record<string, unknown> ?? {}}
                      onChange={(input) => updateDraft(s => ({
                        ...s,
                        gekozenMaatregelen: { ...s.gekozenMaatregelen, [modId]: input },
                      }))}
                      onRemove={() => updateDraft(s => {
                        const next = { ...s.gekozenMaatregelen };
                        delete next[modId];
                        return { ...s, gekozenMaatregelen: next };
                      })}
                    />
                  );
                })}
              </div>
            </Sectie>
          )}

        </div>

        {/* ===== RECHTER KOLOM ===== */}
        <div className="space-y-5">

          <Sectie titel="Luchtfoto" tooltipTekst="Bekijk het dak om PV-oppervlak in te schatten, of er al panelen liggen, en hoe de oriëntatie is.">
            <Luchtfoto
              rdX={draft.locatie?.rd_x ?? 0}
              rdY={draft.locatie?.rd_y ?? 0}
              lat={draft.locatie?.lat ?? 0}
              lon={draft.locatie?.lon ?? 0}
              hoogte={280}
            />
          </Sectie>

          <Sectie titel="Foto's" tooltipTekst="Voeg foto's toe van de scan. Max 10 per project, automatisch verkleind.">
            <FotoUpload
              fotos={draft.fotos ?? []}
              onChange={(fotos) => updateDraft(s => ({ ...s, fotos }))}
            />
          </Sectie>

          <Sectie titel="Voor de penningmeester">
            {!cached && !berekenFout && (
              <p className="text-gray-500 text-sm">
                Vink minstens één maatregel aan en klik op <strong className="text-accent-orange">Bereken</strong>.
              </p>
            )}
            {berekenFout && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
                <p className="font-medium text-red-900 mb-1">Berekening mislukt</p>
                <p className="text-red-800 font-mono text-xs">{berekenFout}</p>
              </div>
            )}
            {cached?.rollup && (
              <>
                <dl className="space-y-1.5 text-sm">
                  <Stat label="Bruto investering" value={formatEur(cached.rollup.totaleInvestering)} />
                  <Stat label="Subsidies" value={formatEur(cached.rollup.totaleSubsidie)} />
                  <Stat label="Netto investering" value={formatEur(cached.rollup.nettoInvestering)} bold />
                  <Stat label="Besparing per jaar" value={formatEur(cached.rollup.totaleBesparingPerJaar)} highlight />
                  <Stat label="Gemiddelde TVT" value={
                    cached.rollup.gemiddeldeTerugverdientijdJaren && Number.isFinite(cached.rollup.gemiddeldeTerugverdientijdJaren)
                      ? `${cached.rollup.gemiddeldeTerugverdientijdJaren.toFixed(1)} jaar`
                      : 'n.v.t.'
                  } />
                  <Stat label="CO₂-besparing" value={`${(cached.rollup.totaleCo2BesparingKg / 1000).toFixed(1)} ton/jaar`} />
                  <Stat label="Aansluitwaarde voldoende?" value={cached.rollup.aansluitwaardeVoldoende ? '✓ ja' : '✗ nee'} />
                </dl>
                {cached.rollup.warnings?.length > 0 && (
                  <div className="mt-4 p-3 bg-accent-orange/10 border-l-4 border-accent-orange rounded text-sm">
                    <h3 className="font-medium text-accent-orange-dark mb-1">Aandachtspunten</h3>
                    <ul className="space-y-1 text-gray-800">
                      {cached.rollup.warnings.map((w: { code: string; message: string }, i: number) => (
                        <li key={i}>• {w.message}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </Sectie>

        </div>
      </main>
    </div>
  );
}

/* Helpers */

function Sectie({ titel, tooltipTekst, children }: { titel: string; tooltipTekst?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="text-base font-semibold text-primary-900 mb-3 flex items-center">
        {titel}
        {tooltipTekst && <InfoTooltip>{tooltipTekst}</InfoTooltip>}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Veld({ label, tooltip, children }: { label: string; tooltip?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label flex items-center">
        {label}
        {tooltip && <InfoTooltip>{tooltip}</InfoTooltip>}
      </label>
      {children}
    </div>
  );
}

function Stat({ label, value, bold, highlight }: { label: string; value: string; bold?: boolean; highlight?: boolean }) {
  return (
    <div className="flex justify-between border-b border-primary-50 pb-1">
      <dt className="text-gray-600">{label}</dt>
      <dd className={`${bold ? 'font-bold text-primary-900' : 'text-gray-900'} ${highlight ? 'text-accent-orange font-semibold' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

function formatEur(n: number): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '€ —';
  return '€ ' + n.toLocaleString('nl-NL', { maximumFractionDigits: 0 });
}
