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
import { berekenLokaal, BerekenValidatieFout } from '../util/lokaal-bereken';
import { AppHeader } from '../components/AppHeader';
import { Footer } from '../components/Footer';
import { AdresZoeker } from '../components/AdresZoeker';
import { Luchtfoto } from '../components/Luchtfoto';
import { FotoUpload, type ProjectFoto } from '../components/FotoUpload';
import { LogoUpload, type ClubLogo } from '../components/LogoUpload';
import { SaveIndicator } from '../components/SaveIndicator';
import { InfoTooltip } from '../components/InfoTooltip';
import { MaatregelDetail } from '../components/MaatregelDetail';
import { HuidigeSituatie } from '../components/HuidigeSituatie';
import { MaatregelSuggesties } from '../components/MaatregelSuggesties';
import { ChartCard, WaterverbruikChart, KasstroomChart, EnergiebalansChart, WaterverbruikPerUurChart } from '../components/Charts';
import { TrainingsSchemaInvoer, analyseSchema, type TrainingsSchema } from '../components/TrainingsSchema';
import { EnergielabelKaart } from '../components/EnergielabelKaart';
import { HistorischVerbruik } from '../components/HistorischVerbruik';
import { berekenEnergielabel, berekenLabelNaMaatregelen, bepaalLabelSprong } from '../util/energielabel';
import type { PdokAdres } from '../api/pdok';
import { fetch3dBagHoogte, fetchBagPandViaCoordinaten } from '../api/pdok';
import type { HuidigeSituatieData } from '../data/huidige-situatie';

const API_BASE_FOR_BEACON = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

interface Locatie {
  adres?: string; postcode?: string; huisnummer?: number; woonplaats?: string;
  rd_x?: number; rd_y?: number; lat?: number; lon?: number;
}

interface ProjectState {
  context: {
    club?: { naam?: string };
    gebouw?: {
      bouwjaar?: number;
      bvoTotaalM2?: number;
      plafondhoogteM?: number;
      bouwhoogteM?: number;
      // Excel-velden uit Rekenmodel inputsheet
      typeSport?: string;
      aantalVeldenBanen?: number;
      aantalLeden?: number;
      aantalKleedkamers?: number;
      aantalDouchekoppen?: number;
      eigendom?: string;
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
      const spelersV13 = (m.aantalTeamsVanaf13 ?? 0) * 18;  // 18 sp/team
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
    console.log('[BAG] PDOK lookup response:', adres);

    const status: BagStatusType = { foutmeldingen: [], laatstGeprobeerd: adres.weergavenaam };

    const locatie = {
      adres: adres.weergavenaam, postcode: adres.postcode, huisnummer: adres.huisnummer,
      woonplaats: adres.woonplaatsnaam, rd_x: adres.rd_x, rd_y: adres.rd_y,
      lat: adres.lat, lon: adres.lon,
    };
    const gebouwPatch: Record<string, unknown> = {};

    if (adres.bouwjaar && adres.bouwjaar > 1800) {
      gebouwPatch.bouwjaar = adres.bouwjaar;
      status.bouwjaar = { waarde: adres.bouwjaar, bron: 'PDOK' };
    }

    if (adres.oppervlakte && adres.oppervlakte > 0) {
      gebouwPatch.bvoTotaalM2 = adres.oppervlakte;
      status.oppervlakte = { waarde: adres.oppervlakte, bron: 'PDOK' };
    }

    let pandid = adres.pandid;

    // FALLBACK 1: BAG OGC API als PDOK geen bouwjaar/pandid had
    if ((!gebouwPatch.bouwjaar || !pandid) && adres.rd_x && adres.rd_y) {
      console.log('[BAG] PDOK incompleet — probeer BAG OGC API fallback');
      try {
        const pand = await fetchBagPandViaCoordinaten(adres.rd_x, adres.rd_y);
        if (pand) {
          if (!gebouwPatch.bouwjaar && pand.oorspronkelijkBouwjaar) {
            gebouwPatch.bouwjaar = pand.oorspronkelijkBouwjaar;
            status.bouwjaar = { waarde: pand.oorspronkelijkBouwjaar, bron: pand.bron === 'BAG-WFS' ? 'BAG-WFS' : 'BAG-OGC' };
          }
          if (!gebouwPatch.bvoTotaalM2 && pand.oppervlakte) {
            gebouwPatch.bvoTotaalM2 = pand.oppervlakte;
            status.oppervlakte = { waarde: pand.oppervlakte, bron: pand.bron === 'BAG-WFS' ? 'BAG-WFS' : 'BAG-OGC' };
          }
          if (!pandid && pand.identificatie) {
            pandid = pand.identificatie;
            console.log('[BAG] Pandid via OGC API:', pandid);
          }
        } else {
          status.foutmeldingen.push('Geen pand gevonden in BAG OGC API op deze coördinaten');
        }
      } catch (e) {
        console.warn('[BAG OGC] error:', e);
        status.foutmeldingen.push(`BAG OGC error: ${e instanceof Error ? e.message : 'onbekend'}`);
      }
    }

    if (!gebouwPatch.bouwjaar) status.foutmeldingen.push('Bouwjaar ook niet via BAG-OGC gevonden');
    if (!gebouwPatch.bvoTotaalM2) status.foutmeldingen.push('Oppervlakte niet via PDOK of BAG-OGC gevonden');
    if (!pandid) status.foutmeldingen.push('Geen pandid beschikbaar — 3D BAG fallback niet mogelijk');

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

    // 3D BAG voor bouwhoogte (nu we evt. via fallback een pandid hebben)
    let huidigeNext = next;
    if (pandid) {
      try {
        const bag3d = await fetch3dBagHoogte(pandid);
        console.log('[3D BAG] response:', bag3d);
        if (bag3d) {
          const extraGebouw: Record<string, unknown> = {};
          if (bag3d.bouwhoogteM) {
            extraGebouw.bouwhoogteM = bag3d.bouwhoogteM;
            status.bouwhoogte = { waarde: bag3d.bouwhoogteM, bron: 'BAG3D' };
          }
          if (bag3d.geschattePlafondhoogteM && !huidigeNext.context.gebouw?.plafondhoogteM) {
            extraGebouw.plafondhoogteM = bag3d.geschattePlafondhoogteM;
            status.plafondhoogte = { waarde: bag3d.geschattePlafondhoogteM, bron: 'BAG3D-schatting' };
          }
          if (!gebouwPatch.bvoTotaalM2 && bag3d.geschatteOppervlakteM2 && bag3d.geschatteOppervlakteM2 > 10) {
            extraGebouw.bvoTotaalM2 = bag3d.geschatteOppervlakteM2;
            status.oppervlakte = { waarde: bag3d.geschatteOppervlakteM2, bron: 'BAG3D-schatting' };
          }

          if (Object.keys(extraGebouw).length > 0) {
            const nextMetExtra: ProjectState = {
              ...huidigeNext,
              context: { ...huidigeNext.context, gebouw: { ...huidigeNext.context.gebouw, ...extraGebouw } },
            };
            setDraft(nextMetExtra);
            huidigeNext = nextMetExtra;
            try {
              await projectsApi.saveLocatie(id!, locatie, { ...gebouwPatch, ...extraGebouw });
            } catch (err) {
              console.error('[3D BAG save] mislukt', err);
            }
            save.mutate(nextMetExtra);
          }
        }
      } catch (err) {
        console.warn('[3D BAG fetch] mislukt', err);
        status.foutmeldingen.push(`3D BAG: ${err instanceof Error ? err.message : 'onbekend'}`);
      }
    }

    setBagStatus(status);
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
              title={!cached ? 'Eerst berekenen' : 'Download PowerPoint'}
            >
              {exportPpt.isPending ? 'Exporteren…' : '↓ PowerPoint'}
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
}

function Stap1Invoer({ draft, updateDraft, adresGekozen, bagStatus, onNaarStap2, energieCompleet }: Stap1Props) {
  // Wordt 3D BAG-data getoond?
  const bouwhoogte = draft.context.gebouw?.bouwhoogteM;
  const trainAnalyse = (draft.trainingsSchema && draft.trainingsSchema.length > 0)
    ? analyseSchema(draft.trainingsSchema) : null;

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
            <Veld label="Aantal douchekoppen" tooltip="Belangrijk voor boiler-dimensionering (warmtepompboiler, e-boiler).">
              <input type="number" className="input" placeholder="bv. 24"
                value={draft.context.gebouw?.aantalDouchekoppen ?? ''}
                onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, gebouw: { ...s.context.gebouw, aantalDouchekoppen: e.target.value ? Number(e.target.value) : undefined } } }))} />
            </Veld>
            <Veld label="Eigendom" tooltip="DUMAVA-subsidie vereist eigen accommodatie. Bij huur: ga via de gemeente.">
              <select
                className="input"
                value={(draft.context.gebouw?.eigendom as string) ?? ''}
                onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, gebouw: { ...s.context.gebouw, eigendom: e.target.value || undefined } } }))}
              >
                <option value="">— kies —</option>
                <option value="eigen">Eigen accommodatie</option>
                <option value="huur-gemeente">Huur van gemeente</option>
                <option value="huur-overig">Huur overig</option>
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

  // Welk maatregel-detail-paneel is uitgeklapt? (één tegelijk voor focus)
  const [openDetailId, setOpenDetailId] = useState<string | null>(null);

  // Counter zodat ELKE klik op "✏️ Aanpassen" een unieke re-render triggert,
  // zelfs als hetzelfde paneel al openstond. Anders zou React de useEffect
  // niet opnieuw runnen bij een tweede klik op dezelfde knop.
  const [openTrigger, setOpenTrigger] = useState(0);

  // Bij klik op "✏️ Aanpassen": open het detail-paneel én scroll ernaartoe.
  // Lange timeout zodat React tijd heeft om eerst het paneel uit te klappen
  // VOORDAT we scrollen — anders scrollt hij naar de dichte versie en daarna
  // duwt het uitklappen alles weer omlaag.
  const openDetail = (id: string) => {
    setOpenDetailId(id);
    setOpenTrigger(t => t + 1);
    // Twee animatieframes wachten + 250ms zodat de DOM zeker geüpdatet is
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          const el = document.getElementById(`detail-${id}`);
          if (el) {
            console.log('[InlineEdit] Scrolling to', `detail-${id}`);
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } else {
            console.warn('[InlineEdit] Element niet gevonden:', `detail-${id}`);
          }
        }, 250);
      });
    });
  };

  // Bouw waterverbruik-grafiekdata uit trainingsschema (of detail-input als fallback)
  const waterData = useMemo(() => bouwWaterverbruikData(draft), [draft]);
  const waterPerUurData = useMemo(() => bouwWaterPerUurData(draft.trainingsSchema), [draft.trainingsSchema]);
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
              }}
              huidigeSituatie={draft.huidigeSituatie ?? {}}
              gekozenIds={gekozenIds}
              onToggle={(id, defaults) => updateDraft(s => {
                const next = { ...s.gekozenMaatregelen };
                if (id in next) delete next[id];
                else {
                  next[id] = defaults;
                  // bij selectie direct het detail-paneel openen
                  setTimeout(() => openDetail(id), 100);
                }
                return { ...s, gekozenMaatregelen: next };
              })}
              onOpenDetail={openDetail}
            />
          </Sectie>
        )}

        {/* Details per gekozen maatregel */}
        {gekozenIds.length > 0 && modulesQuery.data && (
          <Sectie titel="Details per gekozen maatregel" tooltipTekst="Pas hier de aannames per maatregel aan.">
            <div className="space-y-2">
              {gekozenIds.map(modId => {
                const mod = modulesQuery.data?.modules.find(m => m.id === modId);
                return (
                  <div id={`detail-${modId}`} key={modId}>
                    <MaatregelDetail
                      // openTrigger als deel van een 'open-id' prop: elke klik
                      // zorgt voor een nieuwe identifier ook bij dezelfde maatregel
                      openSignal={openDetailId === modId ? `${modId}-${openTrigger}` : ''}
                      maatregelId={modId}
                      maatregelNaam={mod?.naam ?? modId}
                      input={draft.gekozenMaatregelen[modId] as Record<string, unknown> ?? {}}
                      bouwjaar={draft.context.gebouw?.bouwjaar}
                      onChange={(input) => updateDraft(s => ({ ...s, gekozenMaatregelen: { ...s.gekozenMaatregelen, [modId]: input } }))}
                      onRemove={() => updateDraft(s => {
                        const next = { ...s.gekozenMaatregelen };
                        delete next[modId];
                        return { ...s, gekozenMaatregelen: next };
                      })}
                    />
                  </div>
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
          >
            <WaterverbruikPerUurChart data={waterPerUurData} />
            <p className="text-xs text-gray-500 mt-2 leading-snug">
              <strong>Hoe is dit berekend?</strong> Voor elk trainings-/wedstrijdmoment uit het schema rekenen we met
              35 liter warm water per persoon-met-douche, gespreid over de duur van het moment.
              Vul het trainingsschema in stap 1 nauwkeuriger in voor een specifieker beeld.
            </p>
          </ChartCard>
        )}

        {waterData.length > 0 && (
          <ChartCard
            titel="Waterverbruik per dag"
            ondertitel="Op basis van trainingsschema (of douches-analyse)"
            hoogte={240}
          >
            <WaterverbruikChart data={waterData} />
            <p className="text-xs text-gray-500 mt-2 leading-snug">
              Gestapelde balken: kindertijd vs. volwassenen-tijd. 35 L warm water per persoon-met-douche.
            </p>
          </ChartCard>
        )}

        {kasstroomData.length > 0 && (
          <ChartCard
            titel="Cumulatief netto rendement"
            ondertitel="Over 15 jaar, na aftrek netto investering"
            hoogte={240}
          >
            <KasstroomChart data={kasstroomData} />
            <p className="text-xs text-gray-500 mt-2 leading-snug">
              Cumulatieve som van jaarlijkse besparingen, minus de netto-investering in jaar 0.
              Conservatief gerekend zonder energieprijs-stijging.
            </p>
          </ChartCard>
        )}

        {energiebalansData.length > 0 && (
          <ChartCard
            titel="Verdeling huidig gasverbruik"
            ondertitel={draft.trainingsSchema && draft.trainingsSchema.length > 0
              ? 'Berekend uit trainingsschema'
              : 'Heuristische verdeling (vul trainingsschema in voor specifieker beeld)'}
            hoogte={260}
          >
            <EnergiebalansChart data={energiebalansData} />
            <p className="text-xs text-gray-500 mt-2 leading-snug">
              <strong>Hoe is dit berekend?</strong> {draft.trainingsSchema && draft.trainingsSchema.length > 0
                ? <>Op basis van het ingevulde trainingsschema: aantal douche-beurten × ~2 m³ gas per beurt voor tapwater,
                   trainings-/wedstrijduren × ruimteverwarming-vraag, rest is kantine/overig.</>
                : <>Standaardprofiel sportclub: 55% ruimteverwarming, 35% tapwater (douches), 10% keuken/overig.
                   Vul het trainingsschema in stap 1 in voor een specifieker beeld op basis van jullie eigen gebruik.</>}
            </p>
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
const LITERS_PER_DOUCHE = 35;
const SPELERS_PER_TEAM = { onder13: 10, vanaf13: 18 };

// Douche-percentage o.b.v. leeftijd, type activiteit en dag (uit Excel Rekenmodel)
function douchePct(leeftijd: 'onder13' | 'vanaf13', type: string, _dag: string): number {
  if (type === 'sociaal') return 0;
  const isWedstrijd = type === 'wedstrijd';
  if (leeftijd === 'onder13') return isWedstrijd ? 0.50 : 0.25;
  return isWedstrijd ? 1.00 : 0.95;
}

function bouwWaterverbruikData(draft: ProjectState) {
  const schema = draft.trainingsSchema;
  if (schema && schema.length > 0) {
    const perDag: Record<string, { jeugdL: number; senL: number }> = {};
    for (const m of schema) {
      if (!perDag[m.dag]) perDag[m.dag] = { jeugdL: 0, senL: 0 };
      const spelersO13 = (m.aantalTeamsOnder13 ?? 0) * SPELERS_PER_TEAM.onder13;
      const spelersV13 = (m.aantalTeamsVanaf13 ?? 0) * SPELERS_PER_TEAM.vanaf13;
      perDag[m.dag].jeugdL += spelersO13 * douchePct('onder13', m.type, m.dag) * LITERS_PER_DOUCHE;
      perDag[m.dag].senL += spelersV13 * douchePct('vanaf13', m.type, m.dag) * LITERS_PER_DOUCHE;
    }
    return DAGEN_VOLGORDE.filter(d => perDag[d]).map(d => ({
      dag: d,
      trainingL: Math.round(perDag[d].jeugdL),
      wedstrijdL: Math.round(perDag[d].senL),
    }));
  }
  return [];
}

/** Waterverbruik per uur-van-de-dag (0–23), met leeftijdsspecifiek douche-percentage */
function bouwWaterPerUurData(schema?: TrainingsSchema) {
  if (!schema || schema.length === 0) return [];
  const perUur: number[] = new Array(24).fill(0);
  for (const m of schema) {
    const spelersO13 = (m.aantalTeamsOnder13 ?? 0) * SPELERS_PER_TEAM.onder13 * douchePct('onder13', m.type, m.dag);
    const spelersV13 = (m.aantalTeamsVanaf13 ?? 0) * SPELERS_PER_TEAM.vanaf13 * douchePct('vanaf13', m.type, m.dag);
    const liters = (spelersO13 + spelersV13) * LITERS_PER_DOUCHE;
    const startU = parseInt(m.startTijd.split(':')[0] ?? '0', 10);
    const eindU = parseInt(m.eindTijd.split(':')[0] ?? '0', 10);
    const laatste = Math.max(startU, eindU - 1);
    const eenNaLaatst = Math.max(startU, eindU - 2);
    perUur[laatste] += liters * 0.7;
    if (eenNaLaatst !== laatste) perUur[eenNaLaatst] += liters * 0.3;
  }
  return perUur.map((l, u) => ({ uur: `${u}:00`, liters: Math.round(l) }));
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
    const analyse = analyseSchema(schema);
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
