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
    padding: '11px 14px',
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
        display: 'flex',
        minHeight: '100vh',
        backgroundColor: '#081C15',
        fontFamily: FONT.family,
        overflow: 'hidden',
      }}
    >
      {/* ── CSS Keyframe Animations for Left Panel ── */}
      <style>{`
        @keyframes rotateGlobe {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes scanLine {
          0% { transform: translateY(-20%); opacity: 0; }
          15% { opacity: 0.7; }
          85% { opacity: 0.7; }
          100% { transform: translateY(500px); opacity: 0; }
        }
        @keyframes orbitRotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulseGlow {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50% { opacity: 0.65; transform: scale(1.04); }
        }
        @keyframes dashMove {
          to { stroke-dashoffset: -40; }
        }
        @keyframes livePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.3; transform: scale(0.85); }
        }
        @keyframes radarSweep {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* ── Left Branding & Satellite Visual Panel ── */}
      <div
        style={{
          flex: '0 0 520px',
          backgroundColor: '#081C15',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: SPACE['3xl'],
          overflow: 'hidden',
          borderRight: '1px solid rgba(82, 183, 136, 0.15)',
          zIndex: 1,
        }}
      >
        {/* Layer 1: Atmospheric Glow & Background Grid */}
        <div
          style={{
            position: 'absolute',
            bottom: '-120px',
            right: '-100px',
            width: '550px',
            height: '550px',
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(82,183,136,0.18) 0%, rgba(45,106,79,0.08) 45%, transparent 70%)',
            animation: 'pulseGlow 12s ease-in-out infinite',
            pointerEvents: 'none',
          }}
        />

        {/* Layer 2 & 3: Satellite Earth & GIS Composite Vector Graphic */}
        <svg
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
          viewBox="0 0 520 800"
          preserveAspectRatio="xMidYMid slice"
        >
          {/* Subtle GIS Grid Pattern */}
          <defs>
            <pattern id="gisGrid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="rgba(116, 198, 157, 0.05)"
                strokeWidth="1"
              />
              <circle cx="40" cy="40" r="1" fill="rgba(116, 198, 157, 0.12)" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#gisGrid)" />

          {/* Earth Globe (Partially in Viewport) */}
          <g transform="translate(320, 520)">
            {/* Atmosphere Ring */}
            <circle
              cx="0"
              cy="0"
              r="240"
              fill="none"
              stroke="rgba(116, 198, 157, 0.25)"
              strokeWidth="2"
              strokeDasharray="8 6"
            />
            <circle
              cx="0"
              cy="0"
              r="230"
              fill="rgba(8, 28, 21, 0.85)"
              stroke="rgba(82, 183, 136, 0.3)"
              strokeWidth="1.5"
            />

            {/* Earth Lat/Long Rotating Grid */}
            <g style={{ transformOrigin: '0px 0px', animation: 'rotateGlobe 90s linear infinite' }}>
              <ellipse
                cx="0"
                cy="0"
                rx="220"
                ry="80"
                fill="none"
                stroke="rgba(149, 213, 178, 0.15)"
                strokeWidth="1"
              />
              <ellipse
                cx="0"
                cy="0"
                rx="220"
                ry="160"
                fill="none"
                stroke="rgba(149, 213, 178, 0.15)"
                strokeWidth="1"
              />
              <ellipse
                cx="0"
                cy="0"
                rx="120"
                ry="220"
                fill="none"
                stroke="rgba(149, 213, 178, 0.15)"
                strokeWidth="1"
              />
              <line
                x1="-230"
                y1="0"
                x2="230"
                y2="0"
                stroke="rgba(149, 213, 178, 0.25)"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <line
                x1="0"
                y1="-230"
                x2="0"
                y2="230"
                stroke="rgba(149, 213, 178, 0.25)"
                strokeWidth="1"
                strokeDasharray="4 4"
              />

              {/* Landmass Silhouettes */}
              <path
                d="M -140 -60 Q -90 -120 -20 -90 Q 30 -140 110 -80 Q 150 -30 120 40 Q 60 90 -20 70 Q -80 120 -150 40 Z"
                fill="rgba(27, 67, 50, 0.45)"
                stroke="rgba(82, 183, 136, 0.3)"
                strokeWidth="1"
              />
              <path
                d="M -60 30 Q -10 10 50 60 Q 90 120 20 160 Q -50 140 -90 90 Z"
                fill="rgba(45, 106, 79, 0.4)"
                stroke="rgba(116, 198, 157, 0.3)"
                strokeWidth="1"
              />

              {/* Vegetation Monitoring Polygons */}
              <polygon
                points="-80,-40 -30,-70 20,-30 -20,20"
                fill="rgba(82, 183, 136, 0.25)"
                stroke="#52B788"
                strokeWidth="1.5"
                strokeDasharray="4 2"
              />
              <polygon
                points="40,-20 90,-50 120,10 60,30"
                fill="rgba(45, 106, 79, 0.3)"
                stroke="#74C69D"
                strokeWidth="1"
              />

              {/* Disturbed Land / Extraction Monitoring Highlight */}
              <polygon
                points="-10,50 40,30 70,80 10,90"
                fill="rgba(244, 162, 97, 0.22)"
                stroke="#F4A261"
                strokeWidth="1.5"
              />
              <text
                x="15"
                y="68"
                fill="#F4A261"
                fontSize="9"
                fontFamily="monospace"
                fontWeight="bold"
              >
                SITE-M04
              </text>
            </g>
          </g>

          {/* Layer 4: Satellite Orbit Path & Satellite Vector */}
          <g transform="translate(320, 520)">
            <ellipse
              cx="0"
              cy="0"
              rx="275"
              ry="110"
              fill="none"
              stroke="rgba(116, 198, 157, 0.3)"
              strokeWidth="1"
              strokeDasharray="6 6"
              style={{ transform: 'rotate(-25deg)', transformOrigin: '0px 0px' }}
            />
            {/* Orbiting Satellite Icon */}
            <g style={{ transformOrigin: '0px 0px', animation: 'orbitRotate 40s linear infinite' }}>
              <g transform="translate(-275, 0) rotate(90)">
                {/* Satellite Body */}
                <rect x="-8" y="-6" width="16" height="12" fill="#52B788" rx="2" />
                {/* Solar Panels */}
                <rect
                  x="-24"
                  y="-3"
                  width="14"
                  height="6"
                  fill="#74C69D"
                  stroke="#1B4332"
                  strokeWidth="0.5"
                />
                <rect
                  x="10"
                  y="-3"
                  width="14"
                  height="6"
                  fill="#74C69D"
                  stroke="#1B4332"
                  strokeWidth="0.5"
                />
                {/* Sensor Beam Arc */}
                <path
                  d="M 0 6 L -15 35 L 15 35 Z"
                  fill="rgba(82, 183, 136, 0.15)"
                  stroke="rgba(82, 183, 136, 0.4)"
                  strokeWidth="0.5"
                />
              </g>
            </g>
          </g>

          {/* Layer 5: GIS Crosshairs & Technical HUD Coordinates */}
          <g fill="rgba(183, 201, 192, 0.5)" fontSize="10" fontFamily="monospace">
            {/* Top-left Coordinate overlay */}
            <text x="30" y="45">
              SYS.LOC: 11°12'44"N 78°39'12"E
            </text>
            <text x="30" y="62">
              ALTITUDE: 705.4 KM · SENTINEL-2B
            </text>
            <line
              x1="30"
              y1="72"
              x2="220"
              y2="72"
              stroke="rgba(82, 183, 136, 0.25)"
              strokeWidth="1"
            />

            {/* Target Reticle */}
            <g transform="translate(180, 240)">
              <circle
                cx="0"
                cy="0"
                r="16"
                fill="none"
                stroke="rgba(244, 162, 97, 0.5)"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <line
                x1="-22"
                y1="0"
                x2="22"
                y2="0"
                stroke="rgba(244, 162, 97, 0.6)"
                strokeWidth="1"
              />
              <line
                x1="0"
                y1="-22"
                x2="0"
                y2="22"
                stroke="rgba(244, 162, 97, 0.6)"
                strokeWidth="1"
              />
              <text x="22" y="-8" fill="#F4A261" fontSize="9" fontWeight="bold">
                ZONE-CANOPY-01
              </text>
            </g>

            <g transform="translate(80, 420)">
              <circle
                cx="0"
                cy="0"
                r="12"
                fill="none"
                stroke="rgba(82, 183, 136, 0.6)"
                strokeWidth="1"
              />
              <line
                x1="-16"
                y1="0"
                x2="16"
                y2="0"
                stroke="rgba(82, 183, 136, 0.6)"
                strokeWidth="1"
              />
              <line
                x1="0"
                y1="-16"
                x2="0"
                y2="16"
                stroke="rgba(82, 183, 136, 0.6)"
                strokeWidth="1"
              />
              <text x="18" y="12" fill="#74C69D" fontSize="9">
                NDVI: 0.74 [HEALTHY]
              </text>
            </g>
          </g>
        </svg>

        {/* Layer 6: Continuous Satellite Scanning Line */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: '100px',
            background:
              'linear-gradient(180deg, transparent 0%, rgba(82, 183, 136, 0.08) 60%, rgba(82, 183, 136, 0.35) 98%, #52B788 100%)',
            animation: 'scanLine 12s linear infinite',
            pointerEvents: 'none',
          }}
        />

        {/* ── Top Header / Live Badge ── */}
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: SPACE.sm,
              padding: '6px 12px',
              borderRadius: RADII.full,
              backgroundColor: 'rgba(27, 67, 50, 0.75)',
              border: '1px solid rgba(82, 183, 136, 0.35)',
              backdropFilter: 'blur(4px)',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#52B788',
                boxShadow: '0 0 8px #52B788',
                animation: 'livePulse 2s ease-in-out infinite',
              }}
            />
            <span
              style={{
                fontSize: FONT.sizeXs,
                fontWeight: FONT.weightBold,
                color: '#95D5B2',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              ACTIVE SATELLITE SURVEILLANCE
            </span>
          </div>
        </div>

        {/* ── Main Branding Content ── */}
        <div style={{ position: 'relative', zIndex: 2, margin: 'auto 0' }}>
          {/* Satellite Icon Header */}
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: RADII.lg,
              backgroundColor: 'rgba(82, 183, 136, 0.18)',
              border: '1px solid rgba(82, 183, 136, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#52B788',
              marginBottom: SPACE.xl,
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="2" />
              <path d="M16.5 7.5 18 6l1.5 1.5L18 9zM4.5 16.5 6 15l1.5 1.5L6 18z" />
              <path d="M12 2a10 10 0 0 1 10 10" />
              <path d="M2 12A10 10 0 0 1 12 22" />
            </svg>
          </div>

          <h1
            style={{
              fontSize: '28px',
              fontWeight: FONT.weightBold,
              color: '#FFFFFF',
              lineHeight: 1.2,
              letterSpacing: '-0.02em',
            }}
          >
            Satellite Based Monitoring System
          </h1>

          <h2
            style={{
              fontSize: FONT.sizeXl,
              fontWeight: FONT.weightSemibold,
              color: '#74C69D',
              marginTop: SPACE.sm,
              lineHeight: 1.3,
            }}
          >
            Geospatial Intelligence &amp; Resource Protection
          </h2>

          <p
            style={{
              fontSize: FONT.sizeLg,
              color: '#B7C9C0',
              marginTop: SPACE.lg,
              lineHeight: 1.65,
              maxWidth: '380px',
            }}
          >
            Continuous satellite surveillance, automated canopy change detection, and integrated resource transit monitoring across all designated areas.
          </p>

          {/* Surveillance Capabilities Badges */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: SPACE.sm,
              marginTop: SPACE['2xl'],
            }}
          >
            {[
              {
                label: 'CANOPY MONITORING',
                icon: (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22v-7"/><path d="M17 14c2-3 2-6 0-9-4-1-6 2-7 4-1-2-3-5-7-4-2 3-2 6 0 9 3 1 5-1 7-3 2 2 4 4 7 3z"/></svg>
                ),
              },
              {
                label: 'LAND-USE & EXTRACTION',
                icon: (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m14 12-8.5 8.5a2.12 2.12 0 1 1-3-3L11 9"/><path d="M15 13 9 7l4-4 6 6z"/></svg>
                ),
              },
              {
                label: 'REMOTE SENSING',
                icon: (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="2"/><path d="M16.5 7.5 18 6l1.5 1.5L18 9zM4.5 16.5 6 15l1.5 1.5L6 18z"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                ),
              },
              {
                label: 'GIS ANALYTICS',
                icon: (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
                ),
              },
            ].map((badge) => (
              <div
                key={badge.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 10px',
                  borderRadius: RADII.sm,
                  backgroundColor: 'rgba(27, 67, 50, 0.6)',
                  border: '1px solid rgba(82, 183, 136, 0.25)',
                  fontSize: FONT.sizeXs,
                  fontWeight: FONT.weightMedium,
                  color: '#D1FAE5',
                  letterSpacing: '0.04em',
                }}
              >
                <span>{badge.icon}</span>
                <span>{badge.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Footer Metadata ── */}
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: FONT.sizeXs,
            color: 'rgba(183, 201, 192, 0.45)',
            borderTop: '1px solid rgba(82, 183, 136, 0.15)',
            paddingTop: SPACE.lg,
          }}
        >
          <span>GEOSPATIAL INTELLIGENCE PLATFORM</span>
          <span>CONTINUOUS MONITORING</span>
        </div>
      </div>

      {/* ── Right Authentication Panel (Matches Uploaded Photo) ── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: SPACE['2xl'],
          backgroundColor: '#F8FAFC',
          position: 'relative',
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '440px',
            backgroundColor: '#FFFFFF',
            borderRadius: RADII.xl,
            boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.1), 0 0 0 1px #E2E8F0',
            padding: '32px 28px',
          }}
        >
          {/* Header with Circular Satellite Logo */}
          <div style={{ textAlign: 'center', marginBottom: SPACE.xl }}>
            <div
              style={{
                width: '68px',
                height: '68px',
                margin: '0 auto 12px auto',
                borderRadius: '50%',
                backgroundColor: '#0D1F18',
                border: '2px solid #2D6A4F',
                boxShadow: '0 6px 18px rgba(45, 106, 79, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px',
              }}
            >
              <img
                src="/logo.svg"
                alt="Satellite Logo"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>

            <h2
              style={{
                fontSize: '20px',
                fontWeight: 800,
                color: '#0D1F18',
                margin: 0,
                letterSpacing: '-0.02em',
                lineHeight: 1.25,
              }}
            >
              Satellite Based Monitoring System
            </h2>

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
              GEOSPATIAL INTELLIGENCE &amp; EARTH OBSERVATION
            </div>

            {/* Catchy Project Quote */}
            <div
              style={{
                marginTop: '12px',
                padding: '10px 12px',
                backgroundColor: '#F0FDF4',
                border: '1px solid #BBF7D0',
                borderRadius: RADII.md,
                fontStyle: 'italic',
                fontSize: '12px',
                lineHeight: 1.45,
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
                marginBottom: SPACE.lg,
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
                padding: '10px 14px',
                backgroundColor: '#FEE2E2',
                border: '1px solid #FECACA',
                borderRadius: RADII.md,
                color: '#991B1B',
                fontSize: FONT.sizeSm,
                marginBottom: SPACE.lg,
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
            <div style={{ marginBottom: SPACE.md }}>
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
                placeholder="superadmin@monitoring.system"
                required
                autoComplete="email"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: SPACE.lg }}>
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
                  placeholder="••••••••••••"
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
                padding: '11px',
                backgroundColor: submitting ? '#6B9E84' : '#1B4332',
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
              marginTop: SPACE.lg,
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
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
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
                    padding: '3px 8px',
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
              marginTop: SPACE.lg,
              textAlign: 'center',
              fontSize: '11px',
              color: '#94A3B8',
            }}
          >
            &copy; {new Date().getFullYear()} Satellite Based Monitoring System &middot; All Rights Reserved
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
