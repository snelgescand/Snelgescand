/**
 * Toont in real-time of de huidige draft is opgeslagen, wordt opgeslagen, of foutgaat.
 * Volgens Bart belangrijk: het adres bleek soms niet opgeslagen — nu zichtbaar.
 */

import { useEffect, useState } from 'react';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface Props {
  status: SaveStatus;
  laatsteFout?: string;
}

export function SaveIndicator({ status, laatsteFout }: Props) {
  const [recentSaved, setRecentSaved] = useState(false);

  useEffect(() => {
    if (status === 'saved') {
      setRecentSaved(true);
      const t = setTimeout(() => setRecentSaved(false), 2500);
      return () => clearTimeout(t);
    }
  }, [status]);

  if (status === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
        Opslaan…
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-red-600" title={laatsteFout}>
        <span className="w-2 h-2 rounded-full bg-red-500"></span>
        Niet opgeslagen{laatsteFout ? `: ${laatsteFout}` : ''}
      </span>
    );
  }

  if (recentSaved) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-primary-700">
        <span className="w-2 h-2 rounded-full bg-primary-500"></span>
        Opgeslagen ✓
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
      <span className="w-2 h-2 rounded-full bg-gray-300"></span>
      Bij wijzigingen automatisch opgeslagen
    </span>
  );
}
