/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        court: {
          50: '#eefbf4',
          100: '#d6f5e3',
          500: '#18a558',
          600: '#12854a',
          700: '#106a3c',
        },
      },
    },
  },
  plugins: [],
};
