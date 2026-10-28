import { COLORS, RADII, SHADOWS, SPACE } from '../../styles/theme';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  description?: string;
  tooltip?: string;
  color?: string;
  bgColor?: string;
}

const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon,
  description,
  tooltip,
  color = COLORS.primary,
  bgColor = '#ECFDF5',
}) => (
  <div
    title={tooltip || description}
    style={{
      backgroundColor: COLORS.surface,
      borderRadius: RADII.md,
      boxShadow: SHADOWS.sm,
      border: `1px solid ${COLORS.border}`,
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: SPACE.md,
      animation: 'fadeIn 0.2s ease',
      minWidth: 0,
    }}
  >
    <div style={{ minWidth: 0, flex: 1 }}>
      <div
        style={{
          fontSize: '11px',
          fontWeight: 600,
          color: COLORS.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '4px',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: '22px',
          fontWeight: 700,
          color: COLORS.text,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {description && (
        <div
          style={{
            fontSize: '11px',
            color: COLORS.textLight,
            marginTop: '4px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {description}
        </div>
      )}
    </div>
    <div
      style={{
        width: '32px',
        height: '32px',
        borderRadius: RADII.sm,
        backgroundColor: bgColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color,
        border: `1px solid ${color}22`,
      }}
    >
      {icon}
    </div>
  </div>
);

export default StatCard;
