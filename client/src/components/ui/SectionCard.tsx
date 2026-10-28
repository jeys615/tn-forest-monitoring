import { COLORS, FONT, RADII, SHADOWS, SPACE } from '../../styles/theme';

interface SectionCardProps {
  children: React.ReactNode;
  title?: string;
  titleAction?: React.ReactNode;
  padding?: string;
  style?: React.CSSProperties;
  noBorder?: boolean;
}

const SectionCard: React.FC<SectionCardProps> = ({
  children,
  title,
  titleAction,
  padding = SPACE['2xl'],
  style,
  noBorder = false,
}) => (
  <div
    style={{
      backgroundColor: COLORS.surface,
      borderRadius: RADII.lg,
      boxShadow: SHADOWS.sm,
      border: noBorder ? 'none' : `1px solid ${COLORS.border}`,
      overflow: 'hidden',
      ...style,
    }}
  >
    {title && (
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: `${SPACE.lg} ${padding}`,
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <h3
          style={{
            fontSize: FONT.sizeXl,
            fontWeight: FONT.weightSemibold,
            color: COLORS.primary,
          }}
        >
          {title}
        </h3>
        {titleAction}
      </div>
    )}
    <div style={{ padding }}>{children}</div>
  </div>
);

export default SectionCard;
