/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "trading-black": "#0A0A0F",
        "trading-gray": "#14141F",
        "trading-light": "#1E1E2D",
        "accent-green": "#00E8B5",
        "accent-red": "#FF4471",
        "accent-blue": "#3B82F6",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 20px rgba(0, 232, 181, 0.15)",
      },
    },
  },
};
