/**
 * SchemaImportPaneel — laat de gebruiker een trainingsschema aanleveren via
 * bestand (PDF/foto/Excel) of een weblink. Claude parst het op de backend en
 * geeft trainingsmomenten terug, die de gebruiker als PREVIEW ziet en zelf
 * bevestigt voordat ze het bestaande schema vervangen of aanvullen.
 *
 * Claude's output wordt NOOIT blind toegepast — bevestiging is verplicht.
 */

import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { schemaImportApi, type GeimporteerdMoment, type SchemaImportPayload } from '../api/client';

const DAG_LABELS: Record<GeimporteerdMoment['dag'], string> = {
  maandag: 'Ma', dinsdag: 'Di', woensdag: 'Wo', donderdag: 'Do',
  vrijdag: 'Vr', zaterdag: 'Za', zondag: 'Zo',
};
const TYPE_LABELS: Record<GeimporteerdMoment['type'], string> = {
  training: '🏃 Training', wedstrijd: '⚽ Wedstrijd', sociaal: '🍻 Sociaal',
};

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB (backend body-limit is 5MB; base64 ~+33%)

interface Props {
  sportCategorie?: 'teamsport' | 'racketsport' | 'individueel' | 'baansport';
  /** Roept terug met de herkende momenten + of ze het schema moeten vervangen of aanvullen. */
  onToepassen: (momenten: GeimporteerdMoment[], modus: 'vervang' | 'aanvullen') => void;
  /** Labels voor de twee groepen (sport-afhankelijk, voor de preview-kolomkoppen). */
  labelGroep1: string;
  labelGroep2: string;
}

export function SchemaImportPaneel({ sportCategorie, onToepassen, labelGroep1, labelGroep2 }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'bestand' | 'url'>('bestand');
  const [url, setUrl] = useState('');
  const [bestandNaam, setBestandNaam] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ momenten: GeimporteerdMoment[]; toelichting: string } | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const mutatie = useMutation({
    mutationFn: (payload: SchemaImportPayload) => schemaImportApi.importeer(payload),
    onSuccess: (data) => { setPreview(data); setFout(null); },
    onError: (err: unknown) => {
      setFout(err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : 'Er ging iets mis.');
      setPreview(null);
    },
  });

  function reset() {
    setPreview(null); setFout(null); setUrl(''); setBestandNaam(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function kiesBestand(file: File) {
    setFout(null);
    if (file.size > MAX_BYTES) {
      setFout(`Bestand is te groot (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximaal 4 MB — comprimeer of maak een kleinere scan.`);
      return;
    }
    setBestandNaam(file.name);
    const base64 = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res((r.result as string).split(',')[1] ?? '');
      r.onerror = () => rej(new Error('Kon bestand niet lezen'));
      r.readAsDataURL(file);
    });
    mutatie.mutate({
      bron: 'bestand',
      bestand: { data: base64, mediaType: file.type || 'application/octet-stream', naam: file.name },
      sportCategorie,
    });
  }

  function importeerUrl() {
    setFout(null);
    if (!url.trim()) { setFout('Vul een geldige URL in.'); return; }
    mutatie.mutate({ bron: 'url', url: url.trim(), sportCategorie });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full bg-violet-50 border border-violet-200 rounded-lg px-3 py-2 flex items-center justify-between text-sm hover:bg-violet-100/60 text-left"
      >
        <span className="text-violet-900">
          <span className="text-base">✨</span> Importeer schema uit bestand of link (AI)
        </span>
        <span className="text-xs text-violet-700">PDF · foto · Excel · weblink</span>
      </button>
    );
  }

  return (
    <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h4 className="text-sm font-semibold text-violet-900">✨ Schema importeren met AI</h4>
          <p className="text-xs text-violet-800 mt-0.5">
            Lever een trainingsschema aan — AI zet het om naar trainingsmomenten. Je controleert het resultaat zelf voordat het wordt toegepast.
          </p>
        </div>
        <button onClick={() => { setOpen(false); reset(); }} className="text-violet-400 hover:text-violet-700 text-lg leading-none">×</button>
      </div>

      {!preview && (
        <>
          {/* Tabs bestand / url */}
          <div className="flex gap-1 border-b border-violet-200">
            <button
              type="button"
              onClick={() => { setTab('bestand'); setFout(null); }}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px ${tab === 'bestand' ? 'border-violet-600 text-violet-900' : 'border-transparent text-violet-600'}`}
            >
              📎 Bestand
            </button>
            <button
              type="button"
              onClick={() => { setTab('url'); setFout(null); }}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px ${tab === 'url' ? 'border-violet-600 text-violet-900' : 'border-transparent text-violet-600'}`}
            >
              🔗 Weblink
            </button>
          </div>

          {tab === 'bestand' ? (
            <div className="space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,image/*,application/pdf"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) kiesBestand(f); }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={mutatie.isPending}
                className="w-full border-2 border-dashed border-violet-300 rounded-lg py-4 text-sm text-violet-700 hover:bg-violet-100/50 disabled:opacity-60"
              >
                {bestandNaam ? `📎 ${bestandNaam}` : 'Klik om een bestand te kiezen (PDF, foto, of Excel)'}
              </button>
              <p className="text-xs text-violet-600">Max. 4 MB. Een foto van een schema op papier werkt ook.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                type="url"
                placeholder="https://www.jouwclub.nl/trainingsschema"
                className="input py-1.5 text-sm"
                value={url}
                onChange={e => setUrl(e.target.value)}
              />
              <button
                type="button"
                onClick={importeerUrl}
                disabled={mutatie.isPending}
                className="bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 text-white text-sm font-medium px-4 py-1.5 rounded"
              >
                {mutatie.isPending ? 'Bezig…' : 'Schema ophalen'}
              </button>
              <p className="text-xs text-violet-600">Werkt het best met een directe link naar de schema-pagina.</p>
            </div>
          )}

          {mutatie.isPending && (
            <p className="text-sm text-violet-700 flex items-center gap-2">
              <span className="animate-pulse">⏳</span> AI leest het schema… dit kan tot een minuut duren.
            </p>
          )}
        </>
      )}

      {fout && (
        <div className="bg-red-50 border border-red-200 rounded p-2.5 text-sm text-red-800">
          ⚠ {fout}
          <button onClick={reset} className="block text-xs text-red-600 underline mt-1">Opnieuw proberen</button>
        </div>
      )}

      {/* Preview van herkende momenten */}
      {preview && (
        <div className="space-y-3">
          <p className="text-sm text-violet-900 bg-violet-100/60 rounded p-2">{preview.toelichting}</p>
          <div className="bg-white border border-violet-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-violet-50 text-violet-700 sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1.5">Dag</th>
                  <th className="text-left px-2 py-1.5">Tijd</th>
                  <th className="text-left px-2 py-1.5">Type</th>
                  <th className="text-right px-2 py-1.5" title={labelGroep1}>{labelGroep1.length > 14 ? labelGroep1.slice(0, 12) + '…' : labelGroep1}</th>
                  <th className="text-right px-2 py-1.5" title={labelGroep2}>{labelGroep2.length > 14 ? labelGroep2.slice(0, 12) + '…' : labelGroep2}</th>
                </tr>
              </thead>
              <tbody>
                {preview.momenten.map((m, i) => (
                  <tr key={i} className="border-t border-violet-100">
                    <td className="px-2 py-1.5">{DAG_LABELS[m.dag]}</td>
                    <td className="px-2 py-1.5">{m.startTijd}–{m.eindTijd}</td>
                    <td className="px-2 py-1.5">{TYPE_LABELS[m.type]}</td>
                    <td className="px-2 py-1.5 text-right">{m.aantalTeamsOnder13 || '·'}</td>
                    <td className="px-2 py-1.5 text-right">{m.aantalTeamsVanaf13 || '·'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            ⚠️ Controleer de herkende momenten goed — AI maakt soms fouten in tijden of aantallen. Je kunt na toepassen alles nog handmatig aanpassen.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { onToepassen(preview.momenten, 'vervang'); setOpen(false); reset(); }}
              className="bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-4 py-1.5 rounded"
            >
              ✓ Vervang huidige schema
            </button>
            <button
              type="button"
              onClick={() => { onToepassen(preview.momenten, 'aanvullen'); setOpen(false); reset(); }}
              className="bg-white border border-violet-300 text-violet-700 hover:bg-violet-50 text-sm font-medium px-4 py-1.5 rounded"
            >
              + Voeg toe aan huidige
            </button>
            <button
              type="button"
              onClick={reset}
              className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5"
            >
              Annuleer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
