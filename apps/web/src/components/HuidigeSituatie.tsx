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
  /** Bouwjaar uit project — wordt gebruikt voor suggesties bij isolatie-keuzes */
  bouwjaar?: number;
}

/**
 * Bepaal de meest waarschijnlijke "standaard" optie op basis van bouwjaar.
 * Gebaseerd op de originele Op Naar Nul / Sportief Opgewekt-tabel:
 *  - tot 1965: geen isolatie
 *  - 1965-1975: beperkt
 *  - 1975-1992: matig
 *  - 1992-2012: modern
 *  - vanaf 2012: goed
 */
function suggestieVoorBouwjaar(itemId: string, bouwjaar?: number): string | null {
  if (!bouwjaar) return null;
  if (itemId === 'dakisolatie' || itemId === 'vloerisolatie') {
    if (bouwjaar < 1965) return 'geen';
    if (bouwjaar < 1975) return 'beperkt';
    if (bouwjaar < 1992) return 'matig';
    if (bouwjaar < 2012) return 'modern';
    return 'goed';
  }
  if (itemId === 'gevelisolatie') {
    if (bouwjaar < 1920) return 'geen-spouw';
    if (bouwjaar < 1975) return 'spouw-leeg';
    if (bouwjaar < 1992) return 'spouw-gevuld';
    return 'modern-bouw';
  }
  if (itemId === 'glas') {
    if (bouwjaar < 1975) return 'enkel';
    if (bouwjaar < 1995) return 'dubbel';
    if (bouwjaar < 2005) return 'hr';
    return 'hr-pp';
  }
  return null;
}

export function HuidigeSituatie({ data, onChange, bouwjaar }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({ gebouwschil: true });

  function updateItem(itemId: string, patch: Partial<{ keuze: string; keuzes: string[]; notitie: string; extraToegestaan: boolean }>) {
    onChange({
      ...data,
      [itemId]: { ...data[itemId], ...patch },
    });
  }

  /** Multi-select: zet/haal een waarde, en leid keuze (hoogst scorend) af voor compat. */
  function toggleMulti(item: { id: string; opties: { waarde: string; score: number }[] }, waarde: string) {
    const huidig = data[item.id]?.keuzes ?? [];
    const nieuw = huidig.includes(waarde)
      ? huidig.filter(w => w !== waarde)
      : [...huidig, waarde];
    // representatieve enkelvoudige keuze = hoogst scorende selectie (voor PPT/engine)
    const beste = item.opties
      .filter(o => nieuw.includes(o.waarde))
      .sort((a, b) => b.score - a.score)[0];
    updateItem(item.id, { keuzes: nieuw, keuze: beste?.waarde });
  }

  function countIngevuld(catId: string): { ingevuld: number; totaal: number } {
    const cat = HUIDIGE_SITUATIE.find(c => c.id === catId)!;
    const ingevuld = cat.items.filter(it => {
      const a = data[it.id];
      if (it.multiSelect) return (a?.keuzes?.length ?? 0) > 0;
      return a?.keuze && a.keuze !== 'onbekend';
    }).length;
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

                      {item.multiSelect ? (
                        <div className="mb-2 grid sm:grid-cols-2 gap-1.5">
                          {item.opties.map(o => {
                            const aan = (antwoord.keuzes ?? []).includes(o.waarde);
                            return (
                              <label
                                key={o.waarde}
                                className={`flex items-start gap-2 text-sm rounded px-2 py-1.5 border cursor-pointer transition-colors ${
                                  aan ? 'bg-primary-50 border-primary-300' : 'bg-white border-gray-200 hover:border-gray-300'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  className="mt-0.5"
                                  checked={aan}
                                  onChange={() => toggleMulti(item, o.waarde)}
                                />
                                <span className="text-gray-800">{o.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
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
                      )}

                      {/* Extra-unit-vinkje (bv. bij bestaande WTW: tóch nieuwe unit in advies houden) */}
                      {item.extraToegestaanBij && item.extraToegestaanBij.includes(antwoord.keuze ?? '') && (
                        <label className="mb-2 flex items-start gap-2 text-xs bg-primary-50/60 border border-primary-100 rounded px-2 py-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={antwoord.extraToegestaan ?? false}
                            onChange={e => updateItem(item.id, { extraToegestaan: e.target.checked })}
                          />
                          <span className="text-gray-700">{item.extraToegestaanLabel ?? 'Er mag tóch een extra/nieuwe unit bij'}</span>
                        </label>
                      )}

                      {/* Suggestie op basis van bouwjaar */}
                      {(() => {
                        const sugg = suggestieVoorBouwjaar(item.id, bouwjaar);
                        if (!sugg || sugg === keuze) return null;
                        const optie = item.opties.find(o => o.waarde === sugg);
                        if (!optie) return null;
                        return (
                          <div className="mb-2 text-xs flex items-start gap-2 bg-primary-50/60 border border-primary-100 rounded px-2 py-1.5">
                            <span className="text-primary-700">💡</span>
                            <span className="flex-1 text-gray-700">
                              Bij bouwjaar {bouwjaar} verwacht: <strong>{optie.label}</strong>
                            </span>
                            <button
                              type="button"
                              onClick={() => updateItem(item.id, { keuze: sugg })}
                              className="text-primary-700 hover:underline font-medium whitespace-nowrap"
                            >
                              Gebruik
                            </button>
                          </div>
                        );
                      })()}

                      {(() => {
                        const isVrijeTekst = item.id.includes('vrije-notitie')
                          || ['overig', 'meerdere', 'zie-notitie'].includes(antwoord.keuze ?? '')
                          || (antwoord.keuzes ?? []).some(w => ['overig', 'meerdere', 'zie-notitie'].includes(w));
                        const placeholder = isVrijeTekst
                          ? 'Licht hier toe — bv. "dak in 2018 volledig vernieuwd incl. 12 cm PIR-isolatie, leverancier X" of "ALV-bevoegdheid tot €50k zonder ledenbesluit"…'
                          : 'Notitie (optioneel) — bv. \'enkel glas alleen in kantine\'';
                        return isVrijeTekst ? (
                          <textarea
                            placeholder={placeholder}
                            className="input py-1 text-xs"
                            rows={3}
                            value={antwoord.notitie ?? ''}
                            onChange={e => updateItem(item.id, { notitie: e.target.value })}
                          />
                        ) : (
                          <input
                            type="text"
                            placeholder={placeholder}
                            className="input py-1 text-xs"
                            value={antwoord.notitie ?? ''}
                            onChange={e => updateItem(item.id, { notitie: e.target.value })}
                          />
                        );
                      })()}
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
