/**
 * Design tokens for the Satellite Monitoring System.
 * All pages and components import from here for consistency.
 */

// ─── Color Palette ───────────────────────────────────────────────
export const COLORS = {
  // Primary — deep forest green
  primary: '#1B4332',
  primaryDark: '#0D1F18',
  primaryLight: '#2D6A4F',

  // Accent — mid-tone forest green
  accent: '#2D6A4F',
  accentBright: '#52B788',
  accentLight: '#D8F3DC',

  // Surfaces & Backgrounds (Crisp enterprise neutral)
  surface: '#FFFFFF',
  surfaceAlt: '#F8FAFC',
  bg: '#F1F5F9',

  // Borders
  border: '#E2E8F0',
  borderLight: '#EDF2F7',

  // Text (High readability slate/navy)
  text: '#0F172A',
  textMuted: '#475569',
  textLight: '#64748B',

  // Header / Sidebar (Deep Navy-Forest)
  header: '#0D1F18',
  sidebar: '#0D1F18',
  sidebarHover: '#1B4332',
  sidebarActive: 'rgba(82,183,136,0.16)',
  sidebarText: '#ECFDF5',
  sidebarMuted: '#94A3B8',

  // Status — success
  successText: '#166534',
  successBg: '#DCFCE7',
  successBorder: '#BBF7D0',

  // Status — warning
  warningText: '#92400E',
  warningBg: '#FEF3C7',
  warningBorder: '#FDE68A',

  // Status — danger
  dangerText: '#991B1B',
  dangerBg: '#FEE2E2',
  dangerBorder: '#FECACA',

  // Status — info/blue
  infoText: '#1E40AF',
  infoBg: '#DBEAFE',
  infoBorder: '#BFDBFE',

  // Neutral
  neutralText: '#334155',
  neutralBg: '#F1F5F9',
  neutralBorder: '#CBD5E1',
} as const;

// ─── Shadows ─────────────────────────────────────────────────────
export const SHADOWS = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  md: '0 2px 4px -1px rgba(0, 0, 0, 0.06), 0 1px 2px -1px rgba(0, 0, 0, 0.04)',
  lg: '0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
  sidebar: '2px 0 6px rgba(0, 0, 0, 0.15)',
} as const;

// ─── Radii ───────────────────────────────────────────────────────
export const RADII = {
  xs: '2px',
  sm: '4px',
  md: '6px',
  lg: '8px',
  xl: '10px',
  full: '9999px',
} as const;

// ─── Typography ──────────────────────────────────────────────────
export const FONT = {
  family: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`,
  mono: `'JetBrains Mono', 'Fira Code', 'SFMono-Regular', Consolas, Menlo, monospace`,
  sizeXs: '11px',
  sizeSm: '12px',
  sizeMd: '13px',
  sizeLg: '14px',
  sizeXl: '16px',
  size2xl: '18px',
  size3xl: '20px',
  size4xl: '24px',
  weightNormal: 400,
  weightMedium: 500,
  weightSemibold: 600,
  weightBold: 700,
} as const;

// ─── Spacing ─────────────────────────────────────────────────────
export const SPACE = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  '2xl': '24px',
  '3xl': '32px',
} as const;

// ─── Button Variants ─────────────────────────────────────────────
export const BTN = {
  primary: {
    backgroundColor: '#1B4332',
    color: '#FFFFFF',
    border: '1px solid #1B4332',
    borderRadius: RADII.md,
    padding: '7px 14px',
    fontSize: FONT.sizeMd,
    fontWeight: FONT.weightSemibold,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  secondary: {
    backgroundColor: COLORS.surface,
    color: COLORS.text,
    border: `1px solid ${COLORS.border}`,
    borderRadius: RADII.md,
    padding: '7px 14px',
    fontSize: FONT.sizeMd,
    fontWeight: FONT.weightMedium,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  danger: {
    backgroundColor: COLORS.dangerBg,
    color: COLORS.dangerText,
    border: `1px solid ${COLORS.dangerBorder}`,
    borderRadius: RADII.md,
    padding: '7px 14px',
    fontSize: FONT.sizeMd,
    fontWeight: FONT.weightMedium,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  success: {
    backgroundColor: COLORS.successBg,
    color: COLORS.successText,
    border: `1px solid ${COLORS.successBorder}`,
    borderRadius: RADII.md,
    padding: '7px 14px',
    fontSize: FONT.sizeMd,
    fontWeight: FONT.weightMedium,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  ghost: {
    backgroundColor: 'transparent',
    color: COLORS.textMuted,
    border: '1px solid transparent',
    borderRadius: RADII.md,
    padding: '7px 14px',
    fontSize: FONT.sizeMd,
    fontWeight: FONT.weightMedium,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
} as const;

// ─── Card Base ───────────────────────────────────────────────────
export const CARD = {
  backgroundColor: COLORS.surface,
  borderRadius: RADII.lg,
  boxShadow: SHADOWS.sm,
  border: `1px solid ${COLORS.border}`,
} as const;

// ─── Input Base ──────────────────────────────────────────────────
export const INPUT = {
  width: '100%',
  padding: '7px 11px',
  fontSize: FONT.sizeMd,
  borderRadius: RADII.md,
  border: `1px solid ${COLORS.border}`,
  backgroundColor: COLORS.surface,
  color: COLORS.text,
  outline: 'none',
  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
} as const;
