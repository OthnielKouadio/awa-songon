import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F7FBFF", // fond
        ink: "#0A1931", // texte / bordures
        azur: "#0096FF", // accent
        sky: "#E0F2FF", // fond badges
        mist: "#EDF6FF", // fond cartes
        steel: "#C9D5E3", // état OFF
        danger: "#D6404A", // erreurs uniquement
      },
      fontFamily: {
        display: ['"Clash Display"', "var(--font-sora)", "Sora", "system-ui", "sans-serif"],
        sans: ["var(--font-grotesk)", '"Space Grotesk"', "system-ui", "sans-serif"],
      },
      borderWidth: { brut: "2px" },
      borderRadius: { brut: "24px" },
      boxShadow: {
        hard: "4px 4px 0px #0A1931",
        "hard-sm": "3px 3px 0px #0A1931",
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: { rise: "rise .5s ease-out both" },
    },
  },
  plugins: [],
};

export default config;
