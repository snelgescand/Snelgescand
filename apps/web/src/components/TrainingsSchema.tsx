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

import { useState } from 'react';
import { InfoTooltip } from './InfoTooltip';

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
const SPORT_CONFIGS: Record<string, SportConfig> = {
  voetbal: {
    categorie: 'teamsport',
    labelGroep1: 'Teams <13 jr',
    labelGroep2: 'Teams ≥13 jr',
    personenPerEenheid1: 10,
    personenPerEenheid2: 15,
    uitleg: 'Voetbal: jeugd half veld ~10 spelers/team, senioren heel veld ~15 spelers/team (incl. wissels).',
    douchePct: {
      groep1: { training: 0.25, wedstrijd: 0.50 },
      groep2: { training: 0.95, wedstrijd: 1.00 },
    },
  },
  hockey: {
    categorie: 'teamsport',
    labelGroep1: 'Teams <13 jr',
    labelGroep2: 'Teams ≥13 jr',
    personenPerEenheid1: 10,
    personenPerEenheid2: 15,
    uitleg: 'Hockey: jeugd-team ~10 spelers, senior-team ~15 spelers (incl. wissels + keeper).',
    douchePct: {
      groep1: { training: 0.25, wedstrijd: 0.60 },
      groep2: { training: 0.95, wedstrijd: 1.00 },
    },
  },
  korfbal: {
    categorie: 'teamsport',
    labelGroep1: 'Teams <13 jr',
    labelGroep2: 'Teams ≥13 jr',
    personenPerEenheid1: 8,
    personenPerEenheid2: 11,
    uitleg: 'Korfbal: 8 spelers in het veld (4×2 mix), met wissels ~11 senioren / 8 jeugd.',
    douchePct: {
      groep1: { training: 0.20, wedstrijd: 0.50 },
      groep2: { training: 0.90, wedstrijd: 1.00 },
    },
  },
  handbal: {
    categorie: 'teamsport',
    labelGroep1: 'Teams <13 jr',
    labelGroep2: 'Teams ≥13 jr',
    personenPerEenheid1: 12,
    personenPerEenheid2: 14,
    uitleg: 'Handbal: 7 in het veld + wissels, ~12 jeugd / 14 senioren per team.',
    douchePct: {
      groep1: { training: 0.30, wedstrijd: 0.70 },
      groep2: { training: 0.95, wedstrijd: 1.00 },
    },
  },
  rugby: {
    categorie: 'teamsport',
    labelGroep1: 'Teams jeugd',
    labelGroep2: 'Teams senioren',
    personenPerEenheid1: 18,
    personenPerEenheid2: 22,
    uitleg: 'Rugby: 15 in het veld + 7 wissels = 22 senioren. Jeugd-teams iets kleiner.',
    douchePct: {
      groep1: { training: 0.70, wedstrijd: 1.00 },
      groep2: { training: 1.00, wedstrijd: 1.00 },
    },
  },
  volleybal: {
    categorie: 'teamsport',
    labelGroep1: 'Teams jeugd',
    labelGroep2: 'Teams senioren',
    personenPerEenheid1: 8,
    personenPerEenheid2: 10,
    uitleg: 'Volleybal: 6 in het veld + 2-4 wissels per team.',
    douchePct: {
      groep1: { training: 0.20, wedstrijd: 0.50 },
      groep2: { training: 0.80, wedstrijd: 0.95 },
    },
  },
  honkbal: {
    categorie: 'teamsport',
    labelGroep1: 'Teams jeugd',
    labelGroep2: 'Teams senioren',
    personenPerEenheid1: 10,
    personenPerEenheid2: 14,
    uitleg: 'Honkbal: 9 in het veld + wissels, ~14 spelers per senior-team.',
    douchePct: {
      groep1: { training: 0.20, wedstrijd: 0.50 },
      groep2: { training: 0.80, wedstrijd: 0.90 },
    },
  },
  tennis: {
    categorie: 'racketsport',
    labelGroep1: 'Banen single (2 sp/baan)',
    labelGroep2: 'Banen dubbel (4 sp/baan)',
    personenPerEenheid1: 2,
    personenPerEenheid2: 4,
    uitleg: 'Tennis: per baan 2 spelers (single) of 4 (dubbel). Vrijwel niemand doucht na 1 uur tennis — typisch 5-15%.',
    douchePct: {
      groep1: { training: 0.05, wedstrijd: 0.15 },
      groep2: { training: 0.10, wedstrijd: 0.20 },
    },
  },
  padel: {
    categorie: 'racketsport',
    labelGroep1: 'Banen 2 sp',
    labelGroep2: 'Banen 4 sp (dubbel)',
    personenPerEenheid1: 2,
    personenPerEenheid2: 4,
    uitleg: 'Padel: vrijwel altijd dubbel (4 spelers/baan). Douches: kort en intensief, ~15-25%.',
    douchePct: {
      groep1: { training: 0.10, wedstrijd: 0.20 },
      groep2: { training: 0.15, wedstrijd: 0.25 },
    },
  },
  badminton: {
    categorie: 'racketsport',
    labelGroep1: 'Banen single (2 sp)',
    labelGroep2: 'Banen dubbel (4 sp)',
    personenPerEenheid1: 2,
    personenPerEenheid2: 4,
    uitleg: 'Badminton: typisch zaal-sport, weinig clubdouche-gebruik.',
    douchePct: {
      groep1: { training: 0.05, wedstrijd: 0.10 },
      groep2: { training: 0.10, wedstrijd: 0.15 },
    },
  },
  squash: {
    categorie: 'racketsport',
    labelGroep1: 'Banen jeugd',
    labelGroep2: 'Banen senioren',
    personenPerEenheid1: 2,
    personenPerEenheid2: 2,
    uitleg: 'Squash: 2 spelers per baan, intensief — relatief hoog douche-gebruik voor racketsport.',
    douchePct: {
      groep1: { training: 0.40, wedstrijd: 0.60 },
      groep2: { training: 0.70, wedstrijd: 0.85 },
    },
  },
  atletiek: {
    categorie: 'individueel',
    labelGroep1: 'Personen jeugd',
    labelGroep2: 'Personen senioren',
    personenPerEenheid1: 1,
    personenPerEenheid2: 1,
    uitleg: 'Atletiek: vul direct het aantal sporters in (geen teams). Trainingsgroepen variëren sterk per club.',
    douchePct: {
      groep1: { training: 0.30, wedstrijd: 0.50 },
      groep2: { training: 0.50, wedstrijd: 0.80 },
    },
  },
  zwemmen: {
    categorie: 'baansport',
    labelGroep1: 'Banen jeugd-groepen',
    labelGroep2: 'Banen senior-groepen',
    personenPerEenheid1: 6,
    personenPerEenheid2: 6,
    uitleg: 'Zwemmen: ~6 personen per baan (les-groep). Iedereen doucht vanzelfsprekend.',
    douchePct: {
      groep1: { training: 1.00, wedstrijd: 1.00 },
      groep2: { training: 1.00, wedstrijd: 1.00 },
    },
  },
  multi: {
    categorie: 'teamsport',
    labelGroep1: 'Eenheden jeugd',
    labelGroep2: 'Eenheden senioren',
    personenPerEenheid1: 10,
    personenPerEenheid2: 15,
    uitleg: 'Multi-sportclub: pas zo nodig de spelers-per-eenheid aan via het projecteditor-veld. Default is voetbal-aanname.',
    douchePct: {
      groep1: { training: 0.30, wedstrijd: 0.60 },
      groep2: { training: 0.80, wedstrijd: 0.95 },
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
  type: 'training' | 'wedstrijd' | 'sociaal';
}

export type TrainingsSchema = TrainingMoment[];

const DAGEN: TrainingMoment['dag'][] = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];

/**
 * Douche-percentage o.b.v. groep, type activiteit en dag.
 *
 * v29: nu sport-bewust — gebruikt SPORT_CONFIGS per club-type. Voor backwards
 * compatibility blijft de oude signatuur (zonder typeVereniging) werken,
 * dan wordt voetbal-default gebruikt.
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

interface Props {
  schema: TrainingsSchema;
  onChange: (s: TrainingsSchema) => void;
  /** Optioneel — wordt gebruikt door de "vul standaard schema in"-knop. */
  typeVereniging?: string;
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
): { schema: TrainingsSchema; waarschuwing?: string } {
  const config = getSportConfig(typeVereniging);
  const ledenJeugd = Math.round((aantalLeden * pctJeugd) / 100);
  const ledenSenioren = aantalLeden - ledenJeugd;
  const mkId = (i: number) => `m-${Date.now()}-${i}-${Math.floor(Math.random() * 1000)}`;

  // Aantal eenheden = aantal leden / personen-per-eenheid (uit sport-config)
  const eenhedenGroep1 = Math.max(0, Math.round(ledenJeugd / config.personenPerEenheid1));
  const eenhedenGroep2 = Math.max(0, Math.round(ledenSenioren / config.personenPerEenheid2));

  // Dispatch op categorie — elk type sport heeft eigen weekschema-patroon
  switch (config.categorie) {
    case 'teamsport':
      return { schema: weekTeamsport(mkId, eenhedenGroep1, eenhedenGroep2) };
    case 'racketsport':
      return { schema: weekRacketsport(mkId, eenhedenGroep1, eenhedenGroep2, typeVereniging) };
    case 'individueel':
      return { schema: weekIndividueel(mkId, ledenJeugd, ledenSenioren) };
    case 'baansport':
      return { schema: weekBaansport(mkId, eenhedenGroep1, eenhedenGroep2) };
  }
}

/** Teamsport (voetbal/hockey/korfbal/handbal/rugby/volleybal): di+do training senioren,
 *  wo jeugd-training, za jeugd-wedstrijd, zo senioren-wedstrijd. */
function weekTeamsport(mkId: (i: number) => string, teamsJeugd: number, teamsSenioren: number): TrainingsSchema {
  const schema: TrainingsSchema = [];
  if (teamsJeugd > 0) {
    schema.push({ id: mkId(1), dag: 'woensdag', startTijd: '17:00', eindTijd: '18:30',
      aantalTeamsOnder13: Math.ceil(teamsJeugd / 2), aantalTeamsVanaf13: 0, type: 'training' });
    if (teamsJeugd > 1) {
      schema.push({ id: mkId(2), dag: 'woensdag', startTijd: '18:30', eindTijd: '20:00',
        aantalTeamsOnder13: Math.floor(teamsJeugd / 2), aantalTeamsVanaf13: 0, type: 'training' });
    }
    schema.push({ id: mkId(5), dag: 'zaterdag', startTijd: '09:00', eindTijd: '12:30',
      aantalTeamsOnder13: teamsJeugd, aantalTeamsVanaf13: 0, type: 'wedstrijd' });
  }
  if (teamsSenioren > 0) {
    const half = Math.ceil(teamsSenioren / 2);
    schema.push({ id: mkId(3), dag: 'dinsdag', startTijd: '19:30', eindTijd: '21:00',
      aantalTeamsOnder13: 0, aantalTeamsVanaf13: half, type: 'training' });
    if (teamsSenioren > 1) {
      schema.push({ id: mkId(4), dag: 'donderdag', startTijd: '19:30', eindTijd: '21:00',
        aantalTeamsOnder13: 0, aantalTeamsVanaf13: teamsSenioren - half, type: 'training' });
    }
    schema.push({ id: mkId(6), dag: 'zondag', startTijd: '11:00', eindTijd: '16:00',
      aantalTeamsOnder13: 0, aantalTeamsVanaf13: teamsSenioren, type: 'wedstrijd' });
  }
  return schema;
}

/** Racketsport: banen ÉLKE dag bezet (ma-zo), lessen wo voor jeugd, competitie za/zo.
 *  Aanname: het aantal "banen-uren" verspreid over de week. */
function weekRacketsport(mkId: (i: number) => string, banenJeugd: number, banenSenioren: number, _type: string): TrainingsSchema {
  const schema: TrainingsSchema = [];
  // Bij racketsport is een baan vrijwel altijd bezet. We modelleren typische bezetting:
  // - Doordeweekse avonden 19:00-22:30 senioren-bezetting
  // - Woensdagmiddag jeugd
  // - Zaterdag competitie + Zondag competitie

  // Doordeweekse senioren-spelen — 5 avonden van ma t/m vr
  const senioren = banenSenioren;
  if (senioren > 0) {
    for (const dag of ['maandag', 'dinsdag', 'donderdag', 'vrijdag'] as const) {
      schema.push({
        id: mkId(senioren + DAGEN.indexOf(dag)), dag,
        startTijd: '19:00', eindTijd: '22:30',
        aantalTeamsOnder13: 0, aantalTeamsVanaf13: senioren, type: 'training',
      });
    }
  }

  // Jeugd-les woensdagmiddag
  if (banenJeugd > 0) {
    schema.push({ id: mkId(11), dag: 'woensdag', startTijd: '14:00', eindTijd: '17:00',
      aantalTeamsOnder13: banenJeugd, aantalTeamsVanaf13: 0, type: 'training' });
  }

  // Competitie zaterdag (jeugd + senioren ochtend tot eind middag)
  if (banenJeugd > 0 || senioren > 0) {
    schema.push({ id: mkId(12), dag: 'zaterdag', startTijd: '10:00', eindTijd: '17:00',
      aantalTeamsOnder13: banenJeugd, aantalTeamsVanaf13: senioren, type: 'wedstrijd' });
  }
  // Competitie zondag (vooral senioren)
  if (senioren > 0) {
    schema.push({ id: mkId(13), dag: 'zondag', startTijd: '10:00', eindTijd: '15:00',
      aantalTeamsOnder13: 0, aantalTeamsVanaf13: senioren, type: 'wedstrijd' });
  }

  return schema;
}

/** Individueel (atletiek): 3x/week training + zaterdag wedstrijden. */
function weekIndividueel(mkId: (i: number) => string, personenJeugd: number, personenSenioren: number): TrainingsSchema {
  const schema: TrainingsSchema = [];
  if (personenJeugd > 0) {
    // Jeugd 2x/week — wo middag + za ochtend
    schema.push({ id: mkId(1), dag: 'woensdag', startTijd: '15:00', eindTijd: '16:30',
      aantalTeamsOnder13: personenJeugd, aantalTeamsVanaf13: 0, type: 'training' });
    schema.push({ id: mkId(2), dag: 'zaterdag', startTijd: '09:30', eindTijd: '11:00',
      aantalTeamsOnder13: personenJeugd, aantalTeamsVanaf13: 0, type: 'training' });
  }
  if (personenSenioren > 0) {
    // Senioren 3x/week — di + do + za
    for (const [i, dag] of (['dinsdag', 'donderdag'] as const).entries()) {
      schema.push({ id: mkId(3 + i), dag, startTijd: '19:00', eindTijd: '20:30',
        aantalTeamsOnder13: 0, aantalTeamsVanaf13: personenSenioren, type: 'training' });
    }
    schema.push({ id: mkId(5), dag: 'zaterdag', startTijd: '10:00', eindTijd: '12:00',
      aantalTeamsOnder13: 0, aantalTeamsVanaf13: personenSenioren, type: 'training' });
  }
  return schema;
}

/** Baansport (zwemmen): banen overdag voor lessen, avonden trainingen, weekend wedstrijden. */
function weekBaansport(mkId: (i: number) => string, banenJeugd: number, banenSenioren: number): TrainingsSchema {
  const schema: TrainingsSchema = [];
  if (banenJeugd > 0) {
    // Jeugd lessen 4x/week — ma/wo/za
    for (const [i, dag] of (['maandag', 'woensdag', 'zaterdag'] as const).entries()) {
      schema.push({
        id: mkId(i + 1), dag,
        startTijd: dag === 'zaterdag' ? '09:00' : '16:00',
        eindTijd: dag === 'zaterdag' ? '12:00' : '18:00',
        aantalTeamsOnder13: banenJeugd, aantalTeamsVanaf13: 0, type: 'training',
      });
    }
  }
  if (banenSenioren > 0) {
    // Senioren-banen avonden ma/wo/vr
    for (const [i, dag] of (['maandag', 'woensdag', 'vrijdag'] as const).entries()) {
      schema.push({ id: mkId(10 + i), dag, startTijd: '20:00', eindTijd: '21:30',
        aantalTeamsOnder13: 0, aantalTeamsVanaf13: banenSenioren, type: 'training' });
    }
  }
  return schema;
}

export function TrainingsSchemaInvoer({ schema, onChange, typeVereniging }: Props) {
  const [valsspeelOpen, setValsspeelOpen] = useState(false);
  const [vsAantalLeden, setVsAantalLeden] = useState<number>(150);
  const [vsPctJeugd, setVsPctJeugd] = useState<number>(40);
  const [vsWaarschuwing, setVsWaarschuwing] = useState<string | null>(null);

  function valsspeelToepassen() {
    const tv = typeVereniging || 'voetbal';
    const { schema: nieuwSchema, waarschuwing } = genereerStandaardSchema(tv, vsAantalLeden, vsPctJeugd);
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

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        {config.categorie === 'teamsport' && <>Vul per dag het aantal <strong>teams</strong> in. </>}
        {config.categorie === 'racketsport' && <>Vul per dag het aantal <strong>bezette banen</strong> in. </>}
        {config.categorie === 'individueel' && <>Vul per dag het aantal <strong>aanwezige personen</strong> in. </>}
        {config.categorie === 'baansport' && <>Vul per dag het aantal <strong>bezette banen</strong> in. </>}
        Het systeem rekent zelf met douche-percentage en water-verbruik per sport.
        <InfoTooltip>
          <div className="space-y-1 text-xs">
            <p><strong>{config.labelGroep1}</strong>: {config.personenPerEenheid1} {config.categorie === 'individueel' ? 'persoon' : 'personen'} per eenheid. Doucht {Math.round(config.douchePct.groep1.training * 100)}% bij training, {Math.round(config.douchePct.groep1.wedstrijd * 100)}% bij wedstrijd.</p>
            <p><strong>{config.labelGroep2}</strong>: {config.personenPerEenheid2} personen per eenheid. Doucht {Math.round(config.douchePct.groep2.training * 100)}% bij training, {Math.round(config.douchePct.groep2.wedstrijd * 100)}% bij wedstrijd.</p>
            <p><strong>Sociale momenten</strong>: niemand doucht (alleen kantine).</p>
            <p>Per douche-beurt: 35 liter warm water (37°C).</p>
            <p className="italic mt-1 text-gray-600">{config.uitleg}</p>
          </div>
        </InfoTooltip>
      </p>

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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <button
                  type="button"
                  onClick={() => addMomentOpDag(dag)}
                  className="text-xs text-primary-700 hover:bg-primary-100 px-2 py-1 rounded font-medium"
                  title={`Voeg een activiteit toe op ${DAG_LABELS[dag]}`}
                >
                  + Toevoegen
                </button>
              </div>

              {/* Momenten op deze dag */}
              {momenten.length > 0 && (
                <div className="divide-y divide-gray-100">
                  {momenten.map(m => {
                    const pctO13 = Math.round(douchePercentage('onder13', m.type, m.dag, typeVereniging) * 100);
                    const pctV13 = Math.round(douchePercentage('vanaf13', m.type, m.dag, typeVereniging) * 100);
                    const typeInfo = TYPE_INFO[m.type];
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
                                <span className="block text-gray-400">{pctO13}% doucht · {config.personenPerEenheid1} {config.categorie === 'individueel' ? 'p' : 'sp'}/eh</span>
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
                                <span className="block text-gray-400">{pctV13}% doucht · {config.personenPerEenheid2} {config.categorie === 'individueel' ? 'p' : 'sp'}/eh</span>
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
          <strong>Snel beginnen?</strong> Klik op <em>+ Toevoegen</em> bij een dag waarop er training is.
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
  let personen = 0;
  for (const m of schema) {
    const start = parseTime(m.startTijd);
    const eind = parseTime(m.eindTijd);
    const duur = Math.max(0, eind - start);
    uren += duur;

    const spelersGroep1 = (m.aantalTeamsOnder13 ?? 0) * config.personenPerEenheid1;
    const spelersGroep2 = (m.aantalTeamsVanaf13 ?? 0) * config.personenPerEenheid2;
    personen += spelersGroep1 + spelersGroep2;

    douchesJeugd += spelersGroep1 * douchePercentage('onder13', m.type, m.dag, typeVereniging);
    douchesSenioren += spelersGroep2 * douchePercentage('vanaf13', m.type, m.dag, typeVereniging);
  }
  const totaalDouches = douchesJeugd + douchesSenioren;
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
