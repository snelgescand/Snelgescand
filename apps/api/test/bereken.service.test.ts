/**
 * Tests voor bereken.service.ts.
 */

import { describe, it, expect } from 'vitest';
import { berekenProject, BerekenValidatieFout } from '../src/services/bereken.service.js';

const COMPLETE_ENERGIE = {
  gasverbruikM3: 5000,
  stroomverbruikTotaalKwh: 20000,
  gasprijsPerM3: 1.35,
  stroomprijsKaalPerKwh: 0.30,
};

describe('berekenProject', () => {
  it('berekent met realistische state (dak + LED)', () => {
    const state = {
      context: {
        club: { naam: 'Test FC' },
        gebouw: { bouwjaar: 1985, bvoTotaalM2: 250 },
        energie: COMPLETE_ENERGIE,
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
    expect(overgeslagen).toHaveLength(0);
  });

  it('werkt met lege maatregel-lijst', () => {
    const { perMaatregel, rollup } = berekenProject({
      context: { energie: COMPLETE_ENERGIE },
      gekozenMaatregelen: {},
    });
    expect(Object.keys(perMaatregel)).toHaveLength(0);
    expect(rollup.totaleInvestering).toBe(0);
  });

  it('slaat onbekende maatregel-id over zonder te crashen', () => {
    const { overgeslagen } = berekenProject({
      context: { energie: COMPLETE_ENERGIE },
      gekozenMaatregelen: { 'nepmaatregel': {} },
    });
    expect(overgeslagen).toHaveLength(1);
    expect(overgeslagen[0].id).toBe('nepmaatregel');
  });

  it('gooit BerekenValidatieFout bij missend gasverbruik', () => {
    expect(() => berekenProject({
      context: { energie: { stroomverbruikTotaalKwh: 20000, gasprijsPerM3: 1.35, stroomprijsKaalPerKwh: 0.30 } },
      gekozenMaatregelen: {},
    })).toThrow(BerekenValidatieFout);
  });

  it('gooit BerekenValidatieFout bij lege context', () => {
    expect(() => berekenProject(null)).toThrow(BerekenValidatieFout);
    expect(() => berekenProject({})).toThrow(BerekenValidatieFout);
  });

  it('vult lege input voor maatregel automatisch met defaults', () => {
    const { perMaatregel, overgeslagen } = berekenProject({
      context: { gebouw: { bouwjaar: 1990, bvoTotaalM2: 300 }, energie: COMPLETE_ENERGIE },
      gekozenMaatregelen: { 'binnenverlichting': null },
    });
    expect(overgeslagen).toHaveLength(0);
    expect(perMaatregel['binnenverlichting']).toBeDefined();
  });

  it('sanitizeert Infinity in resultaat naar null', () => {
    const { rollup } = berekenProject({
      context: { energie: COMPLETE_ENERGIE },
      gekozenMaatregelen: {},
    });
    expect(rollup.gemiddeldeTerugverdientijdJaren).toBeNull();
  });
});
