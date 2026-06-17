import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Mavericks 12U sporty theme: black, red (#DC2626), white
        background: "#0A0A0A",
        foreground: "#FFFFFF",
        card: "#121212",
        "card-foreground": "#FFFFFF",
        primary: "#DC2626", // bold red
        "primary-foreground": "#FFFFFF",
        accent: "#B91C1C", // darker red
        "accent-foreground": "#FFFFFF",
        muted: "#1F1F1F",
        "muted-foreground": "#A3A3A3",
        border: "#27272A",
        input: "#1F1F1F",
        ring: "#DC2626",
        // Custom
        mavericks: {
          black: "#0A0A0A",
          red: "#DC2626",
          "red-dark": "#B91C1C",
          white: "#FFFFFF",
          gray: "#1F1F1F",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      borderRadius: {
        lg: "0.625rem",
        md: "calc(0.625rem - 2px)",
        sm: "calc(0.625rem - 4px)",
      },
    },
  },
  plugins: [],
};
export default config;
