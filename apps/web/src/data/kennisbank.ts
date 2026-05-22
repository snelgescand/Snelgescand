/**
 * Kennisbank-content.
 *
 * Per artikel: id, titel, korte beschrijving, en uitleg met formule-blokken.
 * Bewust in code (geen DB) — kunnen we makkelijk uitbreiden per release.
 */

export interface KennisArtikel {
  id: string;
  categorie: 'algemeen' | 'isolatie' | 'verwarming' | 'stroom' | 'subsidies' | 'beleid' | 'werkwijze';
  titel: string;
  korteBeschrijving: string;
  /** Optioneel — bij subsidie-artikelen: aan welke subsidie-naam dit gekoppeld is.
   *  Als de subsidie is uitgevinkt in Beheer-instellingen, wordt het artikel verborgen. */
  subsidieId?: string;
  paragrafen: Array<
    | { type: 'tekst'; inhoud: string }
    | { type: 'formule'; latex: string; toelichting?: string }
    | { type: 'lijst'; items: string[] }
    | { type: 'tabel'; kolommen: string[]; rijen: string[][] }
    | { type: 'tip'; inhoud: string }
    | { type: 'download'; bestand: string; label: string; toelichting?: string }
  >;
  bronnen?: string[];
}

export const KENNIS: KennisArtikel[] = [
  // ============================================================
  // ALGEMEEN
  // ============================================================
  {
    id: 'scan-checklist',
    categorie: 'algemeen',
    titel: '✅ Checklist: een goede scan voorbereiden en uitvoeren',
    korteBeschrijving: 'Wat van tevoren opvragen, wat op locatie checken, en welke vragen je altijd moet stellen.',
    paragrafen: [
      { type: 'tekst', inhoud: 'Een goede scan staat of valt met de voorbereiding. Hieronder een praktische checklist — gegroepeerd per fase. Loop hem door bij elk nieuw project.' },

      { type: 'tekst', inhoud: '📋 FASE 1 — Vooraf opvragen (1-2 weken voor bezoek)' },
      { type: 'lijst', items: [
        'Energierekeningen van de laatste 2-3 jaar (zowel gas als stroom, jaarafrekening + recente maandbedragen)',
        'Jaarrekening van de vereniging — om budget-ruimte en draagvlak voor investeringen in te schatten',
        'Plattegrond van het gebouw (bvo, indeling kleedkamers/kantine/bestuurskamer/zaal)',
        'Bouwjaar(en) van het gebouw — opvragen bij gemeente of uit bestaande documentatie',
        'Bestaand energielabel (indien aanwezig) + datum',
        'Eerdere offertes/adviezen over verduurzaming (vaak ligt er al iets)',
        'Aantal leden, verdeling jeugd/senioren, aantal teams (voor douche/water-berekening)',
        'Eigendomssituatie: vereniging eigenaar, gemeente eigenaar (huur), erfpacht, stichtingsconstructie?',
      ]},

      { type: 'tekst', inhoud: '🏢 FASE 2 — Op locatie bekijken (de scan zelf)' },
      { type: 'tekst', inhoud: 'Loop systematisch het gebouw door. Maak foto\'s van álles wat opvalt — ook van wat er níet is (geen isolatie zichtbaar, geen ledverlichting).' },
      { type: 'lijst', items: [
        'Dak: type (plat/schuin), zichtbare isolatie, conditie, geschikt voor PV?',
        'Gevel: spouwmuur of massief, beschadigingen, isolatie zichtbaar bij ventilatieroosters',
        'Vloer: kruipruimte aanwezig, isolatie zichtbaar, vochtproblemen',
        'Glas: enkel/dubbel/HR++? Tellen per ruimte. Kozijnen hout/aluminium/kunststof + staat van afdichting',
        'Verlichting: led, TL, halogeen? Tellen per ruimte + schatting branduren',
        'Verwarming: CV-ketel (merk + bouwjaar), gasboiler, warmtepomp, blowerheaters in zaal',
        'Warm water: aparte boiler? Welk type (gas/elektrisch/zonneboiler)? Capaciteit en bouwjaar',
        'Douchekoppen: aantal tellen, debiet (besparend of standaard ~10-15 L/min)',
        'WC\'s: aantal + spoeling (oud 9L, modern dual-flush 4-6L, waterloos)',
        'Ventilatie: mechanisch of natuurlijk? WTW aanwezig?',
        'Meterkast: gasmeter (G4/G6/G25 op label), elektrameter (aansluitwaarde A), digitale meter?',
        'PV-installatie: aanwezig? Aantal panelen + opwek/jaar uit omvormer',
        'Asbest: visueel inspecteren — vooral oude dakplaten, schoorsteenkanalen, vloerzeil',
      ]},

      { type: 'tekst', inhoud: '💬 FASE 3 — Vragen aan het bestuur stellen' },
      { type: 'lijst', items: [
        'Wat zijn de grootste klachten over het gebouw? (koude kleedkamers, vocht, warm in zomer)',
        'Wie betaalt de energierekening — vereniging of gemeente? Bij split: welke kosten?',
        'Wanneer is de huur/erfpacht-overeenkomst opnieuw aan de orde? (relevant voor lange-TVT-maatregelen)',
        'Is er al een meerjarig onderhoudsplan (MJOP)? Kunnen verduurzamings-maatregelen daarmee combineren?',
        'Welke subsidies zijn eerder benut (BOSA in welke jaren, ISDE, DUMAVA)?',
        'Hoe zit de besluitvorming? ALV vereist? Bestuur kan zelfstandig tot welk bedrag?',
        'Welke renovaties staan al gepland? (kleedkamer-renovatie + verduurzaming combineren = winst)',
        'Hoe is de relatie met de gemeente? Aanspreekpunt sportzaken aanwezig?',
        'Heeft de club een Rabo-rekening? (relevant voor SportNLGroen)',
        'Wat is het gebruik buiten het seizoen — verhuur aan externe partijen?',
      ]},

      { type: 'tekst', inhoud: '⚡ FASE 4 — Direct na het bezoek (binnen 24u)' },
      { type: 'lijst', items: [
        'Foto\'s ordenen en uploaden naar het project (stap 1, foto-sectie)',
        'Aantekeningen uitwerken zolang je het beeld nog vers in het hoofd hebt',
        'Energierekeningen → gas m³ + stroom kWh per jaar invullen in stap 1',
        'Aansluitwaardes invullen (elektra + gas) — relevant voor netverzwaring-waarschuwing',
        'Trainingsschema invullen — gebruik de 🎲 valsspeel-knop als startpunt',
        'Huidige situatie invullen (stap 1, sectie 5) — alles wat je gezien hebt',
        'Pas dan stap 2 invullen — maatregelen + percentages',
      ]},

      { type: 'tip', inhoud: 'Snelle voorbereiding: de PPT-template "Sportief Opgewekt" is een goede leidraad — als je alles invult wat de PPT nodig heeft, dek je 90% van de scan af.' },
      { type: 'tip', inhoud: 'Bij twijfel: een foto extra maken kost niets. Een tweede bezoek omdat je een detail mist, kost wél tijd. Maak van álles foto\'s — meterkast, dakranden, kozijnafdichtingen, plafond kantine, kleedkamers.' },
    ],
  },
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
    subsidieId: 'DUMAVA',
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
    subsidieId: 'ISDE',
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
    subsidieId: 'BOSA',
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

  // === Aanvullende subsidies & financiering (eerste maand) ===
  {
    id: 'subsidies-spuk-spok',
    subsidieId: 'SPUK',
    categorie: 'subsidies',
    titel: 'SPUK en SPOK — wat is het verschil?',
    korteBeschrijving: 'Verzamelnaam SPUK vs specifieke btw-compensatie SPOK voor de sport.',
    paragrafen: [
      { type: 'tekst', inhoud: 'De Specifieke Uitkering (SPUK) is een verzamelnaam voor de manier waarop het Rijk extra budget beschikbaar stelt aan gemeenten en provincies voor specifieke taken — zoals het verduurzamen van vastgoed of het verbeteren van zorg.' },
      { type: 'tekst', inhoud: 'De SPOK (Stimulering Sport) is een specifieke regeling binnen die familie. Sinds sportverenigingen geen btw meer kunnen terugvragen, compenseert de SPOK gemeenten voor de btw die zij betalen over kosten voor sport — bouw en onderhoud van sportparken, materiaal, etc. Doel: sport betaalbaar houden.' },
      { type: 'tip', inhoud: 'Verschil in één zin: SPUK is de manier van financieren, SPOK is een specifieke regeling voor de sportsector binnen die manier.' },
    ],
  },
  {
    id: 'subsidies-bosa-uitgebreid',
    subsidieId: 'BOSA',
    categorie: 'subsidies',
    titel: 'BOSA in 2025 — actualiteit en valkuilen',
    korteBeschrijving: 'Loting, snelle uitputting, en de stapeling met Dumava.',
    paragrafen: [
      { type: 'tekst', inhoud: 'De BOSA is exclusief voor amateursportorganisaties (verenigingen en stichtingen). Standaard 20% subsidie, 40% voor energiebesparing/toegankelijkheid. Minimaal €25.000 investering.' },
      { type: 'tekst', inhoud: 'Actualiteit: in 2025 was de BOSA zo snel vergeven dat de website overbelast raakte en uiteindelijk een loting heeft plaatsgevonden. Normaal geldt "wie het eerst komt, wie het eerst maalt", dus voorbereid zijn op de openingsdag is cruciaal.' },
      { type: 'tekst', inhoud: 'De BOSA leek afgebouwd te worden, maar lijkt juist uitgebreid — pas op met aannames over toekomstige percentages.' },
      { type: 'tip', inhoud: 'Sinds 2025 kunnen amateursportverenigingen óók terecht bij de DUMAVA. Vaak gunstig als het BOSA-budget al op is. Check beide bij elke aanvraag.' },
    ],
    bronnen: ['https://www.dus-i.nl/subsidies/stimulering-bouw-en-onderhoud-sportaccommodaties'],
  },
  {
    id: 'subsidies-omv',
    subsidieId: 'OMV',
    categorie: 'subsidies',
    titel: 'OMV — Ontzorgingsprogramma Maatschappelijk Vastgoed',
    korteBeschrijving: 'Geen geld, wél gratis hulp en expertise om plannen te maken.',
    paragrafen: [
      { type: 'tekst', inhoud: 'OMV is geen geldbedrag, maar gratis hulp en expertise voor kleine maatschappelijke vastgoedeigenaren. Bedoeld om plannen te maken voor verduurzaming, zodat ze daarna gebruik kunnen maken van regelingen als DUMAVA of ISDE.' },
      { type: 'tekst', inhoud: 'Praktisch: een energiecoach of adviseur komt langs, brengt het pand in kaart, maakt een verduurzamingsadvies en begeleidt de subsidieaanvraag.' },
      { type: 'tip', inhoud: 'Stapelen mag: combineer OMV (advies) met DUMAVA of ISDE (uitvoering) om de eigen investering zo laag mogelijk te houden.' },
    ],
  },
  {
    id: 'subsidies-revolverend-fonds',
    categorie: 'subsidies',
    titel: 'Revolverend fonds — geld dat blijft circuleren',
    korteBeschrijving: 'Geen eenmalige subsidie maar een lening tegen lage of 0% rente.',
    paragrafen: [
      { type: 'tekst', inhoud: 'Een revolverend fonds is een "recyclingfonds" voor geld. In plaats van eenmalig uitgeven (subsidie), blijft het bedrag in beweging: investering → lening → terugbetaling met rente → herhaling.' },
      { type: 'lijst', items: [
        'Een instantie (vaak de overheid) stopt een bedrag in een fonds',
        'Dit geld wordt uitgeleend aan een project — bv. isolatie van een sportclub',
        'De lener betaalt het bedrag terug, meestal met een kleine rente',
        'Het terugbetaalde geld wordt direct weer uitgeleend',
      ]},
      { type: 'tekst', inhoud: 'Effect: met hetzelfde bedrag kan over 20 jaar veel meer bereikt worden dan met een eenmalige subsidie. Voor sportclubs interessant omdat de rente vaak laag of zelfs 0% is.' },
      { type: 'tip', inhoud: 'Casus ZTC Shot Zeist: maakte gebruik van BOSA (40% = €118k), Rabo SportNLGroen (€25k), provincie (40% = €50k) én een revolverend fonds (0% rente). Stapelen op alle fronten.' },
    ],
  },
  {
    id: 'subsidies-sportnlgroen',
    subsidieId: 'SportNLGroen',
    categorie: 'subsidies',
    titel: 'SportNLGroen (Rabobank)',
    korteBeschrijving: 'Financiering specifiek voor sportverenigingen met Rabo-rekening.',
    paragrafen: [
      { type: 'tekst', inhoud: 'SportNLGroen is een financieringsproduct van de Rabobank, exclusief voor sportverenigingen die klant zijn. Bedoeld om verduurzamingsinvesteringen te financieren tegen gunstige voorwaarden.' },
      { type: 'tip', inhoud: 'Check bij de eerste scan altijd: heeft de club een Rabo-rekening? Zo ja, dan komt SportNLGroen in beeld als aanvullende financiering bovenop BOSA/DUMAVA/ISDE.' },
    ],
  },
  {
    id: 'subsidies-stapelen',
    categorie: 'subsidies',
    titel: 'Subsidies stapelen — wat mag wel en niet?',
    korteBeschrijving: 'Volgorde, de-minimis grens en welke regelingen elkaar versterken.',
    paragrafen: [
      { type: 'tekst', inhoud: 'Veel sportverenigingen kunnen meerdere subsidies combineren. De vraag is: welke regelingen werken samen, en welke sluiten elkaar uit?' },
      { type: 'lijst', items: [
        'OMV (advies) + DUMAVA of ISDE (uitvoering) — vaak combineerbaar',
        'BOSA + DUMAVA — kan, mits onder de-minimis grens (€300k over 3 jaar)',
        'ISDE + BOSA — per maatregel kijken, sommige maatregelen tellen voor één van beide',
        'Revolverend fonds bovenop subsidies — gewone lening, geen staatssteun-implicatie',
      ]},
      { type: 'tip', inhoud: 'Volgorde van aanvragen: OMV eerst (advies + voorbereiding) → BOSA/DUMAVA/ISDE inplannen op opening loket → revolverend fonds + SportNLGroen voor het restant.' },
    ],
  },

  // === Verwarming uitgebreid ===
  {
    id: 'warm-water-boilers',
    categorie: 'verwarming',
    titel: 'Soorten warm-watertoestellen',
    korteBeschrijving: 'Direct gestookte gasboiler vs elektrische boiler vs zonneboiler.',
    paragrafen: [
      { type: 'tekst', inhoud: 'Voor warm water in een sportkantine/kleedkamer zijn er drie hoofdtechnieken. Bij energietransitie-adviezen is dit een kernkeuze.' },
      { type: 'tekst', inhoud: '1. Direct gestookte gasboiler — gasbrander onderin of binnenin een waterreservoir. Vlammen verwarmen direct de wanden of een centrale buis door het water. Heeft eigen rookgasafvoer nodig. Verwarmt sneller dan elektrisch. Wordt steeds minder geplaatst vanwege "van het gas af".' },
      { type: 'tekst', inhoud: '2. Elektrische boiler — werkt als grote waterkoker met een verwarmingselement (spiraal). Geen gasaansluiting nodig. Veilig en makkelijk te plaatsen. Stroomverbruik hoog, tenzij eigen PV. Opwarmtijd lang nadat alles op is.' },
      { type: 'tekst', inhoud: '3. Zonneboiler — collectoren op het dak verwarmen vloeistof die via een warmtewisselaar het water in het vat opwarmt. Zeer energiezuinig. Altijd gekoppeld aan CV-ketel of elektrisch element voor naverwarming (zon schijnt niet altijd). Hoge aanschaf, lage gebruikskosten.' },
      { type: 'tip', inhoud: 'Verschil gasboiler vs CV-ketel: een CV-ketel verzorgt zowel ruimteverwarming als warm water; een gasboiler doet uitsluitend warm water. Bij sportclubs zit vaak een gasboiler dedicated voor de douches.' },
    ],
  },

  // === Stroom uitgebreid: BESS ===
  {
    id: 'stroom-bess',
    categorie: 'stroom',
    titel: 'BESS — Battery Energy Storage Systems',
    korteBeschrijving: 'Wat het is, de vier hoofdonderdelen, en waarom LCOS de echte prijs bepaalt.',
    paragrafen: [
      { type: 'tekst', inhoud: 'Een BESS is veel meer dan een grote stapel batterijen — het is een ecosysteem dat elektrische energie opslaat (meestal chemisch) om die later weer aan het net of een verbruiker te geven.' },
      { type: 'tekst', inhoud: 'Stel het voor als een modern magazijn met vier hoofdonderdelen:' },
      { type: 'lijst', items: [
        'Batterijsysteem (de stellingen) — de modules waar de energie wordt opgeslagen. Meestal LFP (lithium-ijzerfosfaat) vanwege veiligheid en levensduur.',
        'Battery Management System (de magazijnmeester) — software + sensoren die temperatuur, spanning en celgezondheid bewaken. Cruciaal om brand te voorkomen.',
        'Power Conversion System (de laadperrons) — de omvormer. Batterijen werken op DC, het net op AC. Dit systeem regelt de vertaling.',
        'Energy Management System (de planner) — het brein dat beslist wanneer te laden (zon, goedkope stroom) of ontladen (vraag hoog).',
      ]},
      { type: 'tekst', inhoud: 'LCOS — Levelized Cost of Storage — geeft de werkelijke prijs per kWh over de hele levensduur. Aanschafprijs alléén is misleidend.' },
      { type: 'lijst', items: [
        'Degradatie — een batterij die na 5 jaar op 70% capaciteit zit, "spreidt" zijn beginkosten over minder kWh',
        'Round-trip efficiency — niet alle ingestopte stroom komt eruit (verlies aan warmte, ~85-95% typisch)',
        'Depth of Discharge — sommige batterijen mag je maar tot 80% leegtrekken, LFP-systemen vaak tot 100%',
        'Aantal cycli — 6.000 cycli is vaak goedkoper onderaan de streep dan 2.000 cycli voor halve prijs',
      ]},
      { type: 'tip', inhoud: 'De LCOS van batterijen begint nu te concurreren met fossiele piekcentrales. Voor grote sportlocaties met veel PV-overproductie wordt de businesscase realistisch.' },
    ],
  },
  {
    id: 'stroom-bess-verdienmodellen',
    categorie: 'stroom',
    titel: 'BESS verdienmodellen — Value Stacking',
    korteBeschrijving: 'Vier manieren waarop een batterij geld verdient — en hoe je ze combineert.',
    paragrafen: [
      { type: 'tekst', inhoud: 'Een BESS wordt het "Zwitsers zakmes" van het energienet genoemd. Slimme exploitanten combineren meerdere verdienmodellen tegelijkertijd — dat heet Value Stacking.' },
      { type: 'tekst', inhoud: '1. Peak Shaving (besparen op aansluiting) — netbeheerders belasten op basis van piekverbruik. Als machines tegelijk starten schiet de vraag omhoog. De batterij vangt die piek op. Resultaat: lagere gecontracteerde aansluiting → lagere vastrechtkosten. Bij netcongestie soms de enige manier om te kunnen groeien.' },
      { type: 'tekst', inhoud: '2. Arbitrage (handel) — laag kopen, hoog verkopen op de Day-Ahead markt. Veel zon tussen 13:00-15:00 → prijs laag (soms negatief). Laad de batterij op, verkoop tijdens avondpiek 18:00-20:00. Intraday markt: razendsnel reageren op plotselinge prijsbewegingen (wolk voor de zon).' },
      { type: 'tekst', inhoud: '3. Netstabilisatie (FCR/aFRR) — TenneT moet het net op 50 Hz houden. FCR reageert binnen seconden op kleine variaties; je wordt betaald voor het beschikbaar stellen. aFRR gaat om grotere vermogens over minuten.' },
      { type: 'tekst', inhoud: '4. Zelfverbruik-optimalisatie — eigen PV niet voor lage terugleverprijs naar net, maar bewaren voor eigen verbruik s\'avonds. LCOS-check: zijn opslagkosten per kWh lager dan het prijsverschil kopen/verkopen?' },
      { type: 'tip', inhoud: 'De stacking-strategie: bv. 20% capaciteit voor peak shaving (fabriek/kantine), 80% voor onbalansmarkt. Software kiest realtime de actie met hoogste marge.' },
    ],
  },

  // === Beleid & energiemarkt ===
  {
    id: 'beleid-ets2',
    categorie: 'beleid',
    titel: 'ETS2 — wat verandert er voor sportclubs?',
    korteBeschrijving: 'Hogere gas- en brandstofprijzen vanaf 2027, hard CO₂-plafond, Sociaal Klimaatfonds.',
    paragrafen: [
      { type: 'tekst', inhoud: 'ETS2 is de uitbreiding van het Europese emissiehandelssysteem. Waar het oude ETS zich richtte op zware industrie en elektriciteitscentrales, richt ETS2 zich op brandstofleveranciers voor wegvervoer en gebouwen.' },
      { type: 'tekst', inhoud: '1. Hogere prijzen aan de pomp en voor verwarming. Leveranciers van benzine, diesel én aardgas moeten CO₂-rechten kopen voor wat ze verkopen. Vrijwel 100% zeker dat ze die kosten doorberekenen aan de eindgebruiker.' },
      { type: 'tekst', inhoud: '2. Hard plafond op uitstoot. ETS2 belast niet alleen — het stuurt. Er komt een jaarlijks plafond op de totale CO₂ in deze sectoren, dat elk jaar verlaagd wordt. Dwingt versnelling van verduurzaming.' },
      { type: 'tekst', inhoud: '3. Versnelling van energietransitie. Fossiele brandstoffen duurder → EV, warmtepompen en isolatie aantrekkelijker. De terugverdientijd van verduurzaming wordt korter naarmate gas duurder wordt.' },
      { type: 'tekst', inhoud: '4. Sociaal Klimaatfonds (SCF). EU is zich bewust dat ETS2 kwetsbare huishoudens raakt (energiearmoede). Deel van de opbrengst geveilde CO₂-rechten gaat naar dit fonds. Lidstaten gebruiken het om lage-inkomensgroepen te helpen bij isolatie / EV / warmtepomp.' },
      { type: 'tip', inhoud: 'Voor sportclubs: gasprijs gaat de komende jaren waarschijnlijk verder omhoog. Verduurzamingsmaatregelen die nu een TVT van 12 jaar hebben, kunnen straks 8 jaar zijn. Reken in scenario\'s, niet alleen huidige prijzen.' },
    ],
  },
  {
    id: 'beleid-ihp',
    categorie: 'beleid',
    titel: 'IHP — Integraal Huisvestingsplan',
    korteBeschrijving: 'Hoe gemeenten + scholen samen prioriteren welke schoolgebouwen wanneer aan de beurt komen.',
    paragrafen: [
      { type: 'tekst', inhoud: 'In een IHP leggen gemeente en schoolbesturen vast welke scholen de komende jaren worden gerenoveerd, uitgebreid of nieuwgebouwd. Omdat gemeenten beperkt budget hebben en niet alle scholen tegelijk kunnen, is dit plan essentieel voor prioritering. Meestal 10-15 jaar vooruit.' },
      { type: 'lijst', items: [
        'Bouwkundige staat — hoe slecht is het huidige gebouw eraan toe?',
        'Capaciteit — sprake van groei (lokalentekort) of krimp in de wijk?',
        'Duurzaamheid — voldoet het gebouw aan Frisse Scholen + energie-eisen?',
        'Onderwijsvisie — past het gebouw nog bij hoe de school les wil geven?',
      ]},
      { type: 'tip', inhoud: 'Waarom relevant nu: veel gemeenten (bv. Ede) zijn extra druk met het IHP vanwege versnelde duurzaamheidseisen en SPUK-regelingen. Scholen die hoog op de IHP-lijst staan, maken vaak als eerste aanspraak op deze subsidies.' },
    ],
  },
  {
    id: 'beleid-case-ztc-shot',
    categorie: 'beleid',
    titel: 'Case: ZTC Shot Zeist — gestapelde financiering',
    korteBeschrijving: 'Hoe een tennisclub via BOSA + bank + provincie + revolverend fonds verduurzaamde.',
    paragrafen: [
      { type: 'tekst', inhoud: 'ZTC Shot in Zeist is een praktijkvoorbeeld van succesvol gestapeld financieren. De club voerde meerdere maatregelen door tegelijk.' },
      { type: 'tekst', inhoud: 'Maatregelen: warmtepompen + WTW-units (installateur), accu (batterij-opslag), totaalpakket.' },
      { type: 'tabel', kolommen: ['Bron', 'Type', 'Bijdrage'], rijen: [
        ['BOSA', 'Subsidie 40%', '€118.000'],
        ['Rabobank (SportNLGroen)', 'Lening', '€25.000'],
        ['Provincie', 'Subsidie 40%', '€50.000'],
        ['Revolverend fonds', 'Lening 0% rente', 'Restant'],
      ]},
      { type: 'tekst', inhoud: 'Over 15 jaar bespaart de club ruim een ton — financieel rendement bovenop het ecologische rendement.' },
      { type: 'tip', inhoud: 'Lessons learned: combineer subsidie (BOSA) + nul-rente lening (revolverend) + bancaire financiering (SportNLGroen). De eigen investering blijft beperkt en cashflow van besparingen dekt aflossingen.' },
    ],
  },

  // ============================================================
  // WERKWIJZE & INTAKE
  // ============================================================
  {
    id: 'werkwijze-rapport',
    categorie: 'werkwijze',
    titel: 'Werkwijze: hoe maken wij een verduurzamingsrapport?',
    korteBeschrijving: 'Het complete proces van eerste contact tot eindrapport in Sport NL Groen.',
    paragrafen: [
      { type: 'tekst', inhoud: 'Een verduurzamingsrapport voor een sportclub doorloopt vaste stappen. Hier het proces in volgorde, voor nieuwe adviseurs én ter herinnering voor wie hier al langer werkt.' },

      { type: 'tekst', inhoud: '1️⃣ Lead binnenkomst' },
      { type: 'lijst', items: [
        'Aanvraag komt binnen via SportNLGroen-portal, een gemeente, OMV-programma of direct contact',
        'Toegewezen aan een adviseur op basis van regio en agenda',
        'Eerste contact binnen 1-2 werkdagen — kennismaking, planning bezoek',
      ]},

      { type: 'tekst', inhoud: '2️⃣ Intake-formulier "Gegevens club"' },
      { type: 'lijst', items: [
        'Mail naar club met intake-formulier (zie aparte kennisbank-pagina "Intake-checklist gegevens club")',
        'Club levert aan: jaarrekening(en), trainingsschema, energierekeningen 2-3 jaar, plattegrond, bouwtekeningen indien aanwezig',
        'Bij grootverbruik (> 3×80 A): ook kwartierdata van de netbeheerder opvragen',
      ]},

      { type: 'tekst', inhoud: '3️⃣ Energiescan op snelgescand.nl' },
      { type: 'lijst', items: [
        'Maak een nieuw project aan in snelgescand.nl (voorheen werd hiervoor een Excel-bestand gebruikt — de tool vervangt dat nu volledig)',
        'Stap 1: vul alle bekende gegevens in — clubinfo, locatie (BAG-koppeling), gebouw, energieverbruik, trainingsschema, foto\'s, logo',
        'Gebruik bij stap 1 de 🎲 valsspeel-knop als het trainingsschema ontbreekt — geeft een NL-gemiddelde als startpunt',
        'Stap 2: maatregelen kiezen en percentages bevestigen — de tool stelt automatisch passende maatregelen voor',
        'Bekijk de live businesscase: investering, subsidie, besparing, TVT per maatregel + totaal',
      ]},

      { type: 'tekst', inhoud: '4️⃣ Locatiebezoek (de scan zelf)' },
      { type: 'lijst', items: [
        'Volg de "✅ Checklist een goede scan" uit de kennisbank',
        'Maak foto\'s van álles — meterkast, dak, gevel, kozijnen, kleedkamers',
        'Stel de 10 bestuursvragen uit de checklist',
        'Vul direct na het bezoek alle aanvullingen in snelgescand.nl in (binnen 24u, terwijl het beeld vers is)',
      ]},

      { type: 'tekst', inhoud: '5️⃣ Rapportage genereren' },
      { type: 'lijst', items: [
        'Klik op "↓ PPT (origineel)" in het project — snelgescand.nl produceert de Sportief Opgewekt-presentatie automatisch ingevuld',
        'Slide 1 + 2 bevatten de scan-data; slide 77 de financiële maatregelen-tabel',
        'Controleer slide voor slide — corrigeer waar nodig handmatig (bv. cosmetische zaken die de tool niet automatisch kan)',
        'Sla op als <clubnaam>_Verduurzamingsplan_<maand-jaar>.pptx',
      ]},

      { type: 'tekst', inhoud: '6️⃣ Upload naar Sport NL Groen portal' },
      { type: 'lijst', items: [
        'Log in op Sport NL Groen met je adviseur-account',
        'Zoek het clubdossier op',
        'Upload de PPT bij "Stap 3 — Resultaten"',
        'CHECK: kloppen de investeringsbedragen in Sport NL Groen met de totalen in ons verduurzamingsplan?',
      ]},

      { type: 'tekst', inhoud: '7️⃣ Communicatie naar de club' },
      { type: 'lijst', items: [
        'Verstuur de "scan klaar"-mail (zie kennisbank-pagina "Mail-template: scan klaar")',
        'Plan een terugkoppel-afspraak in — fysiek, online of telefonisch — om plan + vervolgstappen door te nemen',
        'Volg op of de club het rapport heeft kunnen downloaden',
      ]},

      { type: 'tekst', inhoud: '8️⃣ Vervolgtraject (optioneel)' },
      { type: 'lijst', items: [
        'Begeleiding bij subsidie-aanvraag (BOSA, DUMAVA, ISDE, IAS)',
        'Verwijzing naar SWS voor borgstelling',
        'Verwijzing naar SVn / provinciale fondsen voor financiering',
        'Periodieke voortgangschecks',
      ]},

      { type: 'tip', inhoud: 'Tijdens reistijd: noteer reistijden in Simplicate — die mogen op het project worden geboekt.' },
    ],
  },
  {
    id: 'werkwijze-intake-checklist',
    categorie: 'werkwijze',
    titel: 'Intake-checklist: gegevens van de club',
    korteBeschrijving: 'Wat we vóór het locatiebezoek aan de club vragen — direct toepasbaar formulier.',
    paragrafen: [
      { type: 'tekst', inhoud: 'Stuur deze intake aan de club zodra een aanvraag binnenkomt. Hoe completer ze invullen, hoe sneller en accurater de scan kan.' },
      { type: 'tekst', inhoud: '📋 Standaard intake-vragen' },
      { type: 'lijst', items: [
        'Naam club + adres accommodatie + postcode/plaats + KvK-nummer',
        'Sport + aantal spelende leden (uitgesplitst jeugd/junioren en senioren)',
        'Aangesloten bij sportbond? (ja/nee + welke)',
        'Eigendomssituatie accommodatie — club / gemeente (huur) / beheerstichting / grond gemeente + opstallen club',
        'Bouwjaar accommodatie + jaar van eventuele renovatie',
        'Looptijd energiecontract of variabele tarieven',
        'Aantal stroomaansluitingen + aansluitwaardes per aansluiting (geen nood als onbekend)',
        'Zonnepanelen aanwezig? Zo ja: jaarlijkse opbrengst óf aantal panelen × Wp',
        'Trainingsschema (bij voorkeur Excel-format)',
        'Jaarrekening(en) gas + stroom van het meest recente jaar',
        'Waterverbruik (meest recente speelseizoen of kalenderjaar)',
        'Bij aansluiting > 3×80 A: maximaal gecontracteerd vermogen met energieleverancier',
        'Bij grootverbruik (> 3×80 A): kwartierdata van een volledig jaar (op te vragen bij netbeheerder)',
      ]},

      { type: 'tekst', inhoud: '➕ Aanvullend (hoe meer, hoe beter)' },
      { type: 'lijst', items: [
        'Bouwtekeningen / plattegrond(en) van de accommodatie',
        '(Dak)constructierapport',
        'Eerdere energiescans of -adviezen',
        'Informatie van interne duurzaamheidscommissies',
      ]},

      { type: 'tip', inhoud: 'Aanleveradres: info@sportiefopgewekt.nl. Vragen via hetzelfde adres of rechtstreeks aan de toegewezen adviseur.' },
    ],
  },
  {
    id: 'werkwijze-mail-scan-klaar',
    categorie: 'werkwijze',
    titel: 'Mail-template: scan klaar',
    korteBeschrijving: 'Sjabloon om de club te informeren dat het verduurzamingsplan klaar staat in Sport NL Groen.',
    paragrafen: [
      { type: 'tip', inhoud: 'Check altijd de investeringsbedragen in Sport NL Groen met de totalen in ons verduurzamingsplan vóórdat je deze mail verstuurt.' },

      { type: 'tekst', inhoud: '✉️ Onderwerp: Verduurzamingsplan [naam club] is klaar' },
      { type: 'tekst', inhoud: 'Hieronder de standaardtekst — pas alleen de gemarkeerde [variabelen] aan:' },
      { type: 'tekst', inhoud: 'Het verduurzamingsplan voor [naam van de club] is klaar! Je kunt het verduurzamingsplan downloaden via de Sport NL Groen portal.' },
      { type: 'tekst', inhoud: 'Inloggen kan via deze link: https://www.sportnlgroen.nl/sportnlgroen/. Jullie gebruikersnaam is [emailadres van de club zoals in de portal]. Als jullie nog geen wachtwoord hebben ingesteld of zijn vergeten, kun je deze via de website herstellen.' },
      { type: 'tekst', inhoud: 'Vervolgens kunnen jullie onder stap 3. "resultaten" het verduurzamingsplan downloaden en bevestigen dat jullie het plan in goede orde hebben ontvangen. Dit gaat allemaal via de online portal, zodat ook de subsidieverstrekker de resultaten en voortgang van de verduurzamingsplannen kan monitoren.' },
      { type: 'tekst', inhoud: 'Wanneer jullie het verduurzamingsplan binnen de club hebben bekeken en besproken, plannen we graag een afspraak in om fysiek, online of telefonisch het e.e.a. door te nemen en om de juiste vervolgstappen te bepalen zodat het ook daadwerkelijk tot verduurzamen komt.' },
      { type: 'tekst', inhoud: 'We horen graag of het gelukt is het verduurzamingsplan te downloaden en voor al jullie vragen zijn we bereikbaar.' },

      { type: 'tip', inhoud: 'Stuur deze mail vanaf je eigen adviseur-emailadres, met het bestuur in CC en de contactpersoon van de club in TO.' },
    ],
  },
  {
    id: 'werkwijze-verduurzamingsreis-ppt',
    categorie: 'werkwijze',
    titel: 'Download: Verduurzamingsreis-presentatie (Op Naar Nul)',
    korteBeschrijving: 'De standaard achtergrondpresentatie die de "verduurzamingsreis" uitlegt aan een club.',
    paragrafen: [
      { type: 'tekst', inhoud: 'De Verduurzamingsreis-presentatie van Op Naar Nul / Sportief Opgewekt is de standaard achtergrondsdeck waarin we de filosofie, het proces en de partners van het programma uitleggen. Gebruik dit als basis voor kennismakingsgesprekken met nieuwe clubs en bij presentaties op gemeentelijk niveau.' },
      { type: 'download', bestand: 'verduurzamingsreis.pptx', label: '⬇️ Download Verduurzamingsreis.pptx', toelichting: '18 slides — over de supporter van het bestuur, amateursport in NL, het verduurzamingsproces en de partners.' },
      { type: 'tip', inhoud: 'Pas de presentatie niet aan in de bron — maak altijd eerst een lokale kopie. Bij wijzigingen in inhoud: stem af met het programmamanagement.' },
    ],
  },

  // ============================================================
  // SUBSIDIES — uitbreiding v29
  // ============================================================
  {
    id: 'subsidies-bosa-detail',
    subsidieId: 'BOSA',
    categorie: 'subsidies',
    titel: 'BOSA — alle ins & outs (verdiepend)',
    korteBeschrijving: 'Wie, hoeveel, voor wat, en welke valkuilen.',
    paragrafen: [
      { type: 'tekst', inhoud: 'BOSA (Stimulering Bouw en Onderhoud van Sportaccommodaties) is dé subsidie voor amateursportverenigingen en -stichtingen. Geen bedrijven, geen gemeenten — alleen verenigingen/stichtingen die actief sport beoefenen.' },

      { type: 'tekst', inhoud: 'Percentages' },
      { type: 'lijst', items: [
        '20% standaard — voor bouw, onderhoud, sportmaterialen',
        '40% verhoogd — voor energiebesparing/duurzaamheid en toegankelijkheid (separate ramen)',
        'Minimaal €25.000 investering om in aanmerking te komen',
        'Maximaal €2,5 miljoen subsidie per aanvraag per jaar',
      ]},

      { type: 'tekst', inhoud: 'Aanvraagproces' },
      { type: 'lijst', items: [
        'Aanvraag vóór start uitvoering — anders géén subsidie',
        'Twee offertes verplicht bij grotere investeringen',
        'Beoordeling binnen 13 weken',
        'Het loket opent jaarlijks op een vast moment — vaak januari',
      ]},

      { type: 'tekst', inhoud: 'Actuele valkuilen 2025' },
      { type: 'lijst', items: [
        'Budget snel uitgeput — in 2025 zo snel dat een loting volgde',
        'Wie het eerst komt, wie het eerst maalt — zorg dat de aanvraag klaarstaat op opening',
        'BOSA leek afgebouwd te worden maar lijkt juist uitgebreid — let op nieuwere besluiten',
        'Sinds 2025 ook DUMAVA als alternatief voor sportverenigingen',
      ]},

      { type: 'tip', inhoud: 'Combineer met andere subsidies (ISDE op specifieke installaties, IAS voor asbest) — let op de de-minimis grens van €300k over 3 jaar.' },
      { type: 'tip', inhoud: 'Bij twijfel of een investering "duurzaamheid" is (40%) of "onderhoud" (20%): vraag DUS-I om een vooradvies. Spaart discussie achteraf.' },
    ],
    bronnen: ['https://www.dus-i.nl/subsidies/stimulering-bouw-en-onderhoud-sportaccommodaties'],
  },
  {
    id: 'subsidies-isde-detail',
    subsidieId: 'ISDE',
    categorie: 'subsidies',
    titel: 'ISDE — wat valt eronder en hoeveel?',
    korteBeschrijving: 'Vaste bedragen per warmtepomp, isolatiesoort en zonneboiler. Voor sportclubs: zakelijke tabel.',
    paragrafen: [
      { type: 'tekst', inhoud: 'De ISDE (Investeringssubsidie Duurzame Energie en Energiebesparing) is een van de bekendste subsidies. Voor sportverenigingen geldt de zakelijke ISDE-tabel — die wijkt af van wat particulieren krijgen.' },

      { type: 'tekst', inhoud: 'Voor wie' },
      { type: 'lijst', items: [
        'Zakelijke gebruikers — bedrijven, instellingen, verenigingen, stichtingen',
        'Particulieren via een eigen aparte regeling (andere bedragen)',
        'Aanvraag binnen 1 jaar ná facturatie (dus achteraf!)',
      ]},

      { type: 'tekst', inhoud: 'Maatregelen + bedragen (zakelijk, indicatief 2025)' },
      { type: 'tabel', kolommen: ['Maatregel', 'Bedrag', 'Eenheid'], rijen: [
        ['Lucht/water warmtepomp', '~€300', 'per kW vermogen'],
        ['Grond/water warmtepomp', 'hoger', 'per kW vermogen'],
        ['Warmtepompboiler', '€750 - €1.500', 'per unit'],
        ['Q-ton HMA30A / HMA45A', '€2.500 / €3.700', 'per unit (CO₂-warmtepompboiler)'],
        ['Zonneboiler', 'variabel', 'op basis van apertuur-oppervlak'],
        ['Isolatie spouw', '€8', 'per m²'],
        ['Isolatie dak', '€20', 'per m²'],
        ['Isolatie vloer/bodem', '€8', 'per m²'],
        ['Isolatie glas HR++/triple', 'tot €38', 'per m²'],
        ['Kleinschalige windturbine (zakelijk)', 'variabel', '-'],
      ]},

      { type: 'tip', inhoud: 'Voor sportclubs is ISDE vaak interessanter voor specifieke installaties dan voor het hele pakket — BOSA dekt het hele pakket beter. Vraag per maatregel: welke regeling biedt de hoogste vergoeding?' },
      { type: 'tip', inhoud: 'ISDE en BOSA mogen op dezelfde investering niet stapelen (overlapprobleem). Wel mogen ze samen voorkomen in hetzelfde project op verschillende maatregelen.' },
    ],
    bronnen: ['https://www.rvo.nl/subsidies-financiering/isde'],
  },
  {
    id: 'subsidies-ias',
    subsidieId: 'IAS',
    categorie: 'subsidies',
    titel: 'IAS — Subsidie Asbestsanering',
    korteBeschrijving: 'Specifiek voor het verwijderen van asbest, vaak bij oude sportgebouwen.',
    paragrafen: [
      { type: 'tekst', inhoud: 'De IAS (Subsidieregeling verwijderen Asbestdaken) is een rijksregeling voor het verwijderen van asbestdaken. Voor sportclubs met gebouwen uit de jaren ‘60-‘80 is dit vaak relevant: schuren, kleedkamergebouwen en bestuursgebouwen hadden destijds vaak asbestplaten op het dak.' },

      { type: 'lijst', items: [
        'Vergoedt deel van de saneringskosten (€/m² asbestdak, varieert per regeling-jaar)',
        'Alleen via gecertificeerde saneerders (DTA / SC-530 / SC-540)',
        'Combineer met BOSA als de sanering onderdeel is van een grotere renovatie',
        'Asbest in andere bouwdelen (vloerzeil, schoorsteenkanalen) valt soms onder andere regelingen — informeer per geval',
      ]},

      { type: 'tip', inhoud: 'IAS is niet altijd actief — provincies en gemeenten hebben soms eigen aanvullende regelingen. Check ook lokaal.' },
      { type: 'tip', inhoud: 'Asbest visueel herkennen: golfvormige grijze daken (oude golfplaten), bruine pijpisolatie, gespikkelde vloerzeilen onder ouder gerooide vloerbedekking. Bij twijfel: laat een gecertificeerde inventarisatie uitvoeren — verplicht vóór sloop of renovatie.' },
    ],
  },
  {
    id: 'subsidies-sws',
    subsidieId: 'SWS',
    categorie: 'subsidies',
    titel: 'SWS — Stichting Waarborgfonds Sport',
    korteBeschrijving: 'Borgstelling waardoor sportclubs makkelijker een banklening krijgen.',
    paragrafen: [
      { type: 'tekst', inhoud: 'Stichting Waarborgfonds Sport (SWS) is een onafhankelijke stichting die garant staat bij banken voor leningen aan amateursportverenigingen. Geen geld, wel een garantstelling — daardoor verstrekken banken eerder een lening en tegen betere voorwaarden.' },

      { type: 'tekst', inhoud: 'Hoe het werkt' },
      { type: 'lijst', items: [
        'Club wil investeren (verduurzaming, kleedkamerrenovatie, accommodatie-uitbreiding)',
        'Bank wil lening verstrekken maar wil zekerheid',
        'SWS staat voor (een deel van) de lening borg',
        'Bank verstrekt lening met lagere rente en/of langere looptijd',
        'Club betaalt een eenmalige borgstellingsprovisie aan SWS',
      ]},

      { type: 'tekst', inhoud: 'Wat het oplevert' },
      { type: 'lijst', items: [
        'Toegang tot financiering die anders te risicovol gevonden wordt',
        'Lagere rente — soms 0,5 tot 1,5%-punt minder',
        'Langere looptijd mogelijk — wat de cashflow beheersbaar maakt',
        'Werkt goed in combinatie met SportNLGroen (Rabobank)',
      ]},

      { type: 'tip', inhoud: 'SWS is vooral interessant voor leningen vanaf ongeveer €50.000. Voor kleinere bedragen wegen de transactiekosten + provisie niet altijd op tegen het voordeel.' },
      { type: 'tip', inhoud: 'Borgstelling is iets anders dan subsidie — de club moet de lening volledig terugbetalen, alleen de bank loopt minder risico.' },
    ],
    bronnen: ['https://sws.nl'],
  },
  {
    id: 'subsidies-svn-gelderland',
    categorie: 'subsidies',
    titel: 'SVn + Provincie Gelderland — Fonds Verduurzaming Maatschappelijk Vastgoed',
    korteBeschrijving: 'Provinciaal revolverend fonds voor sport- en cultuurorganisaties.',
    paragrafen: [
      { type: 'tekst', inhoud: 'De Provincie Gelderland heeft samen met Stimuleringsfonds Volkshuisvesting (SVn) een revolverend fonds opgezet specifiek voor verduurzaming van maatschappelijk vastgoed — sportverenigingen vallen daar nadrukkelijk onder.' },

      { type: 'tekst', inhoud: 'Hoe werkt het' },
      { type: 'lijst', items: [
        'Lening tegen laag rentepercentage (0-2%, soms lager dan markt)',
        'Lange looptijd — typisch 10 tot 20 jaar',
        'Speciaal voor verduurzamingsmaatregelen — isolatie, warmtepomp, PV, LED',
        'Stapelbaar met BOSA/DUMAVA/ISDE — dekt het niet-gesubsidieerde deel',
        'SVn beheert de uitvoering; Provincie levert het kapitaal',
      ]},

      { type: 'tekst', inhoud: 'Wat we noemen "revolverend"' },
      { type: 'tekst', inhoud: 'De terugbetalingen + rente vloeien terug in het fonds en worden opnieuw uitgeleend aan een volgende club. Daardoor kan met hetzelfde startkapitaal over decennia veel meer worden gefinancierd dan bij een eenmalige subsidie. Zie ook het artikel "Revolverend fonds" in deze kennisbank.' },

      { type: 'tip', inhoud: 'Andere provincies hebben vergelijkbare fondsen — check altijd lokaal of de provincie van de club een eigen variant heeft. Provincie Overijssel, Utrecht, Noord-Brabant: vrijwel allemaal hebben iets.' },
      { type: 'tip', inhoud: 'Stappenplan voor Gelderse club: BOSA + ISDE aanvragen voor maatregelen → restantbedrag financieren via SVn-fonds → optioneel borgstelling SWS → uitvoeren → besparingen dekken aflossing.' },
    ],
    bronnen: ['https://www.svn.nl', 'https://www.gelderland.nl'],
  },
  {
    id: 'subsidies-obligatieplan',
    categorie: 'subsidies',
    titel: 'Obligatieplan.nl — alternatief voor banklening',
    korteBeschrijving: 'Een club geeft eigen obligaties uit aan leden — laagdrempelig en kosten-besparend.',
    paragrafen: [
      { type: 'tekst', inhoud: 'Obligatieplan.nl is een product van SponsorVisie waarmee verenigingen sinds 2010 hun eigen obligaties (onderhandse leningen) uitgeven aan leden, sponsors en supporters. Geen banklening dus, maar geld uit eigen kring tegen een afgesproken rente.' },

      { type: 'tekst', inhoud: 'Hoe het werkt' },
      { type: 'lijst', items: [
        'Vereniging stelt obligatievoorwaarden op (rente, looptijd, aflossing)',
        'Leden/sponsors kopen obligaties via online inschrijfformulier',
        'Vereniging gebruikt het opgehaalde bedrag voor bv. clubhuisrenovatie of verduurzaming',
        'Rente + aflossing worden via batchbetalingen aan obligatiehouders uitgekeerd',
        'Beheer (administratie, jaaropgaves) wordt geautomatiseerd door Obligatieplan.nl',
      ]},

      { type: 'tekst', inhoud: 'Concreet voorbeeld uit Obligatieplan-rekentool' },
      { type: 'tekst', inhoud: 'Bij €100.000 lening, 10 jaar looptijd, 4% rente en een verplichte jaarlijkse schenking van €37: vergeleken met een banklening tegen 5% rente bespaart de club €43.000, terwijl het de deelnemers (na schenkingsaftrek) niets kost.' },

      { type: 'tekst', inhoud: 'Fiscale constructie' },
      { type: 'lijst', items: [
        'Combineerbaar met een fiscaal aftrekbare periodieke gift',
        'Belastingdienst geeft bij 4% rente + sluitende begroting zonder schenkingen vooraf goedkeuring',
        'Hoger renteniveau verdedigbaar — geen zekerheden tegenover de lening; advies van onafhankelijk specialist aanrader',
      ]},

      { type: 'tekst', inhoud: 'Kosten' },
      { type: 'lijst', items: [
        'Eenmalig: 1% over het opgehaalde bedrag',
        'Beheer: 0,25% over de hoofdsom per jaar',
        'Geen risico door variabele kosten — alleen kosten als het lukt',
      ]},

      { type: 'tip', inhoud: 'Geschat ROI: per €50.000 obligatieplan-lening bespaart een club ongeveer €17.500 ten opzichte van banklening (rentestijging + afsluitkosten). Voor verduurzamings­investeringen tussen €50k-€500k vaak een serieuze overweging.' },
      { type: 'tip', inhoud: 'Voordeel naast geld: betrokkenheid van leden vergroot. Wie investeert in zijn eigen club voelt zich meer mede-eigenaar.' },
    ],
    bronnen: ['https://obligatieplan.nl'],
  },
];

export const CATEGORIE_LABELS: Record<KennisArtikel['categorie'], string> = {
  algemeen: 'Algemeen',
  werkwijze: 'Werkwijze & intake',
  isolatie: 'Isolatie',
  verwarming: 'Verwarming & warm water',
  stroom: 'Stroom & PV',
  subsidies: 'Subsidies & financiering',
  beleid: 'Beleid & energiemarkt',
};
