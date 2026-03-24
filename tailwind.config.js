/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/**/*.{js,ts,jsx,tsx,html}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        // Apple SF Pro style - use system fonts
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Display',
          'SF Pro Text',
          'Helvetica Neue',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'SF Mono',
          'Monaco',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },
      colors: {
        // Apple's exact color palette
        apple: {
          // Backgrounds
          white: '#FFFFFF',
          gray: {
            50: '#FBFBFD',   // Lightest bg
            100: '#F5F5F7',  // Apple.com bg
            200: '#E8E8ED',  // Card bg
            300: '#D2D2D7',  // Border
            400: '#AEAEB2',  // Disabled
            500: '#86868B',  // Secondary text
            600: '#6E6E73',  // Tertiary
            700: '#48484A',  // Dark mode text
            800: '#3A3A3C',  // Dark mode secondary
            900: '#1D1D1F',  // Primary text
          },
          // Accent colors (iOS system colors)
          blue: '#007AFF',    // Primary action
          green: '#34C759',   // Success
          orange: '#FF9500',  // Warning
          red: '#FF3B30',     // Destructive
          purple: '#AF52DE',  // Accent
          teal: '#5AC8FA',    // Info
        },
      },
      boxShadow: {
        // Apple's subtle shadows
        'apple-sm': '0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.06)',
        'apple': '0 2px 8px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.06)',
        'apple-lg': '0 4px 16px rgba(0, 0, 0, 0.06), 0 8px 24px rgba(0, 0, 0, 0.08)',
        'apple-xl': '0 8px 32px rgba(0, 0, 0, 0.08), 0 16px 48px rgba(0, 0, 0, 0.12)',
      },
      borderRadius: {
        'apple-sm': '6px',
        'apple': '10px',
        'apple-lg': '14px',
        'apple-xl': '20px',
      },
      fontSize: {
        // Apple typography scale
        'apple-xs': ['11px', { lineHeight: '1.3', letterSpacing: '0.01em' }],
        'apple-sm': ['13px', { lineHeight: '1.4', letterSpacing: '0.01em' }],
        'apple-base': ['15px', { lineHeight: '1.47', letterSpacing: '-0.01em' }],
        'apple-lg': ['17px', { lineHeight: '1.47', letterSpacing: '-0.02em' }],
        'apple-xl': ['21px', { lineHeight: '1.38', letterSpacing: '-0.02em' }],
        'apple-2xl': ['28px', { lineHeight: '1.29', letterSpacing: '-0.02em' }],
        'apple-3xl': ['40px', { lineHeight: '1.2', letterSpacing: '-0.03em' }],
      },
      transitionTimingFunction: {
        'apple': 'cubic-bezier(0.25, 0.1, 0.25, 1)',
      },
      transitionDuration: {
        'apple': '250ms',
      },
      animation: {
        'fade-in': 'fadeIn 0.25s cubic-bezier(0.25, 0.1, 0.25, 1)',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)',
        'scale-in': 'scaleIn 0.2s cubic-bezier(0.25, 0.1, 0.25, 1)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
