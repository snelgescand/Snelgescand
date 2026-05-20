/**
 * Trainingsschema — wanneer wordt de accommodatie gebruikt, door wie, en met douche.
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
  aantalKinderen: number;
  aantalVolwassenen: number;
  metDouche: boolean;
  type: 'training' | 'wedstrijd' | 'sociaal';
}

export type TrainingsSchema = TrainingMoment[];

const DAGEN: TrainingMoment['dag'][] = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];

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
      aantalKinderen: 0,
      aantalVolwassenen: 15,
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

  // Sorteer per dag dan tijd voor weergave
  const sorted = [...schema].sort((a, b) => {
    const dagDiff = DAGEN.indexOf(a.dag) - DAGEN.indexOf(b.dag);
    if (dagDiff !== 0) return dagDiff;
    return a.startTijd.localeCompare(b.startTijd);
  });

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-600">
        Voeg de vaste momenten toe waarop de accommodatie gebruikt wordt. Hoe vollediger, hoe
        nauwkeuriger de gas- en waterverbruik-grafieken in stap 2.
        <InfoTooltip>
          Standaard berekent het systeem gas-verdeling met 55% verwarming / 35% tapwater / 10% overig.
          Met een ingevuld trainingsschema kunnen we dit specifieker voor jouw club berekenen.
        </InfoTooltip>
      </p>

      {sorted.length === 0 && (
        <p className="text-sm text-gray-500 italic bg-gray-50 p-3 rounded-md">
          Nog geen schema. Klik hieronder om een eerste trainings-/wedstrijdmoment toe te voegen.
        </p>
      )}

      {expanded && sorted.length > 0 && (
        <div className="space-y-2">
          {sorted.map(m => (
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
                  <label className="text-xs text-gray-600">Aantal kinderen</label>
                  <input type="number" min={0} className="input py-1 text-sm" value={m.aantalKinderen}
                         onChange={e => updateMoment(m.id, { aantalKinderen: Number(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Aantal volwassenen</label>
                  <input type="number" min={0} className="input py-1 text-sm" value={m.aantalVolwassenen}
                         onChange={e => updateMoment(m.id, { aantalVolwassenen: Number(e.target.value) || 0 })} />
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
          ))}
        </div>
      )}

      <button type="button" onClick={addMoment} className="btn-secondary text-sm">
        + Voeg moment toe
      </button>
    </div>
  );
}

/**
 * Helper: bereken op basis van schema hoeveel uren per week de accommodatie
 * actief is, totaal aantal douche-beurten per week, etc.
 */
export function analyseSchema(schema: TrainingsSchema): {
  urenPerWeek: number;
  doucheBeurtenPerWeek: number;
  totaalPersonenPerWeek: number;
} {
  let uren = 0;
  let douches = 0;
  let personen = 0;
  for (const m of schema) {
    const start = parseTime(m.startTijd);
    const eind = parseTime(m.eindTijd);
    const duur = Math.max(0, eind - start);
    uren += duur;
    const totaalPers = m.aantalKinderen + m.aantalVolwassenen;
    personen += totaalPers;
    if (m.metDouche) douches += totaalPers;
  }
  return {
    urenPerWeek: Math.round(uren * 10) / 10,
    doucheBeurtenPerWeek: douches,
    totaalPersonenPerWeek: personen,
  };
}

function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) + (m ?? 0) / 60;
}
