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

  // === Stap 4: DUMAVA-regime bepalen ===
  // RVO DUMAVA kent twee aanvraag-varianten (sinds 1-3-2023):
  //
  //   A. "Losse maatregelen" (≤3 maatregelen)
  //      • 20% subsidie op bruto investering
  //      • Geen verplichte labelsprong
  //      • Naam in Subsidie-record: "DUMAVA losse maatregelen"
  //
  //   B. "Integraal verduurzamingsproject" (>3 maatregelen)
  //      • 30% subsidie (kan oplopen tot 40% bij bouwkundige + installatie-mix)
  //      • Verplicht: labelsprong van minimaal 3 stappen op de A-G schaal
  //      • Voorbeeld: van E naar B = 3 stappen (E→D→C→B) ✓
  //      • Naam: "DUMAVA integraal verduurzamingsproject"
  //
  //   C. Geen DUMAVA — als >3 maatregelen ZONDER de 3-staps-labelsprong
  //
  // Het calc-core module-pakket geeft per maatregel een DUMAVA-subsidie van 20%
  // mee (losse-regime default). Hier herinterpreteren we project-breed:
  const aantalMaatregelen = Object.values(resultaten).filter(r => r && r.brutoInvestering > 0).length;
  const labelInfo = userCtx.energielabel as { huidig?: string; verwachtNa?: string } | undefined;
  const labelHuidig = labelInfo?.huidig?.toUpperCase();
  const labelNa = labelInfo?.verwachtNa?.toUpperCase();
  const RANG = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  const huidigRang = labelHuidig ? RANG.indexOf(labelHuidig) : -1;
  const naRang = labelNa ? RANG.indexOf(labelNa) : -1;
  // Stappen labelsprong: positief = beter (lager rangnummer)
  const aantalStappen = (huidigRang >= 0 && naRang >= 0) ? (huidigRang - naRang) : 0;

  type DumavaRegime = 'losse' | 'integraal' | 'geen';
  let regime: DumavaRegime;
  let regimePercentage = 0;
  let regimeNaam = '';
  if (aantalMaatregelen === 0) {
    regime = 'geen';
  } else if (aantalMaatregelen <= 3) {
    regime = 'losse';
    regimePercentage = 0.20;
    regimeNaam = 'DUMAVA losse maatregelen';
  } else if (aantalStappen >= 3) {
    regime = 'integraal';
    regimePercentage = 0.30; // 30% standaard, kan tot 40% bij bouwkundige+installatie mix — pas later met UI-toggle
    regimeNaam = 'DUMAVA integraal verduurzamingsproject';
  } else {
    regime = 'geen';
  }

  // Loop alle resultaten langs en pas de DUMAVA-rij aan o.b.v. regime
  for (const id of Object.keys(resultaten) as RegistryKey[]) {
    const res = resultaten[id];
    if (!res || !res.subsidies) continue;
    const dumavaIdx = res.subsidies.findIndex(s => s.bron === 'dumava');
    if (dumavaIdx < 0) continue; // module heeft geen DUMAVA-rij

    let nieuweSubsidies = [...res.subsidies];
    let warningExtra: { level: 'info' | 'warning'; code: string; message: string } | null = null;

    if (regime === 'geen') {
      // Verwijder DUMAVA volledig
      nieuweSubsidies = nieuweSubsidies.filter((_, i) => i !== dumavaIdx);
      warningExtra = {
        level: 'info',
        code: 'DUMAVA_NIET_VAN_TOEPASSING',
        message: aantalMaatregelen > 3
          ? `DUMAVA niet toegekend: bij >3 maatregelen geldt het "integraal verduurzamings-regime", dat vereist een labelsprong van minimaal 3 stappen (nu ${aantalStappen}). Anders: kies maximaal 3 maatregelen voor de "losse maatregelen"-regeling.`
          : 'DUMAVA niet toegekend: er zijn geen verduurzamingsmaatregelen gekozen.',
      };
    } else {
      // Vervang de DUMAVA-rij met regime-percentage en juiste naam
      const nieuwBedrag = res.brutoInvestering * regimePercentage;
      nieuweSubsidies[dumavaIdx] = {
        ...nieuweSubsidies[dumavaIdx],
        naam: regimeNaam,
        bedrag: nieuwBedrag,
        percentage: regimePercentage,
      };
      if (regime === 'integraal') {
        warningExtra = {
          level: 'info',
          code: 'DUMAVA_INTEGRAAL',
          message: `Integraal-regime: ${aantalMaatregelen} maatregelen + ${aantalStappen} labelsprong-stappen (${labelHuidig} → ${labelNa}). 30% standaard, controleer of 40% van toepassing is (bouwkundige + installatie-mix).`,
        };
      } else if (regime === 'losse' && aantalMaatregelen > 3) {
        // Onmogelijk gegeven de boom, maar veiligheidsnet
        warningExtra = null;
      }
    }

    const nieuweTotaleSubsidie = nieuweSubsidies.reduce((s, x) => s + x.bedrag, 0);
    resultaten[id] = {
      ...res,
      subsidies: nieuweSubsidies,
      totaleSubsidie: nieuweTotaleSubsidie,
      nettoInvestering: res.brutoInvestering - nieuweTotaleSubsidie,
      terugverdientijdJaren: res.besparingPerJaar > 0
        ? (res.brutoInvestering - nieuweTotaleSubsidie) / res.besparingPerJaar
        : res.terugverdientijdJaren,
      warnings: warningExtra ? [...(res.warnings ?? []), warningExtra] : (res.warnings ?? []),
    };
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
