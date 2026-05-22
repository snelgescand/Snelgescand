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
import { projectsApi, modulesApi, ApiError, bagApi } from '../api/client';
import { berekenLokaal, BerekenValidatieFout } from '../util/lokaal-bereken';
import { AppHeader } from '../components/AppHeader';
import { Footer } from '../components/Footer';
import { AdresZoeker } from '../components/AdresZoeker';
import { LaadScherm } from '../components/LaadScherm';
import { Luchtfoto } from '../components/Luchtfoto';
import { FotoUpload, type ProjectFoto } from '../components/FotoUpload';
import { LogoUpload, type ClubLogo } from '../components/LogoUpload';
import { ProjectleiderSelect } from '../components/ProjectleiderSelect';
import { SaveIndicator } from '../components/SaveIndicator';
import { InfoTooltip } from '../components/InfoTooltip';
import { MaatregelDetail } from '../components/MaatregelDetail';
import { HuidigeSituatie } from '../components/HuidigeSituatie';
import { MaatregelSuggesties } from '../components/MaatregelSuggesties';
import { ChartCard, WaterverbruikChart, KasstroomChart, EnergiebalansChart, WaterverbruikPerUurChart } from '../components/Charts';
import { TrainingsSchemaInvoer, analyseSchema, getSportConfig, douchePercentage, LITERS_PER_DOUCHE, type TrainingsSchema, type TrainingMoment } from '../components/TrainingsSchema';
import { EnergielabelKaart } from '../components/EnergielabelKaart';
import { HistorischVerbruik } from '../components/HistorischVerbruik';
import { berekenEnergielabel, berekenLabelNaMaatregelen, bepaalLabelSprong } from '../util/energielabel';
import type { PdokAdres } from '../api/pdok';
import type { HuidigeSituatieData } from '../data/huidige-situatie';

const API_BASE_FOR_BEACON = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

interface Locatie {
  adres?: string; postcode?: string; huisnummer?: number; woonplaats?: string;
  rd_x?: number; rd_y?: number; lat?: number; lon?: number;
}

interface ProjectState {
  context: {
    club?: { naam?: string; type?: string };
    gebouw?: {
      bouwjaar?: number;
      /** Laatste grondige renovatie / verbouwing (optioneel). Wordt vermeld op de PPT
       *  als een renovatiejaar is ingevuld dat ná het bouwjaar ligt — geeft de
       *  adviseur een handvat om de isolatie-staat realistischer in te schatten. */
      renovatiejaar?: number;
      bvoTotaalM2?: number;
      plafondhoogteM?: number;
      bouwhoogteM?: number;
      // Excel-velden uit Rekenmodel inputsheet
      typeSport?: string;
      aantalVeldenBanen?: number;
      aantalLeden?: number;
      aantalKleedkamers?: number;
      aantalDouchekoppen?: number;
      eigendom?: string;        // legacy — vervangen door eigendomGebouw + eigendomGrond
      eigendomGebouw?: string;
      eigendomGrond?: string;
    };
    energie?: {
      gasverbruikM3?: number;
      stroomverbruikTotaalKwh?: number;
      stroomprijsKaalPerKwh?: number;
      gasprijsPerM3?: number;
      gasHistorischM3?: number[];
      stroomHistorischKwh?: number[];
      aansluitwaardeLabel?: string;  // bv "3x25 A"
      aansluitwaardeElektra?: { fase: 1 | 3; ampere: number; vermogenKw: number };
      /** Gasaansluiting — label (bv "G6", "G25") of "geen" voor gasloos */
      gasAansluitingLabel?: string;
      /** Maximale capaciteit van gasmeter in m³/h */
      gasAansluitingM3PerUur?: number;
    };
  };
  locatie?: Locatie;
  fotos?: ProjectFoto[];
  /** Club-logo (PNG/JPG/SVG, base64) — komt in PowerPoint */
  logo?: ClubLogo;
  huidigeSituatie?: HuidigeSituatieData;
  gekozenMaatregelen: Record<string, unknown>;
  fase?: 1 | 2;
  /** Trainingsschema voor specifiekere gas/water-verdeling */
  trainingsSchema?: TrainingsSchema;
  /** Opgeslagen lokaal berekend resultaat — zodat backend het ook heeft voor PPT */
  berekendResultaat?: Record<string, unknown>;
  /** Project-fase voor lifecycle (concept/scan-gepland/etc) — zie data/lifecycle.ts */
  lifecycle?: string;
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
  const [bevestigVerwijder, setBevestigVerwijder] = useState(false);
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
    },
    onError: (err) => {
      console.error('Save mislukt', err);
    },
  });

  // Lokale berekening — gebruikt calc-core direct in de browser, geen
  // afhankelijkheid van backend-deploy. Het resultaat wordt in de project-state
  // gesaved zodat de backend het kan gebruiken voor PPT-export.
  const [lokaalResultaat, setLokaalResultaat] = useState<ReturnType<typeof berekenLokaal> | null>(null);

  const bereken = useMutation({
    mutationFn: async (): Promise<ReturnType<typeof berekenLokaal>> => {
      if (!draft) throw new Error('Geen project geladen');
      // Eerst opslaan zodat de backend de laatste state heeft (voor PPT)
      await save.mutateAsync(draft);
      // Reken LOKAAL — werkt onafhankelijk van backend versie
      const r = berekenLokaal(draft);
      // Save het resultaat ook naar backend (in state.berekendResultaat),
      // zodat de PPT-route het kan gebruiken zonder zelf te rekenen
      const nextWithResult: ProjectState = {
        ...draft,
        berekendResultaat: r as unknown as Record<string, unknown>,
      };
      await save.mutateAsync(nextWithResult);
      return r;
    },
    onSuccess: (r) => {
      setBerekenFout(null);
      setLokaalResultaat(r);
    },
    onError: (err: unknown) => {
      if (err instanceof BerekenValidatieFout) {
        setBerekenFout(err.message);
      } else if (err instanceof Error) {
        setBerekenFout('Berekening mislukt: ' + err.message);
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

  const exportPptTemplate = useMutation({
    mutationFn: () => projectsApi.exporteerPptTemplate(
      id!,
      `Verduurzamingsplan_${(draft?.context.club?.naam ?? 'project').replace(/[^a-zA-Z0-9]/g, '_')}_SO.pptx`,
    ),
    onSuccess: () => setPptFout(null),
    onError: (err: unknown) => {
      if (err instanceof ApiError) setPptFout(err.message);
      else setPptFout('PPT-template-export mislukt');
    },
  });

  const verwijder = useMutation({
    mutationFn: () => projectsApi.delete(id!),
    onSuccess: () => {
      window.location.href = '/projecten';
    },
    onError: (err: unknown) => {
      alert('Verwijderen mislukt: ' + (err instanceof Error ? err.message : 'onbekend'));
      setBevestigVerwijder(false);
    },
  });

  function updateDraft(updater: (s: ProjectState) => ProjectState) {
    if (!draft) return;
    const next = updater(draft);
    setDraft(next);
    pendingDraft.current = next;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = window.setTimeout(() => {
      if (pendingDraft.current) {
        save.mutate(pendingDraft.current);
        pendingDraft.current = null;
      }
      autoSaveTimer.current = null;
    }, 600);  // 600ms — vrijwel direct, maar voorkomt save bij elke toetsaanslag
  }

  // Sync douches-analyse uit het trainingsschema — Bart wil niet 2x invullen.
  // Wanneer trainingsSchema is ingevuld, wordt de douches-analyse-input automatisch
  // afgeleid en in gekozenMaatregelen geplaatst (maar alleen als de gebruiker
  // 'douches-analyse' heeft aangevinkt in stap 2).
  useEffect(() => {
    if (!draft) return;
    const schema = draft.trainingsSchema;
    if (!schema || schema.length === 0) return;
    if (!('douches-analyse' in (draft.gekozenMaatregelen ?? {}))) return;

    // Bouw douches-analyse input vanuit het schema
    const dagenMap: Record<string, { training: number; wedstrijd: number }> = {};
    for (const m of schema) {
      const spelersO13 = (m.aantalTeamsOnder13 ?? 0) * 10;  // 10 sp/team
      const spelersV13 = (m.aantalTeamsVanaf13 ?? 0) * 15;  // 18 sp/team
      const douchesJeugd = spelersO13 * (m.type === 'wedstrijd' ? 0.50 : m.type === 'training' ? 0.25 : 0);
      const douchesSen = spelersV13 * (m.type === 'wedstrijd' ? 1.00 : m.type === 'training' ? 0.95 : 0);
      if (!dagenMap[m.dag]) dagenMap[m.dag] = { training: 0, wedstrijd: 0 };
      if (m.type === 'training') {
        dagenMap[m.dag].training += douchesJeugd + douchesSen;
      } else if (m.type === 'wedstrijd') {
        dagenMap[m.dag].wedstrijd += douchesJeugd + douchesSen;
      }
    }
    const dagen = (['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'] as const)
      .map(d => ({ dag: d, training: Math.round(dagenMap[d]?.training ?? 0), wedstrijd: Math.round(dagenMap[d]?.wedstrijd ?? 0) }));

    const huidigeInput = draft.gekozenMaatregelen['douches-analyse'] as Record<string, unknown> | undefined;
    const nieuweInput = {
      ...(huidigeInput ?? {}),
      modus: 'gedetailleerd',
      dagen,
      uitTrainingsSchema: true,  // markeer als auto-gevuld
    };
    // Alleen update als anders
    if (JSON.stringify(huidigeInput?.dagen) !== JSON.stringify(dagen)) {
      updateDraft(s => ({
        ...s,
        gekozenMaatregelen: { ...s.gekozenMaatregelen, 'douches-analyse': nieuweInput },
      }));
    }
  }, [draft?.trainingsSchema, draft?.gekozenMaatregelen?.['douches-analyse'] ? 'aanwezig' : 'afwezig']);

  // Flush op unmount + tab-switch + browser-sluit
  useEffect(() => {
    function flushPending() {
      if (pendingDraft.current) {
        if (autoSaveTimer.current) {
          clearTimeout(autoSaveTimer.current);
          autoSaveTimer.current = null;
        }
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
    function onVisibility() {
      if (document.visibilityState === 'hidden') flushPending();
    }
    window.addEventListener('beforeunload', flushPending);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('beforeunload', flushPending);
      document.removeEventListener('visibilitychange', onVisibility);
      flushPending();
    };
  }, [id]);

  // Status van de BAG-lookup voor zichtbare feedback in UI
  const [bagStatus, setBagStatus] = useState<BagStatusType>({ foutmeldingen: [] });

  async function adresGekozen(adres: PdokAdres) {
    if (!draft) return;
    console.log('[BAG] PDOK lookup response (frontend):', adres);

    const status: BagStatusType = { foutmeldingen: [], laatstGeprobeerd: adres.weergavenaam };

    const locatie = {
      adres: adres.weergavenaam, postcode: adres.postcode, huisnummer: adres.huisnummer,
      woonplaats: adres.woonplaatsnaam, provincie: adres.provincienaam,
      rd_x: adres.rd_x, rd_y: adres.rd_y,
      lat: adres.lat, lon: adres.lon,
    };
    const gebouwPatch: Record<string, unknown> = {};

    // Roep backend BAG-proxy aan — die probeert PDOK Locatieserver, BAG OGC v2,
    // BAG WFS en 3D BAG op een rij. Eén call vanaf de frontend.
    let bagResult: Awaited<ReturnType<typeof bagApi.lookup>> | null = null;
    try {
      bagResult = await bagApi.lookup({
        adresId: adres.id,
        rd_x: adres.rd_x,
        rd_y: adres.rd_y,
        pandid: adres.pandid,
      });
      console.log('[BAG-proxy] Backend resultaat:', bagResult);

      if (bagResult.bouwjaar) {
        gebouwPatch.bouwjaar = bagResult.bouwjaar;
        const bron = bagResult.bronnen.find(b => b.includes(':bouwjaar'))?.split(':')[0] ?? 'BAG';
        status.bouwjaar = { waarde: bagResult.bouwjaar, bron: bron as 'PDOK' | 'BAG3D' | 'BAG-OGC' | 'BAG-WFS' };
      }
      if (bagResult.oppervlakte) {
        gebouwPatch.bvoTotaalM2 = bagResult.oppervlakte;
        const bron = bagResult.bronnen.find(b => b.includes(':oppervlakte'))?.split(':')[0] ?? 'BAG';
        status.oppervlakte = { waarde: bagResult.oppervlakte, bron: bron as 'PDOK' | 'BAG3D-schatting' | 'BAG-OGC' | 'BAG-WFS' };
      }
      if (bagResult.bouwhoogteM) {
        gebouwPatch.bouwhoogteM = bagResult.bouwhoogteM;
        status.bouwhoogte = { waarde: bagResult.bouwhoogteM, bron: 'BAG3D' };
      }
      if (bagResult.plafondhoogteM && !draft.context.gebouw?.plafondhoogteM) {
        gebouwPatch.plafondhoogteM = bagResult.plafondhoogteM;
        status.plafondhoogte = { waarde: bagResult.plafondhoogteM, bron: 'BAG3D-schatting' };
      }

      // Diagnostiek: per endpoint laten zien wat gebeurde
      for (const stap of bagResult.geprobeerd) {
        if (stap.resultaat !== 'ok') {
          status.foutmeldingen.push(`${stap.endpoint}: ${stap.status} ${stap.resultaat}`);
        }
      }
    } catch (e) {
      console.error('[BAG-proxy] mislukt:', e);
      status.foutmeldingen.push(`BAG-proxy fout: ${e instanceof Error ? e.message : 'onbekend'}`);
    }

    if (!gebouwPatch.bouwjaar) status.foutmeldingen.push('Geen bouwjaar gevonden in alle bronnen');
    if (!gebouwPatch.bvoTotaalM2) status.foutmeldingen.push('Geen oppervlakte gevonden — vul handmatig in');

    const next: ProjectState = {
      ...draft,
      locatie,
      context: { ...draft.context, gebouw: { ...draft.context.gebouw, ...gebouwPatch } },
    };
    setDraft(next);
    pendingDraft.current = null;
    if (autoSaveTimer.current) { clearTimeout(autoSaveTimer.current); autoSaveTimer.current = null; }

    try {
      await projectsApi.saveLocatie(id!, locatie, gebouwPatch);
      save.mutate(next);
    } catch (err) {
      console.error('[Locatie save] mislukt', err);
      save.mutate(next);
    }

    setBagStatus(status);
  }

  function gaNaarFase(nieuweFase: 1 | 2) {
    setFase(nieuweFase);
    if (draft) updateDraft(s => ({ ...s, fase: nieuweFase }));
  }

  if (projectQuery.isLoading || !draft) return <LaadScherm subtitel="Project wordt opgehaald…" />;
  if (projectQuery.isError) return <div className="p-8 text-red-600">Project niet gevonden.</div>;

  const energie = draft.context.energie ?? {};
  const energieCompleet = ['gasverbruikM3', 'stroomverbruikTotaalKwh', 'gasprijsPerM3', 'stroomprijsKaalPerKwh']
    .every(k => typeof (energie as Record<string, unknown>)[k] === 'number' && (energie as Record<string, number>)[k] > 0);
  const kanBerekenen = energieCompleet && Object.keys(draft.gekozenMaatregelen).length > 0;
  // Resultaat komt eerst uit lokale berekening (zojuist gedaan), anders uit
  // opgeslagen state (oude berekening die met het project mee is geladen).
  const cached = lokaalResultaat ?? (draft.berekendResultaat as ReturnType<typeof berekenLokaal> | undefined) ?? projectQuery.data?.cachedResult;

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
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-primary-900 truncate">{draft.context.club?.naam || 'Nieuw project'}</h1>
            <SaveIndicator
              status={
                save.isPending ? 'saving' :
                save.isError ? 'error' :
                save.isSuccess ? 'saved' : 'idle'
              }
              laatsteFout={save.error instanceof Error ? save.error.message : undefined}
            />
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            {/* Lifecycle-fase selector */}
            <select
              value={(draft.lifecycle as string | undefined) ?? 'concept'}
              onChange={e => updateDraft(s => ({ ...s, lifecycle: e.target.value }))}
              className="input py-1.5 text-sm max-w-[180px]"
              title="Fase van het project"
            >
              <option value="concept">📝 Concept</option>
              <option value="scan-gepland">📅 Scan gepland</option>
              <option value="scan-uitgevoerd">✓ Scan uitgevoerd</option>
              <option value="rapport-opgesteld">📄 Rapport opgesteld</option>
              <option value="offertes-aangevraagd">💰 Offertes aangevraagd</option>
              <option value="in-uitvoering">🔨 In uitvoering</option>
              <option value="opgeleverd">🎉 Opgeleverd</option>
              <option value="archief">📦 Archief</option>
            </select>

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
              title={!cached ? 'Eerst berekenen' : 'Download PowerPoint (Snelgescand stijl)'}
            >
              {exportPpt.isPending ? 'Exporteren…' : '↓ PowerPoint'}
            </button>
            <button
              onClick={() => { setPptFout(null); exportPptTemplate.mutate(); }}
              className="btn-secondary"
              disabled={exportPptTemplate.isPending}
              title="Download op basis van originele Sportief Opgewekt template (86 slides, club-naam ingevuld)"
            >
              {exportPptTemplate.isPending ? 'Genereren…' : '↓ PPT (origineel)'}
            </button>
            <button
              onClick={() => setBevestigVerwijder(true)}
              className="text-sm text-gray-500 hover:text-red-600 px-2"
              title="Project verwijderen"
            >
              🗑
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
            bagStatus={bagStatus}
            onNaarStap2={() => gaNaarFase(2)}
            energieCompleet={energieCompleet}
            projectId={id!}
            huidigeEigenaarId={projectQuery.data?.eigenaarId}
            huidigeEigenaarNaam={projectQuery.data?.eigenaar?.naam}
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

      {/* Bevestigingsmodal voor verwijderen */}
      {bevestigVerwijder && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4"
             onClick={() => setBevestigVerwijder(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-primary-900 mb-2">Project verwijderen?</h3>
            <p className="text-sm text-gray-700 mb-4">
              Weet je zeker dat je <strong>{draft.context.club?.naam || 'dit project'}</strong> definitief wilt verwijderen?
              Deze actie kan niet ongedaan worden gemaakt.
            </p>
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary text-sm" onClick={() => setBevestigVerwijder(false)}>
                Annuleer
              </button>
              <button
                className="text-sm px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                disabled={verwijder.isPending}
                onClick={() => verwijder.mutate()}
              >
                {verwijder.isPending ? 'Verwijderen…' : 'Ja, verwijder'}
              </button>
            </div>
          </div>
        </div>
      )}
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

interface BagStatusType {
  bouwjaar?: { waarde: number; bron: 'PDOK' | 'BAG3D' | 'BAG-OGC' | 'BAG-WFS' };
  oppervlakte?: { waarde: number; bron: 'PDOK' | 'BAG3D-schatting' | 'BAG-OGC' | 'BAG-WFS' };
  bouwhoogte?: { waarde: number; bron: 'BAG3D' };
  plafondhoogte?: { waarde: number; bron: 'BAG3D-schatting' };
  laatstGeprobeerd?: string;
  foutmeldingen: string[];
}

interface Stap1Props {
  draft: ProjectState;
  updateDraft: (u: (s: ProjectState) => ProjectState) => void;
  adresGekozen: (adres: PdokAdres) => void;
  bagStatus: BagStatusType;
  onNaarStap2: () => void;
  energieCompleet: boolean;
  projectId: string;
  huidigeEigenaarId?: string;
  huidigeEigenaarNaam?: string;
}

function Stap1Invoer({ draft, updateDraft, adresGekozen, bagStatus, onNaarStap2, energieCompleet, projectId, huidigeEigenaarId, huidigeEigenaarNaam }: Stap1Props) {
  // Wordt 3D BAG-data getoond?
  const bouwhoogte = draft.context.gebouw?.bouwhoogteM;
  const trainAnalyse = (draft.trainingsSchema && draft.trainingsSchema.length > 0)
    ? analyseSchema(draft.trainingsSchema, draft.context.club?.type) : null;

  return (
    <div className="grid lg:grid-cols-[3fr_2fr] gap-6">
      <div className="space-y-5">

        {/* 1. Identiteit van de club */}
        <Sectie titel="1. Club">
          <div className="space-y-3">
            <Veld label="Naam van de club" tooltip="Komt op alle slides van het rapport en op het voorblad van de PowerPoint.">
              <input
                className="input"
                placeholder="Bijvoorbeeld: VV Oranje Boys"
                value={draft.context.club?.naam ?? ''}
                onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, club: { ...s.context.club, naam: e.target.value } } }))}
              />
            </Veld>
            <Veld label="Type vereniging" tooltip="Bepaalt typische douche/verbruiksprofielen. Gebruikt voor filteren in het projectoverzicht.">
              <select
                className="input"
                value={(draft.context.club as { type?: string } | undefined)?.type ?? ''}
                onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, club: { ...s.context.club, type: e.target.value || undefined } as typeof s.context.club } }))}
              >
                <option value="">— kies —</option>
                <option value="voetbal">Voetbal</option>
                <option value="hockey">Hockey</option>
                <option value="tennis">Tennis</option>
                <option value="padel">Padel</option>
                <option value="badminton">Badminton</option>
                <option value="squash">Squash</option>
                <option value="korfbal">Korfbal</option>
                <option value="atletiek">Atletiek</option>
                <option value="honkbal">Honkbal/Softbal</option>
                <option value="volleybal">Volleybal</option>
                <option value="zwemmen">Zwemmen</option>
                <option value="rugby">Rugby</option>
                <option value="handbal">Handbal</option>
                <option value="multi">Multisport-complex</option>
                <option value="anders">Anders</option>
              </select>
            </Veld>
            <Veld label="Projectleider" tooltip="Wie van het team pakt dit project op? Gebruikt voor filtering in het projectoverzicht.">
              <ProjectleiderSelect
                projectId={projectId}
                huidigeEigenaarId={huidigeEigenaarId}
                huidigeEigenaarNaam={huidigeEigenaarNaam}
              />
            </Veld>
            <Veld label="Logo (optioneel)" tooltip="Auto-zoek probeert je clubsite te vinden. Anders upload of plak een URL. Max 500 KB.">
              <LogoUpload
                logo={draft.logo}
                clubnaam={draft.context.club?.naam}
                onChange={(logo) => updateDraft(s => ({ ...s, logo }))}
              />
            </Veld>
          </div>
        </Sectie>

        {/* 2. Locatie — direct na club, vult bouwjaar/oppervlakte/hoogte */}
        <Sectie titel="2. Locatie" tooltipTekst="Adres ophalen → BAG-bouwjaar, BVO en 3D-BAG-hoogte worden automatisch ingevuld.">
          <Veld label="Adres opzoeken" tooltip="Typ postcode + huisnummer of straatnaam + plaats.">
            <AdresZoeker initieel={draft.locatie?.adres ?? ''} onAdresGekozen={adresGekozen} />
          </Veld>
          {draft.locatie?.adres && (
            <p className="text-xs text-primary-700 mt-2">✓ {draft.locatie.adres}</p>
          )}

          {/* BAG-status: laat zichtbaar zien wat is opgehaald */}
          {bagStatus.laatstGeprobeerd && (
            <div className="mt-3 p-3 rounded-md border bg-primary-50/30 border-primary-200 text-sm">
              <p className="font-medium text-primary-900 mb-1">BAG-gegevens opgehaald:</p>
              <ul className="space-y-1 text-xs">
                <li className={bagStatus.bouwjaar ? 'text-primary-700' : 'text-gray-400'}>
                  {bagStatus.bouwjaar ? '✓' : '✗'} Bouwjaar:
                  {' '}{bagStatus.bouwjaar
                    ? <span className="font-medium">{bagStatus.bouwjaar.waarde}</span>
                    : <span className="italic">niet gevonden</span>}
                  {bagStatus.bouwjaar && <span className="text-gray-500"> (uit {bagStatus.bouwjaar.bron})</span>}
                </li>
                <li className={bagStatus.oppervlakte ? 'text-primary-700' : 'text-gray-400'}>
                  {bagStatus.oppervlakte ? '✓' : '✗'} Bruto vloeroppervlak:
                  {' '}{bagStatus.oppervlakte
                    ? <span className="font-medium">{bagStatus.oppervlakte.waarde} m²</span>
                    : <span className="italic">niet gevonden — vul handmatig in</span>}
                  {bagStatus.oppervlakte && <span className="text-gray-500"> (uit {bagStatus.oppervlakte.bron})</span>}
                </li>
                <li className={bagStatus.bouwhoogte ? 'text-primary-700' : 'text-gray-400'}>
                  {bagStatus.bouwhoogte ? '✓' : '✗'} Bouwhoogte:
                  {' '}{bagStatus.bouwhoogte
                    ? <span className="font-medium">{bagStatus.bouwhoogte.waarde} m</span>
                    : <span className="italic">niet beschikbaar</span>}
                  {bagStatus.bouwhoogte && <span className="text-gray-500"> (uit 3D BAG)</span>}
                </li>
                <li className={bagStatus.plafondhoogte ? 'text-primary-700' : 'text-gray-400'}>
                  {bagStatus.plafondhoogte ? '✓' : '✗'} Plafondhoogte:
                  {' '}{bagStatus.plafondhoogte
                    ? <span className="font-medium">~{bagStatus.plafondhoogte.waarde} m (schatting)</span>
                    : <span className="italic">niet beschikbaar</span>}
                </li>
              </ul>
              {bagStatus.foutmeldingen.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-accent-orange-dark">
                    ⚠ {bagStatus.foutmeldingen.length} aandachtspunt(en)
                  </summary>
                  <ul className="mt-1 ml-3 text-xs text-gray-600 list-disc">
                    {bagStatus.foutmeldingen.map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}
        </Sectie>

        {/* 3. Gebouw — komt uit BAG, met 3D BAG hoogte */}
        <Sectie titel="3. Gebouw" tooltipTekst="Velden zijn uit BAG/3D BAG voorgevuld. Controleer en pas aan indien nodig.">
          <div className="grid grid-cols-2 gap-3">
            <Veld label="Bouwjaar" tooltip="Uit BAG na adres-keuze. Bepaalt de standaard Rc-waardes voor dak/gevel/vloer.">
              <input type="number" className="input" placeholder="bv. 1985"
                value={draft.context.gebouw?.bouwjaar ?? ''}
                onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, gebouw: { ...s.context.gebouw, bouwjaar: e.target.value ? Number(e.target.value) : undefined } } }))} />
            </Veld>
            <Veld
              label="Renovatiejaar (optioneel)"
              tooltip="Het jaar van de laatste grondige renovatie of verbouwing. Verhoogt de aanname over isolatie-staat. Leeg laten als er geen renovatie is geweest."
            >
              <input type="number" className="input" placeholder={draft.context.gebouw?.bouwjaar ? `≥ ${draft.context.gebouw.bouwjaar}` : 'bv. 2010'}
                value={draft.context.gebouw?.renovatiejaar ?? ''}
                min={draft.context.gebouw?.bouwjaar}
                onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, gebouw: { ...s.context.gebouw, renovatiejaar: e.target.value ? Number(e.target.value) : undefined } } }))} />
            </Veld>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Veld label="Bruto vloeroppervlak (m²)" tooltip="BVO uit BAG. Controleer of dit het clubhuis is, niet eventuele bijgebouwen.">
              <input type="number" className="input" placeholder="bv. 450"
                value={draft.context.gebouw?.bvoTotaalM2 ?? ''}
                onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, gebouw: { ...s.context.gebouw, bvoTotaalM2: e.target.value ? Number(e.target.value) : undefined } } }))} />
            </Veld>
          </div>
          <Veld
            label="Plafondhoogte (m)"
            tooltip="Vrije binnenhoogte. Wordt geschat uit 3D BAG na adres-keuze; pas aan voor jouw situatie."
          >
            <input type="number" step="0.1" className="input" placeholder="bv. 3,0"
              value={draft.context.gebouw?.plafondhoogteM ?? ''}
              onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, gebouw: { ...s.context.gebouw, plafondhoogteM: e.target.value ? Number(e.target.value) : undefined } } }))} />
            {bouwhoogte && (
              <p className="text-xs text-gray-500 mt-1">
                📐 Bouwhoogte uit 3D BAG: <strong>{bouwhoogte.toFixed(1)} m</strong>
                {draft.context.gebouw?.plafondhoogteM && (
                  <span className="text-gray-400"> · geschat plafondhoogte op {((bouwhoogte - 0.5) / Math.max(1, Math.round(bouwhoogte/3))).toFixed(1)} m bij {Math.max(1, Math.round(bouwhoogte/3))} verdieping(en)</span>
                )}
              </p>
            )}
          </Veld>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3 pt-3 border-t border-gray-100">
            <Veld label="Type sportvereniging" tooltip="Heeft invloed op aanbevelingen (bv. teamsporten = douche-intensief; tennis = minder).">
              <select
                className="input"
                value={(draft.context.gebouw?.typeSport as string) ?? ''}
                onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, gebouw: { ...s.context.gebouw, typeSport: e.target.value || undefined } } }))}
              >
                <option value="">— kies —</option>
                <option value="voetbal">Voetbal</option>
                <option value="hockey">Hockey</option>
                <option value="korfbal">Korfbal</option>
                <option value="rugby">Rugby</option>
                <option value="tennis">Tennis</option>
                <option value="padel">Padel</option>
                <option value="badminton">Badminton</option>
                <option value="squash">Squash</option>
                <option value="atletiek">Atletiek</option>
                <option value="multisport">Multisport</option>
                <option value="overig">Overig</option>
              </select>
            </Veld>
            <Veld label="Aantal velden/banen" tooltip="Voor sportaccommodaties met buitenverlichting. Beïnvloedt aanbeveling LED-veldverlichting.">
              <input type="number" className="input" placeholder="bv. 4"
                value={draft.context.gebouw?.aantalVeldenBanen ?? ''}
                onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, gebouw: { ...s.context.gebouw, aantalVeldenBanen: e.target.value ? Number(e.target.value) : undefined } } }))} />
            </Veld>
            <Veld label="Aantal leden" tooltip="Voor algemene inschatting (warmwatervraag, kantine-gebruik).">
              <input type="number" className="input" placeholder="bv. 350"
                value={draft.context.gebouw?.aantalLeden ?? ''}
                onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, gebouw: { ...s.context.gebouw, aantalLeden: e.target.value ? Number(e.target.value) : undefined } } }))} />
            </Veld>
            <Veld label="Aantal kleedkamers" tooltip="Voor de gas-verdeling kleedkamers vs. kantine vs. overige ruimtes.">
              <input type="number" className="input" placeholder="bv. 8"
                value={draft.context.gebouw?.aantalKleedkamers ?? ''}
                onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, gebouw: { ...s.context.gebouw, aantalKleedkamers: e.target.value ? Number(e.target.value) : undefined } } }))} />
            </Veld>
            <Veld label="Totaal douchekoppen" tooltip="Vermenigvuldig het aantal douchekoppen per kleedkamer met het aantal kleedkamers. Voorbeeld: 6 douchekoppen × 8 kleedkamers = 48 totaal. Belangrijk voor boiler-dimensionering (warmtepompboiler, e-boiler).">
              <input type="number" className="input" placeholder="bv. 48"
                value={draft.context.gebouw?.aantalDouchekoppen ?? ''}
                onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, gebouw: { ...s.context.gebouw, aantalDouchekoppen: e.target.value ? Number(e.target.value) : undefined } } }))} />
            </Veld>
            <Veld label="Eigendom gebouw" tooltip="Het clubhuis: in eigen bezit, gehuurd van gemeente, of anderszins. DUMAVA-subsidie vereist eigen accommodatie.">
              <select
                className="input"
                value={(draft.context.gebouw?.eigendomGebouw as string) ?? (draft.context.gebouw?.eigendom as string) ?? ''}
                onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, gebouw: { ...s.context.gebouw, eigendomGebouw: e.target.value || undefined } } }))}
              >
                <option value="">— kies —</option>
                <option value="eigendom-club">Eigendom van de club</option>
                <option value="eigendom-gemeente">Eigendom van de gemeente</option>
                <option value="huur-gemeente">Huur van gemeente</option>
                <option value="huur-stichting">Huur van stichting</option>
                <option value="huur-overig">Huur overig</option>
              </select>
            </Veld>
            <Veld label="Eigendom grond" tooltip="De ondergrond/sportvelden: bij sportclubs vaak gemeentegrond met opstalrecht voor de club.">
              <select
                className="input"
                value={(draft.context.gebouw?.eigendomGrond as string) ?? ''}
                onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, gebouw: { ...s.context.gebouw, eigendomGrond: e.target.value || undefined } } }))}
              >
                <option value="">— kies —</option>
                <option value="eigendom-club">Eigendom van de club</option>
                <option value="eigendom-gemeente">Eigendom van de gemeente (vaakst)</option>
                <option value="opstalrecht-gemeente">Opstalrecht op gemeentegrond</option>
                <option value="erfpacht">Erfpacht</option>
                <option value="anders">Anders</option>
              </select>
            </Veld>
          </div>
        </Sectie>

        {/* 4. Energieverbruik — VEREIST */}
        <Sectie
          titel={`4. Energieverbruik ${energieCompleet ? '✓' : '(vereist)'}`}
          tooltipTekst="Vul ofwel het laatste jaar in, ofwel de afgelopen 3 jaar voor een betrouwbaarder gemiddelde. Te vinden op de jaarafrekening of via Mijn Energieleverancier."
          accent={!energieCompleet}
        >
          <HistorischVerbruik
            energie={draft.context.energie ?? {}}
            onChange={(patch) => updateDraft(s => ({ ...s, context: { ...s.context, energie: { ...s.context.energie, ...patch } } }))}
          />

          <div className="grid grid-cols-2 gap-3 mt-4">
            <Veld label="Gasprijs (€/m³)" tooltip="Werkelijke prijs incl. BTW + heffingen. Klik 'Actueel' voor CBS-gemiddelde 2025.">
              <div className="flex gap-1">
                <input type="number" step="0.01" className="input flex-1 min-w-0" placeholder="bv. 1,35"
                  value={draft.context.energie?.gasprijsPerM3 ?? ''}
                  onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, energie: { ...s.context.energie, gasprijsPerM3: e.target.value ? Number(e.target.value) : undefined } } }))} />
                <button type="button"
                  onClick={() => updateDraft(s => ({ ...s, context: { ...s.context, energie: { ...s.context.energie, gasprijsPerM3: 1.35 } } }))}
                  className="shrink-0 px-2 text-xs text-primary-700 hover:bg-primary-50 rounded border border-primary-200"
                  title="Vul CBS-gemiddelde 2025 in (€1,35)">
                  Actueel
                </button>
              </div>
            </Veld>
            <Veld label="Stroomprijs (€/kWh)" tooltip="Kale stroomprijs zonder energiebelasting/netbeheer. Klik 'Actueel' voor CBS-gemiddelde 2025.">
              <div className="flex gap-1">
                <input type="number" step="0.01" className="input flex-1 min-w-0" placeholder="bv. 0,30"
                  value={draft.context.energie?.stroomprijsKaalPerKwh ?? ''}
                  onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, energie: { ...s.context.energie, stroomprijsKaalPerKwh: e.target.value ? Number(e.target.value) : undefined } } }))} />
                <button type="button"
                  onClick={() => updateDraft(s => ({ ...s, context: { ...s.context, energie: { ...s.context.energie, stroomprijsKaalPerKwh: 0.30 } } }))}
                  className="shrink-0 px-2 text-xs text-primary-700 hover:bg-primary-50 rounded border border-primary-200"
                  title="Vul CBS-gemiddelde 2025 in (€0,30)">
                  Actueel
                </button>
              </div>
            </Veld>
          </div>

          {/* Aansluitwaarde — beïnvloedt waarschuwing voor netverzwaring */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <Veld
              label="Aansluitwaarde elektra"
              tooltip="Op de elektriciteitsmeter te vinden. Beïnvloedt of er netverzwaring nodig is bij elektrische maatregelen (warmtepomp, e-boiler, PV)."
            >
              <select
                className="input max-w-sm"
                value={draft.context.energie?.aansluitwaardeLabel ?? ''}
                onChange={e => {
                  const label = e.target.value;
                  const lookup: Record<string, { fase: 1 | 3; ampere: number; vermogenKw: number }> = {
                    '1x16 A': { fase: 1, ampere: 16, vermogenKw: 3.68 },
                    '1x25 A': { fase: 1, ampere: 25, vermogenKw: 5.75 },
                    '1x35 A': { fase: 1, ampere: 35, vermogenKw: 8.05 },
                    '1x40 A': { fase: 1, ampere: 40, vermogenKw: 9.2 },
                    '3x25 A': { fase: 3, ampere: 25, vermogenKw: 17.2 },
                    '3x35 A': { fase: 3, ampere: 35, vermogenKw: 24.1 },
                    '3x40 A': { fase: 3, ampere: 40, vermogenKw: 27.6 },
                    '3x50 A': { fase: 3, ampere: 50, vermogenKw: 34.5 },
                    '3x63 A': { fase: 3, ampere: 63, vermogenKw: 43.47 },
                    '3x80 A': { fase: 3, ampere: 80, vermogenKw: 55.2 },
                    'GV 80 kW':  { fase: 3, ampere: 116, vermogenKw: 80 },
                    'GV 100 kW': { fase: 3, ampere: 144, vermogenKw: 100 },
                    'GV 136 kW': { fase: 3, ampere: 196, vermogenKw: 136 },
                    'GV 175 kW': { fase: 3, ampere: 252, vermogenKw: 175 },
                    'GV 250 kW': { fase: 3, ampere: 360, vermogenKw: 250 },
                    'GV 500 kW': { fase: 3, ampere: 720, vermogenKw: 500 },
                    'GV 1000 kW': { fase: 3, ampere: 1440, vermogenKw: 1000 },
                  };
                  const conf = lookup[label];
                  updateDraft(s => ({
                    ...s,
                    context: {
                      ...s.context,
                      energie: {
                        ...s.context.energie,
                        aansluitwaardeLabel: label || undefined,
                        aansluitwaardeElektra: conf ?? undefined,
                      },
                    },
                  }));
                }}
              >
                <option value="">— onbekend (default 3x25A) —</option>
                <optgroup label="Kleinverbruik">
                  <option value="1x25 A">1×25 A (5,75 kW)</option>
                  <option value="1x35 A">1×35 A (8,05 kW)</option>
                  <option value="1x40 A">1×40 A (9,2 kW)</option>
                  <option value="3x25 A">3×25 A (17,2 kW) — meest voorkomend</option>
                  <option value="3x35 A">3×35 A (24,1 kW)</option>
                  <option value="3x40 A">3×40 A (27,6 kW)</option>
                  <option value="3x50 A">3×50 A (34,5 kW)</option>
                  <option value="3x63 A">3×63 A (43,5 kW)</option>
                  <option value="3x80 A">3×80 A (55,2 kW) — grens kleinverbruik</option>
                </optgroup>
                <optgroup label="Grootverbruik">
                  <option value="GV 80 kW">Grootverbruik 80 kW</option>
                  <option value="GV 100 kW">Grootverbruik 100 kW</option>
                  <option value="GV 136 kW">Grootverbruik 136 kW</option>
                  <option value="GV 175 kW">Grootverbruik 175 kW</option>
                  <option value="GV 250 kW">Grootverbruik 250 kW</option>
                  <option value="GV 500 kW">Grootverbruik 500 kW</option>
                  <option value="GV 1000 kW">Grootverbruik 1 MW</option>
                </optgroup>
              </select>
            </Veld>
          </div>

          {/* Gasaansluiting — relevant voor netbeheer-vastrecht en gasloos worden */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <Veld
              label="Aansluitwaarde gas"
              tooltip="Capaciteit van de gasmeter in m³/h. Op de gasmeter aangegeven (G4, G6, G10, etc.). Bepaalt vastrecht netbeheerder en of de aansluiting opgewaardeerd moet worden. Bij gasloos: kies 'Geen gasaansluiting'."
            >
              <select
                className="input max-w-sm"
                value={draft.context.energie?.gasAansluitingLabel ?? ''}
                onChange={e => {
                  const label = e.target.value;
                  const lookup: Record<string, number> = {
                    'G4':   6,
                    'G6':   10,
                    'G10':  16,
                    'G16':  25,
                    'G25':  40,
                    'G40':  65,
                    'G65':  100,
                    'G100': 160,
                    'G160': 250,
                  };
                  const m3PerUur = label === 'geen' ? 0 : (lookup[label] ?? undefined);
                  updateDraft(s => ({
                    ...s,
                    context: {
                      ...s.context,
                      energie: {
                        ...s.context.energie,
                        gasAansluitingLabel: label || undefined,
                        gasAansluitingM3PerUur: m3PerUur,
                      },
                    },
                  }));
                }}
              >
                <option value="">— onbekend —</option>
                <option value="geen">Geen gasaansluiting (gasloos)</option>
                <optgroup label="Kleinverbruik (≤ 40 m³/h)">
                  <option value="G4">G4 — 6 m³/h (huishoudelijk)</option>
                  <option value="G6">G6 — 10 m³/h (meest voorkomend bij sportclubs)</option>
                  <option value="G10">G10 — 16 m³/h</option>
                  <option value="G16">G16 — 25 m³/h</option>
                  <option value="G25">G25 — 40 m³/h — grens kleinverbruik</option>
                </optgroup>
                <optgroup label="Grootverbruik (&gt; 40 m³/h)">
                  <option value="G40">G40 — 65 m³/h</option>
                  <option value="G65">G65 — 100 m³/h</option>
                  <option value="G100">G100 — 160 m³/h</option>
                  <option value="G160">G160 — 250 m³/h</option>
                </optgroup>
              </select>
            </Veld>
          </div>
        </Sectie>

        {/* 5. Huidige situatie — inventarisatie */}
        <Sectie titel="5. Huidige situatie" tooltipTekst="Inventariseer wat er al is en wat verbeterd kan worden. Beïnvloedt direct welke maatregelen in stap 2 worden aanbevolen.">
          <HuidigeSituatie
            data={draft.huidigeSituatie ?? {}}
            onChange={(data) => updateDraft(s => ({ ...s, huidigeSituatie: data }))}
            bouwjaar={draft.context.gebouw?.bouwjaar}
          />
        </Sectie>

        {/* 6. Trainingsschema — bepaalt gas/water-verdeling */}
        <Sectie titel="6. Trainingsschema" tooltipTekst="Aantal voetbalteams per moment. Bepaalt gas/water-verdeling (kantine vs. douches) in stap 2. Hoe vollediger, hoe nauwkeuriger.">
          <TrainingsSchemaInvoer
            schema={draft.trainingsSchema ?? []}
            onChange={(s) => updateDraft(d => ({ ...d, trainingsSchema: s }))}
            typeVereniging={draft.context?.club?.type}
          />
        </Sectie>

        {/* CTA naar stap 2 */}
        <div className="card p-4 bg-primary-50/60 border-primary-200 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-primary-900">Klaar met de invoer?</p>
            <p className="text-xs text-gray-600">Stap 2 toont de aanbevolen maatregelen en businesscase.</p>
          </div>
          <button
            onClick={onNaarStap2}
            disabled={!energieCompleet}
            className="btn-accent shrink-0"
            title={!energieCompleet ? 'Vul eerst gas, stroom, gasprijs en stroomprijs in' : 'Door naar maatregelen'}
          >
            Naar maatregelen →
          </button>
        </div>
      </div>

      <div className="space-y-5">
        {/* Visueel: luchtfoto van het clubhuis */}
        <Sectie titel="Luchtfoto" tooltipTekst="Bron: Kadaster luchtfoto. Bekijk het dak voor PV-potentieel, oriëntatie en bestaande zonnepanelen.">
          <Luchtfoto
            rdX={draft.locatie?.rd_x ?? 0}
            rdY={draft.locatie?.rd_y ?? 0}
            lat={draft.locatie?.lat ?? 0}
            lon={draft.locatie?.lon ?? 0}
            hoogte={280}
          />
        </Sectie>

        {/* Foto's: pas relevant later, dus in zijbalk */}
        <Sectie titel="Foto's" tooltipTekst="Foto's van het clubhuis, dak, ketel, ledverlichting etc. Max 10 per project; verschijnen ook in het rapport.">
          <FotoUpload
            fotos={draft.fotos ?? []}
            onChange={(fotos) => updateDraft(s => ({ ...s, fotos }))}
          />
        </Sectie>

        {/* Live samenvatting van trainingsschema */}
        {trainAnalyse && trainAnalyse.totaalDoucheBeurtenPerWeek > 0 && (
          <Sectie titel="Schema-overzicht">
            <div className="text-xs text-gray-700 space-y-1">
              <p><strong>{trainAnalyse.totaalDoucheBeurtenPerWeek}</strong> douche-beurten per week</p>
              <p>≈ <strong>{(trainAnalyse.totaalLitersPerWeek / 1000).toFixed(1)} m³</strong> warm water per week</p>
              <p>{trainAnalyse.urenPerWeek} uur gebruik per week, ≈ {trainAnalyse.totaalPersonenPerWeek} persoon-bezoeken</p>
              <p className="text-gray-500 text-[10px] pt-1">
                Jeugd: {trainAnalyse.doucheBeurtenJeugdPerWeek} · Senioren: {trainAnalyse.doucheBeurtenSeniorenPerWeek}
              </p>
            </div>
          </Sectie>
        )}
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

  // Welke maatregel-detail-modal staat open? null = dicht.
  const [openDetailId, setOpenDetailId] = useState<string | null>(null);

  // === Maatwerk-context voor de advies-tegels bij het bewerken van een maatregel.
  // Bouwt scan-data + andere gekozen maatregelen in één object zodat
  // MaatregelContextAdvies per maatregel relevante tips kan tonen.
  const adviesContext = useMemo(() => {
    const schema = draft.trainingsSchema ?? [];
    let douchesPerWeek = 0;
    let urenPerWeek = 0;
    let maxTeams = 0;
    for (const m of schema) {
      const o13 = m.aantalTeamsOnder13 ?? 0;
      const v13 = m.aantalTeamsVanaf13 ?? 0;
      // Rough estimate of doucheBeurten — same logic als in PPT-route
      const douchePct = m.type === 'sociaal' ? 0 : m.type === 'wedstrijd' ? 0.9 : 0.6;
      douchesPerWeek += (o13 * 10 + v13 * 15) * douchePct;
      maxTeams = Math.max(maxTeams, o13 + v13);
      const [sh, sm] = (m.startTijd ?? '0:00').split(':').map(Number);
      const [eh, em] = (m.eindTijd ?? '0:00').split(':').map(Number);
      const duur = ((eh ?? 0) + (em ?? 0) / 60) - ((sh ?? 0) + (sm ?? 0) / 60);
      if (duur > 0) urenPerWeek += duur;
    }
    return {
      bvoM2: draft.context.gebouw?.bvoTotaalM2,
      bouwjaar: draft.context.gebouw?.bouwjaar,
      renovatiejaar: draft.context.gebouw?.renovatiejaar,
      stroomKwhPerJaar: draft.context.energie?.stroomverbruikTotaalKwh,
      gasM3PerJaar: draft.context.energie?.gasverbruikM3,
      aansluitVermogenKw: draft.context.energie?.aansluitwaardeElektra?.vermogenKw,
      gasAansluitingLabel: draft.context.energie?.gasAansluitingLabel,
      douchesPerWeek: Math.round(douchesPerWeek),
      urenPerWeek: Math.round(urenPerWeek * 10) / 10,
      totaalTeams: maxTeams,
      aantalDouchekoppen: draft.context.gebouw?.aantalDouchekoppen,
      andereMaatregelen: new Set(Object.keys(draft.gekozenMaatregelen).filter(id => id !== openDetailId)),
    };
  }, [draft.trainingsSchema, draft.context, draft.gekozenMaatregelen, openDetailId]);

  // Bouw waterverbruik-grafiekdata uit trainingsschema (of detail-input als fallback)
  const waterData = useMemo(() => bouwWaterverbruikData(draft), [draft]);
  const waterPerUurData = useMemo(
    () => bouwWaterPerUurData(draft.trainingsSchema, draft.context.club?.type),
    [draft.trainingsSchema, draft.context.club?.type],
  );
  const energiebalansData = useMemo(() => bouwEnergiebalansData(draft), [draft]);
  const kasstroomData = useMemo(() => bouwKasstroomData(cached), [cached]);

  // Energielabel berekening — huidig en (indien berekend) na maatregelen
  const energielabelData = useMemo(() => {
    const gas = draft.context.energie?.gasverbruikM3;
    const stroom = draft.context.energie?.stroomverbruikTotaalKwh;
    const bvo = draft.context.gebouw?.bvoTotaalM2;
    if (!gas || !stroom || !bvo) return null;

    const huidig = berekenEnergielabel({ gasverbruikM3: gas, stroomverbruikKwh: stroom, bvoM2: bvo });

    if (cached?.rollup) {
      const r = cached.rollup;
      const nieuw = berekenLabelNaMaatregelen({
        huidigGasM3: gas,
        huidigStroomKwh: stroom,
        bvoM2: bvo,
        gasBesparingM3: r.totaleBesparingGasM3 ?? 0,
        stroomBesparingKwh: r.totaleBesparingStroomKwh ?? 0,
        extraStroomverbruikKwh: r.totaalExtraStroomverbruikKwh ?? 0,
      });
      const sprong = bepaalLabelSprong(huidig.label, nieuw.label);
      return { huidig, nieuw, sprong };
    }
    return { huidig };
  }, [draft, cached]);

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
                gasprijsPerM3: draft.context.energie?.gasprijsPerM3,
                stroomprijsKaalPerKwh: draft.context.energie?.stroomprijsKaalPerKwh,
                aantalDouchekoppen: draft.context.gebouw?.aantalDouchekoppen,
                douchesPerWeek: (() => {
                  const s = draft.trainingsSchema ?? [];
                  if (s.length === 0) return undefined;
                  let total = 0;
                  for (const m of s) {
                    const o13 = m.aantalTeamsOnder13 * 10;
                    const v13 = m.aantalTeamsVanaf13 * 15;
                    total += (o13 + v13) * 0.6;  // 60% van spelers doucht
                  }
                  return Math.round(total);
                })(),
                gasDouchePerJaar: (() => {
                  const s = draft.trainingsSchema ?? [];
                  if (s.length === 0) return undefined;
                  let total = 0;
                  for (const m of s) {
                    const o13 = m.aantalTeamsOnder13 * 10;
                    const v13 = m.aantalTeamsVanaf13 * 15;
                    total += (o13 + v13) * 0.6;
                  }
                  return Math.round(total * 42 * 0.5);
                })(),
              }}
              huidigeSituatie={draft.huidigeSituatie ?? {}}
              gekozenIds={gekozenIds}
              onToggle={(id, defaults) => updateDraft(s => {
                const next = { ...s.gekozenMaatregelen };
                if (id in next) delete next[id];
                else {
                  next[id] = defaults;
                  // Bij selectie direct de modal openen
                  setTimeout(() => setOpenDetailId(id), 100);
                }
                return { ...s, gekozenMaatregelen: next };
              })}
              onOpenDetail={setOpenDetailId}
            />
          </Sectie>
        )}

        {/* Modal voor het bewerken van één maatregel — voorkomt scroll/timing issues
            van een inline collapsible. Werkt altijd consistent: klik aanpassen → modal opent,
            edits opslaan automatisch, klik buiten modal of op X om te sluiten. */}
      </div>

      {/* MODAL: maatregel-detail bewerken */}
      {openDetailId && modulesQuery.data && draft.gekozenMaatregelen[openDetailId] !== undefined && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpenDetailId(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between z-10">
              <h2 className="text-base font-semibold text-primary-900">
                ✏️ {modulesQuery.data.modules.find(m => m.id === openDetailId)?.naam ?? openDetailId}
              </h2>
              <button
                onClick={() => setOpenDetailId(null)}
                className="text-gray-500 hover:text-gray-900 p-1 rounded hover:bg-gray-100"
                aria-label="Sluiten"
              >
                ✕
              </button>
            </div>
            <div className="p-5">
              <MaatregelDetail
                startOpen={true}
                maatregelId={openDetailId}
                maatregelNaam={modulesQuery.data.modules.find(m => m.id === openDetailId)?.naam ?? openDetailId}
                input={(draft.gekozenMaatregelen[openDetailId] as Record<string, unknown>) ?? {}}
                bouwjaar={draft.context.gebouw?.bouwjaar}
                context={adviesContext}
                onChange={(input) => updateDraft(s => ({ ...s, gekozenMaatregelen: { ...s.gekozenMaatregelen, [openDetailId]: input } }))}
                onRemove={() => {
                  updateDraft(s => {
                    const next = { ...s.gekozenMaatregelen };
                    delete next[openDetailId];
                    return { ...s, gekozenMaatregelen: next };
                  });
                  setOpenDetailId(null);
                }}
              />
            </div>
            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-5 py-3 flex justify-end gap-2">
              <button
                onClick={() => setOpenDetailId(null)}
                className="btn-accent"
              >
                Klaar
              </button>
            </div>
          </div>
        </div>
      )}

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

        {/* Energielabel + Paris Proof */}
        {energielabelData && (
          <EnergielabelKaart
            huidig={energielabelData.huidig}
            nieuw={energielabelData.nieuw}
            sprong={energielabelData.sprong}
          />
        )}

        {/* Grafieken */}
        {waterPerUurData.length > 0 && (
          <ChartCard
            titel="Waterverbruik per uur (gemiddelde week)"
            ondertitel="Berekend uit het trainingsschema in stap 1"
            hoogte={220}
            toelichting={
              <>
                <strong>Hoe is dit berekend?</strong> Voor elk trainings-/wedstrijdmoment uit het schema rekenen we met
                35 liter warm water per persoon-met-douche, gespreid over de duur van het moment.
                Vul het trainingsschema in stap 1 nauwkeuriger in voor een specifieker beeld.
              </>
            }
          >
            <WaterverbruikPerUurChart data={waterPerUurData} />
          </ChartCard>
        )}

        {waterData.length > 0 && (
          <ChartCard
            titel="Waterverbruik per dag"
            ondertitel="Op basis van trainingsschema (of douches-analyse)"
            hoogte={240}
            toelichting="Gestapelde balken: kindertijd vs. volwassenen-tijd. 35 L warm water per persoon-met-douche."
          >
            <WaterverbruikChart data={waterData} />
          </ChartCard>
        )}

        {kasstroomData.length > 0 && (
          <ChartCard
            titel="Cumulatief netto rendement"
            ondertitel="Over 15 jaar, na aftrek netto investering"
            hoogte={240}
            toelichting="Cumulatieve som van jaarlijkse besparingen, minus de netto-investering in jaar 0. Conservatief gerekend zonder energieprijs-stijging."
          >
            <KasstroomChart data={kasstroomData} />
          </ChartCard>
        )}

        {energiebalansData.length > 0 && (
          <ChartCard
            titel="Verdeling huidig gasverbruik"
            ondertitel={draft.trainingsSchema && draft.trainingsSchema.length > 0
              ? 'Berekend uit trainingsschema'
              : 'Heuristische verdeling (vul trainingsschema in voor specifieker beeld)'}
            hoogte={260}
            toelichting={
              <>
                <strong>Hoe is dit berekend?</strong> {draft.trainingsSchema && draft.trainingsSchema.length > 0
                  ? <>Op basis van het ingevulde trainingsschema: aantal douche-beurten × ~2 m³ gas per beurt voor tapwater,
                     trainings-/wedstrijduren × ruimteverwarming-vraag, rest is kantine/overig.</>
                  : <>Standaardprofiel sportclub: 55% ruimteverwarming, 35% tapwater (douches), 10% keuken/overig.
                     Vul het trainingsschema in stap 1 in voor een specifieker beeld op basis van jullie eigen gebruik.</>}
              </>
            }
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

const DAGEN_VOLGORDE = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'] as const;

/**
 * Waterverbruik per dag — gebruikt nu sport-config voor personen-per-eenheid en
 * douche-%, in plaats van hardcoded voetbal-aannames.
 */
function bouwWaterverbruikData(draft: ProjectState) {
  const schema = draft.trainingsSchema;
  if (!schema || schema.length === 0) return [];
  const typeVereniging = draft.context.club?.type;
  const config = getSportConfig(typeVereniging);

  const perDag: Record<string, { jeugdL: number; senL: number }> = {};
  for (const m of schema) {
    if (!perDag[m.dag]) perDag[m.dag] = { jeugdL: 0, senL: 0 };
    const douchesG1 = (m.aantalTeamsOnder13 ?? 0) * config.personenPerEenheid1
      * douchePercentage('onder13', m.type, m.dag, typeVereniging);
    const douchesG2 = (m.aantalTeamsVanaf13 ?? 0) * config.personenPerEenheid2
      * douchePercentage('vanaf13', m.type, m.dag, typeVereniging);
    perDag[m.dag].jeugdL += douchesG1 * LITERS_PER_DOUCHE;
    perDag[m.dag].senL += douchesG2 * LITERS_PER_DOUCHE;
  }
  return DAGEN_VOLGORDE.filter(d => perDag[d]).map(d => ({
    dag: d,
    trainingL: Math.round(perDag[d].jeugdL),
    wedstrijdL: Math.round(perDag[d].senL),
  }));
}

/**
 * Waterverbruik per uur-van-de-dag (0-23).
 *
 * === Model: wave-based douche-verdeling ===
 *
 * Mensen douchen niet allemaal op exact één tijdstip. Ze gaan douchen direct
 * na hun activiteit-blok. Per moment-type een ander patroon:
 *
 *   Training ≤ 2u            → 1 wave aan het einde (klassiek)
 *   Wedstrijd > 2.5u          → meerdere waves (1 per uur — wedstrijden
 *                               eindigen gefaseerd over de hele dag)
 *   Racketsport > 2.5u        → idem — banen rouleren, douches verspreid
 *   Sociaal                   → niemand doucht
 *
 * Per wave: 60% in dat uur, 30% in uur erna (langzame doucher),
 *           10% in uur ervoor (snelle doucher die net klaar is).
 *
 * Concrete voorbeelden:
 *   Voetbal di 19:30-21:00 (training, 1.5u, teamsport)
 *     → 1 wave op 21:00 → 10% in uur 20, 60% in 21, 30% in 22
 *
 *   Voetbal za 09:00-12:30 (wedstrijd, 3.5u, teamsport)
 *     → 4 waves om ~10:00, 11:00, 12:00, 12:30
 *
 *   Tennis 19:00-22:30 (training, 3.5u, racketsport)
 *     → 4 waves om 20:00, 21:00, 22:00, 22:30 — banen rouleren elk uur
 *
 *   Tenniscompetitie za 10:00-17:00 (wedstrijd, 7u, racketsport)
 *     → 7 waves verspreid over 11:00-17:00 — realistische hele competitiedag
 */
function bouwWaterPerUurData(schema?: TrainingsSchema, typeVereniging?: string) {
  if (!schema || schema.length === 0) return [];
  const config = getSportConfig(typeVereniging);
  const perUur: number[] = new Array(24).fill(0);

  for (const m of schema) {
    if (m.type === 'sociaal') continue;

    // Totaal douche-liters voor dit moment
    const douchesG1 = (m.aantalTeamsOnder13 ?? 0) * config.personenPerEenheid1
      * douchePercentage('onder13', m.type, m.dag, typeVereniging);
    const douchesG2 = (m.aantalTeamsVanaf13 ?? 0) * config.personenPerEenheid2
      * douchePercentage('vanaf13', m.type, m.dag, typeVereniging);
    const totaalLiters = (douchesG1 + douchesG2) * LITERS_PER_DOUCHE;
    if (totaalLiters === 0) continue;

    // Parse start/eind als decimaal uur (incl. minuten)
    const [sh, sm] = (m.startTijd ?? '0:00').split(':').map(Number);
    const [eh, em] = (m.eindTijd ?? '0:00').split(':').map(Number);
    const startUur = (sh ?? 0) + (sm ?? 0) / 60;
    const eindUur = (eh ?? 0) + (em ?? 0) / 60;
    const duur = Math.max(0.5, eindUur - startUur);

    // Bepaal wave-tijdstippen (absolute uren waarop een groep klaar is met sporten)
    const waveTijden = bepaalWaveTijden(m.type, duur, startUur, eindUur, config.categorie);
    const litersPerWave = totaalLiters / waveTijden.length;

    for (const waveEinde of waveTijden) {
      verdeelWavePiekOverUren(perUur, waveEinde, litersPerWave);
    }
  }

  return perUur.map((l, u) => ({ uur: `${u}:00`, liters: Math.round(l) }));
}

/**
 * Bepaal op welke ABSOLUTE uren (24-uurs klok) waves eindigen voor één moment.
 *
 * Heuristiek:
 *  - Korte training of korte wedstrijd (≤ 2.5u): 1 wave aan het einde
 *  - Lange wedstrijd: 1 wave per uur (geleidelijke einde-stromen)
 *  - Lange racketsport: idem — banen rouleren elk uur
 *  - Lange "training" niet-racket: 1 wave aan het einde (zeldzaam scenario)
 */
function bepaalWaveTijden(
  type: TrainingMoment['type'],
  duur: number,
  startUur: number,
  eindUur: number,
  categorie: 'teamsport' | 'racketsport' | 'individueel' | 'baansport',
): number[] {
  const isLang = duur >= 2.5;
  const isWedstrijd = type === 'wedstrijd';
  const isRacket = categorie === 'racketsport';

  // Standaard: 1 wave aan het einde
  if (!isLang) {
    return [eindUur];
  }

  // Lange wedstrijd OF lange racket-sessie: verdeel waves over de duur
  if (isWedstrijd || isRacket) {
    const aantalWaves = Math.max(2, Math.ceil(duur)); // ~1 wave per uur
    const interval = duur / aantalWaves;
    return Array.from({ length: aantalWaves }, (_, i) =>
      Math.min(eindUur, startUur + interval * (i + 1))
    );
  }

  // Lange training niet-racket (atletiek-uithoudingstraining, zwemtraining):
  // 2 waves — halverwege en aan het einde (groepen-wissel halverwege)
  if (duur >= 3) {
    return [startUur + duur / 2, eindUur];
  }

  return [eindUur];
}

/**
 * Verdeel het liter-volume van één wave over 3 uren rondom de wave-piek:
 * 10% in uur ervoor, 60% in piek-uur, 30% in uur erna.
 *
 * Overflow voor 23:xx wordt teruggevouwen in uur 23.
 */
function verdeelWavePiekOverUren(perUur: number[], waveEindeUur: number, liters: number) {
  const piekUur = Math.floor(Math.max(0, Math.min(23.99, waveEindeUur)));
  const vorigUur = piekUur - 1;
  const volgendUur = piekUur + 1;

  perUur[piekUur] += liters * 0.6;
  if (vorigUur >= 0) perUur[vorigUur] += liters * 0.1;
  else perUur[piekUur] += liters * 0.1; // overflow naar piek
  if (volgendUur < 24) perUur[volgendUur] += liters * 0.3;
  else perUur[23] += liters * 0.3; // overflow naar uur 23
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
    cumulatief += besparingPerJr;
    data.push({ jaar: j, cumulatief: Math.round(cumulatief) });
  }
  return data;
}

/**
 * Gasverdeling: gebruikt trainingsschema indien beschikbaar voor specifiekere verdeling.
 * Anders heuristisch 55/35/10.
 */
function bouwEnergiebalansData(draft: ProjectState) {
  const gas = draft.context.energie?.gasverbruikM3 ?? 0;
  if (gas <= 0) return [];

  const schema = draft.trainingsSchema;
  if (schema && schema.length > 0) {
    const analyse = analyseSchema(schema, draft.context.club?.type);
    // Tapwater-gas: 2 m³ per 10 doucheboeben (HR-ketel ~80% rend), per week × 52
    const tapwaterM3PerJaar = (analyse.totaalDoucheBeurtenPerWeek * 0.2) * 52;
    // Ruimteverwarming-gas: rest minus 10% overig
    const tapwaterShare = Math.min(0.6, tapwaterM3PerJaar / gas);
    const overigShare = 0.10;
    const verwarmingShare = Math.max(0.1, 1 - tapwaterShare - overigShare);
    return [
      { naam: 'Ruimteverwarming', m3: Math.round(gas * verwarmingShare) },
      { naam: 'Tapwater (douches)', m3: Math.round(gas * tapwaterShare) },
      { naam: 'Keuken / overig', m3: Math.round(gas * overigShare) },
    ];
  }
  // Heuristische verdeling
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
