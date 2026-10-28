import { useState, useEffect, useCallback } from 'react';
import { userService } from '../../services/user.service';
import { useAuth } from '../../hooks/useAuth';
import Loading from '../../components/common/Loading';
import PageHeader from '../../components/ui/PageHeader';
import RoleBadge from '../../components/ui/RoleBadge';
import StatusBadge from '../../components/ui/StatusBadge';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import {
  UserRole,
  UserStatus,
  Permission,
  type UserDto,
  type CreateUserRequest,
  type UpdateUserRequest,
} from '@tn-forest/shared/types';
import { DEFAULT_ROLE_PERMISSIONS } from '@tn-forest/shared/constants';
import axios from 'axios';
import { COLORS, FONT, RADII, SHADOWS, SPACE } from '../../styles/theme';

/* ─── Icons ──────────────────────────────────────────────── */
const PlusIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);
const CloseIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const UsersIcon = () => (
  <svg
    width="40"
    height="40"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.2"
  >
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

/* ─── Form Field ───────────────────────────────────────────── */
const formInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  fontSize: FONT.sizeLg,
  borderRadius: RADII.md,
  border: `1px solid #CBD5E1`,
  color: COLORS.text,
  backgroundColor: COLORS.surface,
  outline: 'none',
};
const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: FONT.sizeSm,
  fontWeight: FONT.weightSemibold,
  color: COLORS.textMuted,
  marginBottom: SPACE.sm,
};

/* ─── UsersPage ────────────────────────────────────────────── */
const UsersPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [roleFilter, setRoleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState<string>('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserDto | null>(null);

  const [formData, setFormData] = useState<{
    employeeId: string;
    name: string;
    email: string;
    phone: string;
    password: string;
    role: UserRole;
    permissions: Permission[];
  }>({
    employeeId: '',
    name: '',
    email: '',
    phone: '',
    password: '',
    role: UserRole.VIEWER,
    permissions: DEFAULT_ROLE_PERMISSIONS[UserRole.VIEWER],
  });

  const canCreate =
    currentUser?.role === UserRole.SUPER_ADMIN ||
    currentUser?.permissions.includes(Permission.USER_CREATE);
  const canUpdate =
    currentUser?.role === UserRole.SUPER_ADMIN ||
    currentUser?.permissions.includes(Permission.USER_UPDATE);
  const canDeactivate =
    currentUser?.role === UserRole.SUPER_ADMIN ||
    currentUser?.permissions.includes(Permission.USER_DEACTIVATE);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await userService.getUsers({
        role: roleFilter ? (roleFilter as UserRole) : undefined,
        status: statusFilter ? (statusFilter as UserStatus) : undefined,
      });
      setUsers(data);
    } catch (err: unknown) {
      let msg = 'Failed to fetch users';
      if (axios.isAxiosError(err) && err.response?.data?.message) msg = err.response.data.message;
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [roleFilter, statusFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleRoleChange = (role: UserRole) => {
    setFormData((prev) => ({ ...prev, role, permissions: DEFAULT_ROLE_PERMISSIONS[role] || [] }));
  };
  const handlePermissionToggle = (perm: Permission) => {
    setFormData((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter((p) => p !== perm)
        : [...prev.permissions, perm],
    }));
  };
  const resetForm = () =>
    setFormData({
      employeeId: '',
      name: '',
      email: '',
      phone: '',
      password: '',
      role: UserRole.VIEWER,
      permissions: DEFAULT_ROLE_PERMISSIONS[UserRole.VIEWER],
    });

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      const payload: CreateUserRequest = {
        employeeId: formData.employeeId || undefined,
        name: formData.name,
        email: formData.email,
        phone: formData.phone || undefined,
        password: formData.password,
        role: formData.role,
        permissions: formData.permissions,
      };
      await userService.createUser(payload);
      setSuccessMsg('User created successfully');
      setShowCreateModal(false);
      resetForm();
      fetchUsers();
    } catch (err: unknown) {
      let msg = 'Failed to create user';
      if (axios.isAxiosError(err) && err.response?.data?.message) msg = err.response.data.message;
      setError(msg);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      setError(null);
      const payload: UpdateUserRequest = {
        employeeId: formData.employeeId || undefined,
        name: formData.name,
        phone: formData.phone || undefined,
        role: formData.role,
        permissions: formData.permissions,
      };
      await userService.updateUser(editingUser.id, payload);
      setSuccessMsg('User updated successfully');
      setEditingUser(null);
      resetForm();
      fetchUsers();
    } catch (err: unknown) {
      let msg = 'Failed to update user';
      if (axios.isAxiosError(err) && err.response?.data?.message) msg = err.response.data.message;
      setError(msg);
    }
  };

  const handleStatusChange = async (userId: string, newStatus: UserStatus) => {
    try {
      setError(null);
      await userService.updateUserStatus(userId, newStatus);
      setSuccessMsg(`User status updated to ${newStatus}`);
      fetchUsers();
    } catch (err: unknown) {
      let msg = 'Failed to update user status';
      if (axios.isAxiosError(err) && err.response?.data?.message) msg = err.response.data.message;
      setError(msg);
    }
  };

  const openEditModal = (u: UserDto) => {
    setEditingUser(u);
    setFormData({
      employeeId: u.employeeId || '',
      name: u.name,
      email: u.email,
      phone: u.phone || '',
      password: '',
      role: u.role,
      permissions: (u.permissions as Permission[]) || [],
    });
  };

  // Client-side search
  const filteredUsers = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.employeeId ?? '').toLowerCase().includes(q)
    );
  });

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

  const selectStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: RADII.md,
    border: `1px solid #CBD5E1`,
    fontSize: FONT.sizeMd,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
    outline: 'none',
  };

  return (
    <div style={{ animation: 'fadeIn 0.25s ease' }}>
      <PageHeader
        title="User & Access Management"
        subtitle="Manage system users, roles, permissions and account status"
        count={users.length}
        actions={
          canCreate ? (
            <button
              onClick={() => {
                resetForm();
                setEditingUser(null);
                setShowCreateModal(true);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: SPACE.sm,
                padding: '9px 18px',
                backgroundColor: COLORS.primary,
                color: '#FFF',
                border: 'none',
                borderRadius: RADII.md,
                fontWeight: FONT.weightSemibold,
                fontSize: FONT.sizeLg,
                cursor: 'pointer',
              }}
            >
              <PlusIcon /> Create User
            </button>
          ) : null
        }
      />

      {/* ── Notifications ── */}
      {error && <ErrorState message={error} onRetry={fetchUsers} />}
      {successMsg && (
        <div
          style={{
            padding: SPACE.md,
            backgroundColor: COLORS.successBg,
            border: `1px solid #BBF7D0`,
            borderRadius: RADII.md,
            color: COLORS.successText,
            fontSize: FONT.sizeMd,
            marginBottom: SPACE.lg,
            animation: 'fadeIn 0.2s ease',
          }}
        >
          ✓ {successMsg}
        </div>
      )}

      {/* ── Filter Bar ── */}
      <div
        style={{
          display: 'flex',
          gap: SPACE.md,
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          backgroundColor: COLORS.surface,
          padding: SPACE.lg,
          borderRadius: RADII.lg,
          boxShadow: SHADOWS.sm,
          border: `1px solid ${COLORS.border}`,
          marginBottom: SPACE.xl,
        }}
      >
        {/* Search */}
        <div style={{ flex: '1 1 220px', minWidth: '180px' }}>
          <label style={labelStyle}>Search</label>
          <div style={{ position: 'relative' }}>
            <span
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: COLORS.textLight,
                display: 'flex',
              }}
            >
              <SearchIcon />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, email or employee ID…"
              style={{ ...selectStyle, width: '100%', paddingLeft: '32px', fontSize: FONT.sizeLg }}
            />
          </div>
        </div>

        {/* Role filter */}
        <div style={{ minWidth: '150px' }}>
          <label style={labelStyle}>Role</label>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="">All Roles</option>
            {Object.values(UserRole).map((r) => (
              <option key={r} value={r}>
                {r.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        {/* Status filter */}
        <div style={{ minWidth: '150px' }}>
          <label style={labelStyle}>Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="">All Statuses</option>
            {Object.values(UserStatus).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {(search || roleFilter || statusFilter) && (
          <button
            onClick={() => {
              setSearch('');
              setRoleFilter('');
              setStatusFilter('');
            }}
            style={{
              padding: '8px 14px',
              backgroundColor: 'transparent',
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADII.md,
              color: COLORS.textMuted,
              fontSize: FONT.sizeMd,
              cursor: 'pointer',
              marginTop: '20px',
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* ── Table ── */}
      {loading ? (
        <Loading message="Loading users..." />
      ) : filteredUsers.length === 0 ? (
        <EmptyState
          title="No users found"
          description={
            search || roleFilter || statusFilter
              ? 'Try adjusting your search or filter criteria.'
              : 'No system users have been created yet.'
          }
          icon={<UsersIcon />}
          action={
            canCreate && !search && !roleFilter && !statusFilter ? (
              <button
                onClick={() => {
                  resetForm();
                  setShowCreateModal(true);
                }}
                style={{
                  padding: '9px 18px',
                  backgroundColor: COLORS.primary,
                  color: '#FFF',
                  border: 'none',
                  borderRadius: RADII.md,
                  fontWeight: FONT.weightSemibold,
                  cursor: 'pointer',
                }}
              >
                Create First User
              </button>
            ) : undefined
          }
        />
      ) : (
        <div
          style={{
            backgroundColor: COLORS.surface,
            borderRadius: RADII.lg,
            boxShadow: SHADOWS.sm,
            border: `1px solid ${COLORS.border}`,
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr
                style={{ backgroundColor: '#F8FAFC', borderBottom: `1px solid ${COLORS.border}` }}
              >
                {[
                  'User',
                  'Employee ID',
                  'Role',
                  'Permissions',
                  'Status',
                  'Last Login',
                  'Actions',
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '11px 16px',
                      fontSize: FONT.sizeSm,
                      fontWeight: FONT.weightSemibold,
                      color: COLORS.textMuted,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr
                  key={u.id}
                  style={{ borderBottom: `1px solid ${COLORS.borderLight}` }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '#FAFDF9';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '';
                  }}
                >
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md }}>
                      <div
                        style={{
                          width: '34px',
                          height: '34px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #2D6A4F, #52B788)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: FONT.sizeSm,
                          fontWeight: FONT.weightBold,
                          color: '#FFF',
                          flexShrink: 0,
                        }}
                      >
                        {getInitials(u.name)}
                      </div>
                      <div>
                        <div
                          style={{
                            fontWeight: FONT.weightSemibold,
                            fontSize: FONT.sizeLg,
                            color: COLORS.text,
                          }}
                        >
                          {u.name}
                        </div>
                        <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>
                          {u.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td
                    style={{
                      padding: '12px 16px',
                      fontSize: FONT.sizeMd,
                      color: COLORS.textMuted,
                      fontFamily: 'monospace',
                    }}
                  >
                    {u.employeeId ?? '—'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <RoleBadge role={u.role} />
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>
                      {u.permissions.length} granted
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <StatusBadge
                      label={u.status}
                      variant={
                        u.status === UserStatus.ACTIVE
                          ? 'success'
                          : u.status === UserStatus.SUSPENDED
                            ? 'danger'
                            : 'neutral'
                      }
                      dot
                    />
                  </td>
                  <td
                    style={{
                      padding: '12px 16px',
                      fontSize: FONT.sizeSm,
                      color: COLORS.textMuted,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('en-IN') : 'Never'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: SPACE.sm, flexWrap: 'nowrap' }}>
                      {canUpdate && (
                        <button
                          onClick={() => openEditModal(u)}
                          style={{
                            padding: '5px 12px',
                            backgroundColor: COLORS.surfaceAlt,
                            color: COLORS.textMuted,
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: RADII.sm,
                            fontSize: FONT.sizeSm,
                            fontWeight: FONT.weightMedium,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Edit
                        </button>
                      )}
                      {canDeactivate &&
                        currentUser?.id !== u.id &&
                        (u.status === UserStatus.ACTIVE ? (
                          <button
                            onClick={() => handleStatusChange(u.id, UserStatus.INACTIVE)}
                            style={{
                              padding: '5px 12px',
                              backgroundColor: COLORS.warningBg,
                              color: COLORS.warningText,
                              border: `1px solid #FDE68A`,
                              borderRadius: RADII.sm,
                              fontSize: FONT.sizeSm,
                              fontWeight: FONT.weightMedium,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            onClick={() => handleStatusChange(u.id, UserStatus.ACTIVE)}
                            style={{
                              padding: '5px 12px',
                              backgroundColor: COLORS.successBg,
                              color: COLORS.successText,
                              border: `1px solid #BBF7D0`,
                              borderRadius: RADII.sm,
                              fontSize: FONT.sizeSm,
                              fontWeight: FONT.weightMedium,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Activate
                          </button>
                        ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Create / Edit Modal ── */}
      {(showCreateModal || editingUser) && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: SPACE.xl,
          }}
        >
          <div
            style={{
              backgroundColor: COLORS.surface,
              borderRadius: RADII.xl,
              padding: SPACE['3xl'],
              width: '100%',
              maxWidth: '560px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: SHADOWS.lg,
              animation: 'fadeIn 0.15s ease',
            }}
          >
            {/* Modal header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: SPACE['2xl'],
              }}
            >
              <div>
                <h3
                  style={{
                    fontSize: FONT.size2xl,
                    fontWeight: FONT.weightBold,
                    color: COLORS.primary,
                  }}
                >
                  {editingUser ? 'Edit User' : 'Create New User'}
                </h3>
                <p style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginTop: '3px' }}>
                  {editingUser
                    ? `Editing ${editingUser.name}`
                    : 'Fill in the details to create a new system user'}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingUser(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: COLORS.textLight,
                  padding: SPACE.sm,
                  display: 'flex',
                  borderRadius: RADII.md,
                }}
              >
                <CloseIcon />
              </button>
            </div>

            <form onSubmit={editingUser ? handleEditSubmit : handleCreateSubmit}>
              {/* Name + Email */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: SPACE.lg,
                  marginBottom: SPACE.lg,
                }}
              >
                <div>
                  <label style={labelStyle}>Full Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    style={formInputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Email Address *</label>
                  <input
                    type="email"
                    required
                    disabled={!!editingUser}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    style={{
                      ...formInputStyle,
                      backgroundColor: editingUser ? '#F1F5F9' : COLORS.surface,
                    }}
                  />
                </div>
              </div>

              {/* Emp ID + Phone */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: SPACE.lg,
                  marginBottom: SPACE.lg,
                }}
              >
                <div>
                  <label style={labelStyle}>Employee ID</label>
                  <input
                    type="text"
                    value={formData.employeeId}
                    onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                    style={formInputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Phone Number</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    style={formInputStyle}
                  />
                </div>
              </div>

              {/* Password (create only) */}
              {!editingUser && (
                <div style={{ marginBottom: SPACE.lg }}>
                  <label style={labelStyle}>
                    Password *{' '}
                    <span style={{ color: COLORS.textLight, fontWeight: 400 }}>
                      (Min 8 chars, 1 upper, 1 lower, 1 number)
                    </span>
                  </label>
                  <input
                    type="password"
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    style={formInputStyle}
                  />
                </div>
              )}

              {/* Role */}
              <div style={{ marginBottom: SPACE.lg }}>
                <label style={labelStyle}>Role *</label>
                <select
                  value={formData.role}
                  onChange={(e) => handleRoleChange(e.target.value as UserRole)}
                  style={{ ...formInputStyle, cursor: 'pointer' }}
                >
                  {Object.values(UserRole).map((r) => (
                    <option key={r} value={r}>
                      {r.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>

              {/* Permissions */}
              <div style={{ marginBottom: SPACE.xl }}>
                <label style={labelStyle}>Permissions</label>
                <div
                  style={{
                    maxHeight: '140px',
                    overflowY: 'auto',
                    border: `1px solid #CBD5E1`,
                    borderRadius: RADII.md,
                    padding: SPACE.md,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: SPACE.sm,
                  }}
                >
                  {Object.values(Permission).map((p) => (
                    <label
                      key={p}
                      style={{
                        fontSize: FONT.sizeSm,
                        display: 'flex',
                        alignItems: 'center',
                        gap: SPACE.sm,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={formData.permissions.includes(p)}
                        onChange={() => handlePermissionToggle(p)}
                      />
                      <span style={{ color: COLORS.textMuted }}>{p}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: SPACE.md }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingUser(null);
                  }}
                  style={{
                    padding: '9px 18px',
                    backgroundColor: COLORS.surfaceAlt,
                    color: COLORS.textMuted,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: RADII.md,
                    cursor: 'pointer',
                    fontSize: FONT.sizeLg,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '9px 18px',
                    backgroundColor: COLORS.primary,
                    color: '#FFF',
                    border: 'none',
                    borderRadius: RADII.md,
                    fontWeight: FONT.weightSemibold,
                    cursor: 'pointer',
                    fontSize: FONT.sizeLg,
                  }}
                >
                  {editingUser ? 'Save Changes' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;
