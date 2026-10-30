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
    { label: 'Transporter / Fleet', email: 'transporter@monitoring.system', pass: 'Transporter@2026!' },
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
          15% { opacity: 0.65; }
          85% { opacity: 0.65; }
          100% { transform: translateY(600px); opacity: 0; }
        }
        @keyframes pulseGlow {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.75; transform: scale(1.05); }
        }
        @keyframes livePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.25; transform: scale(0.85); }
        }
        @keyframes radarSweep {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes beamPulse {
          0%, 100% { opacity: 0.18; }
          50% { opacity: 0.38; }
        }
        @keyframes beaconBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.15; }
        }
        @keyframes starTwinkle {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.95; }
        }
        @keyframes dashFlow {
          to { stroke-dashoffset: -40; }
        }
      `}</style>

      {/* ── Left Branding & Satellite Visual Panel ── */}
      <div
        style={{
          flex: '0 0 540px',
          backgroundColor: '#051610',
          backgroundImage: 'radial-gradient(ellipse 110% 85% at 85% 65%, #0B2B1E 0%, #051610 55%, #020A07 100%)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '36px 40px',
          overflow: 'hidden',
          borderRight: '1px solid rgba(82, 183, 136, 0.2)',
          zIndex: 1,
        }}
      >
        {/* Layer 1: Atmospheric Glow & Background Grid */}
        <div
          style={{
            position: 'absolute',
            bottom: '-140px',
            right: '-120px',
            width: '620px',
            height: '620px',
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(82,183,136,0.22) 0%, rgba(45,106,79,0.12) 40%, rgba(15,40,30,0.02) 70%, transparent 80%)',
            animation: 'pulseGlow 14s ease-in-out infinite',
            pointerEvents: 'none',
          }}
        />

        {/* Layer 2: Deep Space Stars & Composite Satellite Earth Observation Graphic */}
        <svg
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
          viewBox="0 0 540 820"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            {/* Subtle GIS Grid Pattern */}
            <pattern id="gisGrid" width="36" height="36" patternUnits="userSpaceOnUse">
              <path
                d="M 36 0 L 0 0 0 36"
                fill="none"
                stroke="rgba(116, 198, 157, 0.045)"
                strokeWidth="1"
              />
              <circle cx="36" cy="36" r="0.75" fill="rgba(116, 198, 157, 0.15)" />
            </pattern>

            {/* Earth Atmospheric Limb Gradient */}
            <radialGradient id="earthAtmosphere" cx="45%" cy="45%" r="55%">
              <stop offset="65%" stopColor="#0B2B1E" stopOpacity="0.95" />
              <stop offset="88%" stopColor="#1B4D36" stopOpacity="0.9" />
              <stop offset="96%" stopColor="#2D6A4F" stopOpacity="0.85" />
              <stop offset="99%" stopColor="#52B788" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#74C69D" stopOpacity="0.4" />
            </radialGradient>

            {/* Earth Day/Night Terminator Shadow */}
            <linearGradient id="terminatorShadow" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#000000" stopOpacity="0" />
              <stop offset="55%" stopColor="#000000" stopOpacity="0.1" />
              <stop offset="80%" stopColor="#000000" stopOpacity="0.65" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.88" />
            </linearGradient>

            {/* Satellite Solar Panel Photovoltaic Cell Pattern */}
            <pattern id="solarGrid" width="6" height="4" patternUnits="userSpaceOnUse">
              <rect width="6" height="4" fill="#1E3A8A" stroke="#38BDF8" strokeWidth="0.5" strokeOpacity="0.7" />
            </pattern>

            {/* Satellite Sensor Swath Gradient */}
            <linearGradient id="sensorBeamGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#52B788" stopOpacity="0.65" />
              <stop offset="35%" stopColor="#52B788" stopOpacity="0.3" />
              <stop offset="75%" stopColor="#74C69D" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#74C69D" stopOpacity="0.02" />
            </linearGradient>

            {/* Gold Thermal Insulation Foil Gradient for Satellite Bus */}
            <linearGradient id="goldThermalFoil" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FDE68A" />
              <stop offset="30%" stopColor="#F59E0B" />
              <stop offset="70%" stopColor="#D97706" />
              <stop offset="100%" stopColor="#92400E" />
            </linearGradient>

            {/* Titanium Module Gradient */}
            <linearGradient id="titaniumBay" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#475569" />
              <stop offset="50%" stopColor="#334155" />
              <stop offset="100%" stopColor="#1E293B" />
            </linearGradient>

            {/* Radar Sweep Arc Gradient */}
            <radialGradient id="radarCenterGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#52B788" stopOpacity="0.4" />
              <stop offset="60%" stopColor="#2D6A4F" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#051610" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Background Grid */}
          <rect width="100%" height="100%" fill="url(#gisGrid)" />

          {/* Background Deep Space Starfield */}
          <g>
            <circle cx="45" cy="55" r="1.2" fill="#E2E8F0" style={{ animation: 'starTwinkle 4s ease-in-out infinite' }} />
            <circle cx="110" cy="130" r="0.9" fill="#94A3B8" opacity="0.6" />
            <circle cx="185" cy="40" r="1.4" fill="#F8FAFC" style={{ animation: 'starTwinkle 5s ease-in-out 1s infinite' }} />
            <circle cx="260" cy="95" r="0.8" fill="#CBD5E1" opacity="0.5" />
            <circle cx="340" cy="65" r="1.3" fill="#E2E8F0" style={{ animation: 'starTwinkle 6s ease-in-out 2s infinite' }} />
            <circle cx="420" cy="120" r="0.9" fill="#94A3B8" opacity="0.7" />
            <circle cx="485" cy="45" r="1.5" fill="#F8FAFC" style={{ animation: 'starTwinkle 4.5s ease-in-out 1.5s infinite' }} />
            <circle cx="80" cy="220" r="0.8" fill="#CBD5E1" opacity="0.4" />
            <circle cx="505" cy="210" r="1.1" fill="#E2E8F0" opacity="0.6" />
            <circle cx="50" cy="340" r="1.0" fill="#94A3B8" opacity="0.5" />
            <circle cx="510" cy="380" r="0.8" fill="#CBD5E1" opacity="0.4" />
          </g>

          {/* ── EARTH GLOBE (Centred in lower-right with 3D realism) ── */}
          <g transform="translate(330, 540)">
            {/* Outer Exosphere Atmosphere Halo */}
            <circle
              cx="0"
              cy="0"
              r="252"
              fill="none"
              stroke="rgba(56, 189, 248, 0.22)"
              strokeWidth="1.5"
              strokeDasharray="6 8"
            />
            {/* Mesosphere / Stratosphere Edge Glow */}
            <circle
              cx="0"
              cy="0"
              r="242"
              fill="none"
              stroke="rgba(82, 183, 136, 0.45)"
              strokeWidth="2.5"
            />
            {/* Earth Planetary Body */}
            <circle
              cx="0"
              cy="0"
              r="236"
              fill="url(#earthAtmosphere)"
            />

            {/* Earth Rotating Topographic & GIS Grid Layer */}
            <g style={{ transformOrigin: '0px 0px', animation: 'rotateGlobe 110s linear infinite' }}>
              {/* Latitude Parallels */}
              <ellipse cx="0" cy="0" rx="232" ry="75" fill="none" stroke="rgba(149, 213, 178, 0.18)" strokeWidth="1" />
              <ellipse cx="0" cy="0" rx="232" ry="145" fill="none" stroke="rgba(149, 213, 178, 0.18)" strokeWidth="1" />
              <ellipse cx="0" cy="0" rx="232" ry="205" fill="none" stroke="rgba(149, 213, 178, 0.14)" strokeWidth="1" />

              {/* Longitude Meridians */}
              <ellipse cx="0" cy="0" rx="75" ry="232" fill="none" stroke="rgba(149, 213, 178, 0.16)" strokeWidth="1" />
              <ellipse cx="0" cy="0" rx="155" ry="232" fill="none" stroke="rgba(149, 213, 178, 0.16)" strokeWidth="1" />

              {/* Equator & Prime Meridian Axis */}
              <line x1="-236" y1="0" x2="236" y2="0" stroke="rgba(82, 183, 136, 0.35)" strokeWidth="1.2" strokeDasharray="5 4" />
              <line x1="0" y1="-236" x2="0" y2="236" stroke="rgba(82, 183, 136, 0.35)" strokeWidth="1.2" strokeDasharray="5 4" />

              {/* Continents & Geographic Landforms */}
              <path
                d="M -160 -50 Q -110 -130 -30 -100 Q 20 -150 120 -90 Q 165 -35 130 50 Q 75 105 -15 85 Q -75 135 -165 55 Z"
                fill="rgba(27, 67, 50, 0.7)"
                stroke="rgba(82, 183, 136, 0.45)"
                strokeWidth="1.2"
              />
              <path
                d="M -70 45 Q -15 20 55 75 Q 105 135 30 180 Q -45 160 -95 105 Z"
                fill="rgba(45, 106, 79, 0.65)"
                stroke="rgba(116, 198, 157, 0.4)"
                strokeWidth="1.2"
              />
              <path
                d="M -190 -80 Q -150 -120 -110 -75 Q -90 -30 -135 10 Q -185 20 -200 -30 Z"
                fill="rgba(27, 67, 50, 0.65)"
                stroke="rgba(82, 183, 136, 0.35)"
                strokeWidth="1"
              />

              {/* Designated Protected Forest Canopies (Emerald GIS Polygons) */}
              <polygon
                points="-95,-45 -40,-80 15,-35 -30,25"
                fill="rgba(82, 183, 136, 0.35)"
                stroke="#52B788"
                strokeWidth="1.8"
                strokeDasharray="5 2.5"
              />
              <polygon
                points="35,-25 95,-60 130,5 70,30"
                fill="rgba(74, 222, 128, 0.3)"
                stroke="#4ADE80"
                strokeWidth="1.5"
              />
              <polygon
                points="-50,60 10,40 45,95 -15,110"
                fill="rgba(82, 183, 136, 0.3)"
                stroke="#74C69D"
                strokeWidth="1.5"
              />

              {/* Resource Extraction / Quarrying Monitoring Zone (Amber Alert Polygon) */}
              <polygon
                points="-15,45 35,25 65,70 10,80"
                fill="rgba(245, 158, 11, 0.3)"
                stroke="#F59E0B"
                strokeWidth="1.8"
              />
              <circle cx="25" cy="55" r="3" fill="#F59E0B" />
              <text x="32" y="58" fill="#FDE68A" fontSize="9" fontFamily="monospace" fontWeight="bold">
                SECTOR-Q02
              </text>
            </g>

            {/* Earth Day/Night Terminator Mask */}
            <circle cx="0" cy="0" r="236" fill="url(#terminatorShadow)" pointerEvents="none" />
          </g>

          {/* ── GROUND RADAR RECONNAISSANCE SWEEP ── */}
          <g transform="translate(190, 480)">
            {/* Concentric Range Rings */}
            <circle cx="0" cy="0" r="85" fill="none" stroke="rgba(82, 183, 136, 0.2)" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx="0" cy="0" r="55" fill="none" stroke="rgba(82, 183, 136, 0.25)" strokeWidth="1" />
            <circle cx="0" cy="0" r="25" fill="none" stroke="rgba(82, 183, 136, 0.35)" strokeWidth="1" />
            <circle cx="0" cy="0" r="4" fill="#52B788" />

            {/* Rotating Radar Sweep Fan Beam */}
            <g style={{ transformOrigin: '0px 0px', animation: 'radarSweep 9s linear infinite' }}>
              <path
                d="M 0 0 L 85 -25 A 85 85 0 0 1 85 25 Z"
                fill="url(#radarCenterGlow)"
              />
              <line x1="0" y1="0" x2="85" y2="0" stroke="#74C69D" strokeWidth="1.5" strokeOpacity="0.8" />
            </g>

            {/* Target Reticles within radar */}
            <circle cx="48" cy="-28" r="4" fill="none" stroke="#F59E0B" strokeWidth="1.5" />
            <text x="56" y="-24" fill="#FCD34D" fontSize="8" fontFamily="monospace">CANOPY-T1</text>
          </g>

          {/* ── SATELLITE ORBITS & HIGH-FIDELITY SATELLITE CRAFTS ── */}

          {/* SECONDARY POLAR ORBIT: SAR RADAR SATELLITE */}
          <g transform="translate(330, 540) rotate(32)">
            {/* Elliptical Polar Track */}
            <ellipse
              cx="0"
              cy="0"
              rx="300"
              ry="95"
              fill="none"
              stroke="rgba(56, 189, 248, 0.2)"
              strokeWidth="1.2"
              strokeDasharray="4 6"
            />
            {/* Path for Secondary SAR Satellite Motion */}
            <path
              id="sarOrbitPath"
              d="M -300,0 A 300,95 0 1,0 300,0 A 300,95 0 1,0 -300,0 Z"
              fill="none"
            />

            {/* Secondary SAR Satellite Craft (Travels along sarOrbitPath) */}
            <g>
              <animateMotion dur="34s" repeatCount="indefinite" rotate="auto">
                <mpath href="#sarOrbitPath" />
              </animateMotion>

              {/* SAR Radar Satellite Vector */}
              <g transform="scale(0.85)">
                {/* SAR Reflector Dish Antenna */}
                <ellipse cx="0" cy="-14" rx="14" ry="7" fill="none" stroke="#38BDF8" strokeWidth="1.2" />
                <line x1="0" y1="-7" x2="0" y2="0" stroke="#94A3B8" strokeWidth="1.2" />

                {/* Central Bus */}
                <rect x="-6" y="-5" width="12" height="10" rx="1.5" fill="#334155" stroke="#64748B" strokeWidth="0.8" />

                {/* Solar Arrays */}
                <rect x="-24" y="-3" width="15" height="6" fill="#1E3A8A" stroke="#38BDF8" strokeWidth="0.6" rx="1" />
                <rect x="9" y="-3" width="15" height="6" fill="#1E3A8A" stroke="#38BDF8" strokeWidth="0.6" rx="1" />

                {/* Tracking Beacon */}
                <circle cx="0" cy="5" r="1.5" fill="#38BDF8" style={{ animation: 'beaconBlink 1.5s infinite' }} />

                {/* SAR Radar Pulse Beam */}
                <path
                  d="M 0 5 L -12 40 L 12 40 Z"
                  fill="rgba(56, 189, 248, 0.12)"
                  stroke="rgba(56, 189, 248, 0.3)"
                  strokeWidth="0.6"
                  style={{ animation: 'beamPulse 2s ease-in-out infinite' }}
                />
              </g>
            </g>
          </g>

          {/* PRIMARY SUN-SYNCHRONOUS ORBIT: SENTINEL-2 EARTH OBSERVATION SATELLITE */}
          <g transform="translate(330, 540) rotate(-24)">
            {/* Elliptical Sun-Sync Track */}
            <ellipse
              cx="0"
              cy="0"
              rx="285"
              ry="125"
              fill="none"
              stroke="rgba(82, 183, 136, 0.4)"
              strokeWidth="1.5"
              strokeDasharray="6 6"
              style={{ animation: 'dashFlow 20s linear infinite' }}
            />

            {/* Orbit Path Definition for animateMotion */}
            <path
              id="sentinelOrbitPath"
              d="M -285,0 A 285,125 0 1,0 285,0 A 285,125 0 1,0 -285,0 Z"
              fill="none"
            />

            {/* ── HIGH-FIDELITY OBSERVATION SATELLITE (Sentinel-2 / Landsat class) ── */}
            <g>
              <animateMotion dur="24s" repeatCount="indefinite" rotate="auto">
                <mpath href="#sentinelOrbitPath" />
              </animateMotion>

              {/* Detailed Satellite Assembly */}
              <g transform="scale(1.15)">
                {/* 1. Dynamic Earth Observation Multispectral Swath Beam */}
                <path
                  d="M 0 10 L -38 95 L 38 95 Z"
                  fill="url(#sensorBeamGrad)"
                  stroke="rgba(82, 183, 136, 0.5)"
                  strokeWidth="0.75"
                  style={{ animation: 'beamPulse 3s ease-in-out infinite' }}
                />
                {/* Swath Ground Intercept Curvature */}
                <path
                  d="M -38 95 Q 0 102 38 95"
                  fill="none"
                  stroke="#52B788"
                  strokeWidth="1.8"
                  strokeDasharray="4 2"
                />

                {/* 2. Deployable Solar Array Wings (Extending left and right) */}
                {/* Left Solar Wing Truss Boom */}
                <line x1="-8" y1="0" x2="-14" y2="0" stroke="#94A3B8" strokeWidth="2" />
                {/* Left Solar Array (3 Photovoltaic Panels with Grid Texture) */}
                <g transform="translate(-46, -11)">
                  <rect x="0" y="0" width="31" height="22" rx="2" fill="url(#solarGrid)" stroke="#0284C7" strokeWidth="1" />
                  {/* Panel Hinges / Dividers */}
                  <line x1="10" y1="0" x2="10" y2="22" stroke="#60A5FA" strokeWidth="0.8" />
                  <line x1="20" y1="0" x2="20" y2="22" stroke="#60A5FA" strokeWidth="0.8" />
                  {/* Gold Framing Strip */}
                  <rect x="0" y="0" width="31" height="2" fill="#F59E0B" />
                  <rect x="0" y="20" width="31" height="2" fill="#F59E0B" />
                </g>

                {/* Right Solar Wing Truss Boom */}
                <line x1="8" y1="0" x2="14" y2="0" stroke="#94A3B8" strokeWidth="2" />
                {/* Right Solar Array (3 Photovoltaic Panels with Grid Texture) */}
                <g transform="translate(15, -11)">
                  <rect x="0" y="0" width="31" height="22" rx="2" fill="url(#solarGrid)" stroke="#0284C7" strokeWidth="1" />
                  {/* Panel Hinges / Dividers */}
                  <line x1="10" y1="0" x2="10" y2="22" stroke="#60A5FA" strokeWidth="0.8" />
                  <line x1="20" y1="0" x2="20" y2="22" stroke="#60A5FA" strokeWidth="0.8" />
                  {/* Gold Framing Strip */}
                  <rect x="0" y="0" width="31" height="2" fill="#F59E0B" />
                  <rect x="0" y="20" width="31" height="2" fill="#F59E0B" />
                </g>

                {/* 3. High-Gain Communications Dish Antenna (Downlink) */}
                <g transform="translate(0, -14)">
                  {/* Parabolic Reflector Dish */}
                  <path d="M -8 -4 Q 0 -10 8 -4" fill="none" stroke="#E2E8F0" strokeWidth="2.2" />
                  <ellipse cx="0" cy="-6" rx="8" ry="3" fill="#F1F5F9" stroke="#94A3B8" strokeWidth="0.6" />
                  {/* Subreflector & Feedhorn */}
                  <line x1="0" y1="-6" x2="0" y2="-12" stroke="#CBD5E1" strokeWidth="1" />
                  <circle cx="0" cy="-12" r="1.2" fill="#F59E0B" />
                  {/* Monopole TT&C Antennas */}
                  <line x1="-5" y1="-4" x2="-10" y2="-12" stroke="#94A3B8" strokeWidth="0.8" />
                  <line x1="5" y1="-4" x2="10" y2="-12" stroke="#94A3B8" strokeWidth="0.8" />
                </g>

                {/* 4. Central Satellite Bus / Chassis (Gold Foil Thermal Shield & Titanium) */}
                <rect
                  x="-8"
                  y="-11"
                  width="16"
                  height="22"
                  rx="2.5"
                  fill="url(#goldThermalFoil)"
                  stroke="#B45309"
                  strokeWidth="0.8"
                />
                {/* Avionics & Radiator Band */}
                <rect
                  x="-7"
                  y="-4"
                  width="14"
                  height="8"
                  rx="1"
                  fill="url(#titaniumBay)"
                  stroke="#64748B"
                  strokeWidth="0.6"
                />

                {/* 5. Multispectral Optical Telescope Payload (Facing Earth) */}
                {/* Optical Barrel */}
                <rect x="-4.5" y="11" width="9" height="6" rx="1" fill="#1E293B" stroke="#475569" strokeWidth="0.75" />
                {/* Coated Aperture Lens Shimmer */}
                <ellipse cx="0" cy="17" rx="4" ry="1.5" fill="#06B6D4" stroke="#38BDF8" strokeWidth="0.75" />
                <circle cx="0" cy="17" r="1" fill="#FFFFFF" />

                {/* 6. Thruster Pods (RCS Corner Thrusters) */}
                <rect x="-8.5" y="-10" width="1.5" height="3" fill="#64748B" />
                <rect x="7" y="-10" width="1.5" height="3" fill="#64748B" />
                <rect x="-8.5" y="7" width="1.5" height="3" fill="#64748B" />
                <rect x="7" y="7" width="1.5" height="3" fill="#64748B" />

                {/* 7. Active Status Beacons (Blinking Strobe LEDs) */}
                <circle cx="-6" cy="-8" r="1.2" fill="#10B981" style={{ animation: 'beaconBlink 1.2s infinite' }} />
                <circle cx="6" cy="-8" r="1.2" fill="#EF4444" style={{ animation: 'beaconBlink 1.2s 0.6s infinite' }} />

                {/* Telemetry Label next to satellite */}
                <text x="14" y="-14" fill="#74C69D" fontSize="7" fontFamily="monospace" fontWeight="bold">
                  SENTINEL-2B [LEO]
                </text>
              </g>
            </g>
          </g>

          {/* ── Layer 5: Technical GIS Telemetry & Tactical Coordinates ── */}
          <g fill="rgba(183, 201, 192, 0.65)" fontSize="9.5" fontFamily="monospace">
            {/* Top-Left Tactical HUD Coordinates */}
            <text x="32" y="38" fill="#74C69D" fontWeight="bold">
              SYS.ORBIT: LEO SUN-SYNCHRONOUS
            </text>
            <text x="32" y="52">
              ALT: 786.1 KM · VELOCITY: 7.48 KM/S
            </text>
            <text x="32" y="66">
              INCLINATION: 98.62° · PERIOD: 100.6 MIN
            </text>
            <line
              x1="32"
              y1="74"
              x2="245"
              y2="74"
              stroke="rgba(82, 183, 136, 0.35)"
              strokeWidth="1"
            />

            {/* Target Reticle in Deep Field */}
            <g transform="translate(135, 235)">
              <circle
                cx="0"
                cy="0"
                r="18"
                fill="none"
                stroke="rgba(245, 158, 11, 0.6)"
                strokeWidth="1"
                strokeDasharray="4 3"
              />
              <circle cx="0" cy="0" r="2.5" fill="#F59E0B" />
              <line x1="-24" y1="0" x2="24" y2="0" stroke="rgba(245, 158, 11, 0.7)" strokeWidth="1" />
              <line x1="0" y1="-24" x2="0" y2="24" stroke="rgba(245, 158, 11, 0.7)" strokeWidth="1" />
              <text x="24" y="-8" fill="#FDE68A" fontSize="8.5" fontWeight="bold">
                CANOPY-TARGET-ALPHA
              </text>
              <text x="24" y="6" fill="#74C69D" fontSize="8">
                NDVI: 0.78 [OPTIMAL]
              </text>
            </g>
          </g>
        </svg>

        {/* Layer 6: Continuous Orbital Scanning Line */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: '110px',
            background:
              'linear-gradient(180deg, transparent 0%, rgba(82, 183, 136, 0.04) 50%, rgba(82, 183, 136, 0.3) 98%, #52B788 100%)',
            animation: 'scanLine 14s linear infinite',
            pointerEvents: 'none',
          }}
        />

        {/* ── Top Header / Live Constellation Status Badge ── */}
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: RADII.full,
              backgroundColor: 'rgba(15, 43, 30, 0.85)',
              border: '1px solid rgba(82, 183, 136, 0.45)',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#52B788',
                boxShadow: '0 0 10px #52B788, 0 0 20px rgba(82, 183, 136, 0.6)',
                animation: 'livePulse 2s ease-in-out infinite',
              }}
            />
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#A7F3D0',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              ACTIVE SATELLITE CONSTELLATION
            </span>
            <span
              style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: 'rgba(82, 183, 136, 0.25)',
                color: '#D1FAE5',
                fontWeight: 600,
              }}
            >
              LEO / SAR
            </span>
          </div>
        </div>

        {/* ── Main Branding & Mission Content ── */}
        <div style={{ position: 'relative', zIndex: 2, margin: 'auto 0' }}>
          {/* High-Tech Satellite Emblem */}
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: RADII.lg,
              backgroundColor: 'rgba(27, 67, 50, 0.65)',
              border: '1px solid rgba(82, 183, 136, 0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#52B788',
              marginBottom: SPACE.xl,
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.1)',
            }}
          >
            <svg
              width="28"
              height="28"
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
              fontSize: '30px',
              fontWeight: 800,
              color: '#FFFFFF',
              lineHeight: 1.2,
              letterSpacing: '-0.025em',
              textShadow: '0 2px 10px rgba(0, 0, 0, 0.5)',
            }}
          >
            Satellite Based Monitoring System
          </h1>

          <h2
            style={{
              fontSize: '17px',
              fontWeight: 600,
              color: '#74C69D',
              marginTop: '8px',
              lineHeight: 1.35,
              letterSpacing: '-0.01em',
            }}
          >
            Geospatial Intelligence &amp; Continuous Earth Observation
          </h2>

          <p
            style={{
              fontSize: '13.5px',
              color: '#CBD5E1',
              marginTop: SPACE.md,
              lineHeight: 1.65,
              maxWidth: '430px',
            }}
          >
            Multi-constellation orbital surveillance, automated canopy loss detection, and multispectral environmental compliance intelligence across all operational zones.
          </p>

          {/* Surveillance Capabilities Badges */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              marginTop: SPACE.xl,
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
                label: 'REMOTE SENSING GIS',
                icon: (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="2"/><path d="M16.5 7.5 18 6l1.5 1.5L18 9zM4.5 16.5 6 15l1.5 1.5L6 18z"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                ),
              },
              {
                label: 'CHANGE DETECTION ALERTS',
                icon: (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
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
                  border: '1px solid rgba(82, 183, 136, 0.3)',
                  fontSize: '11px',
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
            fontSize: '10.5px',
            color: 'rgba(183, 201, 192, 0.6)',
            borderTop: '1px solid rgba(82, 183, 136, 0.2)',
            paddingTop: SPACE.md,
            fontFamily: 'monospace',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#52B788' }} />
            DOWNLINK: ACTIVE (AES-256)
          </span>
          <span>ORBITAL TELEMETRY NOMINAL</span>
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
              &ldquo;Transforming satellite Earth observation into actionable intelligence &mdash; safeguarding ecosystems, forests, and natural resources.&rdquo;
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
