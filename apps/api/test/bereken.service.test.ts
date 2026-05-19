/**
 * Tests voor bereken.service.ts — de defensieve brug tussen Project.state
 * JSONB en calc-core.
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

    const { perMaatregel, rollup, overgeslagen } = berekenProject(state);

    expect(perMaatregel['dakisolatie']).toBeDefined();
    expect(perMaatregel['binnenverlichting']).toBeDefined();
    expect(rollup.totaleInvestering).toBeGreaterThan(0);
    expect(rollup.totaleBesparingPerJaar).toBeGreaterThan(0);
    expect(rollup.nettoInvestering).toBeLessThanOrEqual(rollup.totaleInvestering);
    expect(overgeslagen).toHaveLength(0);
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

  it('slaat onbekende maatregel-id over zonder te crashen', () => {
    const { overgeslagen, rollup } = berekenProject({
      context: {},
      gekozenMaatregelen: { 'nepmaatregel': {} },
    });
    expect(overgeslagen).toHaveLength(1);
    expect(overgeslagen[0].id).toBe('nepmaatregel');
    expect(rollup).toBeDefined();
  });

  it('werkt met missende context (gebruikt defaults)', () => {
    const { rollup } = berekenProject({ gekozenMaatregelen: {} });
    expect(rollup).toBeDefined();
    expect(rollup.totaleInvestering).toBe(0);
  });

  it('werkt met null state (lege defaults)', () => {
    const { rollup } = berekenProject(null);
    expect(rollup).toBeDefined();
    expect(rollup.totaleInvestering).toBe(0);
  });

  it('vult lege input voor maatregel automatisch met defaults', () => {
    const { perMaatregel, overgeslagen } = berekenProject({
      context: { gebouw: { bouwjaar: 1990, bvoTotaalM2: 300 } },
      gekozenMaatregelen: { 'binnenverlichting': null },
    });
    expect(overgeslagen).toHaveLength(0);
    expect(perMaatregel['binnenverlichting']).toBeDefined();
  });

  it('sanitizeert Infinity in resultaat naar null', () => {
    const { rollup } = berekenProject({
      context: {},
      gekozenMaatregelen: {},
    });
    // Lege maatregelenlijst → TVT = Infinity → moet null worden
    expect(rollup.gemiddeldeTerugverdientijdJaren).toBeNull();
  });
});
