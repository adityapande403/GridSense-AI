/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        grid: {
          dark: '#0f172a',
          card: '#1e293b',
          border: '#334155',
          hv: '#ef4444',     // 33 kV Red
          mv: '#3b82f6',     // 11 kV Blue
          lv: '#10b981',     // 415 V Green
          accent: '#06b6d4', // Cyan
        }
      }
    },
  },
  plugins: [],
}
