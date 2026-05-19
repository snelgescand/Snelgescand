/**
 * Checklist voor de "huidige situatie / nulmeting".
 *
 * Per categorie een lijst van punten met drie statussen:
 *   - 'goed'    : aanwezig en in orde
 *   - 'matig'   : aanwezig maar verouderd / suboptimaal
 *   - 'slecht'  : niet aanwezig / niet in orde
 *   - 'onbekend': nog niet bekeken
 *
 * Geeft de adviseur structuur voor de scan: wat is er, wat kan beter.
 */

export interface ChecklistItem {
  id: string;
  label: string;
  uitleg: string;
}

export interface ChecklistCategorie {
  id: string;
  titel: string;
  items: ChecklistItem[];
}

export type ItemStatus = 'goed' | 'matig' | 'slecht' | 'onbekend';

export interface ChecklistAntwoorden {
  [itemId: string]: {
    status: ItemStatus;
    notitie?: string;
  };
}

export const CHECKLIST: ChecklistCategorie[] = [
  {
    id: 'gebouwschil',
    titel: 'Gebouwschil',
    items: [
      { id: 'dakisolatie', label: 'Dakisolatie',
        uitleg: 'Aanwezig én op modern niveau (Rc ≥ 3,5)? Bij twijfel: vraag naar bouwjaar van het dak of energielabel.' },
      { id: 'gevelisolatie', label: 'Gevel-/spouwmuurisolatie',
        uitleg: 'Heeft de gevel een spouw, en is die gevuld? Te zien aan vulgaatjes of voelbaar verschil tussen wand-buitenkant en -binnenkant.' },
      { id: 'vloerisolatie', label: 'Vloerisolatie',
        uitleg: 'Kruipruimte-isolatie aanwezig? Controleer via kruipluik in vergaderruimte/keuken.' },
      { id: 'glas', label: 'Beglazing',
        uitleg: 'Enkel / dubbel / HR / HR+ / HR++? Te zien aan dikte van het glas en eventueel stempel in spouw.' },
      { id: 'kierdichting', label: 'Kieren en deuren',
        uitleg: 'Tochten er deuren of ramen? Voorzien van tochtwering?' },
    ],
  },
  {
    id: 'verwarming',
    titel: 'Verwarming en warm water',
    items: [
      { id: 'cv-ketel-leeftijd', label: 'CV-ketel < 10 jaar oud',
        uitleg: 'Bouwjaar staat op het typeplaatje of in onderhoudslogboek. Oude ketels (> 15 jaar) hebben fors lager rendement.' },
      { id: 'waterzijdig-ingeregeld', label: 'Waterzijdig ingeregeld',
        uitleg: 'Is de cv-installatie ooit goed afgeregeld zodat alle radiatoren correct hun water krijgen? Vaak niet gedaan.' },
      { id: 'thermostatisch-radiatoren', label: 'Thermostatische radiatorkranen',
        uitleg: 'Per ruimte instelbaar? Voorkomt overbodig stoken in lege kleedkamers.' },
      { id: 'kloktijden', label: 'Klokthermostaat / programma',
        uitleg: 'Wordt de verwarming buiten gebruikstijd lager gezet?' },
      { id: 'tapwaterboiler', label: 'Tapwaterboiler aanwezig',
        uitleg: 'Voorraadboiler, doorstroomboiler of via cv-ketel? Capaciteit moet passen bij aantal douchekoppen.' },
      { id: 'douche-debiet', label: 'Waterbesparende douchekoppen',
        uitleg: 'Debiet ≤ 7 L/min in plaats van 12-15 L/min levert al 40% besparing op douche-warmtevraag.' },
    ],
  },
  {
    id: 'ventilatie',
    titel: 'Ventilatie',
    items: [
      { id: 'wtw', label: 'WTW-ventilatie',
        uitleg: 'Mechanische ventilatie met warmteterugwinning? Te zien aan kanalen + buitenunit/dakventilator.' },
      { id: 'co2-sensor', label: 'CO₂-sensoring in kantine/zaal',
        uitleg: 'Vraaggestuurd ventileren bespaart energie én verbetert luchtkwaliteit.' },
      { id: 'filter-onderhoud', label: 'Ventilatiefilters jaarlijks vervangen',
        uitleg: 'Vervuilde filters verhogen energieverbruik fors en verslechteren luchtkwaliteit.' },
    ],
  },
  {
    id: 'verlichting',
    titel: 'Verlichting',
    items: [
      { id: 'led-binnen', label: 'LED-verlichting binnen',
        uitleg: 'Kleedkamers, kantine, kantoor, gangen. TL-buis = vervangen kandidaat.' },
      { id: 'led-buiten', label: 'LED-verlichting buiten (terrein/parking)',
        uitleg: 'Vaak nog halogeen of metaaldamp — relatief eenvoudig vervangbaar.' },
      { id: 'led-velden', label: 'LED-veldverlichting (sportvelden)',
        uitleg: 'Grote besparing mogelijk; BOSA-subsidie 40% beschikbaar.' },
      { id: 'bewegingssensoren', label: 'Bewegingssensoren in gangen / kleedkamers',
        uitleg: 'Voorkomt brandende lampen in lege ruimtes.' },
      { id: 'daglichtsturing', label: 'Daglichtsturing',
        uitleg: 'Lampen dimmen automatisch bij voldoende daglicht.' },
    ],
  },
  {
    id: 'opwek',
    titel: 'Eigen energieopwekking',
    items: [
      { id: 'pv-aanwezig', label: 'Zonnepanelen aanwezig',
        uitleg: 'Hoeveel kWp ongeveer? Bekijk op luchtfoto en vraag jaaropbrengst op.' },
      { id: 'pv-dakcapaciteit', label: 'Plat dak met restcapaciteit',
        uitleg: 'Is er nog ruimte voor (extra) panelen? Inschatten via luchtfoto + draagvermogen-check.' },
      { id: 'warmtepomp', label: 'Warmtepomp aanwezig',
        uitleg: 'Voor verwarming en/of tapwater? Welk type (lucht/water, hybride)?' },
      { id: 'batterij', label: 'Batterij-opslag aanwezig',
        uitleg: 'Voor zelfconsumptie van PV of voor EPEX-handel? Zeldzaam maar groeiend.' },
    ],
  },
  {
    id: 'overig',
    titel: 'Overig',
    items: [
      { id: 'meterstanden', label: 'Slimme meter aanwezig',
        uitleg: 'Maakt monitoring en EPEX-handel mogelijk. Op te vragen bij netbeheerder.' },
      { id: 'energielabel', label: 'Energielabel beschikbaar',
        uitleg: 'Indien al gemaakt: hoeft adviseur niet zelf in te schatten.' },
      { id: 'mva', label: 'Meerjarenonderhoudsplan (MJOP)',
        uitleg: 'Verduurzaming aan onderhoud koppelen is veel goedkoper. Vraag plan op.' },
      { id: 'jaarrekening-energie', label: 'Jaarrekening energiekosten beschikbaar',
        uitleg: 'Belangrijk voor exacte verbruikscijfers — vraag minimaal het laatste jaar op.' },
    ],
  },
];

export const STATUS_LABELS: Record<ItemStatus, string> = {
  goed: 'Doen ze goed',
  matig: 'Kan beter',
  slecht: 'Niet aanwezig / slecht',
  onbekend: 'Nog niet bekeken',
};

export const STATUS_KLEUREN: Record<ItemStatus, string> = {
  goed: 'bg-primary-100 text-primary-800 border-primary-300',
  matig: 'bg-yellow-50 text-yellow-800 border-yellow-300',
  slecht: 'bg-red-50 text-red-700 border-red-300',
  onbekend: 'bg-gray-50 text-gray-500 border-gray-200',
};
