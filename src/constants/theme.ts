export const Colors = {
  bg: {
    primary: '#050508',
    secondary: '#0c0c11',
    card: '#131319',
    elevated: '#1c1c24',
    surface3: '#262630',
  },
  text: {
    bright: '#ffffff',
    dim: 'rgba(255,255,255,0.62)',
    muted: 'rgba(255,255,255,0.38)',
    subtle: 'rgba(255,255,255,0.22)',
  },
  gradient: {
    primary: ['#9333ea', '#ec4899', '#f97316'] as const,
    subtle: ['rgba(147,51,234,0.2)', 'rgba(236,72,153,0.2)'] as const,
    dark: ['rgba(5,5,8,0)', 'rgba(5,5,8,0.8)', '#050508'] as const,
  },
  border: 'rgba(255,255,255,0.07)',
  borderStrong: 'rgba(255,255,255,0.14)',
  accent: '#9333ea',
  accentBlue: '#4f8ef7',
  accentPink: '#ec4899',
  success: '#22c55e',
  error: '#e8453c',
  gold: '#f0ac3a',
  silver: '#94a3b8',
  bronze: '#b45309',
} as const;

export const Typography = {
  heading: 'Syne_700Bold',
  headingExtra: 'Syne_800ExtraBold',
  headingRegular: 'Syne_400Regular',
  body: 'PlusJakartaSans_400Regular',
  bodyMedium: 'PlusJakartaSans_500Medium',
  bodySemiBold: 'PlusJakartaSans_600SemiBold',
  bodyBold: 'PlusJakartaSans_700Bold',
} as const;

export const Radius = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 14,
  xl: 20,
  pill: 99,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 30,
  display: 38,
} as const;
