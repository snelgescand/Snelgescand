/**
 * Project-editor.
 *
 * Volgorde:
 *  1. Project (clubnaam)
 *  2. Locatie (PDOK adres + luchtfoto)
 *  3. Gebouw (BAG-velden, overschrijfbaar)
 *  4. Energieverbruik (zelf invullen — alleen placeholders)
 *  5. Huidige situatie (checklist: doen ze goed / kan beter)
 *  6. Maatregelen kiezen (vinkjes)
 *  7. Details per maatregel (uitklap-panelen)
 *  8. Rechts: luchtfoto + foto's + resultaat
 *
 * Geen voor-ingevulde getallen meer. Alleen placeholders met voorbeelden.
 * BAG-velden krijgen de waarde van PDOK ingevuld, maar zijn overschrijfbaar.
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
import { HuidigeSituatie } from '../components/HuidigeSituatie';
import type { PdokAdres } from '../api/pdok';
import type { ChecklistAntwoorden } from '../data/checklist';

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
  huidigeSituatie?: ChecklistAntwoorden;
  gekozenMaatregelen: Record<string, unknown>;
}

// Leeg startpunt — geen voor-ingevulde getallen meer
const LEGE_STATE: ProjectState = {
  context: { club: { naam: '' }, gebouw: {}, energie: {} },
  locatie: {},
  fotos: [],
  huidigeSituatie: {},
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
  const [pptFout, setPptFout] = useState<string | null>(null);
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
        huidigeSituatie: s.huidigeSituatie ?? {},
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
    mutationFn: async () => {
      // Eerst opslaan om zeker te zijn dat backend de laatste data heeft
      if (draft) await save.mutateAsync(draft);
      return projectsApi.bereken(id!);
    },
    onSuccess: () => {
      setBerekenFout(null);
      qc.invalidateQueries({ queryKey: ['project', id] });
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setBerekenFout(err.message + ((err.details as { message?: string })?.message ? ` — ${(err.details as { message: string }).message}` : ''));
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
  const heeftBerekening = cached?.rollup;

  return (
    <div className="min-h-screen pb-12">
      <AppHeader rechts={
        <>
          <Link to="/kennisbank" className="text-sm text-gray-600 hover:text-primary-700">Kennisbank</Link>
          <Link to="/projecten" className="text-sm text-gray-600 hover:text-primary-700">← Projecten</Link>
        </>
      } />

      <div className="bg-white/80 backdrop-blur border-b border-primary-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-primary-900">{draft.context.club?.naam || 'Nieuw project'}</h1>
            <p className="text-xs text-gray-500">
              {save.isPending ? 'Opslaan…' : save.isSuccess ? '✓ Opgeslagen' : 'Wijzig om op te slaan'}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setBerekenFout(null); bereken.mutate(); }} className="btn-accent" disabled={bereken.isPending}>
              {bereken.isPending ? 'Berekenen…' : 'Bereken'}
            </button>
            <button onClick={() => { setPptFout(null); exportPpt.mutate(); }} className="btn-secondary" disabled={exportPpt.isPending || !heeftBerekening}>
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
                placeholder="Bijvoorbeeld: VV Oranje Boys"
                value={draft.context.club?.naam ?? ''}
                onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, club: { ...s.context.club, naam: e.target.value } } }))}
              />
            </Veld>
          </Sectie>

          <Sectie titel="Locatie">
            <Veld label="Adres opzoeken" tooltip="Typ postcode + huisnummer (bv. '6512AB 23') of straatnaam + plaats. Klik op het juiste adres in de lijst. Bouwjaar en oppervlakte worden dan automatisch opgehaald uit BAG (Basisregistratie Adressen en Gebouwen) van het Kadaster.">
              <AdresZoeker initieel={draft.locatie?.adres ?? ''} onAdresGekozen={adresGekozen} />
            </Veld>
            {draft.locatie?.adres && (
              <p className="text-xs text-primary-700 mt-2">✓ {draft.locatie.adres}</p>
            )}
          </Sectie>

          <Sectie titel="Gebouw">
            <div className="grid grid-cols-2 gap-3">
              <Veld
                label="Bouwjaar"
                tooltip="Automatisch ingevuld uit BAG (Kadaster) na adres-keuze. Overschrijf alleen als je weet dat het BAG-jaar fout is (bv. renovatiejaar i.p.v. oprichtingsjaar)."
              >
                <input
                  type="number"
                  className="input"
                  placeholder="bv. 1985"
                  value={draft.context.gebouw?.bouwjaar ?? ''}
                  onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, gebouw: { ...s.context.gebouw, bouwjaar: e.target.value ? Number(e.target.value) : undefined } } }))}
                />
              </Veld>
              <Veld
                label="BVO (m²)"
                tooltip="Bruto vloeroppervlak. Automatisch ingevuld uit BAG na adres-keuze. Controleer of dit echt het clubhuis is (en niet inclusief opslagschuur)."
              >
                <input
                  type="number"
                  className="input"
                  placeholder="bv. 450"
                  value={draft.context.gebouw?.bvoTotaalM2 ?? ''}
                  onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, gebouw: { ...s.context.gebouw, bvoTotaalM2: e.target.value ? Number(e.target.value) : undefined } } }))}
                />
              </Veld>
            </div>
            <Veld
              label="Plafondhoogte (m)"
              tooltip="Gemiddelde vrije hoogte. Niet uit BAG beschikbaar — meet of schat zelf in. Typisch 2,7-3,5m in clubhuizen. Relevant voor lucht/lucht-warmtepompen die op volume rekenen."
            >
              <input
                type="number"
                step="0.1"
                className="input"
                placeholder="bv. 3,0"
                value={draft.context.gebouw?.plafondhoogteM ?? ''}
                onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, gebouw: { ...s.context.gebouw, plafondhoogteM: e.target.value ? Number(e.target.value) : undefined } } }))}
              />
            </Veld>
          </Sectie>

          <Sectie titel="Energieverbruik" tooltipTekst="Op te vragen via de jaarrekening van de energieleverancier, of via de slimme meter (verbruiksoverzicht laatste 12 maanden). Cijfers van het laatste volledige jaar geven de meest betrouwbare uitkomst.">
            <div className="grid grid-cols-2 gap-3">
              <Veld
                label="Gas (m³/jaar)"
                tooltip="Totaal gasverbruik per jaar. Vind je op de jaarafrekening — meestal hoofdpost. Voor een clubhuis met 200 leden typisch 3.000-8.000 m³."
              >
                <input
                  type="number"
                  className="input"
                  placeholder="bv. 5.000"
                  value={draft.context.energie?.gasverbruikM3 ?? ''}
                  onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, energie: { ...s.context.energie, gasverbruikM3: e.target.value ? Number(e.target.value) : undefined } } }))}
                />
              </Veld>
              <Veld
                label="Stroom (kWh/jaar)"
                tooltip="Totaal stroomverbruik per jaar. Vind je op de jaarafrekening of via slimme meter. Voor een clubhuis met veldverlichting typisch 15.000-40.000 kWh."
              >
                <input
                  type="number"
                  className="input"
                  placeholder="bv. 25.000"
                  value={draft.context.energie?.stroomverbruikTotaalKwh ?? ''}
                  onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, energie: { ...s.context.energie, stroomverbruikTotaalKwh: e.target.value ? Number(e.target.value) : undefined } } }))}
                />
              </Veld>
              <Veld
                label="Gasprijs (€/m³)"
                tooltip="Prijs zoals werkelijk betaald, inclusief BTW en heffingen. Op de jaarafrekening: 'gemiddelde prijs per m³'. In 2025 typisch €1,30-€1,55."
              >
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  placeholder="bv. 1,35"
                  value={draft.context.energie?.gasprijsPerM3 ?? ''}
                  onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, energie: { ...s.context.energie, gasprijsPerM3: e.target.value ? Number(e.target.value) : undefined } } }))}
                />
              </Veld>
              <Veld
                label="Stroomprijs (€/kWh)"
                tooltip="Kale stroomprijs (zonder energiebelasting en netbeheer). Te vinden op je contract of factuur. In 2025 typisch €0,25-€0,35."
              >
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  placeholder="bv. 0,30"
                  value={draft.context.energie?.stroomprijsKaalPerKwh ?? ''}
                  onChange={e => updateDraft(s => ({ ...s, context: { ...s.context, energie: { ...s.context.energie, stroomprijsKaalPerKwh: e.target.value ? Number(e.target.value) : undefined } } }))}
                />
              </Veld>
            </div>
          </Sectie>

          {/* NIEUW: Huidige situatie / nulmeting */}
          <Sectie
            titel="Huidige situatie"
            tooltipTekst="Inventarisatie van wat er al is en wat verbeterd kan worden. Vul dit in tijdens of na de scan. De aandachtspunten verschijnen straks in het rapport, en geven richting voor de keuze van maatregelen."
          >
            <HuidigeSituatie
              antwoorden={draft.huidigeSituatie ?? {}}
              onChange={(antwoorden) => updateDraft(s => ({ ...s, huidigeSituatie: antwoorden }))}
            />
          </Sectie>

          {/* Maatregelen kiezen */}
          <Sectie titel="Voorgestelde maatregelen" tooltipTekst="Vink aan welke maatregelen je wilt meenemen in de businesscase. Per maatregel kun je daarna in het detail-paneel de uitgangswaardes finetunen.">
            <p className="text-xs text-gray-500 mb-3">
              Selectie van maatregelen die je in het verduurzamingsplan opneemt. Tip: gebruik de huidige situatie hierboven als richtsnoer — waar staat "kan beter" matcht meestal een maatregel.
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

          {gekozenIds.length > 0 && (
            <Sectie titel="Details per maatregel" tooltipTekst="Klap een paneel uit om de standaardwaardes voor die maatregel aan te passen.">
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

        {/* ===== RECHTER KOLOM ===== */}
        <div className="space-y-5">

          <Sectie titel="Luchtfoto" tooltipTekst="Bron: Kadaster luchtfoto (25cm resolutie). Bekijk het dak om PV-oppervlak in te schatten, of er al panelen liggen, en hoe de oriëntatie is.">
            <Luchtfoto
              rdX={draft.locatie?.rd_x ?? 0}
              rdY={draft.locatie?.rd_y ?? 0}
              lat={draft.locatie?.lat ?? 0}
              lon={draft.locatie?.lon ?? 0}
              hoogte={280}
            />
          </Sectie>

          <Sectie titel="Foto's" tooltipTekst="Voeg foto's toe van de scan. Maximaal 10 per project. Worden automatisch verkleind voor snelle upload.">
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
                <p className="text-red-800 font-mono text-xs whitespace-pre-wrap">{berekenFout}</p>
                <p className="text-red-700 text-xs mt-2">
                  Tip: controleer of energieverbruik en prijzen zijn ingevuld.
                </p>
              </div>
            )}
            {pptFout && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm mt-2">
                <p className="font-medium text-red-900 mb-1">PowerPoint-export mislukt</p>
                <p className="text-red-800 font-mono text-xs">{pptFout}</p>
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
