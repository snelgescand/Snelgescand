/**
 * Module-registry.
 *
 * Centrale plek waar alle MaatregelModule-implementaties geregistreerd zijn.
 * De UI kan dit gebruiken om dynamisch een lijst van beschikbare maatregelen
 * te tonen, defaultInputs op te halen en bereken() aan te roepen.
 */

import type { MaatregelId, MaatregelModule, MaatregelResultaat } from './types/index.js';

import { dakisolatieModule } from './modules/dakisolatie.js';
import { spouwmuurisolatieModule } from './modules/spouwmuurisolatie.js';
import { vloerisolatieModule } from './modules/vloerisolatie.js';
import { glasisolatieModule } from './modules/glasisolatie.js';
import { waterzijdigInregelenModule } from './modules/waterzijdig-inregelen.js';
import { wtwModule } from './modules/wtw.js';
import { warmtepompBoilerModule } from './modules/warmtepompboiler.js';
import { eBoilerModule } from './modules/eboiler.js';
import { pvtTapwaterModule } from './modules/pvt-tapwater.js';
import { luchtWaterWarmtepompModule } from './modules/lucht-water-warmtepomp.js';
import { luchtLuchtWarmtepompModule } from './modules/lucht-lucht-warmtepomp.js';
import { qtonWarmtepompModule } from './modules/qton-warmtepomp.js';
import { lmntWarmtepompModule } from './modules/lmnt-warmtepomp.js';
import { hybrideWarmtepompModule } from './modules/hybride-warmtepomp.js';
import { binnenverlichtingModule } from './modules/binnenverlichting.js';
import { ledVeldverlichtingModule } from './modules/ledveldverlichting.js';
import { zonnepanelenModule } from './modules/zonnepanelen.js';
import { batterijEenvoudigModule } from './modules/batterij-eenvoudig.js';
import { douchesAnalyseModule } from './modules/douches.js';

/**
 * Map id → module. Voor enkelvoudige module-lookups (UI, tests).
 *
 * Niet alle MaatregelId's hebben een module — qton-warmtepomp, lmnt-warmtepomp
 * en batterij-tijdreeks (engine-only, geen MaatregelModule).
 */
export const MODULE_REGISTRY = {
  'douches-analyse': douchesAnalyseModule,
  'dakisolatie': dakisolatieModule,
  'spouwmuurisolatie': spouwmuurisolatieModule,
  'vloerisolatie': vloerisolatieModule,
  'glasisolatie': glasisolatieModule,
  'waterzijdig-inregelen': waterzijdigInregelenModule,
  'wtw': wtwModule,
  'warmtepompboiler': warmtepompBoilerModule,
  'eboiler': eBoilerModule,
  'pvt-tapwater': pvtTapwaterModule,
  'qton-warmtepomp': qtonWarmtepompModule,
  'lmnt-warmtepomp': lmntWarmtepompModule,
  'lucht-water-warmtepomp': luchtWaterWarmtepompModule,
  'lucht-lucht-warmtepomp': luchtLuchtWarmtepompModule,
  'hybride-warmtepomp': hybrideWarmtepompModule,
  'binnenverlichting': binnenverlichtingModule,
  'ledveldverlichting': ledVeldverlichtingModule,
  'zonnepanelen': zonnepanelenModule,
  'batterij-eenvoudig': batterijEenvoudigModule,
} as const satisfies Partial<Record<MaatregelId, MaatregelModule<any, MaatregelResultaat>>>;

export type RegistryKey = keyof typeof MODULE_REGISTRY;

/**
 * UI-helper: alle modules in groepen — overeenkomstig de PowerPoint-secties.
 */
export const MAATREGEL_GROEPEN = {
  'Warmte besparen': ['dakisolatie', 'spouwmuurisolatie', 'vloerisolatie', 'glasisolatie', 'waterzijdig-inregelen', 'wtw'],
  'Warmte opwekken': ['warmtepompboiler', 'qton-warmtepomp', 'lmnt-warmtepomp', 'eboiler', 'pvt-tapwater', 'lucht-water-warmtepomp', 'lucht-lucht-warmtepomp', 'hybride-warmtepomp'],
  'Stroom besparen': ['binnenverlichting', 'ledveldverlichting'],
  'Stroom opwekken': ['zonnepanelen'],
  'Opslag & flex': ['batterij-eenvoudig'],
  'Analyse': ['douches-analyse'],
} as const satisfies Record<string, readonly RegistryKey[]>;

export function getModule(id: RegistryKey) {
  return MODULE_REGISTRY[id];
}
