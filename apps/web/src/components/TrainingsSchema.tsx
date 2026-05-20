/**
 * Trainingsschema — wanneer wordt de accommodatie gebruikt, door welke leeftijdsgroep,
 * en met of zonder douche.
 *
 * IMPORTANT: Gebaseerd op het originele Excel-rekenmodel (Douchen-teamsporten):
 *   - **Onder 13 jaar**: douche-percentage 25% doordeweeks / 50% zaterdag / 100% zondag
 *   - **13 jaar en ouder**: douche-percentage 95% doordeweeks / 100% weekend
 *
 * Reden: jeugd onder 13 douchet zelden bij training; oudere spelers vrijwel altijd.
 *
 * Dient als basis voor:
 *  - Specifiekere gasverdeling (ipv vaste 55/35/10 heuristiek)
 *  - Waterverbruik per uur-van-de-dag grafiek
 *  - Realistische besparingsschatting per maatregel
 */

import { useState } from 'react';
import { InfoTooltip } from './InfoTooltip';

export interface TrainingMoment {
  id: string;
  dag: 'maandag' | 'dinsdag' | 'woensdag' | 'donderdag' | 'vrijdag' | 'zaterdag' | 'zondag';
  startTijd: string;
  eindTijd: string;
  /** Aantal spelers/bezoekers onder 13 jaar (jeugd) */
  aantalOnder13: number;
  /** Aantal spelers/bezoekers 13 jaar en ouder */
  aantalVanaf13: number;
  /** Doucht deze groep überhaupt na de activiteit? Default true voor training/wedstrijd */
  metDouche: boolean;
  type: 'training' | 'wedstrijd' | 'sociaal';
}

export type TrainingsSchema = TrainingMoment[];

const DAGEN: TrainingMoment['dag'][] = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];

/**
 * Douche-percentage o.b.v. leeftijdsgroep en dag.
 * Bron: Excel Rekenmodel Sportief Opgewekt, sheet 'Douchen (teamsporten)'.
 */
function douchePercentage(leeftijd: 'onder13' | 'vanaf13', dag: TrainingMoment['dag']): number {
  if (leeftijd === 'onder13') {
    if (dag === 'zaterdag') return 0.50;
    if (dag === 'zondag') return 1.00;
    return 0.25; // doordeweeks
  }
  // 13 en ouder
  if (dag === 'zaterdag' || dag === 'zondag') return 1.00;
  return 0.95; // doordeweeks
}

interface Props {
  schema: TrainingsSchema;
  onChange: (s: TrainingsSchema) => void;
}

export function TrainingsSchemaInvoer({ schema, onChange }: Props) {
  const [expanded, setExpanded] = useState(schema.length > 0);

  function addMoment() {
    const nieuw: TrainingMoment = {
      id: 'm-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      dag: 'maandag',
      startTijd: '19:00',
      eindTijd: '21:00',
      aantalOnder13: 0,
      aantalVanaf13: 15,
      metDouche: true,
      type: 'training',
    };
    onChange([...schema, nieuw]);
    setExpanded(true);
  }

  function updateMoment(id: string, patch: Partial<TrainingMoment>) {
    onChange(schema.map(m => m.id === id ? { ...m, ...patch } : m));
  }

  function removeMoment(id: string) {
    onChange(schema.filter(m => m.id !== id));
  }

  const sorted = [...schema].sort((a, b) => {
    const dagDiff = DAGEN.indexOf(a.dag) - DAGEN.indexOf(b.dag);
    if (dagDiff !== 0) return dagDiff;
    return a.startTijd.localeCompare(b.startTijd);
  });

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-600">
        Voeg de vaste momenten toe waarop de accommodatie wordt gebruikt. Onder-13 en 13+ aparte kolommen,
        want jeugd doucht veel minder dan ouderen (25% vs 95% doordeweeks).
        <InfoTooltip>
          Bron: het originele Excel-rekenmodel. Onder-13 douchet 25% doordeweeks, 50% zaterdag, 100% zondag.
          13+ doucht 95% doordeweeks, 100% weekend. Deze percentages worden automatisch toegepast
          voor de waterverbruik-berekening.
        </InfoTooltip>
      </p>

      {sorted.length === 0 && (
        <p className="text-sm text-gray-500 italic bg-gray-50 p-3 rounded-md">
          Nog geen schema. Klik hieronder om een eerste trainings-/wedstrijdmoment toe te voegen.
        </p>
      )}

      {expanded && sorted.length > 0 && (
        <div className="space-y-2">
          {sorted.map(m => {
            const pctO13 = Math.round(douchePercentage('onder13', m.dag) * 100);
            const pctV13 = Math.round(douchePercentage('vanaf13', m.dag) * 100);
            return (
              <div key={m.id} className="bg-gray-50/60 rounded-md p-3 space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <select
                    className="input py-1 text-sm"
                    value={m.dag}
                    onChange={e => updateMoment(m.id, { dag: e.target.value as TrainingMoment['dag'] })}
                  >
                    {DAGEN.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                  </select>
                  <input type="time" className="input py-1 text-sm" value={m.startTijd}
                         onChange={e => updateMoment(m.id, { startTijd: e.target.value })} />
                  <input type="time" className="input py-1 text-sm" value={m.eindTijd}
                         onChange={e => updateMoment(m.id, { eindTijd: e.target.value })} />
                  <select
                    className="input py-1 text-sm"
                    value={m.type}
                    onChange={e => updateMoment(m.id, { type: e.target.value as TrainingMoment['type'] })}
                  >
                    <option value="training">Training</option>
                    <option value="wedstrijd">Wedstrijd</option>
                    <option value="sociaal">Sociaal (kantine)</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 items-end">
                  <div>
                    <label className="text-xs text-gray-600">Onder 13 jaar (jeugd) — doucht {pctO13}%</label>
                    <input type="number" min={0} className="input py-1 text-sm" value={m.aantalOnder13}
                           onChange={e => updateMoment(m.id, { aantalOnder13: Number(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">13 jaar en ouder — doucht {pctV13}%</label>
                    <input type="number" min={0} className="input py-1 text-sm" value={m.aantalVanaf13}
                           onChange={e => updateMoment(m.id, { aantalVanaf13: Number(e.target.value) || 0 })} />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-gray-600 flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={m.metDouche}
                             onChange={e => updateMoment(m.id, { metDouche: e.target.checked })} />
                      Met douche
                    </label>
                    <button type="button" onClick={() => removeMoment(m.id)}
                            className="text-xs text-red-600 hover:text-red-800 ml-auto">
                      Verwijder
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button type="button" onClick={addMoment} className="btn-secondary text-sm">
        + Voeg moment toe
      </button>
    </div>
  );
}

/**
 * Helper: bereken op basis van schema het effectieve aantal doucheBeurten per week.
 * Gebruikt leeftijdsspecifieke douche-percentages uit Excel.
 */
export function analyseSchema(schema: TrainingsSchema): {
  urenPerWeek: number;
  doucheBeurtenPerWeek: number;
  doucheBeurtenJeugdPerWeek: number;
  doucheBeurtenVolwassenPerWeek: number;
  totaalPersonenPerWeek: number;
} {
  let uren = 0;
  let douchesJeugd = 0;
  let douchesVolw = 0;
  let personen = 0;
  for (const m of schema) {
    const start = parseTime(m.startTijd);
    const eind = parseTime(m.eindTijd);
    const duur = Math.max(0, eind - start);
    uren += duur;
    personen += (m.aantalOnder13 ?? 0) + (m.aantalVanaf13 ?? 0);
    if (m.metDouche) {
      douchesJeugd += (m.aantalOnder13 ?? 0) * douchePercentage('onder13', m.dag);
      douchesVolw += (m.aantalVanaf13 ?? 0) * douchePercentage('vanaf13', m.dag);
    }
  }
  return {
    urenPerWeek: Math.round(uren * 10) / 10,
    doucheBeurtenJeugdPerWeek: Math.round(douchesJeugd),
    doucheBeurtenVolwassenPerWeek: Math.round(douchesVolw),
    doucheBeurtenPerWeek: Math.round(douchesJeugd + douchesVolw),
    totaalPersonenPerWeek: personen,
  };
}

function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) + (m ?? 0) / 60;
}

/** Export douchePercentage voor gebruik in andere componenten */
export { douchePercentage };
