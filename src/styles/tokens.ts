/**
 * Design Tokens Configuration
 * 
 * Defining the core design constants for the Starseed System.
 * These tokens can be used to drive Tailwind configuration or direct CSS-in-JS.
 */

export const tokens = {
  colors: {
    brand: {
      primary: 'hsl(var(--primary))',
      secondary: 'hsl(var(--secondary))',
      accent: 'hsl(var(--accent))',
    },
    background: 'hsl(var(--background))',
    foreground: 'hsl(var(--foreground))',
  },
  spacing: {
    base: '4px',
    unit: 4,
  },
  typography: {
    fonts: {
      sans: 'var(--font-sans)',
      mono: 'var(--font-mono)',
    },
    sizes: {
      xs: '0.75rem',
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
    },
  },
} as const;
