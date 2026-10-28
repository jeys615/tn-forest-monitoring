import { FONT, RADII } from '../../styles/theme';
import { UserRole } from '@tn-forest/shared/types';

interface RoleBadgeProps {
  role: UserRole | string;
}

const ROLE_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  [UserRole.SUPER_ADMIN]: {
    color: '#6B21A8',
    bg: '#F5F3FF',
    label: 'Super Admin',
  },
  [UserRole.ADMIN]: {
    color: '#1E40AF',
    bg: '#EFF6FF',
    label: 'Admin',
  },
  [UserRole.FOREST_OFFICER]: {
    color: '#065F46',
    bg: '#ECFDF5',
    label: 'Monitoring Officer',
  },
  [UserRole.MINING_OFFICER]: {
    color: '#92400E',
    bg: '#FFFBEB',
    label: 'Mining Officer',
  },
  [UserRole.CHECKPOINT_OFFICER]: {
    color: '#1E3A5F',
    bg: '#EFF8FF',
    label: 'Checkpoint Officer',
  },
  [UserRole.FIELD_OFFICER]: {
    color: '#374151',
    bg: '#F9FAFB',
    label: 'Field Officer',
  },
  [UserRole.VIEWER]: {
    color: '#4B5563',
    bg: '#F3F4F6',
    label: 'Viewer',
  },
};

const RoleBadge: React.FC<RoleBadgeProps> = ({ role }) => {
  const s = ROLE_STYLES[role] ?? { color: '#374151', bg: '#F3F4F6', label: role };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 9px',
        borderRadius: RADII.full,
        fontSize: FONT.sizeXs,
        fontWeight: FONT.weightSemibold,
        color: s.color,
        backgroundColor: s.bg,
        whiteSpace: 'nowrap',
      }}
    >
      {s.label}
    </span>
  );
};

export default RoleBadge;
