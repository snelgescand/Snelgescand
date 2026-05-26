/**
 * Kopieer tabel-data naar het klembord als HTML + plain text.
 *
 * Plakken in Word / Excel / Google Docs werkt dan als ÉCHTE tabel
 * (niet als afbeelding). Plakken in chat/notitie-apps gebruikt de
 * plain-text variant (tab-separated).
 */

import { useState } from 'react';

export async function kopieerTabel(opties: {
  kolommen: string[];
  rijen: Array<Array<string | number>>;
  titel?: string;
  voet?: string;
}): Promise<{ ok: boolean; foutmelding?: string }> {
  const { kolommen, rijen, titel, voet } = opties;

  const htmlHeader = kolommen.map(k => `<th style="border:1px solid #999;padding:6px 8px;background:#e0f0f0;text-align:left;">${esc(k)}</th>`).join('');
  const htmlRijen = rijen.map(rij => {
    const cellen = rij.map(c => `<td style="border:1px solid #999;padding:6px 8px;">${esc(String(c))}</td>`).join('');
    return `<tr>${cellen}</tr>`;
  }).join('');
  const html = `${titel ? `<p><strong>${esc(titel)}</strong></p>` : ''}<table style="border-collapse:collapse;border:1px solid #999;font-family:Arial,sans-serif;font-size:13px;"><thead><tr>${htmlHeader}</tr></thead><tbody>${htmlRijen}</tbody></table>${voet ? `<p style="font-size:11px;color:#666;margin-top:4px;"><em>${esc(voet)}</em></p>` : ''}`;

  const tsvLijnen: string[] = [];
  if (titel) tsvLijnen.push(titel, '');
  tsvLijnen.push(kolommen.join('\t'));
  for (const rij of rijen) tsvLijnen.push(rij.map(String).join('\t'));
  if (voet) tsvLijnen.push('', voet);
  const tekst = tsvLijnen.join('\n');

  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([tekst], { type: 'text/plain' }),
        }),
      ]);
      return { ok: true };
    }
  } catch (err) {
    console.warn('Rich-clipboard niet beschikbaar, fallback naar text:', err);
  }

  try {
    await navigator.clipboard.writeText(tekst);
    return { ok: true };
  } catch (err) {
    return { ok: false, foutmelding: err instanceof Error ? err.message : String(err) };
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface KopieerKnopProps {
  geefData: () => Parameters<typeof kopieerTabel>[0];
  label?: string;
  className?: string;
}

export function KopieerKnop({ geefData, label = 'Kopieer tabel', className }: KopieerKnopProps) {
  const [staat, setStaat] = useState<'idle' | 'ok' | 'fout'>('idle');

  async function kopieer() {
    const res = await kopieerTabel(geefData());
    setStaat(res.ok ? 'ok' : 'fout');
    setTimeout(() => setStaat('idle'), 1800);
  }

  const tekst = staat === 'ok' ? '✓ Gekopieerd' : staat === 'fout' ? '✗ Mislukt' : `📋 ${label}`;
  const kleur = staat === 'ok'
    ? 'border-green-300 bg-green-50 text-green-700'
    : staat === 'fout'
    ? 'border-red-300 bg-red-50 text-red-700'
    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50';

  return (
    <button
      type="button"
      onClick={kopieer}
      className={`text-xs px-2.5 py-1 rounded border transition-colors ${kleur} ${className ?? ''}`}
      title="Kopieer naar klembord (plakt als tabel in Word/Excel)"
    >
      {tekst}
    </button>
  );
}
