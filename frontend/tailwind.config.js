/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // ダークモードのベース色
        "trading-black": "#050B14",
        "trading-gray": "#0A1628",
        "trading-light": "#122236",

        // アクセントカラー
        "accent-primary": "#0EA5E9",
        "accent-glow": "#38BDF8",
        "accent-success": "#0284C7",
        "accent-danger": "#E11D48",
        "accent-green": "#0EA5E9",
        "accent-blue": "#38BDF8",

        // テキストカラー
        "text-primary": "#F0F9FF",
        "text-secondary": "#94A3B8",
        "text-blue": "#7DD3FC",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      boxShadow: {
        "glow-sm": "0 0 10px rgba(14, 165, 233, 0.2)",
        glow: "0 0 20px rgba(14, 165, 233, 0.25)",
        "glow-lg": "0 0 30px rgba(14, 165, 233, 0.3)",
      },
      backdropBlur: {
        xs: "2px",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
};
