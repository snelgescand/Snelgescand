/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#E6F1F3',
          100: '#C1DDE2',
          200: '#90C2C9',
          300: '#5DA4AE',
          400: '#308896',
          500: '#117285',
          600: '#006579',
          700: '#005465',
          800: '#003F4D',
          900: '#042d34',
          950: '#021A1F',
        },
        accent: {
          orange: '#DE533E',
          'orange-light': '#F2A192',
          'orange-dark': '#B43924',
        },
        sunrise: {
          DEFAULT: '#FFEFCE',
          light: '#FFF8E7',
          dark: '#F5DDA8',
        },
        secondary: {
          500: '#2F3E8E',
          600: '#1F2D7A',
        },
      },
      backgroundImage: {
        'sunrise-gradient': 'linear-gradient(180deg, #FFF8E7 0%, #FFEFCE 100%)',
      },
      fontFamily: {
        sans: ['Montserrat', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        display: ['Montserrat', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 1px 3px rgba(4, 45, 52, 0.06), 0 4px 12px rgba(4, 45, 52, 0.04)',
        'card-hover': '0 4px 12px rgba(4, 45, 52, 0.08), 0 12px 32px rgba(4, 45, 52, 0.06)',
      },
    },
  },
  plugins: [],
};
