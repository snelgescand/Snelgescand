import { Link, useLocation } from 'react-router-dom';
import { BRANDING } from '../branding';

interface AppHeaderProps {
  /** Optionele extra elementen rechts naast de standaard-navigatie */
  rechts?: React.ReactNode;
}

/**
 * App-header met vaste hoofdnavigatie (Projecten + Kennisbank) en logo.
 *
 * v29: hoofdnavigatie is altijd prominent zichtbaar; actieve pagina krijgt
 * een onderlijn-accent. Caller mag aanvullende elementen rechts toevoegen
 * (bv. "← Terug"-knoppen) via de `rechts`-prop.
 */
export function AppHeader({ rechts }: AppHeaderProps) {
  const { pathname } = useLocation();
  const isProjecten = pathname.startsWith('/projecten');
  const isKennisbank = pathname.startsWith('/kennisbank');
  const isBeheer = pathname.startsWith('/beheer');

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
        <Link to="/" className="flex items-center gap-3 shrink-0">
          <img
            src={BRANDING.logo.primary}
            alt={BRANDING.logo.primaryAlt}
            className="h-10 w-auto"
          />
          <div className="leading-tight">
            <div className="text-lg font-bold text-primary-700">{BRANDING.applicatieNaam}</div>
            <div className="text-xs text-gray-500">een platform van {BRANDING.organisatieNaam}</div>
          </div>
        </Link>

        {/* Hoofdnavigatie — prominent in het midden / rechts */}
        <nav className="flex items-center gap-1">
          <Link
            to="/projecten"
            className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors border-b-2 ${
              isProjecten
                ? 'text-primary-900 border-accent-orange bg-primary-50/50'
                : 'text-gray-700 border-transparent hover:text-primary-700 hover:bg-gray-50'
            }`}
          >
            📋 Projecten
          </Link>
          <Link
            to="/kennisbank"
            className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors border-b-2 ${
              isKennisbank
                ? 'text-primary-900 border-accent-orange bg-primary-50/50'
                : 'text-gray-700 border-transparent hover:text-primary-700 hover:bg-gray-50'
            }`}
          >
            📚 Kennisbank
          </Link>
          <Link
            to="/beheer"
            className={`px-3 py-2 text-sm rounded-md transition-colors border-b-2 ${
              isBeheer
                ? 'text-primary-900 border-accent-orange bg-primary-50/50'
                : 'text-gray-500 border-transparent hover:text-primary-700 hover:bg-gray-50'
            }`}
            title="Beheer"
          >
            ⚙️
          </Link>
        </nav>

        {rechts && <div className="flex items-center gap-3 text-sm">{rechts}</div>}
      </div>
    </header>
  );
}
