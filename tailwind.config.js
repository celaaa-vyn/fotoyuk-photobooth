/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Playful bright palette: vivid blue primary + warm amber accent.
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        accent: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
        },
      },
      fontSize: {
        // Large, kiosk-friendly type scale.
        huge: ['4rem', { lineHeight: '1.05', fontWeight: '800' }],
        big: ['2.5rem', { lineHeight: '1.1', fontWeight: '700' }],
        touch: ['1.5rem', { lineHeight: '1.3', fontWeight: '600' }],
      },
      spacing: {
        // Minimum comfortable touch target.
        touch: '3.5rem', // 56px
        // Safe-area aware spacing using CSS env() values.
        'safe-t': 'env(safe-area-inset-top)',
        'safe-b': 'env(safe-area-inset-bottom)',
        'safe-l': 'env(safe-area-inset-left)',
        'safe-r': 'env(safe-area-inset-right)',
      },
      minHeight: {
        touch: '3.5rem', // 56px
      },
      minWidth: {
        touch: '3.5rem', // 56px
      },
      padding: {
        'safe-t': 'env(safe-area-inset-top)',
        'safe-b': 'env(safe-area-inset-bottom)',
        'safe-l': 'env(safe-area-inset-left)',
        'safe-r': 'env(safe-area-inset-right)',
      },
      backgroundImage: {
        // Soft playful backdrop used on full-screen kiosk steps.
        'kiosk-sky':
          'linear-gradient(160deg, #eff6ff 0%, #dbeafe 45%, #fff7ed 100%)',
      },
      boxShadow: {
        // Friendly raised card / button shadows.
        card: '0 18px 40px -18px rgba(37, 99, 235, 0.35)',
        glow: '0 10px 30px -8px rgba(37, 99, 235, 0.45)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pop': {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        // Gentle slide + fade used when a flow step is remounted.
        'step-in': {
          '0%': { opacity: '0', transform: 'translateY(18px) scale(0.985)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        // Slow drifting background sheen for a lively but calm feel.
        'float-slow': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.35s ease-out',
        pop: 'pop 0.25s ease-out',
        'step-in': 'step-in 0.45s cubic-bezier(0.22, 1, 0.36, 1)',
        'float-slow': 'float-slow 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
