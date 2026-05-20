/**
 * Aannames-editor — laat een gebruiker de default-waarden zien die in de
 * berekening gebruikt worden, en sla overrides op in localStorage.
 *
 * Dit is een eenvoudige eerste versie: per kostenpost één getal aanpassen.
 * Bij aanmaak van een nieuw project worden deze als suggested defaults gebruikt.
 *
 * Bart wil eenvoudig per maatregel de geschatte kosten kunnen tweaken,
 * omdat warmtepompen erg variëren in prijs. Excel-gemiddelden zijn de defaults.
 */

import { useState, useEffect } from 'react';

interface AannamePost {
  key: string;
  label: string;
  excelDefault: number;
  eenheid: string;
  toelichting: string;
}

// Hardcoded uit Excel rekenmodel — defaults die in de berekening worden gebruikt
const AANNAMES: AannamePost[] = [
  // Subsidies
  { key: 'subsidie.dumavaPct', label: 'DUMAVA-subsidie standaard', excelDefault: 0.20, eenheid: '%', toelichting: 'Excel default: 20%. Bij integraal pakket: 30-40%.' },
  { key: 'subsidie.iasPct', label: 'IAS-subsidie', excelDefault: 0.60, eenheid: '%', toelichting: 'Excel default: 60%' },
  { key: 'subsidie.gemeenteEenDerdePct', label: '1/3 regeling gemeente', excelDefault: 0.3333, eenheid: '%', toelichting: 'Wisselt per gemeente. Default 33%.' },

  // CO2-factoren
  { key: 'co2.gasKgPerM3', label: 'CO₂ per m³ gas', excelDefault: 2.05, eenheid: 'kg', toelichting: 'Excel default: 2,05 kg CO₂/m³' },
  { key: 'co2.stroomKgPerKwh', label: 'CO₂ per kWh stroom', excelDefault: 0.337, eenheid: 'kg', toelichting: 'NL elektriciteitsmix 2024' },

  // Isolatie-kosten
  { key: 'kosten.dakisolatiePerM2', label: 'Dakisolatie kosten per m²', excelDefault: 65, eenheid: '€/m²', toelichting: 'Inclusief BTW en installatie. Varieert 50-90.' },
  { key: 'kosten.spouwmuurisolatiePerM2', label: 'Spouwmuurisolatie per m²', excelDefault: 27.50, eenheid: '€/m²', toelichting: 'Parel- of schuimvulling.' },
  { key: 'kosten.vloerisolatiePerM2', label: 'Vloerisolatie per m²', excelDefault: 60, eenheid: '€/m²', toelichting: 'PIR/EPS, gemiddeld.' },
  { key: 'kosten.glasHrPpPerM2', label: 'HR++ glas per m²', excelDefault: 175, eenheid: '€/m²', toelichting: 'Excel rekenmodel default' },

  // Installatie-kosten
  { key: 'kosten.waterzijdigInregelenPerRadiator', label: 'Waterzijdig inregelen per radiator', excelDefault: 350, eenheid: '€', toelichting: 'Marktconform per aflevering.' },
  { key: 'kosten.zonnepaneelPerWp', label: 'Zonnepaneel prijs per Wp', excelDefault: 1.21, eenheid: '€/Wp', toelichting: 'Excel: schaal van 0,98 tot 1,39 afhankelijk van omvang' },

  // Warmtepompen — uit Excel kostenstaffels
  { key: 'kosten.qtonWarmtepomp', label: 'Q-ton CO₂-warmtepomp', excelDefault: 18000, eenheid: '€', toelichting: 'Voor middelgrote sportclub. Varieert sterk per leverancier.' },
  { key: 'kosten.lmntWarmtepomp', label: 'LMNT warmtepomp', excelDefault: 22000, eenheid: '€', toelichting: 'Inclusief installatie en aansluiting' },
  { key: 'kosten.luchtWaterWp', label: 'Lucht/water warmtepomp', excelDefault: 14000, eenheid: '€', toelichting: 'Vanaf bv. Daikin/Mitsubishi 15kW.' },
  { key: 'kosten.luchtLuchtWp', label: 'Lucht/lucht warmtepomp', excelDefault: 8000, eenheid: '€', toelichting: 'Voor kantine/zaal, geen tapwater.' },
  { key: 'kosten.hybrideWarmtepomp', label: 'Hybride warmtepomp', excelDefault: 12000, eenheid: '€', toelichting: 'Naast bestaande CV-ketel.' },
  { key: 'kosten.warmtepompBoiler', label: 'Warmtepomp-boiler', excelDefault: 4500, eenheid: '€', toelichting: 'Per 300L tank incl. installatie.' },
  { key: 'kosten.pvtTapwater', label: 'PVT-tapwater set', excelDefault: 16000, eenheid: '€', toelichting: 'PV + thermisch hybride paneel set.' },

  // EPEX / accu
  { key: 'accu.brutoPerKwh', label: 'Accu bruto prijs per kWh', excelDefault: 450, eenheid: '€/kWh', toelichting: 'Volgens Excel: voor 100 kWh circa €121.000 = €1.210/kWh, maar incl. installatie.' },
  { key: 'accu.terugleverVergoeding', label: 'Terugleververgoeding na saldering', excelDefault: 0.08, eenheid: '€/kWh', toelichting: 'Excel: €0,08/kWh' },
  { key: 'accu.boeteTerugleveringPerKwh', label: 'Boete teruglevering', excelDefault: 0.055, eenheid: '€/kWh', toelichting: 'Netcongestie-tarief 2025' },
];

const STORAGE_KEY = 'sopg.aannames.overrides';

function laadOverrides(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function bewaarOverrides(o: Record<string, number>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(o));
  } catch {
    /* localStorage vol of disabled */
  }
}

export function AannamesEditor() {
  const [overrides, setOverrides] = useState<Record<string, number>>(() => laadOverrides());
  const [filter, setFilter] = useState('');

  useEffect(() => {
    bewaarOverrides(overrides);
  }, [overrides]);

  function reset(key: string) {
    setOverrides(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function resetAll() {
    if (!confirm('Alle aannames terugzetten naar Excel-defaults?')) return;
    setOverrides({});
  }

  const gefilterd = AANNAMES.filter(a =>
    !filter || a.label.toLowerCase().includes(filter.toLowerCase()) || a.key.toLowerCase().includes(filter.toLowerCase()),
  );

  const aantalAangepast = Object.keys(overrides).length;

  return (
    <div>
      <div className="bg-primary-50/60 border border-primary-100 rounded-lg p-4 mb-4 text-sm">
        <p className="text-primary-900 font-medium mb-1">Aannames & kostenposten</p>
        <p className="text-gray-700">
          Bart heeft hier de waarden uit het originele Excel-rekenmodel ingevuld. Hier kun je per
          parameter een eigen waarde instellen die in nieuwe projecten als default wordt gebruikt.
          Je overrides worden lokaal opgeslagen (in je browser) en gelden voor alle projecten die
          je vanaf nu maakt.
        </p>
        {aantalAangepast > 0 && (
          <p className="text-accent-orange-dark mt-2">
            {aantalAangepast} aanname(s) overschreven · <button onClick={resetAll} className="underline">Allemaal resetten</button>
          </p>
        )}
      </div>

      <input
        type="search"
        className="input mb-3"
        placeholder="Zoek aanname (bv. 'warmtepomp', 'dak', 'subsidie')"
        value={filter}
        onChange={e => setFilter(e.target.value)}
      />

      <div className="bg-white rounded-lg shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-primary-50/50 text-primary-900">
              <th className="text-left px-4 py-2 font-medium">Aanname</th>
              <th className="text-right px-4 py-2 font-medium">Excel default</th>
              <th className="text-right px-4 py-2 font-medium">Jouw waarde</th>
              <th className="text-right px-4 py-2 font-medium w-20"></th>
            </tr>
          </thead>
          <tbody>
            {gefilterd.map(a => {
              const override = overrides[a.key];
              const huidig = override ?? a.excelDefault;
              const isOverridden = override !== undefined;
              return (
                <tr key={a.key} className="border-t border-gray-100">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-gray-800">{a.label}</div>
                    <div className="text-xs text-gray-500">{a.toelichting}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-500 whitespace-nowrap">
                    {a.excelDefault.toLocaleString('nl-NL', { maximumFractionDigits: 4 })} {a.eenheid}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <input
                      type="number"
                      step="any"
                      className={`input py-1 text-sm text-right max-w-[110px] ${isOverridden ? 'border-accent-orange bg-orange-50' : ''}`}
                      value={huidig}
                      onChange={e => {
                        const v = parseFloat(e.target.value);
                        if (!Number.isNaN(v)) {
                          setOverrides(prev => ({ ...prev, [a.key]: v }));
                        }
                      }}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {isOverridden && (
                      <button onClick={() => reset(a.key)} className="text-xs text-gray-500 hover:text-primary-700">
                        ↺ reset
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500 mt-3">
        Tip: voor warmtepompen variëren prijzen sterk per leverancier en project. De Excel-defaults
        zijn gemiddelden — pas aan op basis van eigen offertes voor accuratere businesscases.
      </p>
    </div>
  );
}

/** Voor andere modules: haal een override (of default) op. */
export function getAanname(key: string, excelDefault: number): number {
  const o = laadOverrides();
  return o[key] ?? excelDefault;
}
