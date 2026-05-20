/**
 * Verbruiksinvoer met twee modi:
 *  - Eenvoudig: alleen laatste jaar (gasverbruikM3 + stroomverbruikTotaalKwh)
 *  - Uitgebreid: 3 jaar historisch (jaar 1, jaar 2, jaar 3); gemiddelde wordt
 *    automatisch berekend en in `gasverbruikM3` / `stroomverbruikTotaalKwh` gezet
 *    zodat alle bestaande berekeningen blijven werken.
 */

import { useState, useEffect } from 'react';
import { InfoTooltip } from './InfoTooltip';

export interface VerbruikData {
  gasverbruikM3?: number;
  stroomverbruikTotaalKwh?: number;
  gasprijsPerM3?: number;
  stroomprijsKaalPerKwh?: number;
  /** Optioneel: gasverbruik per jaar van afgelopen 3 jaar. Index 0 = meest recent */
  gasHistorischM3?: number[];
  /** Optioneel: stroomverbruik per jaar van afgelopen 3 jaar */
  stroomHistorischKwh?: number[];
}

interface Props {
  energie: VerbruikData;
  onChange: (patch: Partial<VerbruikData>) => void;
}

export function HistorischVerbruik({ energie, onChange }: Props) {
  const heeftHistorisch = Array.isArray(energie.gasHistorischM3) && energie.gasHistorischM3.length >= 2;
  const [uitgebreid, setUitgebreid] = useState(heeftHistorisch);

  // Wanneer historisch wordt ingevuld: bereken het gemiddelde en zet het in de
  // hoofdvelden zodat alle berekeningen daarmee werken.
  useEffect(() => {
    if (!uitgebreid) return;
    const gh = energie.gasHistorischM3?.filter(v => typeof v === 'number' && v > 0) ?? [];
    const sh = energie.stroomHistorischKwh?.filter(v => typeof v === 'number' && v > 0) ?? [];
    const patch: Partial<VerbruikData> = {};
    if (gh.length > 0) {
      const avg = Math.round(gh.reduce((a, b) => a + b, 0) / gh.length);
      if (avg !== energie.gasverbruikM3) patch.gasverbruikM3 = avg;
    }
    if (sh.length > 0) {
      const avg = Math.round(sh.reduce((a, b) => a + b, 0) / sh.length);
      if (avg !== energie.stroomverbruikTotaalKwh) patch.stroomverbruikTotaalKwh = avg;
    }
    if (Object.keys(patch).length > 0) onChange(patch);
  }, [uitgebreid, energie.gasHistorischM3, energie.stroomHistorischKwh]);

  function updateHistorisch(soort: 'gas' | 'stroom', jaarIndex: number, waarde: number | undefined) {
    const key = soort === 'gas' ? 'gasHistorischM3' : 'stroomHistorischKwh';
    const huidig = energie[key] ?? [];
    const nieuw = [...huidig];
    while (nieuw.length < 3) nieuw.push(0);
    nieuw[jaarIndex] = waarde ?? 0;
    onChange({ [key]: nieuw });
  }

  const huidigJaar = new Date().getFullYear();

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-600">
          {uitgebreid ? '3 jaar historisch verbruik' : 'Verbruik laatste jaar'}
          <InfoTooltip>
            Een 3-jarig gemiddelde geeft een betrouwbaarder beeld omdat strenge winters of warme zomers
            individuele jaren sterk kunnen beïnvloeden. Het gemiddelde wordt automatisch gebruikt voor
            alle verdere berekeningen.
          </InfoTooltip>
        </span>
        <button
          type="button"
          onClick={() => setUitgebreid(u => !u)}
          className="text-xs text-primary-700 hover:underline"
        >
          {uitgebreid ? '↑ Eenvoudig (alleen laatste jaar)' : '↓ 3 jaar historisch invullen'}
        </button>
      </div>

      {!uitgebreid && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label text-sm">Gas (m³/jaar)</label>
            <input type="number" className="input" placeholder="bv. 5.000"
              value={energie.gasverbruikM3 ?? ''}
              onChange={e => onChange({ gasverbruikM3: e.target.value ? Number(e.target.value) : undefined })} />
          </div>
          <div>
            <label className="label text-sm">Stroom (kWh/jaar)</label>
            <input type="number" className="input" placeholder="bv. 25.000"
              value={energie.stroomverbruikTotaalKwh ?? ''}
              onChange={e => onChange({ stroomverbruikTotaalKwh: e.target.value ? Number(e.target.value) : undefined })} />
          </div>
        </div>
      )}

      {uitgebreid && (
        <div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-primary-100">
                <th className="text-left font-medium text-gray-600 py-1.5">Jaar</th>
                <th className="text-left font-medium text-gray-600 py-1.5">Gas (m³)</th>
                <th className="text-left font-medium text-gray-600 py-1.5">Stroom (kWh)</th>
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2].map(i => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="py-1.5 pr-3 text-gray-700">{huidigJaar - 1 - i}</td>
                  <td className="py-1.5 pr-3">
                    <input type="number" className="input py-1 text-sm" placeholder={i === 0 ? 'bv. 5.000' : ''}
                      value={energie.gasHistorischM3?.[i] || ''}
                      onChange={e => updateHistorisch('gas', i, e.target.value ? Number(e.target.value) : undefined)} />
                  </td>
                  <td className="py-1.5">
                    <input type="number" className="input py-1 text-sm" placeholder={i === 0 ? 'bv. 25.000' : ''}
                      value={energie.stroomHistorischKwh?.[i] || ''}
                      onChange={e => updateHistorisch('stroom', i, e.target.value ? Number(e.target.value) : undefined)} />
                  </td>
                </tr>
              ))}
              <tr className="font-medium text-primary-800 bg-primary-50/40">
                <td className="py-1.5 pr-3">Gemiddelde</td>
                <td className="py-1.5 pr-3">{energie.gasverbruikM3 ? `${energie.gasverbruikM3.toLocaleString('nl-NL')} m³` : '—'}</td>
                <td className="py-1.5">{energie.stroomverbruikTotaalKwh ? `${energie.stroomverbruikTotaalKwh.toLocaleString('nl-NL')} kWh` : '—'}</td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-gray-500 mt-2">
            Het gemiddelde wordt automatisch berekend en in alle verdere berekeningen gebruikt.
          </p>
        </div>
      )}
    </div>
  );
}
