import { COLORS, SPACE, RADII } from '../../styles/theme';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}

const DefaultIcon = () => (
  <svg
    width="36"
    height="36"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="9" y1="13" x2="15" y2="13" />
    <line x1="9" y1="17" x2="13" y2="17" />
  </svg>
);

const EmptyState: React.FC<EmptyStateProps> = ({ title, description, action, icon }) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 20px',
      textAlign: 'center',
      animation: 'fadeIn 0.2s ease',
      backgroundColor: COLORS.surface,
      borderRadius: RADII.md,
      border: `1px solid ${COLORS.border}`,
    }}
  >
    <div
      style={{
        color: COLORS.textLight,
        marginBottom: SPACE.md,
        opacity: 0.6,
      }}
    >
      {icon ?? <DefaultIcon />}
    </div>
    <h3
      style={{
        fontSize: '14px',
        fontWeight: 600,
        color: COLORS.text,
        marginBottom: '4px',
      }}
    >
      {title}
    </h3>
    {description && (
      <p
        style={{
          fontSize: '12px',
          color: COLORS.textMuted,
          maxWidth: '380px',
          lineHeight: 1.5,
          marginBottom: action ? SPACE.md : 0,
        }}
      >
        {description}
      </p>
    )}
    {action && <div style={{ marginTop: action && !description ? SPACE.md : 0 }}>{action}</div>}
  </div>
);

export default EmptyState;
