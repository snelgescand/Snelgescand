/**
 * Tapwater-warmtepomp keuze — Q-ton vs LMNT vs warmtepompboiler.
 *
 * Drie kernfuncties:
 *
 *  1. EXCLUSIEVE KEUZE — slechts één tapwater-oplossing tegelijk.
 *     Q-ton kan ALLEEN tapwater (hoge T, CO₂-koudemiddel).
 *     LMNT kan ZOWEL tapwater ALS ruimteverwarming (universele lucht/water).
 *     Warmtepompboiler is de "kleine" oplossing.
 *
 *  2. BUFFER-SIMULATIE — zelfde model als Excel-rekenmodel:
 *     Per uur van de week:
 *        water_in    = capaciteit WP × benutting (alleen tijdens actie)
 *        water_uit   = douche-watervraag dit uur (37°C equivalent)
 *        buffer_eind = max(0, min(maxBuffer, vorige_buffer + in − uit))
 *     Visualisatie: blauw = watervraag, oranje = resterende buffer.
 *
 *  3. CAPACITEITS-VERGELIJKING — toont voor elk model:
 *        - Maximaal piek-uur (L/u 37°C)
 *        - Dekkings-percentage van de week-vraag
 *        - Aanbeveling per gebouw-grootte
 *
 * Bron: Rekenmodel_Sportief_Opgewekt_v8.2.1 — tabblad "Q-ton (Nieuw)".
 */

import { useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Legend } from 'recharts';
import { KopieerKnop } from '../util/kopieer';

/** Capaciteits-tabel LMNT — liter per uur bij 55°C uitlaattemperatuur (omgerekend naar 37°C douchewater). */
export const LMNT_MODELLEN: Array<{
  vermogenKw: number;
  literPerUur55C: number;
  /** Effectief L/u op 37°C douchewater = 55→37 mengfactor (1−(55−37)/(55−10)) = 0,60 */
  literPerUur37C: number;
  modelnaam: string;
}> = [
  { vermogenKw: 8.9,  literPerUur55C: 170,  literPerUur37C: 283,  modelnaam: 'LMNT-9 (8,9 kW)' },
  { vermogenKw: 15,   literPerUur55C: 286,  literPerUur37C: 477,  modelnaam: 'LMNT-15 (15 kW)' },
  { vermogenKw: 22,   literPerUur55C: 420,  literPerUur37C: 700,  modelnaam: 'LMNT-22 (22 kW)' },
  { vermogenKw: 28,   literPerUur55C: 537,  literPerUur37C: 895,  modelnaam: 'LMNT-28 (28 kW)' },
  { vermogenKw: 50,   literPerUur55C: 955,  literPerUur37C: 1592, modelnaam: 'LMNT-50 (50 kW)' },
  { vermogenKw: 75,   literPerUur55C: 1433, literPerUur37C: 2388, modelnaam: 'LMNT-75 (75 kW)' },
  { vermogenKw: 150,  literPerUur55C: 2866, literPerUur37C: 4777, modelnaam: 'LMNT-150 (150 kW)' },
];

/** Capaciteits-tabel Q-ton — liter per uur bij 90°C uitlaattemperatuur (op 37°C douchewater). */
export const QTON_MODELLEN: Array<{
  vermogenKw: number;
  literPerUur90C: number;
  literPerUur37C: number;
  modelnaam: string;
}> = [
  { vermogenKw: 30,  literPerUur90C: 515,  literPerUur37C: 1526, modelnaam: 'Q-ton HMA30A (30 kW)' },
  { vermogenKw: 45,  literPerUur90C: 780,  literPerUur37C: 2311, modelnaam: 'Q-ton HMA45A (45 kW)' },
  // 90 kW als cascade staat niet meer in deze lijst — gebruik de "+ Tweede unit (cascade)"-
  // knop onder de modelkeuze om 2× HMA30A of 2× HMA45A te draaien.
];

export type TapwaterKeuze = 'geen' | 'warmtepompboiler' | 'qton' | 'lmnt';

interface Props {
  /** Per-uur watervraag voor 7 dagen (0-167), in liter 37°C equivalent. Uit berekenDouchePieken. */
  perDagPerUur: Partial<Record<string, number[]>>;
  /** Huidige keuze voor tapwater-WP */
  keuze: TapwaterKeuze;
  /** Bij Q-ton/LMNT: welk model (vermogenKw) */
  modelVermogenKw?: number;
  /** Bij Q-ton/LMNT: aantal units in cascade (1 of 2). Default 1.
   *  Een 2e unit verdubbelt de continue capaciteit. */
  aantalUnits?: number;
  /** Buffer-volume in liter (boilervat — al op 37°C equivalent gerekend) */
  bufferLiters?: number;
  /** Bij LMNT: of het ook ruimteverwarming doet */
  lmntIncRuimteverwarming?: boolean;
  onKeuzeChange: (k: TapwaterKeuze) => void;
  onModelChange: (vermogenKw: number) => void;
  onBufferChange: (liters: number) => void;
  onLmntRuimteverwarmingChange: (incl: boolean) => void;
  onAantalUnitsChange?: (n: number) => void;
}

const DAGEN: Array<keyof typeof DAGEN_NL> = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
const DAGEN_NL = { ma: 'Maandag', di: 'Dinsdag', wo: 'Woensdag', do: 'Donderdag', vr: 'Vrijdag', za: 'Zaterdag', zo: 'Zondag' };
const DAG_KEYS = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];

export function TapwaterVergelijking({
  perDagPerUur, keuze, modelVermogenKw, aantalUnits, bufferLiters, lmntIncRuimteverwarming,
  onKeuzeChange, onModelChange, onBufferChange, onLmntRuimteverwarmingChange, onAantalUnitsChange,
}: Props) {
  // Aantal units (1 of 2 — cascade). Default 1.
  const units = Math.max(1, Math.min(2, aantalUnits ?? 1));

  const capaciteitPerUnit37C = useMemo(() => {
    if (keuze === 'qton' && modelVermogenKw) {
      const m = QTON_MODELLEN.find(m => m.vermogenKw === modelVermogenKw);
      return m?.literPerUur37C ?? 0;
    }
    if (keuze === 'lmnt' && modelVermogenKw) {
      const m = LMNT_MODELLEN.find(m => m.vermogenKw === modelVermogenKw);
      return m?.literPerUur37C ?? 0;
    }
    if (keuze === 'warmtepompboiler') {
      // ~80L per uur voor standaard 200-300L warmtepompboiler
      return 80;
    }
    return 0;
  }, [keuze, modelVermogenKw]);

  // Effectieve capaciteit = per-unit × aantal units in cascade.
  // (Warmtepompboiler kent geen cascade — daar blijft units altijd 1.)
  const capaciteit37C = capaciteitPerUnit37C * (keuze === 'warmtepompboiler' ? 1 : units);

  const buffer = bufferLiters ?? 1000; // default buffer

  // Buffer-simulatie per uur van de week
  // model:  buffer(t+1) = clamp(0, maxBuffer, buffer(t) + capaciteit_per_uur − vraag_per_uur)
  const simulatie = useMemo(() => {
    const rijen: Array<{ uur: number; label: string; dag: string; watervraag: number; resterend: number }> = [];
    let bufferStaat = buffer; // begin vol
    for (let dagIdx = 0; dagIdx < 7; dagIdx++) {
      const dagKey = DAG_KEYS[dagIdx];
      const uren = perDagPerUur[dagKey] ?? new Array(24).fill(0);
      for (let u = 0; u < 24; u++) {
        const vraag = uren[u];
        bufferStaat = Math.max(0, Math.min(buffer, bufferStaat + capaciteit37C - vraag));
        rijen.push({
          uur: dagIdx * 24 + u,
          label: u === 12 ? DAGEN_NL[DAGEN[dagIdx]] : '',
          dag: dagKey,
          watervraag: Math.round(vraag),
          resterend: Math.round(bufferStaat),
        });
      }
    }
    return rijen;
  }, [perDagPerUur, capaciteit37C, buffer]);

  const piekUurVraag = useMemo(() => Math.max(0, ...simulatie.map(s => s.watervraag)), [simulatie]);
  const onderdekt = useMemo(() => simulatie.filter(s => s.resterend === 0 && s.watervraag > 0).length, [simulatie]);
  const dekkingPct = piekUurVraag > 0 ? Math.min(100, (capaciteit37C / piekUurVraag) * 100) : 100;

  const modelKeuzes = keuze === 'qton' ? QTON_MODELLEN : keuze === 'lmnt' ? LMNT_MODELLEN : [];

  return (
    <div className="bg-white border-2 border-primary-200 rounded-lg p-5 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-base font-semibold text-primary-900">🚰 Tapwater-warmtepomp: Q-ton of LMNT?</h3>
          <p className="text-xs text-gray-600 mt-1">
            Kies één oplossing — twee tapwater-WP-en tegelijk heeft geen zin.
            <strong> Belangrijk:</strong> LMNT kan ook ruimteverwarming doen (lucht/water 35-65°C),
            Q-ton kan dat NIET (alleen tapwater, 60-90°C).
          </p>
        </div>
      </div>

      {/* === Keuze radio === */}
      <div className="grid sm:grid-cols-4 gap-2">
        {(['geen', 'warmtepompboiler', 'qton', 'lmnt'] as TapwaterKeuze[]).map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => onKeuzeChange(opt)}
            className={`text-left rounded-lg p-3 border-2 transition-colors ${
              keuze === opt
                ? 'border-primary-500 bg-primary-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <p className="font-medium text-sm text-gray-900">
              {opt === 'geen' && '○ Nog niet kiezen'}
              {opt === 'warmtepompboiler' && '🛢️ Warmtepompboiler'}
              {opt === 'qton' && '⚡ Q-ton (CO₂)'}
              {opt === 'lmnt' && '🌡️ LMNT (universeel)'}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              {opt === 'geen' && 'Kies dit als je nog twijfelt — vul later in'}
              {opt === 'warmtepompboiler' && 'Klein, ~€4-8k, tot 150 L/u piek'}
              {opt === 'qton' && 'Hoge T 90°C, alleen tapwater'}
              {opt === 'lmnt' && 'Tapwater + ruimteverwarming mogelijk'}
            </p>
          </button>
        ))}
      </div>

      {/* === Model-keuze + buffer (alleen bij Q-ton/LMNT) === */}
      {(keuze === 'qton' || keuze === 'lmnt') && (
        <div className="bg-gray-50 rounded-lg p-3 grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Model / vermogen</label>
            <select
              className="input py-1.5 text-sm"
              value={modelVermogenKw ?? ''}
              onChange={e => onModelChange(Number(e.target.value))}
            >
              <option value="">— kies model —</option>
              {modelKeuzes.map(m => (
                <option key={m.vermogenKw} value={m.vermogenKw}>
                  {m.modelnaam} — {keuze === 'qton'
                    ? `${(m as typeof QTON_MODELLEN[0]).literPerUur90C} L/u (90°C) ≈ ${(m as typeof QTON_MODELLEN[0]).literPerUur37C} L/u (37°C douchewater)`
                    : `${(m as typeof LMNT_MODELLEN[0]).literPerUur55C} L/u (55°C) ≈ ${(m as typeof LMNT_MODELLEN[0]).literPerUur37C} L/u (37°C)`
                  }
                </option>
              ))}
            </select>
            {/* Cascade-knop: bij onvoldoende capaciteit kun je een 2e unit toevoegen. */}
            {modelVermogenKw && onAantalUnitsChange && (
              <div className="mt-2 flex items-center gap-2 text-xs">
                {units === 1 ? (
                  <button
                    type="button"
                    onClick={() => onAantalUnitsChange(2)}
                    className="px-2 py-1 bg-primary-50 hover:bg-primary-100 border border-primary-300 text-primary-900 rounded font-medium"
                    title="Twee units parallel/cascade — verdubbelt de capaciteit"
                  >
                    + Tweede unit (cascade)
                  </button>
                ) : (
                  <>
                    <span className="px-2 py-1 bg-primary-100 border border-primary-300 text-primary-900 rounded font-semibold">
                      2× {keuze === 'qton' ? 'Q-ton' : 'LMNT'} cascade — {(modelVermogenKw ?? 0) * 2} kW totaal
                    </span>
                    <button
                      type="button"
                      onClick={() => onAantalUnitsChange(1)}
                      className="px-2 py-1 hover:bg-gray-100 border border-gray-300 text-gray-700 rounded"
                      title="Verwijder de tweede unit"
                    >
                      ✕ verwijder 2e
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Buffervat (liter, 37°C equivalent)</label>
            <input
              type="number"
              className="input py-1.5 text-sm"
              value={bufferLiters ?? ''}
              placeholder="bv. 2000"
              onChange={e => onBufferChange(Number(e.target.value) || 0)}
            />
          </div>
          {/* LMNT-specifiek: ruimteverwarming inclusief? */}
          {keuze === 'lmnt' && (
            <div className="sm:col-span-2 bg-amber-50 border border-amber-200 rounded p-2 flex items-start gap-2">
              <input
                type="checkbox"
                id="lmnt-inc-rv"
                className="mt-0.5"
                checked={lmntIncRuimteverwarming ?? false}
                onChange={e => onLmntRuimteverwarmingChange(e.target.checked)}
              />
              <label htmlFor="lmnt-inc-rv" className="text-xs text-amber-900">
                <strong>Ook ruimteverwarming via deze LMNT?</strong> Een LMNT kan tapwater (55°C) én ruimteverwarming (35-50°C) leveren — kies dan GEEN aparte lucht/water-warmtepomp.
                Extra gasbesparing: ruimteverwarmings-gas (~55% van clubgas) wordt ook geëlektrificeerd.
              </label>
            </div>
          )}
        </div>
      )}

      {/* === Buffer-simulatie grafiek === */}
      {(keuze === 'qton' || keuze === 'lmnt' || keuze === 'warmtepompboiler') && capaciteit37C > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                📊 Buffer-simulatie: vraag vs. capaciteit per uur van de week
              </p>
              <p className="text-xs text-gray-500">
                Liter warm water op 37°C equivalent. Buffer raakt leeg = blauwe piek zonder oranje = onderdekking.
              </p>
            </div>
            <KopieerKnop
              label="Kopieer simulatie"
              geefData={() => ({
                titel: `Buffer-simulatie tapwater (${units > 1 ? `${units}× ` : ''}${keuze === 'qton' ? 'Q-ton' : keuze === 'lmnt' ? 'LMNT' : 'WP-boiler'} ${modelVermogenKw ?? ''} kW${units > 1 ? ` = ${(modelVermogenKw ?? 0) * units} kW` : ''})`,
                kolommen: ['Uur', 'Dag', 'Watervraag (L 37°C)', 'Resterend in buffer (L)'],
                rijen: simulatie.map(s => [s.uur, s.dag, s.watervraag, s.resterend]),
                voet: `Capaciteit ${capaciteit37C} L/u · Buffer ${buffer} L · Piek-uur ${piekUurVraag} L · ${onderdekt > 0 ? `${onderdekt} uur onderdekt` : 'volledig dekkend'}`,
              })}
            />
          </div>

          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={simulatie} margin={{ top: 5, right: 5, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="label"
                interval={0}
                tick={{ fontSize: 11 }}
                height={30}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                labelFormatter={(_l, payload) => {
                  if (!payload?.[0]) return '';
                  const r = payload[0].payload as { dag: string; uur: number };
                  const dagNaam = DAG_KEYS.includes(r.dag) ? r.dag : '?';
                  return `${dagNaam} ${r.uur % 24}:00`;
                }}
                formatter={(v: number, n: string) => [`${v} L`, n]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={capaciteit37C} stroke="#10b981" strokeDasharray="4 2"
                label={{ value: `Capaciteit ${capaciteit37C} L/u`, position: 'insideTopRight', fontSize: 10, fill: '#10b981' }} />
              <Area type="monotone" dataKey="resterend" stackId={undefined} stroke="#f97316" fill="#fed7aa" name={`Resterend 37°C na douchebeurt (buffer ${buffer} L)`} />
              <Area type="monotone" dataKey="watervraag" stackId={undefined} stroke="#0ea5e9" fill="#bae6fd" name="Watervraag 37°C" />
            </AreaChart>
          </ResponsiveContainer>

          {/* KPI-blokken */}
          <div className="grid sm:grid-cols-4 gap-2 pt-1">
            <Kpi label="Piek-uur vraag" value={`${piekUurVraag} L/u`} sub="hoogste douche-piek deze week" />
            <Kpi label="Capaciteit WP" value={`${capaciteit37C} L/u`} sub="continu, 37°C equivalent" />
            <Kpi
              label="Dekking"
              value={`${dekkingPct.toFixed(0)}%`}
              sub={dekkingPct >= 100 ? 'WP dekt piek' : 'Buffer overbrugt rest'}
              positief={dekkingPct >= 100}
            />
            <Kpi
              label="Onderdekte uren"
              value={`${onderdekt} u`}
              sub={onderdekt === 0 ? 'Buffer raakt nooit leeg' : 'Buffer raakt leeg'}
              waarschuwing={onderdekt > 0}
              positief={onderdekt === 0}
            />
          </div>

          {onderdekt > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800">
              ⚠ Buffer raakt {onderdekt} uur leeg deze week — de douches krijgen geen warm water meer.
              {' '}<strong>Oplossing:</strong> grotere capaciteit (volgend model), of meer buffervat ({buffer} L → {buffer * 1.5} L).
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, positief, waarschuwing }: {
  label: string; value: string; sub?: string; positief?: boolean; waarschuwing?: boolean;
}) {
  const k = waarschuwing ? 'text-amber-700 bg-amber-50 border-amber-200'
    : positief ? 'text-green-700 bg-green-50 border-green-200'
    : 'text-gray-900 bg-white border-gray-200';
  return (
    <div className={`rounded p-2 border ${k}`}>
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-lg font-bold">{value}</p>
      {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
    </div>
  );
}
