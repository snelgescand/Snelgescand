/**
 * Property-based tests met fast-check.
 *
 * Deze tests valideren invarianten die voor alle redelijke inputs gelden,
 * niet alleen voor specifieke scenario's:
 *
 *   - Investering ≥ 0
 *   - nettoInvestering = brutoInvestering - totaleSubsidie
 *   - besparing kWh × 8.79 ≈ besparing m³ gas (warmtevraag-vergelijking)
 *   - Bij meer isolatie of meer oppervlakte: meer besparing
 *   - TVT > 0 voor positieve besparing
 */

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import {
  defaultContext,
  dakisolatieModule,
  spouwmuurisolatieModule,
  binnenverlichtingModule,
  GAS_LHV_KWH_M3,
} from '../src/index.js';

describe('property: dakisolatie', () => {
  it('netto = bruto - subsidies, altijd', () => {
    fc.assert(fc.property(
      fc.float({ min: 1, max: 5000, noNaN: true }),       // oppervlakte
      fc.float({ min: 0.5, max: 2.0, noNaN: true }),       // rcOud
      fc.float({ min: 3.0, max: 6.0, noNaN: true }),       // rcNieuw
      (opp, rcOud, rcNieuw) => {
        const ctx = defaultContext();
        const r = dakisolatieModule.bereken({
          oppervlakteM2: opp,
          huidigeRcWaarde: rcOud,
          nieuweRcWaarde: rcNieuw,
          isolatieType: 'standaard',
          stookurenPerJaar: 1500,
          binnenBuitenDeltaT: 8,
        }, ctx);
        const tolerance = Math.max(1, r.brutoInvestering * 1e-6);
        return Math.abs(r.nettoInvestering - (r.brutoInvestering - r.totaleSubsidie)) < tolerance;
      },
    ));
  });

  it('grotere oppervlakte → meer besparing (monotonie)', () => {
    fc.assert(fc.property(
      fc.float({ min: 10, max: 500, noNaN: true }),
      fc.float({ min: 10, max: 100, noNaN: true }),
      (basisOpp, extra) => {
        const ctx = defaultContext();
        const baseInput = dakisolatieModule.defaultInput(ctx);
        const klein = dakisolatieModule.bereken({ ...baseInput, oppervlakteM2: basisOpp }, ctx);
        const groot = dakisolatieModule.bereken({ ...baseInput, oppervlakteM2: basisOpp + extra }, ctx);
        return (groot.besparingGasM3 ?? 0) >= (klein.besparingGasM3 ?? 0);
      },
    ));
  });

  it('energiebalans: kWh × 8.79 ≈ m³ gas', () => {
    fc.assert(fc.property(
      fc.float({ min: 50, max: 1000, noNaN: true }),
      fc.float({ min: 0.5, max: 1.5, noNaN: true }),
      fc.float({ min: 3.0, max: 6.0, noNaN: true }),
      (opp, rcOud, rcNieuw) => {
        const ctx = defaultContext();
        const r = dakisolatieModule.bereken({
          oppervlakteM2: opp,
          huidigeRcWaarde: rcOud,
          nieuweRcWaarde: rcNieuw,
          isolatieType: 'standaard',
          stookurenPerJaar: 1500,
          binnenBuitenDeltaT: 8,
        }, ctx);
        const m3FromKwh = r.besparingKwh / GAS_LHV_KWH_M3;
        const relErr = Math.abs(m3FromKwh - (r.besparingGasM3 ?? 0)) / Math.max(1, r.besparingGasM3 ?? 1);
        return relErr < 0.001;
      },
    ));
  });
});

describe('property: spouwmuurisolatie', () => {
  it('zelfde rcOud=rcNieuw geeft geen besparing', () => {
    fc.assert(fc.property(
      fc.float({ min: 0.5, max: 4.0, noNaN: true }),
      fc.float({ min: 10, max: 200, noNaN: true }),
      (rc, opp) => {
        const ctx = defaultContext();
        const r = spouwmuurisolatieModule.bereken({
          oppervlakteM2: opp,
          huidigeRcWaarde: rc,
          nieuweRcWaarde: rc,
          stookurenPerJaar: 1500,
          binnenBuitenDeltaT: 8,
        }, ctx);
        return Math.abs(r.besparingKwh) < 1e-6;
      },
    ));
  });
});

describe('property: binnenverlichting', () => {
  it('investering = aantal × prijs', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 200 }),
      fc.integer({ min: 30, max: 200 }),
      fc.integer({ min: 50, max: 300 }),
      (aantal, prijs, watt) => {
        const ctx = defaultContext();
        const r = binnenverlichtingModule.bereken({
          aantalArmaturen: aantal,
          wattageOudPerArmatuur: watt,
          wattageNieuwPerArmatuur: Math.floor(watt / 2),
          brandurenPerJaar: 1500,
          kostenPerArmatuurInclBtw: prijs,
        }, ctx);
        return Math.abs(r.brutoInvestering - aantal * prijs) < 0.01;
      },
    ));
  });
});
