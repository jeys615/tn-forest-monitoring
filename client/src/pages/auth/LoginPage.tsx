import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import axios from 'axios';
import { COLORS, FONT, SPACE, RADII } from '../../styles/theme';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionExpired = searchParams.get('session_expired') === '1';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }
    setSubmitting(true);
    try {
      await login({ email, password });
      navigate('/', { replace: true });
    } catch (err: unknown) {
      let msg = 'Login failed. Please check your credentials.';
      if (axios.isAxiosError(err)) {
        if (err.response?.data?.message) {
          msg = err.response.data.message;
        } else if (!err.response && (err.code === 'ERR_NETWORK' || err.message?.includes('Network Error'))) {
          msg = 'Unable to connect to the backend server. Please verify backend API status and CORS settings.';
        }
      }
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    fontSize: FONT.sizeMd,
    borderRadius: RADII.md,
    border: `1px solid #CBD5E1`,
    outline: 'none',
    color: COLORS.text,
    backgroundColor: COLORS.surface,
    transition: 'border-color 0.15s, box-shadow 0.15s',
  };

  const DEMO_ROLES = [
    { label: 'Super Admin', email: 'superadmin@monitoring.system', pass: 'SuperAdmin@2026!' },
    { label: 'Admin', email: 'admin@monitoring.system', pass: 'Admin@Monitoring2026!' },
    { label: 'Monitoring Officer', email: 'officer@monitoring.system', pass: 'Officer@Monitoring2026!' },
    { label: 'Mining Officer', email: 'mining.officer@monitoring.system', pass: 'Mining@Monitoring2026!' },
    { label: 'Checkpoint', email: 'checkpoint.officer@monitoring.system', pass: 'Checkpoint@Monitoring2026!' },
    { label: 'Field Officer', email: 'field.officer@monitoring.system', pass: 'Field@Monitoring2026!' },
    { label: 'Viewer', email: 'viewer@monitoring.system', pass: 'Viewer@Monitoring2026!' },
  ];

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#081410',
        backgroundImage: 'radial-gradient(circle at 50% 15%, #1B4332 0%, #081410 75%)',
        padding: '32px 16px',
        fontFamily: FONT.family,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Decorative Background Orbital Glow */}
      <div
        style={{
          position: 'absolute',
          top: '-150px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '700px',
          height: '700px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(82, 183, 136, 0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Centered Login Card */}
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          backgroundColor: '#FFFFFF',
          borderRadius: RADII.xl,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)',
          padding: '36px 32px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Header with Satellite Orbit Logo */}
        <div style={{ textAlign: 'center', marginBottom: SPACE['2xl'] }}>
          <div
            style={{
              width: '76px',
              height: '76px',
              margin: '0 auto 16px auto',
              borderRadius: '50%',
              backgroundColor: '#0D1F18',
              border: '2px solid #2D6A4F',
              boxShadow: '0 8px 24px rgba(45, 106, 79, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px',
            }}
          >
            <img
              src="/logo.svg"
              alt="Satellite Monitoring System Logo"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>

          <h1
            style={{
              fontSize: '22px',
              fontWeight: 800,
              color: '#0D1F18',
              margin: 0,
              letterSpacing: '-0.02em',
              lineHeight: 1.25,
            }}
          >
            Satellite Based Monitoring System
          </h1>

          <div
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#2D6A4F',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginTop: '4px',
            }}
          >
            Geospatial Intelligence &amp; Earth Observation
          </div>

          {/* Catchy Project Quote */}
          <div
            style={{
              marginTop: '14px',
              padding: '10px 14px',
              backgroundColor: '#F0FDF4',
              border: '1px solid #BBF7D0',
              borderRadius: RADII.md,
              fontStyle: 'italic',
              fontSize: '12px',
              lineHeight: 1.5,
              color: '#166534',
              textAlign: 'center',
            }}
          >
            &ldquo;Eyes in the sky, guardians of the land &mdash; Continuous satellite intelligence for real-time Earth observation &amp; resource protection.&rdquo;
          </div>
        </div>

        {/* Session Expired Notice */}
        {!error && sessionExpired && (
          <div
            style={{
              padding: SPACE.md,
              backgroundColor: '#FFFBEB',
              border: '1px solid #FDE68A',
              borderRadius: RADII.md,
              color: '#B45309',
              fontSize: FONT.sizeSm,
              marginBottom: SPACE.xl,
              display: 'flex',
              alignItems: 'center',
              gap: SPACE.sm,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>Your session has expired. Please sign in again.</span>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div
            style={{
              padding: SPACE.md,
              backgroundColor: COLORS.dangerBg,
              border: `1px solid ${COLORS.dangerBorder}`,
              borderRadius: RADII.md,
              color: COLORS.dangerText,
              fontSize: FONT.sizeSm,
              marginBottom: SPACE.xl,
              display: 'flex',
              alignItems: 'center',
              gap: SPACE.sm,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: SPACE.lg }}>
            <label
              htmlFor="email"
              style={{
                display: 'block',
                fontSize: FONT.sizeSm,
                fontWeight: FONT.weightSemibold,
                color: COLORS.textMuted,
                marginBottom: '6px',
              }}
            >
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="officer@monitoring.system"
              required
              autoComplete="email"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: SPACE.xl }}>
            <label
              htmlFor="password"
              style={{
                display: 'block',
                fontSize: FONT.sizeSm,
                fontWeight: FONT.weightSemibold,
                color: COLORS.textMuted,
                marginBottom: '6px',
              }}
            >
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                style={{ ...inputStyle, paddingRight: '42px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: COLORS.textLight,
                  padding: 0,
                  display: 'flex',
                }}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: submitting ? '#6B9E84' : COLORS.primary,
              color: '#FFFFFF',
              border: 'none',
              borderRadius: RADII.md,
              fontWeight: FONT.weightSemibold,
              fontSize: FONT.sizeMd,
              cursor: submitting ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s',
              letterSpacing: '0.01em',
              boxShadow: '0 2px 4px rgba(27, 67, 50, 0.25)',
            }}
          >
            {submitting ? 'Authenticating...' : 'Sign In to Monitoring Workstation'}
          </button>
        </form>

        {/* Quick Access Role Profiles */}
        <div
          style={{
            marginTop: SPACE.xl,
            padding: '12px 14px',
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: RADII.md,
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#475569',
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Quick Access Role Profiles
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
            {DEMO_ROLES.map((role) => (
              <button
                key={role.email}
                type="button"
                onClick={() => {
                  setEmail(role.email);
                  setPassword(role.pass);
                }}
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '4px 8px',
                  borderRadius: RADII.sm,
                  backgroundColor: '#FFFFFF',
                  color: '#1E293B',
                  border: '1px solid #CBD5E1',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#F1F5F9';
                  e.currentTarget.style.borderColor = '#94A3B8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#FFFFFF';
                  e.currentTarget.style.borderColor = '#CBD5E1';
                }}
                title={`Load ${role.label}`}
              >
                {role.label}
              </button>
            ))}
          </div>

          <div style={{ fontSize: '10px', color: '#64748B' }}>
            Click any profile to pre-fill credentials for workstation access.
          </div>
        </div>

        {/* Footer Note */}
        <div
          style={{
            marginTop: SPACE.xl,
            textAlign: 'center',
            fontSize: '11px',
            color: '#94A3B8',
          }}
        >
          &copy; {new Date().getFullYear()} Satellite Based Monitoring System &middot; All Rights Reserved
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
