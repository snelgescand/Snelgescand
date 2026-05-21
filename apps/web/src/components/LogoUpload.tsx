/**
 * Club-logo upload — met auto-zoek + URL-fallback.
 *
 * Drie opties:
 *  1. Auto-zoek op clubnaam (probeert vvX.nl / X.nl / etc., parsed og:image)
 *  2. URL plakken (van clubwebsite of direct image-URL)
 *  3. Bestand uploaden (PNG/JPG/SVG)
 *
 * Logo komt in PowerPoint terecht + in het projectoverzicht.
 * Limiet: 500 KB om de presentatie compact te houden.
 */

import { useRef, useState } from 'react';
import { logoApi } from '../api/client';

const MAX_LOGO_BYTES = 500_000;
const RESIZE_MAX_WIDTH = 400;

export interface ClubLogo {
  bestandsnaam: string;
  dataUrl: string;
  bytes: number;
  bron?: 'upload' | 'auto-zoek' | 'url';
}

interface LogoUploadProps {
  logo?: ClubLogo;
  clubnaam?: string;   // gebruikt voor auto-zoek
  onChange: (logo: ClubLogo | undefined) => void;
}

export function LogoUpload({ logo, clubnaam, onChange }: LogoUploadProps) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [urlInvoer, setUrlInvoer] = useState('');
  const [toonUrlInput, setToonUrlInput] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function verwerkBestand(file: File) {
    setBezig(true);
    setFout(null);
    try {
      if (!file.type.startsWith('image/')) {
        setFout('Alleen afbeeldingen (PNG, JPG, SVG)');
        return;
      }
      let dataUrl: string;
      if (file.type === 'image/svg+xml') {
        const text = await file.text();
        dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}`;
      } else {
        dataUrl = await resizeNaarBase64(file);
      }
      const bytes = Math.round((dataUrl.length * 3) / 4);
      if (bytes > MAX_LOGO_BYTES) {
        setFout(`Logo is na resize nog ${Math.round(bytes / 1024)} KB — max 500 KB. Gebruik een kleinere bron-afbeelding.`);
        return;
      }
      onChange({ bestandsnaam: file.name, dataUrl, bytes, bron: 'upload' });
    } catch (e) {
      setFout('Fout bij verwerken: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBezig(false);
    }
  }

  async function autoZoek() {
    if (!clubnaam || clubnaam.length < 2) {
      setFout('Vul eerst de clubnaam in');
      return;
    }
    setBezig(true);
    setFout(null);
    try {
      const res = await logoApi.zoek(clubnaam);
      if (!res.gevonden || !res.dataUrl) {
        setFout(`Geen logo gevonden. Geprobeerd: ${(res.geprobeerd ?? []).slice(0, 4).join(', ')}…`);
        return;
      }
      onChange({
        bestandsnaam: `Logo van ${res.domein}`,
        dataUrl: res.dataUrl,
        bytes: res.bytes ?? 0,
        bron: 'auto-zoek',
      });
    } catch (e) {
      setFout('Auto-zoek mislukt: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBezig(false);
    }
  }

  async function downloadVanUrl() {
    if (!urlInvoer || !/^https?:\/\//.test(urlInvoer)) {
      setFout('URL moet beginnen met http(s)://');
      return;
    }
    setBezig(true);
    setFout(null);
    try {
      const res = await logoApi.download(urlInvoer);
      if (!res.gevonden || !res.dataUrl) {
        setFout('Logo niet gevonden op die URL');
        return;
      }
      onChange({
        bestandsnaam: res.logoUrl?.split('/').pop() ?? 'logo',
        dataUrl: res.dataUrl,
        bytes: res.bytes ?? 0,
        bron: 'url',
      });
      setToonUrlInput(false);
      setUrlInvoer('');
    } catch (e) {
      setFout('Download mislukt: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBezig(false);
    }
  }

  return (
    <div>
      {logo ? (
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded border border-gray-200">
          <img src={logo.dataUrl} alt={logo.bestandsnaam}
               className="w-20 h-20 object-contain rounded bg-white border" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{logo.bestandsnaam}</p>
            <p className="text-xs text-gray-500">
              {Math.round(logo.bytes / 1024)} KB
              {logo.bron === 'auto-zoek' && ' · 🔍 automatisch'}
              {logo.bron === 'url' && ' · 🔗 van URL'}
              {logo.bron === 'upload' && ' · 📤 geüpload'}
            </p>
          </div>
          <button type="button" onClick={() => onChange(undefined)}
                  className="text-xs text-red-600 hover:text-red-800 px-2">
            Verwijder
          </button>
        </div>
      ) : (
        <div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={autoZoek}
              disabled={bezig || !clubnaam}
              title={!clubnaam ? 'Vul eerst de clubnaam in' : `Zoek logo voor "${clubnaam}"`}
              className="btn-accent text-sm"
            >
              {bezig ? 'Zoeken…' : '🔍 Auto-zoek logo'}
            </button>
            <button type="button" onClick={() => inputRef.current?.click()}
                    className="btn-secondary text-sm" disabled={bezig}>
              {bezig ? 'Uploaden…' : '📤 Uploaden'}
            </button>
            <button
              type="button"
              onClick={() => setToonUrlInput(t => !t)}
              className="btn-secondary text-sm"
              disabled={bezig}
            >
              🔗 Van URL
            </button>
          </div>
          {toonUrlInput && (
            <div className="mt-2 flex gap-2">
              <input
                type="url"
                placeholder="https://www.clubsite.nl  (of directe image-URL)"
                value={urlInvoer}
                onChange={e => setUrlInvoer(e.target.value)}
                className="input flex-1 text-sm"
              />
              <button
                type="button"
                onClick={downloadVanUrl}
                disabled={bezig || !urlInvoer}
                className="btn-accent text-sm whitespace-nowrap"
              >
                Ophalen
              </button>
            </div>
          )}
          <p className="text-xs text-gray-500 mt-2">
            <strong>Auto-zoek</strong> probeert vvX.nl / X.nl varianten en pakt het og:image-logo van de clubsite.
            Werkt niet? Plak de URL van de clubsite of upload een bestand (PNG/JPG/SVG max 500 KB).
          </p>
        </div>
      )}
      {fout && <p className="text-xs text-red-600 mt-2">{fout}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) verwerkBestand(f);
          if (inputRef.current) inputRef.current.value = '';
        }}
      />
    </div>
  );
}

async function resizeNaarBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('Afbeelding niet leesbaar'));
    img.onload = () => {
      const ratio = Math.min(1, RESIZE_MAX_WIDTH / img.width);
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas niet ondersteund'));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85));
    };
    img.src = URL.createObjectURL(file);
  });
}
