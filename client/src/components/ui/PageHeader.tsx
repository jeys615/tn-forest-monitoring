import { COLORS, RADII, SPACE } from '../../styles/theme';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  count?: number;
}

const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions, count }) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      flexWrap: 'wrap',
      gap: SPACE.md,
      marginBottom: SPACE.lg,
      paddingBottom: '12px',
      borderBottom: `1px solid ${COLORS.border}`,
    }}
  >
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <h1
          style={{
            fontSize: '20px',
            fontWeight: 700,
            color: COLORS.primaryDark,
            lineHeight: 1.2,
            margin: 0,
          }}
        >
          {title}
        </h1>
        {count !== undefined && (
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: COLORS.primaryDark,
              backgroundColor: '#ECFDF5',
              border: '1px solid #A7F3D0',
              padding: '2px 7px',
              borderRadius: RADII.sm,
            }}
          >
            {count}
          </span>
        )}
      </div>
      {subtitle && (
        <p
          style={{
            fontSize: '12px',
            color: COLORS.textMuted,
            marginTop: '3px',
            lineHeight: 1.4,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
    {actions && <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>{actions}</div>}
  </div>
);

export default PageHeader;
