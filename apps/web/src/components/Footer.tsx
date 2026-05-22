/**
 * Footer met snelkoppelingen naar kennisbank, externe websites (Op Naar Nul /
 * Sportief Opgewekt) en copyright.
 *
 * v29: uitgebreid met expliciete links naar kennisbank en partner-websites
 * — Bart wil dat nieuwe medewerkers áltijd snel hun weg vinden.
 */

import { Link } from 'react-router-dom';
import { BRANDING } from '../branding';

export function Footer() {
  const jaar = new Date().getFullYear();
  return (
    <footer className="mt-12 border-t border-primary-100 bg-white/80">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Links-grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-primary-900 mb-2">In de tool</h4>
            <ul className="space-y-1.5 text-sm text-gray-700">
              <li><Link to="/projecten" className="hover:text-primary-700">📋 Projecten</Link></li>
              <li><Link to="/kennisbank" className="hover:text-primary-700">📚 Kennisbank</Link></li>
              <li>
                <Link to="/kennisbank" className="text-xs text-gray-500 hover:text-primary-700">
                  → Scan-checklist
                </Link>
              </li>
              <li>
                <Link to="/kennisbank" className="text-xs text-gray-500 hover:text-primary-700">
                  → Werkwijze verduurzamingsrapport
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-primary-900 mb-2">Partners</h4>
            <ul className="space-y-1.5 text-sm text-gray-700">
              <li>
                <a href="https://opnaarnul.nl" target="_blank" rel="noreferrer" className="hover:text-primary-700">
                  Op Naar Nul ↗
                </a>
              </li>
              <li>
                <a href="https://sportiefopgewekt.nl" target="_blank" rel="noreferrer" className="hover:text-primary-700">
                  Sportief Opgewekt ↗
                </a>
              </li>
              <li>
                <a href="https://www.sportnlgroen.nl/sportnlgroen/" target="_blank" rel="noreferrer" className="hover:text-primary-700">
                  Sport NL Groen ↗
                </a>
              </li>
              <li>
                <a href="https://sws.nl" target="_blank" rel="noreferrer" className="hover:text-primary-700">
                  Stichting Waarborgfonds Sport ↗
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-primary-900 mb-2">Contact</h4>
            <ul className="space-y-1.5 text-sm text-gray-700">
              <li>
                <a href={`mailto:${BRANDING.contactEmail}`} className="hover:text-primary-700">
                  {BRANDING.contactEmail}
                </a>
              </li>
              <li className="text-xs text-gray-500 pt-1">
                Vragen over de tool? Bart Cornelissen
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-4 border-t border-primary-100 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <img src={BRANDING.logo.primary} alt="" className="h-5 w-auto opacity-70" />
            <span>© {jaar} {BRANDING.organisatieNaam} · {BRANDING.applicatieNaam}</span>
          </div>
          <span>
            Website gemaakt door <span className="font-medium text-primary-700">Bart Cornelissen</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
