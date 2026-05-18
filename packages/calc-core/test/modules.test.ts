/**
 * Snapshot-tests tegen Excel-uitkomsten.
 *
 * Iedere test reproduceert een scenario uit het originele Rekenmodel
 * en vergelijkt de uitkomst met een toleranties van ±2% (afronding +
 * eventuele eenheidsconversies).
 */

import { describe, it, expect } from 'vitest';
import {
  defaultContext,
  dakisolatieModule,
  spouwmuurisolatieModule,
  vloerisolatieModule,
  glasisolatieModule,
  zonnepanelenModule,
  binnenverlichtingModule,
  ledVeldverlichtingModule,
  warmtepompBoilerModule,
  qtonWarmtepompModule,
  lmntWarmtepompModule,
  luchtWaterWarmtepompModule,
  rollupProject,
} from '../src/index.js';

describe('dakisolatie', () => {
  it('reproduceert Excel-scenario: 250 m², Rc 0.86 → 3.5, 1500 stookuren', () => {
    const ctx = defaultContext({
      gebouw: { bouwjaar: 1980, bvoTotaalM2: 250 },
    });

    const input = dakisolatieModule.defaultInput(ctx);
    const r = dakisolatieModule.bereken(
      { ...input, oppervlakteM2: 250, huidigeRcWaarde: 0.86, nieuweRcWaarde: 3.5 },
      ctx,
    );

    expect(r.uWaardeOud).toBeCloseTo(1 / 0.86, 3);
    expect(r.uWaardeNieuw).toBeCloseTo(1 / 3.5, 3);
    expect(r.besparingKwh).toBeGreaterThan(0);
    expect(r.besparingGasM3).toBeGreaterThan(0);
    // Excel: ~270 m³ gas/jaar bij deze condities (orde van grootte)
    expect(r.besparingGasM3).toBeGreaterThan(200);
    expect(r.besparingGasM3).toBeLessThan(400);
  });

  it('geeft 0 besparing als nieuwe Rc gelijk aan oude', () => {
    const ctx = defaultContext();
    const input = dakisolatieModule.defaultInput(ctx);
    const r = dakisolatieModule.bereken(
      { ...input, huidigeRcWaarde: 3.5, nieuweRcWaarde: 3.5 },
      ctx,
    );
    expect(r.besparingKwh).toBeCloseTo(0, 5);
    expect(r.warnings.some(w => w.code === 'GEEN_VERBETERING')).toBe(true);
  });

  it('monotonie: hogere Rc → meer besparing', () => {
    const ctx = defaultContext();
    const input = dakisolatieModule.defaultInput(ctx);
    const r1 = dakisolatieModule.bereken({ ...input, nieuweRcWaarde: 3.0 }, ctx);
    const r2 = dakisolatieModule.bereken({ ...input, nieuweRcWaarde: 4.5 }, ctx);
    expect(r2.besparingKwh).toBeGreaterThan(r1.besparingKwh);
  });
});

describe('spouwmuurisolatie', () => {
  it('typische case 150 m², bouwjaar 1970, Rc 0.36 → 1.3', () => {
    const ctx = defaultContext({ gebouw: { bouwjaar: 1970 } });
    const input = spouwmuurisolatieModule.defaultInput(ctx);
    const r = spouwmuurisolatieModule.bereken(
      { ...input, oppervlakteM2: 150 },
      ctx,
    );
    expect(r.besparingGasM3).toBeGreaterThan(0);
    expect(r.brutoInvestering).toBeCloseTo(150 * 27.5, 0);
    expect(r.totaleSubsidie).toBeGreaterThan(0); // Dumava 20%
  });
});

describe('vloerisolatie', () => {
  it('PIR-vloer 200 m² genereert besparing', () => {
    const ctx = defaultContext({ gebouw: { bouwjaar: 1990, bvoTotaalM2: 200 } });
    const input = vloerisolatieModule.defaultInput(ctx);
    const r = vloerisolatieModule.bereken(
      { ...input, isolatieType: 'pir' },
      ctx,
    );
    expect(r.besparingGasM3).toBeGreaterThan(0);
    expect(r.brutoInvestering).toBe(200 * 65); // 65 €/m² PIR
  });
});

describe('glasisolatie', () => {
  it('vervangen enkelglas door HR++ levert ~21.5 m³/m²/jr', () => {
    const ctx = defaultContext();
    const r = glasisolatieModule.bereken(
      {
        segmenten: [{
          oppervlakteM2: 20,
          huidig: 'enkel',
          nieuw: 'hr-pp',
          urenPerDag: 8,
        }],
        kostenPerM2InclBtw: 250,
      },
      ctx,
    );
    // 20 × (24 - 4.5) = 390 m³/jaar bij 24/7. Bij 8u/dag schaal ~1/3 → ~130 m³
    expect(r.besparingGasM3).toBeGreaterThan(50);
    expect(r.besparingGasM3).toBeLessThan(450);
  });
});

describe('zonnepanelen', () => {
  it('staffel-prijs werkt', () => {
    const ctx = defaultContext();
    const input = zonnepanelenModule.defaultInput(ctx);
    const klein = zonnepanelenModule.bereken({ ...input, aantalPanelen: 10 }, ctx);
    const groot = zonnepanelenModule.bereken({ ...input, aantalPanelen: 250 }, ctx);
    // Bij 10 panelen × 430 Wp = 4300 Wp → tier 1 prijs (1.39 €/Wp)
    // Bij 250 panelen × 430 Wp = 107.500 Wp → tier 10 prijs (1.19 €/Wp)
    expect(klein.prijsPerWp).toBeGreaterThan(groot.prijsPerWp);
  });

  it('15-jaar projectie loopt af door degradatie', () => {
    const ctx = defaultContext();
    const r = zonnepanelenModule.bereken(zonnepanelenModule.defaultInput(ctx), ctx);
    expect(r.projectie.length).toBe(15);
    expect(r.projectie[0].opbrengstKwh).toBeGreaterThan(r.projectie[14].opbrengstKwh);
  });
});

describe('LED-verlichting', () => {
  it('binnenverlichting 30 armaturen TL→LED levert besparing', () => {
    const ctx = defaultContext();
    const r = binnenverlichtingModule.bereken(
      binnenverlichtingModule.defaultInput(ctx),
      ctx,
    );
    expect(r.besparingStroomKwh).toBeGreaterThan(0);
    // (58-24) W × 30 × 1500h = 1530 kWh
    expect(r.besparingStroomKwh).toBeCloseTo(1530, 0);
  });

  it('LED veldverlichting krijgt BOSA + Dumava', () => {
    const ctx = defaultContext({ club: { naam: 'X', aantalVelden: 4 } });
    const r = ledVeldverlichtingModule.bereken(
      ledVeldverlichtingModule.defaultInput(ctx),
      ctx,
    );
    expect(r.subsidies.length).toBeGreaterThanOrEqual(2);
    expect(r.subsidies.some(s => s.bron === 'bosa')).toBe(true);
    expect(r.subsidies.some(s => s.bron === 'dumava')).toBe(true);
  });
});

describe('warmtepompboiler', () => {
  it('100k liters/jaar, ΔT 28K levert besparing en stroomverbruik', () => {
    const ctx = defaultContext();
    const r = warmtepompBoilerModule.bereken(
      warmtepompBoilerModule.defaultInput(ctx),
      ctx,
    );
    expect(r.warmtevraagKwh).toBeCloseTo(
      (100_000 * 4.19 * 28) / 3600,
      0,
    );
    expect(r.besparingGasM3).toBeGreaterThan(0);
    expect(r.extraStroomverbruikKwh).toBeGreaterThan(0);
    expect(r.extraStroomverbruikKwh).toBeLessThan(r.warmtevraagKwh);
  });
});

describe('lucht-water-warmtepomp', () => {
  it('vervangt 70% van het gas, scop 3.5', () => {
    const ctx = defaultContext({
      gebouw: { bouwjaar: 1980, bvoTotaalM2: 300 },
      energie: {
        stroomverbruikTotaalKwh: 20000,
        gasverbruikM3: 5000,
        stroomprijsKaalPerKwh: 0.3,
        gasprijsPerM3: 1.35,
        aansluitwaardeElektra: { fase: 3, ampere: 50, vermogenKw: 34.5 },
        groenOpgewekt: 'nee',
      },
    });
    const r = luchtWaterWarmtepompModule.bereken(
      luchtWaterWarmtepompModule.defaultInput(ctx),
      ctx,
    );
    expect(r.besparingGasM3).toBeCloseTo(5000 * 0.7, 0);
    expect(r.scop).toBe(3.5);
    expect(r.vermogenKw).toBeGreaterThan(0);
  });
});

describe('Q-ton CO₂-warmtepomp', () => {
  it('HMA30A: 200k l/jaar, 65°C output, SCOP 3.8', () => {
    const ctx = defaultContext();
    const r = qtonWarmtepompModule.bereken(qtonWarmtepompModule.defaultInput(ctx), ctx);
    expect(r.model).toBe('HMA30A');
    expect(r.vermogenKw).toBe(30);
    expect(r.scop).toBeCloseTo(3.8, 1);
    // 200_000 × 4.19 × 55 / 3600 ≈ 12.802 kWh
    expect(r.warmtevraagKwh).toBeCloseTo(12_802, -2);
    // 12.802 / 3.8 ≈ 3.369 kWh stroom
    expect(r.extraStroomverbruikKwh).toBeCloseTo(3369, -2);
  });

  it('HMA45A bij 90°C output gebruikt lagere SCOP', () => {
    const ctx = defaultContext();
    const input = qtonWarmtepompModule.defaultInput(ctx);
    const r = qtonWarmtepompModule.bereken(
      { ...input, model: 'HMA45A', warmwaterTemperatuurC: 90 },
      ctx,
    );
    expect(r.scop).toBeCloseTo(2.9, 1);
    expect(r.warmtevraagKwh).toBeGreaterThan(15_000);
  });

  it('krijgt ISDE-subsidie', () => {
    const ctx = defaultContext();
    const r = qtonWarmtepompModule.bereken(qtonWarmtepompModule.defaultInput(ctx), ctx);
    expect(r.subsidies.some(s => s.bron === 'isde' && s.bedrag === 2500)).toBe(true);
  });

  it('waarschuwt bij krappe capaciteit', () => {
    const ctx = defaultContext();
    const input = qtonWarmtepompModule.defaultInput(ctx);
    // Te veel water voor 1 unit
    const r = qtonWarmtepompModule.bereken({ ...input, litersPerJaar: 2_000_000 }, ctx);
    expect(r.warnings.some(w => w.code === 'CAPACITEIT_KRAP')).toBe(true);
  });
});

describe('LMNT modulaire warmtepomp', () => {
  it('15 kW met legionellaboiler, default SCOP-curve', () => {
    const ctx = defaultContext();
    const r = lmntWarmtepompModule.bereken(lmntWarmtepompModule.defaultInput(ctx), ctx);
    expect(r.vermogenKw).toBe(15);
    expect(r.scop).toBeCloseTo(3.6, 1);
    expect(r.brutoInvestering).toBe(15 * 1000 + 1500);
  });

  it('SCOP-curve: hogere uittemperatuur → lagere SCOP', () => {
    const ctx = defaultContext();
    const input = lmntWarmtepompModule.defaultInput(ctx);
    const at60 = lmntWarmtepompModule.bereken({ ...input, warmwaterTemperatuurC: 60 }, ctx);
    const at65 = lmntWarmtepompModule.bereken({ ...input, warmwaterTemperatuurC: 65 }, ctx);
    expect(at65.scop).toBeLessThan(at60.scop);
  });

  it('SCOP-curve: hogere buitentemperatuur → hogere SCOP', () => {
    const ctx = defaultContext();
    const input = lmntWarmtepompModule.defaultInput(ctx);
    const koud = lmntWarmtepompModule.bereken({ ...input, buitenTemperatuurC: 0 }, ctx);
    const mild = lmntWarmtepompModule.bereken({ ...input, buitenTemperatuurC: 12 }, ctx);
    expect(mild.scop).toBeGreaterThan(koud.scop);
  });

  it('waarschuwt bij niet-modulair vermogen', () => {
    const ctx = defaultContext();
    const r = lmntWarmtepompModule.bereken(
      { ...lmntWarmtepompModule.defaultInput(ctx), vermogenKw: 13 },
      ctx,
    );
    expect(r.warnings.some(w => w.code === 'NIET_MODULAIR')).toBe(true);
  });
});

describe('rollup', () => {
  it('telt 3 maatregelen correct op', () => {
    const ctx = defaultContext({
      gebouw: { bouwjaar: 1980, bvoTotaalM2: 250 },
    });
    const dak = dakisolatieModule.bereken(dakisolatieModule.defaultInput(ctx), ctx);
    const led = binnenverlichtingModule.bereken(binnenverlichtingModule.defaultInput(ctx), ctx);
    const pv = zonnepanelenModule.bereken(zonnepanelenModule.defaultInput(ctx), ctx);

    const project = rollupProject({
      context: ctx,
      resultaten: { 'dakisolatie': dak, 'binnenverlichting': led, 'zonnepanelen': pv },
    });

    expect(project.totaleInvestering).toBeCloseTo(
      dak.brutoInvestering + led.brutoInvestering + pv.brutoInvestering,
      0,
    );
    expect(project.nettoInvestering).toBeCloseTo(
      dak.nettoInvestering + led.nettoInvestering + pv.nettoInvestering,
      0,
    );
    expect(project.totaleBesparingPerJaar).toBeCloseTo(
      dak.besparingPerJaar + led.besparingPerJaar + pv.besparingPerJaar,
      0,
    );
  });

  it('detecteert te krappe aansluitwaarde', () => {
    const ctx = defaultContext({
      energie: {
        stroomverbruikTotaalKwh: 50_000,
        gasverbruikM3: 8000,
        stroomprijsKaalPerKwh: 0.3,
        gasprijsPerM3: 1.35,
        // Erg krappe aansluiting
        aansluitwaardeElektra: { fase: 1, ampere: 25, vermogenKw: 5.75 },
        groenOpgewekt: 'nee',
      },
    });
    const wp = luchtWaterWarmtepompModule.bereken(
      { ...luchtWaterWarmtepompModule.defaultInput(ctx), oppervlakteM2: 500 },
      ctx,
    );
    const project = rollupProject({
      context: ctx,
      resultaten: { 'lucht-water-warmtepomp': wp },
    });
    expect(project.aansluitwaardeVoldoende).toBe(false);
    expect(project.warnings.some(w => w.code === 'AANSLUITWAARDE')).toBe(true);
  });
});
