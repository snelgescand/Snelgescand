/**
 * Batterij-uitgebreid module.
 *
 * Bron: Accuberekening__naam_club_.xlsx — alle formules en parameters
 * direct ontleend aan het rekenmodel van Op Naar Nul.
 *
 * Dit model rekent de werkelijke meerwaarde van een accu door per jaar:
 *
 *  1. **Bruto stroombehoefte** (huidig)
 *  2. **Stroombehoefte na verduurzaming** (extra door HP, e-boiler etc.)
 *  3. **PV-opwek (bruto)**: kWh/jaar
 *  4. **Direct eigen verbruik (zonder accu)**: PV × directVerbruikFractie
 *     Default 0,25 — zonder accu wordt slechts 25% direct gebruikt.
 *  5. **Met accu**: meer eigen verbruik mogelijk:
 *     - Extra eigen verbruik = teruglevering × accu_extra_fractie (default 0,33)
 *     - EPEX-handel zomer: overschot × accu_extra_fractie × gemiddelde EPEX-prijs
 *     - Boete teruglevering vermeden: overschot × boete_per_kWh
 *  6. **Restwaarde** na looptijd (default €10.000) — drukt netto investering
 *  7. **BOSA/DUMAVA subsidie** standaard 40% op bruto investering
 *
 * Resultaat: jaarlijkse cashflow-voordeel + netto investering + TVT.
 */

import type {
  MaatregelModule,
  MaatregelResultaat,
  ProjectContext,
  Subsidie,
  Warning,
} from '../types/index.js';
import { dumavaSubsidie, maakBusinessCase } from '../util/business-case.js';

export interface BatterijUitgebreidInput {
  /** Capaciteit accu in kWh */
  capaciteitKwh: number;
  /** Vermogen accu in kW (typisch capaciteit/2 voor 2-uurs accu) */
  vermogenKw: number;

  /** Bruto investering incl btw (€) */
  brutoInvesteringInclBtw: number;

  /** Restwaarde na looptijd (€) — wordt afgetrokken van netto investering */
  restwaardeEur: number;

  /** PV opwek totaal in kWh/jaar (komt uit zonnepanelen-module of inschatting) */
  pvOpwekKwhPerJaar: number;

  /** Direct eigen verbruik fractie ZONDER accu (default 0,25 = 25%) */
  directVerbruikFractieZonderAccu: number;

  /** Extra eigen verbruik fractie MET accu (default 0,33 = 33% van teruglevering) */
  extraVerbruikFractieMetAccu: number;

  /** Kale stroomprijs €/kWh (excl. EB/ODE/BTW) */
  kaleStroomprijsPerKwh: number;

  /** Teruglever-vergoeding na saldering €/kWh (default 0,08) */
  terugleverVergoedingPerKwh: number;

  /** Boete op teruglevering €/kWh (default 0,055 — netcongestie-tarief) */
  boeteTerugleveringPerKwh: number;

  /** Gemiddelde EPEX-prijs €/kWh — voor zomer-handel (default 0,10) */
  gemiddeldeEpexPrijsPerKwh: number;

  /** Aantal cycli per jaar voor handelsstrategie (alleen voor levensduur-warning) */
  cycliPerJaar: number;

  /** Jaarlijkse EMS-software-kosten (energie-management; default €1.500) */
  jaarlijkseEmsKostenEur: number;

  extraSubsidies?: Subsidie[];
}

export interface BatterijUitgebreidResultaat extends MaatregelResultaat {
  /** Vermeden boete op teruglevering (€/jaar) */
  vermedenBoeteEur: number;
  /** Extra waarde door meer eigen verbruik (€/jaar) */
  extraEigenVerbruikWaardeEur: number;
  /** EPEX-handelsvoordeel zomer (€/jaar) */
  epexHandelVoordeelEur: number;
  /** Detail-uitsplitsing van de jaarlijkse besparing */
  uitsplitsing: {
    vermedenBoete: number;
    extraEigenVerbruik: number;
    epexHandel: number;
    minEmsKosten: number;
    minRestVerlies: number;
  };
}

export const batterijUitgebreidModule: MaatregelModule<BatterijUitgebreidInput, BatterijUitgebreidResultaat> = {
  id: 'batterij-uitgebreid',
  naam: 'Batterij (uitgebreid — uit Excel)',

  defaultInput(context: ProjectContext): BatterijUitgebreidInput {
    return {
      capaciteitKwh: 100,
      vermogenKw: 50,
      brutoInvesteringInclBtw: 121000,
      restwaardeEur: 10000,
      pvOpwekKwhPerJaar: 38000,  // vuistregel groot dak ~38 MWh/jaar
      directVerbruikFractieZonderAccu: 0.25,
      extraVerbruikFractieMetAccu: 0.33,
      kaleStroomprijsPerKwh: context.energie?.stroomprijsKaalPerKwh ?? 0.24,
      terugleverVergoedingPerKwh: 0.08,
      boeteTerugleveringPerKwh: 0.055,
      gemiddeldeEpexPrijsPerKwh: 0.10,
      cycliPerJaar: 365,
      jaarlijkseEmsKostenEur: 1500,
    };
  },

  bereken(input: BatterijUitgebreidInput, context: ProjectContext): BatterijUitgebreidResultaat {
    const warnings: Warning[] = [];

    // Veiligheid: voorkom delingen door 0 of negatieve waarden
    const pv = Math.max(0, input.pvOpwekKwhPerJaar);
    const directZonder = pv * Math.max(0, Math.min(1, input.directVerbruikFractieZonderAccu));
    const teruglevering = Math.max(0, pv - directZonder);

    // 1. Vermeden boete op teruglevering (de overschot ging anders met boete weg)
    const vermedenBoete = teruglevering * input.extraVerbruikFractieMetAccu * input.boeteTerugleveringPerKwh;

    // 2. Extra waarde door meer eigen verbruik (i.p.v. terugleveren voor lage prijs,
    //    nu zelf gebruiken voor de volle kale stroomprijs)
    const extraEigenKwh = teruglevering * input.extraVerbruikFractieMetAccu;
    const extraEigenVerbruikWaarde = extraEigenKwh * (input.kaleStroomprijsPerKwh - input.terugleverVergoedingPerKwh);

    // 3. EPEX-handelsvoordeel zomer:
    //    33% van resterend overschot kan op de EPEX-spotmarkt verhandeld worden
    const epexHandelKwh = teruglevering * 0.33;
    const epexHandelVoordeel = epexHandelKwh * Math.max(0, input.gemiddeldeEpexPrijsPerKwh - input.terugleverVergoedingPerKwh);

    // 4. Minus jaarlijkse EMS-kosten
    const emsKosten = input.jaarlijkseEmsKostenEur;

    // 5. Restverlies (degradatie + niet-perfecte arbitrage), grof 5% van totaal
    const restVerlies = (vermedenBoete + extraEigenVerbruikWaarde + epexHandelVoordeel) * 0.05;

    const besparingPerJaarTotaal =
      vermedenBoete + extraEigenVerbruikWaarde + epexHandelVoordeel - emsKosten - restVerlies;

    // Investering: bruto - restwaarde geeft effectieve netto
    const brutoInvestering = input.brutoInvesteringInclBtw;

    // DUMAVA/BOSA-subsidie op de bruto investering (40% bij integraal-pakket scenario)
    const subsidies: Subsidie[] = [
      dumavaSubsidie(brutoInvestering, context),
      ...(input.extraSubsidies ?? []),
    ];

    // Restwaarde als aparte 'subsidie'-regel (vermindert effectief de investering)
    if (input.restwaardeEur > 0) {
      subsidies.push({
        bron: 'overig',
        naam: 'Restwaarde accu',
        bedrag: input.restwaardeEur,
        voorwaarden: 'Verwachte restwaarde na 15 jaar bij goede inruil/markt',
      });
    }

    // Warnings
    if (input.capaciteitKwh < 20) {
      warnings.push({
        level: 'warning',
        code: 'KLEINE_ACCU',
        message: 'Onder 20 kWh is een accu meestal niet rendabel voor een sportclub.',
      });
    }
    if (besparingPerJaarTotaal <= 0) {
      warnings.push({
        level: 'warning',
        code: 'GEEN_OPBRENGST',
        message: 'Berekende jaarlijkse opbrengst is 0 of negatief — controleer EMS-kosten en PV-opwek.',
      });
    }
    if (pv === 0) {
      warnings.push({
        level: 'warning',
        code: 'GEEN_PV',
        message: 'Zonder PV-opwek heeft een accu geen zinvolle businesscase. Voeg eerst zonnepanelen toe.',
      });
    }

    // Bouw een minimale base via maakBusinessCase (alleen voor TVT/CO2-helpers),
    // en override besparingPerJaar omdat de batterij-besparing niet uit gas/stroom kWh komt
    // maar uit een combinatie van EPEX-handel, vermeden boete en extra eigen verbruik.
    const baseResult = maakBusinessCase({
      maatregelId: 'batterij-uitgebreid' as const,
      brutoInvestering,
      subsidies,
      context,
      warnings,
      besparingStroomKwh: 0,
      extraStroomverbruikKwh: 0,
      piekVermogenKw: 0,
    });

    // Override besparing met de werkelijke accu-cashflow
    const totaleSubsidie = subsidies.reduce((s, x) => s + x.bedrag, 0);
    const nettoInvestering = brutoInvestering - totaleSubsidie;
    const tvt = besparingPerJaarTotaal > 0 ? nettoInvestering / besparingPerJaarTotaal : Infinity;

    return {
      ...baseResult,
      besparingPerJaar: Math.round(besparingPerJaarTotaal),
      terugverdientijdJaren: Number.isFinite(tvt) ? Math.round(tvt * 10) / 10 : Infinity,
      vermedenBoeteEur: Math.round(vermedenBoete),
      extraEigenVerbruikWaardeEur: Math.round(extraEigenVerbruikWaarde),
      epexHandelVoordeelEur: Math.round(epexHandelVoordeel),
      uitsplitsing: {
        vermedenBoete: Math.round(vermedenBoete),
        extraEigenVerbruik: Math.round(extraEigenVerbruikWaarde),
        epexHandel: Math.round(epexHandelVoordeel),
        minEmsKosten: -Math.round(emsKosten),
        minRestVerlies: -Math.round(restVerlies),
      },
    };
  },
};
