import type { Config } from "tailwindcss";
const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        meridian: {
          navy: "#0F1B2D",
          blue: "#1D6FA4",
          green: "#1A7A5E",
          light: "#D5E8F0",
        },
      },
    },
  },
  plugins: [],
};
export default config;
