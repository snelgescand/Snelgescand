/**
 * Kennisbank-pagina: alle artikelen gegroepeerd per categorie.
 *
 * Layout: linker sidebar met categorieën + lijst, rechter paneel met
 * geselecteerd artikel. Op mobiel stapelen ze.
 */

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AppHeader } from '../components/AppHeader';
import { KENNIS, CATEGORIE_LABELS, type KennisArtikel } from '../data/kennisbank';

export default function Kennisbank() {
  const [actiefId, setActiefId] = useState<string>(KENNIS[0]?.id ?? '');
  const [zoek, setZoek] = useState('');

  const gefilterd = useMemo(() => {
    if (!zoek.trim()) return KENNIS;
    const term = zoek.toLowerCase();
    return KENNIS.filter(k =>
      k.titel.toLowerCase().includes(term) ||
      k.korteBeschrijving.toLowerCase().includes(term),
    );
  }, [zoek]);

  const gegroepeerd = useMemo(() => {
    const map = new Map<KennisArtikel['categorie'], KennisArtikel[]>();
    for (const art of gefilterd) {
      const arr = map.get(art.categorie) ?? [];
      arr.push(art);
      map.set(art.categorie, arr);
    }
    return map;
  }, [gefilterd]);

  const actief = KENNIS.find(k => k.id === actiefId);

  return (
    <div className="min-h-screen">
      <AppHeader rechts={
        <Link to="/projecten" className="text-sm text-gray-600 hover:text-primary-700">← Projecten</Link>
      } />

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-primary-900 mb-2">Kennisbank</h1>
          <p className="text-gray-600">Achtergrond bij de berekeningen en aannames in de tool.</p>
        </div>

        <div className="grid lg:grid-cols-[280px_1fr] gap-6">
          {/* Sidebar */}
          <aside className="space-y-4">
            <input
              type="text"
              className="input"
              placeholder="Zoek in kennisbank…"
              value={zoek}
              onChange={e => setZoek(e.target.value)}
            />
            <nav className="card p-3 space-y-3 max-h-[70vh] overflow-y-auto scrollbar-thin">
              {Array.from(gegroepeerd.entries()).map(([cat, artikelen]) => (
                <div key={cat}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-primary-600 mb-1.5 px-2">
                    {CATEGORIE_LABELS[cat]}
                  </h3>
                  <ul className="space-y-0.5">
                    {artikelen.map(art => (
                      <li key={art.id}>
                        <button
                          onClick={() => setActiefId(art.id)}
                          className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
                            art.id === actiefId
                              ? 'bg-primary-100 text-primary-900 font-medium'
                              : 'text-gray-700 hover:bg-primary-50'
                          }`}
                        >
                          {art.titel}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {gegroepeerd.size === 0 && (
                <p className="text-sm text-gray-500 px-2 py-4">Geen resultaten voor "{zoek}".</p>
              )}
            </nav>
          </aside>

          {/* Content */}
          <article className="card p-8">
            {actief ? <Artikel artikel={actief} /> : <p className="text-gray-500">Selecteer een artikel.</p>}
          </article>
        </div>
      </main>
    </div>
  );
}

function Artikel({ artikel }: { artikel: KennisArtikel }) {
  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <span className="badge-primary">{CATEGORIE_LABELS[artikel.categorie]}</span>
        <h2 className="text-2xl font-bold text-primary-900 mt-2">{artikel.titel}</h2>
        <p className="text-gray-600 mt-1">{artikel.korteBeschrijving}</p>
      </div>

      <hr className="border-primary-100" />

      <div className="prose-content space-y-4">
        {artikel.paragrafen.map((p, i) => {
          if (p.type === 'tekst') {
            return <p key={i} className="text-gray-800 leading-relaxed">{p.inhoud}</p>;
          }
          if (p.type === 'formule') {
            return (
              <div key={i} className="bg-primary-50/60 border-l-4 border-primary-500 px-4 py-3 rounded-r">
                <code className="text-primary-900 font-mono text-sm">{p.latex}</code>
                {p.toelichting && <p className="text-xs text-gray-600 mt-1">{p.toelichting}</p>}
              </div>
            );
          }
          if (p.type === 'lijst') {
            return (
              <ul key={i} className="list-disc list-inside space-y-1 text-gray-800">
                {p.items.map((item, j) => <li key={j}>{item}</li>)}
              </ul>
            );
          }
          if (p.type === 'tabel') {
            return (
              <div key={i} className="overflow-x-auto">
                <table className="min-w-full border border-primary-100 rounded-md text-sm">
                  <thead className="bg-primary-50">
                    <tr>
                      {p.kolommen.map((k, j) => (
                        <th key={j} className="px-3 py-2 text-left font-medium text-primary-900">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-primary-50">
                    {p.rijen.map((rij, j) => (
                      <tr key={j} className={j % 2 ? 'bg-gray-50/50' : ''}>
                        {rij.map((cel, k) => (
                          <td key={k} className="px-3 py-2 text-gray-800">{cel}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
          if (p.type === 'tip') {
            return (
              <div key={i} className="bg-accent-orange/10 border-l-4 border-accent-orange px-4 py-3 rounded-r">
                <p className="text-sm text-gray-800"><strong className="text-accent-orange-dark">Tip · </strong>{p.inhoud}</p>
              </div>
            );
          }
          return null;
        })}
      </div>

      {artikel.bronnen && artikel.bronnen.length > 0 && (
        <div className="pt-4 mt-4 border-t border-primary-100">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Bronnen</h3>
          <ul className="space-y-1 text-sm">
            {artikel.bronnen.map((url, i) => (
              <li key={i}>
                <a href={url} target="_blank" rel="noreferrer" className="text-primary-700 hover:underline">
                  {url} ↗
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
