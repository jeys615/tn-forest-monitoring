import { RADII, SHADOWS, SPACE } from '../../styles/theme';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

const ErrorState: React.FC<ErrorStateProps> = ({ message, onRetry }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACE.md,
      padding: '12px 16px',
      backgroundColor: '#FEF2F2',
      border: `1px solid #FECACA`,
      borderRadius: RADII.md,
      boxShadow: SHADOWS.sm,
      animation: 'fadeIn 0.2s ease',
      marginBottom: SPACE.md,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#DC2626"
        strokeWidth="2"
        style={{ flexShrink: 0 }}
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <div
        style={{
          fontSize: '13px',
          fontWeight: 500,
          color: '#991B1B',
        }}
      >
        {message}
      </div>
    </div>
    {onRetry && (
      <button
        onClick={onRetry}
        style={{
          padding: '4px 12px',
          backgroundColor: '#FFFFFF',
          border: `1px solid #F87171`,
          borderRadius: RADII.sm,
          color: '#991B1B',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#FEE2E2';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#FFFFFF';
        }}
      >
        Retry
      </button>
    )}
  </div>
);

export default ErrorState;
