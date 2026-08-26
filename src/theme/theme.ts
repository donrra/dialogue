/**
 * Dialogue design system.
 * One source of truth for colors, spacing, radii, typography and shadows.
 * Keep components free of hard-coded hex values — always reference these tokens.
 */

export const colors = {
  // Backgrounds — deep, calm, premium dark.
  bg: '#0B0B12',
  bgElevated: '#13131D',
  surface: '#1A1A26',
  surfaceHi: '#22222F',
  surfacePressed: '#2A2A38',

  // Borders / hairlines.
  border: '#262633',
  borderHi: '#34344A',

  // Text.
  text: '#F4F4F8',
  textMuted: '#A0A0B2',
  textFaint: '#6A6A80',

  // Brand accent — warm violet → indigo, feels like "voice / intelligence".
  accent: '#7C6CFF',
  accentSoft: '#9A8DFF',
  accentDim: '#2A2545',

  // Live recording.
  record: '#FF4D6D',
  recordSoft: '#FF7A92',
  recordDim: '#3A1F2A',

  // Status.
  success: '#34D399',
  warning: '#FBBF24',
  danger: '#FB7185',

  // Pure helpers.
  black: '#000000',
  white: '#FFFFFF',
} as const;

/** Distinct, legible colors assigned to speakers/participants. */
export const speakerColors = [
  '#7C6CFF',
  '#34D399',
  '#FBBF24',
  '#FB7185',
  '#38BDF8',
  '#F472B6',
  '#A3E635',
  '#FB923C',
] as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const font = {
  // System font stack — crisp and native on both platforms.
  size: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 22,
    xxl: 28,
    display: 40,
  },
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
} as const;

export const shadow = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8,
  },
  glow: {
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
  },
} as const;

export function speakerColorFor(index: number): string {
  return speakerColors[index % speakerColors.length];
}
