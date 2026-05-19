/**
 * Tooltip met "i"-icon dat bij hover/click uitleg toont.
 *
 * Gebruik:
 *   <Label>Bouwjaar <InfoTooltip>Het jaar waarin het clubhuis is opgeleverd...</InfoTooltip></Label>
 *
 * Op desktop: hover. Op mobiel: tap (toggle).
 */

import { useState, type ReactNode } from 'react';

interface InfoTooltipProps {
  children: ReactNode;
  /** Optioneel: positie t.o.v. icon, default 'top' */
  positie?: 'top' | 'bottom' | 'left' | 'right';
}

export function InfoTooltip({ children, positie = 'top' }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);

  const positieClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <span className="relative inline-flex ml-1.5 align-middle">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={(e) => { e.preventDefault(); setOpen(o => !o); }}
        onBlur={() => setOpen(false)}
        className="w-4 h-4 rounded-full bg-primary-100 hover:bg-primary-200 text-primary-700 text-[10px] font-bold inline-flex items-center justify-center transition-colors"
        aria-label="Meer informatie"
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          className={`absolute z-50 ${positieClasses[positie]} w-64 p-2.5 bg-gray-900 text-white text-xs rounded-md shadow-lg leading-relaxed`}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          {children}
        </span>
      )}
    </span>
  );
}
