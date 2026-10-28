import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { authService } from '../../services/auth.service';
import { Permission } from '@tn-forest/shared/types';
import axios from 'axios';
import RoleBadge from '../../components/ui/RoleBadge';
import StatusBadge from '../../components/ui/StatusBadge';
import SectionCard from '../../components/ui/SectionCard';
import PageHeader from '../../components/ui/PageHeader';
import { COLORS, FONT, RADII, SPACE } from '../../styles/theme';

const ProfilePage: React.FC = () => {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }
    setSubmitting(true);
    try {
      await authService.changePassword({ currentPassword, newPassword });
      setSuccess('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      let msg = 'Failed to change password';
      if (axios.isAxiosError(err) && err.response?.data?.message) msg = err.response.data.message;
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '9px 12px',
    fontSize: FONT.sizeLg,
    borderRadius: RADII.md,
    border: `1px solid #CBD5E1`,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
    outline: 'none',
  };

  const EyeIcon = ({ open }: { open: boolean }) =>
    open ? (
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    ) : (
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );

  const PasswordInput = ({
    id,
    label,
    value,
    onChange,
    show,
    onToggle,
    placeholder,
    required: req,
  }: {
    id: string;
    label: string;
    value: string;
    onChange: (v: string) => void;
    show: boolean;
    onToggle: () => void;
    placeholder?: string;
    required?: boolean;
  }) => (
    <div style={{ marginBottom: SPACE.lg }}>
      <label
        htmlFor={id}
        style={{
          display: 'block',
          fontSize: FONT.sizeSm,
          fontWeight: FONT.weightSemibold,
          color: COLORS.textMuted,
          marginBottom: SPACE.sm,
        }}
      >
        {label} {req && <span style={{ color: COLORS.dangerText }}>*</span>}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          type={show ? 'text' : 'password'}
          required={req}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? '••••••••'}
          style={{ ...inputStyle, paddingRight: '38px' }}
        />
        <button
          type="button"
          onClick={onToggle}
          tabIndex={-1}
          style={{
            position: 'absolute',
            right: '10px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: COLORS.textLight,
            display: 'flex',
            padding: 0,
          }}
        >
          <EyeIcon open={show} />
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: '720px', animation: 'fadeIn 0.25s ease' }}>
      <PageHeader title="My Profile" subtitle="Account information and security settings" />

      {/* ── Avatar + Identity Card ── */}
      <SectionCard style={{ marginBottom: SPACE['2xl'] }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE['2xl'] }}>
          {/* Avatar */}
          <div
            style={{
              width: '72px',
              height: '72px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #2D6A4F, #52B788)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '26px',
              fontWeight: FONT.weightBold,
              color: '#FFFFFF',
              flexShrink: 0,
              boxShadow: '0 4px 12px rgba(27,67,50,0.25)',
            }}
          >
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{ fontSize: FONT.size3xl, fontWeight: FONT.weightBold, color: COLORS.primary }}
            >
              {user.name}
            </div>
            <div style={{ fontSize: FONT.sizeMd, color: COLORS.textMuted, marginTop: '2px' }}>
              {user.email}
            </div>
            <div
              style={{
                display: 'flex',
                gap: SPACE.sm,
                marginTop: SPACE.sm,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <RoleBadge role={user.role} />
              <StatusBadge
                label={user.status ?? 'Active'}
                variant={
                  user.status === 'ACTIVE'
                    ? 'success'
                    : user.status === 'SUSPENDED'
                      ? 'danger'
                      : 'neutral'
                }
                dot
              />
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ── Account Details ── */}
      <SectionCard title="Account Information" style={{ marginBottom: SPACE['2xl'] }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACE.xl }}>
          {[
            { label: 'Full Name', value: user.name },
            { label: 'Email Address', value: user.email },
            { label: 'Employee ID', value: user.employeeId ?? '—' },
            { label: 'Phone', value: user.phone ?? '—' },
          ].map(({ label, value }) => (
            <div key={label}>
              <div
                style={{
                  fontSize: FONT.sizeSm,
                  fontWeight: FONT.weightSemibold,
                  color: COLORS.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: SPACE.xs,
                }}
              >
                {label}
              </div>
              <div
                style={{ fontSize: FONT.sizeLg, color: COLORS.text, fontWeight: FONT.weightMedium }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Permissions */}
        {user.permissions && user.permissions.length > 0 && (
          <div
            style={{
              marginTop: SPACE.xl,
              paddingTop: SPACE.xl,
              borderTop: `1px solid ${COLORS.border}`,
            }}
          >
            <div
              style={{
                fontSize: FONT.sizeSm,
                fontWeight: FONT.weightSemibold,
                color: COLORS.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: SPACE.md,
              }}
            >
              Granted Permissions ({user.permissions.length})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.sm }}>
              {(user.permissions as Permission[]).map((p) => (
                <span
                  key={p}
                  style={{
                    padding: '3px 8px',
                    backgroundColor: '#EFF6EF',
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: RADII.full,
                    fontSize: FONT.sizeXs,
                    fontWeight: FONT.weightMedium,
                    color: COLORS.accent,
                  }}
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── Change Password ── */}
      <SectionCard title="Change Password">
        {error && (
          <div
            style={{
              padding: SPACE.md,
              backgroundColor: COLORS.dangerBg,
              border: `1px solid #FECACA`,
              borderRadius: RADII.md,
              color: COLORS.dangerText,
              fontSize: FONT.sizeMd,
              marginBottom: SPACE.lg,
            }}
          >
            {error}
          </div>
        )}
        {success && (
          <div
            style={{
              padding: SPACE.md,
              backgroundColor: COLORS.successBg,
              border: `1px solid #BBF7D0`,
              borderRadius: RADII.md,
              color: COLORS.successText,
              fontSize: FONT.sizeMd,
              marginBottom: SPACE.lg,
            }}
          >
            ✓ {success}
          </div>
        )}

        <form onSubmit={handlePasswordChange} style={{ maxWidth: '420px' }}>
          <PasswordInput
            id="current-pw"
            label="Current Password"
            value={currentPassword}
            onChange={setCurrentPassword}
            show={showCurrent}
            onToggle={() => setShowCurrent((v) => !v)}
            required
          />
          <PasswordInput
            id="new-pw"
            label="New Password"
            value={newPassword}
            onChange={setNewPassword}
            show={showNew}
            onToggle={() => setShowNew((v) => !v)}
            placeholder="Min 8 chars, 1 upper, 1 lower, 1 number"
            required
          />
          <div style={{ marginBottom: SPACE.xl }}>
            <label
              htmlFor="confirm-pw"
              style={{
                display: 'block',
                fontSize: FONT.sizeSm,
                fontWeight: FONT.weightSemibold,
                color: COLORS.textMuted,
                marginBottom: SPACE.sm,
              }}
            >
              Confirm New Password <span style={{ color: COLORS.dangerText }}>*</span>
            </label>
            <input
              id="confirm-pw"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={inputStyle}
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: '10px 22px',
              backgroundColor: submitting ? '#6B9E84' : COLORS.primary,
              color: '#FFFFFF',
              border: 'none',
              borderRadius: RADII.md,
              fontWeight: FONT.weightSemibold,
              fontSize: FONT.sizeLg,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Updating...' : 'Change Password'}
          </button>
        </form>
      </SectionCard>
    </div>
  );
};

export default ProfilePage;
