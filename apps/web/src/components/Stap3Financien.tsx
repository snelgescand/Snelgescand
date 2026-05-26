/**
 * Stap 3 — Financieel overzicht & financieringsmix.
 *
 * - Per maatregel: bruto / subsidies / netto, eigen subsidies toevoegen
 *   (in € OF in %)
 * - Financieringsmix: eigen inleg, lening, sponsoracties, obligaties,
 *   huurinkomsten — som moet matchen met te-financieren bedrag
 * - TCO met POSITIEVE framing — winst groen, kosten neutraal
 * - Taartdiagram financieringsmix
 * - Kopieer-knoppen op alle tabellen
 */

import { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { KopieerKnop } from '../util/kopieer';

export interface EigenSubsidie {
  id: string;
  maatregelId: string;
  naam: string;
  /** Invoer-modus: bedrag in € of percentage van bruto */
  modus: 'bedrag' | 'percentage';
  bedrag: number;
  percentage?: number;
  toelichting?: string;
}

export interface Financiering {
  eigenInleg: number;
  rentePct: number;
  looptijdJaren: number;
  /** Sponsoracties — éénmalige opbrengst */
  sponsoracties?: number;
  /** Obligaties uitgegeven aan leden — bedrag */
  obligaties?: number;
  /** Rente op obligaties (jaarlijks, %) */
  obligatieRentePct?: number;
  /** Looptijd obligaties (jaren) */
  obligatieLooptijdJaren?: number;
  /** Huurinkomsten (extra, ten gevolge van verduurzaming bv. zelf opwekken voor huurders) */
  huurinkomstenExtraPerJaar?: number;
  /** Jaarlijkse stijging energieprijzen in % (gas + stroom kale prijs).
   *  Default 5%. Tussen 2021-2024 was de werkelijke stijging gemiddeld 8-12% per jaar,
   *  CPB raamt 4-6% structureel voor de komende jaren. */
  stijgingEnergiePctPerJaar?: number;
  /** Jaarlijkse stijging vastrecht-tarieven netbeheerder in %.
   *  Default 7%. Liander/Stedin/Enexis verhogen vastrecht structureel sneller dan
   *  inflatie i.v.m. netuitbreidingen (netcongestie). */
  stijgingVastrechtPctPerJaar?: number;
  /** Algemene inflatie in % (voor onderhouds- en gebruikskosten). Default 2,5%. */
  inflatiePctPerJaar?: number;
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
  actieveSubsidies: Set<string>;
  onEigenSubsidiesChange: (subs: EigenSubsidie[]) => void;
  onFinancieringChange: (fin: Financiering) => void;
  onTerugStap2: () => void;
}

// Recharts kleuren voor taartdiagram
const KLEUREN = ['#006579', '#5DA4AE', '#DE533E', '#F4A261', '#2A9D8F', '#264653', '#E9C46A'];

export function Stap3Financien({
  berekend, modulesNaam, eigenSubsidies, financiering, actieveSubsidies,
  onEigenSubsidiesChange, onFinancieringChange, onTerugStap2,
}: Props) {
  // === Per maatregel berekenen ===
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
      const actieveSubs = (res.subsidies ?? []).filter(s =>
        !actieveSubsidies || actieveSubsidies.has(s.bron) || actieveSubsidies.has(s.naam)
      );
      const calcCoreSub = actieveSubs.reduce((s, x) => s + x.bedrag, 0);
      const eigenSubsRows = eigenSubsidies.filter(s => s.maatregelId === id);
      // Voor percentages: hercompute bedrag obv huidige bruto
      const eigenSub = eigenSubsRows.reduce((s, x) => {
        const bedrag = x.modus === 'percentage' && x.percentage != null
          ? (res.brutoInvestering * x.percentage / 100)
          : x.bedrag;
        return s + bedrag;
      }, 0);
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

  const projectBredeSubs = eigenSubsidies.filter(s => s.maatregelId === 'alle');
  const projectBredeBedrag = projectBredeSubs.reduce((s, x) => s + x.bedrag, 0);

  const totaalNetto = perMaatregel.reduce((s, m) => s + m.nettoFinaal, 0) - projectBredeBedrag;
  const totaalBesparing = perMaatregel.reduce((s, m) => s + m.besparing, 0);
  const totaalSubsidieAll = perMaatregel.reduce((s, m) => s + m.calcCoreSub + m.eigenSub, 0) + projectBredeBedrag;

  // === Financieringsmix ===
  const teFinancieren = Math.max(0, totaalNetto);
  const eigenInleg = Math.min(financiering.eigenInleg, teFinancieren);
  const sponsoracties = Math.max(0, financiering.sponsoracties ?? 0);
  const obligaties = Math.max(0, financiering.obligaties ?? 0);
  const huurinkomstenExtra = Math.max(0, financiering.huurinkomstenExtraPerJaar ?? 0);
  const eigenInbreng = eigenInleg + sponsoracties;
  const restNodig = Math.max(0, teFinancieren - eigenInbreng - obligaties);
  const lening = restNodig;

  const looptijd = Math.max(1, financiering.looptijdJaren);
  const rente = Math.max(0, financiering.rentePct) / 100;
  const annuiteit = rente > 0 && lening > 0
    ? (rente * lening) / (1 - Math.pow(1 + rente, -looptijd))
    : (lening / looptijd);
  const totaleRenteLening = (annuiteit * looptijd) - lening;
  const jaarlast = annuiteit;

  // Obligaties — vergelijkbare berekening
  const obligatieRente = Math.max(0, financiering.obligatieRentePct ?? 0) / 100;
  const obligatieLooptijd = Math.max(1, financiering.obligatieLooptijdJaren ?? looptijd);
  const obligatieAnnuiteit = obligatieRente > 0 && obligaties > 0
    ? (obligatieRente * obligaties) / (1 - Math.pow(1 + obligatieRente, -obligatieLooptijd))
    : (obligaties / obligatieLooptijd);
  const totaleRenteObligaties = (obligatieAnnuiteit * obligatieLooptijd) - obligaties;

  const totaleJaarlast = jaarlast + (obligaties > 0 ? obligatieAnnuiteit : 0);
  const nettoKasstroomPerJaar = totaalBesparing + huurinkomstenExtra - totaleJaarlast;

  // === Prijsstijgingen / indexatie ===
  //
  // Sportclubs hebben energie-vastrecht en kale kWh/m³-prijzen die fors stijgen.
  // De besparing van jaar 1 is dus LAGER dan die van jaar 15 — vooral gas + vastrecht
  // stijgen sneller dan inflatie (CO₂-heffing, schaarste, netcongestie).
  //
  // Defaults gebaseerd op de Op-Naar-Nul-PPT prijsindex 2021-2025:
  //   - Energie kale prijs: 5%/jaar (CPB raamt 4-6% structureel)
  //   - Vastrecht netbeheer: 7%/jaar (Liander/Stedin/Enexis verhogen 7-10%)
  //   - Algemene inflatie: 2,5%
  //
  // Geometrische reeks voor cumulatieve geïndexeerde som:
  //   S = b × ((1+g)^n − 1) / g   (mits g > 0)
  //   S = b × n                   (als g = 0)
  const stijgingEnergie = (financiering.stijgingEnergiePctPerJaar ?? 5) / 100;
  const stijgingVastrecht = (financiering.stijgingVastrechtPctPerJaar ?? 7) / 100;
  const inflatie = (financiering.inflatiePctPerJaar ?? 2.5) / 100;

  // Gewogen besparing-stijging: 80% energie + 20% vastrecht (vuistregel sportclub)
  const gemBesparingStijging = stijgingEnergie * 0.8 + stijgingVastrecht * 0.2;

  function cumulatiefGeindexeerd(jaarwaarde: number, groei: number, jaren: number): number {
    if (jaren <= 0 || jaarwaarde === 0) return 0;
    if (groei === 0) return jaarwaarde * jaren;
    return jaarwaarde * (Math.pow(1 + groei, jaren) - 1) / groei;
  }

  // Cumulatieve besparing met indexatie (in plaats van naïef × looptijd)
  const cumBesparing = cumulatiefGeindexeerd(totaalBesparing, gemBesparingStijging, looptijd);
  // Huurinkomsten volgen meestal de algemene inflatie (huurindex)
  const cumHuur = cumulatiefGeindexeerd(huurinkomstenExtra, inflatie, looptijd);
  const cumBesparingTotaal = cumBesparing + cumHuur;

  // TCO over de looptijd (met indexatie)
  const tco = eigenInbreng + obligaties + totaleRenteLening + totaleRenteObligaties
    - cumBesparingTotaal
    - totaalSubsidieAll;

  // TCO ZONDER indexatie — voor vergelijking (toont impact van indexatie)
  const tcoZonderIndexatie = eigenInbreng + obligaties + totaleRenteLening + totaleRenteObligaties
    - (totaalBesparing + huurinkomstenExtra) * looptijd
    - totaalSubsidieAll;
  const winstDoorIndexatie = tcoZonderIndexatie - tco; // positief = indexatie maakt het beter

  // Mismatch indicator
  const totaalFinanciering = eigenInleg + sponsoracties + obligaties + lening;
  const mismatch = Math.abs(totaalFinanciering - teFinancieren) > 1;

  // Pie-chart data
  const pieData = useMemo(() => [
    { naam: 'Subsidies', waarde: Math.round(totaalSubsidieAll), kleur: KLEUREN[4] },
    { naam: 'Eigen inleg', waarde: Math.round(eigenInleg), kleur: KLEUREN[0] },
    { naam: 'Sponsoracties', waarde: Math.round(sponsoracties), kleur: KLEUREN[5] },
    { naam: 'Obligaties', waarde: Math.round(obligaties), kleur: KLEUREN[6] },
    { naam: 'Lening', waarde: Math.round(lening), kleur: KLEUREN[1] },
    { naam: 'Rente totaal', waarde: Math.round(totaleRenteLening + totaleRenteObligaties), kleur: KLEUREN[2] },
  ].filter(d => d.waarde > 0), [totaalSubsidieAll, eigenInleg, sponsoracties, obligaties, lening, totaleRenteLening, totaleRenteObligaties]);

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
        <strong>Stap 3 — Voor de penningmeester.</strong> Verfijn de subsidies (voeg gemeente-regelingen toe als bedrag of als percentage)
        en bepaal de <strong>financieringsmix</strong>: eigen inleg, sponsoracties, obligaties, lening + rente, en extra huurinkomsten.
        De Total Cost of Ownership (TCO) onderaan toont het netto resultaat over de hele looptijd.
      </div>

      {/* === Per-maatregel financieel overzicht === */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Maatregelen & subsidies</h3>
          <KopieerKnop
            label="Kopieer maatregel-tabel"
            geefData={() => ({
              titel: 'Maatregelen — financieel overzicht',
              kolommen: ['Maatregel', 'Bruto (€)', 'Subsidies (€)', 'Netto (€)', 'Besparing/jr (€)', 'TVT (jaren)'],
              rijen: perMaatregel.map(m => [
                m.naam,
                Math.round(m.brutoInv),
                Math.round(m.calcCoreSub + m.eigenSub),
                Math.round(m.nettoFinaal),
                Math.round(m.besparing),
                m.tvtFinaal > 0 ? m.tvtFinaal.toFixed(1) : '—',
              ]),
              voet: 'Bron: Snelgescand.nl quickscan',
            })}
          />
        </div>

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

        <ProjectBredeSubsidies
          subsidies={projectBredeSubs}
          onAdd={(sub) => onEigenSubsidiesChange([
            ...eigenSubsidies,
            { ...sub, id: makeId(), maatregelId: 'alle' },
          ])}
          onRemove={(id) => onEigenSubsidiesChange(eigenSubsidies.filter(s => s.id !== id))}
        />
      </div>

      {/* === Financieringsmix === */}
      <div className="bg-gradient-to-br from-primary-50/80 to-primary-50/30 border border-primary-200 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-base font-semibold text-primary-900 flex items-center gap-2">
            <span>💰</span> Financieringsmix
          </h3>
          <KopieerKnop
            label="Kopieer financiering"
            geefData={() => ({
              titel: 'Financieringsmix',
              kolommen: ['Bron', 'Bedrag (€)'],
              rijen: [
                ['Te financieren (netto investering)', Math.round(teFinancieren)],
                ['Eigen inleg (liquide middelen)', Math.round(eigenInleg)],
                ['Sponsoracties', Math.round(sponsoracties)],
                ['Obligaties uitgegeven', Math.round(obligaties)],
                ['Lening (bank/BNG/SWS)', Math.round(lening)],
                [`Rente over looptijd (${financiering.rentePct}%, ${looptijd} jr)`, Math.round(totaleRenteLening)],
                [`Rente obligaties (${(financiering.obligatieRentePct ?? 0)}%, ${obligatieLooptijd} jr)`, Math.round(totaleRenteObligaties)],
                ['Extra huurinkomsten per jaar', Math.round(huurinkomstenExtra)],
              ],
            })}
          />
        </div>
        <p className="text-xs text-gray-600 -mt-2">
          Totaal nodig: <strong>{fmtEuro(teFinancieren)}</strong>.
          Verdeel dat over de bronnen — de bank-lening vult automatisch het restant.
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Eigen inleg */}
          <FinveldEuro
            label="Eigen inleg (liquide middelen)"
            value={financiering.eigenInleg}
            onChange={v => onFinancieringChange({ ...financiering, eigenInleg: v })}
            sub="Wat de club uit reserves of contributie inlegt — direct, zonder lenen."
            icon="💵"
          />

          {/* Sponsoracties */}
          <FinveldEuro
            label="Sponsoracties / donaties"
            value={financiering.sponsoracties ?? 0}
            onChange={v => onFinancieringChange({ ...financiering, sponsoracties: v })}
            sub='Éénmalige opbrengst, bv. "Adopteer een zonnepaneel", crowdfunding, sponsorenpakket.'
            icon="🎁"
          />

          {/* Obligaties */}
          <FinveldEuro
            label="Obligaties (uitgegeven aan leden)"
            value={financiering.obligaties ?? 0}
            onChange={v => onFinancieringChange({ ...financiering, obligaties: v })}
            sub="Leden lenen geld aan de club — typisch 3-5% rente, looptijd 5-15 jr. Veel goedkoper dan bank-lening."
            icon="🪙"
          />

          {/* Huurinkomsten */}
          <FinveldEuro
            label="Extra huurinkomsten per jaar"
            value={financiering.huurinkomstenExtraPerJaar ?? 0}
            onChange={v => onFinancieringChange({ ...financiering, huurinkomstenExtraPerJaar: v })}
            sub="Bv. door extra zaalverhuur na verduurzaming, of energie-doorbelasting aan onderhuurders."
            icon="🏘️"
          />

          {/* Bank-rente + looptijd */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">🏦 Bank-rente (% per jaar)</label>
            <input
              type="number"
              step="0.1"
              className="input"
              value={financiering.rentePct}
              onChange={e => onFinancieringChange({ ...financiering, rentePct: Number(e.target.value) || 0 })}
            />
            <p className="text-xs text-gray-500 mt-1">SWS/SVn ~2-4% · BNG ~3-4% · huisbank ~4-6%.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">📅 Looptijd lening (jaren)</label>
            <input
              type="number"
              className="input"
              value={financiering.looptijdJaren}
              onChange={e => onFinancieringChange({ ...financiering, looptijdJaren: Number(e.target.value) || 1 })}
            />
            <p className="text-xs text-gray-500 mt-1">10-20 jaar gangbaar voor sportclub-verduurzaming.</p>
          </div>

          {/* Obligatie-rente + looptijd (alleen tonen als obligaties > 0) */}
          {obligaties > 0 && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">🪙 Obligatie-rente (%)</label>
                <input
                  type="number"
                  step="0.1"
                  className="input"
                  value={financiering.obligatieRentePct ?? 4}
                  onChange={e => onFinancieringChange({ ...financiering, obligatieRentePct: Number(e.target.value) || 0 })}
                />
                <p className="text-xs text-gray-500 mt-1">3-5% gebruikelijk voor leden-obligaties.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">🪙 Looptijd obligaties (jaren)</label>
                <input
                  type="number"
                  className="input"
                  value={financiering.obligatieLooptijdJaren ?? 10}
                  onChange={e => onFinancieringChange({ ...financiering, obligatieLooptijdJaren: Number(e.target.value) || 1 })}
                />
                <p className="text-xs text-gray-500 mt-1">5-15 jr typisch.</p>
              </div>
            </>
          )}
        </div>

        {/* === Prijsstijgingen — energie en vastrecht stijgen FORS === */}
        <details className="bg-white/60 rounded-lg border border-primary-200 p-3">
          <summary className="cursor-pointer text-sm font-medium text-primary-900">
            📈 Prijsstijgingen (energie + vastrecht) — meegerekend in TCO
            <span className="ml-2 text-xs text-gray-500 font-normal">
              klik om percentages aan te passen
            </span>
          </summary>
          <div className="mt-3 grid sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Energieprijzen (gas + stroom, %/jr)</label>
              <input type="number" step="0.5" className="input py-1 text-sm"
                value={financiering.stijgingEnergiePctPerJaar ?? 5}
                onChange={e => onFinancieringChange({ ...financiering, stijgingEnergiePctPerJaar: Number(e.target.value) || 0 })}
              />
              <p className="text-xs text-gray-500 mt-1">CPB raamt 4-6% structureel. Default 5%.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Vastrecht netbeheer (%/jr)</label>
              <input type="number" step="0.5" className="input py-1 text-sm"
                value={financiering.stijgingVastrechtPctPerJaar ?? 7}
                onChange={e => onFinancieringChange({ ...financiering, stijgingVastrechtPctPerJaar: Number(e.target.value) || 0 })}
              />
              <p className="text-xs text-gray-500 mt-1">Liander/Stedin/Enexis 7-10% (netcongestie). Default 7%.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Algemene inflatie (%/jr)</label>
              <input type="number" step="0.1" className="input py-1 text-sm"
                value={financiering.inflatiePctPerJaar ?? 2.5}
                onChange={e => onFinancieringChange({ ...financiering, inflatiePctPerJaar: Number(e.target.value) || 0 })}
              />
              <p className="text-xs text-gray-500 mt-1">Voor onderhoud + huurindex. Default 2,5%.</p>
            </div>
          </div>
          <p className="text-xs text-gray-600 mt-2 leading-relaxed">
            💡 De jaarbesparing van vandaag is over 15 jaar veel meer waard. Met deze indexatie wordt de cumulatieve
            besparing in de TCO realistisch berekend: <strong>{fmtEuro(cumBesparingTotaal)}</strong> i.p.v. simpel
            jaar-1 × looptijd ({fmtEuro((totaalBesparing + huurinkomstenExtra) * looptijd)}).
            Indexatie maakt deze case <strong className="text-green-700">{fmtEuro(Math.abs(winstDoorIndexatie))} aantrekkelijker</strong>.
          </p>
        </details>

        {/* Resultaat-blokken */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-primary-200">
          <KpiBlok label="Bank-lening" value={fmtEuro(lening)} sub="Restant na inleg, sponsor, obligaties" />
          <KpiBlok label="Jaarlast totaal" value={fmtEuro(totaleJaarlast)} sub={obligaties > 0 ? 'Bank + obligatie aflossing' : 'Bank-lening aflossing + rente'} />
          <KpiBlok
            label="Jaarbesparing"
            value={fmtEuro(totaalBesparing + huurinkomstenExtra)}
            sub={huurinkomstenExtra > 0 ? `incl. ${fmtEuro(huurinkomstenExtra)} extra huur` : 'energiebesparing'}
            positief
          />
          <KpiBlok
            label="Netto kasstroom/jaar"
            value={fmtEuro(nettoKasstroomPerJaar)}
            sub={nettoKasstroomPerJaar >= 0
              ? 'Besparing dekt jaarlast ✓'
              : 'Tekort — meer inleg of langere looptijd?'}
            positief={nettoKasstroomPerJaar >= 0}
            waarschuwing={nettoKasstroomPerJaar < 0}
          />
        </div>

        {mismatch && (
          <div className="bg-amber-100 border border-amber-300 rounded p-2 text-xs text-amber-800">
            ⚠ De bedragen tellen op tot {fmtEuro(totaalFinanciering)}, maar er moet {fmtEuro(teFinancieren)} gefinancierd worden.
            Het verschil wordt automatisch toegevoegd aan de bank-lening.
          </div>
        )}

        {/* TCO — positief geframed */}
        <TcoBlok
          tco={tco}
          looptijd={looptijd}
          cumBesparing={cumBesparingTotaal}
          jaarBesparing={totaalBesparing + huurinkomstenExtra}
          eigenInbreng={eigenInbreng + obligaties}
          totaleRente={totaleRenteLening + totaleRenteObligaties}
          subsidies={totaalSubsidieAll}
          winstDoorIndexatie={winstDoorIndexatie}
          gemBesparingStijgingPct={gemBesparingStijging * 100}
        />

        {/* Taartdiagram financieringsmix */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-gray-900">📊 Financieringsmix in beeld</h4>
            <KopieerKnop
              label="Kopieer mix-tabel"
              geefData={() => ({
                titel: 'Financieringsmix (taartdiagram)',
                kolommen: ['Bron', 'Bedrag (€)', 'Aandeel (%)'],
                rijen: pieData.map(d => {
                  const totaal = pieData.reduce((s, x) => s + x.waarde, 0);
                  const pct = totaal > 0 ? (d.waarde / totaal * 100).toFixed(1) : '0';
                  return [d.naam, Math.round(d.waarde), pct];
                }),
              })}
            />
          </div>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={85}
                  dataKey="waarde"
                  nameKey="naam"
                  label={({ naam, waarde }) => `${naam}: €${Math.round(waarde / 1000)}k`}
                  labelLine={false}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.kleur} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => fmtEuro(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-500 text-center py-8">Vul de financiering hierboven in om het taartdiagram te zien.</p>
          )}
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
  const [modus, setModus] = useState<'bedrag' | 'percentage'>('bedrag');
  const [bedrag, setBedrag] = useState<number>(0);
  const [percentage, setPercentage] = useState<number>(0);
  const [toelichting, setToelichting] = useState('');

  function reset() {
    setNaam(''); setBedrag(0); setPercentage(0); setModus('bedrag'); setToelichting(''); setToevoegen(false);
  }

  function bevestig() {
    const sub: Omit<EigenSubsidie, 'id' | 'maatregelId'> = {
      naam: naam.trim(),
      modus,
      bedrag: modus === 'bedrag' ? bedrag : (m.brutoInv * percentage / 100),
      percentage: modus === 'percentage' ? percentage : undefined,
      toelichting: toelichting.trim() || undefined,
    };
    onAdd(sub);
    reset();
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

      {m.subsidies.length > 0 && (
        <div className="bg-green-50/60 rounded p-2 space-y-1">
          <p className="text-xs font-medium text-green-700">Automatisch toegekend:</p>
          {m.subsidies.map((s, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-gray-700">
                • {s.naam}{s.percentage != null ? ` (${(s.percentage * 100).toFixed(0)}%)` : ''}
              </span>
              <span className="text-green-700 font-medium">+ {fmtEuro(s.bedrag)}</span>
            </div>
          ))}
        </div>
      )}

      {eigenSubsidies.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded p-2 space-y-1">
          <p className="text-xs font-medium text-emerald-700">Eigen toegevoegd:</p>
          {eigenSubsidies.map(s => {
            const bedragVoor = s.modus === 'percentage' && s.percentage != null
              ? (m.brutoInv * s.percentage / 100)
              : s.bedrag;
            return (
              <div key={s.id} className="flex justify-between items-start text-sm gap-2">
                <span className="text-gray-700">
                  • {s.naam}
                  {s.modus === 'percentage' && s.percentage != null && ` (${s.percentage.toFixed(0)}%)`}
                  {s.toelichting && <span className="block text-xs text-gray-500">{s.toelichting}</span>}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-emerald-700 font-medium">+ {fmtEuro(bedragVoor)}</span>
                  <button type="button" onClick={() => onRemove(s.id)}
                    className="text-gray-400 hover:text-red-600 text-xs">✕</button>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {!toevoegen ? (
        <button type="button" onClick={() => setToevoegen(true)}
          className="text-xs text-primary-700 hover:underline">
          + Eigen subsidie / korting toevoegen
        </button>
      ) : (
        <div className="bg-primary-50/50 border border-primary-200 rounded p-3 space-y-2">
          <p className="text-xs font-medium text-primary-900">Eigen subsidie voor "{m.naam}"</p>
          <input type="text" placeholder='bv. "Gemeente Arnhem 1/3-regeling"' className="input py-1 text-sm"
            value={naam} onChange={e => setNaam(e.target.value)} />

          {/* Toggle bedrag/percentage */}
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => setModus('bedrag')}
              className={`px-3 py-1 rounded ${modus === 'bedrag' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700'}`}
            >
              Bedrag (€)
            </button>
            <button
              type="button"
              onClick={() => setModus('percentage')}
              className={`px-3 py-1 rounded ${modus === 'percentage' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700'}`}
            >
              Percentage (%)
            </button>
          </div>

          {modus === 'bedrag' ? (
            <input type="number" placeholder="Bedrag €" className="input py-1 text-sm"
              value={bedrag || ''} onChange={e => setBedrag(Number(e.target.value) || 0)} />
          ) : (
            <div>
              <input type="number" placeholder="Percentage %" step="0.1" className="input py-1 text-sm"
                value={percentage || ''} onChange={e => setPercentage(Number(e.target.value) || 0)} />
              {percentage > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  = {fmtEuro(m.brutoInv * percentage / 100)} ({percentage.toFixed(1)}% van bruto {fmtEuro(m.brutoInv)})
                </p>
              )}
            </div>
          )}

          <input type="text" placeholder="Toelichting (optioneel)"
            className="input py-1 text-xs"
            value={toelichting} onChange={e => setToelichting(e.target.value)} />
          <div className="flex gap-2">
            <button type="button"
              disabled={!naam.trim() || (modus === 'bedrag' ? bedrag <= 0 : percentage <= 0)}
              onClick={bevestig}
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
      <p className="text-xs text-gray-500">Generieke regelingen die niet aan één maatregel hangen, bv. "Gemeente verduurzaming 2025".</p>

      {subsidies.map(s => (
        <div key={s.id} className="flex justify-between items-start text-sm gap-2 bg-emerald-50/60 rounded p-2">
          <span className="text-gray-700">
            • {s.naam}
            {s.toelichting && <span className="block text-xs text-gray-500">{s.toelichting}</span>}
          </span>
          <span className="flex items-center gap-2">
            <span className="text-emerald-700 font-medium">+ {fmtEuro(s.bedrag)}</span>
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
                onAdd({ naam: naam.trim(), modus: 'bedrag', bedrag, toelichting: toelichting.trim() || undefined });
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

function FinveldEuro({ label, value, onChange, sub, icon }: {
  label: string; value: number; onChange: (v: number) => void; sub?: string; icon?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {icon && <span className="mr-1">{icon}</span>}{label}
      </label>
      <input
        type="number"
        min={0}
        className="input"
        value={value || ''}
        onChange={e => onChange(Number(e.target.value) || 0)}
      />
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

function KpiBlok({ label, value, sub, positief, waarschuwing }: {
  label: string; value: string; sub?: string; positief?: boolean; waarschuwing?: boolean;
}) {
  // GROENE framing voor positieve waarden, amber voor waarschuwingen, neutraal anders
  const tekstKleur = waarschuwing ? 'text-amber-700'
    : positief ? 'text-green-700'
    : 'text-gray-900';
  const achtergrond = waarschuwing ? 'bg-amber-50 border-amber-200'
    : positief ? 'bg-green-50 border-green-200'
    : 'bg-white/80 border-transparent';
  return (
    <div className={`rounded-md p-3 border ${achtergrond}`}>
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold ${tekstKleur}`}>{value}</p>
      {sub && <p className="text-xs text-gray-600 mt-1">{sub}</p>}
    </div>
  );
}

function TcoBlok({ tco, looptijd, cumBesparing, jaarBesparing, eigenInbreng, totaleRente, subsidies, winstDoorIndexatie, gemBesparingStijgingPct }: {
  tco: number; looptijd: number;
  /** Cumulatieve, GEÏNDEXEERDE besparing over de hele looptijd */
  cumBesparing: number;
  /** Besparing in jaar 1 (ter referentie in opbouw-toelichting) */
  jaarBesparing: number;
  eigenInbreng: number; totaleRente: number; subsidies: number;
  /** Hoeveel aantrekkelijker indexatie de case maakt (positief = winst) */
  winstDoorIndexatie: number;
  /** Gewogen gemiddelde besparing-stijging in %/jr (voor toelichting) */
  gemBesparingStijgingPct: number;
}) {
  const isWinst = tco < 0;
  return (
    <div className={`bg-white border-2 ${isWinst ? 'border-green-400' : 'border-green-300'} rounded-lg p-4 mt-3`}>
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-600 uppercase tracking-wide">
          Total Cost of Ownership ({looptijd} jaar, geïndexeerd)
        </p>
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${isWinst ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
          {isWinst ? '✓ Levert geld op' : 'Netto kosten'}
        </span>
      </div>
      <p className={`text-3xl font-bold mt-1 ${isWinst ? 'text-green-700' : 'text-gray-900'}`}>
        {isWinst ? `+ ${fmtEuro(Math.abs(tco))}` : fmtEuro(tco)}
      </p>
      {isWinst ? (
        <p className="text-sm text-green-700 mt-1 font-medium">
          🎉 Deze maatregelen leveren over {looptijd} jaar netto <strong>{fmtEuro(Math.abs(tco))}</strong> op
          (na alle inleg, rente en aflossingen).
        </p>
      ) : (
        <p className="text-sm text-gray-700 mt-1">
          Netto investering over {looptijd} jaar — vergelijk met "niets doen" om het positieve verschil te zien.
          Zonder verduurzaming blijven energiekosten met {gemBesparingStijgingPct.toFixed(1)}%/jr verder stijgen.
        </p>
      )}
      <div className="text-xs text-gray-600 mt-3 space-y-1">
        <p>
          <strong>Opbouw:</strong> eigen inbreng + obligaties ({fmtEuro(eigenInbreng)})
          + rente totaal ({fmtEuro(totaleRente)})
          − subsidies ({fmtEuro(subsidies)})
          − cumulatieve besparing geïndexeerd ({fmtEuro(cumBesparing)}).
        </p>
        <p className="text-green-700">
          📈 Door de prijsstijgingen ({gemBesparingStijgingPct.toFixed(1)}%/jr gewogen) levert deze case
          {' '}<strong>{fmtEuro(Math.abs(winstDoorIndexatie))} extra</strong> op vergeleken met
          een statische berekening van {jaarBesparing > 0 ? `${fmtEuro(jaarBesparing)} × ${looptijd} jr` : 'jaar-1 × looptijd'}.
        </p>
      </div>
    </div>
  );
}

function fmtEuro(n: number): string {
  return '€ ' + Math.round(n).toLocaleString('nl-NL');
}

function makeId(): string {
  return 'es-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
}
