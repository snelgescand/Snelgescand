# @sportief-opgewekt/calc-core

Pure rekenkern voor de Sportief Opgewekt SaaS-applicatie.

## Filosofie

- **Zero side-effects**: alle modules zijn pure functies van `(input, context) → resultaat`.
- **Geen UI- of Node-afhankelijkheden**: draait in browser, Node én Worker.
- **Eén universeel resultaatformaat** (`MaatregelResultaat`): `brutoInvestering`, `totaleSubsidie`, `nettoInvestering`, `besparingPerJaar`, `co2BesparingKg`, `terugverdientijdJaren`, `piekVermogenKw`.
- **Penningmeester-rollup**: telt alle gekozen maatregelen op tot één project-resultaat.
- **8760-uurs batterij-engine**: aparte pure functie `simuleerBatterijTijdreeks()` voor de zware tijdreeks-berekening (kan in een Web Worker).

## Quick start

```ts
import {
  defaultContext,
  dakisolatieModule,
  zonnepanelenModule,
  rollupProject,
} from '@sportief-opgewekt/calc-core';

const ctx = defaultContext({
  club: { naam: 'Mijn club' },
  gebouw: { bouwjaar: 1985, bvoTotaalM2: 350 },
});

const dak = dakisolatieModule.bereken(
  dakisolatieModule.defaultInput(ctx),
  ctx,
);

const pv = zonnepanelenModule.bereken(
  zonnepanelenModule.defaultInput(ctx),
  ctx,
);

const project = rollupProject({
  context: ctx,
  resultaten: {
    'dakisolatie': dak,
    'zonnepanelen': pv,
  },
});

console.log(`Totale netto-investering: €${project.nettoInvestering.toFixed(0)}`);
console.log(`Besparing per jaar:       €${project.totaleBesparingPerJaar.toFixed(0)}`);
console.log(`Aansluiting voldoende:    ${project.aansluitwaardeVoldoende}`);
```

## Module-structuur

Elke module implementeert `MaatregelModule<TInput, TResultaat>`:

```ts
interface MaatregelModule<I, R extends MaatregelResultaat> {
  id: MaatregelId;
  naam: string;
  defaultInput(ctx: ProjectContext): I;
  bereken(input: I, ctx: ProjectContext): R;
}
```

Zie `MODULE_REGISTRY` voor alle beschikbare modules en `MAATREGEL_GROEPEN` voor de UI-groepering (overeenkomstig de PowerPoint-secties).

## Tests

```bash
pnpm test
```

De tests in `test/` valideren:
- Excel-reproductie (snapshots tegen bekende uitkomsten)
- Energie-balansen (gas-besparing × kWh/m³ = warmtevraag-besparing)
- Monotone eigenschappen (meer isolatie = meer besparing)
- Edge cases (lege oppervlakte, identieke Rc-waardes, etc.)

## Bekende afwijkingen t.o.v. Excel

Zie `../docs/FORMULES.md` sectie "Excel-inconsistenties". De belangrijkste:

1. **Gas-energie-eenheid**: warmtepomp-tabbladen gebruiken 10.1 kWh/m³ (primaire energie), isolatie-tabbladen gebruiken 31.65 MJ/m³ = 8.79 kWh/m³. Wij volgen Excel.
2. **CO₂-factor stroom**: rekenmodel gebruikt 0.337, accumodel 0.328. Wij gebruiken 0.337 als default.
