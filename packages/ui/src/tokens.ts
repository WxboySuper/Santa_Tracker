/**
 * Design tokens — seasonal, accessible, and framework-agnostic.
 */

export const colors = {
  northPoleNight: '#0b1220',
  auroraTeal: '#2dd4bf',
  santaRed: '#dc2626',
  snow: '#f8fafc',
  evergreen: '#14532d',
} as const;

export const radius = {
  sm: '0.375rem',
  md: '0.75rem',
  lg: '1.5rem',
} as const;

export const motion = {
  durationFastMs: 150,
  durationMediumMs: 300,
  easingDefault: 'cubic-bezier(0.2, 0, 0, 1)',
} as const;
