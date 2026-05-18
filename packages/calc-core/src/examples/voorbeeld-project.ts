/**
 * Volledig werkend voorbeeld dat alle bouwstenen van calc-core gebruikt.
 *
 * Draai met:
 *   pnpm --filter @sportief-opgewekt/calc-core build
 *   node packages/calc-core/dist/examples/voorbeeld-project.js
 *
 * Of inline in tests / dev-server.
 */

import {
  defaultContext,
  dakisolatieModule,
  spouwmuurisolatieModule,
  zonnepanelenModule,
  binnenverlichtingModule,
  warmtepompBoilerModule,
  rollupProject,
} from '../index.js';

const ctx = defaultContext({
  club: {
    naam: 'Voetbalclub Voorbeeld',
    type: 'voetbal',
    aantalLeden: 350,
    aantalVelden: 3,
    aantalKleedkamers: 8,
    aantalDouchekoppen: 24,
  },
  gebouw: {
    bouwjaar: 1985,
    bvoTotaalM2: 450,
    plafondhoogteM: 3.2,
  },
  energie: {
    stroomverbruikTotaalKwh: 32_000,
    gasverbruikM3: 6_500,
    stroomprijsKaalPerKwh: 0.32,
    gasprijsPerM3: 1.40,
    terugleverVergoedingPerKwh: 0.08,
    aansluitwaardeElektra: { fase: 3, ampere: 50, vermogenKw: 34.5 },
    groenOpgewekt: 'nee',
  },
});

// Bereken elke maatregel met zijn defaults
const dak = dakisolatieModule.bereken(dakisolatieModule.defaultInput(ctx), ctx);
const spouw = spouwmuurisolatieModule.bereken(spouwmuurisolatieModule.defaultInput(ctx), ctx);
const led = binnenverlichtingModule.bereken(binnenverlichtingModule.defaultInput(ctx), ctx);
const wp = warmtepompBoilerModule.bereken(
  { ...warmtepompBoilerModule.defaultInput(ctx), litersPerJaar: 180_000 },
  ctx,
);
const pv = zonnepanelenModule.bereken(
  { ...zonnepanelenModule.defaultInput(ctx), aantalPanelen: 120 },
  ctx,
);

// Tel ze op
const project = rollupProject({
  context: ctx,
  resultaten: {
    'dakisolatie': dak,
    'spouwmuurisolatie': spouw,
    'binnenverlichting': led,
    'warmtepompboiler': wp,
    'zonnepanelen': pv,
  },
});

console.log('=== Voor de penningmeester ===');
console.log(`Bruto investering:     € ${project.totaleInvestering.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}`);
console.log(`Totale subsidies:      € ${project.totaleSubsidie.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}`);
console.log(`Netto investering:     € ${project.nettoInvestering.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}`);
console.log(`Besparing per jaar:    € ${project.totaleBesparingPerJaar.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}`);
console.log(`Gemiddelde TVT:        ${project.gemiddeldeTerugverdientijdJaren.toFixed(1)} jaar`);
console.log(`CO₂-besparing:         ${(project.totaleCo2BesparingKg / 1000).toFixed(1)} ton/jaar`);
console.log();
console.log('=== Aansluitwaarde ===');
console.log(`Huidige capaciteit:    ${ctx.energie.aansluitwaardeElektra.vermogenKw} kW`);
console.log(`Nieuwe piekvraag:      ${project.nieuwePiekBelastingKw.toFixed(1)} kW`);
console.log(`Voldoende:             ${project.aansluitwaardeVoldoende ? '✓ ja' : '✗ nee'}`);
console.log();
console.log('=== Per maatregel ===');
for (const [id, r] of Object.entries(project.perMaatregel)) {
  if (!r) continue;
  console.log(
    `  ${id.padEnd(28)} € ${r.nettoInvestering.toFixed(0).padStart(8)}  ` +
    `→ € ${r.besparingPerJaar.toFixed(0).padStart(6)}/jr  ` +
    `(${r.terugverdientijdJaren.toFixed(1)}j TVT)`,
  );
}

if (project.warnings.length > 0) {
  console.log();
  console.log('=== Waarschuwingen ===');
  for (const w of project.warnings) {
    console.log(`  [${w.level}] ${w.code}: ${w.message}`);
  }
}
