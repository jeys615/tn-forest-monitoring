import { COLORS, FONT, RADII, SPACE } from '../../styles/theme';

interface LegendItem {
  color: string;
  label: string;
}

interface MapLegendProps {
  title: string;
  items: LegendItem[];
  position?: 'bottom-left' | 'bottom-right';
}

const MapLegend: React.FC<MapLegendProps> = ({ title, items, position = 'bottom-left' }) => (
  <div
    style={{
      position: 'absolute',
      ...(position === 'bottom-left'
        ? { bottom: '30px', left: '10px' }
        : { bottom: '30px', right: '10px' }),
      zIndex: 1000,
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(4px)',
      borderRadius: RADII.md,
      border: `1px solid ${COLORS.border}`,
      padding: `${SPACE.md} ${SPACE.lg}`,
      boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
      minWidth: '160px',
    }}
  >
    <div
      style={{
        fontSize: FONT.sizeXs,
        fontWeight: FONT.weightBold,
        color: COLORS.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: SPACE.sm,
      }}
    >
      {title}
    </div>
    {items.map((item) => (
      <div
        key={item.label}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: SPACE.sm,
          marginBottom: '4px',
        }}
      >
        <div
          style={{
            width: '12px',
            height: '12px',
            borderRadius: RADII.sm,
            backgroundColor: item.color,
            flexShrink: 0,
            opacity: 0.8,
            border: `1px solid ${item.color}`,
          }}
        />
        <span style={{ fontSize: FONT.sizeSm, color: COLORS.text }}>{item.label}</span>
      </div>
    ))}
  </div>
);

export default MapLegend;
