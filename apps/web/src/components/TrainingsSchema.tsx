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
  /** Optioneel — wordt gebruikt door de "vul standaard schema in"-knop. */
  typeVereniging?: string;
}

const DAG_LABELS: Record<TrainingMoment['dag'], string> = {
  maandag: 'Maandag', dinsdag: 'Dinsdag', woensdag: 'Woensdag', donderdag: 'Donderdag',
  vrijdag: 'Vrijdag', zaterdag: 'Zaterdag', zondag: 'Zondag',
};

const TYPE_INFO: Record<TrainingMoment['type'], { label: string; icoon: string; kleur: string }> = {
  training: { label: 'Training', icoon: '🏃', kleur: 'bg-blue-50 border-blue-200 text-blue-900' },
  wedstrijd: { label: 'Wedstrijd', icoon: '⚽', kleur: 'bg-orange-50 border-orange-200 text-orange-900' },
  sociaal: { label: 'Sociaal', icoon: '🍻', kleur: 'bg-gray-50 border-gray-200 text-gray-700' },
};

/**
 * Genereer een standaard-schema voor een sportclub o.b.v. clubtype en aantal leden.
 *
 * Aannames per sport zijn gebaseerd op de Nederlandse gemiddelde club-organisatie
 * (KNVB, KNHB, KNKV, etc.). Dit is bewust een vereenvoudigd "vertrek"-schema
 * dat de gebruiker daarna kan aanpassen — geen perfecte representatie van élke club.
 *
 * Het schema-model werkt het best voor team-sporten. Voor tennis/atletiek/zwemmen
 * geeft de UI een waarschuwing dat het model minder goed past.
 */
export function genereerStandaardSchema(
  typeVereniging: string,
  aantalLeden: number,
  pctJeugd: number, // 0-100
): { schema: TrainingsSchema; waarschuwing?: string } {
  const t = typeVereniging.toLowerCase();
  const ledenJeugd = Math.round((aantalLeden * pctJeugd) / 100);
  const ledenSenioren = aantalLeden - ledenJeugd;

  // Spelers per team per sport (KNVB-, KNHB-, KNKV-richtlijnen incl. wissels)
  const spelersPerTeamJeugd =
    t === 'rugby' ? 18 :
    t === 'korfbal' ? 10 :
    t === 'handbal' ? 12 :
    t === 'volleybal' ? 8 :
    10;
  const spelersPerTeamSenioren =
    t === 'rugby' ? 22 :
    t === 'korfbal' ? 11 :
    t === 'handbal' ? 14 :
    t === 'volleybal' ? 10 :
    15;

  const teamsJeugd = Math.max(0, Math.round(ledenJeugd / spelersPerTeamJeugd));
  const teamsSenioren = Math.max(0, Math.round(ledenSenioren / spelersPerTeamSenioren));

  // Waarschuwing voor sporten waar team-model minder relevant is
  let waarschuwing: string | undefined;
  if (t === 'tennis' || t === 'atletiek' || t === 'zwemmen') {
    waarschuwing = `Let op: voor ${typeVereniging} werkt het "teams op het veld"-model minder goed. Het ingevulde schema is een grove benadering — pas het zelf aan op basis van de werkelijke bezetting.`;
  }

  const mkId = (i: number) => `m-${Date.now()}-${i}-${Math.floor(Math.random() * 1000)}`;
  const schema: TrainingsSchema = [];

  // Standaard sport-week: trainingen di+do voor senioren, woe voor jeugd,
  // wedstrijd jeugd op zaterdag, senioren op zondag.
  // Per dag splitsen we de teams in 2 trainingsblokken om het realistisch te houden.

  // === Jeugd-training woensdag ===
  if (teamsJeugd > 0) {
    schema.push({
      id: mkId(1), dag: 'woensdag', startTijd: '17:00', eindTijd: '18:30',
      aantalTeamsOnder13: Math.ceil(teamsJeugd / 2),
      aantalTeamsVanaf13: 0,
      type: 'training',
    });
    if (teamsJeugd > 1) {
      schema.push({
        id: mkId(2), dag: 'woensdag', startTijd: '18:30', eindTijd: '20:00',
        aantalTeamsOnder13: Math.floor(teamsJeugd / 2),
        aantalTeamsVanaf13: 0,
        type: 'training',
      });
    }
  }

  // === Senioren-trainingen dinsdag + donderdag ===
  if (teamsSenioren > 0) {
    const halfSenioren = Math.ceil(teamsSenioren / 2);
    schema.push({
      id: mkId(3), dag: 'dinsdag', startTijd: '19:30', eindTijd: '21:00',
      aantalTeamsOnder13: 0,
      aantalTeamsVanaf13: halfSenioren,
      type: 'training',
    });
    if (teamsSenioren > 1) {
      schema.push({
        id: mkId(4), dag: 'donderdag', startTijd: '19:30', eindTijd: '21:00',
        aantalTeamsOnder13: 0,
        aantalTeamsVanaf13: teamsSenioren - halfSenioren,
        type: 'training',
      });
    }
  }

  // === Jeugd-wedstrijd zaterdag (typisch ochtend) ===
  if (teamsJeugd > 0) {
    schema.push({
      id: mkId(5), dag: 'zaterdag', startTijd: '09:00', eindTijd: '12:30',
      aantalTeamsOnder13: teamsJeugd,
      aantalTeamsVanaf13: 0,
      type: 'wedstrijd',
    });
  }

  // === Senioren-wedstrijd zondag ===
  if (teamsSenioren > 0) {
    schema.push({
      id: mkId(6), dag: 'zondag', startTijd: '11:00', eindTijd: '16:00',
      aantalTeamsOnder13: 0,
      aantalTeamsVanaf13: teamsSenioren,
      type: 'wedstrijd',
    });
  }

  return { schema, waarschuwing };
}

export function TrainingsSchemaInvoer({ schema, onChange, typeVereniging }: Props) {
  const [valsspeelOpen, setValsspeelOpen] = useState(false);
  const [vsAantalLeden, setVsAantalLeden] = useState<number>(150);
  const [vsPctJeugd, setVsPctJeugd] = useState<number>(40);
  const [vsWaarschuwing, setVsWaarschuwing] = useState<string | null>(null);

  function valsspeelToepassen() {
    const tv = typeVereniging || 'voetbal';
    const { schema: nieuwSchema, waarschuwing } = genereerStandaardSchema(tv, vsAantalLeden, vsPctJeugd);
    if (schema.length > 0) {
      if (!confirm('Het huidige schema wordt overschreven met een standaard schema. Doorgaan?')) return;
    }
    onChange(nieuwSchema);
    setVsWaarschuwing(waarschuwing ?? null);
    setValsspeelOpen(false);
  }

  function addMomentOpDag(dag: TrainingMoment['dag']) {
    const nieuw: TrainingMoment = {
      id: 'm-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      dag,
      startTijd: '19:00',
      eindTijd: '21:00',
      aantalTeamsOnder13: 0,
      aantalTeamsVanaf13: 1,
      type: 'training',
    };
    onChange([...schema, nieuw]);
  }

  function updateMoment(id: string, patch: Partial<TrainingMoment>) {
    onChange(schema.map(m => m.id === id ? { ...m, ...patch } : m));
  }

  function removeMoment(id: string) {
    onChange(schema.filter(m => m.id !== id));
  }

  function dupliceer(m: TrainingMoment) {
    // Maak een kopie en plaats op de VOLGENDE dag (handig voor herhalende schema's)
    const huidigeIdx = DAGEN.indexOf(m.dag);
    const volgendeDag = DAGEN[(huidigeIdx + 1) % 7];
    const kopie: TrainingMoment = {
      ...m,
      id: 'm-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      dag: volgendeDag,
    };
    onChange([...schema, kopie]);
  }

  // Groepeer per dag, sorteer per dag op starttijd
  const perDag = DAGEN.reduce((acc, dag) => {
    acc[dag] = schema
      .filter(m => m.dag === dag)
      .sort((a, b) => a.startTijd.localeCompare(b.startTijd));
    return acc;
  }, {} as Record<TrainingMoment['dag'], TrainingMoment[]>);

  const totaal = analyseSchema(schema);

  return (
    <div className="space-y-3">
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

      {/* === Valsspeel-knop: standaard schema op basis van clubgrootte === */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg overflow-hidden">
        {!valsspeelOpen ? (
          <button
            type="button"
            onClick={() => setValsspeelOpen(true)}
            className="w-full px-3 py-2 flex items-center justify-between text-sm hover:bg-amber-100/50 text-left"
          >
            <span className="text-amber-900">
              <span className="text-base">🎲</span> Vul standaard schema in op basis van clubgrootte
            </span>
            <span className="text-xs text-amber-700">Tijdwinst — gebaseerd op NL-gemiddelden</span>
          </button>
        ) : (
          <div className="p-3 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-sm font-semibold text-amber-900">🎲 Standaard schema genereren</h4>
                <p className="text-xs text-amber-800 mt-0.5">
                  Op basis van clubtype{typeVereniging ? <> (<strong>{typeVereniging}</strong>)</> : ' (default: voetbal)'},
                  aantal leden en %-jeugd vullen we een gemiddeld NL-sportclub-schema in.
                  Pas daarna alles aan waar nodig.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setValsspeelOpen(false)}
                className="text-xs text-amber-700 hover:text-amber-900 px-1.5 py-0.5"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs">
                <span className="block text-gray-700 mb-1">Aantal spelende leden</span>
                <input
                  type="number"
                  min={1}
                  value={vsAantalLeden}
                  onChange={e => setVsAantalLeden(Math.max(1, Number(e.target.value) || 0))}
                  className="input py-1 text-sm w-full"
                />
                <span className="block text-[10px] text-gray-500 mt-0.5">
                  Alleen actieve leden die ook trainen/spelen (excl. steunende leden)
                </span>
              </label>
              <label className="text-xs">
                <span className="block text-gray-700 mb-1">Aandeel jeugd: <strong>{vsPctJeugd}%</strong></span>
                <input
                  type="range"
                  min={0} max={100} step={5}
                  value={vsPctJeugd}
                  onChange={e => setVsPctJeugd(Number(e.target.value))}
                  className="w-full"
                />
                <span className="block text-[10px] text-gray-500 mt-0.5">
                  NL-gemiddelde voetbal/hockey ≈ 40-50% jeugd
                </span>
              </label>
            </div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[11px] text-amber-800">
                💡 Bestaande momenten worden overschreven (na bevestiging)
              </span>
              <button
                type="button"
                onClick={valsspeelToepassen}
                className="text-sm bg-accent-orange text-white px-3 py-1.5 rounded hover:bg-accent-orange/90"
              >
                Vul in →
              </button>
            </div>
          </div>
        )}
      </div>

      {vsWaarschuwing && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-md p-3 text-xs text-yellow-900 flex items-start gap-2">
          <span>⚠️</span>
          <div className="flex-1">
            {vsWaarschuwing}
            <button onClick={() => setVsWaarschuwing(null)} className="ml-2 underline">sluiten</button>
          </div>
        </div>
      )}

      {/* Week-overzicht: per dag een sectie, altijd zichtbaar in vaste volgorde */}
      <div className="space-y-2">
        {DAGEN.map(dag => {
          const momenten = perDag[dag];
          const isWeekend = dag === 'zaterdag' || dag === 'zondag';
          return (
            <div key={dag} className={`border rounded-lg ${isWeekend ? 'border-primary-200 bg-primary-50/30' : 'border-gray-200 bg-white'}`}>
              {/* Dag-header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                <h4 className={`text-sm font-semibold ${isWeekend ? 'text-primary-900' : 'text-gray-800'}`}>
                  {DAG_LABELS[dag]}
                  {momenten.length === 0 && (
                    <span className="ml-2 text-xs font-normal text-gray-400">— geen activiteiten</span>
                  )}
                  {momenten.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-gray-500">
                      ({momenten.length} {momenten.length === 1 ? 'moment' : 'momenten'})
                    </span>
                  )}
                </h4>
                <button
                  type="button"
                  onClick={() => addMomentOpDag(dag)}
                  className="text-xs text-primary-700 hover:bg-primary-100 px-2 py-1 rounded font-medium"
                  title={`Voeg een activiteit toe op ${DAG_LABELS[dag]}`}
                >
                  + Toevoegen
                </button>
              </div>

              {/* Momenten op deze dag */}
              {momenten.length > 0 && (
                <div className="divide-y divide-gray-100">
                  {momenten.map(m => {
                    const pctO13 = Math.round(douchePercentage('onder13', m.type, m.dag) * 100);
                    const pctV13 = Math.round(douchePercentage('vanaf13', m.type, m.dag) * 100);
                    const typeInfo = TYPE_INFO[m.type];
                    return (
                      <div key={m.id} className="px-3 py-2.5 space-y-2 hover:bg-gray-50/50">
                        {/* Bovenste rij: type-badge, tijd, prullenbak */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${typeInfo.kleur} font-medium inline-flex items-center gap-1`}>
                            <span>{typeInfo.icoon}</span>
                            <select
                              className="bg-transparent border-0 outline-none p-0 text-xs font-medium cursor-pointer"
                              value={m.type}
                              onChange={e => updateMoment(m.id, { type: e.target.value as TrainingMoment['type'] })}
                            >
                              <option value="training">Training</option>
                              <option value="wedstrijd">Wedstrijd</option>
                              <option value="sociaal">Sociaal</option>
                            </select>
                          </span>
                          <input
                            type="time"
                            className="input py-1 text-xs w-24"
                            value={m.startTijd}
                            onChange={e => updateMoment(m.id, { startTijd: e.target.value })}
                          />
                          <span className="text-gray-400 text-xs">—</span>
                          <input
                            type="time"
                            className="input py-1 text-xs w-24"
                            value={m.eindTijd}
                            onChange={e => updateMoment(m.id, { eindTijd: e.target.value })}
                          />
                          <div className="flex-1" />
                          <button
                            type="button"
                            onClick={() => dupliceer(m)}
                            className="text-xs text-gray-500 hover:text-primary-700 px-2 py-0.5"
                            title={`Kopieer naar ${DAG_LABELS[DAGEN[(DAGEN.indexOf(m.dag) + 1) % 7]]}`}
                          >
                            ⎘ Kopieer
                          </button>
                          <button
                            type="button"
                            onClick={() => removeMoment(m.id)}
                            className="text-xs text-red-600 hover:text-red-800 px-1.5 py-0.5"
                            title="Verwijder"
                          >
                            ✕
                          </button>
                        </div>
                        {/* Onderste rij: teams (alleen tonen als niet 'sociaal' want dan niemand doucht) */}
                        {m.type !== 'sociaal' ? (
                          <div className="grid grid-cols-2 gap-2 pl-1">
                            <label className="flex items-center gap-2 text-xs text-gray-700">
                              <span className="min-w-0 flex-1">
                                Teams &lt;13 jr
                                <span className="block text-gray-400">{pctO13}% doucht</span>
                              </span>
                              <input
                                type="number"
                                min={0}
                                className="input py-1 text-sm w-16"
                                value={m.aantalTeamsOnder13}
                                onChange={e => updateMoment(m.id, { aantalTeamsOnder13: Number(e.target.value) || 0 })}
                              />
                            </label>
                            <label className="flex items-center gap-2 text-xs text-gray-700">
                              <span className="min-w-0 flex-1">
                                Teams ≥13 jr
                                <span className="block text-gray-400">{pctV13}% doucht</span>
                              </span>
                              <input
                                type="number"
                                min={0}
                                className="input py-1 text-sm w-16"
                                value={m.aantalTeamsVanaf13}
                                onChange={e => updateMoment(m.id, { aantalTeamsVanaf13: Number(e.target.value) || 0 })}
                              />
                            </label>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500 italic pl-1">Geen douche-vraag voor sociale momenten</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Live totalen */}
      {totaal.totaalDoucheBeurtenPerWeek > 0 && (
        <div className="bg-primary-50/60 border border-primary-200 rounded-md p-3 text-xs text-primary-900 mt-3">
          <strong>Per week totaal:</strong> {totaal.totaalDoucheBeurtenPerWeek} douche-beurten ·
          {' '}{Math.round(totaal.totaalLitersPerWeek).toLocaleString('nl-NL')} liter warm water ·
          {' '}{totaal.urenPerWeek} uur gebruik
        </div>
      )}

      {/* Snel-acties als helemaal leeg */}
      {schema.length === 0 && (
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-md p-3 text-xs text-gray-600">
          <strong>Snel beginnen?</strong> Klik op <em>+ Toevoegen</em> bij een dag waarop er training is.
          De meeste sportclubs hebben training op dinsdag, woensdag en donderdag, en wedstrijden op zaterdag.
        </div>
      )}
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
