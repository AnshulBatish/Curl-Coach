/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand palette - "fitness analytics" violet/cyan accent on a deep slate base.
        brand: {
          50:  '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
        accent: {
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(15, 23, 42, 0.5), 0 8px 24px -12px rgba(15, 23, 42, 0.6)',
        glow: '0 0 0 1px rgba(139, 92, 246, 0.35), 0 8px 30px -12px rgba(139, 92, 246, 0.45)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(139, 92, 246, 0.45)' },
          '50%':      { boxShadow: '0 0 0 8px rgba(139, 92, 246, 0)' },
        },
        floatUp: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-6px)' },
        },
        floatDown: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(6px)' },
        },
      },
      animation: {
        pulseGlow: 'pulseGlow 1.6s ease-in-out infinite',
        floatUp:   'floatUp 1.0s ease-in-out infinite',
        floatDown: 'floatDown 1.0s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
