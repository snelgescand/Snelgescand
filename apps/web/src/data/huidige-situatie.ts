/**
 * Gedetailleerde inventarisatie van de huidige situatie.
 *
 * Per item: een set radio-opties die de werkelijke staat beschrijven,
 * NIET alleen "goed/matig/slecht". Hierdoor kan de aanbevelingsengine
 * preciezer scoren én weet de PowerPoint exact wat er in het gebouw zit.
 *
 * Elke optie heeft een score (0-100) voor "hoe goed is deze situatie?".
 * 100 = ideaal, 0 = ontbreekt of slecht.
 */

export interface OptieDef {
  waarde: string;
  label: string;
  score: number;        // 0-100, voor recommendation engine
}

export interface ItemDef {
  id: string;
  label: string;
  uitleg: string;
  opties: OptieDef[];
}

export interface CategorieDef {
  id: string;
  titel: string;
  items: ItemDef[];
}

export interface HuidigSituatieAntwoord {
  keuze?: string;        // de waarde uit `opties`
  notitie?: string;
}

export type HuidigeSituatieData = Record<string, HuidigSituatieAntwoord>;

export const HUIDIGE_SITUATIE: CategorieDef[] = [
  // ============================================================
  // GEBOUWSCHIL
  // ============================================================
  {
    id: 'gebouwschil',
    titel: 'Gebouwschil',
    items: [
      {
        id: 'dakisolatie',
        label: 'Dakisolatie',
        uitleg: 'Een goed geïsoleerd dak heeft Rc ≥ 3,5 m²K/W. Te zien aan dikte van isolatiemateriaal of bouwjaar van het dak.',
        opties: [
          { waarde: 'geen', label: 'Geen isolatie (Rc < 0,5) — bouwjaar vóór 1965', score: 0 },
          { waarde: 'beperkt', label: 'Beperkt (Rc 0,5 – 1,3) — bouwjaar 1965-1975', score: 20 },
          { waarde: 'matig', label: 'Matig (Rc 1,3 – 2,5) — bouwjaar 1975-1992', score: 45 },
          { waarde: 'modern', label: 'Modern (Rc 2,5 – 3,5) — bouwjaar 1992-2012', score: 75 },
          { waarde: 'goed', label: 'Goed geïsoleerd (Rc ≥ 3,5) — bouwjaar 2012 of later / na-isolatie', score: 95 },
          { waarde: 'onbekend', label: 'Onbekend', score: 50 },
        ],
      },
      {
        id: 'gevelisolatie',
        label: 'Gevel-/spouwmuurisolatie',
        uitleg: 'Bij spouw: is deze gevuld? Bij massieve muur (na-1992): meestal al geïsoleerd. Voel buitenmuur op koude dag.',
        opties: [
          { waarde: 'geen-spouw', label: 'Massieve muur zonder isolatie — bouwjaar vóór 1920', score: 5 },
          { waarde: 'spouw-leeg', label: 'Spouwmuur, niet gevuld — bouwjaar 1920-1975', score: 15 },
          { waarde: 'spouw-gevuld', label: 'Spouwmuur, gevuld (parels/schuim) — na-geïsoleerd', score: 65 },
          { waarde: 'na-isolatie', label: 'Voor- of na-isolatielaag aangebracht', score: 80 },
          { waarde: 'modern-bouw', label: 'Modern bouwjaar (>1992), goed geïsoleerd', score: 90 },
          { waarde: 'onbekend', label: 'Onbekend', score: 50 },
        ],
      },
      {
        id: 'vloerisolatie',
        label: 'Vloerisolatie',
        uitleg: 'Toegankelijk via kruipruimte. Check op isolatieplaten of -dekens onder de begane grond.',
        opties: [
          { waarde: 'geen', label: 'Geen vloerisolatie — bouwjaar vóór 1975', score: 0 },
          { waarde: 'beperkt', label: 'Beperkt aanwezig (Rc < 2) — bouwjaar 1975-1992', score: 30 },
          { waarde: 'goed', label: 'Goed geïsoleerd (Rc ≥ 2,5) — bouwjaar 1992 of later', score: 85 },
          { waarde: 'geen-kruipruimte', label: 'Geen kruipruimte (bv. plaat-op-grond)', score: 60 },
          { waarde: 'onbekend', label: 'Onbekend', score: 50 },
        ],
      },
      {
        id: 'glas',
        label: 'Beglazing',
        uitleg: 'Dikte van het glas geeft indicatie. Enkel glas: ~4 mm. Dubbel: 12-24 mm met ruimte. HR-glas: stempel zichtbaar in spouw.',
        opties: [
          { waarde: 'enkel', label: 'Enkel glas (U 5,8) — bouwjaar vóór 1975 zonder vervanging', score: 0 },
          { waarde: 'enkel-mix', label: 'Mix van enkel + dubbel — gefaseerde renovatie', score: 20 },
          { waarde: 'dubbel', label: 'Dubbel glas (U 2,8) — bouwjaar 1975-1995', score: 40 },
          { waarde: 'hr', label: 'HR-glas (U ±2,0) — bouwjaar 1995-2005', score: 60 },
          { waarde: 'hr-pp', label: 'HR++ (U 1,2) — bouwjaar 2005 of later', score: 85 },
          { waarde: 'triple', label: 'Triple-glas (U 0,7) — passief of nieuwbouw', score: 100 },
          { waarde: 'onbekend', label: 'Onbekend', score: 50 },
        ],
      },
      {
        id: 'kierdichting',
        label: 'Kieren, deuren, naden',
        uitleg: 'Tochten ramen of deuren? Voorzien van tochtwering? Vraag personeel naar tochtklachten.',
        opties: [
          { waarde: 'veel-tocht', label: 'Veel tocht, geen kierdichting', score: 10 },
          { waarde: 'matig-tocht', label: 'Wat tocht, deels gedicht', score: 50 },
          { waarde: 'goed', label: 'Goed gedicht, geen klachten', score: 90 },
          { waarde: 'onbekend', label: 'Onbekend', score: 50 },
        ],
      },
    ],
  },

  // ============================================================
  // VERWARMING
  // ============================================================
  {
    id: 'verwarming',
    titel: 'Verwarming en warm water',
    items: [
      {
        id: 'verwarming-type',
        label: 'Verwarmingstype hoofdsysteem',
        uitleg: 'Wat verwarmt het gebouw? Te zien aan de installatie in de technische ruimte.',
        opties: [
          { waarde: 'vr-ketel', label: 'VR-ketel (oudere conventionele)', score: 10 },
          { waarde: 'hr-ketel-oud', label: 'HR-ketel > 15 jaar oud', score: 30 },
          { waarde: 'hr-ketel-nieuw', label: 'HR-ketel < 15 jaar oud', score: 60 },
          { waarde: 'hybride', label: 'Hybride: ketel + warmtepomp', score: 80 },
          { waarde: 'all-electric-wp', label: 'All-electric warmtepomp', score: 95 },
          { waarde: 'stadswarmte', label: 'Stadswarmte / blokverwarming', score: 70 },
          { waarde: 'lokaal-gas', label: 'Lokaal gas (kachels) — geen cv', score: 5 },
          { waarde: 'onbekend', label: 'Onbekend', score: 50 },
        ],
      },
      {
        id: 'tapwater-type',
        label: 'Tapwater-bereiding',
        uitleg: 'Hoe wordt warm water gemaakt voor douches? Bekijk in technische ruimte.',
        opties: [
          { waarde: 'cv-ketel', label: 'Combi-cv-ketel', score: 40 },
          { waarde: 'gasboiler', label: 'Aparte gasboiler', score: 25 },
          { waarde: 'elektroboiler', label: 'Elektrische boiler', score: 35 },
          { waarde: 'warmtepompboiler', label: 'Warmtepompboiler', score: 90 },
          { waarde: 'qton', label: 'Q-ton CO₂-warmtepomp', score: 100 },
          { waarde: 'zonneboiler', label: 'Zonneboiler (deels)', score: 75 },
          { waarde: 'onbekend', label: 'Onbekend', score: 50 },
        ],
      },
      {
        id: 'waterzijdig-ingeregeld',
        label: 'Waterzijdig inregelen van cv',
        uitleg: 'Optimale waterverdeling over radiatoren — vraag installateur of het ooit gedaan is.',
        opties: [
          { waarde: 'nooit', label: 'Nooit gedaan', score: 10 },
          { waarde: 'lang-geleden', label: 'Lang geleden gedaan (>5 jaar)', score: 40 },
          { waarde: 'recent', label: 'Recent gedaan (<5 jaar)', score: 90 },
          { waarde: 'onbekend', label: 'Onbekend', score: 30 },
        ],
      },
      {
        id: 'thermostaat',
        label: 'Klokthermostaat / programma',
        uitleg: 'Wordt de verwarming buiten openingsuren lager gezet?',
        opties: [
          { waarde: 'geen', label: 'Geen programma, constant aan', score: 5 },
          { waarde: 'handmatig', label: 'Handmatig naar beneden gezet', score: 40 },
          { waarde: 'klok', label: 'Klokthermostaat met dag/nacht', score: 75 },
          { waarde: 'slim', label: 'Slimme/zone-thermostaat', score: 95 },
          { waarde: 'onbekend', label: 'Onbekend', score: 50 },
        ],
      },
      {
        id: 'douche-debiet',
        label: 'Waterbesparende douchekoppen',
        uitleg: 'Debiet ≤ 7 L/min vs 12-15 L/min levert ~40% besparing op douche-warmtevraag.',
        opties: [
          { waarde: 'geen', label: 'Standaard koppen (12-15 L/min)', score: 10 },
          { waarde: 'gemengd', label: 'Sommige waterbesparend', score: 50 },
          { waarde: 'allemaal', label: 'Allemaal waterbesparend (≤7 L/min)', score: 90 },
          { waarde: 'onbekend', label: 'Onbekend', score: 50 },
        ],
      },
    ],
  },

  // ============================================================
  // VENTILATIE
  // ============================================================
  {
    id: 'ventilatie',
    titel: 'Ventilatie',
    items: [
      {
        id: 'ventilatie-systeem',
        label: 'Ventilatiesysteem',
        uitleg: 'Hoe wordt geventileerd? Belangrijk voor energieverlies en luchtkwaliteit.',
        opties: [
          { waarde: 'natuurlijk', label: 'Natuurlijke ventilatie (roosters/ramen)', score: 20 },
          { waarde: 'mech-afzuiging', label: 'Mechanische afzuiging (toilet/kleedkamer)', score: 40 },
          { waarde: 'wtw', label: 'WTW-ventilatie (balans + warmteterugwinning)', score: 90 },
          { waarde: 'co2-sturing', label: 'WTW + CO₂-sturing', score: 100 },
          { waarde: 'onbekend', label: 'Onbekend', score: 50 },
        ],
      },
    ],
  },

  // ============================================================
  // VERLICHTING
  // ============================================================
  {
    id: 'verlichting',
    titel: 'Verlichting',
    items: [
      {
        id: 'led-binnen',
        label: 'LED-verlichting binnen',
        uitleg: 'Kleedkamers, kantine, kantoor, gangen. TL-buis = vervangkandidaat.',
        opties: [
          { waarde: 'geen', label: 'Geen LED (alles TL/halogeen)', score: 0 },
          { waarde: 'deels', label: 'Gedeeltelijk LED (mix)', score: 40 },
          { waarde: 'meeste', label: 'Grotendeels LED, paar TL', score: 70 },
          { waarde: 'volledig', label: 'Volledig LED', score: 100 },
          { waarde: 'onbekend', label: 'Onbekend', score: 50 },
        ],
      },
      {
        id: 'led-velden',
        label: 'Veldverlichting (sportvelden)',
        uitleg: 'Bij buitensport: oude masten met halogeen/metaaldamp of moderne LED?',
        opties: [
          { waarde: 'nvt', label: 'Niet van toepassing (geen veldverlichting)', score: 100 },
          { waarde: 'halogeen', label: 'Halogeen/metaaldamp', score: 0 },
          { waarde: 'led-deels', label: 'Deels LED', score: 50 },
          { waarde: 'led-volledig', label: 'Volledig LED', score: 100 },
          { waarde: 'onbekend', label: 'Onbekend', score: 50 },
        ],
      },
      {
        id: 'sturing',
        label: 'Aanwezigheidsdetectie / daglichtsensor',
        uitleg: 'Bewegingssensoren in gangen/kleedkamers en daglichtdimming voorkomen onnodig branden.',
        opties: [
          { waarde: 'geen', label: 'Geen — altijd handmatig', score: 20 },
          { waarde: 'beweging', label: 'Bewegingssensoren in sommige ruimtes', score: 60 },
          { waarde: 'beweging-daglicht', label: 'Bewegingssensoren + daglichtdimming', score: 95 },
          { waarde: 'onbekend', label: 'Onbekend', score: 50 },
        ],
      },
    ],
  },

  // ============================================================
  // EIGEN OPWEK
  // ============================================================
  {
    id: 'opwek',
    titel: 'Eigen energieopwekking',
    items: [
      {
        id: 'pv-aanwezig',
        label: 'Zonnepanelen aanwezig?',
        uitleg: 'Hoeveel kWp ongeveer? Bekijk luchtfoto en vraag jaaropbrengst op.',
        opties: [
          { waarde: 'geen', label: 'Geen PV', score: 0 },
          { waarde: 'klein', label: 'Klein systeem (< 10 kWp)', score: 30 },
          { waarde: 'middel', label: 'Gemiddeld (10-30 kWp)', score: 60 },
          { waarde: 'groot', label: 'Groot systeem (> 30 kWp)', score: 90 },
          { waarde: 'onbekend', label: 'Onbekend', score: 50 },
        ],
      },
      {
        id: 'pv-dakcapaciteit',
        label: 'Plat dak met restcapaciteit voor PV',
        uitleg: 'Is er nog vrij dakoppervlak voor (extra) panelen? Schat in via luchtfoto.',
        opties: [
          { waarde: 'geen', label: 'Geen ruimte (dak vol of niet geschikt)', score: 0 },
          { waarde: 'beperkt', label: 'Beperkte ruimte (< 50 m²)', score: 40 },
          { waarde: 'veel', label: 'Veel ruimte (≥ 50 m²)', score: 90 },
          { waarde: 'onbekend', label: 'Onbekend', score: 50 },
        ],
      },
      {
        id: 'batterij',
        label: 'Batterij-opslag',
        uitleg: 'Voor zelfconsumptie of EPEX-handel. Zeldzaam maar groeiend.',
        opties: [
          { waarde: 'geen', label: 'Geen batterij', score: 30 },
          { waarde: 'klein', label: 'Kleine batterij (< 50 kWh)', score: 70 },
          { waarde: 'groot', label: 'Grote batterij (≥ 50 kWh)', score: 95 },
          { waarde: 'onbekend', label: 'Onbekend', score: 40 },
        ],
      },
    ],
  },

  // ============================================================
  // OVERIG
  // ============================================================
  {
    id: 'overig',
    titel: 'Overig',
    items: [
      {
        id: 'energielabel',
        label: 'Energielabel beschikbaar',
        uitleg: 'Indien al gemaakt: hoeft adviseur niet zelf in te schatten. Op te vragen bij EP-adviseur.',
        opties: [
          { waarde: 'a-of-hoger', label: 'Label A of hoger', score: 90 },
          { waarde: 'b-c', label: 'Label B of C', score: 60 },
          { waarde: 'd-f', label: 'Label D-F', score: 25 },
          { waarde: 'g', label: 'Label G', score: 0 },
          { waarde: 'geen-label', label: 'Geen label beschikbaar', score: 30 },
          { waarde: 'onbekend', label: 'Onbekend', score: 50 },
        ],
      },
      {
        id: 'meterstanden',
        label: 'Slimme meter',
        uitleg: 'Maakt monitoring en EPEX-handel mogelijk. Op te vragen bij netbeheerder.',
        opties: [
          { waarde: 'analoog', label: 'Analoge meter', score: 20 },
          { waarde: 'slim', label: 'Slimme meter aanwezig', score: 90 },
          { waarde: 'onbekend', label: 'Onbekend', score: 50 },
        ],
      },
    ],
  },
];
