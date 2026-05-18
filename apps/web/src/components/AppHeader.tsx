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
            src={BRANDING.logo.src}
            alt={BRANDING.logo.alt}
            style={{ height: BRANDING.logo.height }}
          />
        </Link>
        {rechts && <div className="flex items-center gap-3 text-sm">{rechts}</div>}
      </div>
    </header>
  );
}
