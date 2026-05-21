/**
 * Cold-start scherm voor de Render gratis tier.
 *
 * De backend op Render free-tier valt na 15 minuten inactiviteit in slaap.
 * De eerste request daarna duurt 30-60 seconden tot de server wakker is.
 * Dit scherm legt uit wat er gebeurt, toont een bewegende spinner en
 * stelt na 60 seconden een refresh voor.
 */

import { useState, useEffect } from 'react';

interface Props {
  /** Optionele subtitel — bv. "Even geduld terwijl het project laadt" */
  subtitel?: string;
}

export function LaadScherm({ subtitel }: Props) {
  // Timer om te tonen hoe lang het al duurt
  const [seconden, setSeconden] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setSeconden(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Toon na 8 sec de uitleg over cold start, na 60 sec refresh-suggestie
  const toonUitleg = seconden >= 8;
  const toonRefresh = seconden >= 60;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-sunrise p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-card p-8 text-center">
        {/* Spinner */}
        <div className="mb-6 flex justify-center">
          <Spinner />
        </div>

        <h1 className="text-xl font-bold text-primary-900 mb-2">
          {toonUitleg ? 'Server wordt opgestart…' : 'Laden…'}
        </h1>

        {subtitel && !toonUitleg && (
          <p className="text-sm text-gray-600">{subtitel}</p>
        )}

        {toonUitleg && (
          <div className="text-sm text-gray-700 space-y-3 mt-3">
            <p>
              Omdat Snelgescand een gratis dienst is, valt de server in slaap als hij even niet gebruikt
              wordt. De eerste keer dat je hem weer aanroept, duurt het ongeveer
              <strong> 30 tot 60 seconden</strong> tot hij weer wakker is.
            </p>
            <p className="text-gray-500 text-xs">
              Bezig met opstarten: {seconden} {seconden === 1 ? 'seconde' : 'seconden'}
            </p>
          </div>
        )}

        {toonRefresh && (
          <div className="mt-5 p-3 bg-accent-orange/10 border border-accent-orange/30 rounded-lg">
            <p className="text-sm text-accent-orange-dark mb-2">
              Het duurt langer dan verwacht. Probeer een refresh:
            </p>
            <button
              onClick={() => window.location.reload()}
              className="btn-accent text-sm"
            >
              ↻ Pagina vernieuwen
            </button>
          </div>
        )}

        {/* Voortgangsbalk: vult zich richting de typische 60s */}
        <div className="mt-6 h-1 bg-gray-100 rounded overflow-hidden">
          <div
            className="h-full bg-primary-500 transition-all duration-1000"
            style={{ width: `${Math.min(100, (seconden / 60) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="relative w-14 h-14">
      <div className="absolute inset-0 rounded-full border-4 border-primary-100"></div>
      <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-accent-orange animate-spin"></div>
    </div>
  );
}
