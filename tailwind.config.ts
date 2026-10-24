import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Literal values (same hexes as the CSS vars in globals.css) so
        // Tailwind opacity modifiers like border-line/60 resolve.
        bg: '#0f0f0f',
        surface: '#1a1a1a',
        line: '#2a2a2a',
        paper: {
          DEFAULT: '#f4efe6',
          70: 'rgba(244, 239, 230, 0.7)',
          60: 'rgba(244, 239, 230, 0.6)',
          40: 'rgba(244, 239, 230, 0.4)',
          15: 'rgba(244, 239, 230, 0.15)',
          12: 'rgba(244, 239, 230, 0.12)',
        },
        kraft: {
          DEFAULT: '#d9c7a7',
          60: 'rgba(217, 199, 167, 0.6)',
          30: 'rgba(217, 199, 167, 0.3)',
          12: 'rgba(217, 199, 167, 0.12)',
        },
        ink: '#16130f',
        vermilion: {
          DEFAULT: '#e5391f',
          20: 'rgba(229, 57, 31, 0.2)',
        },
        moss: {
          DEFAULT: '#3e5641',
          bright: '#6f8f73',
        },
        transit: '#7a96b8',
        // shadcn semantic tokens (dark-first mapping)
        border: '#2a2a2a',
        input: '#333333',
        ring: '#e5391f',
        background: '#0f0f0f',
        foreground: '#f4efe6',
        primary: {
          DEFAULT: '#e5391f',
          foreground: '#f4efe6',
        },
        secondary: {
          DEFAULT: 'rgba(217, 199, 167, 0.12)',
          foreground: '#f4efe6',
        },
        muted: {
          DEFAULT: 'rgba(244, 239, 230, 0.12)',
          foreground: 'rgba(244, 239, 230, 0.6)',
        },
        accent: {
          DEFAULT: 'rgba(217, 199, 167, 0.12)',
          foreground: '#f4efe6',
        },
        destructive: {
          DEFAULT: '#e5391f',
          foreground: '#f4efe6',
        },
        card: {
          DEFAULT: '#1a1a1a',
          foreground: '#f4efe6',
        },
        popover: {
          DEFAULT: '#1a1a1a',
          foreground: '#f4efe6',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-body)', 'Helvetica Neue', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // editorial label sizes from the main site
        micro: ['0.6875rem', { lineHeight: '1.1', letterSpacing: '0.16em' }],
        nano: ['0.625rem', { lineHeight: '1.1', letterSpacing: '0.2em' }],
      },
      borderRadius: {
        card: '4px',
      },
      transitionTimingFunction: {
        paper: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
