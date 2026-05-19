/**
 * Adres-zoeker met autocomplete via PDOK Locatieserver.
 *
 * Geeft via onAdresGekozen het geselecteerde adres terug, inclusief
 * bouwjaar, oppervlakte en coördinaten (voor luchtfoto).
 */

import { useState, useEffect, useRef } from 'react';
import { pdokSuggest, pdokLookup, type PdokSuggestie, type PdokAdres } from '../api/pdok';

interface AdresZoekerProps {
  initieel?: string;
  onAdresGekozen: (adres: PdokAdres) => void;
}

export function AdresZoeker({ initieel = '', onAdresGekozen }: AdresZoekerProps) {
  const [query, setQuery] = useState(initieel);
  const [suggesties, setSuggesties] = useState<PdokSuggestie[]>([]);
  const [open, setOpen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const blurTimer = useRef<number | null>(null);

  // Debounce zoeken
  useEffect(() => {
    if (query.length < 3) {
      setSuggesties([]);
      return;
    }
    const handle = setTimeout(async () => {
      const res = await pdokSuggest(query);
      setSuggesties(res);
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  async function kies(s: PdokSuggestie) {
    setBezig(true);
    setOpen(false);
    setQuery(s.weergavenaam);
    try {
      const adres = await pdokLookup(s.id);
      if (adres) onAdresGekozen(adres);
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="relative">
      <input
        type="text"
        className="input"
        placeholder="Begin te typen: postcode, straat of plaats…"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Iets vertraging zodat klik op suggestie nog werkt
          blurTimer.current = window.setTimeout(() => setOpen(false), 150);
        }}
        disabled={bezig}
      />
      {open && suggesties.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-72 overflow-y-auto">
          {suggesties.map(s => (
            <li key={s.id}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-primary-50 text-sm"
                onMouseDown={() => {
                  if (blurTimer.current) clearTimeout(blurTimer.current);
                  kies(s);
                }}
              >
                {s.weergavenaam}
              </button>
            </li>
          ))}
        </ul>
      )}
      {bezig && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
          Bezig…
        </div>
      )}
    </div>
  );
}
