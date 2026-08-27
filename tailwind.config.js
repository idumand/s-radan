/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#0B0E14',
          800: '#151921',
          700: '#1E232F',
          600: '#2A3142',
        },
        brand: {
          500: '#00D09C',
          600: '#00B083',
          400: '#33DCB0',
        }
      }
    },
  },
  plugins: [],
}
