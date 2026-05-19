/**
 * Kennisbank-content.
 *
 * Per artikel: id, titel, korte beschrijving, en uitleg met formule-blokken.
 * Bewust in code (geen DB) — kunnen we makkelijk uitbreiden per release.
 */

export interface KennisArtikel {
  id: string;
  categorie: 'algemeen' | 'isolatie' | 'verwarming' | 'stroom' | 'subsidies';
  titel: string;
  korteBeschrijving: string;
  paragrafen: Array<
    | { type: 'tekst'; inhoud: string }
    | { type: 'formule'; latex: string; toelichting?: string }
    | { type: 'lijst'; items: string[] }
    | { type: 'tabel'; kolommen: string[]; rijen: string[][] }
    | { type: 'tip'; inhoud: string }
  >;
  bronnen?: string[];
}

export const KENNIS: KennisArtikel[] = [
  // ============================================================
  // ALGEMEEN
  // ============================================================
  {
    id: 'businesscase',
    categorie: 'algemeen',
    titel: 'Hoe wordt de businesscase opgebouwd?',
    korteBeschrijving: 'De volgorde investering → subsidie → besparing → terugverdientijd, met alle aannames.',
    paragrafen: [
      { type: 'tekst', inhoud: 'Per maatregel wordt eerst de bruto investering bepaald op basis van vaste markttarieven (€/m², €/kW, etc.). Daarna worden subsidies afgetrokken. De besparing per jaar wordt berekend op basis van fysica (warmteverliezen, rendementen) of statistische vuistregels.' },
      { type: 'formule', latex: 'Netto investering = Bruto investering - \\sum Subsidies', toelichting: 'Subsidies worden opgeteld; let op dat sommige niet stapelbaar zijn.' },
      { type: 'formule', latex: 'TVT_{jaren} = \\frac{Netto\\,investering}{Besparing_{per\\,jaar}}', toelichting: 'Eenvoudige terugverdientijd — exclusief rente en prijsontwikkeling.' },
      { type: 'tip', inhoud: 'De rollup-TVT van het project is gewogen gemiddeld over alle maatregelen, dus dominant bepaald door grote investeringen zoals warmtepomp of PV.' },
    ],
  },
  {
    id: 'co2-factoren',
    categorie: 'algemeen',
    titel: 'CO₂-emissiefactoren',
    korteBeschrijving: 'Welke factoren gebruiken we voor gas en stroom, en waarom.',
    paragrafen: [
      { type: 'tekst', inhoud: 'CO₂-besparingen worden uitgedrukt in kg CO₂-equivalent per jaar.' },
      { type: 'tabel', kolommen: ['Energiedrager', 'Factor', 'Eenheid', 'Bron'], rijen: [
        ['Aardgas', '2,05', 'kg CO₂/m³', 'CO₂-emissiefactoren.nl 2024'],
        ['Grijze stroom', '0,337', 'kg CO₂/kWh', 'CO₂-emissiefactoren.nl 2024'],
        ['Vermeden PV-opbrengst', '0,649', 'kg CO₂/kWh', 'Marginale CO₂-factor zonne-energie'],
      ]},
      { type: 'tekst', inhoud: 'PV gebruikt een hogere factor omdat het de fossiele marginale productie verdringt (gascentrales), niet het Nederlandse mixgemiddelde.' },
    ],
  },

  // ============================================================
  // ISOLATIE
  // ============================================================
  {
    id: 'isolatie-rc-waarde',
    categorie: 'isolatie',
    titel: 'Wat is een Rc-waarde?',
    korteBeschrijving: 'Maat voor isolerend vermogen van een bouwdeel — hoe hoger, hoe beter.',
    paragrafen: [
      { type: 'tekst', inhoud: 'De Rc-waarde (warmteweerstand, "R characteristic") drukt uit hoe goed een bouwdeel (dak, gevel, vloer, glas) warmte tegenhoudt. Eenheid: m²·K/W.' },
      { type: 'formule', latex: 'U = \\frac{1}{R_c}', toelichting: 'De U-waarde (W/m²·K) is het omgekeerde van Rc — de hoeveelheid warmte die per m² per °C temperatuurverschil verloren gaat.' },
      { type: 'formule', latex: 'Q_{verlies} = A \\times U \\times \\Delta T \\times t', toelichting: 'A = oppervlak (m²), ΔT = binnen-buitentemperatuurverschil (K), t = stookuren per jaar (h). Resultaat in Wh/jaar.' },
      { type: 'tabel', kolommen: ['Bouwjaar', 'Rc dak', 'Rc gevel', 'Rc vloer'], rijen: [
        ['< 1965', '0,86', '0,36', '0,15'],
        ['1965-1975', '0,86', '0,43', '0,17'],
        ['1976-1988', '1,30', '1,30', '1,30'],
        ['1989-1992', '2,00', '2,00', '2,00'],
        ['1993-2003', '2,50', '2,50', '2,50'],
        ['2004-2014', '3,50', '3,50', '3,50'],
        ['2015+', '6,00', '4,50', '3,50'],
      ]},
      { type: 'tip', inhoud: 'De huidige Rc-waarde uit de tabel is een aanname op basis van bouwjaar — overschrijf hem als je daadwerkelijk weet wat erin zit (bv. uit het energielabel).' },
    ],
  },
  {
    id: 'isolatie-glas',
    categorie: 'isolatie',
    titel: 'Glasisolatie en U-waardes',
    korteBeschrijving: 'Hoe wordt de besparing bij vervangen van glas berekend?',
    paragrafen: [
      { type: 'tekst', inhoud: 'Bij glas rekenen we direct met U-waardes (W/m²·K) per type beglazing.' },
      { type: 'tabel', kolommen: ['Glassoort', 'U-waarde', 'Gasverbruik per m² (24×7)'], rijen: [
        ['Enkel glas', '5,8', '24,0 m³/jr'],
        ['Dubbel glas', '2,8', '11,6 m³/jr'],
        ['HR-glas', '1,8', '7,5 m³/jr'],
        ['HR+', '1,3', '5,4 m³/jr'],
        ['HR++', '1,1', '4,5 m³/jr'],
        ['Triple-glas', '0,7', '2,9 m³/jr'],
      ]},
      { type: 'tekst', inhoud: 'De besparing per m² wordt geschaald naar het werkelijke aantal verwarmingsuren per dag (clubhuizen typisch 4-8 uur i.p.v. 24/7).' },
    ],
  },

  // ============================================================
  // VERWARMING
  // ============================================================
  {
    id: 'warmtepomp-cop',
    categorie: 'verwarming',
    titel: 'COP en SCOP van warmtepompen',
    korteBeschrijving: 'Hoe je rendement van warmtepompen interpreteert.',
    paragrafen: [
      { type: 'tekst', inhoud: 'De COP (Coefficient of Performance) is de verhouding tussen geleverde warmte en gebruikte elektriciteit op één moment.' },
      { type: 'formule', latex: 'COP = \\frac{Q_{warm}}{E_{elektra}}', toelichting: 'Een COP van 4 betekent dat de warmtepomp 4 kWh warmte levert per 1 kWh stroom — 3 kWh komt "gratis" uit de buitenlucht.' },
      { type: 'tekst', inhoud: 'De SCOP (Seasonal COP) is het gewogen gemiddelde over een heel jaar, inclusief koudere dagen wanneer de warmtepomp minder efficiënt is.' },
      { type: 'tabel', kolommen: ['Type', 'SCOP-range', 'Toepassing'], rijen: [
        ['Lucht/water', '3,0 – 4,0', 'Volledige verwarming + tapwater'],
        ['Lucht/lucht', '3,5 – 4,5', 'Ruimteverwarming via airco-units'],
        ['Hybride', '1,2 – 1,8', 'Combinatie met cv-ketel'],
        ['Warmtepompboiler', '3,0 – 3,5', 'Alleen tapwater'],
        ['Q-ton CO₂', '3,5 – 3,8', 'Tapwater tot 90°C'],
      ]},
      { type: 'tip', inhoud: 'Hoe hoger de gevraagde aanvoertemperatuur, hoe lager de SCOP. Vloerverwarming (35°C) presteert dus beter dan radiatoren (60°C).' },
    ],
  },
  {
    id: 'douches-berekening',
    categorie: 'verwarming',
    titel: 'Hoe werkt de douche-warmtevraag-berekening?',
    korteBeschrijving: 'Trainingstijden + douchekoppen → gasverbruik voor warm water.',
    paragrafen: [
      { type: 'tekst', inhoud: 'Per dag-van-week en tijdslot vragen we hoeveel mensen er douchen. Op basis daarvan rekenen we het waterverbruik, en dus het gasverbruik voor verwarming.' },
      { type: 'formule', latex: 'V_{water} = aantal \\times duur \\times debiet', toelichting: 'Aantal personen × douchetijd (5 min default) × debiet (7 L/min default) = liters water.' },
      { type: 'formule', latex: 'Q_{warmte} = V \\times c_w \\times \\Delta T', toelichting: 'V in liters, cw = 4,19 kJ/(kg·K), ΔT = douchetemp − inlaat (typisch 38°C − 10°C = 28K).' },
      { type: 'formule', latex: 'V_{gas} = \\frac{Q_{kWh}}{8,79 \\times \\eta_{ketel}}', toelichting: 'kWh warmte gedeeld door 8,79 (LHV van gas in kWh/m³) en rendement gasketel (~95%) = m³ gas.' },
      { type: 'tip', inhoud: 'Bij de gedetailleerde modus vraagt het systeem ook seizoenscorrecties: 30 trainingsweken vs 25 wedstrijdweken per jaar.' },
    ],
  },

  // ============================================================
  // STROOM
  // ============================================================
  {
    id: 'pv-opbrengst',
    categorie: 'stroom',
    titel: 'PV-opbrengst en degradatie',
    korteBeschrijving: 'Hoe wordt de jaaropbrengst en de 15-jaars projectie berekend?',
    paragrafen: [
      { type: 'tekst', inhoud: 'PV-opbrengst hangt af van geïnstalleerd vermogen, oriëntatie, hellingshoek en schaduw. We gebruiken een vuistregel van 875 kWh per kWp per jaar onder optimale condities (zuid, 35° helling, NL-gemiddelde instraling).' },
      { type: 'formule', latex: 'Opbrengst_{jr1} = \\frac{Wp_{totaal}}{1000} \\times 875 \\times f_{instraling}', toelichting: 'finstraling = 0,85 voor matige orientatie/dakhelling, 1,0 voor optimaal.' },
      { type: 'tekst', inhoud: 'Panelen leveren elk jaar 0,03% minder vermogen door veroudering.' },
      { type: 'formule', latex: 'Opbrengst_{jr\\,n} = Opbrengst_{jr1} \\times (1 - 0{,}003)^{n-1}', toelichting: 'Na 15 jaar is dat ongeveer 4-5% lager dan in jaar 1.' },
      { type: 'tip', inhoud: 'Eigen verbruik (default 15%) bepaalt hoeveel je tegen de inkoopprijs bespaart vs. de lagere terugleververgoeding ontvangt. Bij salderingsafbouw vanaf 2027 wordt eigen verbruik steeds belangrijker.' },
    ],
  },
  {
    id: 'salderingsafbouw',
    categorie: 'stroom',
    titel: 'Salderingsafbouw vanaf 2027',
    korteBeschrijving: 'Hoe verandert de PV-businesscase tot 2031.',
    paragrafen: [
      { type: 'tekst', inhoud: 'Tot 2027 mag je teruggeleverde stroom volledig wegstrepen tegen je verbruik (saldering). Daarna wordt dit stapsgewijs afgebouwd.' },
      { type: 'tabel', kolommen: ['Jaar', '% saldering', 'Rest naar terugleververgoeding'], rijen: [
        ['2025-2026', '100%', '0%'],
        ['2027', '64%', '36%'],
        ['2028', '36%', '64%'],
        ['2029', '36%', '64%'],
        ['2030', '36%', '64%'],
        ['2031+', '0%', '100%'],
      ]},
      { type: 'tip', inhoud: 'Voor sportclubs (winter > zomerverbruik) is dit minder erg dan voor woningen — meer eigen verbruik in de zomer.' },
    ],
  },
  {
    id: 'batterij-basis',
    categorie: 'stroom',
    titel: 'Wat doet een batterij?',
    korteBeschrijving: 'Twee hoofddoelen — zelfconsumptie en EPEX-arbitrage — en hoe ze samenkomen.',
    paragrafen: [
      { type: 'tekst', inhoud: 'Een batterij slaat elektriciteit tijdelijk op, en levert die later weer terug. Voor sportclubs zijn er drie hoofdtoepassingen:' },
      { type: 'lijst', items: [
        'Zelfconsumptie van PV: opslag overdag, ontladen \'s avonds. Vooral relevant na salderingsafbouw (2027-2031).',
        'EPEX-arbitrage: laden in goedkope uren (nacht/middag), ontladen in dure uren (ochtend/avond).',
        'Piekafschaving: vermijden van hoog gecontracteerd vermogen bij netbeheer.',
      ]},
      { type: 'tekst', inhoud: 'De berekening in deze tool gebruikt jaartotalen (cycli × spread). Voor een precieze inschatting met uur-data is een tijdreeks-simulatie nodig.' },
      { type: 'formule', latex: 'Besparing_{jr} = capaciteit \\times cycli \\times spread \\times (1 - kabelverlies)',
        toelichting: 'Capaciteit in kWh, cycli per jaar, spread in €/kWh, kabelverlies typisch 0,02 (2%).' },
      { type: 'tip', inhoud: 'Bij hoge gascentrale-marginale-productie zijn EPEX-spreads het grootst. Dat zijn juist de uren waarop een batterij het meest oplevert.' },
    ],
  },
  {
    id: 'batterij-dimensionering',
    categorie: 'stroom',
    titel: 'Batterij dimensioneren',
    korteBeschrijving: 'Hoe groot moet de batterij zijn? Vuistregels per toepassing.',
    paragrafen: [
      { type: 'tabel', kolommen: ['Doel', 'Capaciteit', 'C-rate (vermogen)', 'Cycli/jr'], rijen: [
        ['Zelfconsumptie PV', '1× dagverbruik', '0,5 C', '300'],
        ['EPEX-arbitrage', '2-3× dagverbruik', '0,5 C', '500-700'],
        ['Piekafschaving', '1-2u op contractwaarde', '1,0 C', '50-100'],
      ]},
      { type: 'tekst', inhoud: 'C-rate = vermogen ÷ capaciteit. Bij 0,5 C kan een 100 kWh batterij in 2 uur volledig laden of ontladen.' },
      { type: 'tip', inhoud: 'Voor sportclubs is het zelden zinvol om meer dan 3× dagverbruik te installeren — extra capaciteit wordt niet meer benut, en investering verdient zich niet terug.' },
    ],
  },
  {
    id: 'batterij-levensduur',
    categorie: 'stroom',
    titel: 'Levensduur en degradatie van batterijen',
    korteBeschrijving: 'Cycli, kalenderveroudering en wanneer een batterij vervangen moet.',
    paragrafen: [
      { type: 'tekst', inhoud: 'Lithium-ijzer-fosfaat (LFP) batterijen zijn de standaard voor stationaire toepassingen vanwege levensduur, veiligheid en kosten.' },
      { type: 'tabel', kolommen: ['Technologie', 'Cycli', 'Kalenderleven', 'Prijs (per kWh)'], rijen: [
        ['LFP', '6.000 - 10.000', '15 jr', '€400 - €600'],
        ['NMC', '3.000 - 5.000', '10 jr', '€350 - €500'],
        ['Loodzuur', '1.500 - 2.500', '8 jr', '€200 - €350'],
      ]},
      { type: 'formule', latex: 'Levensduur_{jr} = \\min(cycli_{totaal} / cycli_{jaar},\\ kalenderleven)',
        toelichting: 'Bij 300 cycli/jaar haalt een LFP-batterij makkelijk 20+ jaar op papier — kalenderveroudering wordt dan beperkend.' },
      { type: 'tip', inhoud: 'Bij 80% capaciteitsbehoud spreken we van "End-of-Life" voor stationaire toepassingen. Daarna is hergebruik in mindere applicaties soms nog mogelijk.' },
    ],
  },

  // ============================================================
  // SUBSIDIES
  // ============================================================
  {
    id: 'subsidies-dumava',
    categorie: 'subsidies',
    titel: 'DUMAVA-subsidie',
    korteBeschrijving: 'Voor maatschappelijk vastgoed, dekt 20-30% van de investering.',
    paragrafen: [
      { type: 'tekst', inhoud: 'DUMAVA (Duurzaam Maatschappelijk Vastgoed) is een subsidie van het Rijk voor verduurzaming van onder andere sportgebouwen.' },
      { type: 'lijst', items: [
        'Standaard: 20% van de subsidiabele kosten',
        '30% voor een "integraal" pakket (3+ maatregelen die elkaar versterken)',
        'Maximaal €1,5 miljoen per aanvraag',
        'Voorwaarde: aanvragen vóór start uitvoering, minstens twee offertes',
      ]},
      { type: 'tip', inhoud: 'Combineer altijd met andere subsidies (ISDE, BOSA) — die mogen stapelen mits de totale steun onder de "de-minimis"-grens blijft (€300k over 3 jaar).' },
    ],
    bronnen: ['https://www.rvo.nl/subsidies-financiering/dumava'],
  },
  {
    id: 'subsidies-isde',
    categorie: 'subsidies',
    titel: 'ISDE — Investeringssubsidie Duurzame Energie',
    korteBeschrijving: 'Vaste bedragen per warmtepomp, zonneboiler, isolatiemaatregel.',
    paragrafen: [
      { type: 'tekst', inhoud: 'ISDE geeft vaste bedragen per kW vermogen of per m² isolatie. Per maatregel.' },
      { type: 'tabel', kolommen: ['Maatregel', 'Bedrag', 'Eenheid'], rijen: [
        ['Lucht/water-warmtepomp', '~€300', 'per kW'],
        ['Warmtepompboiler', '€750 – €1.500', 'per unit'],
        ['Q-ton HMA30A / HMA45A', '€2.500 / €3.700', 'per unit'],
        ['Isolatie spouw/vloer/dak', '€8 – €38', 'per m²'],
      ]},
      { type: 'tip', inhoud: 'Voor sportclubs als organisatie geldt de zakelijke ISDE-tabel (niet de particuliere bedragen). Aanvraag binnen 1 jaar na facturatie.' },
    ],
  },
  {
    id: 'subsidies-bosa',
    categorie: 'subsidies',
    titel: 'BOSA-subsidie sport',
    korteBeschrijving: '20-40% subsidie voor sportverenigingen specifiek.',
    paragrafen: [
      { type: 'tekst', inhoud: 'BOSA (Bouw en Onderhoud van Sportaccommodaties) is exclusief voor amateursportverenigingen.' },
      { type: 'lijst', items: [
        '20% standaard, 40% voor energie-/duurzaamheidsmaatregelen',
        'Minimaal €25.000 investering om in aanmerking te komen',
        'Maximaal €2,5 miljoen per aanvraag per jaar',
        'Vooraf indienen, beoordeling binnen 13 weken',
      ]},
    ],
    bronnen: ['https://www.dus-i.nl/subsidies/stimulering-bouw-en-onderhoud-sportaccommodaties'],
  },
];

export const CATEGORIE_LABELS: Record<KennisArtikel['categorie'], string> = {
  algemeen: 'Algemeen',
  isolatie: 'Isolatie',
  verwarming: 'Verwarming',
  stroom: 'Stroom & PV',
  subsidies: 'Subsidies',
};
