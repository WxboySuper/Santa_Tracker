/** Shared design tokens. Keep these values independent of a rendering framework. */

export const colors = {
  northPoleNight: '#0b1220',
  auroraTeal: '#2dd4bf',
  santaRed: '#dc2626',
  snow: '#f8fafc',
  evergreen: '#14532d',
  midnight: '#111827',
  slate: '#475569',
  frost: '#e2e8f0',
  focus: '#facc15',
  danger: '#b91c1c',
} as const;

export const typography = {
  fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  displaySize: 'clamp(2rem, 5vw, 3.75rem)',
  bodySize: '1rem',
  smallSize: '0.875rem',
  lineHeightBody: 1.5,
  lineHeightTight: 1.15,
} as const;

export const spacing = {
  xs: '0.25rem',
  sm: '0.5rem',
  md: '1rem',
  lg: '1.5rem',
  xl: '2rem',
  '2xl': '3rem',
} as const;

export const layers = {
  base: 0,
  raised: 10,
  overlay: 20,
  modal: 30,
  toast: 40,
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
  reducedDurationMs: 0,
} as const;

export const focus = {
  color: colors.focus,
  width: '3px',
  offset: '2px',
} as const;

export const seasonalStates = {
  default: { accent: colors.santaRed, background: colors.northPoleNight },
  aurora: { accent: colors.auroraTeal, background: colors.midnight },
  evergreen: { accent: colors.evergreen, background: colors.snow },
  highContrast: { accent: colors.focus, background: '#000000' },
} as const;
