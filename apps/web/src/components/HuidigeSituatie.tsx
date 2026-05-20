/**
 * Inventarisatie huidige situatie — gebruikt dropdowns met concrete opties
 * per item (i.p.v. alleen goed/matig/slecht).
 *
 * Elke optie heeft een ingebouwde score 0-100 die de aanbeveling-engine
 * in stap 2 gebruikt om maatregelen te rangschikken.
 */

import { useState } from 'react';
import { HUIDIGE_SITUATIE, type HuidigeSituatieData } from '../data/huidige-situatie';
import { InfoTooltip } from './InfoTooltip';

interface Props {
  data: HuidigeSituatieData;
  onChange: (data: HuidigeSituatieData) => void;
}

export function HuidigeSituatie({ data, onChange }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({ gebouwschil: true });

  function updateItem(itemId: string, patch: Partial<{ keuze: string; notitie: string }>) {
    onChange({
      ...data,
      [itemId]: { ...data[itemId], ...patch },
    });
  }

  function countIngevuld(catId: string): { ingevuld: number; totaal: number } {
    const cat = HUIDIGE_SITUATIE.find(c => c.id === catId)!;
    const ingevuld = cat.items.filter(it => data[it.id]?.keuze && data[it.id]?.keuze !== 'onbekend').length;
    return { ingevuld, totaal: cat.items.length };
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Loop deze lijst door tijdens de scan. <strong>Hoe specifieker je invult, hoe beter de aanbevelingen in stap 2.</strong>
      </p>

      {HUIDIGE_SITUATIE.map(cat => {
        const isOpen = open[cat.id] ?? false;
        const { ingevuld, totaal } = countIngevuld(cat.id);
        return (
          <div key={cat.id} className="border border-primary-100 rounded-lg overflow-hidden bg-white">
            <button
              type="button"
              onClick={() => setOpen(p => ({ ...p, [cat.id]: !p[cat.id] }))}
              className="w-full px-4 py-2.5 flex items-center justify-between bg-primary-50/40 hover:bg-primary-50 transition-colors"
            >
              <span className="font-medium text-primary-900 flex items-center gap-2">
                <span className={`transition-transform text-sm ${isOpen ? 'rotate-90' : ''}`}>›</span>
                {cat.titel}
              </span>
              <span className="text-xs text-gray-500">
                {ingevuld === 0 ? `${totaal} punten` : `${ingevuld}/${totaal} ingevuld`}
              </span>
            </button>

            {isOpen && (
              <div className="p-3 space-y-3 border-t border-primary-100">
                {cat.items.map(item => {
                  const antwoord = data[item.id] ?? {};
                  const keuze = antwoord.keuze ?? '';
                  return (
                    <div key={item.id} className="bg-gray-50/60 rounded-md p-3">
                      <label className="block text-sm font-medium text-gray-800 mb-1.5 flex items-center">
                        {item.label}
                        <InfoTooltip>{item.uitleg}</InfoTooltip>
                      </label>

                      <select
                        className="input py-1.5 text-sm mb-2"
                        value={keuze}
                        onChange={e => updateItem(item.id, { keuze: e.target.value })}
                      >
                        <option value="">— Kies —</option>
                        {item.opties.map(o => (
                          <option key={o.waarde} value={o.waarde}>{o.label}</option>
                        ))}
                      </select>

                      <input
                        type="text"
                        placeholder="Notitie (optioneel) — bv. 'enkel glas alleen in kantine'"
                        className="input py-1 text-xs"
                        value={antwoord.notitie ?? ''}
                        onChange={e => updateItem(item.id, { notitie: e.target.value })}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
