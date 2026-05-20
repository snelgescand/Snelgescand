/**
 * Energielabel-visualisatie met sprong voor DUMAVA-subsidie.
 *
 * Toont:
 *  - Huidig label (groot)
 *  - Nieuw label na maatregelen (groot, met pijl ertussen)
 *  - DUMAVA-tier (20% / 30% / 40%)
 *  - Paris Proof check + afstand tot norm
 */

import type { EnergielabelInschatting, LabelSprong } from '../util/energielabel';

interface Props {
  huidig: EnergielabelInschatting;
  nieuw?: EnergielabelInschatting;
  sprong?: LabelSprong;
}

// Kleuren voor labels (van groen naar rood)
const LABEL_KLEUREN: Record<EnergielabelInschatting['label'], string> = {
  'A++++': '#00773F',
  'A+++':  '#1B8F4F',
  'A++':   '#3DA85F',
  'A+':    '#5EBE6E',
  'A':     '#8FD377',
  'B':     '#C5DD7E',
  'C':     '#F4DA72',
  'D':     '#F1B95E',
  'E':     '#EA9148',
  'F':     '#DD6438',
  'G':     '#C13B2A',
};

export function EnergielabelKaart({ huidig, nieuw, sprong }: Props) {
  return (
    <div className="card p-5">
      <h2 className="text-base font-semibold text-primary-900 mb-3">Energielabel & Paris Proof</h2>

      <div className="space-y-4">
        {/* Label-sprong */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <LabelBlock label={huidig.label} subtitel="Huidig" weii={huidig.weii} />

          {nieuw && (
            <>
              <div className="text-2xl text-primary-500">→</div>
              <LabelBlock label={nieuw.label} subtitel="Na maatregelen" weii={nieuw.weii} highlight />
            </>
          )}
        </div>

        {/* DUMAVA-tier */}
        {sprong && (
          <div className={`border-l-4 p-3 rounded text-sm ${
            sprong.dumavaPercentage === 40 ? 'bg-primary-50 border-primary-500' :
            sprong.dumavaPercentage === 30 ? 'bg-accent-orange/10 border-accent-orange' :
            'bg-gray-50 border-gray-400'
          }`}>
            <p className={`font-semibold mb-0.5 ${
              sprong.dumavaPercentage === 40 ? 'text-primary-900' :
              sprong.dumavaPercentage === 30 ? 'text-accent-orange-dark' :
              'text-gray-800'
            }`}>
              DUMAVA-tier: <strong>{sprong.dumavaPercentage}%</strong> subsidie
            </p>
            <p className="text-gray-700 text-xs">
              {sprong.dumavaToelichting}
            </p>
            <p className="text-gray-500 text-[10px] mt-1 italic">
              Voorwaarden 2025/2026: 40% vereist eind-label ≥ A++ (sportbestemming) of ≥ A+++ (kantoor/overig);
              30% vereist eind-label ≥ B; 20% standaard voor 1–3 losse maatregelen.
            </p>
          </div>
        )}

        {/* Paris Proof status */}
        <div>
          <ParisProofBalk inschatting={nieuw ?? huidig} />
        </div>

        {/* Disclaimer */}
        <details className="text-xs text-gray-500">
          <summary className="cursor-pointer hover:text-gray-700">Hoe is dit berekend? / Disclaimer</summary>
          <div className="mt-2 space-y-2 pl-2 border-l-2 border-gray-200">
            <p>
              <strong>WEii (Werkelijke Energieintensiteit)</strong> = (gasverbruik × 9,769 + stroomverbruik − PV) / BVO in kWh/m²/jaar.
            </p>
            <p>
              <strong>Energielabel</strong> is een inschatting op basis van NTA8800-EP2-bereiken voor maatschappelijk vastgoed.
              Dit is GEEN definitief label — daarvoor moet een EPA-U-adviseur een formele EP2-berekening doen.
            </p>
            <p>
              <strong>Paris Proof-norm</strong> voor sportkantines: 70 kWh/m²/jaar (bron: DGBC).
              Dit is het verbruiksniveau waarmee het gebouw bijdraagt aan de doelen van het Klimaatakkoord van Parijs.
            </p>
            <p>
              <strong>DUMAVA-tier</strong>: 20% bij 1 labelsprong, 30% bij 2 sprongen, 40% bij 3+ sprongen of een integraal pakket. Bron: RVO.
            </p>
          </div>
        </details>
      </div>
    </div>
  );
}

function LabelBlock({ label, subtitel, weii, highlight }: { label: EnergielabelInschatting['label']; subtitel: string; weii: number; highlight?: boolean }) {
  const kleur = LABEL_KLEUREN[label];
  return (
    <div className="flex flex-col items-center">
      <div className="text-xs text-gray-500 mb-1">{subtitel}</div>
      <div
        className={`px-4 py-3 rounded-lg text-2xl font-bold text-white shadow-sm ${highlight ? 'ring-4 ring-primary-200' : ''}`}
        style={{ background: kleur, minWidth: '4rem', textAlign: 'center' }}
      >
        {label}
      </div>
      <div className="text-xs text-gray-600 mt-1">{weii} kWh/m²/jaar</div>
    </div>
  );
}

function ParisProofBalk({ inschatting }: { inschatting: EnergielabelInschatting }) {
  const { weii, parisProofNorm, isParisProof } = inschatting;
  // Schaal: 0 → norm → 3×norm
  const max = parisProofNorm * 3;
  const positie = Math.min(100, (weii / max) * 100);
  const normPos = (parisProofNorm / max) * 100;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-700">Paris Proof-positie</span>
        <span className={`text-xs font-semibold ${isParisProof ? 'text-primary-700' : 'text-accent-orange'}`}>
          {isParisProof ? '✓ Paris Proof' : `${inschatting.afstandTotParisProof} kWh/m² boven norm`}
        </span>
      </div>
      <div className="relative h-3 bg-gradient-to-r from-primary-500 via-accent-orange to-red-600 rounded-full overflow-hidden">
        {/* Paris Proof grenswaarde */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-primary-900"
          style={{ left: `${normPos}%` }}
          title={`Paris Proof-norm: ${parisProofNorm} kWh/m²`}
        />
        {/* Positie van dit gebouw */}
        <div
          className="absolute -top-1 -bottom-1 w-1 bg-white border-2 border-primary-900 rounded-full"
          style={{ left: `${positie}%`, transform: 'translateX(-50%)' }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-500 mt-1">
        <span>0</span>
        <span style={{ marginLeft: `${normPos - 5}%` }}>norm ({parisProofNorm})</span>
        <span>{max}+</span>
      </div>
    </div>
  );
}
