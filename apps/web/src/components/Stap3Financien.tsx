/**
 * Stap 3 — Financieel overzicht & financiering.
 *
 * Toont per maatregel een blok met:
 *  - Bruto, alle subsidies (toegekend door calc-core) met naam + percentage
 *  - Mogelijkheid om EIGEN subsidies toe te voegen (gemeente-regelingen,
 *    fondsen, sponsoring) — opgeslagen in state.eigenSubsidies.
 *  - Netto-investering en TVT-update na eigen subsidies.
 *
 * Bovenaan een financierings-blok:
 *  - Totaal netto te financieren
 *  - Eigen inleg (€) — wat de club zelf legt
 *  - Lening = restant. Rente % + looptijd jaren → jaarlast + TCO
 *  - TCO = totaal nominale uitgaven over de looptijd (inleg + alle rente +
 *    aflossingen) MINUS jaarbesparingen × looptijd.
 *
 * Eigen subsidies én financiering worden opgeslagen in project-state zodat
 * ze persistent zijn en in de PPT meegenomen kunnen worden.
 */

import { useState, useMemo } from 'react';

export interface EigenSubsidie {
  /** Stabiele ID voor edit/delete */
  id: string;
  /** Bij welke maatregel hoort de subsidie ('alle' = generieke korting op project) */
  maatregelId: string;
  naam: string;
  bedrag: number;
  /** Toelichting, optioneel (bv. "Gemeente Arnhem revolverende lening 2025") */
  toelichting?: string;
}

export interface Financiering {
  /** Eigen inleg in € (uit reserves/contributie) */
  eigenInleg: number;
  /** Rente jaarlijks in % (default 4%) */
  rentePct: number;
  /** Looptijd in jaren (default 10) */
  looptijdJaren: number;
}

interface BerekendInline {
  perMaatregel: Record<string, {
    brutoInvestering: number;
    totaleSubsidie: number;
    nettoInvestering: number;
    besparingPerJaar: number;
    terugverdientijdJaren: number;
    subsidies?: Array<{ naam: string; bron: string; bedrag: number; percentage?: number }>;
  } | null | undefined>;
  rollup: {
    nettoInvestering: number;
    totaleBesparingPerJaar: number;
    totaleSubsidie: number;
    totaleInvestering: number;
  };
}

interface Props {
  berekend: BerekendInline;
  modulesNaam: Record<string, string>;
  eigenSubsidies: EigenSubsidie[];
  financiering: Financiering;
  /** Welke subsidies actief zijn — toggleerbaar in Beheer */
  actieveSubsidies: Set<string>;
  onEigenSubsidiesChange: (subs: EigenSubsidie[]) => void;
  onFinancieringChange: (fin: Financiering) => void;
  onTerugStap2: () => void;
}

export function Stap3Financien({
  berekend, modulesNaam, eigenSubsidies, financiering, actieveSubsidies,
  onEigenSubsidiesChange, onFinancieringChange, onTerugStap2,
}: Props) {
  // Per maatregel: bereken eigen subsidie-bedrag + netto na eigen subsidie
  const perMaatregel = useMemo(() => {
    const out: Array<{
      id: string; naam: string;
      brutoInv: number; calcCoreSub: number; eigenSub: number;
      nettoFinaal: number; besparing: number; tvtFinaal: number;
      subsidies: Array<{ naam: string; bedrag: number; percentage?: number; bron: string }>;
      eigenSubsRows: EigenSubsidie[];
    }> = [];

    for (const [id, res] of Object.entries(berekend.perMaatregel)) {
      if (!res) continue;

      // Filter calc-core subsidies op actief
      const actieveSubs = (res.subsidies ?? []).filter(s =>
        !actieveSubsidies || actieveSubsidies.has(s.bron) || actieveSubsidies.has(s.naam)
      );
      const calcCoreSub = actieveSubs.reduce((s, x) => s + x.bedrag, 0);

      // Eigen subsidies voor deze maatregel
      const eigenSubsRows = eigenSubsidies.filter(s => s.maatregelId === id);
      const eigenSub = eigenSubsRows.reduce((s, x) => s + x.bedrag, 0);

      const nettoFinaal = Math.max(0, res.brutoInvestering - calcCoreSub - eigenSub);
      const tvtFinaal = res.besparingPerJaar > 0 ? nettoFinaal / res.besparingPerJaar : 0;

      out.push({
        id,
        naam: modulesNaam[id] ?? id,
        brutoInv: res.brutoInvestering,
        calcCoreSub,
        eigenSub,
        nettoFinaal,
        besparing: res.besparingPerJaar,
        tvtFinaal,
        subsidies: actieveSubs,
        eigenSubsRows,
      });
    }
    return out;
  }, [berekend, modulesNaam, eigenSubsidies, actieveSubsidies]);

  // Voeg ook een "alle"-bucket toe voor project-brede eigen subsidies
  const projectBredeSubs = eigenSubsidies.filter(s => s.maatregelId === 'alle');
  const projectBredeBedrag = projectBredeSubs.reduce((s, x) => s + x.bedrag, 0);

  // Totaal netto na ALLE subsidies
  const totaalNetto = perMaatregel.reduce((s, m) => s + m.nettoFinaal, 0) - projectBredeBedrag;
  const totaalBesparing = perMaatregel.reduce((s, m) => s + m.besparing, 0);

  // Financiering
  const teFinancieren = Math.max(0, totaalNetto);
  const eigenInleg = Math.min(financiering.eigenInleg, teFinancieren);
  const lening = Math.max(0, teFinancieren - eigenInleg);
  const looptijd = Math.max(1, financiering.looptijdJaren);
  const rente = Math.max(0, financiering.rentePct) / 100;

  // Annuïteit (gangbaar voor zakelijke leningen): r × lening / (1 - (1+r)^-n)
  const annuiteit = rente > 0 && lening > 0
    ? (rente * lening) / (1 - Math.pow(1 + rente, -looptijd))
    : (lening / looptijd);
  const totaleRente = (annuiteit * looptijd) - lening;
  const jaarlast = annuiteit;
  const nettoKasstroomPerJaar = totaalBesparing - jaarlast;

  // TCO over de looptijd
  const tco = eigenInleg + (annuiteit * looptijd) - (totaalBesparing * looptijd);

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
        <strong>Stap 3 — Voor de penningmeester.</strong> Verfijn per maatregel de subsidies (voeg gemeente-regelingen toe!) en bepaal hoe de club gaat financieren: eigen inleg + lening met rente.
        Total Cost of Ownership (TCO) toont onderaan de waarheid: <em>wat kost het netto over de hele looptijd?</em>
      </div>

      {/* === Per-maatregel financieel overzicht === */}
      <div className="space-y-3">
        {perMaatregel.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            Selecteer eerst maatregelen in stap 2.
          </div>
        )}
        {perMaatregel.map(m => (
          <MaatregelKaart
            key={m.id}
            maatregel={m}
            eigenSubsidies={m.eigenSubsRows}
            onAdd={(sub) => onEigenSubsidiesChange([
              ...eigenSubsidies,
              { ...sub, id: makeId(), maatregelId: m.id },
            ])}
            onRemove={(id) => onEigenSubsidiesChange(eigenSubsidies.filter(s => s.id !== id))}
          />
        ))}

        {/* Project-brede eigen subsidies */}
        <ProjectBredeSubsidies
          subsidies={projectBredeSubs}
          onAdd={(sub) => onEigenSubsidiesChange([
            ...eigenSubsidies,
            { ...sub, id: makeId(), maatregelId: 'alle' },
          ])}
          onRemove={(id) => onEigenSubsidiesChange(eigenSubsidies.filter(s => s.id !== id))}
        />
      </div>

      {/* === Financierings-sectie === */}
      <div className="bg-gradient-to-br from-primary-50/80 to-primary-50/30 border border-primary-200 rounded-lg p-5 space-y-4">
        <h3 className="text-base font-semibold text-primary-900 flex items-center gap-2">
          <span>💰</span> Financiering: eigen inleg + lening
        </h3>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Eigen inleg (€)
              <span className="text-xs text-gray-500 ml-2">van de totaal {fmtEuro(teFinancieren)}</span>
            </label>
            <input
              type="number"
              className="input"
              min={0}
              max={teFinancieren}
              value={financiering.eigenInleg}
              onChange={e => onFinancieringChange({ ...financiering, eigenInleg: Number(e.target.value) || 0 })}
            />
            <p className="text-xs text-gray-500 mt-1">Wat de club uit eigen reserves/contributie inlegt — direct, zonder lenen.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lening (afgeleid)</label>
            <div className="px-3 py-2 bg-white border border-gray-200 rounded text-sm font-mono">{fmtEuro(lening)}</div>
            <p className="text-xs text-gray-500 mt-1">Te financieren restant — bv. via Stichting Waarborgfonds Sport, BNG of huisbankier.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rente (% per jaar)</label>
            <input
              type="number"
              step="0.1"
              className="input"
              value={financiering.rentePct}
              onChange={e => onFinancieringChange({ ...financiering, rentePct: Number(e.target.value) || 0 })}
            />
            <p className="text-xs text-gray-500 mt-1">Sportlening SWS/SVn typisch 2-4%, bank 4-6%, BNG 3-4%.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Looptijd (jaren)</label>
            <input
              type="number"
              className="input"
              value={financiering.looptijdJaren}
              onChange={e => onFinancieringChange({ ...financiering, looptijdJaren: Number(e.target.value) || 1 })}
            />
            <p className="text-xs text-gray-500 mt-1">10-20 jaar gebruikelijk voor sportclub-verduurzaming.</p>
          </div>
        </div>

        {/* Berekende uitkomst */}
        <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-primary-200">
          <Kpi label="Jaarlast lening" value={fmtEuro(jaarlast)} sub="aflossing + rente" />
          <Kpi label="Totale rente over looptijd" value={fmtEuro(totaleRente)} sub={`bij ${financiering.rentePct.toFixed(1)}% × ${looptijd} jr`} />
          <Kpi label="Jaarbesparing" value={fmtEuro(totaalBesparing)} sub="uit gekozen maatregelen" />
          <Kpi
            label="Netto kasstroom/jaar"
            value={fmtEuro(nettoKasstroomPerJaar)}
            sub={nettoKasstroomPerJaar >= 0 ? 'Besparing > jaarlast — club gaat erop vooruit' : 'Tekort — vergt extra inleg of langere looptijd'}
            negatief={nettoKasstroomPerJaar < 0}
          />
        </div>

        {/* TCO — het belangrijkste cijfer */}
        <div className="bg-white border-2 border-accent-orange rounded-lg p-4 mt-3">
          <p className="text-xs text-gray-600 uppercase tracking-wide">Total Cost of Ownership ({looptijd} jaar)</p>
          <p className="text-3xl font-bold text-accent-orange mt-1">{fmtEuro(tco)}</p>
          <p className="text-xs text-gray-600 mt-2">
            = eigen inleg ({fmtEuro(eigenInleg)}) + alle rente + aflossingen ({fmtEuro(annuiteit * looptijd)}) − besparingen ({fmtEuro(totaalBesparing * looptijd)}).
            {tco <= 0 ? ' ✓ Negatieve TCO = de maatregelen verdienen zichzelf MEER dan terug over de looptijd.' : ' Positieve TCO = netto kosten over de looptijd — vergelijk met "niets doen" om effect te zien.'}
          </p>
        </div>
      </div>

      <div className="flex justify-between">
        <button type="button" onClick={onTerugStap2}
          className="text-sm px-4 py-2 rounded border border-gray-300 hover:bg-gray-50">
          ← Terug naar maatregelen
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function MaatregelKaart({ maatregel: m, eigenSubsidies, onAdd, onRemove }: {
  maatregel: {
    id: string; naam: string; brutoInv: number; calcCoreSub: number; eigenSub: number;
    nettoFinaal: number; besparing: number; tvtFinaal: number;
    subsidies: Array<{ naam: string; bedrag: number; percentage?: number; bron: string }>;
  };
  eigenSubsidies: EigenSubsidie[];
  onAdd: (sub: Omit<EigenSubsidie, 'id' | 'maatregelId'>) => void;
  onRemove: (id: string) => void;
}) {
  const [toevoegen, setToevoegen] = useState(false);
  const [naam, setNaam] = useState('');
  const [bedrag, setBedrag] = useState<number>(0);
  const [toelichting, setToelichting] = useState('');

  function reset() {
    setNaam(''); setBedrag(0); setToelichting(''); setToevoegen(false);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <h4 className="font-semibold text-gray-900">{m.naam}</h4>
        <div className="text-sm text-gray-600">
          Bruto <strong className="text-gray-900">{fmtEuro(m.brutoInv)}</strong>
          {' → '}Netto <strong className="text-primary-700">{fmtEuro(m.nettoFinaal)}</strong>
          {m.besparing > 0 && <> · TVT <strong>{m.tvtFinaal.toFixed(1)} jr</strong></>}
        </div>
      </div>

      {/* Calc-core subsidies */}
      {m.subsidies.length > 0 && (
        <div className="bg-gray-50 rounded p-2 space-y-1">
          <p className="text-xs font-medium text-gray-500">Automatisch toegekend:</p>
          {m.subsidies.map((s, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-gray-700">
                • {s.naam}{s.percentage != null ? ` (${(s.percentage * 100).toFixed(0)}%)` : ''}
              </span>
              <span className="text-orange-700">− {fmtEuro(s.bedrag)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Eigen subsidies */}
      {eigenSubsidies.length > 0 && (
        <div className="bg-amber-50 rounded p-2 space-y-1">
          <p className="text-xs font-medium text-amber-700">Eigen toegevoegd:</p>
          {eigenSubsidies.map(s => (
            <div key={s.id} className="flex justify-between items-start text-sm gap-2">
              <span className="text-gray-700">
                • {s.naam}
                {s.toelichting && <span className="block text-xs text-gray-500">{s.toelichting}</span>}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-orange-700">− {fmtEuro(s.bedrag)}</span>
                <button type="button" onClick={() => onRemove(s.id)}
                  className="text-gray-400 hover:text-red-600 text-xs">✕</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* + Eigen subsidie toevoegen */}
      {!toevoegen ? (
        <button type="button" onClick={() => setToevoegen(true)}
          className="text-xs text-primary-700 hover:underline">
          + Eigen subsidie / korting toevoegen
        </button>
      ) : (
        <div className="bg-primary-50/50 border border-primary-200 rounded p-3 space-y-2">
          <p className="text-xs font-medium text-primary-900">Eigen subsidie / korting voor "{m.naam}"</p>
          <div className="grid sm:grid-cols-2 gap-2">
            <input type="text" placeholder='bv. "Gemeente Arnhem 1/3-regeling"' className="input py-1 text-sm"
              value={naam} onChange={e => setNaam(e.target.value)} />
            <input type="number" placeholder="Bedrag €" className="input py-1 text-sm"
              value={bedrag || ''} onChange={e => setBedrag(Number(e.target.value) || 0)} />
          </div>
          <input type="text" placeholder="Toelichting (optioneel) — bv. 'beschikking d.d. 2025'"
            className="input py-1 text-xs"
            value={toelichting} onChange={e => setToelichting(e.target.value)} />
          <div className="flex gap-2">
            <button type="button"
              disabled={!naam.trim() || bedrag <= 0}
              onClick={() => { onAdd({ naam: naam.trim(), bedrag, toelichting: toelichting.trim() || undefined }); reset(); }}
              className="text-xs bg-primary-600 text-white px-3 py-1 rounded disabled:bg-gray-300">
              + Toevoegen
            </button>
            <button type="button" onClick={reset}
              className="text-xs text-gray-600 hover:text-gray-900">Annuleer</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectBredeSubsidies({ subsidies, onAdd, onRemove }: {
  subsidies: EigenSubsidie[];
  onAdd: (sub: Omit<EigenSubsidie, 'id' | 'maatregelId'>) => void;
  onRemove: (id: string) => void;
}) {
  const [toevoegen, setToevoegen] = useState(false);
  const [naam, setNaam] = useState('');
  const [bedrag, setBedrag] = useState<number>(0);
  const [toelichting, setToelichting] = useState('');

  return (
    <div className="bg-white border border-dashed border-gray-300 rounded-lg p-4 space-y-2">
      <h4 className="font-semibold text-gray-700 text-sm">🏛️ Project-brede subsidies / kortingen</h4>
      <p className="text-xs text-gray-500">Bijv. een generieke "gemeente verduurzaming subsidie 2025" die niet aan een specifieke maatregel hangt.</p>

      {subsidies.map(s => (
        <div key={s.id} className="flex justify-between items-start text-sm gap-2 bg-gray-50 rounded p-2">
          <span className="text-gray-700">
            • {s.naam}
            {s.toelichting && <span className="block text-xs text-gray-500">{s.toelichting}</span>}
          </span>
          <span className="flex items-center gap-2">
            <span className="text-orange-700">− {fmtEuro(s.bedrag)}</span>
            <button type="button" onClick={() => onRemove(s.id)}
              className="text-gray-400 hover:text-red-600 text-xs">✕</button>
          </span>
        </div>
      ))}

      {!toevoegen ? (
        <button type="button" onClick={() => setToevoegen(true)}
          className="text-xs text-primary-700 hover:underline">+ Project-brede subsidie toevoegen</button>
      ) : (
        <div className="bg-primary-50/50 border border-primary-200 rounded p-3 space-y-2">
          <div className="grid sm:grid-cols-2 gap-2">
            <input type="text" placeholder='bv. "Stichting Sport-Verduurzaming"' className="input py-1 text-sm"
              value={naam} onChange={e => setNaam(e.target.value)} />
            <input type="number" placeholder="Bedrag €" className="input py-1 text-sm"
              value={bedrag || ''} onChange={e => setBedrag(Number(e.target.value) || 0)} />
          </div>
          <input type="text" placeholder="Toelichting (optioneel)"
            className="input py-1 text-xs"
            value={toelichting} onChange={e => setToelichting(e.target.value)} />
          <div className="flex gap-2">
            <button type="button"
              disabled={!naam.trim() || bedrag <= 0}
              onClick={() => {
                onAdd({ naam: naam.trim(), bedrag, toelichting: toelichting.trim() || undefined });
                setNaam(''); setBedrag(0); setToelichting(''); setToevoegen(false);
              }}
              className="text-xs bg-primary-600 text-white px-3 py-1 rounded disabled:bg-gray-300">+ Toevoegen</button>
            <button type="button" onClick={() => setToevoegen(false)}
              className="text-xs text-gray-600 hover:text-gray-900">Annuleer</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, negatief }: { label: string; value: string; sub?: string; negatief?: boolean }) {
  return (
    <div className="bg-white/80 rounded-md p-3">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold ${negatief ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-600 mt-1">{sub}</p>}
    </div>
  );
}

function fmtEuro(n: number): string {
  return '€ ' + Math.round(n).toLocaleString('nl-NL');
}

function makeId(): string {
  return 'es-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
}
