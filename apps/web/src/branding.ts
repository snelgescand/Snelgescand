/**
 * Sportief Opgewekt branding-tokens.
 *
 * Eén bron van waarheid voor alle branding. Wijzigen op deze plek werkt
 * automatisch door in:
 *   - Tailwind theme (zie tailwind.config.js)
 *   - SVG-logo's
 *   - PPT-export (via API-call die deze waarden meestuurt)
 *
 * Vervang de kleuren en URL's hieronder door de échte huisstijl van
 * Sportief Opgewekt zodra je die hebt (te halen uit de bestaande
 * PowerPoint-template of het Excel-rekenmodel).
 */

export const BRANDING = {
  // Hoofdkleuren
  primary: '#16a34a',          // groen — vervang met SO-groen
  primaryDark: '#14532d',
  primaryLight: '#dcfce7',
  secondary: '#0891b2',        // turquoise — vervang met SO-blauw
  accent: '#f59e0b',           // amber — voor highlights

  // Neutralen
  text: '#1f2937',
  textMuted: '#64748b',
  border: '#e5e7eb',
  background: '#f9fafb',

  // Logo en assets
  logo: {
    src: '/branding/logo.svg',   // staat in public/branding/
    height: 32,                   // px in header
    alt: 'Sportief Opgewekt',
  },

  // Tekst
  applicatieNaam: 'Sportief Opgewekt',
  applicatieOndertitel: 'Verduurzamen begint met inzicht',
  footerTekst: 'Sportief Opgewekt · Snelgescand.nl',

  // Externe links
  websiteUrl: 'https://snelgescand.nl',
  contactEmail: 'info@snelgescand.nl',
} as const;

export type Branding = typeof BRANDING;
