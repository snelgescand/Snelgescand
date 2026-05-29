/**
 * Trainingsschema — vul aantal teams per dag in.
 *
 * Gebaseerd op het originele Excel-rekenmodel (sheet "Douchen (teamsporten)"):
 *
 *   Onder 13 jaar (jeugd):
 *     - Speelt op HALF veld → ~10 spelers per team (incl. wissels)
 *     - Doucht 25% doordeweeks
 *     - Doucht 50% bij wedstrijd (zaterdag)
 *     - Doucht 100% bij wedstrijd (zondag — vooral senioren-jeugd)
 *
 *   13 jaar en ouder (senioren):
 *     - Speelt op HEEL veld → ~15 spelers per team (incl. wissels + scheids)
 *     - Doucht 95% bij training (doordeweeks)
 *     - Doucht 100% bij wedstrijd (weekend)
 *
 *   Per douche: 35 liter warm water (37°C uit Excel)
 *
 * Dit schema vervangt de losse "douches-analyse"-invoer in stap 2 — die wordt
 * automatisch overgenomen uit dit schema.
 */

import { useState, useEffect } from 'react';
import { InfoTooltip } from './InfoTooltip';
import { SchemaImportPaneel } from './SchemaImportPaneel';
import { haalClubsOp, haalThuisProgramma, vindDruksteWeekend, weekendNaarUurRijen, type DruksteWeekend, type SportlinkClub } from '../util/sportlink';
import type { GeimporteerdMoment } from '../api/client';

// Legacy export — gebruikt door PPT-route en wat oudere code. Voor team-sporten
// blijft dit een redelijke default. Nieuw: gebruik SPORT_CONFIG voor sport-specifiek.
export const SPELERS_PER_TEAM = {
  onder13: 10,   // half veld: 7 spelers + wissels
  vanaf13: 15,   // heel veld: 11 spelers + 4 wissels
} as const;

export const LITERS_PER_DOUCHE = 35;

/**
 * Sport-categorisering bepaalt het reken-model:
 * - 'teamsport': teams × spelers/team (voetbal, hockey, korfbal, handbal, rugby, volleybal)
 * - 'racketsport': banen × spelers/baan (tennis, padel, badminton, squash)
 * - 'individueel': directe personen-telling (atletiek)
 * - 'baansport': zwembanen × personen/baan (zwemmen)
 */
type SportCategorie = 'teamsport' | 'racketsport' | 'individueel' | 'baansport';

interface SportConfig {
  categorie: SportCategorie;
  /** Label voor "groep 1" (was: teams <13) */
  labelGroep1: string;
  /** Label voor "groep 2" (was: teams ≥13) */
  labelGroep2: string;
  /** Personen per eenheid in groep 1 (was: 10 voor jeugd-team) */
  personenPerEenheid1: number;
  /** Personen per eenheid in groep 2 (was: 15 voor senior-team) */
  personenPerEenheid2: number;
  /**
   * Hoeveel leden van de relevante groep (jeugd/senior, of totaal voor racket)
   * vertegenwoordigen één bezette eenheid op het piekmoment. Gebruikt door
   * de valsspeel-generator om realistische aantallen te genereren.
   *
   * Bij teamsport: ≈ personenPerEenheid (1 team per X jeugdleden = X leden/team).
   * Bij racket: veel groter (1 baan dekt 25-50 leden door rouleren).
   * Bij individueel: hoeveel leden trainen actief op een avond (10-15% van totaal).
   */
  ledenPerActieveEenheid1: number;
  ledenPerActieveEenheid2: number;
  /** Korte uitleg-tekst voor info-tooltip */
  uitleg: string;
  /** Douche-percentage matrix: [groep][type] → fractie */
  douchePct: {
    groep1: { training: number; wedstrijd: number };
    groep2: { training: number; wedstrijd: number };
  };
}

/**
 * Sport-specifieke aannames. Pas hier aan als bron-data scherper wordt.
 *
 * Spelers/eenheid is gebaseerd op:
 * - Teamsport: KNVB/KNHB/KNKV/etc richtlijnen incl. wissels
 * - Racket: standaard bezetting per baan (single=2, dubbel=4)
 * - Individueel: 1 persoon per "eenheid"
 * - Baansport (zwemmen): typische bezetting per zwembaan
 *
 * Douche-percentages:
 * - Teamsport: 25% jeugd-training, 95% senior-training, 100% wedstrijd
 * - Racket: 10% training, 15% wedstrijd (vrijwel niemand doucht na 1 uur tennis)
 * - Atletiek: 50% training, 80% wedstrijd (zweten wel, maar weinig clubdouches)
 * - Zwemmen: 100% (vanzelfsprekend)
 */
/**
 * Sport-specifieke aannames. Iedere waarde is concreet onderbouwd — zie de
 * "validatie" docstring per sport.
 *
 * Drie groepen kerngetallen:
 *   1. personenPerEenheid1/2 — hoeveel sporters per "eenheid" (team/baan)
 *   2. douchePct — fractie van de sporters die DAADWERKELIJK doucht
 *   3. ledenPerActieveEenheid — schaalfactor voor de valsspeel-generator
 *      ("hoeveel leden heeft een club typisch per 1 bezette eenheid op piekuur")
 *
 * Reken-validatie voor club van 200 leden, 30% jeugd, per week:
 *   Voetbal:     ~250 douches/week   (di+do training + zo wedstrijd dominant)
 *   Tennis:      ~10-15 douches/week (verwaarloosbaar — meeste douchen thuis)
 *   Padel:       ~30 douches/week    (iets intensiever dan tennis)
 *   Squash:      ~80 douches/week    (zeer intensief, 30% doucht)
 *   Atletiek:    ~150 douches/week   (zweterige loop-trainingen)
 *   Zwemmen:     ~700 douches/week   (vrijwel iedereen, definitie van zwemmen)
 *   Hockey:      ~280 douches/week   (grasveld → vuil)
 *   Rugby:       ~350 douches/week   (contactsport, 100% doucht)
 *   Volleybal:   ~140 douches/week
 *   Korfbal:     ~190 douches/week
 *   Handbal:     ~210 douches/week
 *   Honkbal:     ~90 douches/week    (lange wedstrijden maar weinig zweten)
 */
const SPORT_CONFIGS: Record<string, SportConfig> = {
  // ============================================================
  // TEAMSPORTEN — eenheid = team, leden / personenPerTeam = aantal teams
  // ============================================================
  voetbal: {
    categorie: 'teamsport',
    labelGroep1: 'Teams jeugd (<13 jr)',
    labelGroep2: 'Teams senioren',
    personenPerEenheid1: 10,
    personenPerEenheid2: 15,
    ledenPerActieveEenheid1: 10,   // 1 jeugdteam per 10 jeugdleden
    ledenPerActieveEenheid2: 15,   // 1 seniorteam per 15 senioren
    uitleg: 'Voetbal: jeugd half veld ~10 sp/team, senioren heel veld ~15 sp/team (incl. wissels).',
    douchePct: {
      // Bereidheids-% conform Sportief Opgewekt-rekenmodel (Excel "Douchen teamsporten"):
      // jeugd 25% doordeweeks / 50% zaterdag / 100% zondag; senioren 95%/100%/100%.
      // De werkelijke telling wordt verlaagd via realismeFactor() (aanwezigheid × cultuur).
      groep1: { training: 0.25, wedstrijd: 0.50 },
      groep2: { training: 0.95, wedstrijd: 1.00 },
    },
  },
  hockey: {
    categorie: 'teamsport',
    labelGroep1: 'Teams jeugd (<13 jr)',
    labelGroep2: 'Teams senioren',
    personenPerEenheid1: 10,
    personenPerEenheid2: 15,
    ledenPerActieveEenheid1: 10,
    ledenPerActieveEenheid2: 15,
    uitleg: 'Hockey: jeugd-team ~10 sp, senior-team ~15 sp (incl. wissels + keeper). Kunstgras → relatief schoon → jeugd doucht vaker thuis dan bij voetbal.',
    douchePct: {
      // Hockey lager dan voetbal: kunstgras geeft minder modder/vuil, dus minder
      // douche-drang (bevestigd in ouders.nl-discussies). Senior iets onder voetbal.
      // Bron: KNHB energiescan-gas (8.826 m³) is hoog, maar dat zit vooral in
      // kunstgrasveld-verlichting + kantine, niet douches.
      groep1: { training: 0.20, wedstrijd: 0.45 },
      groep2: { training: 0.80, wedstrijd: 0.95 },
    },
  },
  korfbal: {
    categorie: 'teamsport',
    labelGroep1: 'Teams jeugd (<13 jr)',
    labelGroep2: 'Teams senioren',
    personenPerEenheid1: 8,
    personenPerEenheid2: 11,
    ledenPerActieveEenheid1: 8,
    ledenPerActieveEenheid2: 11,
    uitleg: 'Korfbal: 8 spelers in het veld (4×2 mix), met wissels ~11 senioren / 8 jeugd.',
    douchePct: {
      groep1: { training: 0.20, wedstrijd: 0.50 },
      groep2: { training: 0.80, wedstrijd: 0.95 },
    },
  },
  handbal: {
    categorie: 'teamsport',
    labelGroep1: 'Teams jeugd (<13 jr)',
    labelGroep2: 'Teams senioren',
    personenPerEenheid1: 12,
    personenPerEenheid2: 14,
    ledenPerActieveEenheid1: 12,
    ledenPerActieveEenheid2: 14,
    uitleg: 'Handbal: 7 in het veld + wissels. Indoor & intensief — veel douchen na training (vergelijkbaar met voetbal-senioren).',
    douchePct: {
      // Indoor + intensief contactspel → hoge douche-bereidheid, conform Excel-teamsport.
      // Bron: EenVandaag 2026 (handbalclubs hanteren vaak verplicht douchebeleid).
      groep1: { training: 0.30, wedstrijd: 0.65 },
      groep2: { training: 0.90, wedstrijd: 1.00 },
    },
  },
  rugby: {
    categorie: 'teamsport',
    labelGroep1: 'Teams jeugd',
    labelGroep2: 'Teams senioren',
    personenPerEenheid1: 18,
    personenPerEenheid2: 22,
    ledenPerActieveEenheid1: 18,
    ledenPerActieveEenheid2: 22,
    uitleg: 'Rugby: contactsport — vrijwel iedereen doucht na training en zeker na wedstrijd.',
    douchePct: {
      groep1: { training: 0.75, wedstrijd: 1.00 },
      groep2: { training: 1.00, wedstrijd: 1.00 },
    },
  },
  volleybal: {
    categorie: 'teamsport',
    labelGroep1: 'Teams jeugd',
    labelGroep2: 'Teams senioren',
    personenPerEenheid1: 8,
    personenPerEenheid2: 10,
    ledenPerActieveEenheid1: 8,
    ledenPerActieveEenheid2: 10,
    uitleg: 'Volleybal: 6 in het veld + 2-4 wissels. Indoor, kort en intensief — minder douchen dan handbal.',
    douchePct: {
      groep1: { training: 0.20, wedstrijd: 0.40 },
      groep2: { training: 0.55, wedstrijd: 0.80 },
    },
  },
  honkbal: {
    categorie: 'teamsport',
    labelGroep1: 'Teams jeugd',
    labelGroep2: 'Teams senioren',
    personenPerEenheid1: 10,
    personenPerEenheid2: 14,
    ledenPerActieveEenheid1: 10,
    ledenPerActieveEenheid2: 14,
    uitleg: 'Honkbal/Softbal: lange wedstrijden, weinig fysieke intensiteit → relatief weinig douchen.',
    douchePct: {
      groep1: { training: 0.15, wedstrijd: 0.30 },
      groep2: { training: 0.35, wedstrijd: 0.55 },
    },
  },

  // ============================================================
  // RACKETSPORTEN — eenheid = baan; bezetting = niet alle leden tegelijk!
  // ledenPerActieveEenheid = hoeveel leden geeft 1 bezette baan op piekuur.
  // Tennis: ~25 leden per baan totaal; piek-bezetting ~60% van banen.
  // ============================================================
  tennis: {
    categorie: 'racketsport',
    labelGroep1: 'Banen single (2 sp/baan)',
    labelGroep2: 'Banen dubbel (4 sp/baan)',
    personenPerEenheid1: 2,
    personenPerEenheid2: 4,
    // Tennisclub: ~1 baan per 25 leden, piek-bezetting ~60% → ~40 leden per
    // bezette baan op piekuur. Mix single/dubbel 30/70.
    ledenPerActieveEenheid1: 130,  // 1 single baan per ~130 leden op piek
    ledenPerActieveEenheid2: 55,   // 1 dubbel baan per ~55 leden op piek (vaker dubbel)
    uitleg: 'Tennis: club van 200 leden heeft typisch 8 banen, waarvan ~5 bezet op piekuur (2 single + 3 dubbel). De meeste tennissers douchen thuis — daarom maar ~5-10%.',
    douchePct: {
      // BART: "kan echt bijna verwaarloosd worden" — typisch 5%
      groep1: { training: 0.05, wedstrijd: 0.08 },
      groep2: { training: 0.05, wedstrijd: 0.08 },
    },
  },
  padel: {
    categorie: 'racketsport',
    labelGroep1: 'Banen 2 sp',
    labelGroep2: 'Banen dubbel (4 sp/baan)',
    personenPerEenheid1: 2,
    personenPerEenheid2: 4,
    // Padel: typisch ~1 baan per 30 leden, vrijwel altijd dubbel
    ledenPerActieveEenheid1: 200,  // bijna nooit single
    ledenPerActieveEenheid2: 50,
    uitleg: 'Padel: vrijwel altijd dubbel (4 sp/baan). Iets meer douchen dan tennis omdat het intensiever en zweteriger is — ~15%.',
    douchePct: {
      groep1: { training: 0.10, wedstrijd: 0.15 },
      groep2: { training: 0.15, wedstrijd: 0.20 },
    },
  },
  badminton: {
    categorie: 'racketsport',
    labelGroep1: 'Banen single (2 sp/baan)',
    labelGroep2: 'Banen dubbel (4 sp/baan)',
    personenPerEenheid1: 2,
    personenPerEenheid2: 4,
    ledenPerActieveEenheid1: 80,
    ledenPerActieveEenheid2: 40,
    uitleg: 'Badminton: indoor-zaalsport. Kort en intensief maar weinig clubdouche-gebruik.',
    douchePct: {
      groep1: { training: 0.05, wedstrijd: 0.10 },
      groep2: { training: 0.05, wedstrijd: 0.10 },
    },
  },
  squash: {
    categorie: 'racketsport',
    labelGroep1: 'Banen recreatief (2 sp)',
    labelGroep2: 'Banen competitie (2 sp)',
    personenPerEenheid1: 2,
    personenPerEenheid2: 2,
    // Squashclub: ~1 baan per 50 leden, 100% bezetting op piek
    ledenPerActieveEenheid1: 60,
    ledenPerActieveEenheid2: 40,
    uitleg: 'Squash: extreem intensieve sport — 30-60% van de spelers doucht ondanks korte speeltijd.',
    douchePct: {
      groep1: { training: 0.30, wedstrijd: 0.50 },
      groep2: { training: 0.50, wedstrijd: 0.70 },
    },
  },

  // ============================================================
  // INDIVIDUEEL — eenheid = persoon
  // ============================================================
  atletiek: {
    categorie: 'individueel',
    labelGroep1: 'Sporters jeugd (<13 jr)',
    labelGroep2: 'Sporters senioren',
    personenPerEenheid1: 1,
    personenPerEenheid2: 1,
    // Atletiek: 10-20% van de leden komt op piekuur trainen
    ledenPerActieveEenheid1: 7,    // 1 jeugdsporter per 7 jeugdleden op piek
    ledenPerActieveEenheid2: 10,   // 1 senior per 10 leden op piek
    uitleg: 'Atletiek: vul direct het aantal sporters in (geen teams of banen). Loop-trainingen geven veel zweet → ~35-50% doucht.',
    douchePct: {
      groep1: { training: 0.20, wedstrijd: 0.40 },
      groep2: { training: 0.40, wedstrijd: 0.65 },
    },
  },

  // ============================================================
  // BAANSPORT (zwemmen) — eenheid = zwembaan met groep
  // ============================================================
  zwemmen: {
    categorie: 'baansport',
    labelGroep1: 'Banen jeugd-lessen (~6 p/baan)',
    labelGroep2: 'Banen senior-training (~6 p/baan)',
    personenPerEenheid1: 6,
    personenPerEenheid2: 6,
    ledenPerActieveEenheid1: 6,   // les-groep = baan direct
    ledenPerActieveEenheid2: 8,
    uitleg: 'Zwemmen: ~6 personen per baan (les-groep). Iedereen doucht VOOR en NA — verplicht in zwembad.',
    douchePct: {
      groep1: { training: 1.00, wedstrijd: 1.00 },
      groep2: { training: 1.00, wedstrijd: 1.00 },
    },
  },

  // ============================================================
  // MULTI — fallback voor sportcomplex met meerdere sporten
  // ============================================================
  multi: {
    categorie: 'teamsport',
    labelGroep1: 'Eenheden jeugd',
    labelGroep2: 'Eenheden senioren',
    personenPerEenheid1: 10,
    personenPerEenheid2: 15,
    ledenPerActieveEenheid1: 10,
    ledenPerActieveEenheid2: 15,
    uitleg: 'Multi-sportcomplex: aanname is teamsport-default (voetbal). Pas zo nodig handmatig aan.',
    douchePct: {
      groep1: { training: 0.30, wedstrijd: 0.55 },
      groep2: { training: 0.75, wedstrijd: 0.90 },
    },
  },
};

/** Default voor onbekende of niet-opgegeven sport */
const SPORT_CONFIG_DEFAULT: SportConfig = SPORT_CONFIGS.voetbal;

/** Geef de juiste config terug voor een type vereniging — case-insensitive, fallback default */
export function getSportConfig(typeVereniging?: string): SportConfig {
  if (!typeVereniging) return SPORT_CONFIG_DEFAULT;
  return SPORT_CONFIGS[typeVereniging.toLowerCase()] ?? SPORT_CONFIG_DEFAULT;
}

/** Is dit een geldig, herkend sporttype? (niet leeg, niet 'anders', staat in configs) */
export function isGeldigSporttype(typeVereniging?: string): boolean {
  if (!typeVereniging) return false;
  return typeVereniging.toLowerCase() in SPORT_CONFIGS;
}

/**
 * Sport-eenheid terminologie, afgeleid van de categorie. Bepaalt:
 *  - hoe we de telbare eenheid noemen (team / baan / sporter)
 *  - of er een leeftijds-/bezettingsonderscheid is tussen groep 1 en 2
 *
 * Dit maakt de hele UI sport-variabel zonder elke config los aan te passen.
 */
export interface EenheidTermen {
  /** Enkelvoud, bv. 'team', 'baan', 'sporter' */
  enkelvoud: string;
  /** Meervoud, bv. 'teams', 'banen', 'sporters' */
  meervoud: string;
  /** Korte instructie bovenaan, bv. 'het aantal teams' */
  invulInstructie: string;
  /** Afkorting bij personen-per-eenheid, bv. 'sp/team', 'sp/baan', '' */
  perEenheidAfkorting: string;
}

export function eenheidTermen(categorie: SportCategorie): EenheidTermen {
  switch (categorie) {
    case 'teamsport':
      return { enkelvoud: 'team', meervoud: 'teams', invulInstructie: 'het aantal teams', perEenheidAfkorting: 'sp/team' };
    case 'racketsport':
      return { enkelvoud: 'baan', meervoud: 'bezette banen', invulInstructie: 'het aantal bezette banen', perEenheidAfkorting: 'sp/baan' };
    case 'individueel':
      return { enkelvoud: 'sporter', meervoud: 'aanwezige sporters', invulInstructie: 'het aantal aanwezige sporters', perEenheidAfkorting: '' };
    case 'baansport':
      return { enkelvoud: 'baan', meervoud: 'bezette banen', invulInstructie: 'het aantal bezette banen', perEenheidAfkorting: 'p/baan' };
  }
}

export interface TrainingMoment {
  id: string;
  dag: 'maandag' | 'dinsdag' | 'woensdag' | 'donderdag' | 'vrijdag' | 'zaterdag' | 'zondag';
  startTijd: string;
  eindTijd: string;
  /** Aantal eenheden in groep 1 — interpretatie hangt af van sport (teams/banen/personen).
   *  Legacy naam "aantalTeamsOnder13" blijft staan om bestaande projecten niet te breken. */
  aantalTeamsOnder13: number;
  /** Aantal eenheden in groep 2 — interpretatie hangt af van sport. */
  aantalTeamsVanaf13: number;
  /**
   * MODE A — directe uur-invoer. Als dit gezet is, is dit moment een UUR-RIJ:
   * één uur lang, met een direct ingevoerd aantal aanwezige spelers. De douches
   * worden dan berekend uit dit getal (× gemiddelde douche-bereidheid × cultuur)
   * en exact in dít uur in de grafiek geplaatst — de gebruiker bepaalt zelf de
   * spreiding. Is dit veld undefined, dan geldt het klassieke teams/banen-model.
   */
  aantalPersonen?: number;
  type: 'training' | 'wedstrijd' | 'sociaal';
}

export type TrainingsSchema = TrainingMoment[];

const DAGEN: TrainingMoment['dag'][] = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];

/* ============================================================
 * REALISME-CORRECTIE op douche-tellingen
 * ============================================================
 *
 * Het Sportief Opgewekt-rekenmodel (Excel) geeft "percentage douchers" dat
 * uitgaat van een STRIKTE club waar vrijwel iedereen die aanwezig is doucht
 * (bv. 95% van de senioren bij een doordeweekse training).
 *
 * In de Nederlandse praktijk ligt het werkelijke aantal douches LAGER, om
 * twee onafhankelijke redenen:
 *
 *   1. AANWEZIGHEID — niet elk teamlid komt elke training/wedstrijd.
 *      Een seniorselectie van 15 (incl. wissels) traint vaak met 10-12 man.
 *      Bij wedstrijden is de opkomst hoger (selectie is er bijna voltallig).
 *      Bron: KNVB/bonden rekenen met ~65-75% trainingsopkomst.
 *
 *   2. DOUCHE-CULTUUR — de Excel-percentages gelden voor een club met
 *      verplicht/streng douchebeleid. Het Nederlandse gemiddelde is
 *      'gemengd': douchen wordt gewaardeerd maar niet afgedwongen, en
 *      vooral jeugd doucht steeds vaker thuis (kunstgras-clubs nog meer).
 *      Bron: ONT-praktijkcijfers (600 leden ≈ 6.000-10.000 douches/jaar,
 *      niet de ~22.500 die de bruto-Excel zou opleveren), cultuur-onderzoek
 *      (ouders.nl, EenVandaag 2026 over afnemend verplicht douchen).
 *
 * Keuze (met Bart afgestemd): Excel-percentages blijven LEIDEND en zichtbaar
 * als "bereidheid". Deze realisme-factoren corrigeren de WERKELIJKE telling
 * omlaag, zonder dat de getoonde bereidheids-% verandert.
 */

/** Gem. opkomst bij een TRAINING (% van teamleden dat aanwezig is). */
export const AANWEZIGHEID_TRAINING = 0.70;
/** Gem. opkomst bij een WEDSTRIJD — selectie is bijna voltallig. */
export const AANWEZIGHEID_WEDSTRIJD = 0.95;
/** Cultuurfactor 'gemengd' (default): douchen gewaardeerd, niet verplicht. */
export const CULTUUR_FACTOR = 0.75;

/**
 * Veiligheidsmarge voor het DIMENSIONEREN van de warm-water-installatie.
 *
 * Het douche-model rekent met realistische gemiddelden (opkomst, douche-cultuur,
 * spreiding). Voor de zekerheid dimensioneren we de warmtepomp-capaciteit en de
 * buffer met 7,5% extra headroom — het midden van de gebruikelijke 5-10%-vuistregel.
 * Dit dekt drukkere dan gemiddelde dagen, extra gelijktijdigheid en lichte groei.
 *
 * Let op: alleen de SIZING-cijfers (kW + buffer + WP-keuze) krijgen deze marge.
 * De grafiek en de week/jaar-totalen tonen de werkelijke (on-gemarginaliseerde) vraag,
 * zodat de cijfers eerlijk blijven en niet stiekem opgeblazen worden.
 */
export const VEILIGHEIDSMARGE = 1.075;

/**
 * Effectieve douche-correctie: combineert aanwezigheid (afhankelijk van type)
 * met de cultuurfactor. Wordt vermenigvuldigd met (spelers × bereidheids-%).
 */
export function realismeFactor(type: TrainingMoment['type']): number {
  const aanwezigheid = type === 'wedstrijd' ? AANWEZIGHEID_WEDSTRIJD : AANWEZIGHEID_TRAINING;
  return aanwezigheid * CULTUUR_FACTOR;
}

/**
 * Douche-percentage (BEREIDHEID) o.b.v. groep, type activiteit en dag.
 * Dit is het bruto Excel-percentage — NIET gecorrigeerd voor aanwezigheid/cultuur.
 * Voor werkelijke douche-tellingen vermenigvuldig je dit met realismeFactor(type).
 *
 * NB: bestaande Excel-uitzondering (jeugd op zondag = 100% bij teamsport) blijft behouden.
 */
export function douchePercentage(
  leeftijd: 'onder13' | 'vanaf13',
  type: TrainingMoment['type'],
  dag: TrainingMoment['dag'],
  typeVereniging?: string,
): number {
  if (type === 'sociaal') return 0;
  const config = getSportConfig(typeVereniging);
  const groep = leeftijd === 'onder13' ? config.douchePct.groep1 : config.douchePct.groep2;
  // Excel-uitzondering — alleen voor teamsporten waar jeugd op zondag effectief senior-niveau doucht
  if (leeftijd === 'onder13' && type === 'wedstrijd' && dag === 'zondag' && config.categorie === 'teamsport') {
    return 1.00;
  }
  return type === 'wedstrijd' ? groep.wedstrijd : groep.training;
}

/** Of dit moment een directe UUR-RIJ is (mode A) i.p.v. een teams/banen-blok. */
export function isUurRij(m: TrainingMoment): boolean {
  return m.aantalPersonen != null;
}

/**
 * Gemiddelde douche-bereidheid (jeugd + senior / 2) voor een type/dag.
 * Gebruikt bij uur-invoer (mode A), waar geen leeftijdssplitsing wordt ingevoerd.
 */
export function gemiddeldeBereidheid(
  type: TrainingMoment['type'],
  dag: TrainingMoment['dag'],
  typeVereniging?: string,
): number {
  return (
    douchePercentage('onder13', type, dag, typeVereniging) +
    douchePercentage('vanaf13', type, dag, typeVereniging)
  ) / 2;
}

/**
 * Aantal werkelijke douche-beurten voor ÉÉN moment — sport- én mode-bewust.
 * Dé centrale bron zodat grafiek, week-totalen en piek-berekening identiek rekenen.
 *
 *  • Uur-rij (mode A): aantalPersonen × gemiddelde bereidheid × cultuurfactor.
 *    Géén aanwezigheids-correctie: de ingevoerde personen ZIJN de aanwezigen.
 *  • Klassiek blok: teams/banen × personen-per-eenheid × bereidheid × realisme
 *    (aanwezigheid × cultuur).
 */
export function doucheBeurtenVanMoment(m: TrainingMoment, typeVereniging?: string): number {
  if (m.type === 'sociaal') return 0;
  if (isUurRij(m)) {
    const bereidheid = gemiddeldeBereidheid(m.type, m.dag, typeVereniging);
    return (m.aantalPersonen ?? 0) * bereidheid * CULTUUR_FACTOR;
  }
  const config = getSportConfig(typeVereniging);
  const rf = realismeFactor(m.type);
  const g1 = (m.aantalTeamsOnder13 ?? 0) * config.personenPerEenheid1
    * douchePercentage('onder13', m.type, m.dag, typeVereniging) * rf;
  const g2 = (m.aantalTeamsVanaf13 ?? 0) * config.personenPerEenheid2
    * douchePercentage('vanaf13', m.type, m.dag, typeVereniging) * rf;
  return g1 + g2;
}

interface Props {
  schema: TrainingsSchema;
  onChange: (s: TrainingsSchema) => void;
  /** Optioneel — wordt gebruikt door de "vul standaard schema in"-knop. */
  typeVereniging?: string;
  /** Aantal velden/banen van de club (uit stap 3). Begrenst hoeveel spelers
   *  het standaard-schema tegelijk (per uur) op de accommodatie kan zetten. */
  aantalVelden?: number;
}

const DAG_LABELS: Record<TrainingMoment['dag'], string> = {
  maandag: 'Maandag', dinsdag: 'Dinsdag', woensdag: 'Woensdag', donderdag: 'Donderdag',
  vrijdag: 'Vrijdag', zaterdag: 'Zaterdag', zondag: 'Zondag',
};

const TYPE_INFO: Record<TrainingMoment['type'], { label: string; icoon: string; kleur: string }> = {
  training: { label: 'Training', icoon: '🏃', kleur: 'bg-blue-50 border-blue-200 text-blue-900' },
  wedstrijd: { label: 'Wedstrijd', icoon: '⚽', kleur: 'bg-orange-50 border-orange-200 text-orange-900' },
  sociaal: { label: 'Sociaal', icoon: '🍻', kleur: 'bg-gray-50 border-gray-200 text-gray-700' },
};

/**
 * Genereer een standaard-schema voor een sportclub o.b.v. clubtype en aantal leden.
 *
 * Aannames per sport zijn gebaseerd op de Nederlandse gemiddelde club-organisatie
 * (KNVB, KNHB, KNKV, etc.). Dit is bewust een vereenvoudigd "vertrek"-schema
 * dat de gebruiker daarna kan aanpassen — geen perfecte representatie van élke club.
 *
 * Het schema-model werkt het best voor team-sporten. Voor tennis/atletiek/zwemmen
 * geeft de UI een waarschuwing dat het model minder goed past.
 */
export function genereerStandaardSchema(
  typeVereniging: string,
  aantalLeden: number,
  pctJeugd: number, // 0-100
  aantalVelden?: number,
): { schema: TrainingsSchema; waarschuwing?: string } {
  const config = getSportConfig(typeVereniging);
  const ledenJeugd = Math.round((aantalLeden * pctJeugd) / 100);
  const ledenSenioren = aantalLeden - ledenJeugd;
  const mkId = (i: number) => `m-${Date.now()}-${i}-${Math.floor(Math.random() * 1000)}`;

  // === Bepaal aantal actieve eenheden op piekmoment ===
  // Hier zit de kern van het realistisch maken: we gebruiken `ledenPerActieveEenheid`,
  // NIET personenPerEenheid. Voor tennis: 200 leden / 55 = ~4 dubbel banen op piekuur,
  // niet 200/4 = 50 banen (wat fysiek onmogelijk is).
  const eenhedenGroep1 = Math.max(0, Math.round(ledenJeugd / config.ledenPerActieveEenheid1));
  const eenhedenGroep2 = Math.max(0, Math.round(ledenSenioren / config.ledenPerActieveEenheid2));

  let blokSchema: TrainingsSchema;
  let waarschuwing: string | undefined;
  switch (config.categorie) {
    case 'teamsport':
      blokSchema = weekTeamsport(mkId, eenhedenGroep1, eenhedenGroep2);
      break;
    case 'racketsport':
      // Racket gebruikt eigen leden-gebaseerde logica i.p.v. eenheden
      blokSchema = weekRacketsport(mkId, ledenJeugd, ledenSenioren, typeVereniging);
      break;
    case 'individueel':
      blokSchema = weekIndividueel(mkId, eenhedenGroep1, eenhedenGroep2);
      break;
    case 'baansport':
      blokSchema = weekBaansport(mkId, eenhedenGroep1, eenhedenGroep2);
      break;
    default:
      blokSchema = [];
  }

  // Lever het standaard-schema voortaan als bewerkbare UUR-RIJEN op (mode A).
  // De blok-generatoren hierboven blijven de kalibratie doen; we maken alleen
  // de spreiding per uur expliciet — totalen en curve blijven identiek.
  const uurSchema = schemaNaarUurRijen(blokSchema, typeVereniging, aantalVelden);
  return { schema: uurSchema, waarschuwing };
}

/**
 * TEAMSPORT — voetbal, hockey, korfbal, handbal, rugby, volleybal, honkbal.
 *
 * Niet alle teams trainen tegelijk. Realistische verdeling:
 *  - Senioren ~50% per training-moment (di + do, ieder de helft)
 *  - Senioren-wedstrijd: ~50% thuis (rest uit) = halve teams op zondag
 *  - Jeugd-training: alle teams (verdeeld over wo middag + avond)
 *  - Jeugd-wedstrijd: alle teams op zaterdag
 *
 * Validatie 200-leden voetbalclub, 30% jeugd:
 *   60 jeugd → 6 teams · 140 senior → 9 teams (15 per team)
 *   Di: 5 teams × 15 × 85% = 64 d, Do: 4 × 15 × 85% = 51 d
 *   Wo jeugdtraining: 6 × 10 × 25% = 15 d
 *   Za jeugdwedstrijd: 6 × 10 × 50% = 30 d
 *   Zo seniorwedstrijd: 5 (thuis) × 15 × 100% = 75 d
 *   TOTAAL: ~235 douches/week ✓
 */
function weekTeamsport(mkId: (i: number) => string, teamsJeugd: number, teamsSenioren: number): TrainingsSchema {
  const schema: TrainingsSchema = [];
  let idn = 0;
  const nextId = () => mkId(++idn);

  // === Jeugd-trainingen ===
  // Kleine club: 1-2 blokken op woensdag. Grotere club: spreid over meer
  // doordeweekse middagen/avonden (ma t/m vr), want één woensdag kan niet
  // 20+ teams herbergen. We mikken op ~max 4 teams per blok.
  if (teamsJeugd > 0) {
    const jeugdTrainingsdagen: TrainingMoment['dag'][] = ['woensdag', 'maandag', 'dinsdag', 'donderdag', 'vrijdag'];
    const blokkenNodig = Math.max(1, Math.ceil(teamsJeugd / 4)); // ~4 teams per blok
    const teamsPerBlok = Math.ceil(teamsJeugd / blokkenNodig);
    let restJeugd = teamsJeugd;
    for (let b = 0; b < blokkenNodig; b++) {
      const dag = jeugdTrainingsdagen[b % jeugdTrainingsdagen.length];
      const teamsDitBlok = Math.min(teamsPerBlok, restJeugd);
      restJeugd -= teamsDitBlok;
      // Jeugd traint vooral vroeg op de avond / woensdagmiddag
      const start = dag === 'woensdag' ? '16:00' : '17:30';
      const eind = dag === 'woensdag' ? '17:30' : '19:00';
      schema.push({ id: nextId(), dag, startTijd: start, eindTijd: eind,
        aantalTeamsOnder13: teamsDitBlok, aantalTeamsVanaf13: 0, type: 'training' });
      if (restJeugd <= 0) break;
    }
    // Jeugd-wedstrijden: zaterdagochtend (alle teams gespreid)
    schema.push({ id: nextId(), dag: 'zaterdag', startTijd: '09:00', eindTijd: '12:30',
      aantalTeamsOnder13: teamsJeugd, aantalTeamsVanaf13: 0, type: 'wedstrijd' });
  }

  // === Senioren-trainingen ===
  // Kleine club: di + do. Grotere club: spreid over ma/di/wo/do/vr zodat het
  // veld-gebruik realistisch is (max ~4 teams per avond).
  if (teamsSenioren > 0) {
    const seniorTrainingsdagen: TrainingMoment['dag'][] = ['dinsdag', 'donderdag', 'maandag', 'woensdag', 'vrijdag'];
    const blokkenNodig = Math.max(2, Math.ceil(teamsSenioren / 4)); // min. 2 avonden
    const teamsPerBlok = Math.ceil(teamsSenioren / blokkenNodig);
    let restSenior = teamsSenioren;
    for (let b = 0; b < blokkenNodig && restSenior > 0; b++) {
      const dag = seniorTrainingsdagen[b % seniorTrainingsdagen.length];
      const teamsDitBlok = Math.min(teamsPerBlok, restSenior);
      restSenior -= teamsDitBlok;
      schema.push({ id: nextId(), dag, startTijd: '19:30', eindTijd: '21:00',
        aantalTeamsOnder13: 0, aantalTeamsVanaf13: teamsDitBlok, type: 'training' });
    }
    // Senioren-wedstrijd: ~50% thuis op zondag
    const thuisWedstrijden = Math.max(1, Math.ceil(teamsSenioren / 2));
    schema.push({ id: nextId(), dag: 'zondag', startTijd: '11:00', eindTijd: '16:00',
      aantalTeamsOnder13: 0, aantalTeamsVanaf13: thuisWedstrijden, type: 'wedstrijd' });
  }

  return schema;
}

/**
 * RACKETSPORT — tennis, padel, badminton, squash.
 *
 * Een tennisclub heeft een FYSIEK aantal banen (geen 'jeugd-banen' en
 * 'senior-banen' — dezelfde banen worden door iedereen gebruikt op verschillende
 * tijden). We berekenen daarom:
 *   1. Aantal banen op het complex (uit totaal-leden / leden-per-baan)
 *   2. Piek-bezetting (60-80% van banen tegelijk bezet)
 *   3. Mix single/dubbel per moment
 *
 * Per sport: aantal leden per baan op het complex (vuistregels uit branche):
 *   Tennis:    ~25 leden per baan      (200 leden → 8 banen)
 *   Padel:     ~30 leden per baan      (200 leden → ~7 banen, vrijwel alleen dubbel)
 *   Badminton: ~20 leden per baan
 *   Squash:    ~35 leden per baan
 *
 * Validatie 200-leden tennisclub:
 *   8 banen, 60% bezet = 5 banen op piek-avond
 *   Single/dubbel-mix: 30% single = 2 single + 3 dubbel
 *   Doordeweeks avonden (4): (2×2 + 3×4) × 5% = 0.8 d/avond × 4 = 3 d
 *   Wo jeugdles: 2 dubbel-banen × 4 × 5% = 0.4 d
 *   Za competitie: idem als avond × 8% = 1.3 d
 *   Zo competitie: 1.3 d
 *   TOTAAL: ~6 douches per week. Verwaarloosbaar — exact wat Bart bevestigt.
 */
function weekRacketsport(
  mkId: (i: number) => string,
  ledenJeugd: number,
  ledenSenior: number,
  typeVereniging: string,
): TrainingsSchema {
  const ledenTotaal = ledenJeugd + ledenSenior;
  if (ledenTotaal === 0) return [];

  // Stap 1: fysiek aantal banen op het complex
  const tv = typeVereniging.toLowerCase();
  const ledenPerBaan = tv === 'padel' ? 30 : tv === 'badminton' ? 20 : tv === 'squash' ? 35 : 25;
  const banenTotaal = Math.max(2, Math.round(ledenTotaal / ledenPerBaan));

  // Stap 2: piek-bezetting (60% van banen op piekavond)
  const banenBezetPiek = Math.max(1, Math.round(banenTotaal * 0.6));

  // Stap 3: mix single/dubbel — padel bijna alleen dubbel, squash altijd 2-spelers
  let singleBanen: number, dubbelBanen: number;
  if (tv === 'padel') {
    singleBanen = 0;
    dubbelBanen = banenBezetPiek;
  } else if (tv === 'squash') {
    // Squash kent geen "single vs dubbel" — altijd 2 spelers per baan.
    // We gebruiken groep1=recreatief en groep2=competitie. Default 70/30 split.
    singleBanen = Math.max(1, Math.round(banenBezetPiek * 0.7));
    dubbelBanen = banenBezetPiek - singleBanen;
  } else {
    // Tennis/badminton: 30% single, 70% dubbel
    singleBanen = Math.max(0, Math.round(banenBezetPiek * 0.3));
    dubbelBanen = banenBezetPiek - singleBanen;
  }

  // Stap 4: jeugd-les bezetting (woensdagmiddag — alle banen 4-kinderen-groepen)
  const jeugdLesBanen = ledenJeugd > 0
    ? Math.max(1, Math.round(banenTotaal * 0.4))   // ~40% van banen voor les
    : 0;

  const schema: TrainingsSchema = [];

  // Doordeweekse avonden: ma/di/do/vr — woensdag voor jeugd
  for (const [i, dag] of (['maandag', 'dinsdag', 'donderdag', 'vrijdag'] as const).entries()) {
    schema.push({
      id: mkId(10 + i), dag,
      startTijd: '19:00', eindTijd: '22:00',
      aantalTeamsOnder13: singleBanen,    // groep 1 = single banen
      aantalTeamsVanaf13: dubbelBanen,    // groep 2 = dubbel banen
      type: 'training',
    });
  }

  // Woensdagmiddag jeugd-les
  if (jeugdLesBanen > 0) {
    schema.push({
      id: mkId(20), dag: 'woensdag', startTijd: '14:00', eindTijd: '17:00',
      aantalTeamsOnder13: 0,
      aantalTeamsVanaf13: jeugdLesBanen,    // groep 2 = dubbel (4 kinderen per baan)
      type: 'training',
    });
  }

  // Weekend competitie (zelfde mix als avond, maar als 'wedstrijd' getypeerd)
  schema.push({
    id: mkId(21), dag: 'zaterdag', startTijd: '10:00', eindTijd: '16:00',
    aantalTeamsOnder13: singleBanen,
    aantalTeamsVanaf13: dubbelBanen,
    type: 'wedstrijd',
  });
  schema.push({
    id: mkId(22), dag: 'zondag', startTijd: '10:00', eindTijd: '15:00',
    aantalTeamsOnder13: singleBanen,
    aantalTeamsVanaf13: dubbelBanen,
    type: 'wedstrijd',
  });

  return schema;
}

/**
 * INDIVIDUEEL (atletiek) — vul direct het aantal sporters per moment in.
 *
 * Validatie 200-leden atletiekclub, 30% jeugd:
 *   60 jeugd / 7 = 8 op piekuur (wo middag les)
 *   140 senior / 10 = 14 op piekuur (di + do + za)
 *   Wo jeugd: 8 × 20% = 1.6 d
 *   Di/Do: 14 × 40% = 5.6 d → 11 d
 *   Za senior: 14 × 40% = 5.6 d
 *   Za jeugd: 8 × 20% = 1.6 d
 *   TOTAAL: ~20 douches/week — lager dan ik eerder dacht maar realistisch
 *   (intensievere clubs schalen hoger op)
 */
function weekIndividueel(mkId: (i: number) => string, sportersJeugd: number, sportersSenior: number): TrainingsSchema {
  const schema: TrainingsSchema = [];
  if (sportersJeugd > 0) {
    schema.push({ id: mkId(1), dag: 'woensdag', startTijd: '15:00', eindTijd: '16:30',
      aantalTeamsOnder13: sportersJeugd, aantalTeamsVanaf13: 0, type: 'training' });
    schema.push({ id: mkId(2), dag: 'zaterdag', startTijd: '09:30', eindTijd: '11:00',
      aantalTeamsOnder13: sportersJeugd, aantalTeamsVanaf13: 0, type: 'training' });
  }
  if (sportersSenior > 0) {
    for (const [i, dag] of (['dinsdag', 'donderdag'] as const).entries()) {
      schema.push({ id: mkId(3 + i), dag, startTijd: '19:00', eindTijd: '20:30',
        aantalTeamsOnder13: 0, aantalTeamsVanaf13: sportersSenior, type: 'training' });
    }
    schema.push({ id: mkId(5), dag: 'zaterdag', startTijd: '10:00', eindTijd: '12:00',
      aantalTeamsOnder13: 0, aantalTeamsVanaf13: sportersSenior, type: 'training' });
  }
  return schema;
}

/**
 * BAANSPORT (zwemmen) — alle douches 100%.
 *
 * Validatie 200-leden zwemclub, 30% jeugd:
 *   60 jeugd / 6 = 10 jeugd-banen-momenten → 3 ochtenden × ~3-4 banen
 *   140 senior / 8 = 17 senior-banen-momenten → 3 avonden × ~5-6 banen
 *   Wo jeugd: 4 × 6 × 100% = 24 d  → 3 dagen = 72 douches
 *   Senior avonden: 6 × 6 × 100% = 36 d → 3 dagen = 108 douches
 *   TOTAAL: ~180 douches/week — minder dan eerder maar correcter
 */
function weekBaansport(mkId: (i: number) => string, banenJeugd: number, banenSenior: number): TrainingsSchema {
  const schema: TrainingsSchema = [];
  // Jeugd-lessen verdeeld over 3 dagen
  const jeugdPerDag = Math.max(0, Math.ceil(banenJeugd / 3));
  if (jeugdPerDag > 0) {
    for (const [i, dag] of (['maandag', 'woensdag', 'zaterdag'] as const).entries()) {
      schema.push({
        id: mkId(i + 1), dag,
        startTijd: dag === 'zaterdag' ? '09:00' : '16:00',
        eindTijd: dag === 'zaterdag' ? '12:00' : '18:00',
        aantalTeamsOnder13: jeugdPerDag, aantalTeamsVanaf13: 0, type: 'training',
      });
    }
  }
  // Senior verdeeld over 3 avonden
  const seniorPerDag = Math.max(0, Math.ceil(banenSenior / 3));
  if (seniorPerDag > 0) {
    for (const [i, dag] of (['maandag', 'woensdag', 'vrijdag'] as const).entries()) {
      schema.push({ id: mkId(10 + i), dag, startTijd: '20:00', eindTijd: '21:30',
        aantalTeamsOnder13: 0, aantalTeamsVanaf13: seniorPerDag, type: 'training' });
    }
  }
  return schema;
}

export function TrainingsSchemaInvoer({ schema, onChange, typeVereniging, aantalVelden }: Props) {
  const [valsspeelOpen, setValsspeelOpen] = useState(false);
  const [vsAantalLeden, setVsAantalLeden] = useState<number>(150);
  const [vsPctJeugd, setVsPctJeugd] = useState<number>(40);
  const [vsAantalVelden, setVsAantalVelden] = useState<number>(aantalVelden && aantalVelden > 0 ? aantalVelden : 2);
  const [vsVeldenHandmatig, setVsVeldenHandmatig] = useState(false);
  const [vsWaarschuwing, setVsWaarschuwing] = useState<string | null>(null);

  // Volg het aantal velden/banen uit stap 1 zolang de gebruiker het hier niet
  // zelf heeft aangepast. Zo is het overal automatisch ingevuld vanuit stap 1.
  useEffect(() => {
    if (!vsVeldenHandmatig && aantalVelden && aantalVelden > 0) {
      setVsAantalVelden(aantalVelden);
    }
  }, [aantalVelden, vsVeldenHandmatig]);

  // === Sportlink-koppeling — alleen zichtbaar bij voetbal ===
  // Stap 1: popup opent → clubs laden → gebruiker kiest een club
  // Stap 2: wedstrijden ophalen voor de gekozen club → drukste weekend tonen
  const [slPopupOpen, setSlPopupOpen] = useState(false);
  const [slClubs, setSlClubs] = useState<SportlinkClub[]>([]);
  const [slClubsBezig, setSlClubsBezig] = useState(false);
  const [slClubsFout, setSlClubsFout] = useState<string | null>(null);
  const [slZoekterm, setSlZoekterm] = useState('');
  const [slGekozenClub, setSlGekozenClub] = useState<SportlinkClub | null>(null);
  const [slBezig, setSlBezig] = useState(false);
  const [slFout, setSlFout] = useState<string | null>(null);
  const [slWeekend, setSlWeekend] = useState<DruksteWeekend | null>(null);

  /** Open de popup en laad clubs (eenmalig). */
  async function slOpenPopup() {
    setSlPopupOpen(true);
    setSlWeekend(null);
    setSlFout(null);
    setSlGekozenClub(null);
    if (slClubs.length > 0) return;
    setSlClubsBezig(true);
    setSlClubsFout(null);
    try {
      setSlClubs(await haalClubsOp());
    } catch (e) {
      setSlClubsFout(e instanceof Error ? e.message : 'Fout bij ophalen clubs.');
    } finally {
      setSlClubsBezig(false);
    }
  }

  /** Haal wedstrijden op voor de gekozen club. */
  async function sportlinkOphalen() {
    if (!slGekozenClub) return;
    setSlBezig(true);
    setSlFout(null);
    setSlWeekend(null);
    try {
      const wedstrijden = await haalThuisProgramma(slGekozenClub.id);
      if (!wedstrijden.length) {
        setSlFout(`Geen thuiswedstrijden gevonden voor ${slGekozenClub.naam}.`);
        return;
      }
      const weekend = vindDruksteWeekend(wedstrijden);
      setSlWeekend(weekend);
      if (!weekend) setSlFout('Kon geen drukste weekend bepalen.');
    } catch (e) {
      setSlFout(e instanceof Error ? e.message : 'Onbekende fout bij ophalen.');
    } finally {
      setSlBezig(false);
    }
  }

  function sportlinkWeekendToevoegen() {
    if (!slWeekend) return;
    const config = getSportConfig(typeVereniging);
    const teamgrootte = Math.max(1, Math.round(config.personenPerEenheid2));
    const rijen = weekendNaarUurRijen(slWeekend, teamgrootte);
    const nieuw: TrainingsSchema = rijen.map((r, i) => ({
      id: `sl-${Date.now()}-${i}-${Math.floor(Math.random() * 1000)}`,
      dag: r.dag,
      startTijd: `${String(r.uur).padStart(2, '0')}:00`,
      eindTijd: `${String(Math.min(23, r.uur + 1)).padStart(2, '0')}:00`,
      aantalTeamsOnder13: 0,
      aantalTeamsVanaf13: 0,
      aantalPersonen: r.personen,
      type: 'wedstrijd' as const,
    }));
    onChange([...schema, ...nieuw]);
    setSlPopupOpen(false);
    setSlWeekend(null);
    setSlGekozenClub(null);
  }

  function valsspeelToepassen() {
    const tv = typeVereniging || 'voetbal';
    const { schema: nieuwSchema, waarschuwing } = genereerStandaardSchema(tv, vsAantalLeden, vsPctJeugd, vsAantalVelden);
    if (schema.length > 0) {
      if (!confirm('Het huidige schema wordt overschreven met een standaard schema. Doorgaan?')) return;
    }
    onChange(nieuwSchema);
    setVsWaarschuwing(waarschuwing ?? null);
    setValsspeelOpen(false);
  }

  function addMomentOpDag(dag: TrainingMoment['dag']) {
    const nieuw: TrainingMoment = {
      id: 'm-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      dag,
      startTijd: '19:00',
      eindTijd: '21:00',
      aantalTeamsOnder13: 0,
      aantalTeamsVanaf13: 1,
      type: 'training',
    };
    onChange([...schema, nieuw]);
  }

  /** Voeg een UUR-RIJ toe (mode A): 1 uur, direct aantal spelers. Pakt het uur
   *  na de laatste bestaande uur-rij op die dag, anders 17:00. */
  function addUurRijOpDag(dag: TrainingMoment['dag']) {
    const uurRijen = schema
      .filter(m => m.dag === dag && isUurRij(m))
      .map(m => Math.floor(parseTime(m.startTijd)));
    let uur = uurRijen.length ? Math.min(22, Math.max(...uurRijen) + 1) : 17;
    const hh = String(uur).padStart(2, '0');
    const hhEind = String(Math.min(23, uur + 1)).padStart(2, '0');
    const nieuw: TrainingMoment = {
      id: 'm-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      dag,
      startTijd: `${hh}:00`,
      eindTijd: `${hhEind}:00`,
      aantalTeamsOnder13: 0,
      aantalTeamsVanaf13: 0,
      aantalPersonen: 0,
      type: 'training',
    };
    onChange([...schema, nieuw]);
  }

  /** Wijzig het uur van een uur-rij; eindtijd schuift automatisch mee (+1 uur). */
  function updateUurRijUur(id: string, startTijd: string) {
    const u = Math.floor(parseTime(startTijd));
    const eind = String(Math.min(23, u + 1)).padStart(2, '0') + ':00';
    onChange(schema.map(m => m.id === id ? { ...m, startTijd, eindTijd: eind } : m));
  }

  function updateMoment(id: string, patch: Partial<TrainingMoment>) {
    onChange(schema.map(m => m.id === id ? { ...m, ...patch } : m));
  }

  function removeMoment(id: string) {
    onChange(schema.filter(m => m.id !== id));
  }

  function dupliceer(m: TrainingMoment) {
    // Maak een kopie en plaats op de VOLGENDE dag (handig voor herhalende schema's)
    const huidigeIdx = DAGEN.indexOf(m.dag);
    const volgendeDag = DAGEN[(huidigeIdx + 1) % 7];
    const kopie: TrainingMoment = {
      ...m,
      id: 'm-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      dag: volgendeDag,
    };
    onChange([...schema, kopie]);
  }

  // Groepeer per dag, sorteer per dag op starttijd
  const perDag = DAGEN.reduce((acc, dag) => {
    acc[dag] = schema
      .filter(m => m.dag === dag)
      .sort((a, b) => a.startTijd.localeCompare(b.startTijd));
    return acc;
  }, {} as Record<TrainingMoment['dag'], TrainingMoment[]>);

  const totaal = analyseSchema(schema, typeVereniging);
  const config = getSportConfig(typeVereniging);
  const termen = eenheidTermen(config.categorie);
  const geldigType = isGeldigSporttype(typeVereniging);

  return (
    <div className="space-y-3">
      {/* Waarschuwing als geen geldig sporttype gekozen — anders valt alles stil terug
          op voetbal-default (15 sp/team), wat fout is voor bv. tennis. */}
      {!geldigType && (
        <div className="bg-amber-100 border border-amber-300 rounded-lg p-3 text-sm text-amber-900">
          <strong>⚠️ Kies eerst een sporttype</strong> bij "Type vereniging" hierboven.
          Zonder sporttype rekent het model met voetbal-aannames (teams van 15 spelers),
          wat niet klopt voor bijvoorbeeld tennis (banen) of atletiek (individuele sporters).
        </div>
      )}
      <p className="text-sm text-gray-600">
        Vul per dag <strong>{termen.invulInstructie}</strong> in.
        Het systeem rekent zelf met douche-percentage en water-verbruik per sport.
        <InfoTooltip>
          <div className="space-y-1 text-xs">
            <p><strong>{config.labelGroep1}</strong>: {config.personenPerEenheid1} {config.categorie === 'individueel' ? 'persoon' : 'personen'} per {termen.enkelvoud}. Doucht {Math.round(config.douchePct.groep1.training * 100)}% bij training, {Math.round(config.douchePct.groep1.wedstrijd * 100)}% bij wedstrijd.</p>
            <p><strong>{config.labelGroep2}</strong>: {config.personenPerEenheid2} personen per {termen.enkelvoud}. Doucht {Math.round(config.douchePct.groep2.training * 100)}% bij training, {Math.round(config.douchePct.groep2.wedstrijd * 100)}% bij wedstrijd.</p>
            <p><strong>Sociale momenten</strong>: niemand doucht (alleen kantine).</p>
            <p>Per douche-beurt: 35 liter warm water (37°C).</p>
            <p className="italic mt-1 text-gray-600">{config.uitleg}</p>
          </div>
        </InfoTooltip>
      </p>

      {/* === AI schema-import: bestand/foto/Excel/link → trainingsmomenten === */}
      <p className="text-xs text-gray-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-2">
        💡 <strong>Let op bij importeren:</strong> een club heeft vaak een apart <em>trainingsschema</em> en <em>wedstrijdschema</em>.
        Importeer ze allebei (met "toevoegen", niet "vervangen") zodat zowel de doordeweekse trainingen als de
        weekendwedstrijden in de douche-/waterberekening meetellen.
      </p>
      <SchemaImportPaneel
        sportCategorie={config.categorie}
        labelGroep1={config.labelGroep1}
        labelGroep2={config.labelGroep2}
        onToepassen={(momenten: GeimporteerdMoment[], modus: 'vervang' | 'toevoegen') => {
          // Zet geimporteerde momenten om naar TrainingMoment (met id's)
          const nieuw: TrainingsSchema = momenten.map((m, i) => ({
            id: `m-${Date.now()}-${i}-${Math.floor(Math.random() * 1000)}`,
            dag: m.dag,
            startTijd: m.startTijd,
            eindTijd: m.eindTijd,
            aantalTeamsOnder13: m.aantalTeamsOnder13,
            aantalTeamsVanaf13: m.aantalTeamsVanaf13,
            type: m.type,
          }));
          onChange(modus === 'vervang' ? nieuw : [...schema, ...nieuw]);
        }}
      />

      {/* === Sportlink-koppeling: alleen zichtbaar bij voetbal === */}
      {typeVereniging?.toLowerCase() === 'voetbal' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={slOpenPopup}
            className="w-full px-3 py-2 flex items-center justify-between text-sm hover:bg-blue-100/50 text-left"
          >
            <span className="text-blue-900">
              <span className="text-base">📅</span> Wedstrijden ophalen via Sportlink (drukste weekend)
            </span>
            <span className="text-xs text-blue-700">kies club ›</span>
          </button>
        </div>
      )}

      {/* === Sportlink club-keuzepopup (modal) === */}
      {slPopupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 flex flex-col max-h-[80vh]">

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <p className="text-sm font-semibold text-gray-900">📅 Kies een voetbalclub</p>
              <button
                type="button"
                onClick={() => { setSlPopupOpen(false); setSlWeekend(null); setSlFout(null); setSlGekozenClub(null); }}
                className="text-gray-400 hover:text-gray-700 text-lg leading-none px-1"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              {slClubsBezig && (
                <p className="text-xs text-gray-500 text-center py-6">Clubs laden…</p>
              )}
              {slClubsFout && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">{slClubsFout}</p>
              )}
              {!slClubsBezig && slClubs.length > 0 && (
                <>
                  <input
                    type="text"
                    placeholder="Zoek op clubnaam…"
                    value={slZoekterm}
                    onChange={e => setSlZoekterm(e.target.value)}
                    className="input py-1.5 text-sm w-full"
                    autoFocus
                  />
                  <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg max-h-52 overflow-y-auto text-sm">
                    {slClubs
                      .filter(c => c.naam.toLowerCase().includes(slZoekterm.toLowerCase()))
                      .map(c => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => { setSlGekozenClub(c); setSlWeekend(null); setSlFout(null); }}
                            className={`w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors ${
                              slGekozenClub?.id === c.id ? 'bg-blue-100 font-semibold text-blue-900' : 'text-gray-800'
                            }`}
                          >
                            {c.naam}
                          </button>
                        </li>
                      ))}
                    {slClubs.filter(c => c.naam.toLowerCase().includes(slZoekterm.toLowerCase())).length === 0 && (
                      <li className="px-3 py-2 text-xs text-gray-400 italic">Geen clubs gevonden voor "{slZoekterm}"</li>
                    )}
                  </ul>
                </>
              )}
              {slFout && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">{slFout}</p>
              )}
              {slWeekend && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1.5">
                  <p className="text-sm text-gray-800">
                    Drukste weekend: <strong>{slWeekend.label}</strong> — {slWeekend.aantal} thuiswedstrijd{slWeekend.aantal === 1 ? '' : 'en'}.
                  </p>
                  <p className="text-xs text-gray-500">
                    Wordt toegevoegd als wedstrijd-uur-rijen (≈ {Math.max(1, Math.round(getSportConfig(typeVereniging).personenPerEenheid2))} spelers per wedstrijd, douche ~2u na aanvang). Je kunt elk uur daarna nog bijstellen.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs text-gray-500 flex-1">
                {slGekozenClub ? <>Gekozen: <strong>{slGekozenClub.naam}</strong></> : 'Kies een club uit de lijst'}
              </span>
              {!slWeekend ? (
                <button
                  type="button"
                  onClick={sportlinkOphalen}
                  disabled={slBezig || !slGekozenClub}
                  className="text-sm px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
                >
                  {slBezig ? 'Ophalen…' : 'Wedstrijden ophalen'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={sportlinkWeekendToevoegen}
                  className="text-sm px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  + Voeg toe aan schema
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* === Valsspeel-knop: standaard schema op basis van clubgrootte === */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg overflow-hidden">
        {!valsspeelOpen ? (
          <button
            type="button"
            onClick={() => setValsspeelOpen(true)}
            className="w-full px-3 py-2 flex items-center justify-between text-sm hover:bg-amber-100/50 text-left"
          >
            <span className="text-amber-900">
              <span className="text-base">🎲</span> Vul standaard schema in op basis van clubgrootte
            </span>
            <span className="text-xs text-amber-700">Tijdwinst — gebaseerd op NL-gemiddelden</span>
          </button>
        ) : (
          <div className="p-3 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-sm font-semibold text-amber-900">🎲 Standaard schema genereren</h4>
                <p className="text-xs text-amber-800 mt-0.5">
                  Op basis van clubtype{typeVereniging ? <> (<strong>{typeVereniging}</strong>)</> : ' (default: voetbal)'},
                  aantal leden en %-jeugd vullen we een passend NL-sportclub-schema in.
                  Pas daarna alles aan waar nodig.
                </p>
                <p className="text-[11px] text-amber-700 mt-1 italic">
                  💡 Voor <strong>{typeVereniging ?? 'voetbal'}</strong>: {config.uitleg}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setValsspeelOpen(false)}
                className="text-xs text-amber-700 hover:text-amber-900 px-1.5 py-0.5"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="text-xs">
                <span className="block text-gray-700 mb-1">Aantal spelende leden</span>
                <input
                  type="number"
                  min={1}
                  value={vsAantalLeden}
                  onChange={e => setVsAantalLeden(Math.max(1, Number(e.target.value) || 0))}
                  className="input py-1 text-sm w-full"
                />
                <span className="block text-[10px] text-gray-500 mt-0.5">
                  Alleen actieve leden die ook trainen/spelen (excl. steunende leden)
                </span>
              </label>
              <label className="text-xs">
                <span className="block text-gray-700 mb-1">Aandeel jeugd: <strong>{vsPctJeugd}%</strong></span>
                <input
                  type="range"
                  min={0} max={100} step={5}
                  value={vsPctJeugd}
                  onChange={e => setVsPctJeugd(Number(e.target.value))}
                  className="w-full"
                />
                <span className="block text-[10px] text-gray-500 mt-0.5">
                  NL-gemiddelde voetbal/hockey ≈ 40-50% jeugd
                </span>
              </label>
              <label className="text-xs">
                <span className="block text-gray-700 mb-1">
                  Aantal velden / banen
                  {aantalVelden && aantalVelden > 0 && !vsVeldenHandmatig && (
                    <span className="text-primary-600"> (uit stap 1)</span>
                  )}
                </span>
                <input
                  type="number"
                  min={1}
                  value={vsAantalVelden}
                  onChange={e => { setVsVeldenHandmatig(true); setVsAantalVelden(Math.max(1, Number(e.target.value) || 0)); }}
                  className="input py-1 text-sm w-full"
                />
                <span className="block text-[10px] text-gray-500 mt-0.5">
                  {aantalVelden && aantalVelden > 0
                    ? 'Automatisch uit stap 1 — pas aan om te overschrijven'
                    : 'Begrenst het aantal spelers tegelijk per uur — niet meer dan op de velden past'}
                </span>
              </label>
            </div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[11px] text-amber-800">
                💡 Bestaande momenten worden overschreven (na bevestiging)
              </span>
              <button
                type="button"
                onClick={valsspeelToepassen}
                className="text-sm bg-accent-orange text-white px-3 py-1.5 rounded hover:bg-accent-orange/90"
              >
                Vul in →
              </button>
            </div>
          </div>
        )}
      </div>

      {vsWaarschuwing && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-md p-3 text-xs text-yellow-900 flex items-start gap-2">
          <span>⚠️</span>
          <div className="flex-1">
            {vsWaarschuwing}
            <button onClick={() => setVsWaarschuwing(null)} className="ml-2 underline">sluiten</button>
          </div>
        </div>
      )}

      {/* Week-overzicht: per dag een sectie, altijd zichtbaar in vaste volgorde */}
      <div className="space-y-2">
        {DAGEN.map(dag => {
          const momenten = perDag[dag];
          const isWeekend = dag === 'zaterdag' || dag === 'zondag';
          return (
            <div key={dag} className={`border rounded-lg ${isWeekend ? 'border-primary-200 bg-primary-50/30' : 'border-gray-200 bg-white'}`}>
              {/* Dag-header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                <h4 className={`text-sm font-semibold ${isWeekend ? 'text-primary-900' : 'text-gray-800'}`}>
                  {DAG_LABELS[dag]}
                  {momenten.length === 0 && (
                    <span className="ml-2 text-xs font-normal text-gray-400">— geen activiteiten</span>
                  )}
                  {momenten.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-gray-500">
                      ({momenten.length} {momenten.length === 1 ? 'moment' : 'momenten'})
                    </span>
                  )}
                </h4>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => addUurRijOpDag(dag)}
                    className="text-xs text-accent-orange hover:bg-accent-orange/10 px-2 py-1 rounded font-medium"
                    title={`Voeg een uur-rij toe op ${DAG_LABELS[dag]} (aantal spelers per uur)`}
                  >
                    ⏱️ Per uur
                  </button>
                  <button
                    type="button"
                    onClick={() => addMomentOpDag(dag)}
                    className="text-xs text-primary-700 hover:bg-primary-100 px-2 py-1 rounded font-medium"
                    title={`Voeg een blok-activiteit toe op ${DAG_LABELS[dag]}`}
                  >
                    + Blok
                  </button>
                </div>
              </div>

              {/* Momenten op deze dag */}
              {momenten.length > 0 && (
                <div className="divide-y divide-gray-100">
                  {momenten.map(m => {
                    const pctO13 = Math.round(douchePercentage('onder13', m.type, m.dag, typeVereniging) * 100);
                    const pctV13 = Math.round(douchePercentage('vanaf13', m.type, m.dag, typeVereniging) * 100);
                    const typeInfo = TYPE_INFO[m.type];

                    // === MODE A: compacte uur-rij ===
                    if (isUurRij(m)) {
                      const pctBlend = Math.round(gemiddeldeBereidheid(m.type, m.dag, typeVereniging) * CULTUUR_FACTOR * 100);
                      const douches = Math.round(doucheBeurtenVanMoment(m, typeVereniging));
                      const uurNum = Math.floor(parseTime(m.startTijd));
                      return (
                        <div key={m.id} className="px-3 py-2 flex items-center gap-2 flex-wrap hover:bg-accent-orange/5 bg-accent-orange/[0.02]">
                          <span className="text-[10px] uppercase tracking-wide text-accent-orange font-bold bg-accent-orange/10 px-1.5 py-0.5 rounded shrink-0">⏱️ uur</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${typeInfo.kleur} font-medium inline-flex items-center gap-1`}>
                            <span>{typeInfo.icoon}</span>
                            <select
                              className="bg-transparent border-0 outline-none p-0 text-xs font-medium cursor-pointer"
                              value={m.type}
                              onChange={e => updateMoment(m.id, { type: e.target.value as TrainingMoment['type'] })}
                            >
                              <option value="training">Training</option>
                              <option value="wedstrijd">Wedstrijd</option>
                              <option value="sociaal">Sociaal</option>
                            </select>
                          </span>
                          <select
                            className="input py-1 text-xs w-24"
                            value={m.startTijd}
                            onChange={e => updateUurRijUur(m.id, e.target.value)}
                            title="Uur van de dag"
                          >
                            {Array.from({ length: 24 }, (_, h) => {
                              const hh = String(h).padStart(2, '0');
                              return <option key={h} value={`${hh}:00`}>{hh}:00–{String((h + 1) % 24).padStart(2, '0')}:00</option>;
                            })}
                          </select>
                          {m.type !== 'sociaal' ? (
                            <label className="flex items-center gap-1.5 text-xs text-gray-700">
                              <input
                                type="number"
                                min={0}
                                className="input py-1 text-sm w-20"
                                value={m.aantalPersonen ?? 0}
                                onChange={e => updateMoment(m.id, { aantalPersonen: Number(e.target.value) || 0 })}
                                placeholder="0"
                              />
                              <span className="whitespace-nowrap">spelers</span>
                            </label>
                          ) : (
                            <span className="text-xs text-gray-500 italic">geen douche-vraag</span>
                          )}
                          {m.type !== 'sociaal' && (
                            <span className="text-[11px] text-gray-400 whitespace-nowrap">
                              ≈ {pctBlend}% doucht → {douches} douche{douches === 1 ? '' : 's'} om {uurNum}:00
                            </span>
                          )}
                          <div className="flex-1" />
                          <button
                            type="button"
                            onClick={() => removeMoment(m.id)}
                            className="text-xs text-red-600 hover:text-red-800 px-1.5 py-0.5"
                            title="Verwijder uur-rij"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    }

                    // === Klassiek blok ===
                    return (
                      <div key={m.id} className="px-3 py-2.5 space-y-2 hover:bg-gray-50/50">
                        {/* Bovenste rij: type-badge, tijd, prullenbak */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${typeInfo.kleur} font-medium inline-flex items-center gap-1`}>
                            <span>{typeInfo.icoon}</span>
                            <select
                              className="bg-transparent border-0 outline-none p-0 text-xs font-medium cursor-pointer"
                              value={m.type}
                              onChange={e => updateMoment(m.id, { type: e.target.value as TrainingMoment['type'] })}
                            >
                              <option value="training">Training</option>
                              <option value="wedstrijd">Wedstrijd</option>
                              <option value="sociaal">Sociaal</option>
                            </select>
                          </span>
                          <input
                            type="time"
                            className="input py-1 text-xs w-24"
                            value={m.startTijd}
                            onChange={e => updateMoment(m.id, { startTijd: e.target.value })}
                          />
                          <span className="text-gray-400 text-xs">—</span>
                          <input
                            type="time"
                            className="input py-1 text-xs w-24"
                            value={m.eindTijd}
                            onChange={e => updateMoment(m.id, { eindTijd: e.target.value })}
                          />
                          <div className="flex-1" />
                          <button
                            type="button"
                            onClick={() => dupliceer(m)}
                            className="text-xs text-gray-500 hover:text-primary-700 px-2 py-0.5"
                            title={`Kopieer naar ${DAG_LABELS[DAGEN[(DAGEN.indexOf(m.dag) + 1) % 7]]}`}
                          >
                            ⎘ Kopieer
                          </button>
                          <button
                            type="button"
                            onClick={() => removeMoment(m.id)}
                            className="text-xs text-red-600 hover:text-red-800 px-1.5 py-0.5"
                            title="Verwijder"
                          >
                            ✕
                          </button>
                        </div>
                        {/* Onderste rij: teams (alleen tonen als niet 'sociaal' want dan niemand doucht) */}
                        {m.type !== 'sociaal' ? (
                          <div className="grid grid-cols-2 gap-2 pl-1">
                            <label className="flex items-center gap-2 text-xs text-gray-700">
                              <span className="min-w-0 flex-1">
                                {config.labelGroep1}
                                <span className="block text-gray-400">{pctO13}% doucht{termen.perEenheidAfkorting ? ` · ${config.personenPerEenheid1} ${termen.perEenheidAfkorting}` : ` · ${config.personenPerEenheid1} p`}</span>
                              </span>
                              <input
                                type="number"
                                min={0}
                                className="input py-1 text-sm w-16"
                                value={m.aantalTeamsOnder13}
                                onChange={e => updateMoment(m.id, { aantalTeamsOnder13: Number(e.target.value) || 0 })}
                              />
                            </label>
                            <label className="flex items-center gap-2 text-xs text-gray-700">
                              <span className="min-w-0 flex-1">
                                {config.labelGroep2}
                                <span className="block text-gray-400">{pctV13}% doucht{termen.perEenheidAfkorting ? ` · ${config.personenPerEenheid2} ${termen.perEenheidAfkorting}` : ` · ${config.personenPerEenheid2} p`}</span>
                              </span>
                              <input
                                type="number"
                                min={0}
                                className="input py-1 text-sm w-16"
                                value={m.aantalTeamsVanaf13}
                                onChange={e => updateMoment(m.id, { aantalTeamsVanaf13: Number(e.target.value) || 0 })}
                              />
                            </label>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500 italic pl-1">Geen douche-vraag voor sociale momenten</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Live totalen */}
      {totaal.totaalDoucheBeurtenPerWeek > 0 && (
        <div className="bg-primary-50/60 border border-primary-200 rounded-md p-3 text-xs text-primary-900 mt-3">
          <strong>Per week totaal:</strong> {totaal.totaalDoucheBeurtenPerWeek} douche-beurten ·
          {' '}{Math.round(totaal.totaalLitersPerWeek).toLocaleString('nl-NL')} liter warm water ·
          {' '}{totaal.urenPerWeek} uur gebruik
        </div>
      )}

      {/* Snel-acties als helemaal leeg */}
      {schema.length === 0 && (
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-md p-3 text-xs text-gray-600">
          <strong>Snel beginnen?</strong> Klik bij een dag op <em>+ Blok</em> (een trainings-/wedstrijdblok met teams)
          of op <em>⏱️ Per uur</em> (vul direct het aantal spelers per uur in — handig voor een precieze douche-spreiding).
          De meeste sportclubs hebben training op dinsdag, woensdag en donderdag, en wedstrijden op zaterdag.
        </div>
      )}
    </div>
  );
}

/**
 * Analyseer schema → totalen per week.
 *
 * v29: nu sport-bewust. Geef `typeVereniging` mee voor correcte personen-per-eenheid
 * en douche-percentages. Backwards compatible — zonder argument is voetbal-default.
 */
export function analyseSchema(schema: TrainingsSchema, typeVereniging?: string): {
  urenPerWeek: number;
  doucheBeurtenJeugdPerWeek: number;
  doucheBeurtenSeniorenPerWeek: number;
  totaalDoucheBeurtenPerWeek: number;
  totaalLitersPerWeek: number;
  totaalPersonenPerWeek: number;
} {
  const config = getSportConfig(typeVereniging);
  let uren = 0;
  let douchesJeugd = 0;
  let douchesSenioren = 0;
  let douchesGemengd = 0;   // uur-rijen (mode A) — geen leeftijdssplitsing
  let personen = 0;
  for (const m of schema) {
    const start = parseTime(m.startTijd);
    const eind = parseTime(m.eindTijd);
    const duur = Math.max(0, eind - start);
    uren += duur;

    // MODE A — directe uur-invoer
    if (isUurRij(m)) {
      personen += m.aantalPersonen ?? 0;
      douchesGemengd += doucheBeurtenVanMoment(m, typeVereniging);
      continue;
    }

    const spelersGroep1 = (m.aantalTeamsOnder13 ?? 0) * config.personenPerEenheid1;
    const spelersGroep2 = (m.aantalTeamsVanaf13 ?? 0) * config.personenPerEenheid2;
    personen += spelersGroep1 + spelersGroep2;

    // Werkelijke douches = spelers × bereidheids-% × realisme-factor (aanwezigheid × cultuur).
    // De bereidheid komt uit het Excel-model; de realisme-factor brengt het naar de
    // Nederlandse praktijk (niet iedereen is aanwezig, niet iedereen doucht op de club).
    const rf = realismeFactor(m.type);
    douchesJeugd += spelersGroep1 * douchePercentage('onder13', m.type, m.dag, typeVereniging) * rf;
    douchesSenioren += spelersGroep2 * douchePercentage('vanaf13', m.type, m.dag, typeVereniging) * rf;
  }
  const totaalDouches = douchesJeugd + douchesSenioren + douchesGemengd;
  return {
    urenPerWeek: Math.round(uren * 10) / 10,
    doucheBeurtenJeugdPerWeek: Math.round(douchesJeugd),
    doucheBeurtenSeniorenPerWeek: Math.round(douchesSenioren),
    totaalDoucheBeurtenPerWeek: Math.round(totaalDouches),
    totaalLitersPerWeek: Math.round(totaalDouches * LITERS_PER_DOUCHE),
    totaalPersonenPerWeek: personen,
  };
}

function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) + (m ?? 0) / 60;
}

/**
 * Verdeel een hoeveelheid liters over de uur-slots (0-23) binnen een tijdvenster,
 * met een natuurlijke "opbouw → piek → afbouw"-curve (driehoeksverdeling rond het
 * midden van het venster). Dit voorkomt één onrealistische spike en geeft een
 * vloeiend douche-profiel over de avond.
 *
 * @param uren      array van 24 uur-slots (wordt in-place opgehoogd)
 * @param liters    totaal te verdelen liters
 * @param start     vensterbegin in uren (float, bv. 20.5 = 20:30)
 * @param eind      venstereinde in uren (float)
 */
function spreidLitersOverVenster(uren: number[], liters: number, start: number, eind: number): void {
  const s = Math.max(0, start);
  const e = Math.min(24, Math.max(s + 0.25, eind));
  const midden = (s + e) / 2;
  const halveBreedte = (e - s) / 2 || 0.5;

  // Bereken een gewicht per overlappend uur-slot op basis van driehoeks-curve:
  // gewicht is maximaal in het midden van het venster, lineair aflopend naar de randen.
  const gewichten: { uur: number; gewicht: number }[] = [];
  const eersteUur = Math.floor(s);
  const laatsteUur = Math.min(23, Math.ceil(e) - 1);
  for (let u = eersteUur; u <= laatsteUur; u++) {
    // Overlap van uur-slot [u, u+1] met venster [s, e]
    const overlapStart = Math.max(u, s);
    const overlapEind = Math.min(u + 1, e);
    const overlap = Math.max(0, overlapEind - overlapStart);
    if (overlap <= 0) continue;
    // Afstand van slot-midden tot venster-midden → driehoeksgewicht (1 in midden, 0 aan rand)
    const slotMidden = (overlapStart + overlapEind) / 2;
    const driehoek = Math.max(0.15, 1 - Math.abs(slotMidden - midden) / halveBreedte);
    gewichten.push({ uur: u, gewicht: overlap * driehoek });
  }

  const totaalGewicht = gewichten.reduce((a, g) => a + g.gewicht, 0);
  if (totaalGewicht <= 0) {
    // Fallback: alles in het uur van het venster-midden
    const u = Math.max(0, Math.min(23, Math.floor(midden)));
    uren[u] += liters;
    return;
  }
  for (const g of gewichten) {
    uren[g.uur] += liters * (g.gewicht / totaalGewicht);
  }
}

/**
 * Bepaal het tijdvenster waarin de douches van een BLOK-moment vallen.
 * Gedeeld door de piek-grafiek én de "blok → uur-rij"-omzetting, zodat beide
 * exact dezelfde spreiding gebruiken.
 */
function blokDoucheVenster(
  startUur: number,
  eindUur: number,
  config: ReturnType<typeof getSportConfig>,
): { start: number; eind: number } {
  const duur = Math.max(0.5, eindUur - startUur);
  const isRacket = config.categorie === 'racketsport';
  const isIndividueel = config.categorie === 'individueel';
  if (isRacket || isIndividueel) {
    // Racket/individueel: continue in- en uitstroom → gespreid over speelduur + naloop.
    return { start: startUur + duur * 0.4, eind: eindUur + 0.5 };
  }
  if (duur <= 2.0) {
    // Korte teamsport-sessie (≤ 2u): iedereen eindigt ongeveer tegelijk.
    return { start: eindUur - 0.5, eind: eindUur + 1.0 };
  }
  // Lange teamsport-dag (> 2u): gefaseerde uitstroom → brede klok-curve.
  return { start: startUur + duur * 0.25, eind: eindUur + 0.75 };
}

/**
 * Verdeel een totaal over de hele uren binnen een venster, met exact dezelfde
 * driehoeks-weging als spreidLitersOverVenster. Geeft per (heel) uur het aandeel.
 */
function verdeelOverUren(totaal: number, start: number, eind: number): Array<{ uur: number; waarde: number }> {
  const s = Math.max(0, start);
  const e = Math.min(24, Math.max(s + 0.25, eind));
  const midden = (s + e) / 2;
  const halveBreedte = (e - s) / 2 || 0.5;
  const gewichten: { uur: number; gewicht: number }[] = [];
  const eersteUur = Math.floor(s);
  const laatsteUur = Math.min(23, Math.ceil(e) - 1);
  for (let u = eersteUur; u <= laatsteUur; u++) {
    const overlapStart = Math.max(u, s);
    const overlapEind = Math.min(u + 1, e);
    const overlap = Math.max(0, overlapEind - overlapStart);
    if (overlap <= 0) continue;
    const slotMidden = (overlapStart + overlapEind) / 2;
    const driehoek = Math.max(0.15, 1 - Math.abs(slotMidden - midden) / halveBreedte);
    gewichten.push({ uur: u, gewicht: overlap * driehoek });
  }
  const totaalGewicht = gewichten.reduce((a, g) => a + g.gewicht, 0);
  if (totaalGewicht <= 0) {
    return [{ uur: Math.max(0, Math.min(23, Math.floor(midden))), waarde: totaal }];
  }
  return gewichten.map(g => ({ uur: g.uur, waarde: totaal * (g.gewicht / totaalGewicht) }));
}

/**
 * Realistisch maximaal aantal spelers TEGELIJK op één veld/baan, per sport-categorie.
 * Gebruikt om het standaard-schema te begrenzen op de fysieke accommodatie.
 */
function spelersPerVeld(config: ReturnType<typeof getSportConfig>): number {
  switch (config.categorie) {
    case 'teamsport':   return Math.max(10, Math.round(2 * config.personenPerEenheid2)); // ~2 teams per veld
    case 'baansport':   return Math.max(12, Math.round(6 * config.personenPerEenheid2)); // banen ruimer bezet
    case 'racketsport': return Math.max(8, Math.round(4 * config.personenPerEenheid2));
    case 'individueel': return 80;  // atletiekbaan e.d.: ruim, nauwelijks begrenzend
    default:            return 60;
  }
}

/**
 * Begrens het aantal spelers per uur op de veldcapaciteit. Overschot schuift naar
 * een eerder uur (sessies starten dan eerder / draaien in shifts) — het totaal
 * aantal douches blijft gelijk, want elk uur gebruikt dezelfde bereidheid×cultuur.
 */
function capMetOverloop(personenPerUur: Map<number, number>, capaciteit: number): Map<number, number> {
  if (capaciteit <= 0) return personenPerUur; // geen veld-info → niet begrenzen
  const map = new Map(personenPerUur);
  const uren = [...map.keys()];
  let lo = Math.min(...uren);
  let hi = Math.max(...uren);
  for (let pass = 0; pass < 100; pass++) {
    let overschot = false;
    for (let u = hi; u >= lo; u--) {
      const p = map.get(u) ?? 0;
      if (p > capaciteit + 1e-6) {
        overschot = true;
        map.set(u, capaciteit);
        let doel = u - 1;
        if (doel < 0) doel = u + 1; // niet vóór middernacht → schuif later
        map.set(doel, (map.get(doel) ?? 0) + (p - capaciteit));
        if (doel < lo) lo = doel;
        if (doel > hi) hi = doel;
      }
    }
    if (!overschot) break;
  }
  return map;
}

/**
 * Zet één gegenereerd BLOK-moment om naar UUR-RIJEN (mode A).
 *
 * Behoudt exact hetzelfde aantal douche-beurten als het blok, maar maakt de
 * spreiding expliciet: per heel uur in het douche-venster een uur-rij met het
 * aantal aanwezige spelers, terug-gerekend zodat
 *   personen × gemiddelde bereidheid × cultuur = beurten van dat uur.
 * Het aantal spelers per uur wordt daarnaast begrensd op wat er fysiek op de
 * velden/banen past (aantalVelden × spelersPerVeld); overschot schuift naar een
 * eerder uur. Totalen en (waar mogelijk) de curve blijven behouden.
 */
function blokNaarUurRijen(m: TrainingMoment, typeVereniging: string | undefined, aantalVelden?: number): TrainingMoment[] {
  if (isUurRij(m) || m.type === 'sociaal') return [m];
  const beurtenTotaal = doucheBeurtenVanMoment(m, typeVereniging);
  if (beurtenTotaal <= 0) return [m];

  const config = getSportConfig(typeVereniging);
  const startUur = parseTime(m.startTijd);
  const eindUur = parseTime(m.eindTijd);
  const { start, eind } = blokDoucheVenster(startUur, eindUur, config);

  const bereidheidCultuur = gemiddeldeBereidheid(m.type, m.dag, typeVereniging) * CULTUUR_FACTOR;
  if (bereidheidCultuur <= 0) return [m];

  // Spreid de beurten over de uren en reken terug naar (fractionele) personen.
  const verdeling = verdeelOverUren(beurtenTotaal, start, eind);
  const personenMap = new Map<number, number>();
  for (const deel of verdeling) {
    personenMap.set(deel.uur, (personenMap.get(deel.uur) ?? 0) + deel.waarde / bereidheidCultuur);
  }

  // Begrens op veldcapaciteit (spelers tegelijk).
  const capaciteit = (aantalVelden && aantalVelden > 0) ? aantalVelden * spelersPerVeld(config) : 0;
  const begrensd = capMetOverloop(personenMap, capaciteit);

  const rijen: TrainingMoment[] = [];
  [...begrensd.entries()].sort((a, b) => a[0] - b[0]).forEach(([uur, p], i) => {
    const personen = Math.round(p);
    if (personen <= 0) return;
    const hh = String(uur).padStart(2, '0');
    const hhEind = String(Math.min(23, uur + 1)).padStart(2, '0');
    rijen.push({
      id: `${m.id}-u${uur}-${i}`,
      dag: m.dag,
      startTijd: `${hh}:00`,
      eindTijd: `${hhEind}:00`,
      aantalTeamsOnder13: 0,
      aantalTeamsVanaf13: 0,
      aantalPersonen: personen,
      type: m.type,
    });
  });
  return rijen.length ? rijen : [m];
}

/** Zet een heel (blok-)schema om naar uur-rijen, begrensd op de veldcapaciteit. */
export function schemaNaarUurRijen(schema: TrainingsSchema, typeVereniging?: string, aantalVelden?: number): TrainingsSchema {
  return schema.flatMap(m => blokNaarUurRijen(m, typeVereniging, aantalVelden));
}

/**
 * Berekent de PIEK-statistieken voor warm water uit het trainingsschema.
 *
 * In tegenstelling tot analyseSchema (die week-totalen geeft) levert deze
 * functie de cijfers waarop warmtepomp-keuze gebaseerd moet worden:
 *
 *  - **piekUurLiters**: maximaal warm water in 1 uur (bepaalt WP-vermogen)
 *  - **piekDagLiters**: totaal op piek-dag (bepaalt buffer-grootte)
 *  - **doucheBeurtenPiekDag**: aantal douches op piek-dag
 *
 * Gebruikt hetzelfde wave-model als de waterverbruik-grafiek (60/30/10 spreiding
 * rond elke "wave"), dus consistent met wat de gebruiker ziet.
 */
export function berekenDouchePieken(
  schema: TrainingsSchema,
  typeVereniging?: string,
): {
  piekUurLiters: number;
  /** Piek-uur MET veiligheidsmarge — basis voor WP-vermogen, buffer en WP-keuze. */
  piekUurLitersSizing: number;
  piekUurMoment: { dag: TrainingMoment['dag']; uur: number } | null;
  piekDagLiters: number;
  piekDagNaam: TrainingMoment['dag'] | null;
  doucheBeurtenPiekDag: number;
  totaalLitersPerWeek: number;
  totaalDouchesPerWeek: number;
  perDagPerUur: Partial<Record<TrainingMoment['dag'], number[]>>;
  benodigdVermogenPiekKw: number;
  minBufferLiters: number;
} {
  const config = getSportConfig(typeVereniging);
  const perDagPerUur: Partial<Record<TrainingMoment['dag'], number[]>> = {};

  for (const m of schema) {
    if (m.type === 'sociaal') continue;
    // Centrale, mode-bewuste douche-telling (uur-rij óf teams/banen-blok).
    const totaal = doucheBeurtenVanMoment(m, typeVereniging) * LITERS_PER_DOUCHE;
    if (totaal === 0) continue;

    const startUur = parseTime(m.startTijd);
    const eindUur = parseTime(m.eindTijd);

    if (!perDagPerUur[m.dag]) perDagPerUur[m.dag] = new Array(24).fill(0);
    const uren = perDagPerUur[m.dag]!;

    // === MODE A: uur-rij — gebruiker bepaalt zelf de spreiding ===
    // Plaats de douches exact in het ingevoerde uur. Door per dag meerdere
    // uur-rijen in te vullen bouwt de gebruiker zelf de gewenste (klok)curve.
    if (isUurRij(m)) {
      const slot = Math.max(0, Math.min(23, Math.floor(startUur)));
      uren[slot] += totaal;
      continue;
    }

    // === Klassiek blok-model: realistische spreiding over een TIJDVENSTER ===
    const { start: vensterStart, eind: vensterEind } = blokDoucheVenster(startUur, eindUur, config);
    spreidLitersOverVenster(uren, totaal, vensterStart, vensterEind);
  }

  let piekUurLiters = 0;
  let piekUurMoment: { dag: TrainingMoment['dag']; uur: number } | null = null;
  let piekDagLiters = 0;
  let piekDagNaam: TrainingMoment['dag'] | null = null;
  let totaalWeek = 0;
  for (const [dag, uren] of Object.entries(perDagPerUur)) {
    if (!uren) continue;
    const dagTotaal = uren.reduce((a, b) => a + b, 0);
    totaalWeek += dagTotaal;
    if (dagTotaal > piekDagLiters) {
      piekDagLiters = dagTotaal;
      piekDagNaam = dag as TrainingMoment['dag'];
    }
    for (let u = 0; u < 24; u++) {
      if (uren[u] > piekUurLiters) {
        piekUurLiters = uren[u];
        piekUurMoment = { dag: dag as TrainingMoment['dag'], uur: u };
      }
    }
  }

  // === Veiligheidsmarge op de DIMENSIONERING ===
  // De grafiek-piek (piekUurLiters) blijft de realistische, gemeten piek.
  // Voor het kiezen van WP-vermogen en buffer rekenen we met wat extra headroom,
  // zodat de installatie ook drukkere-dan-gemiddelde dagen aankan.
  const piekUurLitersSizing = piekUurLiters * VEILIGHEIDSMARGE;

  // Thermisch vermogen voor piek-uur (10°C → 60°C boiler-T):
  //   Q [kW] = L/u × 4.19 × ΔT / 3600
  const benodigdVermogenPiekKw = (piekUurLitersSizing * 4.19 * 50) / 3600;
  const minBufferLiters = piekUurLitersSizing / 0.85;

  return {
    piekUurLiters: Math.round(piekUurLiters),
    piekUurLitersSizing: Math.round(piekUurLitersSizing),
    piekUurMoment,
    piekDagLiters: Math.round(piekDagLiters),
    piekDagNaam,
    doucheBeurtenPiekDag: Math.round(piekDagLiters / LITERS_PER_DOUCHE),
    totaalLitersPerWeek: Math.round(totaalWeek),
    totaalDouchesPerWeek: Math.round(totaalWeek / LITERS_PER_DOUCHE),
    perDagPerUur,
    benodigdVermogenPiekKw: Math.round(benodigdVermogenPiekKw * 10) / 10,
    minBufferLiters: Math.round(minBufferLiters),
  };
}

/**
 * Aanbevolen tapwater-warmtepomp obv piek-uur.
 *
 * Vuistregels (NL sportclub-praktijk 2025):
 *   < 150 L/u   → Warmtepompboiler 200-300L  (kleine club / accommodatie)
 *   150-400 L/u → Q-ton HMA30A  (3 kW + 350L tank) — meest gangbaar
 *   400-800 L/u → Q-ton HMA45A  (4.5 kW + 500L tank) — grote sportclub
 *   800-1500 L/u → 2x HMA45A cascade OF bodem-WP + grote buffer
 *   > 1500 L/u  → Specialist nodig (zwembad-categorie)
 */
export function aanbevolenTapwaterOplossing(piekUurLiters: number): {
  oplossing: string;
  korteOnderbouwing: string;
  vermogenKw: number;
  bufferLiters: number;
  alternatief: string;
  maatregelId: 'warmtepompboiler' | 'qton-warmtepomp';
} {
  if (piekUurLiters < 150) {
    return {
      oplossing: 'Warmtepompboiler 200-300L',
      korteOnderbouwing: 'Voor deze piek-vraag voldoet een standaard warmtepompboiler (ATAG, Itho, Inventum). Goedkoop, eenvoudig te plaatsen, ISDE ~€1000.',
      vermogenKw: 2, bufferLiters: 250,
      alternatief: 'Bij verwachte groei (>30%): direct Q-ton HMA30A overwegen — opschalen later is duur.',
      maatregelId: 'warmtepompboiler',
    };
  }
  if (piekUurLiters < 400) {
    return {
      oplossing: 'Q-ton HMA30A (CO₂-warmtepomp, 3 kW + 350L buffer)',
      korteOnderbouwing: 'Klassieke sportclub-keuze. CO₂-koudemiddel levert efficiënt warm water tot 90°C — ruime marge boven legionella-temperatuur. Met 350L buffer overbrugt het de douche-piek direct na training.',
      vermogenKw: 3, bufferLiters: 350,
      alternatief: 'Cascade van 2 warmtepompboilers (goedkoper) — maar minder elegant en meer ruimte nodig.',
      maatregelId: 'qton-warmtepomp',
    };
  }
  if (piekUurLiters < 800) {
    return {
      oplossing: 'Q-ton HMA45A (CO₂-warmtepomp, 4.5 kW + 500L buffer)',
      korteOnderbouwing: 'Grotere sportclub-variant. Levert ook in echte pieken (na zaterdag-jeugdwedstrijden) voldoende warm water. ISDE-subsidie ~€3.700.',
      vermogenKw: 4.5, bufferLiters: 500,
      alternatief: '2x HMA30A in cascade — vergelijkbare totaalcapaciteit, betere redundantie als 1 uitvalt.',
      maatregelId: 'qton-warmtepomp',
    };
  }
  if (piekUurLiters < 1500) {
    return {
      oplossing: '2x Q-ton HMA45A in cascade (totaal ~9 kW + 1000L buffer)',
      korteOnderbouwing: 'Bij deze piek-vraag is één unit onvoldoende. Cascade-opstelling geeft modulatie en redundantie. Alternatief: bodemwarmtepomp met grote tapwater-buffer.',
      vermogenKw: 9, bufferLiters: 1000,
      alternatief: 'Bodemwarmtepomp 15-20 kW met 1000L tapwater-tank — hogere investering maar lagere energiekosten op lange termijn.',
      maatregelId: 'qton-warmtepomp',
    };
  }
  return {
    oplossing: 'Maatwerk — laat installateur dimensioneren',
    korteOnderbouwing: `Piek-vraag is in zwembad-categorie. Vraag een installateur om een dimensioneer-rapport. Realistische optie: bodem-WP 20+ kW met 1500-2000L buffer.`,
    vermogenKw: 20, bufferLiters: 1500,
    alternatief: 'Bodem-WP met seizoensopslag (BTES) voor zwembad-grootteclubs.',
    maatregelId: 'qton-warmtepomp',
  };
}
