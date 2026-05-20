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
import { MODULE_REGISTRY, defaultContext, type RegistryKey, type ProjectContext } from '@sportief-opgewekt/calc-core';
import { scoreAlleMaatregelen, type AanbevelingContext } from '../util/aanbeveling-engine';
import type { HuidigeSituatieData } from '../data/huidige-situatie';

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
    gasprijsPerM3?: number;
    stroomprijsKaalPerKwh?: number;
  };
  huidigeSituatie: HuidigeSituatieData;
  gekozenIds: string[];
  onToggle: (id: string, defaultInput: unknown) => void;
}

/**
 * Bouwt een lichte preview (€ investering / € besparing per jaar) voor een maatregel
 * door calc-core direct aan te roepen met default input. Returnt null bij errors.
 */
function maatregelPreview(maatregelId: string, ctx: MaatregelSuggestiesProps['context']): { investering: number; besparingPerJaar: number; tvt: number } | null {
  if (!(maatregelId in MODULE_REGISTRY)) return null;
  try {
    // Bouw minimaal-werkende context
    const base = defaultContext();
    const merged: ProjectContext = {
      ...base,
      gebouw: { ...base.gebouw, bouwjaar: ctx.bouwjaar ?? base.gebouw.bouwjaar, bvoTotaalM2: ctx.bvoM2 ?? base.gebouw.bvoTotaalM2 },
      energie: {
        ...base.energie,
        gasverbruikM3: ctx.gasverbruikM3 ?? base.energie.gasverbruikM3,
        stroomverbruikTotaalKwh: ctx.stroomverbruikKwh ?? base.energie.stroomverbruikTotaalKwh,
        gasprijsPerM3: ctx.gasprijsPerM3 ?? base.energie.gasprijsPerM3,
        stroomprijsKaalPerKwh: ctx.stroomprijsKaalPerKwh ?? base.energie.stroomprijsKaalPerKwh,
      },
    };
    const mod = MODULE_REGISTRY[maatregelId as RegistryKey];
    const input = mod.defaultInput(merged) as never;
    const r = mod.bereken(input, merged);
    return {
      investering: r.brutoInvestering ?? 0,
      besparingPerJaar: r.besparingPerJaar ?? 0,
      tvt: r.terugverdientijdJaren ?? Infinity,
    };
  } catch {
    return null;
  }
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

  const previews = useMemo(() => {
    const out: Record<string, ReturnType<typeof maatregelPreview>> = {};
    for (const s of scores) {
      out[s.maatregelId] = maatregelPreview(s.maatregelId, context);
    }
    return out;
  }, [scores, context]);

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
          previews={previews}
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
          previews={previews}
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
          previews={previews}
          onToggle={onToggle}
        />
      )}
    </div>
  );
}

function Groep({
  titel, ondertitel, kleur, maatregelen, modules, gekozenIds, previews, onToggle,
}: {
  titel: string;
  ondertitel: string;
  kleur: 'primary' | 'orange' | 'gray';
  maatregelen: ReturnType<typeof scoreAlleMaatregelen>;
  modules: ModulesInfo;
  gekozenIds: string[];
  previews: Record<string, { investering: number; besparingPerJaar: number; tvt: number } | null>;
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
                    {previews[score.maatregelId] && (
                      <p className="text-xs text-primary-700 mt-1 font-medium">
                        ≈ € {formatEur(previews[score.maatregelId]!.investering)} investering ·
                        {' '}€ {formatEur(previews[score.maatregelId]!.besparingPerJaar)} /jaar besparing
                        {Number.isFinite(previews[score.maatregelId]!.tvt) && previews[score.maatregelId]!.tvt < 100
                          ? ` · TVT ${previews[score.maatregelId]!.tvt.toFixed(1)} jr`
                          : ''}
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

function formatEur(n: number): string {
  return Math.round(n).toLocaleString('nl-NL');
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
