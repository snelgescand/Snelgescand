/**
 * Centrale domeintypes voor de rekenkern.
 *
 * Deze types beschrijven de invoer (Project) en de uitvoer (Resultaat) van het
 * model. Alle modules implementeren dezelfde MaatregelModule<I, R> interface
 * zodat de penningmeester-rollup ze uniform kan optellen.
 */

/* ============================================================================
 * Identificatoren
 * ========================================================================== */

export type ProjectId = string;
export type MaatregelId =
  | 'douches-analyse'
  | 'dakisolatie'
  | 'spouwmuurisolatie'
  | 'vloerisolatie'
  | 'glasisolatie'
  | 'waterzijdig-inregelen'
  | 'wtw'
  | 'warmtepompboiler'
  | 'eboiler'
  | 'pvt-tapwater'
  | 'qton-warmtepomp'
  | 'lmnt-warmtepomp'
  | 'lucht-water-warmtepomp'
  | 'lucht-lucht-warmtepomp'
  | 'hybride-warmtepomp'
  | 'binnenverlichting'
  | 'ledveldverlichting'
  | 'zonnepanelen'
  | 'batterij-eenvoudig'
  | 'batterij-uitgebreid'
  | 'batterij-tijdreeks';

/* ============================================================================
 * Constanten (zie docs/FORMULES.md voor herkomst)
 * ========================================================================== */

/** Soortelijke warmte water in kJ/(kg·K) */
export const C_WATER = 4.19;
/** Dichtheid water in kg/L */
export const RHO_WATER = 1.0;
/**
 * Onderwaarde Gronings aardgas in MJ/m³.
 * NB: het Excel gebruikt op verschillende plekken zowel 31.65 (MJ/m³) als 10.1 (kWh/m³).
 * 31.65 MJ = 8.79 kWh, dus dit zou consistent moeten zijn — maar Excel gebruikt
 * 10.1 kWh/m³ in warmtepomp-formules, wat lijkt op een primaire-energie factor.
 * Voor warmteverlies-besparing gebruiken we de zuivere calorische waarde.
 */
export const GAS_LHV_MJ_M3 = 31.65;
export const GAS_LHV_KWH_M3 = GAS_LHV_MJ_M3 / 3.6; // 8.79

/**
 * Equivalent Excel gebruikt in warmtepomp-tabbladen (vermoedelijk primaire energie).
 * Bewust apart om de Excel-uitkomsten te kunnen reproduceren.
 */
export const GAS_EXCEL_WP_KWH_M3 = 10.1;

/** CO₂-emissiefactor aardgas in kg/m³ */
export const CO2_GAS = 2.05;
/** CO₂-emissiefactor stroom NL grid-mix in kg/kWh (rekenmodel) */
export const CO2_STROOM = 0.337;
/** CO₂ NL grid-mix in kg/kWh (accumodel — kleine afwijking) */
export const CO2_STROOM_ACCUMODEL = 0.328;

/* ============================================================================
 * Project-niveau structuren
 * ========================================================================== */

export interface ClubInfo {
  naam: string;
  type?: string;                     // bv "voetbal", "tennis", "hockey"
  aantalLeden?: number;
  aantalVelden?: number;
  aantalKleedkamers?: number;
  aantalDouchekoppen?: number;
  eigendom?: 'koop' | 'huur' | 'gemeente';
}

export interface GebouwKenmerken {
  bouwjaar: number;
  bouwjaarTweedeBouwdeel?: number;
  bouwjaarDerdeBouwdeel?: number;
  bvoTotaalM2?: number;             // mag ook leeg zijn (BAG vult later)
  bvoClubgebouwM2?: number;
  bvoKleedkamersM2?: number;
  bvoOverigeRuimteM2?: number;
  plafondhoogteM?: number;
  /** Daktype — bepaalt hoeveel PV-oppervlak beschikbaar is.
   *  - 'plat':    ~55% van BVO benutbaar (rekening met schaduw, oost-west, looppaden)
   *  - 'schuin':  ~32% (alleen zuid/west helft × afstand-tussen-rijen)
   *  - 'gemengd': ~43% (gemiddelde)
   */
  daktype?: 'plat' | 'schuin' | 'gemengd' | 'onbekend';
  /** "<1965 met spouw isolatie afwezig" etc, optionele override van bouwjaar-default */
  constructieDetail?: string;
}

export interface AansluitingType {
  fase: 1 | 3;
  ampere: number;  // gangbaar 16-200 voor kleinverbruik, hoger voor grootverbruik
  /** afgeleid uit fase × ampere, gecached */
  vermogenKw: number;
}

export interface EnergieSituatie {
  stroomverbruikTotaalKwh: number;
  stroomverbruikDalKwh?: number;
  stroomverbruikPiekKwh?: number;
  gasverbruikM3: number;
  waterverbruikM3?: number;
  bestaandePvOpwekKwh?: number;
  aansluitwaardeElektra: AansluitingType;
  aansluitwaardeGas?: string;       // "G6", "G10", "G25" etc
  gecontracteerdVermogenKw?: number;
  stroomprijsKaalPerKwh: number;    // €/kWh excl btw
  gasprijsPerM3: number;            // €/m³
  terugleverVergoedingPerKwh?: number;
  groenOpgewekt: 'via-leverancier' | 'eigen-pv' | 'nee';
}

/* ============================================================================
 * Subsidie-structuren
 * ========================================================================== */

export type SubsidieBron = 'dumava' | 'isde' | 'bosa' | 'derde-regeling-gemeente' | 'ias' | 'overig';

export interface Subsidie {
  bron: SubsidieBron;
  naam: string;
  bedrag: number;                   // €
  /** Welk percentage van de bruto-investering deze subsidie dekt (informatief) */
  percentage?: number;
  voorwaarden?: string;
}

/* ============================================================================
 * Maatregel-input & resultaat (universeel)
 * ========================================================================== */

export interface Warning {
  level: 'info' | 'warning' | 'error';
  code: string;
  message: string;
}

export interface MaatregelResultaat {
  maatregelId: MaatregelId;
  /** Bruto investering inclusief btw, € */
  brutoInvestering: number;
  subsidies: Subsidie[];
  /** Som van alle subsidies, € */
  totaleSubsidie: number;
  /** brutoInvestering - totaleSubsidie, € */
  nettoInvestering: number;
  /** Jaarlijkse besparing in €, gebaseerd op huidige tarieven */
  besparingPerJaar: number;
  /** Gas-besparing in m³/jaar (positief = besparing) */
  besparingGasM3?: number;
  /** Stroom-besparing in kWh/jaar (positief = besparing) */
  besparingStroomKwh?: number;
  /** Eventueel extra stroomverbruik door deze maatregel (bv warmtepomp), kWh/jaar */
  extraStroomverbruikKwh?: number;
  /** CO₂-besparing in kg/jaar */
  co2BesparingKg: number;
  /** Eenvoudige terugverdientijd in jaren (nettoInv / besparingPerJaar) */
  terugverdientijdJaren: number;
  /** Toegevoegd piekvermogen aan elektrische zijde, kW */
  piekVermogenKw?: number;
  warnings: Warning[];
}

/** Project-brede context die alle modules nodig hebben */
export interface ProjectContext {
  club: ClubInfo;
  gebouw: GebouwKenmerken;
  energie: EnergieSituatie;
  /** Default-subsidies die gebruiker overschrijven kan */
  defaultSubsidiePercentages: {
    dumava: number;     // 0.20
    derdeRegelingGemeente: number; // 0.333
    ias: number;        // 0.60
    bosa: number;       // 0.40
  };
}

/** Generieke maatregel-module */
export interface MaatregelModule<TInput, TResultaat extends MaatregelResultaat> {
  id: MaatregelId;
  naam: string;
  bereken(input: TInput, context: ProjectContext): TResultaat;
  defaultInput(context: ProjectContext): TInput;
}

/* ============================================================================
 * Project-resultaat (rollup)
 * ========================================================================== */

export interface ProjectResultaat {
  totaleInvestering: number;
  totaleSubsidie: number;
  nettoInvestering: number;
  totaleBesparingPerJaar: number;
  gemiddeldeTerugverdientijdJaren: number;
  totaleBesparingGasM3: number;
  totaleBesparingStroomKwh: number;
  totaalExtraStroomverbruikKwh: number;
  totaleCo2BesparingKg: number;
  totaalToegevoegdPiekvermogenKw: number;
  nieuwePiekBelastingKw: number;
  aansluitwaardeVoldoende: boolean;
  /** Per maatregel het deelresultaat */
  perMaatregel: Record<MaatregelId, MaatregelResultaat | undefined>;
  warnings: Warning[];
}

export interface GeselecteerdeMaatregelen {
  // sleutel = MaatregelId, waarde = input voor dat moduleframe of `false` om uit te zetten
  // TS heeft geen perfecte typing voor heterogene maps zonder klassieke discriminated unions,
  // dus in registry.ts staat de vertaling. Hier alleen het minimale contract:
  [k: string]: unknown;
}

export interface Project {
  id: ProjectId;
  meta: { naam: string; createdAt: string; updatedAt: string };
  club: ClubInfo;
  gebouw: GebouwKenmerken;
  energie: EnergieSituatie;
  maatregelen: GeselecteerdeMaatregelen;
}
