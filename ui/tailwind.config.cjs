const colors = require('tailwindcss/colors');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    colors: {
      transparent: 'transparent',
      white: colors.white,
      gray: {
        950: '#0d1117',
        900: '#161b22',
        800: '#1f2937',
        700: '#374151',
        600: '#4b5563',
        400: '#9ca3af',
        300: '#d1d5db',
        200: '#e5e7eb',
      },
      blue: {
        600: '#2563eb',
        500: '#3b82f6',
      },
      green: {
        500: '#22c55e',
        400: '#4ade80',
      },
      red: {
        600: '#dc2626',
        500: '#ef4444',
      }
    },
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};