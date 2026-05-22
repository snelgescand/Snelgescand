/**
 * Toont maatregelen gegroepeerd per CATEGORIE (warm water / ruimteverwarming / schil / opwekking / verbruik / water),
 * met per categorie een slimme suggestie op basis van scan-data uit stap 1.
 *
 * Binnen elke categorie zijn de maatregelen verder gesorteerd op aanbevelings-score.
 */

import { useMemo } from 'react';
import { MODULE_REGISTRY, defaultContext, type RegistryKey, type ProjectContext } from '@sportief-opgewekt/calc-core';
import { scoreAlleMaatregelen, type AanbevelingContext } from '../util/aanbeveling-engine';
import type { HuidigeSituatieData } from '../data/huidige-situatie';
import { CATEGORIEEN, MAATREGEL_CATEGORIE, bouwSuggestie, type Categorie, type ScanContext } from '../data/maatregel-categorieen';

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
    /** Berekend uit trainingsschema: douches per week */
    douchesPerWeek?: number;
    /** Berekend: gas voor douches/jaar */
    gasDouchePerJaar?: number;
    /** Aantal douchekoppen uit stap 1 */
    aantalDouchekoppen?: number;
  };
  huidigeSituatie: HuidigeSituatieData;
  gekozenIds: string[];
  gekozenInputs?: Record<string, Record<string, unknown>>;
  onToggle: (id: string, defaultInput: unknown) => void;
  /** Opent een modal-dialog met de detail-form voor deze maatregel */
  onOpenDetail?: (id: string) => void;
}

function maatregelPreview(maatregelId: string, ctx: MaatregelSuggestiesProps['context']): { investering: number; besparingPerJaar: number; tvt: number } | null {
  if (!(maatregelId in MODULE_REGISTRY)) return null;
  try {
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

/** Bereken schil-score (0-100) uit de huidigeSituatie data */
function berekenSchilScore(hs: HuidigeSituatieData): number {
  const items: Array<{ key: string; score?: number }> = [
    { key: 'dakisolatie', score: scoreVan(hs, 'gebouwschil', 'dakisolatie') },
    { key: 'gevelisolatie', score: scoreVan(hs, 'gebouwschil', 'gevelisolatie') },
    { key: 'vloerisolatie', score: scoreVan(hs, 'gebouwschil', 'vloerisolatie') },
    { key: 'glas', score: scoreVan(hs, 'gebouwschil', 'glas') },
  ];
  const valid = items.filter(i => i.score !== undefined).map(i => i.score!);
  if (valid.length === 0) return 50;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}

function scoreVan(hs: HuidigeSituatieData, sectie: string, item: string): number | undefined {
  // hs is genest object zoals { gebouwschil: { dakisolatie: { keuze: 'matig' } } }
  // We hebben de OPTIE-score nodig, niet de tekstwaarde
  // Voor nu: simpele heuristiek o.b.v. keuze-tekst
  const keuze = (hs as Record<string, Record<string, { keuze?: string }>>)[sectie]?.[item]?.keuze;
  if (!keuze) return undefined;
  const mapping: Record<string, number> = {
    geen: 0, 'geen-spouw': 0, enkel: 0,
    beperkt: 20, 'spouw-leeg': 15, 'enkel-mix': 20,
    matig: 45, dubbel: 40, 'spouw-gevuld': 65,
    modern: 75, hr: 60, 'na-isolatie': 80,
    goed: 95, 'hr-pp': 85, 'modern-bouw': 90, triple: 100,
    'geen-kruipruimte': 60,
    onbekend: 50,
  };
  return mapping[keuze] ?? 50;
}

export function MaatregelSuggesties({
  beschikbareModules,
  context,
  huidigeSituatie,
  gekozenIds,
  onToggle,
  onOpenDetail,
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

  // Groepeer scores per categorie
  const scoresPerCategorie = useMemo(() => {
    const out: Record<Categorie, typeof scores> = {
      tapwater: [], ruimteverwarming: [], schil: [], opwekking: [], verbruik: [], water: [], overig: [],
    };
    for (const s of scores) {
      const cat = MAATREGEL_CATEGORIE[s.maatregelId] ?? 'overig';
      out[cat].push(s);
    }
    return out;
  }, [scores]);

  // Slimme suggestie-context bouwen vanuit stap-1 data
  const scanContext: ScanContext = useMemo(() => ({
    bvoM2: context.bvoM2,
    bouwjaar: context.bouwjaar,
    gasM3PerJaar: context.gasverbruikM3,
    elektriciteitKwhPerJaar: context.stroomverbruikKwh,
    aantalDouchekoppen: context.aantalDouchekoppen,
    douchesPerWeek: context.douchesPerWeek,
    gasDouchePerJaar: context.gasDouchePerJaar,
    schilScore: berekenSchilScore(huidigeSituatie),
  }), [context, huidigeSituatie]);

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600">
        Maatregelen gegroepeerd per <strong>onderwerp</strong>. Per categorie staat hierboven een slimme suggestie
        op basis van jouw gegevens uit stap 1.
      </p>

      {CATEGORIEEN.sort((a, b) => a.volgorde - b.volgorde).map(cat => {
        const items = scoresPerCategorie[cat.id];
        if (!items || items.length === 0) return null;
        const suggestie = bouwSuggestie(cat.id, scanContext);

        return (
          <CategorieBlok
            key={cat.id}
            categorie={cat}
            suggestie={suggestie}
            maatregelen={items}
            modules={beschikbareModules}
            gekozenIds={gekozenIds}
            previews={previews}
            onToggle={onToggle}
            onOpenDetail={onOpenDetail}
          />
        );
      })}
    </div>
  );
}

function CategorieBlok({
  categorie, suggestie, maatregelen, modules, gekozenIds, previews, onToggle, onOpenDetail,
}: {
  categorie: typeof CATEGORIEEN[number];
  suggestie: ReturnType<typeof bouwSuggestie>;
  maatregelen: ReturnType<typeof scoreAlleMaatregelen>;
  modules: ModulesInfo;
  gekozenIds: string[];
  previews: Record<string, ReturnType<typeof maatregelPreview>>;
  onToggle: (id: string, defaultInput: unknown) => void;
  onOpenDetail?: (id: string) => void;
}) {
  return (
    <section className="border border-primary-100 rounded-xl overflow-hidden bg-white">
      {/* Categorie-header */}
      <div className="bg-primary-50/50 px-5 py-3 border-b border-primary-100">
        <h2 className="text-base font-bold text-primary-900 flex items-center gap-2">
          <span className="text-xl">{categorie.icoon}</span>
          {categorie.titel}
        </h2>
        <p className="text-xs text-gray-600 mt-0.5">{categorie.omschrijving}</p>
      </div>

      {/* Slimme suggestie-vakje */}
      {suggestie && (
        <div className="bg-accent-orange/5 border-b border-accent-orange/20 px-5 py-4">
          <div className="flex items-start gap-2">
            <span className="text-base">💡</span>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">
                {suggestie.korteSamenvatting}
              </h3>
              <p className="text-xs text-gray-700 leading-relaxed">{suggestie.uitleg}</p>

              {/* Context-cijfers uit stap 1 */}
              {suggestie.context.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  {suggestie.context.map((c, i) => (
                    <span key={i} className="text-xs text-gray-600">
                      <span className="text-gray-500">{c.label}:</span>{' '}
                      <span className="font-medium text-gray-900">{c.waarde}</span>
                    </span>
                  ))}
                </div>
              )}

              {/* Vergelijking van varianten */}
              {suggestie.vergelijking && suggestie.vergelijking.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium text-primary-700 hover:underline">
                    Vergelijk varianten ({suggestie.vergelijking.length})
                  </summary>
                  <div className="mt-2 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {suggestie.vergelijking.map((v, i) => (
                      <div key={i} className="bg-white border border-gray-200 rounded-md p-2 text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-medium text-gray-900">{v.titel}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            v.type === 'beide' ? 'bg-primary-100 text-primary-700' :
                            v.type === 'tapwater' ? 'bg-blue-100 text-blue-700' :
                            'bg-orange-100 text-orange-700'
                          }`}>
                            {v.type === 'beide' ? 'tap + CV' : v.type === 'tapwater' ? 'tapwater' : 'CV'}
                          </span>
                        </div>
                        <ul className="space-y-0.5 mb-1">
                          {v.voordelen.map((vp, j) => (
                            <li key={j} className="text-gray-700">✓ {vp}</li>
                          ))}
                        </ul>
                        <ul className="space-y-0.5 mb-1">
                          {v.nadelen.map((nd, j) => (
                            <li key={j} className="text-gray-500">✗ {nd}</li>
                          ))}
                        </ul>
                        <p className="text-gray-500 italic mt-1">→ {v.gechiktVoor}</p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Maatregelen-lijst */}
      <div className="divide-y divide-gray-100">
        {maatregelen.map(score => {
          const mod = modules.modules.find(m => m.id === score.maatregelId);
          if (!mod) return null;
          const gekozen = gekozenIds.includes(score.maatregelId);
          const preview = previews[score.maatregelId];
          const aanbevolen = suggestie?.aanbevolen?.includes(score.maatregelId) ?? false;

          return (
            <div key={score.maatregelId} className="px-5 py-3 hover:bg-gray-50/50 transition-colors">
              <div className="flex items-start gap-3">
                <label className="flex-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={gekozen}
                    onChange={() => onToggle(score.maatregelId, mod.defaultInput)}
                    className="mr-2 align-middle"
                  />
                  <span className="font-medium text-gray-900">{mod.naam}</span>
                  {aanbevolen && (
                    <span className="ml-2 text-[10px] bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded-full">
                      ⭐ aanbevolen
                    </span>
                  )}
                  {score.redenen[0] && (
                    <p className="text-xs text-gray-500 mt-0.5 ml-6">{score.redenen[0]}</p>
                  )}
                  {preview && preview.tvt !== Infinity && (
                    <p className="text-xs text-gray-600 mt-1 ml-6">
                      Indicatief: <strong>€ {preview.investering.toLocaleString('nl-NL')}</strong> investering
                      {' · '}<strong>€ {preview.besparingPerJaar.toLocaleString('nl-NL')}/jaar</strong> besparing
                      {' · TVT '}<strong>{preview.tvt.toFixed(1)} jaar</strong>
                    </p>
                  )}
                </label>
                {gekozen && onOpenDetail && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpenDetail(score.maatregelId); }}
                    className="shrink-0 px-3 py-1.5 text-xs text-primary-700 hover:bg-primary-100 rounded-md border border-primary-200 whitespace-nowrap font-medium"
                    title="Aannames voor deze maatregel aanpassen"
                  >
                    ✏️ Aanpassen
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

