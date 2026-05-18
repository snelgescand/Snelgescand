/**
 * Tests voor bereken.service.ts — de brug tussen Project.state JSONB en calc-core.
 */

import { describe, it, expect } from 'vitest';
import { berekenProject } from '../src/services/bereken.service.js';

describe('berekenProject', () => {
  it('berekent met realistische state (dak + LED)', () => {
    const state = {
      context: {
        club: { naam: 'Test FC' },
        gebouw: { bouwjaar: 1985, bvoTotaalM2: 250 },
      },
      gekozenMaatregelen: {
        'dakisolatie': {
          oppervlakteM2: 250,
          huidigeRcWaarde: 0.86,
          nieuweRcWaarde: 3.5,
          isolatieType: 'standaard',
          stookurenPerJaar: 1500,
          binnenBuitenDeltaT: 8,
        },
        'binnenverlichting': {
          aantalArmaturen: 30,
          wattageOudPerArmatuur: 58,
          wattageNieuwPerArmatuur: 24,
          brandurenPerJaar: 1500,
          kostenPerArmatuurInclBtw: 75,
        },
      },
    };

    const { perMaatregel, rollup } = berekenProject(state);

    expect(perMaatregel['dakisolatie']).toBeDefined();
    expect(perMaatregel['binnenverlichting']).toBeDefined();
    expect(rollup.totaleInvestering).toBeGreaterThan(0);
    expect(rollup.totaleBesparingPerJaar).toBeGreaterThan(0);
    expect(rollup.nettoInvestering).toBeLessThanOrEqual(rollup.totaleInvestering);
  });

  it('werkt met lege maatregel-lijst', () => {
    const { perMaatregel, rollup } = berekenProject({
      context: {},
      gekozenMaatregelen: {},
    });
    expect(Object.keys(perMaatregel)).toHaveLength(0);
    expect(rollup.totaleInvestering).toBe(0);
    expect(rollup.totaleBesparingPerJaar).toBe(0);
  });

  it('gooit fout bij onbekende maatregel-id', () => {
    expect(() => berekenProject({
      context: {},
      gekozenMaatregelen: { 'nepmaatregel': {} },
    })).toThrow(/Onbekende maatregel/);
  });

  it('gooit fout bij missende context', () => {
    expect(() => berekenProject({ gekozenMaatregelen: {} })).toThrow(/context ontbreekt/);
  });

  it('gooit fout bij missende gekozenMaatregelen', () => {
    expect(() => berekenProject({ context: {} })).toThrow(/gekozenMaatregelen ontbreekt/);
  });

  it('gooit fout bij null state', () => {
    expect(() => berekenProject(null)).toThrow();
  });
});
