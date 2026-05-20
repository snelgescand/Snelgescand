/**
 * Club-logo upload — eenvoudige variant voor één bestand.
 *
 * Logo komt in PowerPoint terecht naast/onder de Op Naar Nul branding.
 * Opslag identiek aan FotoUpload: Base64 in project-state (JSONB).
 * Limiet: 500 KB om de presentatie compact te houden.
 */

import { useRef, useState } from 'react';

const MAX_LOGO_BYTES = 500_000;   // 500 KB na resize
const RESIZE_MAX_WIDTH = 400;     // logo's hoeven niet groot

export interface ClubLogo {
  bestandsnaam: string;
  dataUrl: string;
  bytes: number;
}

interface LogoUploadProps {
  logo?: ClubLogo;
  onChange: (logo: ClubLogo | undefined) => void;
}

export function LogoUpload({ logo, onChange }: LogoUploadProps) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
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
        // SVG: direct als text, geen canvas-resize
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
      onChange({ bestandsnaam: file.name, dataUrl, bytes });
    } catch (e) {
      setFout('Fout bij verwerken: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBezig(false);
    }
  }

  function verwijder() {
    onChange(undefined);
  }

  return (
    <div>
      {logo ? (
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded border border-gray-200">
          <img src={logo.dataUrl} alt={logo.bestandsnaam}
               className="w-20 h-20 object-contain rounded bg-white border" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{logo.bestandsnaam}</p>
            <p className="text-xs text-gray-500">{Math.round(logo.bytes / 1024)} KB</p>
          </div>
          <button type="button" onClick={verwijder}
                  className="text-xs text-red-600 hover:text-red-800 px-2">
            Verwijder
          </button>
        </div>
      ) : (
        <div>
          <button type="button" onClick={() => inputRef.current?.click()}
                  className="btn-secondary text-sm" disabled={bezig}>
            {bezig ? 'Uploaden…' : '+ Logo uploaden'}
          </button>
          <p className="text-xs text-gray-500 mt-1">
            PNG, JPG of SVG — bij voorkeur transparante achtergrond. Max 500 KB.
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
