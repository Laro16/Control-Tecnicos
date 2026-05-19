/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          light: '#f3f4f6', // gris claro
          blue: '#bfdbfe', // azul suave
          dark: '#111827', // negro/oscuro
        }
      }
    },
  },
  plugins: [],
}
