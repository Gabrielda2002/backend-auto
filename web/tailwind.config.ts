import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

/**
 * Tokens M3 portados desde el designTheme de Stitch (project 8294010403954932792).
 * Los valores hex viven como CSS variables HSL en src/index.css (light/dark).
 * Aqui solo se referencian via hsl(var(--token)) para soportar dark mode.
 */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ----- Brand corporativo (fijo, no cambia con tema) -----
        'corporate-navy': '#0B3B5E',
        'corporate-turquoise': '#1F8E8E',
        'normative-red': '#D32F2F',
        'normative-amber': '#FBC02D',
        'normative-green': '#2E7D32',
        'status-low': '#D32F2F',
        'status-on-target': '#10B981',
        'status-over': '#8B5CF6',
        // ----- M3 tokens (responden a CSS vars) -----
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        surface: {
          DEFAULT: 'hsl(var(--surface))',
          bright: 'hsl(var(--surface-bright))',
          dim: 'hsl(var(--surface-dim))',
          variant: 'hsl(var(--surface-variant))',
          tint: 'hsl(var(--surface-tint))',
        },
        'surface-container': {
          DEFAULT: 'hsl(var(--surface-container))',
          lowest: 'hsl(var(--surface-container-lowest))',
          low: 'hsl(var(--surface-container-low))',
          high: 'hsl(var(--surface-container-high))',
          highest: 'hsl(var(--surface-container-highest))',
        },
        'on-surface': {
          DEFAULT: 'hsl(var(--on-surface))',
          variant: 'hsl(var(--on-surface-variant))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          container: 'hsl(var(--primary-container))',
          fixed: 'hsl(var(--primary-fixed))',
        },
        'on-primary': {
          DEFAULT: 'hsl(var(--on-primary))',
          container: 'hsl(var(--on-primary-container))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          container: 'hsl(var(--secondary-container))',
        },
        'on-secondary': {
          DEFAULT: 'hsl(var(--on-secondary))',
          container: 'hsl(var(--on-secondary-container))',
        },
        tertiary: {
          DEFAULT: 'hsl(var(--tertiary))',
          container: 'hsl(var(--tertiary-container))',
        },
        'on-tertiary': {
          DEFAULT: 'hsl(var(--on-tertiary))',
          container: 'hsl(var(--on-tertiary-container))',
        },
        error: {
          DEFAULT: 'hsl(var(--error))',
          container: 'hsl(var(--error-container))',
        },
        'on-error': {
          DEFAULT: 'hsl(var(--on-error))',
          container: 'hsl(var(--on-error-container))',
        },
        outline: {
          DEFAULT: 'hsl(var(--outline))',
          variant: 'hsl(var(--outline-variant))',
        },
        // ----- shadcn aliases -----
        border: 'hsl(var(--outline-variant))',
        input: 'hsl(var(--outline-variant))',
        ring: 'hsl(var(--primary))',
        card: {
          DEFAULT: 'hsl(var(--surface-container-lowest))',
          foreground: 'hsl(var(--on-surface))',
        },
        popover: {
          DEFAULT: 'hsl(var(--surface-container-lowest))',
          foreground: 'hsl(var(--on-surface))',
        },
        muted: {
          DEFAULT: 'hsl(var(--surface-container))',
          foreground: 'hsl(var(--on-surface-variant))',
        },
        accent: {
          DEFAULT: 'hsl(var(--secondary-container))',
          foreground: 'hsl(var(--on-secondary-container))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--error))',
          foreground: 'hsl(var(--on-error))',
        },
      },
      borderRadius: {
        DEFAULT: '0.125rem',
        sm: '0.25rem',
        md: '0.5rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
      },
      spacing: {
        xs: '4px',
        sm: '12px',
        base: '8px',
        md: '24px',
        lg: '40px',
        xl: '64px',
        gutter: '24px',
        margin: '32px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-lg': ['48px', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-lg': ['32px', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '600' }],
        'headline-md': ['24px', { lineHeight: '1.3', fontWeight: '600' }],
        'title-lg': ['20px', { lineHeight: '1.4', fontWeight: '600' }],
        'body-lg': ['16px', { lineHeight: '1.6', fontWeight: '400' }],
        'body-md': ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        'label-md': ['12px', { lineHeight: '1.2', letterSpacing: '0.05em', fontWeight: '600' }],
      },
      boxShadow: {
        card: '0 4px 12px rgba(0, 0, 0, 0.05)',
        'card-hover': '0 8px 24px rgba(0, 0, 0, 0.08)',
        soft: '0 4px 20px rgba(0, 0, 0, 0.05)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [animate],
} satisfies Config;
