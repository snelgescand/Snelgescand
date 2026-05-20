/**
 * Energielabel-inschatting + Paris Proof check voor sportclubs.
 *
 * Twee gerelateerde berekeningen:
 *
 * 1. **WEii (Werkelijke Energieintensiteit Indicator)** in kWh/m²/jaar:
 *    - Telt gas en stroom op tot één getal per m² BVO
 *    - Vergelijkt met de Paris Proof-norm voor sportkantines (~70 kWh/m²)
 *
 * 2. **Energielabel-inschatting** op basis van WEii:
 *    - Gebruikt een vereenvoudigde drempel-tabel voor maatschappelijk vastgoed
 *    - GEEN definitief label (daarvoor heb je een EPA-U-adviseur nodig)
 *
 * NB: Deze inschatting is INDICATIEF. Voor een formeel energielabel is
 * een EP2-rekenmethodiek (NTA8800) door een gecertificeerd adviseur vereist.
 */

export interface EnergielabelInschatting {
  /** WEii in kWh per m² per jaar (primair verbruik) */
  weii: number;
  /** Geschatte letterklasse */
  label: 'A++++' | 'A+++' | 'A++' | 'A+' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
  /** Paris Proof-grens voor dit gebouwtype (kWh/m²) */
  parisProofNorm: number;
  /** Is het al Paris Proof? */
  isParisProof: boolean;
  /** Hoeveel kWh/m² moet er nog af voor Paris Proof */
  afstandTotParisProof: number;
}

/**
 * Energie-inhoud aardgas (kWh per m³, calorische bovenwaarde).
 * Bron: NEN 1078; Slochterengas ~9.769 kWh/m³.
 */
const GAS_KWH_PER_M3 = 9.769;

/**
 * Paris Proof-grenswaarden per gebouwtype (kWh/m²/jaar) — bron: DGBC.
 * Voor sportgebouwen ligt de Paris Proof-norm op ongeveer 70 kWh/m²/jaar.
 */
const PARIS_PROOF_NORM_SPORT = 70;

/**
 * Energielabel-drempels voor sportkantines/maatschappelijk vastgoed.
 * Bron: vereenvoudigd op basis van NTA8800-EP2-bereik per labelklasse.
 *
 * De labelklasse wordt bepaald door waar de WEii ligt:
 *   WEii < 50  → A++++ ofwel zeer zuinig
 *   WEii < 75  → A+++
 *   ...etc
 *   WEii > 400 → G
 */
const LABEL_DREMPELS: Array<{ max: number; label: EnergielabelInschatting['label'] }> = [
  { max: 50,  label: 'A++++' },
  { max: 75,  label: 'A+++'  },
  { max: 105, label: 'A++'   },
  { max: 140, label: 'A+'    },
  { max: 180, label: 'A'     },
  { max: 230, label: 'B'     },
  { max: 290, label: 'C'     },
  { max: 360, label: 'D'     },
  { max: 440, label: 'E'     },
  { max: 540, label: 'F'     },
  { max: Infinity, label: 'G' },
];

export function berekenEnergielabel(input: {
  gasverbruikM3: number;
  stroomverbruikKwh: number;
  bvoM2: number;
  /** PV-opgewekt in eigen verbruik (kWh) - aftrekken van stroom */
  pvOpgewektKwh?: number;
}): EnergielabelInschatting {
  const { gasverbruikM3, stroomverbruikKwh, bvoM2, pvOpgewektKwh = 0 } = input;

  if (!bvoM2 || bvoM2 <= 0) {
    return {
      weii: 0,
      label: 'G',
      parisProofNorm: PARIS_PROOF_NORM_SPORT,
      isParisProof: false,
      afstandTotParisProof: Infinity,
    };
  }

  // Primair energieverbruik per m²
  const gasKwh = gasverbruikM3 * GAS_KWH_PER_M3;
  const stroomNet = Math.max(0, stroomverbruikKwh - pvOpgewektKwh);
  const totaalKwh = gasKwh + stroomNet;
  const weii = totaalKwh / bvoM2;

  const drempel = LABEL_DREMPELS.find(d => weii < d.max) ?? LABEL_DREMPELS[LABEL_DREMPELS.length - 1];

  return {
    weii: Math.round(weii),
    label: drempel.label,
    parisProofNorm: PARIS_PROOF_NORM_SPORT,
    isParisProof: weii <= PARIS_PROOF_NORM_SPORT,
    afstandTotParisProof: Math.max(0, Math.round(weii - PARIS_PROOF_NORM_SPORT)),
  };
}

/**
 * Bepaalt de "sprong" tussen oude en nieuwe energielabel,
 * uitgedrukt in aantal labelklassen.
 *
 * Gebruikt voor DUMAVA-subsidie-tier:
 *   - 1-label sprong → 20% subsidie
 *   - 2-label sprong → 30%
 *   - 3+ labels      → 40%
 */
export interface LabelSprong {
  oudLabel: EnergielabelInschatting['label'];
  nieuwLabel: EnergielabelInschatting['label'];
  /** Aantal sprongen (positief = verbetering) */
  sprongen: number;
  /** Verwachte DUMAVA-subsidie-percentage */
  dumavaPercentage: 20 | 30 | 40;
}

const LABEL_VOLGORDE: Array<EnergielabelInschatting['label']> =
  ['A++++', 'A+++', 'A++', 'A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];

export function bepaalLabelSprong(oud: EnergielabelInschatting['label'], nieuw: EnergielabelInschatting['label']): LabelSprong {
  const oudIdx = LABEL_VOLGORDE.indexOf(oud);
  const nieuwIdx = LABEL_VOLGORDE.indexOf(nieuw);
  const sprongen = oudIdx - nieuwIdx; // positief = verbetering (lager index = beter label)

  const dumavaPercentage: 20 | 30 | 40 =
    sprongen >= 3 ? 40 : sprongen >= 2 ? 30 : 20;

  return { oudLabel: oud, nieuwLabel: nieuw, sprongen, dumavaPercentage };
}

/**
 * Berekent het nieuwe energielabel ná toepassing van maatregelen.
 * Gebruikt de besparingen uit de calc-core rollup om gas/stroom-verbruik te verminderen.
 */
export function berekenLabelNaMaatregelen(input: {
  huidigGasM3: number;
  huidigStroomKwh: number;
  bvoM2: number;
  gasBesparingM3: number;
  stroomBesparingKwh: number;
  extraStroomverbruikKwh?: number;
  pvOpgewektKwh?: number;
}): EnergielabelInschatting {
  const nieuwGasM3 = Math.max(0, input.huidigGasM3 - input.gasBesparingM3);
  const nieuwStroomKwh = Math.max(0, input.huidigStroomKwh - input.stroomBesparingKwh + (input.extraStroomverbruikKwh ?? 0));

  return berekenEnergielabel({
    gasverbruikM3: nieuwGasM3,
    stroomverbruikKwh: nieuwStroomKwh,
    bvoM2: input.bvoM2,
    pvOpgewektKwh: input.pvOpgewektKwh,
  });
}
