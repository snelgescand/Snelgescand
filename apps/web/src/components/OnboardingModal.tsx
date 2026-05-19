/**
 * Onboarding-modal die bij eerste bezoek getoond wordt.
 *
 * Status wordt opgeslagen in localStorage zodat het maar één keer verschijnt.
 * Reset via console: `localStorage.removeItem('sopg.onboarding.gezien')`
 */

import { useState, useEffect } from 'react';
import { BRANDING } from '../branding';

const LS_KEY = 'sopg.onboarding.gezien';

interface Stap {
  titel: string;
  inhoud: React.ReactNode;
}

const STAPPEN: Stap[] = [
  {
    titel: `Welkom bij ${BRANDING.applicatieNaam}`,
    inhoud: (
      <div className="space-y-3">
        <p>
          Met deze tool maak je in korte tijd een verduurzamingsplan voor een sportclub of ander gebouw.
          De berekeningen zijn gebaseerd op de Excel-rekenmodellen van {BRANDING.organisatieNaam}.
        </p>
        <p className="text-gray-600 text-sm">
          Volg deze korte introductie om te zien hoe het werkt.
        </p>
      </div>
    ),
  },
  {
    titel: 'Hoe werkt het?',
    inhoud: (
      <div className="space-y-3">
        <ol className="list-decimal list-inside space-y-2">
          <li>Maak een <strong>nieuw project</strong> aan voor je klant.</li>
          <li>Vul de <strong>locatie</strong> in — bouwjaar en oppervlakte worden automatisch opgehaald.</li>
          <li>Vul het <strong>energieverbruik</strong> in (uit de jaarrekening van de club).</li>
          <li>Vink de <strong>maatregelen</strong> aan die je wil meenemen.</li>
          <li>Klik op <strong>Bereken</strong> voor de businesscase.</li>
          <li>Klik op <strong>↓ PowerPoint</strong> om het rapport te downloaden.</li>
        </ol>
      </div>
    ),
  },
  {
    titel: 'Tips voor onderweg',
    inhoud: (
      <div className="space-y-3">
        <ul className="space-y-2">
          <li className="flex gap-2">
            <span className="text-primary-600 font-bold">·</span>
            <span>Klik op het kleine <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary-100 text-primary-700 text-[10px] font-bold">i</span> achter een veld voor uitleg.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary-600 font-bold">·</span>
            <span>Gebruik <strong>postcode + huisnummer</strong> voor automatisch ophalen van pandgegevens.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary-600 font-bold">·</span>
            <span>Bekijk de <strong>luchtfoto</strong> om te zien of er al PV-panelen liggen.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary-600 font-bold">·</span>
            <span>Voeg <strong>foto's</strong> toe per project voor je verslag.</span>
          </li>
        </ul>
      </div>
    ),
  },
];

export function OnboardingModal() {
  const [open, setOpen] = useState(false);
  const [stap, setStap] = useState(0);

  useEffect(() => {
    const gezien = localStorage.getItem(LS_KEY);
    if (!gezien) {
      setOpen(true);
    }
  }, []);

  function sluit() {
    localStorage.setItem(LS_KEY, '1');
    setOpen(false);
  }

  function volgende() {
    if (stap < STAPPEN.length - 1) {
      setStap(stap + 1);
    } else {
      sluit();
    }
  }

  if (!open) return null;

  const huidige = STAPPEN[stap];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4"
      onClick={sluit}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <img src={BRANDING.logo.primary} alt="" className="h-10 w-auto" />
          <h2 className="text-xl font-bold text-primary-700">{huidige.titel}</h2>
        </div>

        <div className="text-gray-700">{huidige.inhoud}</div>

        <div className="flex items-center justify-between pt-2">
          <div className="flex gap-1">
            {STAPPEN.map((_, i) => (
              <span
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === stap ? 'bg-primary-600' : 'bg-gray-300'
                }`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={sluit} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-900">
              Overslaan
            </button>
            <button onClick={volgende} className="btn-primary px-4 py-2">
              {stap < STAPPEN.length - 1 ? 'Volgende' : 'Aan de slag'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
