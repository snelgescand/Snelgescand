/**
 * Detail-formulier voor één maatregel.
 *
 * Gebruikt MAATREGEL_META om dynamisch de juiste velden te tonen.
 * Voor maatregelen met multi-segment input (glas, douches) wordt
 * een speciaal sub-component getoond.
 */

import { useState, useEffect } from 'react';
import { rcDefault } from '@sportief-opgewekt/calc-core';
import { InfoTooltip } from './InfoTooltip';
import { MAATREGEL_META, GLAS_OPTIES, DAG_NAMEN, type VeldDef } from '../data/maatregel-velden';

interface MaatregelDetailProps {
  maatregelId: string;
  maatregelNaam: string;
  input: Record<string, unknown>;
  onChange: (input: Record<string, unknown>) => void;
  onRemove: () => void;
  /** Bouwjaar uit project — gebruikt om Rc-waardes te suggereren */
  bouwjaar?: number;
  /**
   * Een unieke string die verandert bij elke "open" actie (bv. klik op "✏️ Aanpassen").
   * Als de string non-empty is en verandert, klapt het paneel open. Lege string = niets.
   */
  openSignal?: string;
}

// Maatregel-ID → welke constructie-deel voor rcDefault lookup
const RC_DEEL: Record<string, 'dak' | 'gevel' | 'vloer'> = {
  'dakisolatie': 'dak',
  'spouwmuurisolatie': 'gevel',
  'vloerisolatie': 'vloer',
};

export function MaatregelDetail({ maatregelId, maatregelNaam, input, onChange, onRemove, bouwjaar, openSignal = '' }: MaatregelDetailProps) {
  const [open, setOpen] = useState(!!openSignal);

  // Wanneer openSignal verandert (nieuwe klik op Aanpassen), het paneel openen.
  // Gebruik de signal-string zelf als dependency zodat ELKE wijziging triggert.
  useEffect(() => {
    if (openSignal) setOpen(true);
  }, [openSignal]);

  const meta = MAATREGEL_META[maatregelId];

  function updateVeld(pad: string, waarde: unknown) {
    onChange({ ...input, [pad]: waarde });
  }

  return (
    <div className="border border-primary-200 rounded-lg overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center justify-between bg-primary-50/40 hover:bg-primary-50 transition-colors"
      >
        <span className="font-medium text-primary-900 flex items-center gap-2">
          <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
          {maatregelNaam}
        </span>
        <span className="text-xs text-primary-600">{open ? 'Inklappen' : 'Details aanpassen'}</span>
      </button>

      {open && (
        <div className="p-4 space-y-3 border-t border-primary-100">
          {meta?.kort && (
            <p className="text-sm text-gray-600 mb-3">{meta.kort}</p>
          )}

          {/* Speciale forms voor multi-segment maatregelen */}
          {maatregelId === 'glasisolatie' && (
            <GlasSegmenten input={input} onChange={onChange} />
          )}
          {maatregelId === 'douches-analyse' && input.uitTrainingsSchema ? (
            <div className="bg-primary-50/60 border border-primary-200 rounded-md p-3 text-sm space-y-1">
              <p className="font-medium text-primary-900">
                ✓ Automatisch ingevuld uit het trainingsschema (stap 1)
              </p>
              <p className="text-gray-700 text-xs">
                De douche-beurten per dag zijn berekend uit teams × spelers × douche-%. Wijzig het trainingsschema
                in stap 1 om deze waardes aan te passen.
              </p>
              {(input.dagen as Array<{ dag: string; training: number; wedstrijd: number }> | undefined) && (
                <table className="w-full text-xs mt-2">
                  <thead>
                    <tr className="border-b border-primary-200">
                      <th className="text-left py-1 text-gray-600">Dag</th>
                      <th className="text-right py-1 text-gray-600">Training</th>
                      <th className="text-right py-1 text-gray-600">Wedstrijd</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(input.dagen as Array<{ dag: string; training: number; wedstrijd: number }>).map(d => (
                      <tr key={d.dag} className="border-b border-primary-100/40">
                        <td className="py-1 capitalize text-gray-700">{d.dag}</td>
                        <td className="text-right py-1 text-gray-900">{d.training}</td>
                        <td className="text-right py-1 text-gray-900">{d.wedstrijd}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : maatregelId === 'douches-analyse' && (
            <DouchesSegmenten input={input} onChange={onChange} />
          )}

          {/* Standaard velden */}
          {meta && meta.velden.map(veld => {
            // Voor Rc-velden: bereken een suggestie o.b.v. bouwjaar
            let rcSuggestie: number | undefined = undefined;
            const deel = RC_DEEL[maatregelId];
            if (veld.pad === 'huidigeRcWaarde' && deel && bouwjaar) {
              try { rcSuggestie = rcDefault(bouwjaar, deel); } catch { /* ignore */ }
            }
            return (
              <VeldInput
                key={veld.pad}
                veld={veld}
                waarde={input[veld.pad]}
                onChange={(w) => updateVeld(veld.pad, w)}
                suggestie={rcSuggestie}
                suggestieLabel={rcSuggestie ? `Op basis van bouwjaar ${bouwjaar}: ${rcSuggestie.toFixed(2)} — klik om in te vullen` : undefined}
              />
            );
          })}

          <div className="pt-2 flex justify-end">
            <button
              onClick={onRemove}
              className="text-xs text-red-600 hover:text-red-800"
            >
              Verwijder deze maatregel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function VeldInput({ veld, waarde, onChange, suggestie, suggestieLabel }: {
  veld: VeldDef;
  waarde: unknown;
  onChange: (w: unknown) => void;
  suggestie?: number;
  suggestieLabel?: string;
}) {
  return (
    <div>
      <label className="label flex items-center text-sm">
        {veld.label}{veld.eenheid ? ` (${veld.eenheid})` : ''}
        {veld.tooltip && <InfoTooltip>{veld.tooltip}</InfoTooltip>}
      </label>
      {veld.type === 'number' && (
        <>
          <input
            type="number"
            step={veld.stap}
            placeholder={veld.placeholder}
            className="input"
            value={waarde as number ?? ''}
            onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          />
          {suggestie !== undefined && (
            <button
              type="button"
              onClick={() => onChange(suggestie)}
              className="text-xs text-primary-700 hover:text-primary-900 hover:underline mt-1"
            >
              ↻ {suggestieLabel}
            </button>
          )}
        </>
      )}
      {veld.type === 'text' && (
        <input
          type="text"
          placeholder={veld.placeholder}
          className="input"
          value={waarde as string ?? ''}
          onChange={e => onChange(e.target.value)}
        />
      )}
      {veld.type === 'select' && veld.opties && (
        <select
          className="input"
          value={String(waarde ?? '')}
          onChange={e => {
            const v = e.target.value;
            // Bool-conversie als de optie 'true'/'false' is
            if (v === 'true') onChange(true);
            else if (v === 'false') onChange(false);
            else if (!isNaN(Number(v))) onChange(Number(v));
            else onChange(v);
          }}
        >
          {veld.opties.map(opt => (
            <option key={opt.waarde} value={opt.waarde}>{opt.label}</option>
          ))}
        </select>
      )}
    </div>
  );
}

/* ============================================================
 * Glas-segmenten: voor glasisolatie kun je meerdere stukken glas
 * met verschillende soorten/oppervlaktes invullen.
 * ============================================================ */

interface GlasSegment {
  oppervlakteM2: number;
  huidig: string;
  nieuw: string;
  urenPerDag: number;
  plek?: string;
}

function GlasSegmenten({ input, onChange }: { input: Record<string, unknown>; onChange: (input: Record<string, unknown>) => void }) {
  const segmenten = (input.segmenten as GlasSegment[] | undefined) ?? [
    { plek: 'Kantine', oppervlakteM2: 10, huidig: 'dubbel', nieuw: 'hr-pp', urenPerDag: 8 },
  ];

  function update(i: number, patch: Partial<GlasSegment>) {
    const next = segmenten.map((s, idx) => idx === i ? { ...s, ...patch } : s);
    onChange({ ...input, segmenten: next });
  }
  function voegToe() {
    onChange({ ...input, segmenten: [...segmenten, { plek: '', oppervlakteM2: 5, huidig: 'enkel', nieuw: 'hr-pp', urenPerDag: 8 }] });
  }
  function verwijder(i: number) {
    onChange({ ...input, segmenten: segmenten.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="space-y-2 pb-2 border-b border-gray-100">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-800">Beglazing per plek</h4>
        <span className="text-xs text-gray-500">Voeg per plek/ruimte een aparte regel toe</span>
      </div>
      {segmenten.map((s, i) => (
        <div key={i} className="grid grid-cols-[1.2fr_0.8fr_1.2fr_1.2fr_0.7fr_auto] gap-2 items-end p-2 bg-gray-50 rounded">
          <div>
            <label className="text-xs text-gray-600">Plek</label>
            <input
              type="text"
              placeholder="bv. Kantine"
              className="input py-1.5 text-sm"
              value={s.plek ?? ''}
              onChange={e => update(i, { plek: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-gray-600">m²</label>
            <input
              type="number"
              className="input py-1.5 text-sm"
              value={s.oppervlakteM2}
              onChange={e => update(i, { oppervlakteM2: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="text-xs text-gray-600">Huidig glas</label>
            <select
              className="input py-1.5 text-sm"
              value={s.huidig}
              onChange={e => update(i, { huidig: e.target.value })}
            >
              {GLAS_OPTIES.map(o => <option key={o.waarde} value={o.waarde}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-600">Nieuw glas</label>
            <select
              className="input py-1.5 text-sm"
              value={s.nieuw}
              onChange={e => update(i, { nieuw: e.target.value })}
            >
              {GLAS_OPTIES.map(o => <option key={o.waarde} value={o.waarde}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-600">Uren/dag</label>
            <input
              type="number"
              className="input py-1.5 text-sm"
              value={s.urenPerDag}
              onChange={e => update(i, { urenPerDag: Number(e.target.value) })}
            />
          </div>
          <button
            onClick={() => verwijder(i)}
            className="text-red-500 hover:text-red-700 text-lg px-1"
            title="Verwijder dit segment"
          >
            ×
          </button>
        </div>
      ))}
      <button onClick={voegToe} type="button" className="text-xs text-primary-700 hover:underline">
        + Plek toevoegen
      </button>
    </div>
  );
}

/* ============================================================
 * Douches-segmenten: per dag-van-week aantal douchers per type
 * (training / wedstrijd, jeugd / piek / ouderen).
 * ============================================================ */

interface DouchesDag {
  dag: string;
  training: number;
  wedstrijd: number;
}

function DouchesSegmenten({ input, onChange }: { input: Record<string, unknown>; onChange: (input: Record<string, unknown>) => void }) {
  const modus = (input.modus as string) ?? 'simpel';

  const dagen: DouchesDag[] = (input.dagen as DouchesDag[] | undefined) ?? DAG_NAMEN.map(d => ({ dag: d, training: 0, wedstrijd: 0 }));

  function updateDag(i: number, patch: Partial<DouchesDag>) {
    const next = dagen.map((d, idx) => idx === i ? { ...d, ...patch } : d);
    onChange({ ...input, dagen: next });
  }

  return (
    <div className="space-y-3 pb-2 border-b border-gray-100">
      <div>
        <label className="label text-sm flex items-center">
          Berekenmodus
          <InfoTooltip>Simpel rekent met één totaalaantal douchebeurten per jaar. Gedetailleerd vraagt per dag het aantal douchers tijdens training en wedstrijd — preciezer maar meer werk.</InfoTooltip>
        </label>
        <select
          className="input"
          value={modus}
          onChange={e => onChange({ ...input, modus: e.target.value })}
        >
          <option value="simpel">Simpel (jaartotaal)</option>
          <option value="gedetailleerd">Gedetailleerd (per dag)</option>
        </select>
      </div>

      {modus === 'simpel' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label text-sm">Douchebeurten per jaar</label>
            <input
              type="number"
              className="input"
              value={(input.beurtenPerJaar as number) ?? 5000}
              onChange={e => onChange({ ...input, beurtenPerJaar: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="label text-sm">Liters per beurt</label>
            <input
              type="number"
              className="input"
              value={(input.litersPerBeurt as number) ?? 35}
              onChange={e => onChange({ ...input, litersPerBeurt: Number(e.target.value) })}
            />
          </div>
        </div>
      )}

      {modus === 'gedetailleerd' && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-800">Aantal douchers per dag</h4>
          <p className="text-xs text-gray-500">Vul gemiddeld aantal mensen dat doucht per dag-van-week. Training (avond) en wedstrijd (weekend).</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-primary-50">
                <tr>
                  <th className="px-2 py-1.5 text-left">Dag</th>
                  <th className="px-2 py-1.5 text-left">Training (#)</th>
                  <th className="px-2 py-1.5 text-left">Wedstrijd (#)</th>
                </tr>
              </thead>
              <tbody>
                {dagen.map((d, i) => (
                  <tr key={d.dag} className="border-b border-gray-100">
                    <td className="px-2 py-1 capitalize">{d.dag}</td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        className="input py-1 text-sm"
                        value={d.training}
                        onChange={e => updateDag(i, { training: Number(e.target.value) })}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        className="input py-1 text-sm"
                        value={d.wedstrijd}
                        onChange={e => updateDag(i, { wedstrijd: Number(e.target.value) })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
