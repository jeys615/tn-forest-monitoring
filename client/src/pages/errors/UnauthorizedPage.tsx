import { Link } from 'react-router-dom';
import { COLORS, FONT, RADII, SPACE } from '../../styles/theme';

const UnauthorizedPage: React.FC = () => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '80px 20px',
      textAlign: 'center',
      animation: 'fadeIn 0.25s ease',
    }}
  >
    <div
      style={{
        width: '72px',
        height: '72px',
        borderRadius: '50%',
        backgroundColor: COLORS.dangerBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: SPACE['2xl'],
      }}
    >
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke={COLORS.dangerText}
        strokeWidth="2"
      >
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    </div>

    <h1 style={{ fontSize: '34px', fontWeight: FONT.weightBold, color: COLORS.dangerText }}>
      Access Denied
    </h1>
    <p
      style={{
        fontSize: FONT.sizeLg,
        color: COLORS.textMuted,
        marginTop: SPACE.lg,
        maxWidth: '380px',
        lineHeight: 1.6,
      }}
    >
      You do not have the required permissions to view or manage this resource. Contact your system
      administrator if you believe this is an error.
    </p>
    <div style={{ marginTop: SPACE['2xl'], display: 'flex', gap: SPACE.md }}>
      <Link
        to="/"
        style={{
          padding: '10px 22px',
          backgroundColor: COLORS.primary,
          color: '#FFFFFF',
          borderRadius: RADII.md,
          fontWeight: FONT.weightSemibold,
          fontSize: FONT.sizeLg,
          textDecoration: 'none',
        }}
      >
        Return to Dashboard
      </Link>
    </div>
  </div>
);

export default UnauthorizedPage;
