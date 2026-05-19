/**
 * Foto-upload component.
 *
 * MVP-strategie: foto's worden als Base64 in het project-state opgeslagen
 * (Postgres JSONB). Werkt direct, geen aparte file-storage nodig. Wel
 * groottebeperking: max 5 MB per foto (resize na upload), max ~10 foto's
 * per project (compacte JSON houdbaar).
 *
 * Voor sprint+: vervangen door object storage (S3/Backblaze B2) met
 * pre-signed URLs en alleen referenties in DB.
 */

import { useRef, useState } from 'react';

const MAX_FOTO_BYTES = 1_500_000;  // ~1.5 MB na resize
const MAX_AANTAL_FOTOS = 10;
const RESIZE_MAX_WIDTH = 1600;

export interface ProjectFoto {
  id: string;
  bestandsnaam: string;
  dataUrl: string;       // 'data:image/jpeg;base64,...'
  bytes: number;
  toegevoegd: string;    // ISO timestamp
  omschrijving?: string;
}

interface FotoUploadProps {
  fotos: ProjectFoto[];
  onChange: (fotos: ProjectFoto[]) => void;
}

export function FotoUpload({ fotos, onChange }: FotoUploadProps) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function verwerkBestanden(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBezig(true);
    setFout(null);

    const nieuwe: ProjectFoto[] = [];

    for (const file of Array.from(files)) {
      if (fotos.length + nieuwe.length >= MAX_AANTAL_FOTOS) {
        setFout(`Maximaal ${MAX_AANTAL_FOTOS} foto's per project.`);
        break;
      }
      if (!file.type.startsWith('image/')) {
        setFout(`${file.name} is geen afbeelding.`);
        continue;
      }
      try {
        const dataUrl = await resizeNaarDataUrl(file);
        const bytes = Math.floor(dataUrl.length * 0.75); // base64 → bytes schatting
        if (bytes > MAX_FOTO_BYTES) {
          setFout(`${file.name} is na resize nog te groot.`);
          continue;
        }
        nieuwe.push({
          id: 'foto_' + Math.random().toString(36).slice(2, 10),
          bestandsnaam: file.name,
          dataUrl,
          bytes,
          toegevoegd: new Date().toISOString(),
        });
      } catch (err) {
        console.error('Foto-verwerk-fout', err);
        setFout(`${file.name} kon niet worden gelezen.`);
      }
    }

    if (nieuwe.length > 0) {
      onChange([...fotos, ...nieuwe]);
    }
    setBezig(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  function verwijder(id: string) {
    onChange(fotos.filter(f => f.id !== id));
  }

  function updateOmschrijving(id: string, omschrijving: string) {
    onChange(fotos.map(f => f.id === id ? { ...f, omschrijving } : f));
  }

  return (
    <div className="space-y-3">
      <div
        className="border-2 border-dashed border-gray-300 rounded-md p-4 text-center hover:border-primary-400 transition-colors"
        onDragOver={e => { e.preventDefault(); }}
        onDrop={e => { e.preventDefault(); verwerkBestanden(e.dataTransfer.files); }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={e => verwerkBestanden(e.target.files)}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="btn-secondary"
          disabled={bezig || fotos.length >= MAX_AANTAL_FOTOS}
        >
          {bezig ? 'Verwerken…' : '+ Foto toevoegen'}
        </button>
        <p className="text-xs text-gray-500 mt-2">
          of sleep foto's hierheen · {fotos.length}/{MAX_AANTAL_FOTOS}
        </p>
      </div>

      {fout && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">
          {fout}
        </div>
      )}

      {fotos.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {fotos.map(f => (
            <div key={f.id} className="border border-gray-200 rounded-md overflow-hidden bg-white">
              <div className="relative h-32 bg-gray-100">
                <img src={f.dataUrl} alt={f.bestandsnaam} className="w-full h-full object-cover" />
                <button
                  onClick={() => verwijder(f.id)}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-white/90 hover:bg-red-100 text-red-600 text-sm flex items-center justify-center shadow"
                  title="Verwijderen"
                >
                  ×
                </button>
              </div>
              <input
                type="text"
                placeholder="Beschrijving…"
                value={f.omschrijving ?? ''}
                onChange={e => updateOmschrijving(f.id, e.target.value)}
                className="w-full text-xs px-2 py-1.5 border-t border-gray-200 focus:outline-none focus:bg-primary-50"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Lees een file als image, resize naar max RESIZE_MAX_WIDTH px breedte,
 * en geef terug als data-URL (JPEG, kwaliteit 0.85).
 */
function resizeNaarDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const schaal = Math.min(1, RESIZE_MAX_WIDTH / img.width);
        const w = Math.round(img.width * schaal);
        const h = Math.round(img.height * schaal);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas niet beschikbaar'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
