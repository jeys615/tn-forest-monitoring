import { COLORS, RADII } from '../../styles/theme';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary';

interface StatusBadgeProps {
  label: string;
  variant: BadgeVariant;
  dot?: boolean;
}

const VARIANT_STYLES: Record<BadgeVariant, { color: string; bg: string; border: string; dot: string }> = {
  success: { color: COLORS.successText, bg: COLORS.successBg, border: COLORS.successBorder, dot: '#16A34A' },
  warning: { color: COLORS.warningText, bg: COLORS.warningBg, border: COLORS.warningBorder, dot: '#D97706' },
  danger: { color: COLORS.dangerText, bg: COLORS.dangerBg, border: COLORS.dangerBorder, dot: '#DC2626' },
  info: { color: COLORS.infoText, bg: COLORS.infoBg, border: COLORS.infoBorder, dot: '#2563EB' },
  neutral: { color: COLORS.neutralText, bg: COLORS.neutralBg, border: COLORS.neutralBorder, dot: '#64748B' },
  primary: { color: '#065F46', bg: '#ECFDF5', border: '#A7F3D0', dot: '#10B981' },
};

const StatusBadge: React.FC<StatusBadgeProps> = ({ label, variant, dot = false }) => {
  const s = VARIANT_STYLES[variant] || VARIANT_STYLES.neutral;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '2px 7px',
        borderRadius: RADII.sm,
        fontSize: '11px',
        fontWeight: 600,
        color: s.color,
        backgroundColor: s.bg,
        border: `1px solid ${s.border}`,
        whiteSpace: 'nowrap',
        lineHeight: 1.3,
        letterSpacing: '0.02em',
      }}
    >
      {dot && (
        <span
          style={{
            width: '5px',
            height: '5px',
            borderRadius: '50%',
            backgroundColor: s.dot,
            flexShrink: 0,
          }}
        />
      )}
      {label}
    </span>
  );
};

export default StatusBadge;

// ─── Re-exported helpers ──────────────────────────────────────────
export { type BadgeVariant };
