/**
 * Checklist huidige situatie — adviseur loopt door wat al goed is
 * en wat verbeterd kan worden. Per item een status (goed/matig/slecht)
 * en optionele notitie.
 */

import { useState } from 'react';
import { CHECKLIST, STATUS_LABELS, STATUS_KLEUREN, type ChecklistAntwoorden, type ItemStatus } from '../data/checklist';
import { InfoTooltip } from './InfoTooltip';

interface HuidigeSituatieProps {
  antwoorden: ChecklistAntwoorden;
  onChange: (antwoorden: ChecklistAntwoorden) => void;
}

const STATUSSEN: ItemStatus[] = ['goed', 'matig', 'slecht', 'onbekend'];

export function HuidigeSituatie({ antwoorden, onChange }: HuidigeSituatieProps) {
  // Voor compactheid: per categorie inklapbaar
  const [opengeklapt, setOpengeklapt] = useState<Record<string, boolean>>({
    gebouwschil: true,
  });

  function update(itemId: string, patch: Partial<{ status: ItemStatus; notitie: string }>) {
    const huidigeAntwoord = antwoorden[itemId] ?? { status: 'onbekend' as ItemStatus };
    onChange({
      ...antwoorden,
      [itemId]: {
        ...huidigeAntwoord,
        ...patch,
      },
    });
  }

  // Samenvattend overzicht: tel per categorie
  function categorieSamenvatting(categorieId: string): string {
    const cat = CHECKLIST.find(c => c.id === categorieId);
    if (!cat) return '';
    const counts = { goed: 0, matig: 0, slecht: 0, onbekend: 0 };
    for (const item of cat.items) {
      const status = antwoorden[item.id]?.status ?? 'onbekend';
      counts[status]++;
    }
    if (counts.onbekend === cat.items.length) return `${cat.items.length} punten`;
    return `${counts.goed} goed · ${counts.matig + counts.slecht} aandachtspunt${counts.matig + counts.slecht === 1 ? '' : 'en'}`;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Loop deze lijst door tijdens de scan. Vink per punt aan of het er <em>al goed</em> is,
        <em> kan beter</em>, of <em>niet aanwezig is</em>. Notities en aandachtspunten komen mee in het rapport.
      </p>

      {CHECKLIST.map(cat => {
        const isOpen = opengeklapt[cat.id] ?? false;
        return (
          <div key={cat.id} className="border border-primary-100 rounded-lg overflow-hidden bg-white">
            <button
              type="button"
              onClick={() => setOpengeklapt(p => ({ ...p, [cat.id]: !p[cat.id] }))}
              className="w-full px-4 py-2.5 flex items-center justify-between bg-primary-50/40 hover:bg-primary-50 transition-colors"
            >
              <span className="font-medium text-primary-900 flex items-center gap-2">
                <span className={`transition-transform text-sm ${isOpen ? 'rotate-90' : ''}`}>›</span>
                {cat.titel}
              </span>
              <span className="text-xs text-gray-500">{categorieSamenvatting(cat.id)}</span>
            </button>

            {isOpen && (
              <div className="p-3 space-y-2 border-t border-primary-100">
                {cat.items.map(item => {
                  const status = antwoorden[item.id]?.status ?? 'onbekend';
                  const notitie = antwoorden[item.id]?.notitie ?? '';
                  return (
                    <div key={item.id} className="bg-gray-50/50 rounded-md p-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <label className="flex-1 text-sm font-medium text-gray-800 flex items-center">
                          {item.label}
                          <InfoTooltip>{item.uitleg}</InfoTooltip>
                        </label>
                      </div>

                      {/* Status-knoppen */}
                      <div className="grid grid-cols-4 gap-1 mb-2">
                        {STATUSSEN.map(s => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => update(item.id, { status: s })}
                            className={`px-2 py-1.5 text-xs rounded border transition-all ${
                              status === s
                                ? STATUS_KLEUREN[s] + ' font-medium'
                                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            {STATUS_LABELS[s]}
                          </button>
                        ))}
                      </div>

                      {/* Optionele notitie */}
                      {(status === 'matig' || status === 'slecht' || notitie) && (
                        <input
                          type="text"
                          placeholder="Notitie (optioneel) — bijvoorbeeld: 'enkel glas in kantine, dubbel in kleedkamers'"
                          className="input py-1 text-xs"
                          value={notitie}
                          onChange={e => update(item.id, { notitie: e.target.value })}
                        />
                      )}
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
