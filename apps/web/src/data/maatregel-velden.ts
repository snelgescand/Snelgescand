/**
 * Definities van velden per maatregel — voor de detailformulieren.
 *
 * Bewust niet uit calc-core zelf afgeleid: daar staan de typescript types,
 * hier de UI-metadata (label, eenheid, tooltip, type) per veld.
 *
 * Per maatregel:
 *   - kort: 2-3 zin uitleg
 *   - velden: lijst van invulvelden met label en uitleg
 *
 * Velden die niet in deze lijst staan blijven op default. Velden die je
 * verwacht maar mist, hier toevoegen.
 */

export type VeldType = 'number' | 'text' | 'select';

export interface VeldDef {
  pad: string;                  // key in de input, bv. "oppervlakteM2"
  label: string;
  type: VeldType;
  eenheid?: string;
  tooltip?: string;
  /** Specifieke placeholder voor het invulveld, anders dan generiek 'voer waarde in' */
  placeholder?: string;
  opties?: Array<{ waarde: string; label: string }>;
  stap?: number;                // voor number inputs
}

export interface MaatregelMeta {
  kort: string;
  velden: VeldDef[];
}

export const MAATREGEL_META: Record<string, MaatregelMeta> = {
  // ============================================================
  // ISOLATIE
  // ============================================================
  'dakisolatie': {
    kort: 'Dak na-isoleren naar Rc 3,5 of hoger. Levert besparing op het hele jaar door minder warmteverlies.',
    velden: [
      { pad: 'oppervlakteM2', label: 'Dakoppervlak', type: 'number', eenheid: 'm²',
        tooltip: 'Totaal dakoppervlak van het clubhuis dat geïsoleerd wordt.', placeholder: 'bv. 200' },
      { pad: 'huidigeRcWaarde', label: 'Huidige Rc-waarde', type: 'number', stap: 0.1, eenheid: 'm²·K/W',
        tooltip: 'Hoe goed het dak nu isoleert. Default uit bouwjaartabel — overschrijf indien bekend.', placeholder: 'bv. 1.30' },
      { pad: 'nieuweRcWaarde', label: 'Nieuwe Rc-waarde', type: 'number', stap: 0.1, eenheid: 'm²·K/W',
        tooltip: 'Streefwaarde na isolatie. 3,5 is standaard, 6,0 is Bijna Energie Neutraal Gebouw (BENG)-niveau.', placeholder: 'bv. 3.5' },
      { pad: 'stookurenPerJaar', label: 'Stookuren per jaar', type: 'number', eenheid: 'uur',
        tooltip: 'Hoeveel uur per jaar er gestookt wordt. Clubhuis: typisch 1500 uur (5 maand × 10 uur/dag).', placeholder: 'bv. 1500' },
      { pad: 'binnenBuitenDeltaT', label: 'Temperatuurverschil binnen-buiten', type: 'number', eenheid: '°C',
        tooltip: 'Gemiddeld verschil tijdens stookuren. Default 8°C (gemiddeld winterweer).', placeholder: 'bv. 8' },
    ],
  },
  'spouwmuurisolatie': {
    kort: 'Spouw vullen (na-isolatie van gevel). Snelle ingreep, lage kosten, korte TVT.',
    velden: [
      { pad: 'oppervlakteM2', label: 'Geveloppervlak', type: 'number', eenheid: 'm²',
        tooltip: 'Totaal gevel-oppervlak (exclusief ramen).', placeholder: 'bv. 200' },
      { pad: 'huidigeRcWaarde', label: 'Huidige Rc-waarde', type: 'number', stap: 0.1, eenheid: 'm²·K/W', placeholder: 'bv. 1.30' },
      { pad: 'nieuweRcWaarde', label: 'Nieuwe Rc-waarde', type: 'number', stap: 0.1, eenheid: 'm²·K/W',
        tooltip: 'Bij parelvulling typisch 1,3.', placeholder: 'bv. 3.5' },
      { pad: 'stookurenPerJaar', label: 'Stookuren per jaar', type: 'number', eenheid: 'uur', placeholder: 'bv. 1500' },
      { pad: 'kostenPerM2InclBtw', label: 'Kosten per m²', type: 'number', eenheid: '€',
        tooltip: 'Standaard €27,50/m² voor parel- of schuimvulling.', placeholder: 'bv. 27.50' },
    ],
  },
  'vloerisolatie': {
    kort: 'Vloer onder het clubhuis isoleren. Vergt kruipruimte-toegang.',
    velden: [
      { pad: 'oppervlakteM2', label: 'Vloeroppervlak', type: 'number', eenheid: 'm²', placeholder: 'bv. 200' },
      { pad: 'huidigeRcWaarde', label: 'Huidige Rc', type: 'number', stap: 0.1, eenheid: 'm²·K/W', placeholder: 'bv. 1.30' },
      { pad: 'nieuweRcWaarde', label: 'Nieuwe Rc', type: 'number', stap: 0.1, eenheid: 'm²·K/W', placeholder: 'bv. 3.5' },
      { pad: 'isolatieType', label: 'Type isolatie', type: 'select',
        opties: [
          { waarde: 'pir', label: 'PIR (hard, €65/m²)' },
          { waarde: 'eps', label: 'EPS (€50/m²)' },
          { waarde: 'spuiterspray', label: 'Spuitschuim (€55/m²)' },
          { waarde: 'standaard', label: 'Standaard (€60/m²)' },
        ]},
      { pad: 'stookurenPerJaar', label: 'Stookuren per jaar', type: 'number', eenheid: 'uur', placeholder: 'bv. 1500' },
    ],
  },
  'waterzijdig-inregelen': {
    kort: 'Optimaliseren van de cv-installatie zodat alle radiatoren correct hun water krijgen. Snelle, goedkope ingreep met 5-15% gasbesparing.',
    velden: [
      { pad: 'aantalRadiatoren', label: 'Aantal radiatoren / groepen', type: 'number',
        tooltip: 'Aantal afleveringen / radiatoren / vloerverwarming-circuits.', placeholder: 'bv. 12' },
      { pad: 'besparingsPercentage', label: 'Verwachte besparing', type: 'number', stap: 0.01,
        tooltip: 'Default 8% (0,08). Realistisch tussen 5% en 15%.', placeholder: 'bv. 0.08' },
      { pad: 'kostenPerRadiatorInclBtw', label: 'Kosten per radiator', type: 'number', eenheid: '€',
        tooltip: 'Marktprijs ~€350 per radiator inclusief installatie en metingen.', placeholder: 'bv. 350' },
    ],
  },
  'wtw': {
    kort: 'Warmte Terug Winning ventilatie. Wint warmte uit afgevoerde lucht terug naar verse aanvoerlucht.',
    velden: [
      { pad: 'ventilatiedebietM3PerUur', label: 'Ventilatiedebiet', type: 'number', eenheid: 'm³/u',
        tooltip: 'Vuistregel: 4 m³/u per m² gebruiksoppervlak.', placeholder: 'bv. 1200' },
      { pad: 'rendement', label: 'Rendement WTW', type: 'number', stap: 0.05,
        tooltip: 'Moderne units halen 0,85 (85%). Goedkopere modellen 0,70.', placeholder: 'bv. 0.85' },
      { pad: 'stookurenPerJaar', label: 'Draaiuren per jaar', type: 'number', eenheid: 'uur', placeholder: 'bv. 1500' },
      { pad: 'binnenBuitenDeltaT', label: 'Gem. ΔT binnen-buiten', type: 'number', eenheid: '°C',
        tooltip: 'Default 14°C als ventilatie volledige stooktijd actief is.', placeholder: 'bv. 8' },
    ],
  },

  // ============================================================
  // VERWARMING / WARM WATER
  // ============================================================
  'warmtepompboiler': {
    kort: 'Aparte warmtepomp voor tapwater. Vervangt gasgestookt warm water.',
    velden: [
      { pad: 'litersPerJaar', label: 'Warm water per jaar', type: 'number', eenheid: 'liter',
        tooltip: 'Komt typisch uit de douche-analyse. Voor 100 leden × 1 keer/wk × 70L ≈ 365.000 L.' },
      { pad: 'cop', label: 'COP (verhouding warmte/stroom)', type: 'number', stap: 0.1,
        tooltip: 'Default 3,5 voor moderne lucht/water-warmtepompboilers.' },
      { pad: 'aantalUnits', label: 'Aantal units', type: 'number', placeholder: 'bv. 1' },
      { pad: 'prijsPerUnitInclBtw', label: 'Prijs per unit', type: 'number', eenheid: '€' },
      { pad: 'isdeBedragPerUnit', label: 'ISDE-bedrag per unit', type: 'number', eenheid: '€' },
    ],
  },
  'qton-warmtepomp': {
    kort: 'Mitsubishi Q-ton CO₂-warmtepomp. Hoog tapwatertemperatuur (tot 90°C), ideaal voor grote clubs.',
    velden: [
      { pad: 'model', label: 'Model', type: 'select',
        opties: [
          { waarde: 'HMA30A', label: 'HMA30A — 30 kW (€28.500)' },
          { waarde: 'HMA45A', label: 'HMA45A — 45 kW (€38.500)' },
        ]},
      { pad: 'aantalUnits', label: 'Aantal units', type: 'number', placeholder: 'bv. 1' },
      { pad: 'litersPerJaar', label: 'Warm water per jaar', type: 'number', eenheid: 'liter' },
      { pad: 'warmwaterTemperatuurC', label: 'Tapwater-temperatuur', type: 'select',
        opties: [
          { waarde: '65', label: '65°C (standaard)' },
          { waarde: '90', label: '90°C (legionellaboiler vervalt)' },
        ]},
    ],
  },
  'lmnt-warmtepomp': {
    kort: 'Modulair LMNT-systeem. Voor middelgrote clubs, modulair op te schalen in 5 kW-stappen.',
    velden: [
      { pad: 'vermogenKw', label: 'Vermogen', type: 'number', eenheid: 'kW',
        tooltip: 'Stappen van 5 kW. 15 kW voor ~120 leden, 30 kW voor 300+ leden.', placeholder: 'bv. 15' },
      { pad: 'litersPerJaar', label: 'Warm water per jaar', type: 'number', eenheid: 'liter' },
      { pad: 'warmwaterTemperatuurC', label: 'Tapwater-temperatuur', type: 'number', eenheid: '°C' },
      { pad: 'metLegionellaBoiler', label: 'Inclusief legionellaboiler?', type: 'select',
        opties: [{ waarde: 'true', label: 'Ja' }, { waarde: 'false', label: 'Nee' }] },
    ],
  },
  'lucht-water-warmtepomp': {
    kort: 'Volledige vervanging van gasketel door lucht/water-warmtepomp voor ruimteverwarming en eventueel tapwater.',
    velden: [
      { pad: 'oppervlakteM2', label: 'Te verwarmen oppervlakte', type: 'number', eenheid: 'm²', placeholder: 'bv. 200' },
      { pad: 'heeftWtw', label: 'Heeft WTW-ventilatie?', type: 'select',
        opties: [{ waarde: 'true', label: 'Ja' }, { waarde: 'false', label: 'Nee' }],
        tooltip: 'Met WTW is de benodigde vermogensafgifte lager.' },
      { pad: 'scop', label: 'SCOP (seizoens-COP)', type: 'number', stap: 0.1,
        tooltip: 'Default 3,5. Bij lage temperatuurafgifte (vloerverwarming) hoger.' },
      { pad: 'aandeelRuimteverwarmingVanGas', label: 'Aandeel ruimteverwarming van gas', type: 'number', stap: 0.05,
        tooltip: 'Default 0,7 (70%). Rest gaat naar tapwater. Pas aan als je de verdeling weet.' },
    ],
  },
  'hybride-warmtepomp': {
    kort: 'Hybride combi: bestaande cv-ketel + warmtepomp. WP doet de basis-verwarming, ketel pakt piekvraag op.',
    velden: [
      { pad: 'oppervlakteM2', label: 'Te verwarmen oppervlakte', type: 'number', eenheid: 'm²', placeholder: 'bv. 200' },
      { pad: 'cop', label: 'COP', type: 'number', stap: 0.1 },
      { pad: 'beta', label: 'Beta (deel via WP)', type: 'number', stap: 0.05,
        tooltip: 'Aandeel van de warmtevraag dat de warmtepomp dekt. Default 0,78 (78%).' },
    ],
  },

  // ============================================================
  // STROOM
  // ============================================================
  'binnenverlichting': {
    kort: 'TL-armaturen vervangen door LED. Lage TVT, weinig overlast.',
    velden: [
      { pad: 'aantalArmaturen', label: 'Aantal armaturen', type: 'number', placeholder: 'bv. 40' },
      { pad: 'wattageOudPerArmatuur', label: 'Wattage oud (per stuk)', type: 'number', eenheid: 'W',
        tooltip: 'TL-buis met conventioneel voorschakelapparaat is typisch 58W. Met HF-VSA ~50W.' },
      { pad: 'wattageNieuwPerArmatuur', label: 'Wattage nieuw (per stuk)', type: 'number', eenheid: 'W',
        tooltip: 'LED-vervangers typisch 18-28W.' },
      { pad: 'brandurenPerJaar', label: 'Branduren per jaar', type: 'number', eenheid: 'uur', placeholder: 'bv. 1500' },
      { pad: 'kostenPerArmatuurInclBtw', label: 'Kosten per armatuur', type: 'number', eenheid: '€' },
    ],
  },
  'ledveldverlichting': {
    kort: 'Veldverlichting (buitensport) vervangen door LED-spots. Hoge investering, hoge subsidies, lange TVT.',
    velden: [
      { pad: 'aantalVelden', label: 'Aantal velden', type: 'number' },
      { pad: 'vermogenOudKwPerVeld', label: 'Vermogen oud per veld', type: 'number', eenheid: 'kW' },
      { pad: 'vermogenNieuwKwPerVeld', label: 'Vermogen nieuw per veld', type: 'number', eenheid: 'kW',
        tooltip: 'LED-vervanging haalt typisch 50-60% reductie.' },
      { pad: 'brandurenPerJaarPerVeld', label: 'Branduren per jaar per veld', type: 'number', eenheid: 'uur',
        tooltip: 'Bij trainings/wedstrijdgebruik typisch 400-800 uur/jaar.' },
      { pad: 'investeringPerVeldInclBtw', label: 'Investering per veld', type: 'number', eenheid: '€',
        tooltip: 'Inclusief masten, kabels, armaturen en montage. €15-30k per veld.' },
    ],
  },
  'zonnepanelen': {
    kort: 'PV-installatie op het dak. Saldering loopt af 2027-2031, eigen verbruik wordt belangrijker.',
    velden: [
      { pad: 'aantalPanelen', label: 'Aantal panelen', type: 'number',
        tooltip: 'Vuistregel: 1,8 m² per paneel. 100 panelen = 180 m² dak nodig.', placeholder: 'bv. 100' },
      { pad: 'wpPerPaneel', label: 'Vermogen per paneel', type: 'number', eenheid: 'Wp',
        tooltip: 'Moderne panelen 425-450 Wp.' },
      { pad: 'instralingsfactor', label: 'Instralingsfactor', type: 'number', stap: 0.05,
        tooltip: '1,0 voor optimaal zuid + 35°. 0,85 voor goede oriëntatie. 0,70 voor matig.' },
      { pad: 'eigenVerbruikRatio', label: 'Aandeel eigen verbruik', type: 'number', stap: 0.05,
        tooltip: 'Wat je direct zelf gebruikt. Hoger = beter na saldering. Sportclub typisch 0,15-0,30.' },
      { pad: 'projectieJaren', label: 'Projectie-jaren', type: 'number',
        tooltip: 'Aantal jaren voor de cashflow-projectie. Standaard 15.' },
    ],
  },
  'batterij-uitgebreid': {
    kort: 'Een batterij levert vijf voordelen tegelijk: (1) meer eigen verbruik van PV-stroom, (2) vermijden van boete op teruglevering, (3) EPEX-handelsvoordeel ’s zomers, (4) opvangen van piekvraag waardoor netverzwaring vermeden kan worden, (5) noodstroom bij stroomuitval. Berekening volgt het originele Excel-rekenmodel met BOSA-subsidie, restwaarde en EMS-kosten.',
    velden: [
      { pad: 'capaciteitKwh', label: 'Capaciteit accu', type: 'number', eenheid: 'kWh',
        tooltip: 'Bruikbare capaciteit. Voor middelgrote sportclub typisch 30-100 kWh.', placeholder: 'bv. 100' },
      { pad: 'vermogenKw', label: 'Vermogen accu', type: 'number', eenheid: 'kW',
        tooltip: 'Maximaal laad-/ontlaadvermogen. Typisch ½ × capaciteit.', placeholder: 'bv. 50' },
      { pad: 'brutoInvesteringInclBtw', label: 'Bruto investering (incl. btw)', type: 'number', eenheid: '€',
        tooltip: 'Totale investering inclusief btw, installatie, aansluiting. Excel default: €121.000 voor 100 kWh.', placeholder: 'bv. 121000' },
      { pad: 'restwaardeEur', label: 'Restwaarde na looptijd', type: 'number', eenheid: '€',
        tooltip: 'Verwachte terugkoopwaarde van de accu na 15 jaar. Excel default: €10.000.', placeholder: 'bv. 10000' },
      { pad: 'pvOpwekKwhPerJaar', label: 'PV-opwek per jaar', type: 'number', eenheid: 'kWh',
        tooltip: 'Bruto stroomopwek van zonnepanelen. Komt uit de zonnepanelen-module of inschatting.', placeholder: 'bv. 38000' },
      { pad: 'directVerbruikFractieZonderAccu', label: 'Direct eigen verbruik zonder accu', type: 'number', stap: 0.05,
        tooltip: 'Fractie PV-opwek die zonder accu direct gebruikt wordt. Excel default: 0,25 (25%).', placeholder: 'bv. 0.25' },
      { pad: 'extraVerbruikFractieMetAccu', label: 'Extra eigen verbruik door accu', type: 'number', stap: 0.05,
        tooltip: 'Fractie van resterende teruglevering die de accu kan opvangen. Excel default: 0,33 (33%).', placeholder: 'bv. 0.33' },
      { pad: 'kaleStroomprijsPerKwh', label: 'Kale stroomprijs', type: 'number', stap: 0.01, eenheid: '€/kWh',
        tooltip: 'Stroomprijs excl. energiebelasting/ODE/BTW. Excel default: €0,24/kWh.', placeholder: 'bv. 0.24' },
      { pad: 'terugleverVergoedingPerKwh', label: 'Terugleververgoeding', type: 'number', stap: 0.01, eenheid: '€/kWh',
        tooltip: 'Wat de leverancier per kWh teruglevering betaalt na salderingsafbouw. Default 2025: €0,08/kWh.', placeholder: 'bv. 0.08' },
      { pad: 'boeteTerugleveringPerKwh', label: 'Boete op teruglevering', type: 'number', stap: 0.001, eenheid: '€/kWh',
        tooltip: 'Tarief dat netbeheerder/leverancier rekent op teruglevering tijdens piek (netcongestie). Default: €0,055/kWh.', placeholder: 'bv. 0.055' },
      { pad: 'gemiddeldeEpexPrijsPerKwh', label: 'Gemiddelde EPEX-prijs', type: 'number', stap: 0.01, eenheid: '€/kWh',
        tooltip: 'Voor handelsstrategie zomer. Excel default ~€0,10/kWh.', placeholder: 'bv. 0.10' },
      { pad: 'jaarlijkseEmsKostenEur', label: 'Jaarlijkse EMS-software-kosten', type: 'number', eenheid: '€/jaar',
        tooltip: 'Energy Management System software voor handelsstrategie. Default €1.500/jaar.', placeholder: 'bv. 1500' },
    ],
  },
  'batterij-eenvoudig': {
    kort: 'Snelle batterij-indicatie op basis van jaartotalen — voor een eerste sanity check. Kies "Batterij — volledige berekening" voor de complete businesscase met alle voordelen (eigen verbruik, EPEX-handel, vermeden boete, piekafvlakking, noodstroom).',
    velden: [
      { pad: 'capaciteitKwh', label: 'Capaciteit', type: 'number', eenheid: 'kWh',
        tooltip: 'Bruikbare capaciteit. Voor sportclubs typisch 50-200 kWh. Vuistregel: 1× gemiddeld dagverbruik voor zelfconsumptie, 2-3× voor arbitrage.', placeholder: 'bv. 30' },
      { pad: 'vermogenKw', label: 'Vermogen', type: 'number', eenheid: 'kW',
        tooltip: 'Maximaal laad-/ontladevermogen. Typisch C-rate 0,5 (vermogen = ½ × capaciteit). 100 kWh batterij = 50 kW vermogen.', placeholder: 'bv. 15' },
      { pad: 'cycliPerJaar', label: 'Cycli per jaar', type: 'number',
        tooltip: '300 voor pure zelfconsumptie (1 cyclus/dag). 500-700 voor actieve EPEX-handel. Beïnvloedt levensduur: bij 5.000 totale cycli = 7-16 jaar.' },
      { pad: 'gemiddeldeEpexSpreadPerKwh', label: 'Gem. EPEX-spread', type: 'number', stap: 0.01, eenheid: '€/kWh',
        tooltip: 'Gemiddeld prijsverschil tussen laad- en ontlaad-uren. Conservatief €0,10-0,12/kWh. Bij hoge prijsvolatiliteit (winter) tot €0,20/kWh.' },
      { pad: 'kabelVerliesFractie', label: 'Kabel-/inverter-verlies', type: 'number', stap: 0.01,
        tooltip: 'Energieverlies bij laden + ontladen, als fractie. Default 0,02 (2%). Goede systemen: 0,02. Slechte/lange kabels: 0,05.' },
      { pad: 'prijsPerKwhInclBtw', label: 'Prijs per kWh capaciteit', type: 'number', eenheid: '€/kWh',
        tooltip: 'Investering per kWh, inclusief BTW, installatie en aansluiting. Anno 2025 typisch €400-€600/kWh voor commerciële batterijen.' },
      { pad: 'besparingPiekvermogenEur', label: 'Besparing piekvermogen', type: 'number', eenheid: '€/jaar',
        tooltip: 'Extra besparing op gecontracteerde piekkW (netbeheer-tarief). Alleen relevant bij grootverbruiker-aansluiting (>3×80A). Default 0.' },
    ],
  },

  // ============================================================
  // OVERIG
  // ============================================================
  'eboiler': {
    kort: 'Elektrische boiler. Vervangt gas door stroom. Geschikt voor noodboiler of overschot-PV.',
    velden: [
      { pad: 'litersPerJaar', label: 'Warm water per jaar', type: 'number', eenheid: 'liter' },
      { pad: 'vermogenKw', label: 'Vermogen', type: 'number', eenheid: 'kW', placeholder: 'bv. 15' },
      { pad: 'brutoInvestering', label: 'Investering', type: 'number', eenheid: '€' },
    ],
  },
  'pvt-tapwater': {
    kort: 'PVT-panelen — combineren PV (stroom) en thermisch (warmte) in één paneel.',
    velden: [
      { pad: 'aantalPanelen', label: 'Aantal PVT-panelen', type: 'number', placeholder: 'bv. 100' },
      { pad: 'thermischePbrengstPerPaneelKwhJr', label: 'Thermisch per paneel', type: 'number', eenheid: 'kWh/jr' },
      { pad: 'stroomOpbrengstPerPaneelKwhJr', label: 'PV per paneel', type: 'number', eenheid: 'kWh/jr' },
    ],
  },
};

/* Specifiek voor glasisolatie en douches: multi-segment forms */

export const GLAS_OPTIES = [
  { waarde: 'enkel',    label: 'Enkel glas' },
  { waarde: 'dubbel',   label: 'Dubbel glas' },
  { waarde: 'hr',       label: 'HR-glas' },
  { waarde: 'hr-p',     label: 'HR+' },
  { waarde: 'hr-pp',    label: 'HR++' },
  { waarde: 'triple',   label: 'Triple-glas' },
];

export const DAG_NAMEN = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
