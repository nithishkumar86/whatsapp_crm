import type { Config } from 'tailwindcss';

const config: Config = {
  // Dark mode is toggled by adding/removing the `dark` class on <html>
  // (driven by components/ThemeToggle.tsx + the no-FOUC script in app/layout.tsx).
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
