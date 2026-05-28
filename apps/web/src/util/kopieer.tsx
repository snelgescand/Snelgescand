/**
 * Tabel- en grafiek-export.
 *
 *  • kopieerTabel       → naar klembord als ÉCHTE tabel (HTML) + plain text.
 *  • downloadTabelHtml  → losstaand .html-bestand (in gekozen kleurstijl).
 *  • downloadTabelPng   → .png-afbeelding van de tabel (via SVG → canvas, geen libs).
 *  • downloadGrafiekPng → .png van een recharts-grafiek (SVG uit de DOM).
 *
 * Kleurstijl is instelbaar: 'onn' (Op Naar Nul, huidige groen) of
 * 'spo' (Sportief Opgewekt, blauw/donkerblauw/oranje uit het logo).
 */

import { useState } from 'react';

/* ============================================================
 * Kleurstijlen
 * ============================================================ */

export type ExportThema = 'onn' | 'spo';

interface ThemaKleuren {
  naam: string;
  titel: string;     // titel-tekst
  headerBg: string;  // kop-rij achtergrond
  headerText: string;
  border: string;
  rijAlt: string;    // afwisselende rij-achtergrond
  tekst: string;
  voet: string;
}

export const EXPORT_THEMAS: Record<ExportThema, ThemaKleuren> = {
  onn: {
    naam: 'Op Naar Nul',
    titel: '#042d34',
    headerBg: '#006579',
    headerText: '#ffffff',
    border: '#9CC3C9',
    rijAlt: '#EAF4F5',
    tekst: '#1f2937',
    voet: '#6b7280',
  },
  spo: {
    naam: 'Sportief Opgewekt',
    titel: '#1F2A68',
    headerBg: '#38A8DC',
    headerText: '#ffffff',
    border: '#AEDAF1',
    rijAlt: '#E8F4FB',
    tekst: '#1f2937',
    voet: '#6b7280',
  },
};

/**
 * Hex-vervangingen om een (in Op Naar Nul-kleuren gerenderde) grafiek-SVG
 * om te kleuren naar de Sportief Opgewekt-stijl. De keys zijn exact de hexes
 * uit Charts.tsx.
 */
const GRAFIEK_RECOLOR_SPO: Record<string, string> = {
  '#006579': '#1374B8', // teal balken/lijnen → SPO-blauw
  '#5DA4AE': '#7FC4E8', // teal-light
  '#DE533E': '#EA5A23', // oranje
  '#042d34': '#1F2A68', // donker (as-tekst) → navy
  '#E0F2F5': '#E6F2FB', // grid
  '#90C2C9': '#A9D6F0',
  '#F2A192': '#F4B79B',
  '#1F2D7A': '#27348A',
};

type TabelData = {
  kolommen: string[];
  rijen: Array<Array<string | number>>;
  titel?: string;
  voet?: string;
};

/* ============================================================
 * Klembord (ongewijzigd gedrag)
 * ============================================================ */

export async function kopieerTabel(opties: TabelData): Promise<{ ok: boolean; foutmelding?: string }> {
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

/* ============================================================
 * Download — HTML
 * ============================================================ */

export function downloadTabelHtml(opties: TabelData, thema: ExportThema = 'onn'): void {
  const t = EXPORT_THEMAS[thema];
  const { kolommen, rijen, titel, voet } = opties;
  const head = kolommen.map(k => `<th>${esc(String(k))}</th>`).join('');
  const body = rijen.map((rij, i) =>
    `<tr${i % 2 ? ' class="alt"' : ''}>${rij.map(c => `<td>${esc(String(c))}</td>`).join('')}</tr>`
  ).join('');

  const html = `<!DOCTYPE html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titel || 'Tabel')}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:${t.tekst};margin:24px;background:#fff;}
  h1{font-size:18px;color:${t.titel};margin:0 0 12px;}
  table{border-collapse:collapse;border:1px solid ${t.border};font-size:13px;}
  th{background:${t.headerBg};color:${t.headerText};text-align:left;padding:8px 12px;border:1px solid ${t.border};}
  td{padding:7px 12px;border:1px solid ${t.border};white-space:nowrap;}
  tr.alt td{background:${t.rijAlt};}
  .voet{font-size:11px;color:${t.voet};margin-top:8px;font-style:italic;}
  .merk{margin-top:20px;font-size:11px;color:${t.voet};}
</style></head><body>
${titel ? `<h1>${esc(titel)}</h1>` : ''}
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
${voet ? `<p class="voet">${esc(voet)}</p>` : ''}
<p class="merk">Snelgescand · kleurstijl ${esc(t.naam)}</p>
</body></html>`;

  triggerDownload(new Blob([html], { type: 'text/html;charset=utf-8' }), bestandsnaam(titel, thema, 'html'));
}

/* ============================================================
 * Download — PNG (tabel via SVG → canvas, zonder externe libs)
 * ============================================================ */

export async function downloadTabelPng(opties: TabelData, thema: ExportThema = 'onn'): Promise<void> {
  const svg = bouwTabelSvg(opties, EXPORT_THEMAS[thema]);
  await svgNaarPng(svg, bestandsnaam(opties.titel, thema, 'png'));
}

function bouwTabelSvg(opties: TabelData, t: ThemaKleuren): string {
  const { kolommen, rijen, titel, voet } = opties;
  const padX = 12;
  const tekenBreedte = 7.1;   // schatting per teken @ 13px Arial
  const rijH = 30;
  const headerH = 32;
  const titelH = titel ? 34 : 0;
  const voetH = voet ? 22 : 0;
  const merkH = 22;

  // Kolombreedtes o.b.v. langste cel/koptekst per kolom
  const kolB = kolommen.map((k, i) => {
    let maxLen = String(k).length;
    for (const rij of rijen) maxLen = Math.max(maxLen, String(rij[i] ?? '').length);
    return Math.max(64, Math.round(maxLen * tekenBreedte) + padX * 2);
  });
  const breedte = kolB.reduce((a, b) => a + b, 0);
  const tabelH = headerH + rijen.length * rijH;
  const hoogte = titelH + tabelH + voetH + merkH + 8;

  const delen: string[] = [];
  delen.push(`<rect x="0" y="0" width="${breedte}" height="${hoogte}" fill="#ffffff"/>`);

  let y = 0;
  if (titel) {
    delen.push(`<text x="0" y="${22}" font-family="Arial,Helvetica,sans-serif" font-size="16" font-weight="bold" fill="${t.titel}">${esc(titel)}</text>`);
    y += titelH;
  }

  // Kop-rij
  let x = 0;
  delen.push(`<rect x="0" y="${y}" width="${breedte}" height="${headerH}" fill="${t.headerBg}"/>`);
  kolommen.forEach((k, i) => {
    delen.push(`<text x="${x + padX}" y="${y + headerH / 2 + 4.5}" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="bold" fill="${t.headerText}">${esc(String(k))}</text>`);
    x += kolB[i];
  });
  y += headerH;

  // Data-rijen
  rijen.forEach((rij, r) => {
    if (r % 2 === 1) delen.push(`<rect x="0" y="${y}" width="${breedte}" height="${rijH}" fill="${t.rijAlt}"/>`);
    let cx = 0;
    rij.forEach((cel, i) => {
      delen.push(`<text x="${cx + padX}" y="${y + rijH / 2 + 4.5}" font-family="Arial,Helvetica,sans-serif" font-size="13" fill="${t.tekst}">${esc(String(cel))}</text>`);
      cx += kolB[i];
    });
    y += rijH;
  });

  // Rasterlijnen
  delen.push(`<rect x="0.5" y="${titelH + 0.5}" width="${breedte - 1}" height="${tabelH}" fill="none" stroke="${t.border}"/>`);
  let lx = 0;
  for (let i = 0; i < kolB.length - 1; i++) {
    lx += kolB[i];
    delen.push(`<line x1="${lx}" y1="${titelH}" x2="${lx}" y2="${titelH + tabelH}" stroke="${t.border}"/>`);
  }
  for (let r = 0; r <= rijen.length; r++) {
    const ly = titelH + headerH + r * rijH;
    delen.push(`<line x1="0" y1="${ly}" x2="${breedte}" y2="${ly}" stroke="${t.border}"/>`);
  }

  y = titelH + tabelH;
  if (voet) {
    delen.push(`<text x="0" y="${y + 15}" font-family="Arial,Helvetica,sans-serif" font-size="11" font-style="italic" fill="${t.voet}">${esc(voet)}</text>`);
    y += voetH;
  }
  delen.push(`<text x="0" y="${y + 15}" font-family="Arial,Helvetica,sans-serif" font-size="11" fill="${t.voet}">Snelgescand · kleurstijl ${esc(t.naam)}</text>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${breedte}" height="${hoogte}" viewBox="0 0 ${breedte} ${hoogte}">${delen.join('')}</svg>`;
}

/* ============================================================
 * Download — PNG van een grafiek (recharts-SVG uit de DOM)
 * ============================================================ */

export async function downloadGrafiekPng(container: HTMLElement, naam: string, thema: ExportThema = 'onn'): Promise<void> {
  const bronSvg = container.querySelector('svg');
  if (!bronSvg) throw new Error('Geen grafiek (SVG) gevonden om te exporteren.');

  const kloon = bronSvg.cloneNode(true) as SVGSVGElement;
  const breedte = bronSvg.clientWidth || Number(bronSvg.getAttribute('width')) || 600;
  const hoogte = bronSvg.clientHeight || Number(bronSvg.getAttribute('height')) || 320;
  kloon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  kloon.setAttribute('width', String(breedte));
  kloon.setAttribute('height', String(hoogte));

  // Witte achtergrond invoegen
  const achtergrond = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  achtergrond.setAttribute('x', '0');
  achtergrond.setAttribute('y', '0');
  achtergrond.setAttribute('width', String(breedte));
  achtergrond.setAttribute('height', String(hoogte));
  achtergrond.setAttribute('fill', '#ffffff');
  kloon.insertBefore(achtergrond, kloon.firstChild);

  let svgString = new XMLSerializer().serializeToString(kloon);
  if (thema === 'spo') {
    for (const [van, naarKleur] of Object.entries(GRAFIEK_RECOLOR_SPO)) {
      svgString = svgString.split(van).join(naarKleur);
      svgString = svgString.split(van.toUpperCase()).join(naarKleur);
    }
  }
  const bestand = `${naamNaarBasis(naam)}-${thema}.png`;
  await svgNaarPng(svgString, bestand);
}

/* ============================================================
 * Gedeelde helpers
 * ============================================================ */

function svgNaarPng(svgString: string, bestandsnaam: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const schaal = 2; // scherpe export
        const canvas = document.createElement('canvas');
        const w = img.width || 600;
        const h = img.height || 320;
        canvas.width = w * schaal;
        canvas.height = h * schaal;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas niet beschikbaar');
        ctx.scale(schaal, schaal);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        canvas.toBlob(png => {
          if (png) { triggerDownload(png, bestandsnaam); resolve(); }
          else reject(new Error('PNG-conversie mislukt'));
        }, 'image/png');
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG kon niet geladen worden')); };
    img.src = url;
  });
}

function triggerDownload(blob: Blob, bestandsnaam: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = bestandsnaam;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

function naamNaarBasis(naam?: string): string {
  const basis = (naam || 'export').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
  return basis || 'export';
}

function bestandsnaam(titel: string | undefined, thema: ExportThema, ext: string): string {
  return `${naamNaarBasis(titel)}-${thema}.${ext}`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ============================================================
 * Knop met export-menu (klembord / HTML / PNG + kleurstijl)
 * ============================================================ */

interface KopieerKnopProps {
  geefData: () => TabelData;
  label?: string;
  className?: string;
}

export function KopieerKnop({ geefData, label = 'Exporteer tabel', className }: KopieerKnopProps) {
  const [open, setOpen] = useState(false);
  const [staat, setStaat] = useState<'idle' | 'ok' | 'fout'>('idle');
  const [thema, setThema] = useState<ExportThema>('onn');

  async function kopieer() {
    const res = await kopieerTabel(geefData());
    setStaat(res.ok ? 'ok' : 'fout');
    setTimeout(() => setStaat('idle'), 1800);
    setOpen(false);
  }
  function html() {
    try { downloadTabelHtml(geefData(), thema); } catch (e) { console.error(e); }
    setOpen(false);
  }
  async function png() {
    try { await downloadTabelPng(geefData(), thema); } catch (e) { console.error(e); }
    setOpen(false);
  }

  const knopTekst = staat === 'ok' ? '✓ Gekopieerd' : staat === 'fout' ? '✗ Mislukt' : `⬇ ${label}`;
  const knopKleur = staat === 'ok'
    ? 'border-green-300 bg-green-50 text-green-700'
    : staat === 'fout'
    ? 'border-red-300 bg-red-50 text-red-700'
    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50';

  return (
    <div className={`relative inline-block ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`text-xs px-2.5 py-1 rounded border transition-colors ${knopKleur}`}
        title="Kopieer of download deze tabel"
      >
        {knopTekst} <span className="text-[9px]">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-60 bg-white border border-gray-200 rounded-lg shadow-lg p-1.5 text-xs">
            <p className="px-1.5 pt-0.5 pb-1 text-[10px] uppercase tracking-wide text-gray-400">Kleurstijl (voor HTML & PNG)</p>
            <div className="flex rounded-md border border-gray-200 overflow-hidden mb-1.5">
              <button
                type="button"
                className={`flex-1 px-2 py-1.5 transition-colors ${thema === 'onn' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                onClick={() => setThema('onn')}
              >
                Op Naar Nul
              </button>
              <button
                type="button"
                className={`flex-1 px-2 py-1.5 transition-colors ${thema === 'spo' ? 'bg-[#38A8DC] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                onClick={() => setThema('spo')}
              >
                Sportief Opgewekt
              </button>
            </div>
            <button type="button" className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100" onClick={kopieer}>📋 Kopieer naar klembord</button>
            <button type="button" className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100" onClick={html}>🌐 Download als HTML</button>
            <button type="button" className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100" onClick={png}>🖼️ Download als PNG</button>
          </div>
        </>
      )}
    </div>
  );
}
