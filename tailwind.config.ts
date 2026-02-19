import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        primary: {
          DEFAULT: "rgb(var(--ui-primary-rgb) / <alpha-value>)",
          light: "rgb(var(--ui-primary-light-rgb) / <alpha-value>)",
          dark: "rgb(var(--ui-primary-dark-rgb) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--ui-accent-rgb) / <alpha-value>)",
          light: "rgb(var(--ui-accent-light-rgb) / <alpha-value>)",
          dark: "rgb(var(--ui-accent-dark-rgb) / <alpha-value>)",
        },
        dark: {
          DEFAULT: "rgb(var(--ui-dark-rgb) / <alpha-value>)",
          light: "rgb(var(--ui-dark-light-rgb) / <alpha-value>)",
          lighter: "rgb(var(--ui-dark-lighter-rgb) / <alpha-value>)",
        },
        gray: {
          300: "rgb(var(--ui-gray-300-rgb) / <alpha-value>)",
          400: "rgb(var(--ui-gray-400-rgb) / <alpha-value>)",
          500: "rgb(var(--ui-gray-500-rgb) / <alpha-value>)",
          600: "rgb(var(--ui-gray-600-rgb) / <alpha-value>)",
          700: "rgb(var(--ui-gray-700-rgb) / <alpha-value>)",
          800: "rgb(var(--ui-gray-800-rgb) / <alpha-value>)",
          900: "rgb(var(--ui-gray-900-rgb) / <alpha-value>)",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-up": {
          "0%": { transform: "translateY(20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "slide-down": {
          "0%": { transform: "translateY(-20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "pulse-slow": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.5s ease-out",
        "slide-up": "slide-up 0.6s ease-out",
        "slide-down": "slide-down 0.6s ease-out",
        "pulse-slow": "pulse-slow 3s infinite",
        "float": "float 3s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
