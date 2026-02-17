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
          primary: "#08090c",
          secondary: "#0e1015",
          tertiary: "#14171e",
          hover: "#1c2028",
        },
        accent: {
          cyan: "#00e5ff",
          pink: "#c2185b",
          yellow: "#fdd835",
          white: "#f5f5f5",
        },
        text: {
          primary: "#f5f5f5",
          secondary: "#9e9e9e",
          muted: "#616161",
        },
        border: {
          primary: "#1a1e28",
          hover: "#2a2e38",
        },
      },
      fontFamily: {
        display: ["Rajdhani", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
