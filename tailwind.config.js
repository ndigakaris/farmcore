/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html','./src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        green: {
          50:'#eef5dd', 100:'#d8e8b5', 200:'#b5c98a', 300:'#8eb85e',
          400:'#6B7C3A', 500:'#4e8628', 600:'#3d6b1f', 700:'#2D5016',
          800:'#1e3a0f', 900:'#1a3009',
        },
        cream: { DEFAULT:'#F5F0E8', dark:'#e8e0d0', darker:'#d8cfc0' },
        brown: { DEFAULT:'#8B6340', light:'#c4a882' },
        gold: { DEFAULT:'#C9A84C', light:'#e8c97a' },
      },
      fontFamily: {
        display: ['"Fraunces"','serif'],
        body: ['"DM Sans"','sans-serif'],
      },
    },
  },
  plugins: [],
}
