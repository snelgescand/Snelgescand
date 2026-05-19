/**
 * Branding-tokens voor Snelgescand.nl — een Op Naar Nul-platform.
 *
 * Kleuren overgenomen uit de echte Op Naar Nul-huisstijl (opnaarnul.nl):
 *  - Teal/petrol  #006579  (hoofdkleur, logo)
 *  - Donkere teal #042d34  (donkere tekst, accenten)
 *  - Oranje       #DE533E  (call-to-action, highlights)
 *  - Crème        #FFEFCE  ("sunrise"-achtergrondkleur)
 */

export const BRANDING = {
  primary: '#006579',
  primaryDark: '#042d34',
  primaryLight: '#E0F2F5',
  accentOrange: '#DE533E',
  sunrise: '#FFEFCE',

  // Sportief Opgewekt accent
  secondary: '#1F2D7A',

  // Logo's en assets
  logo: {
    primary: '/branding/op-naar-nul.png',
    primaryAlt: 'Op Naar Nul',
    secondary: '/branding/sportief-opgewekt.png',
    secondaryAlt: 'Sportief Opgewekt',
    height: 40,
  },

  applicatieNaam: 'Snelgescand.nl',
  applicatieOndertitel: 'Snelle energiescan op locatie',
  organisatieNaam: 'Op Naar Nul',
  footerTekst: 'Snelgescand.nl · Een platform van Op Naar Nul',

  websiteUrl: 'https://opnaarnul.nl',
  contactEmail: 'info@opnaarnul.nl',
} as const;

export type Branding = typeof BRANDING;
