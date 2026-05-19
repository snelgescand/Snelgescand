/**
 * Toont maatregelen gesorteerd op aanbevelings-score, met uitleg per maatregel
 * waarom hij hoog of laag scoort.
 *
 * Categorieën:
 *  - 🟢 Sterk aanbevolen (score 70-100)
 *  - 🟡 Overweeg (score 40-69)
 *  - ⚪ Lage prioriteit (score 0-39)
 */

import { useMemo } from 'react';
import { scoreAlleMaatregelen, type AanbevelingContext } from '../util/aanbeveling-engine';
import type { ChecklistAntwoorden } from '../data/checklist';

export interface ModulesInfo {
  modules: Array<{ id: string; naam: string; defaultInput: unknown }>;
  groepen: Record<string, readonly string[]>;
}

interface MaatregelSuggestiesProps {
  beschikbareModules: ModulesInfo;
  context: {
    bouwjaar?: number;
    bvoM2?: number;
    gasverbruikM3?: number;
    stroomverbruikKwh?: number;
  };
  huidigeSituatie: ChecklistAntwoorden;
  gekozenIds: string[];
  onToggle: (id: string, defaultInput: unknown) => void;
}

export function MaatregelSuggesties({
  beschikbareModules,
  context,
  huidigeSituatie,
  gekozenIds,
  onToggle,
}: MaatregelSuggestiesProps) {
  const scores = useMemo(() => {
    const ctx: AanbevelingContext = { ...context, huidigeSituatie };
    const alleIds = beschikbareModules.modules.map(m => m.id);
    return scoreAlleMaatregelen(alleIds, ctx).sort((a, b) => b.score - a.score);
  }, [beschikbareModules, context, huidigeSituatie]);

  const sterk = scores.filter(s => s.categorie === 'sterk');
  const middel = scores.filter(s => s.categorie === 'middel');
  const laag = scores.filter(s => s.categorie === 'laag');

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600">
        Hieronder de voorgestelde maatregelen, gesorteerd op hoe interessant ze zijn voor déze specifieke
        situatie — gebaseerd op bouwjaar, energieverbruik en wat je hebt aangevinkt in
        <strong> Stap 1 — Huidige situatie</strong>.
      </p>

      {sterk.length > 0 && (
        <Groep
          titel="Sterk aanbevolen"
          ondertitel={`${sterk.length} maatregelen met hoge impact voor deze locatie`}
          kleur="primary"
          maatregelen={sterk}
          modules={beschikbareModules}
          gekozenIds={gekozenIds}
          onToggle={onToggle}
        />
      )}

      {middel.length > 0 && (
        <Groep
          titel="Overweeg"
          ondertitel={`${middel.length} maatregelen die zinvol kunnen zijn`}
          kleur="orange"
          maatregelen={middel}
          modules={beschikbareModules}
          gekozenIds={gekozenIds}
          onToggle={onToggle}
        />
      )}

      {laag.length > 0 && (
        <Groep
          titel="Lage prioriteit"
          ondertitel={`${laag.length} maatregelen die voor deze situatie minder relevant zijn`}
          kleur="gray"
          maatregelen={laag}
          modules={beschikbareModules}
          gekozenIds={gekozenIds}
          onToggle={onToggle}
        />
      )}
    </div>
  );
}

function Groep({
  titel, ondertitel, kleur, maatregelen, modules, gekozenIds, onToggle,
}: {
  titel: string;
  ondertitel: string;
  kleur: 'primary' | 'orange' | 'gray';
  maatregelen: ReturnType<typeof scoreAlleMaatregelen>;
  modules: ModulesInfo;
  gekozenIds: string[];
  onToggle: (id: string, defaultInput: unknown) => void;
}) {
  const styles = {
    primary: { rand: 'border-primary-300', dot: 'bg-primary-500', label: 'text-primary-900' },
    orange:  { rand: 'border-accent-orange/40', dot: 'bg-accent-orange', label: 'text-accent-orange-dark' },
    gray:    { rand: 'border-gray-200', dot: 'bg-gray-400', label: 'text-gray-700' },
  }[kleur];

  return (
    <div className={`border-l-4 ${styles.rand} pl-3`}>
      <div className="flex items-baseline gap-2 mb-3">
        <span className={`w-2 h-2 rounded-full ${styles.dot}`} />
        <h3 className={`text-base font-semibold ${styles.label}`}>{titel}</h3>
        <span className="text-xs text-gray-500">— {ondertitel}</span>
      </div>
      <div className="space-y-2">
        {maatregelen.map(score => {
          const mod = modules.modules.find(m => m.id === score.maatregelId);
          if (!mod) return null;
          const gekozen = gekozenIds.includes(score.maatregelId);
          return (
            <div
              key={score.maatregelId}
              className={`rounded-lg border p-3 transition-colors ${
                gekozen ? 'border-primary-400 bg-primary-50/40' : 'border-gray-200 bg-white hover:border-primary-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <label className="flex-1 flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={gekozen}
                    onChange={() => onToggle(score.maatregelId, mod.defaultInput)}
                    className="mt-1 rounded text-primary-600 focus:ring-primary-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">{mod.naam}</span>
                      <ScoreBadge score={score.score} />
                    </div>
                    {score.redenen.length > 0 && (
                      <p className="text-xs text-gray-600 mt-1">
                        {score.redenen.slice(0, 3).join(' · ')}
                      </p>
                    )}
                  </div>
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const klas = score >= 70 ? 'bg-primary-100 text-primary-700'
    : score >= 40 ? 'bg-orange-100 text-accent-orange-dark'
    : 'bg-gray-100 text-gray-500';
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${klas}`}>
      score {score}
    </span>
  );
}
