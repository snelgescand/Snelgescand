/**
 * Client-side berekening — draait calc-core direct in de browser.
 *
 * Voorheen ging dit via de backend. Maar dat maakte de bereken-functie
 * afhankelijk van een correct gedeployde backend (incl. de defensieve
 * fix voor aansluitwaardeElektra). Door client-side te rekenen is de
 * berekening altijd in sync met de laatste calc-core versie die in de
 * frontend bundle zit.
 *
 * De backend krijgt het resultaat in PUT /api/projects/:id (in state)
 * en de PPT-route kan deze gebruiken zonder zelf opnieuw te rekenen.
 */

import {
  MODULE_REGISTRY,
  rollupProject,
  defaultContext,
  pasDumavaRegimeToe,
  type MaatregelResultaat,
  type ProjectContext,
  type RegistryKey,
  type ProjectResultaat,
} from '@sportief-opgewekt/calc-core';

export interface BerekendProject {
  perMaatregel: Partial<Record<RegistryKey, MaatregelResultaat>>;
  rollup: ProjectResultaat;
  overgeslagen: Array<{ id: string; reden: string }>;
}

export class BerekenValidatieFout extends Error {
  constructor(public ontbrekendeVelden: string[]) {
    super(`Vul eerst alle vereiste velden in: ${ontbrekendeVelden.join(', ')}`);
  }
}

interface ProjectState {
  context?: Partial<ProjectContext>;
  gekozenMaatregelen?: Record<string, unknown>;
  /** Voor DUMAVA-regime: huidig label, verwacht label na, renovatiestandaard */
  energielabel?: { huidig?: string; verwachtNa?: string; renovatiestandaard?: boolean };
  /** Voor DUMAVA: kleine/grote onderneming */
  organisatie?: { grooteOnderneming?: boolean };
}

export function berekenLokaal(rawState: unknown): BerekendProject {
  const state: ProjectState = (typeof rawState === 'object' && rawState !== null)
    ? rawState as ProjectState
    : {};

  // === Validatie ===
  const energie = (state.context?.energie ?? {}) as Record<string, unknown>;
  const ontbreken: string[] = [];
  if (!isPositief(energie.gasverbruikM3)) ontbreken.push('gasverbruik per jaar');
  if (!isPositief(energie.stroomverbruikTotaalKwh)) ontbreken.push('stroomverbruik per jaar');
  if (!isPositief(energie.gasprijsPerM3)) ontbreken.push('gasprijs');
  if (!isPositief(energie.stroomprijsKaalPerKwh)) ontbreken.push('stroomprijs');
  if (ontbreken.length > 0) throw new BerekenValidatieFout(ontbreken);

  // === Rock-solid context ===
  const baseCtx = defaultContext();
  const userCtx = (state.context ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const userEnergie = userCtx.energie ?? {};
  const userAansl = (userEnergie.aansluitwaardeElektra ?? {}) as Record<string, unknown>;

  const context: ProjectContext = {
    club: { ...baseCtx.club, ...(userCtx.club ?? {}) } as ProjectContext['club'],
    gebouw: { ...baseCtx.gebouw, ...(userCtx.gebouw ?? {}) } as ProjectContext['gebouw'],
    energie: {
      ...baseCtx.energie,
      ...userEnergie,
      aansluitwaardeElektra: {
        fase: (userAansl.fase as 1 | 3) ?? baseCtx.energie.aansluitwaardeElektra.fase,
        ampere: (userAansl.ampere as number) ?? baseCtx.energie.aansluitwaardeElektra.ampere,
        vermogenKw: (userAansl.vermogenKw as number) ?? baseCtx.energie.aansluitwaardeElektra.vermogenKw,
      },
    } as ProjectContext['energie'],
    defaultSubsidiePercentages: baseCtx.defaultSubsidiePercentages,
    energielabel: state.energielabel,
    organisatie: state.organisatie,
  };

  // === Maatregelen ===
  const resultaten: Partial<Record<RegistryKey, MaatregelResultaat>> = {};
  const overgeslagen: Array<{ id: string; reden: string }> = [];
  const gekozen = state.gekozenMaatregelen ?? {};

  for (const [maatregelId, input] of Object.entries(gekozen)) {
    if (!(maatregelId in MODULE_REGISTRY)) {
      overgeslagen.push({ id: maatregelId, reden: 'Onbekende maatregel' });
      continue;
    }
    const module = MODULE_REGISTRY[maatregelId as RegistryKey];
    const defaults = module.defaultInput(context) as unknown as Record<string, unknown>;
    const userInput = (input && typeof input === 'object') ? input as Record<string, unknown> : {};
    const samengevoegd = { ...defaults, ...userInput } as Record<string, unknown>;

    for (const k of Object.keys(samengevoegd)) {
      const v = samengevoegd[k];
      if (v === undefined || v === null || v === '') {
        samengevoegd[k] = defaults[k];
      }
    }

    try {
      const resultaat = module.bereken(samengevoegd as never, context);
      resultaten[maatregelId as RegistryKey] = resultaat;
    } catch (err) {
      overgeslagen.push({ id: maatregelId, reden: err instanceof Error ? err.message : String(err) });
    }
  }

  // === DUMAVA-regime project-breed toepassen (RVO 2025 regels) ===
  // Past per maatregel de DUMAVA-rij aan: verwijdert, of zet naar 30%/40%
  // afhankelijk van aantal maatregelen + labelsprong + eindlabel + onderneming.
  // Werkt identiek aan backend bereken.service.ts dankzij gedeelde helper.
  pasDumavaRegimeToe(resultaten as Record<string, MaatregelResultaat | undefined>, context);

  // === Rollup met try/catch fallback ===
  // Batterij-vermogen verzamelen om door te geven aan de aansluitwaarde-check.
  const batterijEenvInput = gekozen['batterij-eenvoudig'] as { vermogenKw?: number } | undefined;
  const batterijUitgInput = gekozen['batterij-uitgebreid'] as { vermogenKw?: number } | undefined;
  const batterijVermogenKw = Math.max(
    batterijEenvInput?.vermogenKw ?? 0,
    batterijUitgInput?.vermogenKw ?? 0,
  );

  let rollup: ProjectResultaat;
  try {
    rollup = rollupProject({ context, resultaten, batterijVermogenKw });
  } catch (err) {
    const totaalInv = Object.values(resultaten).reduce((s, r) => s + (r?.brutoInvestering ?? 0), 0);
    const totaalSub = Object.values(resultaten).reduce((s, r) => s + (r?.totaleSubsidie ?? 0), 0);
    const totaalBesp = Object.values(resultaten).reduce((s, r) => s + (r?.besparingPerJaar ?? 0), 0);
    const totaalCo2 = Object.values(resultaten).reduce((s, r) => s + (r?.co2BesparingKg ?? 0), 0);
    rollup = {
      totaleInvestering: totaalInv,
      totaleSubsidie: totaalSub,
      nettoInvestering: totaalInv - totaalSub,
      totaleBesparingPerJaar: totaalBesp,
      totaleCo2BesparingKg: totaalCo2,
      gemiddeldeTerugverdientijdJaren: totaalBesp > 0 ? (totaalInv - totaalSub) / totaalBesp : (null as unknown as number),
      aansluitwaardeVoldoende: true,
      warnings: [{
        level: 'warning',
        code: 'ROLLUP_FALLBACK',
        message: `Aansluitwaarde-check overgeslagen: ${err instanceof Error ? err.message : 'onbekend'}. Resultaat is een schatting.`,
      }],
    } as unknown as ProjectResultaat;
  }

  return sanitize({ perMaatregel: resultaten, rollup, overgeslagen });
}

function isPositief(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

function sanitize<T>(obj: T): T {
  if (typeof obj !== 'object' || obj === null) {
    if (typeof obj === 'number' && !Number.isFinite(obj)) return null as unknown as T;
    return obj;
  }
  if (Array.isArray(obj)) return obj.map(sanitize) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out[k] = sanitize(v);
  }
  return out as T;
}
