/**
 * Boilerinhoud + vermogen.
 *
 * Bron: Rekenmodel_Sportief_Opgewekt!"Boilerinhoud + vermogen"!A1:F22
 *
 * Pure dimensioneer-utility (geen businesscase, geen MaatregelModule):
 * gegeven aantal douchekoppen + piekgebruik → bepaal vereiste boilerinhoud en kW.
 *
 * Formules (letterlijk uit Excel):
 *   c_water = 4.19 kJ/(kg·K)
 *   ρ_water = 1.0 kg/L
 *   ΔT_douche = T_meng − T_koud  (Excel E11 = 38 − 10 = 28 K)
 *   ΔT_boiler = T_boiler − T_koud (E18 - E9 = 65 - 10 = 55 K)
 *   debiet_per_kop = 0.166 L/s
 *   piek_seconden = douche_minuten × 60
 *
 *   Q_kJ_piek = aantal_koppen × c × ρ × ΔT_douche × debiet × piek_seconden
 *   Q_met_verlies = Q_kJ_piek × (1 + 0.075)         // 7.5% leidingverlies
 *
 *   effectieve_inhoud_L = Q_met_verlies / (c × ρ × ΔT_boiler)
 *   minimaal_benodigde_inhoud_L = effectieve_inhoud_L / 0.85    // aftapfactor
 *
 *   benodigd_vermogen_kW = Q_met_verlies / (3600 × oplaadtijd_uren)
 */

export interface BoilerDimensioneerInput {
  aantalDouchekoppen: number;
  /** Hoe snel boiler na piek weer vol moet zijn (uur). Excel E4 = 4. */
  oplaadtijdUur: number;
  /** Boilertemperatuur (default 65°C) */
  tBoilerCelsius: number;
  /** Mengtemperatuur douche (default 38°C) */
  tMengCelsius: number;
  /** Koudwatertemperatuur (default 10°C) */
  tKoudCelsius: number;
  /** Debiet per douchekop in L/s (default 0.166) */
  debietPerKopLPerSec: number;
  /** Minuten douche (default 5) */
  minutenPerDouche: number;
  /** Leidingverlies-toeslag fractie (default 0.075) */
  leidingverliesFractie: number;
  /** Aftapbaarheidsfactor (default 0.85 voor oplaadboiler) */
  aftapfactor: number;
}

export interface BoilerDimensioneerResultaat {
  qPiekKJ: number;
  qMetVerliesKJ: number;
  effectieveInhoudLiter: number;
  minimaalBenodigdeInhoudLiter: number;
  benodigdVermogenKw: number;
}

const C_WATER = 4.19;
const RHO_WATER = 1.0;

export function dimensioneerBoiler(input: BoilerDimensioneerInput): BoilerDimensioneerResultaat {
  const deltaTDouche = input.tMengCelsius - input.tKoudCelsius;
  const deltaTBoiler = input.tBoilerCelsius - input.tKoudCelsius;
  const piekSeconden = input.minutenPerDouche * 60;

  const qPiekKJ =
    input.aantalDouchekoppen *
    C_WATER *
    RHO_WATER *
    deltaTDouche *
    input.debietPerKopLPerSec *
    piekSeconden;

  const qMetVerliesKJ = qPiekKJ * (1 + input.leidingverliesFractie);

  const effectieveInhoudLiter = qMetVerliesKJ / (C_WATER * RHO_WATER * deltaTBoiler);
  const minimaalBenodigdeInhoudLiter = effectieveInhoudLiter / input.aftapfactor;

  const benodigdVermogenKw = qMetVerliesKJ / (3600 * input.oplaadtijdUur);

  return {
    qPiekKJ,
    qMetVerliesKJ,
    effectieveInhoudLiter,
    minimaalBenodigdeInhoudLiter,
    benodigdVermogenKw,
  };
}

export function defaultBoilerDimensioneerInput(aantalDouchekoppen: number): BoilerDimensioneerInput {
  return {
    aantalDouchekoppen,
    oplaadtijdUur: 4,
    tBoilerCelsius: 65,
    tMengCelsius: 38,
    tKoudCelsius: 10,
    debietPerKopLPerSec: 0.166,
    minutenPerDouche: 5,
    leidingverliesFractie: 0.075,
    aftapfactor: 0.85,
  };
}
