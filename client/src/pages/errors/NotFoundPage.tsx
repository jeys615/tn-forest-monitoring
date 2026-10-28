import { Link } from 'react-router-dom';
import { COLORS, FONT, RADII, SPACE } from '../../styles/theme';

const NotFoundPage: React.FC = () => (
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
    {/* SVG Illustration */}
    <svg
      viewBox="0 0 200 160"
      width="200"
      height="160"
      style={{ marginBottom: SPACE['2xl'], opacity: 0.35 }}
    >
      <rect x="20" y="40" width="160" height="100" rx="10" fill="#1B4332" />
      <rect x="35" y="55" width="130" height="70" rx="6" fill="#2D6A4F" />
      <text x="100" y="102" textAnchor="middle" fontSize="36" fontWeight="bold" fill="#52B788">
        404
      </text>
      <circle cx="60" cy="25" r="8" fill="#40916C" />
      <circle cx="100" cy="18" r="5" fill="#52B788" />
      <circle cx="140" cy="25" r="7" fill="#40916C" />
    </svg>

    <h1
      style={{
        fontSize: '38px',
        fontWeight: FONT.weightBold,
        color: COLORS.primary,
        lineHeight: 1,
      }}
    >
      Page Not Found
    </h1>
    <p
      style={{
        fontSize: FONT.sizeLg,
        color: COLORS.textMuted,
        marginTop: SPACE.lg,
        maxWidth: '360px',
        lineHeight: 1.6,
      }}
    >
      The page you are looking for does not exist or you may not have permission to access it.
    </p>
    <Link
      to="/"
      style={{
        marginTop: SPACE['2xl'],
        padding: '10px 24px',
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
);

export default NotFoundPage;
