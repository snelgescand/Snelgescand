/**
 * Batterij tijdreeks-engine (8760-uur SOC-simulatie).
 *
 * Bron: Accu_model_PV_curtailment__v1_3_2__EPEX_.xlsx
 *
 * Pure functie. Geen DOM/Worker-afhankelijkheden — die zit in de wrapper
 * in apps/web. Verwerkt 8760 uur (of meer) in < 50ms typisch.
 *
 * Algoritme (per uur):
 *   1. netto = productie_pv - verbruik
 *   2. Als netto > 0:
 *        a. laad batterij tot pv_max-charge of capaciteit
 *        b. overschot → curtailment of teruglevering
 *   3. Als netto < 0:
 *        a. ontlaad batterij om tekort te dekken
 *        b. resterend tekort → afname net
 *   4. Buiten zonneuren: EPEX-arbitrage in goedkoopste/duurste uren
 *   5. SOC bijhouden met round-trip efficiency
 *
 * Limieten:
 *   - SOC tussen socMin (typ 5%) en socMax (typ 95%)
 *   - Vermogen ≤ vermogenKw
 *   - Round-trip verlies: kabel + cell-verlies (default 0.04 totaal)
 */

import type { Warning } from '../types/index.js';

export interface BatterijConfig {
  capaciteitKwh: number;
  vermogenKw: number;
  socMinFractie: number;       // bv 0.05
  socMaxFractie: number;       // bv 0.95
  roundTripEfficiency: number; // bv 0.96 (= 4% verlies)
  /** Aantal goedkoopste uren per dag waarop geladen mag worden voor arbitrage */
  arbitrageLaadurenPerDag: number;
  /** Idem voor ontladen */
  arbitrageOntlaadurenPerDag: number;
  /** Tarief netbeheer per kWh import (€) — voor reken-volledigheid */
  nettarievenImportEur: number;
  /** Tarief netbeheer per kWh export (€) — vaak 0 */
  nettarievenExportEur: number;
}

export interface BatterijTijdreeksInput {
  config: BatterijConfig;
  /** PV-productie per uur in kW (lengte 8760) */
  pvProductieKw: Float32Array;
  /** Verbruik per uur in kW (lengte 8760) */
  verbruikKw: Float32Array;
  /** EPEX-prijs per uur in €/kWh (lengte 8760) */
  epexPrijsPerKwh: Float32Array;
  /** Optioneel: initiële SOC (default = socMin) */
  initieleSocFractie?: number;
  /** Optioneel: terugleververgoeding (€/kWh) voor PV-overschot zonder batterij */
  terugleverPrijsPerKwh?: number;
}

export interface BatterijUurResultaat {
  socKwh: Float32Array;
  netImportKw: Float32Array;
  netExportKw: Float32Array;
  batterijLadenKw: Float32Array;
  batterijOntladenKw: Float32Array;
  curtailmentKw: Float32Array;
}

export interface BatterijTijdreeksResultaat {
  uur: BatterijUurResultaat;
  /** Aggregaten over de periode */
  totaal: {
    pvOpwekKwh: number;
    pvEigenVerbruikKwh: number;
    pvViaBatterijKwh: number;
    pvTeruggeleverdKwh: number;
    pvGecurtailedKwh: number;
    nettoImportKwh: number;
    nettoExportKwh: number;
    cyclesEquivalent: number;
    omzetEpexArbitrageEur: number;
    kostenZonderBatterijEur: number;
    kostenMetBatterijEur: number;
    besparingTotaalEur: number;
  };
  warnings: Warning[];
}

/**
 * Helper: bepaal voor elke 24-urige dag de N goedkoopste uur-indices en
 * de N duurste. Voor arbitrage-modus.
 */
function bepaalArbitrageUren(
  epexPrijzen: Float32Array,
  laaduren: number,
  ontladuren: number,
): { laadUren: Set<number>; ontladuren: Set<number> } {
  const laadSet = new Set<number>();
  const ontladSet = new Set<number>();
  const totaalUren = epexPrijzen.length;
  const dagen = Math.floor(totaalUren / 24);

  for (let d = 0; d < dagen; d++) {
    const start = d * 24;
    const dagPrijzen: Array<{ uur: number; prijs: number }> = [];
    for (let h = 0; h < 24; h++) {
      dagPrijzen.push({ uur: start + h, prijs: epexPrijzen[start + h] });
    }
    dagPrijzen.sort((a, b) => a.prijs - b.prijs);
    for (let i = 0; i < laaduren && i < 24; i++) {
      laadSet.add(dagPrijzen[i].uur);
    }
    for (let i = 0; i < ontladuren && i < 24; i++) {
      ontladSet.add(dagPrijzen[24 - 1 - i].uur);
    }
  }
  return { laadUren: laadSet, ontladuren: ontladSet };
}

export function simuleerBatterijTijdreeks(input: BatterijTijdreeksInput): BatterijTijdreeksResultaat {
  const { config, pvProductieKw, verbruikKw, epexPrijsPerKwh } = input;
  const warnings: Warning[] = [];

  const N = pvProductieKw.length;
  if (verbruikKw.length !== N || epexPrijsPerKwh.length !== N) {
    throw new Error(`Tijdreeksen moeten dezelfde lengte hebben (${N})`);
  }

  // Round-trip naar laad+ontlaad efficiency (sqrt)
  const eta = Math.sqrt(config.roundTripEfficiency);

  const capaciteit = config.capaciteitKwh;
  const minSoc = capaciteit * config.socMinFractie;
  const maxSoc = capaciteit * config.socMaxFractie;
  const initSoc = input.initieleSocFractie != null
    ? capaciteit * input.initieleSocFractie
    : minSoc;

  const socKwh = new Float32Array(N);
  const netImportKw = new Float32Array(N);
  const netExportKw = new Float32Array(N);
  const batterijLadenKw = new Float32Array(N);
  const batterijOntladenKw = new Float32Array(N);
  const curtailmentKw = new Float32Array(N);

  const { laadUren, ontladuren } = bepaalArbitrageUren(
    epexPrijsPerKwh,
    config.arbitrageLaadurenPerDag,
    config.arbitrageOntlaadurenPerDag,
  );

  let soc = initSoc;
  let totalCharged = 0;

  let pvOpwek = 0;
  let pvEigen = 0;
  let pvViaBatt = 0;
  let pvTerug = 0;
  let pvCurtail = 0;
  let import_ = 0;
  let export_ = 0;
  let epexArbitrageOmzet = 0;
  let kostenMetBatt = 0;
  let kostenZonder = 0;

  const tlPrijs = input.terugleverPrijsPerKwh ?? 0;

  for (let t = 0; t < N; t++) {
    const pv = pvProductieKw[t];
    const verbruik = verbruikKw[t];
    const prijs = epexPrijsPerKwh[t];

    pvOpwek += pv;

    // Zonder batterij — wat zou er gebeuren?
    const nettoZonder = pv - verbruik;
    if (nettoZonder >= 0) {
      kostenZonder -= nettoZonder * tlPrijs; // teruglevering = inkomst
    } else {
      kostenZonder += -nettoZonder * (prijs + config.nettarievenImportEur);
    }

    // ===== Met batterij =====
    const netto = pv - verbruik;
    let laden = 0;
    let ontladen = 0;
    let curtail = 0;
    let imp = 0;
    let exp = 0;

    if (netto > 0) {
      // PV-overschot
      const pvOverschot = netto;
      // Eerst direct eigen verbruik telt (komt nu in pvEigen-aandeel automatisch via verbruik-aftrek hierboven)
      pvEigen += verbruik;
      // Probeer batterij te laden
      const ruimteSoc = maxSoc - soc;
      const maxLaadKwhDitUur = Math.min(config.vermogenKw, ruimteSoc / eta);
      laden = Math.min(pvOverschot, maxLaadKwhDitUur);
      soc += laden * eta;
      pvViaBatt += laden;
      const rest = pvOverschot - laden;
      if (rest > 0) {
        // Terugleveren of curtailen — terugleveren als prijs ≥ 0, anders curtailen
        if (tlPrijs > 0 && prijs >= 0) {
          exp = rest;
          pvTerug += rest;
        } else {
          curtail = rest;
          pvCurtail += rest;
        }
      }
    } else {
      pvEigen += pv;
      // Tekort — probeer batterij te ontladen
      const tekort = -netto;
      const beschikbaarSoc = soc - minSoc;
      const maxOntladenKwhDitUur = Math.min(config.vermogenKw, beschikbaarSoc * eta);
      ontladen = Math.min(tekort, maxOntladenKwhDitUur);
      soc -= ontladen / eta;
      const restTekort = tekort - ontladen;
      imp = restTekort;
    }

    // EPEX-arbitrage (alleen wanneer geen PV-conflict)
    if (laden === 0 && laadUren.has(t)) {
      const ruimteSoc = maxSoc - soc;
      const maxLaadKwhDitUur = Math.min(config.vermogenKw, ruimteSoc / eta);
      if (maxLaadKwhDitUur > 0) {
        laden = maxLaadKwhDitUur;
        soc += laden * eta;
        imp += laden;
        epexArbitrageOmzet -= laden * (prijs + config.nettarievenImportEur);
      }
    } else if (ontladen === 0 && ontladuren.has(t)) {
      const beschikbaarSoc = soc - minSoc;
      const maxOntladenKwhDitUur = Math.min(config.vermogenKw, beschikbaarSoc * eta);
      if (maxOntladenKwhDitUur > 0) {
        ontladen = maxOntladenKwhDitUur;
        soc -= ontladen / eta;
        exp += ontladen;
        epexArbitrageOmzet += ontladen * (prijs - config.nettarievenExportEur);
      }
    }

    kostenMetBatt += imp * (prijs + config.nettarievenImportEur);
    kostenMetBatt -= exp * (prijs - config.nettarievenExportEur);

    socKwh[t] = soc;
    netImportKw[t] = imp;
    netExportKw[t] = exp;
    batterijLadenKw[t] = laden;
    batterijOntladenKw[t] = ontladen;
    curtailmentKw[t] = curtail;

    totalCharged += laden;
    import_ += imp;
    export_ += exp;
  }

  if (capaciteit > 0) {
    const cycles = totalCharged / capaciteit;
    if (cycles > 600) {
      warnings.push({
        level: 'warning',
        code: 'CYCLES_HOOG',
        message: `${cycles.toFixed(0)} equivalente cycli/jaar — controleer levensduur en garantievoorwaarden.`,
      });
    }
  }

  return {
    uur: {
      socKwh,
      netImportKw,
      netExportKw,
      batterijLadenKw,
      batterijOntladenKw,
      curtailmentKw,
    },
    totaal: {
      pvOpwekKwh: pvOpwek,
      pvEigenVerbruikKwh: pvEigen,
      pvViaBatterijKwh: pvViaBatt,
      pvTeruggeleverdKwh: pvTerug,
      pvGecurtailedKwh: pvCurtail,
      nettoImportKwh: import_,
      nettoExportKwh: export_,
      cyclesEquivalent: capaciteit > 0 ? totalCharged / capaciteit : 0,
    omzetEpexArbitrageEur: epexArbitrageOmzet,
      kostenZonderBatterijEur: kostenZonder,
      kostenMetBatterijEur: kostenMetBatt,
      besparingTotaalEur: kostenZonder - kostenMetBatt,
    },
    warnings,
  };
}
