import { UserRole, Permission, RejectionReasonCode } from '../types/index.js';

// ============================================================
// API Path Constants
// ============================================================

export const API_PREFIX = '/api';

export const API_PATHS = {
  HEALTH: '/health',
  AUTH: '/auth',
  USERS: '/users',
  AREAS: '/areas',
  ZONES: '/zones',
  MONITORING: '/monitoring',
  SATELLITE: '/satellite',
  PROCESSING: '/processing',
  CHANGES: '/changes',
  ALERTS: '/alerts',
  MINING: '/mining',
  EPASS: '/epass',
  CHECKPOINT: '/checkpoint',
  RECONCILIATION: '/reconciliation',
  ENFORCEMENT: '/enforcement-cases',
  INTELLIGENCE: '/intelligence',
  REPORTS: '/reports',
} as const;

// ============================================================
// Module M6 — Multi-Threshold Alert Constants
// ============================================================

export const CHANGE_THRESHOLDS = {
  LOW: 2, // 2% <= change < 5%
  MEDIUM: 5, // 5% <= change < 10%
  HIGH: 10, // change >= 10%
} as const;

// ============================================================
// Default Role Permission Map
// ============================================================

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.SUPER_ADMIN]: Object.values(Permission),
  [UserRole.ADMIN]: [
    Permission.USER_READ,
    Permission.USER_CREATE,
    Permission.USER_UPDATE,
    Permission.USER_DEACTIVATE,
    Permission.AREA_READ,
    Permission.AREA_CREATE,
    Permission.AREA_UPDATE,
    Permission.MONITORING_READ,
    Permission.MONITORING_PROCESS,
    Permission.ALERT_READ,
    Permission.ALERT_UPDATE,
    Permission.EPASS_READ,
    Permission.EPASS_CREATE,
    Permission.CHECKPOINT_READ,
    Permission.CHECKPOINT_VERIFY,
    Permission.RECONCILIATION_READ,
    Permission.RECONCILIATION_RUN,
    Permission.ENFORCEMENT_CASE_READ,
    Permission.ENFORCEMENT_CASE_CREATE,
    Permission.ENFORCEMENT_CASE_ASSIGN,
    Permission.ENFORCEMENT_CASE_UPDATE,
    Permission.ENFORCEMENT_CASE_CLOSE,
    Permission.INTELLIGENCE_READ,
    Permission.INTELLIGENCE_EXPORT,
  ],
  [UserRole.FOREST_OFFICER]: [
    Permission.USER_READ,
    Permission.AREA_READ,
    Permission.AREA_CREATE,
    Permission.AREA_UPDATE,
    Permission.MONITORING_READ,
    Permission.MONITORING_PROCESS,
    Permission.ALERT_READ,
    Permission.ALERT_UPDATE,
    Permission.RECONCILIATION_READ,
    Permission.RECONCILIATION_RUN,
    Permission.ENFORCEMENT_CASE_READ,
    Permission.ENFORCEMENT_CASE_CREATE,
    Permission.ENFORCEMENT_CASE_ASSIGN,
    Permission.ENFORCEMENT_CASE_UPDATE,
    Permission.ENFORCEMENT_CASE_CLOSE,
    Permission.INTELLIGENCE_READ,
    Permission.INTELLIGENCE_EXPORT,
  ],
  [UserRole.MINING_OFFICER]: [
    Permission.USER_READ,
    Permission.AREA_READ,
    Permission.EPASS_READ,
    Permission.EPASS_CREATE,
    Permission.ALERT_READ,
    Permission.RECONCILIATION_READ,
    Permission.RECONCILIATION_RUN,
    Permission.INTELLIGENCE_READ,
  ],
  [UserRole.CHECKPOINT_OFFICER]: [
    Permission.USER_READ,
    Permission.EPASS_READ,
    Permission.CHECKPOINT_READ,
    Permission.CHECKPOINT_VERIFY,
  ],
  [UserRole.FIELD_OFFICER]: [
    Permission.USER_READ,
    Permission.AREA_READ,
    Permission.MONITORING_READ,
    Permission.ALERT_READ,
    Permission.ALERT_UPDATE,
    Permission.CHECKPOINT_READ,
    Permission.ENFORCEMENT_CASE_READ,
    Permission.ENFORCEMENT_CASE_UPDATE,
    Permission.INTELLIGENCE_READ,
  ],
  [UserRole.VIEWER]: [
    Permission.USER_READ,
    Permission.AREA_READ,
    Permission.MONITORING_READ,
    Permission.ALERT_READ,
    Permission.RECONCILIATION_READ,
    Permission.ENFORCEMENT_CASE_READ,
    Permission.INTELLIGENCE_READ,
  ],
};

// ============================================================
// Module Names
// ============================================================

export const MODULE_NAMES = {
  M1: 'User & Access Management',
  M2: 'Marked Area & Map Management',
  M3: 'Multi-Satellite Image Acquisition',
  M4: 'Monitoring Scheduler',
  M5: 'Local Image Processing',
  M6: 'Change Detection & Classification',
  M7: 'Authorized Mining Monitoring',
  M8: 'Alert & Field Verification',
  M9: 'Transport & E-Pass Management',
  M10: 'Checkpoint Enforcement',
  M11: 'Mining & Transport Reconciliation',
  M12: 'Enforcement Case Management & Investigation',
  M13: 'Intelligence Dashboard & Decision Support',
} as const;


// ============================================================
// HTTP Status Codes
// ============================================================

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

// ============================================================
// Monitoring Observation Rejection Reason Labels
// ============================================================

export const REJECTION_REASON_LABELS: Record<RejectionReasonCode, string> = {
  [RejectionReasonCode.CLOUD_COVER_EXCEEDS_THRESHOLD]: 'Cloud cover exceeds configured threshold',
  [RejectionReasonCode.HIGH_CLOUD_COVER]: 'Cloud cover exceeds configured threshold',
  [RejectionReasonCode.SENSOR_TRACK_MISMATCH]: 'Sensor does not match the active baseline track',
  [RejectionReasonCode.TEMPORAL_INELIGIBLE]: 'Observation is not newer than the last processed observation',
  [RejectionReasonCode.GEOMETRY_NOT_INTERSECTING]: 'Observation footprint does not intersect the monitoring zone',
  [RejectionReasonCode.DUPLICATE_OBSERVATION]: 'Observation has already been processed',
  [RejectionReasonCode.BASELINE_MATCH]: 'Observation matches the active baseline and is not a new observation',
  [RejectionReasonCode.SAR_POLARIZATION_MISMATCH]: 'SAR polarization does not match required bands (VV/VH)',
  [RejectionReasonCode.SAR_ACQUISITION_MODE_MISMATCH]: 'SAR acquisition mode does not match required mode (IW)',
  [RejectionReasonCode.SAR_ORBIT_MISMATCH]: 'SAR orbit geometry does not match active baseline',
  [RejectionReasonCode.SAR_RELATIVE_ORBIT_MISMATCH]: 'SAR relative orbit (repeat-pass track) does not match active baseline',
  [RejectionReasonCode.SAR_ORBIT_DIRECTION_MISMATCH]: 'SAR orbit direction does not match active baseline',
  [RejectionReasonCode.SAR_BASELINE_UNAVAILABLE]: 'No active SAR baseline is configured for this zone',
  [RejectionReasonCode.OPTICAL_SENSOR_MISMATCH]: 'Cross-sensor optical comparison is unsupported without validated cross-sensor normalization (e.g. Landsat vs Sentinel-2)',
  [RejectionReasonCode.OPTICAL_RESOLUTION_MISMATCH]: 'Optical ground sampling distance (pixel resolution) is mismatched',
  [RejectionReasonCode.OPTICAL_PRODUCT_LEVEL_MISMATCH]: 'Optical surface reflectance processing level is mismatched',
  [RejectionReasonCode.OTHER]: 'Observation ineligible',
};

export function getRejectionReasonLabel(code: string | RejectionReasonCode): string {
  if (code && typeof code === 'string' && code in REJECTION_REASON_LABELS) {
    return REJECTION_REASON_LABELS[code as RejectionReasonCode];
  }
  return 'Observation ineligible';
}

