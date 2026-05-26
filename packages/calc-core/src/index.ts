/**
 * Public API van @sportief-opgewekt/calc-core.
 *
 * Alle types, modules en utilities die de UI/API/PPT-export nodig heeft
 * staan hier expliciet geëxporteerd. Niets anders is publiek bedoeld.
 */

// Types & constanten
export * from './types/index.js';

// Data-lookups (UI heeft soms direct toegang nodig)
export {
  rcDefault,
  rcByDetail,
  uWaarde,
  alleConstructieDetails,
} from './data/rc-waarden.js';

export type { ConstructieDetail, ConstructieDeel } from './data/rc-waarden.js';

export {
  AANSLUITINGEN,
  KLEINVERBRUIK_GRENS_KW,
  aansluitingByLabel,
  aansluitingToType,
  alleAansluitingen,
} from './data/aansluitwaarden.js';

export type { AansluitingRow } from './data/aansluitwaarden.js';

export {
  PV_STAFFEL,
  PV_DEFAULT_PANEEL_WP,
  PV_DEFAULT_INSTRALINGSFACTOR,
  PV_DEGRADATIE_PER_JAAR,
  PV_DEFAULT_EIGEN_VERBRUIK_RATIO,
  PV_CO2_REDUCTIE_PER_KWH,
  GLAS,
  pvPrijsPerWp,
  glasInfo,
} from './data/pv-en-glas.js';

export type { Glassoort } from './data/pv-en-glas.js';

export {
  luchtWaterWPerM2,
  luchtLuchtWPerM3,
  hybrideVollasturen,
  WTW_BESPARING_FACTOR,
  HYBRIDE_DEFAULT_BETA,
  HYBRIDE_DEFAULT_COP,
  LW_DEFAULT_COP,
  LL_DEFAULT_COP,
} from './data/warmtepomp.js';

export type { IsolatieNiveau } from './data/warmtepomp.js';

// Modules
export { dakisolatieModule } from './modules/dakisolatie.js';
export type { DakisolatieInput, DakisolatieResultaat } from './modules/dakisolatie.js';

export { spouwmuurisolatieModule } from './modules/spouwmuurisolatie.js';
export type { SpouwmuurInput, SpouwmuurResultaat } from './modules/spouwmuurisolatie.js';

export { vloerisolatieModule } from './modules/vloerisolatie.js';
export type { VloerisolatieInput, VloerisolatieResultaat } from './modules/vloerisolatie.js';

export { glasisolatieModule } from './modules/glasisolatie.js';
export type {
  GlasisolatieInput,
  GlasisolatieResultaat,
  GlasSegment,
} from './modules/glasisolatie.js';

export { waterzijdigInregelenModule } from './modules/waterzijdig-inregelen.js';
export type {
  WaterzijdigInregelenInput,
  WaterzijdigInregelenResultaat,
} from './modules/waterzijdig-inregelen.js';

export { wtwModule } from './modules/wtw.js';
export type { WtwInput, WtwResultaat } from './modules/wtw.js';

export { warmtepompBoilerModule } from './modules/warmtepompboiler.js';
export type {
  WarmtepompBoilerInput,
  WarmtepompBoilerResultaat,
} from './modules/warmtepompboiler.js';

export { eBoilerModule } from './modules/eboiler.js';
export type { EBoilerInput, EBoilerResultaat } from './modules/eboiler.js';

export { pvtTapwaterModule } from './modules/pvt-tapwater.js';
export type { PvtTapwaterInput, PvtResultaat } from './modules/pvt-tapwater.js';

export { qtonWarmtepompModule, QTON_MODELLEN } from './modules/qton-warmtepomp.js';
export type { QtonInput, QtonResultaat, QtonModel } from './modules/qton-warmtepomp.js';

export { lmntWarmtepompModule } from './modules/lmnt-warmtepomp.js';
export type { LmntInput, LmntResultaat } from './modules/lmnt-warmtepomp.js';

export { luchtWaterWarmtepompModule } from './modules/lucht-water-warmtepomp.js';
export type {
  LuchtWaterWPInput,
  LuchtWaterWPResultaat,
} from './modules/lucht-water-warmtepomp.js';

export { luchtLuchtWarmtepompModule } from './modules/lucht-lucht-warmtepomp.js';
export type {
  LuchtLuchtWPInput,
  LuchtLuchtWPResultaat,
} from './modules/lucht-lucht-warmtepomp.js';

export { hybrideWarmtepompModule } from './modules/hybride-warmtepomp.js';
export type {
  HybrideWarmtepompInput,
  HybrideWarmtepompResultaat,
} from './modules/hybride-warmtepomp.js';

export { binnenverlichtingModule } from './modules/binnenverlichting.js';
export type {
  BinnenverlichtingInput,
  BinnenverlichtingResultaat,
} from './modules/binnenverlichting.js';

export { ledVeldverlichtingModule } from './modules/ledveldverlichting.js';
export type {
  VeldverlichtingInput,
  VeldverlichtingResultaat,
} from './modules/ledveldverlichting.js';

export { zonnepanelenModule } from './modules/zonnepanelen.js';
export type {
  ZonnepanelenInput,
  ZonnepanelenResultaat,
  PvJaarResultaat,
} from './modules/zonnepanelen.js';

export { batterijEenvoudigModule } from './modules/batterij-eenvoudig.js';
export type {
  BatterijEenvoudigInput,
  BatterijEenvoudigResultaat,
} from './modules/batterij-eenvoudig.js';

export { batterijUitgebreidModule } from './modules/batterij-uitgebreid.js';
export type {
  BatterijUitgebreidInput,
  BatterijUitgebreidResultaat,
} from './modules/batterij-uitgebreid.js';

export {
  simuleerBatterijTijdreeks,
} from './modules/batterij-tijdreeks.js';
export type {
  BatterijConfig,
  BatterijTijdreeksInput,
  BatterijTijdreeksResultaat,
  BatterijUurResultaat,
} from './modules/batterij-tijdreeks.js';

export {
  douchesAnalyseModule,
  berekenDouchenGasSimpel,
  berekenDouchenGedetailleerd,
} from './modules/douches.js';
export type {
  DouchesSimpelInput,
  DouchesGedetailleerdInput,
  DouchesAnalyseInput,
  DouchesAnalyseResultaat,
  DagSchema,
  DagVanWeek,
  TijdSlot,
} from './modules/douches.js';

export {
  dimensioneerBoiler,
  defaultBoilerDimensioneerInput,
} from './modules/boiler-dimensionering.js';
export type {
  BoilerDimensioneerInput,
  BoilerDimensioneerResultaat,
} from './modules/boiler-dimensionering.js';

// Utilities
export {
  maakBusinessCase,
  dumavaSubsidie,
  isdeSubsidie,
  bosaSportSubsidie,
  defaultContext,
} from './util/business-case.js';

export type { BusinessCaseInput } from './util/business-case.js';

// DUMAVA-regime helper — gedeeld tussen frontend lokaal-bereken en backend
export { bepaalDumavaRegime, pasDumavaRegimeToe } from './util/dumava-regime.js';
export type { DumavaRegime, DumavaRegimeResultaat } from './util/dumava-regime.js';

export {
  controleerAansluitwaarde,
} from './util/aansluitwaarde-check.js';

export type {
  AansluitwaardeCheckInput,
  AansluitwaardeCheckResultaat,
} from './util/aansluitwaarde-check.js';

export { rollupProject } from './util/rollup.js';
export type { RollupInput } from './util/rollup.js';

// Registry
export {
  MODULE_REGISTRY,
  MAATREGEL_GROEPEN,
  getModule,
} from './registry.js';

export type { RegistryKey } from './registry.js';
