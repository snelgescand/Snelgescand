import { Link } from 'react-router-dom';
import { BRANDING } from '../branding';

interface AppHeaderProps {
  rechts?: React.ReactNode;
}

export function AppHeader({ rechts }: AppHeaderProps) {
  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
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
        {rechts && <div className="flex items-center gap-3 text-sm">{rechts}</div>}
      </div>
    </header>
  );
}
