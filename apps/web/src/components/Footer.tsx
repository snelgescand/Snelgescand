/**
 * Footer met copyright + credit.
 *
 * Vermeldt Op Naar Nul als platform-eigenaar en Bart Cornelissen
 * als ontwikkelaar/maker.
 */

import { BRANDING } from '../branding';

export function Footer() {
  const jaar = new Date().getFullYear();
  return (
    <footer className="mt-12 border-t border-primary-100 bg-white/60 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-600">
        <div className="flex items-center gap-2">
          <img src={BRANDING.logo.primary} alt="" className="h-5 w-auto opacity-70" />
          <span>© {jaar} {BRANDING.organisatieNaam} · {BRANDING.applicatieNaam}</span>
        </div>
        <div className="flex items-center gap-3">
          <a href={BRANDING.websiteUrl} target="_blank" rel="noreferrer" className="hover:text-primary-700">
            opnaarnul.nl ↗
          </a>
          <span className="text-gray-400">·</span>
          <span>
            Website gemaakt door{' '}
            <span className="font-medium text-primary-700">Bart Cornelissen</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
