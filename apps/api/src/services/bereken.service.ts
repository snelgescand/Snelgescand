/**
 * Berekening-service: maximaal defensieve bridge tussen Project.state JSONB
 * en calc-core. Crasht onder geen enkele input — geeft altijd een resultaat
 * óf een nette validatie-fout terug.
 *
 * Strategie:
 *   1. Minimale validatie van energieverbruik (anders BerekenValidatieFout)
 *   2. Defensieve deep-merge van context met alle calc-core defaults
 *   3. Rollup wordt in try/catch gewikkeld — bij crash valt 'ie terug op
 *      een lege rollup met waarschuwing (maar de berekening gaat door)
 */

import {
  MODULE_REGISTRY,
  rollupProject,
  defaultContext,
  type MaatregelResultaat,
  type ProjectContext,
  type RegistryKey,
  type ProjectResultaat,
} from '@sportief-opgewekt/calc-core';

interface ProjectState {
  context?: Partial<ProjectContext>;
  gekozenMaatregelen?: Record<string, unknown>;
}

export interface BerekendProject {
  perMaatregel: Partial<Record<RegistryKey, MaatregelResultaat>>;
  rollup: ProjectResultaat;
  overgeslagen: Array<{ id: string; reden: string }>;
}

export class BerekenValidatieFout extends Error {
  constructor(public ontbrekendeVelden: string[]) {
    super(`Niet alle vereiste velden zijn ingevuld: ${ontbrekendeVelden.join(', ')}`);
  }
}

export function berekenProject(rawState: unknown): BerekendProject {
  const state: ProjectState = (typeof rawState === 'object' && rawState !== null)
    ? rawState as ProjectState
    : {};

  // === Stap 1: minimale validatie ===
  const energie = (state.context?.energie ?? {}) as Record<string, unknown>;
  const ontbreken: string[] = [];
  if (!isPositief(energie.gasverbruikM3)) ontbreken.push('gasverbruik per jaar');
  if (!isPositief(energie.stroomverbruikTotaalKwh)) ontbreken.push('stroomverbruik per jaar');
  if (!isPositief(energie.gasprijsPerM3)) ontbreken.push('gasprijs');
  if (!isPositief(energie.stroomprijsKaalPerKwh)) ontbreken.push('stroomprijs');

  if (ontbreken.length > 0) {
    throw new BerekenValidatieFout(ontbreken);
  }

  // === Stap 2: rock-solid context bouwen ===
  // Strategie: pak ALTIJD een verse defaultContext, override alleen die velden
  // die de user expliciet heeft ingevuld. Nested objecten worden per veld
  // gemerged zodat sub-velden zoals aansluitwaardeElektra.vermogenKw nooit
  // verloren gaan.
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
      // Garandeer dat aansluitwaardeElektra ALTIJD vermogenKw heeft —
      // crash-veroorzaker als 'ie undefined of incompleet is
      aansluitwaardeElektra: {
        fase: (userAansl.fase as 1 | 3) ?? baseCtx.energie.aansluitwaardeElektra.fase,
        ampere: (userAansl.ampere as number) ?? baseCtx.energie.aansluitwaardeElektra.ampere,
        vermogenKw: (userAansl.vermogenKw as number) ?? baseCtx.energie.aansluitwaardeElektra.vermogenKw,
      },
    } as ProjectContext['energie'],
    defaultSubsidiePercentages: baseCtx.defaultSubsidiePercentages,
  };

  // === Stap 3: maatregelen berekenen, individueel afgeschermd ===
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

    // Lege/null waardes terug op defaults
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
      const msg = err instanceof Error ? err.message : String(err);
      overgeslagen.push({ id: maatregelId, reden: msg });
    }
  }

  // === Stap 4: DUMAVA-eligibility check ===
  // DUMAVA-regeling (RVO, sinds 1-3-2023) vereist ECHTE verduurzaming:
  //   - Minimaal 3 verduurzamingsmaatregelen die in de DUMAVA-lijst staan, OF
  //   - Een labelsprong naar minimaal label B (bij start vanaf C of slechter)
  //
  // Voorheen kreeg elke maatregel los DUMAVA toegekend, ook als er maar 1 maatregel
  // was gekozen of als het label niet verbeterde. Dat klopt niet. Hier filteren we
  // DUMAVA eruit als de criteria niet vervuld zijn — dan blijven andere subsidies
  // (ISDE, BOSA) gewoon staan.
  const aantalMaatregelen = Object.values(resultaten).filter(r => r && r.brutoInvestering > 0).length;
  const labelInfo = userCtx.energielabel as { huidig?: string; verwachtNa?: string } | undefined;
  const labelHuidig = labelInfo?.huidig?.toUpperCase();
  const labelNa = labelInfo?.verwachtNa?.toUpperCase();
  // Labelsprong: van C/D/E/F/G naar A of B is een echte sprong; van B naar B is dat niet
  const RANG = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  const huidigRang = labelHuidig ? RANG.indexOf(labelHuidig) : -1;
  const naRang = labelNa ? RANG.indexOf(labelNa) : -1;
  const labelSprong = huidigRang >= 0 && naRang >= 0
    && naRang < huidigRang   // lager indexgetal = beter label
    && naRang <= 1;          // naar A of B
  const dumavaToegestaan = aantalMaatregelen >= 3 || labelSprong;

  if (!dumavaToegestaan) {
    // Verwijder DUMAVA-subsidie uit alle maatregel-resultaten en herbereken totalen
    for (const id of Object.keys(resultaten) as RegistryKey[]) {
      const res = resultaten[id];
      if (!res || !res.subsidies) continue;
      const verwijderd = res.subsidies.filter(s => s.bron !== 'dumava');
      if (verwijderd.length !== res.subsidies.length) {
        const nieuweTotaleSubsidie = verwijderd.reduce((s, x) => s + x.bedrag, 0);
        resultaten[id] = {
          ...res,
          subsidies: verwijderd,
          totaleSubsidie: nieuweTotaleSubsidie,
          nettoInvestering: res.brutoInvestering - nieuweTotaleSubsidie,
          // TVT herberekenen
          terugverdientijdJaren: res.besparingPerJaar > 0
            ? (res.brutoInvestering - nieuweTotaleSubsidie) / res.besparingPerJaar
            : res.terugverdientijdJaren,
          warnings: [
            ...(res.warnings ?? []),
            {
              level: 'info' as const,
              code: 'DUMAVA_NIET_VAN_TOEPASSING',
              message: aantalMaatregelen < 3
                ? `DUMAVA niet toegekend: vereist minimaal 3 verduurzamingsmaatregelen (nu ${aantalMaatregelen} gekozen). Voeg meer maatregelen toe of zorg voor een labelsprong naar A/B.`
                : 'DUMAVA niet toegekend: huidig label en verwacht label-na vormen geen sprong naar A/B vanaf C of slechter.',
            },
          ],
        };
      }
    }
  }

  // === Stap 5: rollup — ook in try/catch zodat één bug niet alles sloopt ===
  // Batterij-vermogen voor aansluitwaarde-check
  const batE = gekozen['batterij-eenvoudig'] as { vermogenKw?: number } | undefined;
  const batU = gekozen['batterij-uitgebreid'] as { vermogenKw?: number } | undefined;
  const batterijVermogenKw = Math.max(batE?.vermogenKw ?? 0, batU?.vermogenKw ?? 0);

  let rollup: ProjectResultaat;
  try {
    rollup = rollupProject({ context, resultaten, batterijVermogenKw });
  } catch (err) {
    // Fallback: lege rollup met waarschuwing
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
      gemiddeldeTerugverdientijdJaren: totaalBesp > 0 ? (totaalInv - totaalSub) / totaalBesp : null as unknown as number,
      aansluitwaardeVoldoende: true,
      warnings: [{
        level: 'warning',
        code: 'ROLLUP_FALLBACK',
        message: `Rollup-berekening hapert: ${err instanceof Error ? err.message : String(err)}. Resultaat is een schatting.`,
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
    if (typeof obj === 'number' && !Number.isFinite(obj)) {
      return null as unknown as T;
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitize) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out[k] = sanitize(v);
  }
  return out as T;
}
