import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "#0a0b0d",
          secondary: "#12141a",
          tertiary: "#1a1d26",
          hover: "#22262f",
        },
        accent: {
          green: "#00d4aa",
          red: "#ff4757",
          blue: "#4a9eff",
          purple: "#a855f7",
          yellow: "#fbbf24",
        },
        text: {
          primary: "#f1f5f9",
          secondary: "#94a3b8",
          muted: "#64748b",
        },
        border: {
          primary: "#1e2330",
          hover: "#2a3040",
        },
      },
      fontFamily: {
        mono: ["var(--font-geist-mono)", "monospace"],
        sans: ["var(--font-geist-sans)", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
