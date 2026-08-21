import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'north-pole-night': '#0b1220',
        'aurora-teal': '#2dd4bf',
        'santa-red': '#dc2626',
      },
    },
  },
  plugins: [],
};

export default config;
