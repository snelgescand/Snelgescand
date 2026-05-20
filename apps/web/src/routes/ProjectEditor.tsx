/**
 * Project-editor met 2-staps wizard:
 *
 *   Stap 1 — Invoer:   project, locatie, gebouw, energie, huidige situatie
 *   Stap 2 — Maatregelen + resultaat: gesorteerd op aanbevolen relevantie,
 *                                     grafieken, businesscase
 *
 * Boven beide tabs: globale acties (Opslaan, Bereken, PowerPoint).
 *
 * Auto-save blijft draaien op de achtergrond, maar er is nu ook een
 * expliciete "Opslaan"-knop voor extra zekerheid.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectsApi, modulesApi, ApiError } from '../api/client';
import { AppHeader } from '../components/AppHeader';
import { Footer } from '../components/Footer';
import { AdresZoeker } from '../components/AdresZoeker';
import { Luchtfoto } from '../components/Luchtfoto';
import { FotoUpload, type ProjectFoto } from '../components/FotoUpload';
import { InfoTooltip } from '../components/InfoTooltip';
import { MaatregelDetail } from '../components/MaatregelDetail';
import { HuidigeSituatie } from '../components/HuidigeSituatie';
import { MaatregelSuggesties } from '../components/MaatregelSuggesties';
import { ChartCard, WaterverbruikChart, KasstroomChart, EnergiebalansChart } from '../components/Charts';
import type { PdokAdres } from '../api/pdok';
import type { HuidigeSituatieData } from '../data/huidige-situatie';

const API_BASE_FOR_BEACON = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

interface Locatie {
  adres?: string; postcode?: string; huisnummer?: number; woonplaats?: string;
  rd_x?: number; rd_y?: number; lat?: number; lon?: number;
}

interface ProjectState {
  context: {
    club?: { naam?: string };
    gebouw?: { bouwjaar?: number; bvoTotaalM2?: number; plafondhoogteM?: number };
    energie?: { gasverbruikM3?: number; stroomverbruikTotaalKwh?: number; stroomprijsKaalPerKwh?: number; gasprijsPerM3?: number };
  };
  locatie?: Locatie;
  fotos?: ProjectFoto[];
  huidigeSituatie?: HuidigeSituatieData;
  gekozenMaatregelen: Record<string, unknown>;
  fase?: 1 | 2;
}

const LEGE_STATE: ProjectState = {
  context: { club: { naam: '' }, gebouw: {}, energie: {} },
  locatie: {},
  fotos: [],
  huidigeSituatie: {},
  gekozenMaatregelen: {},
  fase: 1,
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
  const [fase, setFase] = useState<1 | 2>(1);
  const [berekenFout, setBerekenFout] = useState<string | null>(null);
  const [pptFout, setPptFout] = useState<string | null>(null);
  const [opslaanFeedback, setOpslaanFeedback] = useState<string | null>(null);
  const autoSaveTimer = useRef<number | null>(null);
  const pendingDraft = useRef<ProjectState | null>(null);

  useEffect(() => {
    if (projectQuery.data?.state && !draft) {
      const s = projectQuery.data.state as Partial<ProjectState>;
      const next = {
        ...LEGE_STATE,
        ...s,
        context: {
          ...LEGE_STATE.context, ...(s.context ?? {}),
          club: { ...LEGE_STATE.context.club, ...(s.context?.club ?? {}) },
          gebouw: { ...LEGE_STATE.context.gebouw, ...(s.context?.gebouw ?? {}) },
          energie: { ...LEGE_STATE.context.energie, ...(s.context?.energie ?? {}) },
        },
        locatie: { ...LEGE_STATE.locatie, ...(s.locatie ?? {}) },
        fotos: s.fotos ?? [],
        huidigeSituatie: s.huidigeSituatie ?? {},
        gekozenMaatregelen: s.gekozenMaatregelen ?? {},
        fase: s.fase ?? 1,
      };
      setDraft(next);
      setFase(next.fase ?? 1);
    }
  }, [projectQuery.data, draft]);

  const save = useMutation({
    mutationFn: (state: ProjectState) =>
      projectsApi.update(id!, {
        state,
        clubNaam: state.context.club?.naam || 'Onbekend project',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', id] });
      setOpslaanFeedback('✓ Opgeslagen');
      setTimeout(() => setOpslaanFeedback(null), 2000);
    },
    onError: (err) => {
      setOpslaanFeedback('⚠ Opslaan mislukt — probeer opnieuw');
      console.error('Save mislukt', err);
    },
  });

  const bereken = useMutation({
    mutationFn: async () => {
      if (draft) await save.mutateAsync(draft);
      return projectsApi.bereken(id!);
    },
    onSuccess: () => {
      setBerekenFout(null);
      qc.invalidateQueries({ queryKey: ['project', id] });
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        const detail = (err.details as { message?: string; ontbrekendeVelden?: string[] })?.message;
        setBerekenFout(err.message + (detail ? ` — ${detail}` : ''));
      } else if (err instanceof Error) {
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
    onSuccess: () => setPptFout(null),
    onError: (err: unknown) => {
      if (err instanceof ApiError) setPptFout(err.message);
      else setPptFout('PowerPoint-export mislukt');
    },
  });

  function updateDraft(updater: (s: ProjectState) => ProjectState) {
    if (!draft) return;
    const next = updater(draft);
    setDraft(next);
    pendingDraft.current = next;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = window.setTimeout(() => {
      save.mutate(next);
      pendingDraft.current = null;
    }, 1200);
  }

  // Flush op unmount
  useEffect(() => {
    function flushPending() {
      if (pendingDraft.current && autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
        const blob = JSON.stringify({
          state: pendingDraft.current,
          clubNaam: pendingDraft.current.context.club?.naam || 'Onbekend project',
        });
        try {
          fetch(`${API_BASE_FOR_BEACON}/api/projects/${id}`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: blob,
            keepalive: true,
          });
        } catch { /* ignore */ }
        pendingDraft.current = null;
      }
    }
    window.addEventListener('beforeunload', flushPending);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushPending();
    });
    return () => {
      window.removeEventListener('beforeunload', flushPending);
      flushPending();
    };
  }, [id]);

  function adresGekozen(adres: PdokAdres) {
    if (!draft) return;
    const next: ProjectState = {
      ...draft,
      locatie: {
        adres: adres.weergavenaam, postcode: adres.postcode, huisnummer: adres.huisnummer,
        woonplaats: adres.woonplaatsnaam, rd_x: adres.rd_x, rd_y: adres.rd_y,
        lat: adres.lat, lon: adres.lon,
      },
      context: {
        ...draft.context,
        gebouw: {
          ...draft.context.gebouw,
          bouwjaar: adres.bouwjaar ?? draft.context.gebouw?.bouwjaar,
          bvoTotaalM2: adres.oppervlakte ?? draft.context.gebouw?.bvoTotaalM2,
        },
      },
    };
    // ADRES IS KRITIEK — direct saven, geen debounce
    setDraft(next);
    pendingDraft.current = null;
    if (autoSaveTimer.current) { clearTimeout(autoSaveTimer.current); autoSaveTimer.current = null; }
    save.mutate(next);
  }

  function gaNaarFase(nieuweFase: 1 | 2) {
    setFase(nieuweFase);
    if (draft) updateDraft(s => ({ ...s, fase: nieuweFase }));
  }

  if (projectQuery.isLoading || !draft) return <div className="p-8 text-gray-500">Laden…</div>;
  if (projectQuery.isError) return <div className="p-8 text-red-600">Project niet gevonden.</div>;

  const energie = draft.context.energie ?? {};
  const energieCompleet = ['gasverbruikM3', 'stroomverbruikTotaalKwh', 'gasprijsPerM3', 'stroomprijsKaalPerKwh']
    .every(k => typeof (energie as Record<string, unknown>)[k] === 'number' && (energie as Record<string, number>)[k] > 0);
  const kanBerekenen = energieCompleet && Object.keys(draft.gekozenMaatregelen).length > 0;
  const cached = projectQuery.data?.cachedResult;

  return (
    <div className="min-h-screen pb-12">
      <AppHeader rechts={
        <>
          <Link to="/kennisbank" className="text-sm text-gray-600 hover:text-primary-700">Kennisbank</Link>
          <Link to="/projecten" className="text-sm text-gray-600 hover:text-primary-700">← Projecten</Link>
        </>
      } />

      {/* Sticky sub-header met titel + actieknoppen */}
      <div className="bg-white/90 backdrop-blur border-b border-primary-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold text-primary-900">{draft.context.club?.naam || 'Nieuw project'}</h1>
            <p className="text-xs text-gray-500">
              {save.isPending ? 'Opslaan…' : (opslaanFeedback ?? (save.isSuccess ? '✓ Opgeslagen' : 'Wijzig om op te slaan'))}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => { if (draft) save.mutate(draft); }}
              className="btn-secondary"
              disabled={save.isPending}
              title="Direct opslaan"
            >
              {save.isPending ? 'Opslaan…' : '💾 Opslaan'}
            </button>
            <button
              onClick={() => { setBerekenFout(null); bereken.mutate(); }}
              className="btn-accent"
              disabled={bereken.isPending || !kanBerekenen}
              title={!energieCompleet ? 'Vul eerst alle 4 de energievelden in stap 1' : !Object.keys(draft.gekozenMaatregelen).length ? 'Kies eerst minstens één maatregel in stap 2' : 'Bereken businesscase'}
            >
              {bereken.isPending ? 'Berekenen…' : 'Bereken'}
            </button>
            <button
              onClick={() => { setPptFout(null); exportPpt.mutate(); }}
              className="btn-secondary"
              disabled={exportPpt.isPending || !cached}
              title={!cached ? 'Eerst berekenen' : 'Download PowerPoint'}
            >
              {exportPpt.isPending ? 'Exporteren…' : '↓ PowerPoint'}
            </button>
          </div>
        </div>

        {/* Tab-balk */}
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex gap-1 border-b border-gray-100">
            <TabKnop
              actief={fase === 1}
              onClick={() => gaNaarFase(1)}
              nummer={1}
              titel="Gegevens invoeren"
              ondertitel="Locatie, gebouw, verbruik, huidige situatie"
            />
            <TabKnop
              actief={fase === 2}
              onClick={() => gaNaarFase(2)}
              nummer={2}
              titel="Maatregelen kiezen"
              ondertitel="Aanbevolen op basis van stap 1"
              disabled={!energieCompleet}
              disabledReden="Vul eerst de energievelden in stap 1"
            />
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {fase === 1 ? (
          <Stap1Invoer
            draft={draft}
            updateDraft={updateDraft}
            adresGekozen={adresGekozen}
            onNaarStap2={() => gaNaarFase(2)}
            energieCompleet={energieCompleet}
          />
        ) : (
          <Stap2Maatregelen
            draft={draft}
            updateDraft={updateDraft}
            modulesQuery={modulesQuery}
            cached={cached}
            berekenFout={berekenFout}
            pptFout={pptFout}
            kanBerekenen={kanBerekenen}
            onTerugStap1={() => gaNaarFase(1)}
          />
        )}
      </main>
      <Footer />
    </div>
  );
}

/* ============================================================
 * Tabs
 * ============================================================ */

function TabKnop({ actief, onClick, nummer, titel, ondertitel, disabled, disabledReden }: {
  actief: boolean; onClick: () => void; nummer: number; titel: string; ondertitel: string;
  disabled?: boolean; disabledReden?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledReden : ''}
      className={`flex items-center gap-3 px-4 py-3 border-b-2 transition-all ${
        actief
          ? 'border-accent-orange text-primary-900'
          : disabled
            ? 'border-transparent text-gray-300 cursor-not-allowed'
            : 'border-transparent text-gray-600 hover:text-primary-700'
      }`}
    >
      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
        actief ? 'bg-accent-orange text-white' : 'bg-gray-100 text-gray-500'
      }`}>{nummer}</span>
      <div className="text-left">
        <div className="text-sm font-semibold leading-tight">{titel}</div>
        <div className="text-xs text-gray-500 leading-tight">{ondertitel}</div>
      </div>
    </button>
  );
}

/* ============================================================
 * STAP 1: Invoer
 * ============================================================ */

interface Stap1Props {
  draft: ProjectState;
  updateDraft: (u: (s: ProjectState) => ProjectState) => void;
  adresGekozen: (adres: PdokAdres) => void;
  onNaarStap2: () => void;
  energieCompleet: boolean;
}

function Stap1Invoer({ draft, updateDraft, adresGekozen, onNaarStap2, energieCompleet }: Stap1Props) {
  return (
    <div className="grid lg:grid-cols-[3fr_2fr] gap-6">
      <div className="space-y-5">
        <Sectie titel="Project">
          <Veld label="Naam van de club of organisatie" tooltip="Komt op alle slides van het rapport.">
            <input
              className="input"
              placeholder="Bijvoorbeeld: VV Oranje Boys"
              value={draft.context.club?.naam ?? ''}
              onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, club: { ...s.context.club, naam: e.target.value } } }))}
            />
          </Veld>
        </Sectie>

        <Sectie titel="Locatie">
          <Veld label="Adres opzoeken" tooltip="Typ postcode + huisnummer of straatnaam + plaats. Bouwjaar en oppervlakte worden automatisch uit BAG opgehaald.">
            <AdresZoeker initieel={draft.locatie?.adres ?? ''} onAdresGekozen={adresGekozen} />
          </Veld>
          {draft.locatie?.adres && (
            <p className="text-xs text-primary-700 mt-2">✓ {draft.locatie.adres}</p>
          )}
        </Sectie>

        <Sectie titel="Gebouw">
          <div className="grid grid-cols-2 gap-3">
            <Veld label="Bouwjaar" tooltip="Automatisch ingevuld uit BAG na adres-keuze. Overschrijfbaar.">
              <input type="number" className="input" placeholder="bv. 1985"
                value={draft.context.gebouw?.bouwjaar ?? ''}
                onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, gebouw: { ...s.context.gebouw, bouwjaar: e.target.value ? Number(e.target.value) : undefined } } }))} />
            </Veld>
            <Veld label="BVO (m²)" tooltip="Bruto vloeroppervlak. Uit BAG; controleer of het echt het clubhuis is.">
              <input type="number" className="input" placeholder="bv. 450"
                value={draft.context.gebouw?.bvoTotaalM2 ?? ''}
                onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, gebouw: { ...s.context.gebouw, bvoTotaalM2: e.target.value ? Number(e.target.value) : undefined } } }))} />
            </Veld>
          </div>
          <Veld label="Plafondhoogte (m)" tooltip="Gemiddelde vrije hoogte. Niet uit BAG — zelf meten of schatten (typisch 2,7-3,5m).">
            <input type="number" step="0.1" className="input" placeholder="bv. 3,0"
              value={draft.context.gebouw?.plafondhoogteM ?? ''}
              onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, gebouw: { ...s.context.gebouw, plafondhoogteM: e.target.value ? Number(e.target.value) : undefined } } }))} />
          </Veld>
        </Sectie>

        <Sectie
          titel={`Energieverbruik ${energieCompleet ? '✓' : '(vereist)'}`}
          tooltipTekst="Op te vragen via jaarrekening van energieleverancier of slimme meter. Cijfers van het laatste volledige jaar geven beste resultaat."
          accent={!energieCompleet}
        >
          <div className="grid grid-cols-2 gap-3">
            <Veld label="Gas (m³/jaar)" tooltip="Totaal gasverbruik per jaar. Op jaarafrekening.">
              <input type="number" className="input" placeholder="bv. 5.000"
                value={draft.context.energie?.gasverbruikM3 ?? ''}
                onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, energie: { ...s.context.energie, gasverbruikM3: e.target.value ? Number(e.target.value) : undefined } } }))} />
            </Veld>
            <Veld label="Stroom (kWh/jaar)" tooltip="Bruto verbruik per jaar.">
              <input type="number" className="input" placeholder="bv. 25.000"
                value={draft.context.energie?.stroomverbruikTotaalKwh ?? ''}
                onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, energie: { ...s.context.energie, stroomverbruikTotaalKwh: e.target.value ? Number(e.target.value) : undefined } } }))} />
            </Veld>
            <Veld label="Gasprijs (€/m³)" tooltip="Werkelijke prijs incl. BTW + heffingen. 2025: ~€1,35.">
              <input type="number" step="0.01" className="input" placeholder="bv. 1,35"
                value={draft.context.energie?.gasprijsPerM3 ?? ''}
                onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, energie: { ...s.context.energie, gasprijsPerM3: e.target.value ? Number(e.target.value) : undefined } } }))} />
            </Veld>
            <Veld label="Stroomprijs (€/kWh)" tooltip="Kale stroomprijs (zonder energiebelasting/netbeheer). 2025: ~€0,30.">
              <input type="number" step="0.01" className="input" placeholder="bv. 0,30"
                value={draft.context.energie?.stroomprijsKaalPerKwh ?? ''}
                onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, energie: { ...s.context.energie, stroomprijsKaalPerKwh: e.target.value ? Number(e.target.value) : undefined } } }))} />
            </Veld>
          </div>
        </Sectie>

        <Sectie titel="Huidige situatie" tooltipTekst="Inventarisatie wat er al is en wat verbeterd kan worden. Beïnvloedt direct welke maatregelen in stap 2 worden aanbevolen.">
          <HuidigeSituatie
            data={draft.huidigeSituatie ?? {}}
            onChange={(data) => updateDraft(s => ({ ...s, huidigeSituatie: data }))}
          />
        </Sectie>

        {/* CTA naar stap 2 */}
        <div className="card p-4 bg-primary-50/60 border-primary-200 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-primary-900">Klaar met invoer?</p>
            <p className="text-xs text-gray-600">Ga door naar stap 2 voor de voorgestelde maatregelen.</p>
          </div>
          <button
            onClick={onNaarStap2}
            disabled={!energieCompleet}
            className="btn-accent"
            title={!energieCompleet ? 'Vul eerst de 4 energievelden' : 'Door naar maatregelen'}
          >
            Naar maatregelen →
          </button>
        </div>
      </div>

      <div className="space-y-5">
        <Sectie titel="Luchtfoto" tooltipTekst="Bron: Kadaster luchtfoto. Bekijk het dak voor PV-potentieel, oriëntatie en bestaande panelen.">
          <Luchtfoto
            rdX={draft.locatie?.rd_x ?? 0}
            rdY={draft.locatie?.rd_y ?? 0}
            lat={draft.locatie?.lat ?? 0}
            lon={draft.locatie?.lon ?? 0}
            hoogte={280}
          />
        </Sectie>

        <Sectie titel="Foto's" tooltipTekst="Voeg foto's van de scan toe. Max 10 per project.">
          <FotoUpload
            fotos={draft.fotos ?? []}
            onChange={(fotos) => updateDraft(s => ({ ...s, fotos }))}
          />
        </Sectie>
      </div>
    </div>
  );
}

/* ============================================================
 * STAP 2: Maatregelen + grafieken + resultaat
 * ============================================================ */

interface Stap2Props {
  draft: ProjectState;
  updateDraft: (u: (s: ProjectState) => ProjectState) => void;
  modulesQuery: { data?: { modules: Array<{ id: string; naam: string; defaultInput: unknown }>; groepen: Record<string, readonly string[]> } };
  cached: any;
  berekenFout: string | null;
  pptFout: string | null;
  kanBerekenen: boolean;
  onTerugStap1: () => void;
}

function Stap2Maatregelen({ draft, updateDraft, modulesQuery, cached, berekenFout, pptFout, kanBerekenen, onTerugStap1 }: Stap2Props) {
  const gekozenIds = Object.keys(draft.gekozenMaatregelen);

  // Bouw waterverbruik-grafiekdata uit detail-input
  const waterData = useMemo(() => bouwWaterverbruikData(draft.gekozenMaatregelen), [draft.gekozenMaatregelen]);
  const energiebalansData = useMemo(() => bouwEnergiebalansData(draft, cached), [draft, cached]);
  const kasstroomData = useMemo(() => bouwKasstroomData(cached), [cached]);

  return (
    <div className="grid lg:grid-cols-[3fr_2fr] gap-6">
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <button onClick={onTerugStap1} className="text-sm text-gray-600 hover:text-primary-700">
            ← Terug naar stap 1
          </button>
          <p className="text-xs text-gray-500">
            {gekozenIds.length} maatregel{gekozenIds.length === 1 ? '' : 'en'} gekozen
          </p>
        </div>

        {/* Aanbevolen maatregelen, gesorteerd */}
        {modulesQuery.data && (
          <Sectie titel="Aanbevolen maatregelen" tooltipTekst="Gesorteerd op relevantie voor deze locatie en huidige situatie. Vink aan wat je in de businesscase wilt meenemen.">
            <MaatregelSuggesties
              beschikbareModules={modulesQuery.data}
              context={{
                bouwjaar: draft.context.gebouw?.bouwjaar,
                bvoM2: draft.context.gebouw?.bvoTotaalM2,
                gasverbruikM3: draft.context.energie?.gasverbruikM3,
                stroomverbruikKwh: draft.context.energie?.stroomverbruikTotaalKwh,
              }}
              huidigeSituatie={draft.huidigeSituatie ?? {}}
              gekozenIds={gekozenIds}
              onToggle={(id, defaults) => updateDraft(s => {
                const next = { ...s.gekozenMaatregelen };
                if (id in next) delete next[id];
                else next[id] = defaults;
                return { ...s, gekozenMaatregelen: next };
              })}
            />
          </Sectie>
        )}

        {/* Details per gekozen maatregel */}
        {gekozenIds.length > 0 && modulesQuery.data && (
          <Sectie titel="Details per gekozen maatregel" tooltipTekst="Klap een paneel uit om de aannames voor die maatregel aan te passen.">
            <div className="space-y-2">
              {gekozenIds.map(modId => {
                const mod = modulesQuery.data?.modules.find(m => m.id === modId);
                return (
                  <MaatregelDetail
                    key={modId}
                    maatregelId={modId}
                    maatregelNaam={mod?.naam ?? modId}
                    input={draft.gekozenMaatregelen[modId] as Record<string, unknown> ?? {}}
                    onChange={(input) => updateDraft(s => ({ ...s, gekozenMaatregelen: { ...s.gekozenMaatregelen, [modId]: input } }))}
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

      {/* Rechter kolom: resultaat + grafieken */}
      <div className="space-y-5">
        <Sectie titel="Voor de penningmeester">
          {!kanBerekenen && (
            <p className="text-sm text-gray-500">
              {!Object.keys(draft.gekozenMaatregelen).length
                ? 'Vink minstens één maatregel aan.'
                : 'Vul eerst alle energievelden in stap 1.'}
            </p>
          )}
          {berekenFout && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
              <p className="font-medium text-red-900 mb-1">Berekening mislukt</p>
              <p className="text-red-800 text-xs">{berekenFout}</p>
            </div>
          )}
          {pptFout && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
              <p className="font-medium text-red-900 mb-1">PowerPoint mislukt</p>
              <p className="text-red-800 text-xs">{pptFout}</p>
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
                    ? `${cached.rollup.gemiddeldeTerugverdientijdJaren.toFixed(1)} jaar` : 'n.v.t.'
                } />
                <Stat label="CO₂-besparing" value={`${(cached.rollup.totaleCo2BesparingKg / 1000).toFixed(1)} ton/jaar`} />
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

        {/* Grafieken */}
        {waterData.length > 0 && (
          <ChartCard
            titel="Waterverbruik per dag"
            ondertitel="Berekend uit gedetailleerde douches-invoer in stap 2"
            hoogte={240}
          >
            <WaterverbruikChart data={waterData} />
          </ChartCard>
        )}

        {kasstroomData.length > 0 && (
          <ChartCard
            titel="Cumulatief netto rendement"
            ondertitel="Over 15 jaar, na aftrek netto investering"
            hoogte={240}
          >
            <KasstroomChart data={kasstroomData} />
          </ChartCard>
        )}

        {energiebalansData.length > 0 && (
          <ChartCard
            titel="Verdeling huidig gasverbruik"
            ondertitel="Inschatting per categorie"
            hoogte={260}
          >
            <EnergiebalansChart data={energiebalansData} />
          </ChartCard>
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * Helpers
 * ============================================================ */

function bouwWaterverbruikData(gekozen: Record<string, unknown>) {
  const douches = gekozen['douches-analyse'] as Record<string, unknown> | undefined;
  if (!douches || douches.modus !== 'gedetailleerd') return [];
  const dagen = douches.dagen as Array<{ dag: string; training: number; wedstrijd: number }> | undefined;
  if (!dagen) return [];
  const liters = 35; // L per beurt
  return dagen.map(d => ({
    dag: d.dag,
    trainingL: (d.training ?? 0) * liters,
    wedstrijdL: (d.wedstrijd ?? 0) * liters,
  }));
}

function bouwKasstroomData(cached: any) {
  if (!cached?.rollup) return [];
  const netto = cached.rollup.nettoInvestering ?? 0;
  const besparingPerJr = cached.rollup.totaleBesparingPerJaar ?? 0;
  if (besparingPerJr <= 0) return [];
  const data = [];
  let cumulatief = -netto;
  data.push({ jaar: 0, cumulatief });
  for (let j = 1; j <= 15; j++) {
    cumulatief += besparingPerJr * Math.pow(1.0, j);  // geen prijsstijging, conservatief
    data.push({ jaar: j, cumulatief: Math.round(cumulatief) });
  }
  return data;
}

function bouwEnergiebalansData(draft: ProjectState, _cached: any) {
  const gas = draft.context.energie?.gasverbruikM3 ?? 0;
  if (gas <= 0) return [];
  // Heuristische verdeling op basis van standaardprofiel sportclub
  return [
    { naam: 'Ruimteverwarming', m3: Math.round(gas * 0.55) },
    { naam: 'Tapwater (douches)', m3: Math.round(gas * 0.35) },
    { naam: 'Keuken / overig', m3: Math.round(gas * 0.10) },
  ];
}

function Sectie({ titel, tooltipTekst, children, accent }: { titel: string; tooltipTekst?: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <section className={`card p-5 ${accent ? 'border-accent-orange/60 border-2' : ''}`}>
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
