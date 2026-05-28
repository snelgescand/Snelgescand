/**
 * AfrondenOverzichtModal — toont op één overzichtelijke pagina alle data van
 * het project: club-info, gebouw, energieverbruik, gekozen maatregelen,
 * financiering, en TCO.
 *
 * Bedoeld als laatste stap voordat het advies naar de club gaat — een sanity
 * check: klopt alles?
 */

import { useMemo } from 'react';
import type { ProjectState } from '../routes/ProjectEditor';

interface Props {
  draft: ProjectState;
  cached: any;
  modulesNaam: Record<string, string>;
  onClose: () => void;
}

const fmt = (n: number | undefined | null): string => {
  if (n === undefined || n === null || !Number.isFinite(n)) return '—';
  return `€ ${Math.round(n).toLocaleString('nl-NL')}`;
};

const fmtGetal = (n: number | undefined | null, eenheid = ''): string => {
  if (n === undefined || n === null || !Number.isFinite(n)) return '—';
  return `${Math.round(n).toLocaleString('nl-NL')}${eenheid}`;
};

export function AfrondenOverzichtModal({
  draft, cached, modulesNaam, onClose,
}: Props) {
  const clubnaam = draft.context.club?.naam ?? '(nog geen naam)';
  const clubType = draft.context.club?.type ?? '—';
  // ProjectState.context.club heeft slechts naam+type in z'n typed-shape; andere velden
  // (aantalLeden, adres) komen uit de bredere ClubInfo van calc-core — pak ze veilig.
  const clubExtra = draft.context.club as { aantalLeden?: number; adres?: string } | undefined;
  const leden = clubExtra?.aantalLeden;
  const adres = clubExtra?.adres;
  const bouwjaar = draft.context.gebouw?.bouwjaar;
  const bvo = draft.context.gebouw?.bvoTotaalM2;
  const gas = draft.context.energie?.gasverbruikM3;
  const stroom = draft.context.energie?.stroomverbruikTotaalKwh;

  const gekozenIds = Object.keys(draft.gekozenMaatregelen ?? {});
  const rollup = cached?.rollup;

  const tapwaterKeuzeLabel = useMemo(() => {
    switch (draft.tapwaterKeuze) {
      case 'qton': return `Q-ton ${draft.tapwaterModelKw ? `${draft.tapwaterModelKw} kW` : ''}`;
      case 'lmnt': return `LMNT ${draft.tapwaterModelKw ? `${draft.tapwaterModelKw} kW` : ''}${draft.lmntIncRuimteverwarming ? ' + ruimteverwarming' : ''}`;
      case 'warmtepompboiler': return 'Warmtepompboiler';
      default: return 'Nog niet gekozen';
    }
  }, [draft.tapwaterKeuze, draft.tapwaterModelKw, draft.lmntIncRuimteverwarming]);

  const financiering = draft.financiering;
  const projectBredeSubs = (draft.eigenSubsidies ?? []).filter(s => s.maatregelId === 'alle');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10 rounded-t-xl">
          <div>
            <h2 className="text-xl font-bold text-primary-900">✓ Afronden — overzicht</h2>
            <p className="text-sm text-gray-600">{clubnaam}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
            aria-label="Sluiten"
          >
            ×
          </button>
        </div>

        {/* Inhoud */}
        <div className="px-6 py-5 space-y-5">

          {/* === Club & gebouw === */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">🏢 Club & gebouw</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-gray-500">Clubnaam:</dt><dd className="font-medium">{clubnaam}</dd>
              <dt className="text-gray-500">Type vereniging:</dt><dd>{clubType}</dd>
              {leden && (<><dt className="text-gray-500">Aantal leden:</dt><dd>{leden}</dd></>)}
              {adres && (<><dt className="text-gray-500">Adres:</dt><dd className="truncate">{adres}</dd></>)}
              {bouwjaar && (<><dt className="text-gray-500">Bouwjaar:</dt><dd>{bouwjaar}</dd></>)}
              {bvo && (<><dt className="text-gray-500">BVO:</dt><dd>{fmtGetal(bvo, ' m²')}</dd></>)}
            </dl>
          </section>

          {/* === Energieverbruik === */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">⚡ Energieverbruik (jaar)</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-gray-500">Gas:</dt><dd>{fmtGetal(gas, ' m³')}</dd>
              <dt className="text-gray-500">Stroom:</dt><dd>{fmtGetal(stroom, ' kWh')}</dd>
              {draft.energielabel?.huidig && (<><dt className="text-gray-500">Huidig label:</dt><dd>{draft.energielabel.huidig}</dd></>)}
              {draft.energielabel?.verwachtNa && (<><dt className="text-gray-500">Verwacht label na:</dt><dd className="text-green-700 font-medium">{draft.energielabel.verwachtNa}</dd></>)}
            </dl>
          </section>

          {/* === Tapwater-keuze === */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">🚰 Tapwater-WP keuze</h3>
            <p className="text-sm">{tapwaterKeuzeLabel}</p>
            {draft.tapwaterBufferLiters && draft.tapwaterBufferLiters > 0 && (
              <p className="text-xs text-gray-500">Buffervat: {fmtGetal(draft.tapwaterBufferLiters, ' L')}</p>
            )}
          </section>

          {/* === Gekozen maatregelen === */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
              📋 Gekozen maatregelen ({gekozenIds.length})
            </h3>
            {gekozenIds.length === 0 ? (
              <p className="text-sm text-gray-500 italic">Geen maatregelen gekozen.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 border-b border-gray-200">
                  <tr>
                    <th className="text-left py-1.5">Maatregel</th>
                    <th className="text-right py-1.5">Bruto</th>
                    <th className="text-right py-1.5">Subsidies</th>
                    <th className="text-right py-1.5">Netto</th>
                    <th className="text-right py-1.5">Besparing/jr</th>
                    <th className="text-right py-1.5">TVT</th>
                  </tr>
                </thead>
                <tbody>
                  {gekozenIds.map(id => {
                    const r = cached?.perMaatregel?.[id];
                    const naam = modulesNaam[id] ?? id;
                    if (!r) return (
                      <tr key={id} className="border-b border-gray-100">
                        <td className="py-1.5">{naam}</td>
                        <td colSpan={5} className="text-right text-gray-400 italic">nog niet berekend</td>
                      </tr>
                    );
                    return (
                      <tr key={id} className="border-b border-gray-100">
                        <td className="py-1.5">{naam}</td>
                        <td className="text-right">{fmt(r.brutoInvestering)}</td>
                        <td className="text-right text-emerald-700">{fmt(r.totaleSubsidie)}</td>
                        <td className="text-right font-medium">{fmt(r.nettoInvestering)}</td>
                        <td className="text-right text-green-700">{fmt(r.besparingPerJaar)}</td>
                        <td className="text-right">{r.terugverdientijdJaren && Number.isFinite(r.terugverdientijdJaren) ? `${r.terugverdientijdJaren.toFixed(1)} jr` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {rollup && (
                  <tfoot className="font-semibold text-sm bg-gray-50">
                    <tr>
                      <td className="py-2 pl-2">Totaal</td>
                      <td className="text-right pr-1">{fmt(rollup.totaleInvestering)}</td>
                      <td className="text-right text-emerald-700 pr-1">{fmt(rollup.totaleSubsidie)}</td>
                      <td className="text-right pr-1">{fmt(rollup.nettoInvestering)}</td>
                      <td className="text-right text-green-700 pr-1">{fmt(rollup.totaleBesparingPerJaar)}</td>
                      <td className="text-right pr-2">{rollup.gemiddeldeTerugverdientijdJaren && Number.isFinite(rollup.gemiddeldeTerugverdientijdJaren) ? `${rollup.gemiddeldeTerugverdientijdJaren.toFixed(1)} jr` : '—'}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </section>

          {/* === Financiering === */}
          {financiering && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">💰 Financieringsmix</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {financiering.eigenInleg > 0 && (<><dt className="text-gray-500">Eigen inleg:</dt><dd>{fmt(financiering.eigenInleg)}</dd></>)}
                {financiering.sponsoracties && financiering.sponsoracties > 0 && (<><dt className="text-gray-500">Sponsoracties:</dt><dd>{fmt(financiering.sponsoracties)}</dd></>)}
                {financiering.obligaties && financiering.obligaties > 0 && (<><dt className="text-gray-500">Obligaties:</dt><dd>{fmt(financiering.obligaties)} ({financiering.obligatieRentePct ?? 4}% over {financiering.obligatieLooptijdJaren ?? 10} jr)</dd></>)}
                <dt className="text-gray-500">Lening-rente:</dt><dd>{financiering.rentePct}%</dd>
                <dt className="text-gray-500">Looptijd:</dt><dd>{financiering.looptijdJaren} jaar</dd>
                {financiering.stijgingEnergiePctPerJaar && (<><dt className="text-gray-500">Energieprijs-stijging:</dt><dd>{financiering.stijgingEnergiePctPerJaar}%/jr</dd></>)}
                {financiering.stijgingVastrechtPctPerJaar && (<><dt className="text-gray-500">Vastrecht-stijging:</dt><dd>{financiering.stijgingVastrechtPctPerJaar}%/jr</dd></>)}
              </dl>
              {projectBredeSubs.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-gray-500">Project-brede subsidies:</p>
                  <ul className="text-sm">
                    {projectBredeSubs.map(s => (
                      <li key={s.id} className="text-emerald-700">
                        • {s.naam}: {s.modus === 'percentage' && s.percentage != null ? `${s.percentage.toFixed(1)}%` : fmt(s.bedrag)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {/* === Eindcontrole-checklist === */}
          <section className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <h3 className="text-sm font-semibold text-amber-900 mb-2">📝 Sanity-check voor verzenden</h3>
            <ul className="text-sm text-amber-900 space-y-1">
              <li>{clubnaam !== '(nog geen naam)' ? '✓' : '⚠'} Clubnaam ingevuld</li>
              <li>{bvo && gas && stroom ? '✓' : '⚠'} Gebouw + energieverbruik compleet</li>
              <li>{gekozenIds.length > 0 ? '✓' : '⚠'} Minimaal 1 maatregel gekozen</li>
              <li>{rollup ? '✓' : '⚠'} Berekening gedraaid in stap 2</li>
              <li>{draft.energielabel?.verwachtNa ? '✓' : 'ℹ'} Verwacht eindlabel berekend (nodig voor DUMAVA-controle)</li>
            </ul>
          </section>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-3 flex justify-end rounded-b-xl">
          <button
            onClick={onClose}
            className="text-sm text-gray-600 hover:text-gray-900 px-4 py-2"
          >
            Sluit overzicht
          </button>
        </div>
      </div>
    </div>
  );
}
