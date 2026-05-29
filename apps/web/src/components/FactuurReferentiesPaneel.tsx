/**
 * FactuurReferentiesPaneel — interne kennisbank van referentie-bedragen.
 *
 * Tekst-only opslag (geen PDF-uploads, geen leverancier-NDA's): alleen de
 * essentie zoals bedragen, leveranciers en jaartal, zodat adviseurs een
 * snel idee hebben van wat oplossingen ongeveer kosten.
 *
 * Iedereen ingelogd binnen de tenant kan referenties zien. Alleen
 * BEHEERDERS kunnen toevoegen/bewerken/verwijderen.
 */

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { factuurApi, authApi, type FactuurReferentie, type NieuweFactuurReferentie } from '../api/client';

const fmtEur = (n: number) => `€ ${n.toLocaleString('nl-NL')}`;

/** Mooie labels voor de categorie-codes uit de API */
const CATEGORIE_LABELS: Record<string, string> = {
  'qton': '⚡ Q-ton CO₂-warmtepomp',
  'lmnt': '🌡️ LMNT modulaire WP',
  'lucht-water-wp': '💨 Lucht/water-WP',
  'warmtepompboiler': '🛢️ Warmtepompboiler',
  'pv-zonnepanelen': '☀️ PV / Zonnepanelen',
  'pvt': '☀️ PVT-collectoren',
  'batterij': '🔋 Batterij / opslag',
  'isolatie-dak': '🏠 Isolatie dak',
  'isolatie-gevel': '🏠 Isolatie gevel',
  'isolatie-vloer': '🏠 Isolatie vloer',
  'beglazing': '🪟 HR++-beglazing',
  'kierdichting': '🌬️ Kierdichting',
  'veldverlichting': '💡 LED-veldverlichting',
  'binnenverlichting': '💡 LED-binnenverlichting',
  'ventilatie': '🌀 Ventilatie',
  'wtw': '♻️ WTW-douche',
  'overig': '📋 Overig',
};

const labelVoor = (cat: string) => CATEGORIE_LABELS[cat] ?? cat;

export function FactuurReferentiesPaneel() {
  const queryClient = useQueryClient();
  const meQuery = useQuery({
    queryKey: ['auth-me'],
    queryFn: authApi.me,
    staleTime: 5 * 60 * 1000,
  });
  const isBeheerder = meQuery.data?.gebruiker.rol === 'BEHEERDER';

  const listQuery = useQuery({
    queryKey: ['factuur-referenties'],
    queryFn: factuurApi.list,
  });

  const createMutation = useMutation({
    mutationFn: (data: NieuweFactuurReferentie) => factuurApi.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['factuur-referenties'] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: NieuweFactuurReferentie }) => factuurApi.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['factuur-referenties'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => factuurApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['factuur-referenties'] }),
  });

  const [filterCat, setFilterCat] = useState<string>('alle');
  const [filterZoek, setFilterZoek] = useState<string>('');
  const [filterLeverancier, setFilterLeverancier] = useState<string>('alle');
  const [filterJaar, setFilterJaar] = useState<string>('alle');
  /** Per-rij of de toelichting uitgeklapt is. */
  const [uitgeklapt, setUitgeklapt] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [bewerktItem, setBewerktItem] = useState<FactuurReferentie | null>(null);

  const referenties = listQuery.data?.referenties ?? [];
  const categorieen = listQuery.data?.categorieen ?? [];

  // Categorieën waar daadwerkelijk items in zitten — voor filter
  const aanwezigeCategorieen = useMemo(() => {
    const set = new Set(referenties.map(r => r.categorie));
    return Array.from(set).sort();
  }, [referenties]);

  // Unieke leveranciers (alfabetisch) en jaren (recent eerst) — gegenereerd uit de data
  // zelf zodat de dropdowns alleen tonen wat daadwerkelijk in de kennisbank staat.
  const aanwezigeLeveranciers = useMemo(() => {
    const set = new Set(referenties.map(r => r.leverancier).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'nl', { sensitivity: 'base' }));
  }, [referenties]);

  const aanwezigeJaren = useMemo(() => {
    const set = new Set(referenties.map(r => r.jaar));
    return Array.from(set).sort((a, b) => b - a);
  }, [referenties]);

  const gefilterd = useMemo(() => {
    const zoekTerm = filterZoek.trim().toLowerCase();
    return referenties.filter(r => {
      if (filterCat !== 'alle' && r.categorie !== filterCat) return false;
      if (filterLeverancier !== 'alle' && r.leverancier !== filterLeverancier) return false;
      if (filterJaar !== 'alle' && String(r.jaar) !== filterJaar) return false;
      if (zoekTerm) {
        const hooi = [
          labelVoor(r.categorie),
          r.leverancier,
          r.toelichting ?? '',
          String(r.jaar),
        ].join(' ').toLowerCase();
        if (!hooi.includes(zoekTerm)) return false;
      }
      return true;
    });
  }, [referenties, filterCat, filterLeverancier, filterJaar, filterZoek]);

  function toggleUitklap(id: string) {
    setUitgeklapt(prev => {
      const nieuw = new Set(prev);
      if (nieuw.has(id)) nieuw.delete(id); else nieuw.add(id);
      return nieuw;
    });
  }

  function openNieuwModal() {
    setBewerktItem(null);
    setModalOpen(true);
  }

  function openBewerkenModal(item: FactuurReferentie) {
    setBewerktItem(item);
    setModalOpen(true);
  }

  function bevestigVerwijderen(item: FactuurReferentie) {
    if (window.confirm(`Verwijder referentie "${labelVoor(item.categorie)} — ${item.leverancier} (${item.jaar})"?`)) {
      deleteMutation.mutate(item.id);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header met intro */}
      <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-primary-900 mb-1">📋 Referentie-bedragen kennisbank</h2>
        <p className="text-sm text-gray-700">
          Snelle raadpleging van eerdere offerte- en factuur-bedragen voor verschillende oplossingen.
          Alleen tekst (geen PDF's) en zichtbaar voor team-Sportief na inloggen.
          {!isBeheerder && (
            <span className="text-gray-500 italic">
              {' '}Toevoegen/bewerken kan alleen door beheerders.
            </span>
          )}
        </p>
      </div>

      {/* === Filterbalk: tekst-zoek + categorie + leverancier + jaar === */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
        <div className="flex items-end gap-2 flex-wrap">
          {/* Zoekveld — breed, vult resterende ruimte */}
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">🔎 Zoek</label>
            <input
              type="text"
              value={filterZoek}
              onChange={e => setFilterZoek(e.target.value)}
              placeholder="zoek in leverancier, categorie of toelichting…"
              className="input py-1.5 text-sm w-full"
            />
          </div>
          <div className="w-44">
            <label className="block text-xs font-medium text-gray-600 mb-1">Categorie</label>
            <select
              value={filterCat}
              onChange={e => setFilterCat(e.target.value)}
              className="input py-1.5 text-sm w-full"
            >
              <option value="alle">Alle ({referenties.length})</option>
              {aanwezigeCategorieen.map(c => (
                <option key={c} value={c}>
                  {labelVoor(c)} ({referenties.filter(r => r.categorie === c).length})
                </option>
              ))}
            </select>
          </div>
          <div className="w-44">
            <label className="block text-xs font-medium text-gray-600 mb-1">Leverancier</label>
            <select
              value={filterLeverancier}
              onChange={e => setFilterLeverancier(e.target.value)}
              className="input py-1.5 text-sm w-full"
            >
              <option value="alle">Alle</option>
              {aanwezigeLeveranciers.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <div className="w-28">
            <label className="block text-xs font-medium text-gray-600 mb-1">Jaar</label>
            <select
              value={filterJaar}
              onChange={e => setFilterJaar(e.target.value)}
              className="input py-1.5 text-sm w-full"
            >
              <option value="alle">Alle</option>
              {aanwezigeJaren.map(j => (
                <option key={j} value={j}>{j}</option>
              ))}
            </select>
          </div>
          {isBeheerder && (
            <button
              type="button"
              onClick={openNieuwModal}
              className="bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium px-3 py-1.5 rounded shadow-sm whitespace-nowrap"
            >
              + Nieuwe referentie
            </button>
          )}
        </div>
        {/* Resultaat-teller + reset-knop wanneer een filter actief is */}
        {(filterZoek || filterCat !== 'alle' || filterLeverancier !== 'alle' || filterJaar !== 'alle') && (
          <div className="flex items-center justify-between text-xs text-gray-500 pt-1 border-t border-gray-100">
            <span>{gefilterd.length} van {referenties.length} referenties</span>
            <button
              type="button"
              onClick={() => { setFilterZoek(''); setFilterCat('alle'); setFilterLeverancier('alle'); setFilterJaar('alle'); }}
              className="text-primary-700 hover:underline"
            >
              ✕ filters wissen
            </button>
          </div>
        )}
      </div>

      {/* Lijst */}
      {listQuery.isLoading ? (
        <p className="text-sm text-gray-500">Laden…</p>
      ) : gefilterd.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm">
          {referenties.length === 0
            ? <>Nog geen referenties toegevoegd. {isBeheerder && 'Klik op "Nieuwe referentie" om de eerste toe te voegen.'}</>
            : <>Geen referenties in deze categorie.</>}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600 uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2">Categorie</th>
                <th className="text-left px-3 py-2">Leverancier</th>
                <th className="text-right px-3 py-2">Jaar</th>
                <th className="text-right px-3 py-2">Bedrag</th>
                <th className="text-left px-3 py-2">Toelichting</th>
                {isBeheerder && <th className="text-right px-3 py-2 w-20">Acties</th>}
              </tr>
            </thead>
            <tbody>
              {gefilterd.map(r => {
                const isOpen = uitgeklapt.has(r.id);
                const toel = r.toelichting ?? '';
                const TRUNC = 60;
                const isLang = toel.length > TRUNC;
                return (
                <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50 align-top">
                  <td className="px-3 py-2 whitespace-nowrap">{labelVoor(r.categorie)}</td>
                  <td className="px-3 py-2">{r.leverancier}</td>
                  <td className="px-3 py-2 text-right">{r.jaar}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmtEur(r.bedrag)}</td>
                  <td className="px-3 py-2 text-gray-600 text-xs max-w-md">
                    {!toel ? (
                      <span className="text-gray-300">—</span>
                    ) : isLang ? (
                      <div className="flex items-start gap-1">
                        <span className={isOpen ? 'whitespace-pre-wrap' : 'truncate inline-block max-w-full'}>
                          {isOpen ? toel : `${toel.slice(0, TRUNC).trimEnd()}…`}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleUitklap(r.id)}
                          className="text-primary-700 hover:text-primary-900 shrink-0 font-medium"
                          title={isOpen ? 'Klap toelichting in' : 'Klap toelichting uit'}
                          aria-expanded={isOpen}
                        >
                          {isOpen ? '▴ minder' : '▾ meer'}
                        </button>
                      </div>
                    ) : (
                      <span>{toel}</span>
                    )}
                  </td>
                  {isBeheerder && (
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openBewerkenModal(r)}
                        className="text-primary-700 hover:underline text-xs px-1"
                        title="Bewerken"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        onClick={() => bevestigVerwijderen(r)}
                        className="text-red-600 hover:underline text-xs px-1"
                        title="Verwijderen"
                      >
                        🗑️
                      </button>
                    </td>
                  )}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <ReferentieModal
          initial={bewerktItem}
          categorieen={categorieen}
          onSluit={() => setModalOpen(false)}
          onOpslaan={async (data) => {
            // Throwing wordt afgehandeld in modal zelf — wij hoeven hier
            // alleen de modal te sluiten BIJ SUCCES.
            if (bewerktItem) {
              await updateMutation.mutateAsync({ id: bewerktItem.id, data });
            } else {
              await createMutation.mutateAsync(data);
            }
            setModalOpen(false);
          }}
          bezig={createMutation.isPending || updateMutation.isPending}
        />
      )}
    </div>
  );
}

/* ============================================================
 * Modal voor toevoegen/bewerken
 * ============================================================ */
function ReferentieModal({
  initial, categorieen, onSluit, onOpslaan, bezig,
}: {
  initial: FactuurReferentie | null;
  categorieen: readonly string[];
  onSluit: () => void;
  onOpslaan: (data: NieuweFactuurReferentie) => Promise<void>;
  bezig: boolean;
}) {
  // Categorie-default: gebruik bewerkte waarde, anders eerste uit lijst,
  // anders 'overig' als ultieme fallback. Nooit leeg laten (server vereist min(1)).
  const [categorie, setCategorie] = useState(initial?.categorie ?? categorieen[0] ?? 'overig');
  const [leverancier, setLeverancier] = useState(initial?.leverancier ?? '');
  const [jaar, setJaar] = useState<number>(initial?.jaar ?? new Date().getFullYear());
  const [bedrag, setBedrag] = useState<number>(initial?.bedrag ?? 0);
  const [toelichting, setToelichting] = useState(initial?.toelichting ?? '');
  /** Foutmelding van de API (404, 403, 500, validatie-fout, ...) */
  const [fout, setFout] = useState<{ status?: number; message: string; details?: unknown } | null>(null);

  const canSave = leverancier.trim().length > 0 && jaar >= 2000 && bedrag > 0 && categorie.length > 0;

  async function submit() {
    if (!canSave || bezig) return;
    setFout(null);
    try {
      await onOpslaan({
        categorie,
        leverancier: leverancier.trim(),
        jaar: Math.round(jaar),         // zod verwacht .int() — defensief
        bedrag: Math.round(bedrag),     // ook hier — geen decimalen
        toelichting: toelichting.trim() || null,
      });
    } catch (err) {
      // Vang alle fouten en toon ze in de modal i.p.v. ze te laten verdwijnen.
      // Helpt enorm bij diagnose: server-validatie, DB-tabel ontbreekt, 403, etc.
      if (err && typeof err === 'object' && 'status' in err && 'message' in err) {
        setFout({
          status: (err as { status: number }).status,
          message: (err as { message: string }).message,
          details: (err as { details?: unknown }).details,
        });
      } else {
        setFout({ message: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onSluit}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-md w-full"
        onClick={e => e.stopPropagation()}
      >
        <div className="border-b border-gray-200 px-5 py-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-primary-900">
            {initial ? '✏️ Referentie bewerken' : '+ Nieuwe referentie'}
          </h3>
          <button onClick={onSluit} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Categorie</label>
            <select value={categorie} onChange={e => setCategorie(e.target.value)} className="input py-1.5 text-sm">
              {categorieen.map(c => (
                <option key={c} value={c}>{labelVoor(c)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Leverancier</label>
            <input
              type="text"
              placeholder='bv. "Mitsubishi via Installateur Y"'
              className="input py-1.5 text-sm"
              value={leverancier}
              onChange={e => setLeverancier(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Jaar</label>
              <input
                type="number"
                min={2000}
                max={2100}
                className="input py-1.5 text-sm"
                value={jaar}
                onChange={e => setJaar(Number(e.target.value) || new Date().getFullYear())}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Bedrag (incl. btw)</label>
              <input
                type="number"
                min={0}
                placeholder="0"
                className="input py-1.5 text-sm"
                value={bedrag || ''}
                onChange={e => setBedrag(Number(e.target.value) || 0)}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Toelichting (optioneel)</label>
            <textarea
              rows={3}
              placeholder='bv. "30 kW HMA30A incl. 1000L buffer, voetbalclub 250 leden, locatie NH"'
              className="input py-1.5 text-sm font-normal"
              value={toelichting}
              onChange={e => setToelichting(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">
              Maximaal 1000 tekens. Beschrijf vermogen, capaciteit, club-type — alle context die helpt om het bedrag te interpreteren.
            </p>
          </div>
        </div>

        {/* === Foutmelding (als de API faalt) === */}
        {fout && (
          <div className="border-t border-red-200 bg-red-50 px-5 py-3 text-sm">
            <p className="font-medium text-red-900">
              ⚠ Opslaan mislukt{fout.status ? ` (HTTP ${fout.status})` : ''}
            </p>
            <p className="text-red-800 mt-1">{fout.message}</p>
            {fout.status === 403 && (
              <p className="text-xs text-red-700 mt-2">
                <strong>Reden</strong>: alleen accounts met rol BEHEERDER kunnen referenties toevoegen.
                Vraag jouw beheerder om je rol te wijzigen via "Team-leden" beheer.
              </p>
            )}
            {fout.status === 500 && (
              <p className="text-xs text-red-700 mt-2">
                <strong>Mogelijke oorzaak</strong>: de database-tabel <code>FactuurReferentie</code> bestaat
                misschien nog niet. Controleer in Render of de laatste deploy de Prisma migration heeft
                gedraaid (<code>prisma db push --accept-data-loss</code>).
              </p>
            )}
            {fout.status === 400 && fout.details ? (
              <details className="mt-2">
                <summary className="text-xs text-red-700 cursor-pointer">Validatie-details</summary>
                <pre className="text-xs text-red-800 bg-white border border-red-200 rounded p-2 mt-1 overflow-x-auto">{JSON.stringify(fout.details, null, 2)}</pre>
              </details>
            ) : null}
          </div>
        )}

        <div className="border-t border-gray-200 px-5 py-3 flex justify-end gap-2">
          <button onClick={onSluit} className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5">
            Annuleer
          </button>
          <button
            onClick={submit}
            disabled={!canSave || bezig}
            className="bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white text-sm font-medium px-4 py-1.5 rounded"
          >
            {bezig ? 'Opslaan…' : (initial ? 'Wijzigingen opslaan' : '+ Toevoegen')}
          </button>
        </div>
      </div>
    </div>
  );
}
