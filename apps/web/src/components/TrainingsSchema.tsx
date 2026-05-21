/**
 * Trainingsschema — vul aantal teams per dag in.
 *
 * Gebaseerd op het originele Excel-rekenmodel (sheet "Douchen (teamsporten)"):
 *
 *   Onder 13 jaar (jeugd):
 *     - Speelt op HALF veld → ~10 spelers per team (incl. wissels)
 *     - Doucht 25% doordeweeks
 *     - Doucht 50% bij wedstrijd (zaterdag)
 *     - Doucht 100% bij wedstrijd (zondag — vooral senioren-jeugd)
 *
 *   13 jaar en ouder (senioren):
 *     - Speelt op HEEL veld → ~15 spelers per team (incl. wissels + scheids)
 *     - Doucht 95% bij training (doordeweeks)
 *     - Doucht 100% bij wedstrijd (weekend)
 *
 *   Per douche: 35 liter warm water (37°C uit Excel)
 *
 * Dit schema vervangt de losse "douches-analyse"-invoer in stap 2 — die wordt
 * automatisch overgenomen uit dit schema.
 */

import { useState } from 'react';
import { InfoTooltip } from './InfoTooltip';

// Aantal spelers per team (incl. wissels) — uit Excel
export const SPELERS_PER_TEAM = {
  onder13: 10,   // half veld: 7 spelers + wissels
  vanaf13: 15,   // heel veld: 11 spelers + 4 wissels
} as const;

export const LITERS_PER_DOUCHE = 35;

export interface TrainingMoment {
  id: string;
  dag: 'maandag' | 'dinsdag' | 'woensdag' | 'donderdag' | 'vrijdag' | 'zaterdag' | 'zondag';
  startTijd: string;
  eindTijd: string;
  /** Aantal teams onder 13 jaar (jeugd, half veld, ~10 spelers/team) */
  aantalTeamsOnder13: number;
  /** Aantal teams 13+ (senioren, heel veld, ~15 spelers/team) */
  aantalTeamsVanaf13: number;
  type: 'training' | 'wedstrijd' | 'sociaal';
}

export type TrainingsSchema = TrainingMoment[];

const DAGEN: TrainingMoment['dag'][] = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];

/**
 * Douche-percentage o.b.v. leeftijd, type activiteit en dag.
 * Bron: Excel sheet "Douchen (teamsporten)".
 */
export function douchePercentage(
  leeftijd: 'onder13' | 'vanaf13',
  type: TrainingMoment['type'],
  dag: TrainingMoment['dag'],
): number {
  // Sociaal (kantine zonder sporten) → niemand doucht
  if (type === 'sociaal') return 0;

  const isWedstrijd = type === 'wedstrijd';

  if (leeftijd === 'onder13') {
    if (isWedstrijd) {
      if (dag === 'zondag') return 1.00; // jeugd-wedstrijden zondag minder, maar afspraak Excel
      return 0.50;
    }
    return 0.25; // training doordeweeks
  }
  // 13+
  if (isWedstrijd) return 1.00;
  return 0.95;
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
      aantalTeamsOnder13: 0,
      aantalTeamsVanaf13: 1,
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

  // Live totalen per week (douche-beurten en liters)
  const totaal = analyseSchema(schema);

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-600">
        Vul per dag het aantal <strong>teams</strong> in. Het systeem rekent zelf met spelers per team,
        douche-percentage en water-verbruik (uit Excel-rekenmodel).
        <InfoTooltip>
          <div className="space-y-1">
            <p><strong>Onder 13 jaar</strong>: half veld, ~10 spelers/team. Doucht 25% bij training, 50% bij wedstrijd.</p>
            <p><strong>13 jaar en ouder</strong>: heel veld, ~15 spelers/team. Doucht 95% bij training, 100% bij wedstrijd.</p>
            <p><strong>Sociale momenten</strong>: niemand doucht (alleen kantine).</p>
            <p>Per douche-beurt: 35 liter warm water (37°C).</p>
          </div>
        </InfoTooltip>
      </p>

      {sorted.length === 0 && (
        <p className="text-sm text-gray-500 italic bg-gray-50 p-3 rounded-md">
          Nog geen schema. Klik hieronder om een eerste trainings- of wedstrijddag toe te voegen.
        </p>
      )}

      {expanded && sorted.length > 0 && (
        <>
          <div className="space-y-2">
            {sorted.map(m => {
              const pctO13 = Math.round(douchePercentage('onder13', m.type, m.dag) * 100);
              const pctV13 = Math.round(douchePercentage('vanaf13', m.type, m.dag) * 100);
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
                      <label className="text-xs text-gray-600">
                        Teams &lt;13 jr <span className="text-gray-400">({SPELERS_PER_TEAM.onder13} sp/team, {pctO13}% doucht)</span>
                      </label>
                      <input type="number" min={0} className="input py-1 text-sm" value={m.aantalTeamsOnder13}
                             onChange={e => updateMoment(m.id, { aantalTeamsOnder13: Number(e.target.value) || 0 })} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">
                        Teams ≥13 jr <span className="text-gray-400">({SPELERS_PER_TEAM.vanaf13} sp/team, {pctV13}% doucht)</span>
                      </label>
                      <input type="number" min={0} className="input py-1 text-sm" value={m.aantalTeamsVanaf13}
                             onChange={e => updateMoment(m.id, { aantalTeamsVanaf13: Number(e.target.value) || 0 })} />
                    </div>
                    <div className="flex items-center justify-end">
                      <button type="button" onClick={() => removeMoment(m.id)}
                              className="text-xs text-red-600 hover:text-red-800">
                        Verwijder
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {totaal.totaalDoucheBeurtenPerWeek > 0 && (
            <div className="mt-3 bg-primary-50/60 border border-primary-100 rounded-md p-3 text-xs text-primary-900">
              <strong>Per week totaal:</strong> {totaal.totaalDoucheBeurtenPerWeek} douche-beurten ·
              {' '}{Math.round(totaal.totaalLitersPerWeek).toLocaleString('nl-NL')} liter warm water ·
              {' '}{totaal.urenPerWeek} uur gebruik
            </div>
          )}
        </>
      )}

      <button type="button" onClick={addMoment} className="btn-secondary text-sm">
        + Voeg dag toe
      </button>
    </div>
  );
}

/**
 * Analyseer schema → totalen per week.
 * Inclusief douche-beurten en water-verbruik o.b.v. teams × spelers × douche-%.
 */
export function analyseSchema(schema: TrainingsSchema): {
  urenPerWeek: number;
  doucheBeurtenJeugdPerWeek: number;
  doucheBeurtenSeniorenPerWeek: number;
  totaalDoucheBeurtenPerWeek: number;
  totaalLitersPerWeek: number;
  totaalPersonenPerWeek: number;
} {
  let uren = 0;
  let douchesJeugd = 0;
  let douchesSenioren = 0;
  let personen = 0;
  for (const m of schema) {
    const start = parseTime(m.startTijd);
    const eind = parseTime(m.eindTijd);
    const duur = Math.max(0, eind - start);
    uren += duur;

    const spelersO13 = (m.aantalTeamsOnder13 ?? 0) * SPELERS_PER_TEAM.onder13;
    const spelersV13 = (m.aantalTeamsVanaf13 ?? 0) * SPELERS_PER_TEAM.vanaf13;
    personen += spelersO13 + spelersV13;

    douchesJeugd += spelersO13 * douchePercentage('onder13', m.type, m.dag);
    douchesSenioren += spelersV13 * douchePercentage('vanaf13', m.type, m.dag);
  }
  const totaalDouches = douchesJeugd + douchesSenioren;
  return {
    urenPerWeek: Math.round(uren * 10) / 10,
    doucheBeurtenJeugdPerWeek: Math.round(douchesJeugd),
    doucheBeurtenSeniorenPerWeek: Math.round(douchesSenioren),
    totaalDoucheBeurtenPerWeek: Math.round(totaalDouches),
    totaalLitersPerWeek: Math.round(totaalDouches * LITERS_PER_DOUCHE),
    totaalPersonenPerWeek: personen,
  };
}

function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) + (m ?? 0) / 60;
}
