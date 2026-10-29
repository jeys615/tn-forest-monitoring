// ============================================================
// User Roles & Statuses
// ============================================================

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  FOREST_OFFICER = 'FOREST_OFFICER',
  MINING_OFFICER = 'MINING_OFFICER',
  CHECKPOINT_OFFICER = 'CHECKPOINT_OFFICER',
  FIELD_OFFICER = 'FIELD_OFFICER',
  VIEWER = 'VIEWER',
  TRANSPORTER = 'TRANSPORTER',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export enum Permission {
  // User Management
  USER_READ = 'USER_READ',
  USER_CREATE = 'USER_CREATE',
  USER_UPDATE = 'USER_UPDATE',
  USER_DEACTIVATE = 'USER_DEACTIVATE',
  USER_MANAGE_ROLES = 'USER_MANAGE_ROLES',

  // Authorization Constants
  AREA_READ = 'AREA_READ',
  AREA_CREATE = 'AREA_CREATE',
  AREA_UPDATE = 'AREA_UPDATE',
  MONITORING_READ = 'MONITORING_READ',
  MONITORING_PROCESS = 'MONITORING_PROCESS',
  ALERT_READ = 'ALERT_READ',
  ALERT_UPDATE = 'ALERT_UPDATE',
  EPASS_READ = 'EPASS_READ',
  EPASS_CREATE = 'EPASS_CREATE',
  CHECKPOINT_READ = 'CHECKPOINT_READ',
  CHECKPOINT_VERIFY = 'CHECKPOINT_VERIFY',
  RECONCILIATION_READ = 'RECONCILIATION_READ',
  RECONCILIATION_RUN = 'RECONCILIATION_RUN',
  ENFORCEMENT_CASE_READ = 'ENFORCEMENT_CASE_READ',
  ENFORCEMENT_CASE_CREATE = 'ENFORCEMENT_CASE_CREATE',
  ENFORCEMENT_CASE_ASSIGN = 'ENFORCEMENT_CASE_ASSIGN',
  ENFORCEMENT_CASE_UPDATE = 'ENFORCEMENT_CASE_UPDATE',
  ENFORCEMENT_CASE_CLOSE = 'ENFORCEMENT_CASE_CLOSE',
  INTELLIGENCE_READ = 'INTELLIGENCE_READ',
  INTELLIGENCE_EXPORT = 'INTELLIGENCE_EXPORT',
}



// ============================================================
// User & Auth DTOs
// ============================================================

export interface UserDto {
  id: string;
  employeeId?: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  companyId?: string;
  companyName?: string;
  permissions: string[];
  status: UserStatus;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: UserDto;
  token: string;
  expiresIn: string;
}

export interface CreateUserRequest {
  employeeId?: string;
  name: string;
  email: string;
  phone?: string;
  password: string;
  role: UserRole;
  permissions?: string[];
}

export interface UpdateUserRequest {
  employeeId?: string;
  name?: string;
  phone?: string;
  role?: UserRole;
  permissions?: string[];
}

export interface UpdateUserStatusRequest {
  status: UserStatus;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// ============================================================
// Area Types & Statuses
// ============================================================

export enum AreaType {
  PROTECTED = 'PROTECTED',
  AUTHORIZED_MINING = 'AUTHORIZED_MINING',
  SUSPICIOUS = 'SUSPICIOUS',
  GENERAL = 'GENERAL',
}

export enum AreaStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  INACTIVE = 'INACTIVE',
  UNDER_REVIEW = 'UNDER_REVIEW',
  ARCHIVED = 'ARCHIVED',
}

// ============================================================
// Zone Categories, Statuses & GeoJSON types
// ============================================================

export enum ZoneCategory {
  PROTECTED_FOREST = 'PROTECTED_FOREST',
  RESERVED_AREA = 'RESERVED_AREA',
  COMMERCIAL_LEASE = 'COMMERCIAL_LEASE',
  SUSPICIOUS_HOTSPOT = 'SUSPICIOUS_HOTSPOT',
  GENERAL = 'GENERAL',
}

export enum ZoneStatus {
  PROTECTED = 'PROTECTED',
  SUSPICIOUS = 'SUSPICIOUS',
  SUSPENDED = 'SUSPENDED',
}

export interface GeoJSONPoint {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
}

export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: [number, number][][]; // [[[lng, lat], [lng, lat], ...]]
}

export interface GeoJSONMultiPolygon {
  type: 'MultiPolygon';
  coordinates: [number, number][][][]; // [[[[lng, lat], ...]], [[[lng, lat], ...]]]
}

export type GeoJSONGeometry = GeoJSONPolygon | GeoJSONMultiPolygon;

// ============================================================
// Zone DTOs
// ============================================================

export enum MonitoringTrack {
  OPTICAL = 'OPTICAL',
  SAR = 'SAR',
}

export interface TrackConfigDto {
  enabled: boolean;
}

export interface ZoneMonitoringTracksDto {
  optical: TrackConfigDto;
  sar: TrackConfigDto;
}

export interface ZoneDto {
  id: string;
  zoneId: string;
  name: string;
  category: ZoneCategory;
  status: ZoneStatus;
  boundary: GeoJSONPolygon | GeoJSONMultiPolygon;
  centerPoint: GeoJSONPoint;
  baselineDate?: string;
  baselineImageUrl?: string;
  baselineImageRef?: string;
  monitoringTracks?: ZoneMonitoringTracksDto;
  createdBy: {
    id: string;
    name: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CreateZoneRequest {
  name: string;
  category: ZoneCategory;
  boundary: GeoJSONPolygon | GeoJSONMultiPolygon;
  baselineDate?: string;
  baselineImageUrl?: string;
  baselineImageRef?: string;
  monitoringTracks?: ZoneMonitoringTracksDto;
}

export interface UpdateZoneRequest {
  name?: string;
  category?: ZoneCategory;
  boundary?: GeoJSONPolygon | GeoJSONMultiPolygon;
  status?: ZoneStatus;
  baselineDate?: string;
  baselineImageUrl?: string;
  baselineImageRef?: string;
  monitoringTracks?: {
    optical?: TrackConfigDto;
    sar?: TrackConfigDto;
  };
}

export enum SensorType {
  OPTICAL = 'OPTICAL',
  SAR = 'SAR',
  DEM = 'DEM',
}

export enum SatelliteSource {
  SENTINEL_2 = 'SENTINEL_2',
  LANDSAT_8 = 'LANDSAT_8',
  LANDSAT_9 = 'LANDSAT_9',
  SENTINEL_1 = 'SENTINEL_1',
  SRTM = 'SRTM',
}

export enum SatelliteProcessingStatus {
  ACQUIRED = 'ACQUIRED',
  CATALOG_ACQUIRED = 'CATALOG_ACQUIRED',
  PROCESSING = 'PROCESSING',
  EXPORT_REQUESTED = 'EXPORT_REQUESTED',
  EXPORT_RUNNING = 'EXPORT_RUNNING',
  EXPORT_COMPLETED = 'EXPORT_COMPLETED',
  DRIVE_FILE_FOUND = 'DRIVE_FILE_FOUND',
  DOWNLOADED = 'DOWNLOADED',
  RASTER_VALIDATED = 'RASTER_VALIDATED',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
}

export interface SatelliteMetadataDto {
  id: string;
  imageId: string;
  source: SatelliteSource;
  sensorType?: SensorType;
  acquisitionDate: string;
  cloudCover: number;
  footprint: GeoJSONPolygon | GeoJSONMultiPolygon;
  processingStatus: SatelliteProcessingStatus;
  geeReference: string;
  intersectingZones: string[]; // List of Zone ObjectIds
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;

  // Real GEE raster export & processing tracking fields
  geeExportTaskId?: string;
  driveFileId?: string;
  driveFileName?: string;
  driveFileSizeBytes?: number;
  localRasterPath?: string;
  rasterWidth?: number;
  rasterHeight?: number;
  rasterBandCount?: number;
  originalCrs?: string;
  rasterCrs?: string;
  areaCalculationCrs?: string;
  pixelAreaM2?: number;
  resolutionMeters?: number;
  spectralIndicesCalculated?: boolean;
  pipelineCompletedAt?: string;
  failureReason?: string;

  // Authentic SAR/Optical Satellite Telemetry
  platform?: string;
  mission?: string;
  instrument?: string;
  mode?: string;
  polarizations?: string[];
  orbitDirection?: 'ASCENDING' | 'DESCENDING' | string;
  absoluteOrbitNumber?: number;
  relativeOrbitNumber?: number;

  // Structured pipeline error tracking
  errorStage?: PipelineErrorStage;
  errorCode?: string;
  errorMessage?: string;
  errorCause?: string;
  failedAt?: string;
  operationId?: string;
  retryCount?: number;
}

export enum PipelineErrorStage {
  EXPORT_SUBMISSION_FAILED = 'EXPORT_SUBMISSION_FAILED',
  GEE_OPERATION_FAILED = 'GEE_OPERATION_FAILED',
  DRIVE_LOOKUP_FAILED = 'DRIVE_LOOKUP_FAILED',
  DRIVE_DOWNLOAD_FAILED = 'DRIVE_DOWNLOAD_FAILED',
  RASTER_VALIDATION_FAILED = 'RASTER_VALIDATION_FAILED',
  DATE_RANGE_INVALID = 'DATE_RANGE_INVALID',
  METADATA_NOT_FOUND = 'METADATA_NOT_FOUND',
  DUPLICATE_ACQUISITION = 'DUPLICATE_ACQUISITION',
  UNKNOWN = 'UNKNOWN',
}

export interface AcquireImageRequest {
  zoneId: string;
  startDate: string;
  endDate: string;
  maxCloudCover?: number;
  sensorType?: SensorType;
  source?: SatelliteSource;
  imageId?: string;
  sync?: boolean;
}

export interface QueryFootprintRequest {
  footprint?: GeoJSONPolygon;
  type?: 'Polygon';
  coordinates?: [number, number][][];
  startDate?: string;
  endDate?: string;
  source?: SatelliteSource;
  sensorType?: SensorType;
}

export interface SatelliteQueryFilters {
  source?: SatelliteSource;
  sensorType?: SensorType;
  processingStatus?: SatelliteProcessingStatus;
  zoneId?: string;
  startDate?: string;
  endDate?: string;
  exactDate?: string;
  imageId?: string;
}

// ============================================================
// E-Pass Statuses
// ============================================================

export enum EPassStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  USED = 'USED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
  REVOKED = 'REVOKED',
}

// ============================================================
// Checkpoint Sync Statuses
// ============================================================

export enum CheckpointSyncStatus {
  PENDING_SYNC = 'PENDING_SYNC',
  SYNCED = 'SYNCED',
  SYNC_FAILED = 'SYNC_FAILED',
}

// ============================================================
// Module Status (for tracking development progress)
// ============================================================

export enum ModuleStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  TESTING = 'TESTING',
}

// ============================================================
// Common API Response Types
// ============================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface PaginatedResponse<T = unknown> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================================
// Health Check Response
// ============================================================

export interface HealthCheckResponse {
  status: string;
  environment: string;
  timestamp: string;
  uptime: number;
  database: {
    status: string;
  };
}

// ============================================================
// Monitoring Scheduler & Processing Types (M4)
// ============================================================

export enum MonitoringJobStatus {
  PENDING = 'PENDING',
  ACQUIRING = 'ACQUIRING',
  EXPORTING = 'EXPORTING',
  DOWNLOADING = 'DOWNLOADING',
  PREPROCESSING = 'PREPROCESSING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  WAITING_FOR_NEXT_CYCLE = 'WAITING_FOR_NEXT_CYCLE',
  FAILED = 'FAILED',
}

export enum MonitoringJobType {
  SCHEDULED_SCAN = 'SCHEDULED_SCAN',
  TARGETED_ACQUISITION = 'TARGETED_ACQUISITION',
}

export interface MonitoringJobDto {
  id: string;
  jobId: string;
  type: MonitoringJobType;
  zoneId?: string;
  satelliteMetadataId?: string;
  sensorType?: SensorType;
  source?: SatelliteSource;
  status: MonitoringJobStatus;
  retryCount: number;
  maxRetries: number;
  logs: string[];
  scheduledAt: string;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  acquisition?: {
    provider?: string;
    satellite?: string;
    sensor?: string;
    collection?: string;
    imageId?: string;
    acquisitionDate?: string;
    cloudCover?: number;
    nativeResolution?: number;
  };
  export?: {
    geeTaskId?: string;
    geeTaskState?: string;
    driveFileId?: string;
    driveFileName?: string;
    driveFolderId?: string;
    exportedAt?: string;
    downloadedAt?: string;
  };
  processing?: {
    mode?: string;
    nativeResolution?: number;
    processingResolution?: number;
    targetCRS?: string;
    resamplingMethod?: string;
    normalizationMethod?: string;
  };
  raster?: {
    width?: number;
    height?: number;
    bands?: string[];
    validPixels?: number;
    maskedPixels?: number;
    coveragePercentage?: number;
  };
  results?: {
    processedImageUrl?: string;
    ndviMean?: number;
    ndwiMean?: number;
    nbrMean?: number;
    bsiMean?: number;
    eviMean?: number;
    saviMean?: number;
    cloudCoverUsed?: number;
    anomalyScore?: number;
    evidenceScore?: number;
    changedPixels?: number;
    validPixels?: number;
    noChangePixels?: number;
    affectedAreaPercentage?: number;
    affectedAreaHa?: number;
    affectedAreaM2?: number;
    severity?: string;
  };
  diagnostics?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleMonitoringJobRequest {
  type: MonitoringJobType;
  zoneId?: string;
  satelliteMetadataId?: string;
  sensorType?: SensorType;
  source?: SatelliteSource;
  scheduledAt?: string; // ISO date string
}

// ============================================================
// Baseline Management & Processing Types (M5)
// ============================================================

export enum BaselineStatus {
  CANDIDATE = 'CANDIDATE',
  ACTIVE = 'ACTIVE',
  RETIRED = 'RETIRED',
  REJECTED = 'REJECTED',
  FROZEN = 'FROZEN',

  // Real GEE pipeline state flow
  DISCOVERED = 'DISCOVERED',
  EXPORT_REQUESTED = 'EXPORT_REQUESTED',
  EXPORT_RUNNING = 'EXPORT_RUNNING',
  EXPORT_COMPLETED = 'EXPORT_COMPLETED',
  DRIVE_AVAILABLE = 'DRIVE_AVAILABLE',
  RASTER_VALIDATED = 'RASTER_VALIDATED',
  PROCESSED = 'PROCESSED',

  // Failure states
  GEE_SEARCH_FAILED = 'GEE_SEARCH_FAILED',
  EXPORT_FAILED = 'EXPORT_FAILED',
  DRIVE_FILE_MISSING = 'DRIVE_FILE_MISSING',
  RASTER_INVALID = 'RASTER_INVALID',
  PROCESSING_FAILED = 'PROCESSING_FAILED',
}

export interface BaselineDto {
  id: string;
  zoneId: string;
  satelliteMetadataId: string;
  imageId?: string;
  sensorType: SensorType;
  source: SatelliteSource;
  monitoringTrack?: MonitoringTrack;
  acquisitionDate: string;
  status: BaselineStatus;
  isActive: boolean;
  qualityScore: number;
  cloudCover: number | null;
  validPixelPercentage: number;
  selectionReason: string;
  processingSummary?: string;
  validFrom?: string;
  validUntil?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;

  /**
   * HLS representation reference (Phase 1 schema preparation — populated in Phase 2+).
   * Serialized ObjectId of the HLSRepresentation document for this baseline.
   * Undefined for all current production baselines.
   * OPTICAL track only — never set on SAR baselines.
   */
  hlsRepresentationId?: string;

  // Real GEE pipeline tracking fields
  geeExportTaskId?: string;
  driveFileId?: string;
  driveFileName?: string;
  driveFileSizeBytes?: number;
  localRasterPath?: string;
  rasterValidated?: boolean;
  rasterWidth?: number;
  rasterHeight?: number;
  rasterCrs?: string;
  originalCrs?: string;
  areaCalculationCrs?: string;
  pixelAreaM2?: number;
  rasterBandCount?: number;
  spectralIndicesCalculated?: boolean;
  pipelineCompletedAt?: string;
  failureReason?: string;

  // Structured pipeline error tracking
  errorStage?: PipelineErrorStage;
  errorCode?: string;
  errorMessage?: string;
  errorCause?: string;
  failedAt?: string;
  operationId?: string;
  retryCount?: number;

  // Authentic SAR Orbit & Geometry fields
  platform?: string;
  mode?: string;
  polarizations?: string[];
  orbitDirection?: 'ASCENDING' | 'DESCENDING';
  absoluteOrbitNumber?: number;
  relativeOrbitNumber?: number;
}

export interface SelectBaselineCandidateRequest {
  zoneId: string;
  sensorType: SensorType;
  satelliteMetadataId?: string;
  startDate?: string;
  endDate?: string;
  overrideSelection?: boolean;
  selectionReason?: string;
  sync?: boolean;
}

export interface VerificationGateDto {
  gate: number;
  name: string;
  category: string;
  status: 'PASSED' | 'FAILED' | 'PENDING';
  message: string;
  details?: Record<string, unknown>;
}

export interface BaselineVerificationResultDto {
  isEligible: boolean;
  verificationStatus: 'VERIFIED' | 'NOT_ELIGIBLE' | 'PENDING_EXPORT';
  qualityScore: number;
  selectionReason: string;
  gates: VerificationGateDto[];
  candidate: BaselineDto | null;
  satelliteMetadataId: string;
  imageId: string;
  sensorType: SensorType;
  acquisitionDate: string;
  cloudCover: number | null;
  zoneId: string;
  zoneName: string;
  zoneCode: string;
  evaluatedAt: string;
}

export interface AvailableSatelliteObservationDto {
  satelliteMetadataId: string;
  imageId: string;
  platform: string;
  source: SatelliteSource;
  sensorType: SensorType;
  monitoringTrack: 'OPTICAL' | 'SAR';
  acquisitionDate: string;
  cloudCover: number | null;
  processingStatus: SatelliteProcessingStatus;
  hasLocalRaster: boolean;
  baselineStatus: BaselineStatus | 'NOT_EVALUATED';
  isBaselineActive: boolean;
  baselineId?: string;
  qualityScore?: number;
  failureReason?: string;
}

export interface EvaluateBaselineCandidateRequest {
  zoneId: string;
  satelliteMetadataId: string;
  sensorType?: SensorType;
  initiateExport?: boolean;
}

export interface SelectBaselineResponse {
  candidate: BaselineDto | null;
  qualityScore: number;
  selectionReason: string;
  rejectedCandidates: Array<{ satelliteMetadataId: string; reason: string }>;
  status?: BaselineStatus;
  baselineId?: string;
  satelliteImageId?: string;
  geeExportTaskId?: string;
  verification?: BaselineVerificationResultDto;
}

export interface HistoricalReferenceRequest {
  zoneId?: string;
  footprint?: GeoJSONPolygon;
  sensorType: SensorType;
  startDate: string;
  endDate: string;
  maxCloudCover?: number;
}

export interface HistoricalReferenceResponse {
  referenceMetadata: SatelliteMetadataDto | null;
  isExistingActiveBaseline: boolean;
  baselineId?: string;
  sensorType: SensorType;
  selectionReason: string;
  fallbackToSar: boolean;
}

export interface OpticalMetrics {
  ndvi: number;
  ndwi: number;
  ndbi: number;
  bsi: number;
  savi: number;
  evi: number;
}

export interface SarMetrics {
  vv: number;
  vh: number;
  vvVhRatio: number;
  vvDifference?: number;
  vhDifference?: number;
  ratioDifference?: number;
}

export interface QualityMetrics {
  cloudCover: number;
  validPixelPercentage: number;
  zoneCoveragePercentage: number;
  missingBands?: string[];
  polarizationAvailable?: string;
  acquisitionMode?: string;
  orbitDirection?: string;
  imageQuality: number;
}

export interface ProcessedImageResultDto {
  id: string;
  zoneId?: string;
  temporaryAreaId?: string;
  satelliteMetadataId: string;
  baselineId?: string;
  sensorType: SensorType;
  source: SatelliteSource;
  acquisitionDate: string;
  processingStatus: SatelliteProcessingStatus;
  qualityMetrics: QualityMetrics;
  opticalMetrics?: OpticalMetrics;
  sarMetrics?: SarMetrics;
  processingDurationMs: number;
  processedImageUrl?: string;
  fallbackTriggered?: boolean;
  fallbackReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProcessImageRequest {
  satelliteMetadataId: string;
  zoneId?: string;
  temporaryAreaId?: string;
  sensorType?: SensorType;
  referenceMetadataId?: string;
  forceProcessing?: boolean;
}

// ============================================================
// Module M6 — Change Detection & Multi-Threshold Alerting DTOs
// ============================================================

export enum AlertSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum AlertStatus {
  OPEN = 'OPEN',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  CONFIRMED = 'CONFIRMED',
  RESOLVED = 'RESOLVED',
  DISMISSED = 'DISMISSED',
}

export enum AlertAction {
  ACKNOWLEDGE = 'ACKNOWLEDGE',
  START_REVIEW = 'START_REVIEW',
  CONFIRM = 'CONFIRM',
  DISMISS = 'DISMISS',
  RESOLVE = 'RESOLVE',
  ASSIGN = 'ASSIGN',
}

export interface AlertAuditEntryDto {
  action: AlertAction;
  fromStatus: AlertStatus;
  toStatus: AlertStatus;
  performedBy: string;
  performedAt: string;
  notes?: string;
}

export enum ChangeCategory {
  VEGETATION_LOSS = 'VEGETATION_LOSS',
  WATER_CHANGE = 'WATER_CHANGE',
  BARE_SOIL_EXPOSURE = 'BARE_SOIL_EXPOSURE',
  BUILT_UP_CHANGE = 'BUILT_UP_CHANGE',
  SURFACE_CHANGE = 'SURFACE_CHANGE',
  SAR_STRUCTURAL_CHANGE = 'SAR_STRUCTURAL_CHANGE',
  MIXED_CHANGE = 'MIXED_CHANGE',
  UNKNOWN_CHANGE = 'UNKNOWN_CHANGE',
  PRE_SCREENED_NON_FOREST = 'PRE_SCREENED_NON_FOREST',
}

export type CanopyGuardMode = 'OFF' | 'SHADOW' | 'ACTIVE';

export interface ShadowAccountingModelDto {
  fullCandidatePool: number;
  fullyObservableSubset: number;
  outcomeDeterminedSubset: number;
  seasonalCount: number;
  persistentCount: number;
  uncertainCount: number;
  preScreenedNonForestCount: number;
  seasonalHectares: number;
  persistentHectares: number;
  uncertainHectares: number;
  preScreenedHectares: number;
  fullPoolHectares: number;
  candidateReductionRate: number;
  partitionConservationValid: boolean;
  partitionSum: number;
}

export enum CrossSensorAgreement {
  HIGH = 'HIGH',
  MODERATE = 'MODERATE',
  LOW = 'LOW',
  DISAGREEMENT = 'DISAGREEMENT',
  SINGLE_SENSOR = 'SINGLE_SENSOR',
}

export enum ProcessingMode {
  SIMULATED = 'SIMULATED',
  REAL = 'REAL',
}

export enum SpatialCalculationSource {
  PIXEL_MASK = 'PIXEL_MASK',
  RASTER = 'RASTER',
  DERIVED_INDICATORS = 'DERIVED_INDICATORS',
  SIMULATION = 'SIMULATION',
}

export enum ChangeCalculationMethod {
  SAR_PIXEL_DIFFERENCE = 'SAR_PIXEL_DIFFERENCE',
  SAR_ZONAL_SUMMARY = 'SAR_ZONAL_SUMMARY',
  OPTICAL_PIXEL_DIFFERENCE = 'OPTICAL_PIXEL_DIFFERENCE',
  OPTICAL_ZONAL_SUMMARY = 'OPTICAL_ZONAL_SUMMARY',
}

export enum SpatialCalculationType {
  PIXEL_GRID = 'PIXEL_GRID',
  ZONAL_STATISTICS = 'ZONAL_STATISTICS',
}

export interface AnalysisGridDto {
  zoneId?: string;
  crs: string;
  pixelSizeX: number;
  pixelSizeY: number;
  originX: number;
  originY: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  transform: [number, number, number, number, number, number];
  affineTransform?: [number, number, number, number, number, number];
  resolutionMeters?: number;
  comparisonPixelCount?: number;
  validBaselinePixelCount?: number;
  validCurrentPixelCount?: number;
  overlapPixelCount?: number;
  coveragePercentage?: number;
}

export enum SarChangeDirection {
  DECREASE = 'DECREASE',
  INCREASE = 'INCREASE',
  ABSOLUTE = 'ABSOLUTE',
}

export interface SarThresholdConfigDto {
  vvThresholdDb: number;
  vhThresholdDb: number;
  vvVhRatioThresholdDb?: number;
  decisionRule: 'ANY_BAND' | 'BOTH_BANDS' | 'COMBINED_MAGNITUDE';
  changeDirection?: SarChangeDirection | 'DECREASE' | 'INCREASE' | 'ABSOLUTE';
}

export interface SarRasterStatisticsDto {
  meanDeltaVv: number;
  medianDeltaVv: number;
  stdDeltaVv: number;
  meanDeltaVh: number;
  medianDeltaVh: number;
  stdDeltaVh: number;
  changedVvPixelCount: number;
  changedVhPixelCount: number;
  combinedChangedPixelCount: number;
  validComparisonPixelCount: number;
  // Directional pixel counts & percentages
  negativeChangePixelCount?: number;
  positiveChangePixelCount?: number;
  stablePixelCount?: number;
  negativeAffectedAreaPercentage?: number;
  positiveAffectedAreaPercentage?: number;
}

export interface OpticalThresholdConfigDto {
  ndviThreshold: number; // e.g. -0.15 for forest disturbance / vegetation loss
  ndwiThreshold?: number;
  ndbiThreshold?: number;
  bsiThreshold?: number;
  saviThreshold?: number;
  eviThreshold?: number;
  decisionRule: 'NDVI_DROP' | 'MULTI_INDEX' | 'ANY_INDEX';
  changeDirection?: 'DECREASE' | 'INCREASE' | 'ABSOLUTE';
}

export interface OpticalRasterStatisticsDto {
  meanDeltaNdvi: number;
  medianDeltaNdvi: number;
  stdDeltaNdvi: number;
  meanDeltaNdwi?: number;
  meanDeltaNdbi?: number;
  meanDeltaBsi?: number;
  meanDeltaSavi?: number;
  meanDeltaEvi?: number;
  changedPixelCount: number;
  validComparisonPixelCount: number;
  decreasePixelCount: number;
  increasePixelCount: number;
  stablePixelCount: number;
  decreaseAffectedAreaPercentage: number;
  increaseAffectedAreaPercentage: number;
  cloudMaskedPixelCount?: number;
  shadowMaskedPixelCount?: number;
  negativeChangePixelCount?: number;
  positiveChangePixelCount?: number;
  negativeAffectedAreaPercentage?: number;
  positiveAffectedAreaPercentage?: number;
  meanDeltaVv?: number;
  meanDeltaVh?: number;
}

export interface SpatialChangeResult {
  calculationMode: ProcessingMode;
  spatialSource: SpatialCalculationSource;
  calculationMethod?: ChangeCalculationMethod | string;
  spatialCalculation?: SpatialCalculationType | string;
  analysisGrid?: AnalysisGridDto;
  thresholdConfig?: SarThresholdConfigDto | OpticalThresholdConfigDto;
  rasterStatistics?: SarRasterStatisticsDto | OpticalRasterStatisticsDto;
  opticalThresholdConfig?: OpticalThresholdConfigDto;
  opticalRasterStatistics?: OpticalRasterStatisticsDto;
  baselineSensor?: string;
  currentSensor?: string;
  decreasePixelCount?: number;
  increasePixelCount?: number;
  stablePixelCount?: number;
  zoneArea: number; // in hectares
  changedArea: number; // in hectares
  affectedAreaPercentage: number; // in %
  changedGeometry?: GeoJSONPolygon | GeoJSONMultiPolygon;
  explanation: string;
  originalCrs?: string;
  normalizedCrs?: string;
  areaCalculationCrs?: string;
  pixelAreaM2?: number;
  changedPixels?: number;
  validPixels?: number;
  auditStatus?: string;
  shadowTelemetry?: ShadowAccountingModelDto;
  preScreenedPixels?: number;
  preScreenedAreaHa?: number;
}

export interface ChangeIndicatorDeltas {
  ndviDelta?: number;
  ndwiDelta?: number;
  ndbiDelta?: number;
  bsiDelta?: number;
  saviDelta?: number;
  eviDelta?: number;
  vvDelta?: number;
  vhDelta?: number;
  vvVhRatioDelta?: number;
}

export interface EvidenceBreakdownDto {
  magnitudeScore: number; // 0–40
  dataQualityScore: number; // 0–20
  temporalConsistencyScore: number; // 0–20
  crossSensorScore: number; // 0–20
  totalEvidenceScore: number; // 0–100
  explanation: string;
}

export interface ChangeDetectionDto {
  id: string;
  changeId: string;
  zoneId?: string;
  temporaryAreaId?: string;
  observationId: string;
  baselineId?: string;
  referenceObservationId?: string;
  sensorType: SensorType;
  source: SatelliteSource;
  monitoringTrack?: MonitoringTrack;
  detectedAt: string;
  zoneArea: number;
  changedArea: number;
  affectedAreaPercentage: number;
  calculationMode: ProcessingMode;
  spatialSource: SpatialCalculationSource;
  calculationMethod?: ChangeCalculationMethod | string;
  spatialCalculation?: SpatialCalculationType | string;
  analysisGrid?: AnalysisGridDto;
  thresholdConfig?: SarThresholdConfigDto | OpticalThresholdConfigDto;
  rasterStatistics?: SarRasterStatisticsDto | OpticalRasterStatisticsDto;
  opticalThresholdConfig?: OpticalThresholdConfigDto;
  opticalRasterStatistics?: OpticalRasterStatisticsDto;
  baselineSensor?: string;
  currentSensor?: string;
  decreasePixelCount?: number;
  increasePixelCount?: number;
  stablePixelCount?: number;
  threshold2Crossed: boolean;
  threshold5Crossed: boolean;
  threshold10Crossed: boolean;
  highestThresholdCrossed: number;
  severity: AlertSeverity | 'NONE';
  evidenceStrength: number;
  evidenceBreakdown: EvidenceBreakdownDto;
  categories: ChangeCategory[];
  changeIndicators: ChangeIndicatorDeltas;
  opticalEvidence?: 'CLEAN' | 'CLOUD_DEGRADED' | 'UNAVAILABLE';
  sarEvidence?: 'AVAILABLE' | 'UNAVAILABLE';
  crossSensorAgreement: CrossSensorAgreement;
  temporalConsistency: string;
  explanation: string;
  alertGenerated: boolean;
  alertId?: string;
  changedGeometry?: GeoJSONPolygon | GeoJSONMultiPolygon;
  comparisonMode?: ComparisonMode;
  baselineHlsRepresentationId?: string;
  currentHlsRepresentationId?: string;
  baselineHlsImageId?: string;
  currentHlsImageId?: string;
  hlsVersion?: string;
  processingVersion?: string;
  processingFamily?: string;
  crossSensor?: boolean;
  hlsMode?: string;
  qaPolicy?: string;
  auditStatus?: string;
  shadowTelemetry?: ShadowAccountingModelDto;
  preScreenedAreaHa?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AlertDto {
  id: string;
  alertId: string;
  zoneId?: string;
  temporaryAreaId?: string;
  changeDetectionId: string;
  detectedAt: string;
  affectedAreaPercentage: number;
  highestThresholdCrossed: number;
  thresholdsCrossed: number[];
  severity: AlertSeverity;
  evidenceStrength: number;
  calculationMode: ProcessingMode;
  sensorType: SensorType;
  monitoringTrack?: MonitoringTrack;
  evidenceSources: SensorType[];
  categories: ChangeCategory[];
  explanation: string;
  status: AlertStatus;
  // Lineage fields (populated from linked ChangeDetection at alert creation)
  comparisonMode?: ComparisonMode;
  baselineHlsRepresentationId?: string;
  currentHlsRepresentationId?: string;
  changedArea?: number;
  // Lifecycle fields
  assignedTo?: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  confirmedAt?: string;
  confirmedBy?: string;
  dismissedAt?: string;
  dismissedBy?: string;
  dismissalReason?: string;
  resolutionInfo?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  notes?: string;
  auditHistory?: AlertAuditEntryDto[];
  createdAt: string;
  updatedAt: string;
}

export interface AlertStatsDto {
  total: number;
  open: number;
  acknowledged: number;
  underReview: number;
  confirmed: number;
  resolved: number;
  dismissed: number;
  highSeverity: number;
  mediumSeverity: number;
  lowSeverity: number;
}

export interface AlertListResponseDto {
  data: AlertDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AlertActionRequest {
  action: AlertAction;
  notes?: string;
  dismissalReason?: string;
  resolutionInfo?: string;
}

export interface AlertAssignRequest {
  assigneeId: string;
  notes?: string;
}

export interface DetectChangeRequest {
  zoneId?: string;
  temporaryAreaId?: string;
  boundary?: GeoJSONPolygon | GeoJSONMultiPolygon;
  observationId: string;
  baselineId?: string;
  referenceObservationId?: string;
  forceSensorType?: SensorType;
  startDate?: string;
  endDate?: string;
  forceRecalculate?: boolean;
}

export interface UpdateAlertStatusRequest {
  status: AlertStatus;
  notes?: string;
}


// ─── Module M7: Temporary Area & Mining Extraction Types ─────────────────────

export enum TemporaryAreaStatus {
  DRAFT = 'DRAFT',
  ANALYSIS_REQUESTED = 'ANALYSIS_REQUESTED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  ARCHIVED = 'ARCHIVED',
}

export enum MiningClassification {
  VEGETATION_CLEARANCE = 'VEGETATION_CLEARANCE',
  BARE_SOIL_EXPOSURE = 'BARE_SOIL_EXPOSURE',
  EXCAVATION_EXPANSION = 'EXCAVATION_EXPANSION',
  STOCKPILE_CHANGE = 'STOCKPILE_CHANGE',
  QUARRY_EXPANSION = 'QUARRY_EXPANSION',
  SURFACE_DISTURBANCE = 'SURFACE_DISTURBANCE',
  POSSIBLE_MINING_ACTIVITY = 'POSSIBLE_MINING_ACTIVITY',
  NON_MINING_DISTURBANCE = 'NON_MINING_DISTURBANCE',
}

export interface TemporaryAreaDto {
  id: string;
  temporaryAreaId: string;
  name: string;
  boundary: GeoJSONPolygon;
  areaHectares: number;
  areaSquareMeters: number;
  centerPoint: GeoJSONPoint;
  startDate: string;
  endDate: string;
  reason?: string;
  status: TemporaryAreaStatus;
  createdBy: string;
  demElevationDataAvailable: boolean;
  estimatedMeanDepthMeters?: number;
  zoneId?: string;
  createdAt: string;
  updatedAt: string;
}

export enum MarkedAreaType {
  PERMANENT = 'PERMANENT',
  TEMPORARY = 'TEMPORARY',
}

export interface CreateTemporaryAreaRequest {
  name: string;
  boundary: GeoJSONPolygon;
  startDate: string;
  endDate: string;
  reason?: string;
  demElevationDataAvailable?: boolean;
  estimatedMeanDepthMeters?: number;
  zoneId?: string;
}

export interface MiningExtractionEstimateDto {
  id: string;
  estimateId: string;
  areaType?: MarkedAreaType;
  markedAreaId?: string;
  temporaryAreaId?: string;
  zoneId?: string;
  changeDetectionId?: string;
  observationId: string;
  observationDate: string;
  changedAreaSquareMeters: number;
  changedAreaHectares: number;
  percentageOfTemporaryArea: number;
  miningClassification: MiningClassification;
  estimatedDepthMeters?: number;
  estimatedVolumeCubicMeters?: number;
  volumeUnit: string;
  isVolumeAvailable: boolean;
  volumeUnavailableReason?: string;
  estimationMethod: string;
  estimationConfidence: number;
  disclaimer: string;
  createdAt: string;
  updatedAt: string;
}

export interface TemporaryAreaTimelineItemDto {
  stepNumber: number;
  observationId: string;
  observationDate: string;
  satelliteSource: SatelliteSource;
  sensorType: SensorType;
  cloudCover: number;
  referenceObservationId: string;
  referenceDate: string;
  changedAreaSquareMeters: number;
  changedAreaHectares: number;
  affectedAreaPercentage: number;
  cumulativeChangedAreaHectares: number;
  isProgressiveExpansion: boolean;
  severity: AlertSeverity | 'NONE';
  evidenceStrength: number;
  miningClassification: MiningClassification;
  estimatedVolumeCubicMeters?: number;
  isVolumeAvailable: boolean;
  explanation: string;
}

export interface TemporaryAreaAnalysisReportDto {
  temporaryArea: TemporaryAreaDto;
  summary: {
    totalObservations: number;
    analyzedObservations: number;
    opticalObservations: number;
    sarObservations: number;
    cloudCoverAverage: number;
    overallSeverity: AlertSeverity | 'NONE';
    maxEvidenceStrength: number;
    totalCumulativeChangedAreaHectares: number;
    maxPercentageAffected: number;
    primaryClassification: MiningClassification;
    totalEstimatedVolumeCubicMeters?: number;
    isVolumeAvailable: boolean;
    disclaimer: string;
    analysisCompletedAt: string;
  };
  timeline: TemporaryAreaTimelineItemDto[];
  miningEstimates: MiningExtractionEstimateDto[];
  changes: ChangeDetectionDto[];
  alerts: AlertDto[];
  results?: MarkedAreaCalculationResultDto[];
}

// ============================================================
// Unified Marked Area Analysis Types
// ============================================================

export interface MarkedAreaCalculationResultDto {
  observationId: string;
  baselineId?: string;
  referenceId?: string;
  sensorType: SensorType;
  source: SatelliteSource;
  acquisitionDate: string;
  indicators: {
    opticalMetrics?: OpticalMetrics;
    sarMetrics?: SarMetrics;
  };
  changedAreaM2: number;
  changedAreaHectares: number;
  affectedAreaPercentage: number;
  thresholdsCrossed: {
    low: boolean;
    medium: boolean;
    high: boolean;
  };
  severity: AlertSeverity | 'NONE';
  evidenceStrength: number;
  changeCategories: ChangeCategory[];
  miningActivityClassification: MiningClassification;
  estimatedDepth?: number;
  estimatedVolume?: number;
  volumeUnit: string;
  estimationMethod: string;
  estimationConfidence: number;
  explanation: string;
  changedGeometry?: GeoJSONPolygon | GeoJSONMultiPolygon;
}

export enum AnalysisAreaType {
  PERMANENT_ZONE = 'PERMANENT',
  TEMPORARY_AREA = 'TEMPORARY',
}

export enum GisMapMode {
  BASE_MAP = 'BASE_MAP',
  SATELLITE = 'SATELLITE',
  TERRAIN = 'TERRAIN',
  CHANGE_DETECTION = 'CHANGE_DETECTION',
  NDVI = 'NDVI',
  NDWI = 'NDWI',
  NDBI = 'NDBI',
  BSI = 'BSI',
  SAVI = 'SAVI',
  EVI = 'EVI',
  SAR_VV = 'SAR_VV',
  SAR_VH = 'SAR_VH',
  SAR_VV_VH = 'SAR_VV_VH',
  MINING_ANALYSIS = 'MINING_ANALYSIS',
}

export interface BeforeAfterComparisonDto {
  beforeObservation: {
    id: string;
    source: SatelliteSource;
    sensorType: SensorType;
    acquisitionDate: string;
    cloudCover?: number;
    metrics?: OpticalMetrics | SarMetrics;
    isBaseline: boolean;
  };
  afterObservation: {
    id: string;
    source: SatelliteSource;
    sensorType: SensorType;
    acquisitionDate: string;
    cloudCover?: number;
    metrics?: OpticalMetrics | SarMetrics;
    isBaseline: boolean;
  };
  changeDetection?: ChangeDetectionDto;
  miningEstimate?: MiningExtractionEstimateDto;
}

export interface HistoricalObservationQueryRequest {
  areaId?: string;
  areaType?: MarkedAreaType | AnalysisAreaType;
  boundary?: GeoJSONPolygon | GeoJSONMultiPolygon;
  startDate?: string;
  endDate?: string;
  sensorType?: SensorType;
  source?: SatelliteSource;
  comparisonDate?: string;
}

export interface MarkedAreaAnalysisRequest {
  areaId: string;
  areaType: MarkedAreaType;
  areaName?: string;
  boundary: GeoJSONPolygon | GeoJSONMultiPolygon;
  areaHectares: number;
  startDate?: string;
  endDate?: string;
  demElevationDataAvailable?: boolean;
  estimatedMeanDepthMeters?: number;
  sensorTrack?: SensorType;
  analysisMode?: ProcessingMode;
}

export interface MarkedAreaAnalysisReportDto {
  areaId: string;
  areaType: MarkedAreaType;
  areaName: string;
  boundary: GeoJSONPolygon | GeoJSONMultiPolygon;
  areaHectares: number;
  areaSquareMeters: number;
  startDate: string;
  endDate: string;
  summary: {
    totalObservations: number;
    analyzedObservations: number;
    opticalObservations: number;
    sarObservations: number;
    cloudCoverAverage: number;
    overallSeverity: AlertSeverity | 'NONE';
    maxEvidenceStrength: number;
    totalCumulativeChangedAreaHectares: number;
    maxPercentageAffected: number;
    primaryClassification: MiningClassification;
    totalEstimatedVolumeCubicMeters?: number;
    isVolumeAvailable: boolean;
    disclaimer: string;
    analysisCompletedAt: string;
  };
  results: MarkedAreaCalculationResultDto[];
  timeline: TemporaryAreaTimelineItemDto[];
  miningEstimates: MiningExtractionEstimateDto[];
  changes: ChangeDetectionDto[];
  alerts: AlertDto[];
}
// ============================================================
// Module M8 — Real Satellite Data Acquisition & GEE DTOs
// ============================================================

export interface GeeStatusResponse {
  success: boolean;
  connected: boolean;
  projectId: string;
  earthEngine: boolean;
  mode: 'REAL' | 'SIMULATED';
  authMethod?: string;
  verifiedCollections?: string[];
  message?: string;
}

export interface SatelliteSearchRequest {
  zoneId?: string;
  boundary?: GeoJSONPolygon | GeoJSONMultiPolygon;
  startDate: string;
  endDate: string;
  sensor?: string;
  sensorType?: SensorType;
  source?: SatelliteSource;
  maxCloudCover?: number;
}

export interface Sentinel2BandInfo {
  id: string;
  name: string;
  resolutionMeters: number;
  description: string;
  centralWavelengthNm?: number;
}

export interface RealSentinel2ImageDto {
  imageId: string;
  source: SatelliteSource;
  sensorType: SensorType;
  spacecraftName: string;
  acquisitionDate: string;
  cloudCoverPercentage: number;
  sunElevationAngle?: number;
  footprint: GeoJSONPolygon | GeoJSONMultiPolygon;
  bands: Sentinel2BandInfo[];
  geeAssetPath: string;
  isRealTelemetry: boolean;
}

export interface SatelliteSearchResponse {
  zoneId?: string;
  sensorType?: SensorType;
  totalFound: number;
  filterApplied: {
    startDate: string;
    endDate: string;
    maxCloudCover: number;
    collection: string;
  };
  images: Array<RealSentinel2ImageDto | RealLandsatImageDto | RealSarImageDto>;
}

export enum GeeErrorCode {
  GEE_AUTHENTICATION_FAILED = 'GEE_AUTHENTICATION_FAILED',
  GEE_NO_IMAGES_FOUND = 'GEE_NO_IMAGES_FOUND',
  GEE_INVALID_GEOMETRY = 'GEE_INVALID_GEOMETRY',
  GEE_QUOTA_EXCEEDED = 'GEE_QUOTA_EXCEEDED',
  GEE_REQUIRED_BAND_MISSING = 'GEE_REQUIRED_BAND_MISSING',
  GEE_PROCESSING_FAILED = 'GEE_PROCESSING_FAILED',
  GEE_PAGINATION_ERROR = 'GEE_PAGINATION_ERROR',
  GEE_PAGINATION_LIMIT_REACHED = 'GEE_PAGINATION_LIMIT_REACHED',
}

export interface RealSarImageDto {
  imageId: string;
  source: SatelliteSource;
  sensorType: SensorType;
  spacecraftName: string;
  acquisitionDate: string;
  cloudCoverPercentage?: number;
  polarization: string;
  acquisitionMode: string;
  orbitDirection: string;
  orbitNumber?: number;
  relativeOrbitNumber?: number;
  absoluteOrbitNumber?: number;
  mode?: string;
  polarizations?: string[];
  footprint: GeoJSONPolygon | GeoJSONMultiPolygon;
  bands: Array<{ id: string; name: string; unit: string; description: string }>;
  geeAssetPath: string;
  isRealTelemetry: boolean;
}

export interface AcquireSatelliteResponse {
  success: boolean;
  source: 'GEE' | 'SIMULATED';
  imagesFound: number;
  observationsCreated: number;
  observation: SatelliteMetadataDto;
  images?: Array<RealSentinel2ImageDto | RealSarImageDto>;
}

// ============================================================
// Module M8.3 — Real GEE Zonal Pixel Statistics DTOs
// ============================================================

export interface BandZonalSummary {
  mean: number;
  median: number;
  min: number;
  max: number;
  validPixelCount: number;
}

export interface OpticalZonalStatistics {
  B2: BandZonalSummary;
  B3: BandZonalSummary;
  B4: BandZonalSummary;
  B8: BandZonalSummary;
  B11: BandZonalSummary;
  B12: BandZonalSummary;
  SCL?: BandZonalSummary;
  QA60?: BandZonalSummary;
}

export interface SarZonalStatistics {
  VV: BandZonalSummary;
  VH: BandZonalSummary;
  angle?: BandZonalSummary;
}

export interface DemZonalStatistics {
  elevation: BandZonalSummary;
  slope?: BandZonalSummary;
  aspect?: BandZonalSummary;
}

export interface LandsatBandInfo {
  id: string;
  name: string;
  resolutionMeters: number;
  description: string;
  centralWavelengthNm?: number;
  scaleFactor?: number;
  offset?: number;
}

export interface RealLandsatImageDto {
  imageId: string;
  source: SatelliteSource.LANDSAT_8 | SatelliteSource.LANDSAT_9;
  sensorType: SensorType.OPTICAL;
  spacecraftName: string;
  acquisitionDate: string;
  cloudCoverPercentage: number;
  sunElevationAngle?: number;
  footprint: GeoJSONPolygon | GeoJSONMultiPolygon;
  bands: LandsatBandInfo[];
  geeAssetPath: string;
  isRealTelemetry: boolean;
  nativeResolutionMeters: number;
}

export interface RealDemImageDto {
  imageId: string;
  source: SatelliteSource.SRTM;
  sensorType: SensorType.DEM;
  datasetName: string;
  acquisitionDate: string;
  footprint: GeoJSONPolygon | GeoJSONMultiPolygon;
  bands: Array<{ id: string; name: string; unit: string; description: string; resolutionMeters: number }>;
  geeAssetPath: string;
  isRealTelemetry: boolean;
  nativeResolutionMeters: number;
}

export interface ZonalStatisticsDto {
  imageId: string;
  acquisitionDate: string;
  sensor: SatelliteSource;
  sensorTrack: SensorType;
  zoneId?: string;
  temporaryAreaId?: string;
  statistics: OpticalZonalStatistics | SarZonalStatistics | DemZonalStatistics;
  cloudCover: number;
  processingMode: 'REAL' | 'SIMULATED';
  provenance: 'GEE_ZONAL_STATISTICS';
  computedAt: string;
}

// ============================================================
// Module M8.8 — Multi-Source Acquisition DTOs
// ============================================================

export interface SourcePriorityConfig {
  opticalPriority: SatelliteSource[];
  sarPriority: SatelliteSource[];
  demPriority: SatelliteSource[];
  maxCloudCoverThreshold: number;
  allowFallbackOnCloudCover: boolean;
}

export interface SourceFallbackStatus {
  source: SatelliteSource;
  collection: string;
  status: 'SELECTED' | 'CLOUD_EXCEEDED' | 'NO_COVERAGE' | 'LOWER_PRIORITY' | 'ERROR';
  availableCount: number;
  bestCloudCover?: number;
  rejectionReason?: string;
}

export interface MultiSourceDiscoveryResult {
  zoneId?: string;
  geometry: GeoJSONPolygon | GeoJSONMultiPolygon;
  requestedDateRange: {
    startDate: string;
    endDate: string;
  };
  maxCloudCover: number;
  discoveredImages: Array<RealSentinel2ImageDto | RealLandsatImageDto | RealSarImageDto | RealDemImageDto>;
  selectedSource: SatelliteSource;
  selectedImage: RealSentinel2ImageDto | RealLandsatImageDto | RealSarImageDto | RealDemImageDto;
  selectionReason: string;
  fallbacksConsidered: SourceFallbackStatus[];
  timestamp: string;
}

// ============================================================
// Module M8.9 — Resolution / Projection / Band Harmonization DTOs
// ============================================================

export enum LogicalOpticalBand {
  BLUE = 'BLUE',
  GREEN = 'GREEN',
  RED = 'RED',
  NIR = 'NIR',
  SWIR1 = 'SWIR1',
  SWIR2 = 'SWIR2',
}

export enum LogicalSarBand {
  VV = 'VV',
  VH = 'VH',
  VV_VH_RATIO = 'VV_VH_RATIO',
  RFDI = 'RFDI',
  RVI = 'RVI',
}

export enum LogicalDemBand {
  ELEVATION = 'ELEVATION',
  SLOPE = 'SLOPE',
  ASPECT = 'ASPECT',
}

export enum ResamplingMethod {
  NEAREST_NEIGHBOUR = 'NEAREST_NEIGHBOUR',
  BILINEAR = 'BILINEAR',
  BICUBIC = 'BICUBIC',
}

export interface HarmonizationMetadata {
  nativeResolutionMeters: number;
  targetResolutionMeters: number;
  resamplingMethod: ResamplingMethod;
  crs: string;
  targetCrs: string;
  gridOrigin: [number, number];
  isResampled: boolean;
  scientificDisclaimer: string;
  bandMapping: Record<string, string>;
  scaleApplied: Record<string, { scale: number; offset: number }>;
}

export interface HarmonizedDatasetDto {
  datasetId: string;
  sourceImageId: string;
  source: SatelliteSource;
  sensorType: SensorType;
  harmonization: HarmonizationMetadata;
  extent: GeoJSONPolygon | GeoJSONMultiPolygon;
  normalizedBands: Record<string, BandZonalSummary>;
  calculatedIndices?: {
    ndvi?: number;
    evi?: number;
    nbr?: number;
    bsi?: number;
    ndwi?: number;
    vvVhRatio?: number;
    rfdi?: number;
    rvi?: number;
  };
  cloudCoverPercentage: number;
  acquisitionDate: string;
  harmonizedAt: string;
}

export interface DatasetCompatibilityResult {
  compatible: boolean;
  sensorTrack: SensorType;
  baselineSource: SatelliteSource;
  currentSource: SatelliteSource;
  targetResolutionMeters: number;
  targetCrs: string;
  crossSource: boolean;
  errors: string[];
  warnings: string[];
}

export interface HarmonizationOptions {
  targetResolutionMeters?: number;
  targetCrs?: string;
  resamplingMethod?: ResamplingMethod;
}


// ============================================================
// Module M8.6 — Automated Real-Time Monitoring & Incremental Processing DTOs
// ============================================================

export enum IncrementalLifecycleState {
  DISCOVERED = 'DISCOVERED',
  QUEUED = 'QUEUED',
  ACQUIRING = 'ACQUIRING',
  REDUCING = 'REDUCING',
  PROCESSING = 'PROCESSING',
  CHANGE_ANALYSIS = 'CHANGE_ANALYSIS',
  ALERT_EVALUATION = 'ALERT_EVALUATION',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  RETRY_PENDING = 'RETRY_PENDING',
}

export type AreaMonitoringType = 'PERMANENT' | 'TEMPORARY';

export interface IncrementalMonitoringRecordDto {
  id: string;
  jobId: string;
  areaId: string;
  areaType: AreaMonitoringType;
  areaName: string;
  targetObservationId?: string;
  satelliteMetadataId?: string;
  sensorType: SensorType;
  source: SatelliteSource;
  lifecycleState: IncrementalLifecycleState;
  acquisitionDate?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string;
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: string;
  isPermanentFailure?: boolean;
  results?: {
    processedImageResultId?: string;
    changeDetectionId?: string;
    alertId?: string;
    affectedAreaPercentage?: number;
    severity?: AlertSeverity | 'NONE';
    cloudCover?: number;
    fallbackTriggered?: boolean;
  };
  logs: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AreaMonitoringSummaryDto {
  areaId: string;
  areaType: AreaMonitoringType;
  areaName: string;
  status: string;
  lastProcessedAcquisitionDate?: string;
  processingStatus: string;
  latestObservationId?: string;
  latestAlertSeverity?: AlertSeverity | 'NONE';
  activeBaselinesCount: number;
  unprocessedObservationsCount: number;
}

export interface IncrementalMonitoringStatusDto {
  schedulerRunning: boolean;
  lastSchedulerRun?: string;
  nextScheduledRun?: string;
  activePermanentZones: number;
  activeTemporaryAreas: number;
  totalActiveAreas: number;
  totalObservationsDiscovered: number;
  totalObservationsProcessed: number;
  totalProcessingFailures: number;
  totalAlertsGenerated: number;
  currentlyProcessingCount: number;
  retryPendingCount: number;
  recentJobs: IncrementalMonitoringRecordDto[];
}

export interface RunMonitoringCycleRequest {
  forceAllAreas?: boolean;
  sensorType?: SensorType;
  maxCloudCover?: number;
  startDate?: string;
  endDate?: string;
}

export enum RejectionReasonCode {
  CLOUD_COVER_EXCEEDS_THRESHOLD = 'CLOUD_COVER_EXCEEDS_THRESHOLD',
  HIGH_CLOUD_COVER = 'HIGH_CLOUD_COVER',
  SENSOR_TRACK_MISMATCH = 'SENSOR_TRACK_MISMATCH',
  TEMPORAL_INELIGIBLE = 'TEMPORAL_INELIGIBLE',
  GEOMETRY_NOT_INTERSECTING = 'GEOMETRY_NOT_INTERSECTING',
  DUPLICATE_OBSERVATION = 'DUPLICATE_OBSERVATION',
  BASELINE_MATCH = 'BASELINE_MATCH',
  SAR_POLARIZATION_MISMATCH = 'SAR_POLARIZATION_MISMATCH',
  SAR_ACQUISITION_MODE_MISMATCH = 'SAR_ACQUISITION_MODE_MISMATCH',
  SAR_ORBIT_MISMATCH = 'SAR_ORBIT_MISMATCH',
  SAR_RELATIVE_ORBIT_MISMATCH = 'SAR_RELATIVE_ORBIT_MISMATCH',
  SAR_ORBIT_DIRECTION_MISMATCH = 'SAR_ORBIT_DIRECTION_MISMATCH',
  SAR_BASELINE_UNAVAILABLE = 'SAR_BASELINE_UNAVAILABLE',
  OPTICAL_SENSOR_MISMATCH = 'OPTICAL_SENSOR_MISMATCH',
  OPTICAL_RESOLUTION_MISMATCH = 'OPTICAL_RESOLUTION_MISMATCH',
  OPTICAL_PRODUCT_LEVEL_MISMATCH = 'OPTICAL_PRODUCT_LEVEL_MISMATCH',
  OTHER = 'OTHER',
}

export interface RejectedObservationDto {
  imageId: string;
  acquisitionTime: string;
  sensor?: string;
  platform?: string;
  cloudCover?: number;
  reasonCode: RejectionReasonCode | string;
  reason: string;
}

export interface RejectionSummaryDto {
  CLOUD_COVER_EXCEEDS_THRESHOLD: number;
  HIGH_CLOUD_COVER?: number;
  SENSOR_TRACK_MISMATCH: number;
  TEMPORAL_INELIGIBLE: number;
  GEOMETRY_NOT_INTERSECTING: number;
  DUPLICATE_OBSERVATION: number;
  BASELINE_MATCH: number;
  SAR_POLARIZATION_MISMATCH?: number;
  SAR_ACQUISITION_MODE_MISMATCH?: number;
  SAR_ORBIT_MISMATCH?: number;
  SAR_RELATIVE_ORBIT_MISMATCH?: number;
  SAR_ORBIT_DIRECTION_MISMATCH?: number;
  SAR_BASELINE_UNAVAILABLE?: number;
  OPTICAL_SENSOR_MISMATCH?: number;
  OPTICAL_RESOLUTION_MISMATCH?: number;
  OPTICAL_PRODUCT_LEVEL_MISMATCH?: number;
  OTHER: number;
  [key: string]: number | undefined;
}

export interface MonitoringSearchConfigDto {
  searchWindowStart: string;
  searchWindowEnd: string;
  cloudCoverThreshold: number;
  activeBaselineSource?: string;
  activeBaselineSensor?: string;
  activeBaselineDate?: string;
  lastProcessedDate?: string;
}

export enum MonitoringTrackStatus {
  DISABLED = 'DISABLED',
  BASELINE_REQUIRED = 'BASELINE_REQUIRED',
  WAITING_FOR_NEXT_CYCLE = 'WAITING_FOR_NEXT_CYCLE',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface TrackMonitoringCycleResultDto {
  enabled: boolean;
  discoveredCount: number;
  eligibleCount: number;
  processedCount: number;
  alertCount: number;
  status: MonitoringTrackStatus;
  rejectionSummary: RejectionSummaryDto;
  rejectedObservations: RejectedObservationDto[];
  eligibleObservationIds?: string[];
  processedJobId?: string;
  activeBaselineId?: string;
  lastProcessedDate?: string;
  error?: string;
}

export interface AreaMonitoringCycleResultDto {
  areaId: string;
  areaName: string;
  areaType: string;
  discoveredCount: number;
  eligibleCount: number;
  processedCount: number;
  rejectionSummary: RejectionSummaryDto;
  rejectedObservations: RejectedObservationDto[];
  eligibleObservationIds: string[];
  processedJobId?: string;
  searchConfig?: MonitoringSearchConfigDto;
  tracks?: {
    optical: TrackMonitoringCycleResultDto;
    sar: TrackMonitoringCycleResultDto;
  };
}

export interface IncrementalMonitoringCycleResultDto {
  cycleId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  areasEvaluated: number;
  discoveredCount: number;
  eligibleCount: number;
  processedCount: number;
  alertCount: number;
  observationsDiscovered: number;
  observationsProcessed: number;
  observationsFailed: number;
  alertsGenerated: number;
  jobIds: string[];
  rejectionSummary: RejectionSummaryDto;
  rejectedObservations: RejectedObservationDto[];
  searchConfig?: MonitoringSearchConfigDto;
  areaResults?: AreaMonitoringCycleResultDto[];
  tracks?: {
    optical: TrackMonitoringCycleResultDto;
    sar: TrackMonitoringCycleResultDto;
  };
}

// ============================================================
// Module M8.7 — Production Monitoring Reliability & Health DTOs
// ============================================================

export interface MonitoringHealthDto {
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  scheduler: {
    isRunning: boolean;
    lastRunAt?: string;
    nextRunAt?: string;
  };
  database: {
    connected: boolean;
    state: string;
  };
  gee: {
    connected: boolean;
    projectId: string;
    authMethod: string;
    mode: 'REAL' | 'SIMULATED';
  };
  queue: {
    pendingCount: number;
    processingCount: number;
    staleCount: number;
    failedCount: number;
    retryPendingCount: number;
  };
  areas: {
    totalActive: number;
    permanentCount: number;
    temporaryCount: number;
  };
  checkedAt: string;
}

export interface SystemOperationalStatusDto {
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  scheduler: {
    isRunning: boolean;
    lastRunAt?: string;
    nextRunAt?: string;
  };
  database: {
    connected: boolean;
    state: string;
  };
  gee: {
    mode: 'REAL' | 'SIMULATED';
    configured: boolean;
  };
  queue: {
    pendingCount: number;
    processingCount: number;
    staleCount: number;
    failedCount: number;
    retryPendingCount: number;
  };
  areas: {
    totalActive: number;
    permanentCount: number;
    temporaryCount: number;
  };
  checkedAt: string;
}

export interface MonitoringJobRecoverySummaryDto {
  jobsChecked: number;
  staleJobsFound: number;
  jobsRecovered: number;
  activeJobsSkipped: number;
  terminalJobsSkipped: number;
  recoveredJobIds: string[];
  errors?: string[];
}

export interface IncrementalRecoverySummaryDto {
  recordsChecked: number;
  staleRecordsFound: number;
  recordsRecovered: number;
  recordsPermanentlyFailed: number;
  recoveredRecordIds: string[];
  errors?: string[];
}

export interface StaleJobRecoveryResultDto {
  staleJobsDetected: number;
  jobsRecovered: number;
  jobsPermanentlyFailed: number;
  recoveredJobIds: string[];
  monitoringJobs?: MonitoringJobRecoverySummaryDto;
  incrementalMonitoring?: IncrementalRecoverySummaryDto;
  totalRecovered?: number;
}

// ============================================================
// Module M9 — Transport & E-Pass Management Types & DTOs
// ============================================================

export enum MiningAuthorizationStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  SUSPENDED = 'SUSPENDED',
  REVOKED = 'REVOKED',
}

export enum TransportCompanyStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  INACTIVE = 'INACTIVE',
}

export enum VehicleStatus {
  ACTIVE = 'ACTIVE',
  MAINTENANCE = 'MAINTENANCE',
  SUSPENDED = 'SUSPENDED',
  INACTIVE = 'INACTIVE',
}

export enum VehicleType {
  TRUCK = 'TRUCK',
  TIPPER = 'TIPPER',
  TRAILER = 'TRAILER',
  DUMPER = 'DUMPER',
  OTHER = 'OTHER',
}

export enum DriverVerificationStatus {
  VERIFIED = 'VERIFIED',
  PENDING = 'PENDING',
  REJECTED = 'REJECTED',
  SUSPENDED = 'SUSPENDED',
}

export interface MiningAuthorizationDto {
  id: string;
  authorizationId: string;
  zoneId?: string;
  temporaryAreaId?: string;
  permitNumber: string;
  lesseeName: string;
  mineralType: string;
  permittedVolume?: number;
  permittedWeightTonnes: number;
  validFrom: string;
  validUntil: string;
  status: MiningAuthorizationStatus;
  remainingQuota: number;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMiningAuthorizationRequest {
  zoneId?: string;
  temporaryAreaId?: string;
  permitNumber: string;
  lesseeName: string;
  mineralType: string;
  permittedVolume?: number;
  permittedWeightTonnes: number;
  validFrom: string;
  validUntil: string;
  status?: MiningAuthorizationStatus;
}

export interface UpdateMiningAuthorizationRequest {
  status?: MiningAuthorizationStatus;
  lesseeName?: string;
  validUntil?: string;
}

export interface TransportCompanyDto {
  id: string;
  companyId: string;
  registrationNumber: string;
  companyName: string;
  contactDetails?: {
    phone?: string;
    email?: string;
    address?: string;
  };
  miningZoneDetails?: {
    zoneName?: string;
    leasePermitNumber?: string;
    mineralType?: string;
    authorizedCapacityTonnes?: number;
    validityPeriod?: string;
    locationDetails?: string;
  };
  status: TransportCompanyStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTransportCompanyRequest {
  registrationNumber: string;
  companyName: string;
  contactDetails?: {
    phone?: string;
    email?: string;
    address?: string;
  };
  miningZoneDetails?: {
    zoneName?: string;
    leasePermitNumber?: string;
    mineralType?: string;
    authorizedCapacityTonnes?: number;
    validityPeriod?: string;
    locationDetails?: string;
  };
  status?: TransportCompanyStatus;
}

export interface RegisterCompanyRequest {
  companyName: string;
  registrationNumber: string;
  contactPerson: string;
  email: string;
  password: string;
  phone?: string;
  address?: string;
  miningZoneDetails?: {
    zoneName?: string;
    leasePermitNumber?: string;
    mineralType?: string;
    authorizedCapacityTonnes?: number;
    validityPeriod?: string;
    locationDetails?: string;
  };
  initialVehicle?: {
    registrationNumber?: string;
    vehicleType?: string;
    tareWeight?: number;
    grossVehicleWeight?: number;
    gpsTrackerId?: string;
  };
  initialDriver?: {
    name?: string;
    licenseNumber?: string;
    phone?: string;
  };
}

export interface VehicleDto {
  id: string;
  vehicleId: string;
  registrationNumber: string;
  vehicleType: string;
  tareWeight: number;
  grossVehicleWeight: number;
  permittedCarryingCapacity: number;
  gpsTrackerId?: string;
  status: VehicleStatus;
  transportCompanyId?: string;
  transportCompanyName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVehicleRequest {
  registrationNumber: string;
  vehicleType?: string;
  tareWeight: number;
  grossVehicleWeight: number;
  permittedCarryingCapacity: number;
  gpsTrackerId?: string;
  status?: VehicleStatus;
  transportCompanyId?: string;
}

export interface DriverDto {
  id: string;
  driverId: string;
  licenseNumber: string;
  name: string;
  phone: string;
  verificationStatus: DriverVerificationStatus;
  transportCompanyId?: string;
  transportCompanyName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDriverRequest {
  licenseNumber: string;
  name: string;
  phone: string;
  verificationStatus?: DriverVerificationStatus;
  transportCompanyId?: string;
}

export interface EPassDto {
  id: string;
  passNumber: string;
  authorizationId: string;
  permitNumber?: string;
  lesseeName?: string;
  vehicleId: string;
  vehicleRegistrationNumber?: string;
  driverId: string;
  driverName?: string;
  driverLicenseNumber?: string;
  mineralType: string;
  netWeightTonnes: number;
  sourceLocation: string;
  destinationCheckpoint: string;
  validFrom: string;
  validUntil: string;
  qrPayload: string;
  qrCodeHash: string;
  digitalSignature: string;
  status: EPassStatus;
  dispatchTimestamp?: string;
  usedTimestamp?: string;
  cancellationReason?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEPassRequest {
  authorizationId: string;
  vehicleId: string;
  driverId: string;
  mineralType?: string;
  netWeightTonnes: number;
  sourceLocation?: string;
  destinationCheckpoint: string;
  validFrom?: string;
  validUntil?: string;
}

export interface CancelEPassRequest {
  reason?: string;
}

export interface EPassSummaryDto {
  totalIssued: number;
  activeCount: number;
  usedCount: number;
  expiredCount: number;
  cancelledCount: number;
  totalTransportedTonnes: number;
}

// ============================================================
// Module M10 — Checkpoint & E-Pass Verification DTOs
// ============================================================

export enum CheckpointStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  MAINTENANCE = 'MAINTENANCE',
}

export enum CheckpointVerificationResult {
  VALID = 'VALID',
  INVALID = 'INVALID',
}

export enum LocationVerificationStatus {
  VERIFIED_LOCATION = 'VERIFIED_LOCATION',
  LOCATION_UNAVAILABLE = 'LOCATION_UNAVAILABLE',
  OUTSIDE_CHECKPOINT_GEOFENCE = 'OUTSIDE_CHECKPOINT_GEOFENCE',
}

export enum EnforcementRejectionReason {
  EPASS_NOT_FOUND = 'EPASS_NOT_FOUND',
  EPASS_CANCELLED = 'EPASS_CANCELLED',
  EPASS_EXPIRED = 'EPASS_EXPIRED',
  EPASS_ALREADY_USED = 'EPASS_ALREADY_USED',
  EPASS_REVOKED = 'EPASS_REVOKED',
  EPASS_NOT_YET_VALID = 'EPASS_NOT_YET_VALID',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  INVALID_HASH = 'INVALID_HASH',
  INVALID_PAYLOAD = 'INVALID_PAYLOAD',
  AUTHORIZATION_NOT_FOUND = 'AUTHORIZATION_NOT_FOUND',
  AUTHORIZATION_EXPIRED = 'AUTHORIZATION_EXPIRED',
  AUTHORIZATION_SUSPENDED = 'AUTHORIZATION_SUSPENDED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  VEHICLE_NOT_FOUND = 'VEHICLE_NOT_FOUND',
  VEHICLE_NOT_PERMITTED = 'VEHICLE_NOT_PERMITTED',
  DRIVER_NOT_FOUND = 'DRIVER_NOT_FOUND',
  DRIVER_NOT_VERIFIED = 'DRIVER_NOT_VERIFIED',
  DRIVER_SUSPENDED = 'DRIVER_SUSPENDED',
  DRIVER_REJECTED = 'DRIVER_REJECTED',
  CHECKPOINT_NOT_FOUND = 'CHECKPOINT_NOT_FOUND',
  CHECKPOINT_INACTIVE = 'CHECKPOINT_INACTIVE',
  OUTSIDE_CHECKPOINT_GEOFENCE = 'OUTSIDE_CHECKPOINT_GEOFENCE',
}

export interface CheckpointDto {
  id: string;
  checkpointId: string;
  name: string;
  district: string;
  location: GeoJSONPoint;
  geofenceRadiusMeters: number;
  status: CheckpointStatus;
  authorizedUserIds?: string[];
  operatingHours?: string;
  metadata?: Record<string, unknown>;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCheckpointRequest {
  checkpointId?: string;
  name: string;
  district: string;
  location: GeoJSONPoint;
  geofenceRadiusMeters?: number;
  status?: CheckpointStatus;
  authorizedUserIds?: string[];
  operatingHours?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateCheckpointRequest {
  name?: string;
  district?: string;
  location?: GeoJSONPoint;
  geofenceRadiusMeters?: number;
  status?: CheckpointStatus;
  authorizedUserIds?: string[];
  operatingHours?: string;
  metadata?: Record<string, unknown>;
}

export interface VerifyEPassRequest {
  checkpointId: string;
  qrPayload?: string;
  passNumber?: string;
  currentLocation?: [number, number]; // [longitude, latitude]
  declaredQuantityTonnes?: number;
  notes?: string;
}

export interface VerifyEPassResponse {
  result: CheckpointVerificationResult;
  rejectionReasons: EnforcementRejectionReason[];
  epass?: EPassDto;
  checkpoint?: CheckpointDto;
  signatureVerified: boolean;
  hashVerified: boolean;
  locationStatus: LocationVerificationStatus;
  distanceFromCheckpointMeters?: number;
  verificationTimestamp: string;
  logId?: string;
}

export interface RecordPassageRequest {
  checkpointId: string;
  passNumberOrId: string;
  currentLocation?: [number, number]; // [longitude, latitude]
  declaredQuantityTonnes?: number;
  notes?: string;
}

export interface RecordPassageResponse {
  success: boolean;
  message: string;
  epass: EPassDto;
  log: CheckpointLogDto;
}

export interface CheckpointLogDto {
  id: string;
  logId: string;
  checkpointId: string;
  checkpointName: string;
  epassId?: string;
  passNumber: string;
  vehicleId?: string;
  vehicleRegistrationNumber?: string;
  driverId?: string;
  driverName?: string;
  driverLicenseNumber?: string;
  authorizationId?: string;
  permitNumber?: string;
  mineralType?: string;
  authorizedQuantityTonnes?: number;
  declaredQuantityTonnes?: number;
  verificationTimestamp: string;
  verificationResult: CheckpointVerificationResult;
  rejectionReasons: string[];
  signatureVerified: boolean;
  hashVerified: boolean;
  locationStatus: LocationVerificationStatus;
  scannedCoordinates?: GeoJSONPoint;
  distanceFromCheckpointMeters?: number;
  verifiedBy?: string;
  verifiedByName?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CheckpointSummaryDto {
  totalCheckpoints: number;
  activeCheckpoints: number;
  totalVerifications: number;
  validVerifications: number;
  invalidVerifications: number;
  totalTonnagePassed: number;
}

// ============================================================
// Module M11: Mining & Transport Reconciliation Types & Enums
// ============================================================

export enum ReconciliationStatus {
  COMPLIANT = 'COMPLIANT',
  FLAGGED_DISCREPANCY = 'FLAGGED_DISCREPANCY',
  CRITICAL_ANOMALY = 'CRITICAL_ANOMALY',
}

export enum ReconciliationReportStatus {
  DRAFT = 'DRAFT',
  FINALIZED = 'FINALIZED',
  UNDER_INVESTIGATION = 'UNDER_INVESTIGATION',
  RESOLVED = 'RESOLVED',
}

export enum ReconciliationAnomalyType {
  EXCESS_EXTRACTION_UNRECORDED_TRANSPORT = 'EXCESS_EXTRACTION_UNRECORDED_TRANSPORT',
  EXCESS_TRANSPORT_OVER_PERMIT = 'EXCESS_TRANSPORT_OVER_PERMIT',
  UNVERIFIED_TRANSIT_GAP = 'UNVERIFIED_TRANSIT_GAP',
  EXTRACTION_OUTSIDE_PERMITTED_BOUNDARY = 'EXTRACTION_OUTSIDE_PERMITTED_BOUNDARY',
  VOLUME_TONNAGE_DISPROPORTION = 'VOLUME_TONNAGE_DISPROPORTION',
  SUSPENDED_MINING_ACTIVITY = 'SUSPENDED_MINING_ACTIVITY',
  EXPIRED_PERMIT_TRANSIT = 'EXPIRED_PERMIT_TRANSIT',
}

export enum ReconciliationAnomalySeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface ReconciliationAnomalyItem {
  type: ReconciliationAnomalyType;
  severity: ReconciliationAnomalySeverity;
  title: string;
  description: string;
  evidenceScore: number;
  details?: Record<string, unknown>;
}

export interface AuthorizedPermitSummary {
  permitNumber: string;
  lesseeName: string;
  mineralType: string;
  permittedWeightTonnes: number;
  remainingQuota: number;
  status: string;
  validFrom: string;
  validUntil: string;
}

export interface TransportSummary {
  totalPassesIssued: number;
  totalIssuedTonnage: number;
  totalPassesUsed: number;
  totalVerifiedTonnage: number;
  totalPassesCancelled: number;
  totalPassesExpired: number;
  activePassCount: number;
}

export interface CheckpointSummaryInRecon {
  totalScans: number;
  validScans: number;
  invalidScans: number;
  outsideGeofenceScans: number;
  transitPassageCount: number;
  totalTransitTonnage: number;
}

export interface SatelliteSummaryInRecon {
  observationCount: number;
  totalDisturbedAreaHectares: number;
  estimatedExtractionVolumeCubicMeters?: number;
  estimatedTonnageEquivalent?: number;
  densityUsedTonnesPerCubicMeter?: number;
  maxEvidenceStrength: number;
  miningClassifications: string[];
  disclaimer: string;
}

export interface ReconciliationReportDto {
  id: string;
  reconciliationId: string;
  zoneId?: string;
  zoneName?: string;
  authorizationId?: string;
  permitNumber?: string;
  periodStart: string;
  periodEnd: string;
  status: ReconciliationReportStatus;
  reconciliationStatus: ReconciliationStatus;
  discrepancyScore: number; // 0 to 100
  permitSummary?: AuthorizedPermitSummary;
  transportSummary: TransportSummary;
  checkpointSummary: CheckpointSummaryInRecon;
  satelliteSummary: SatelliteSummaryInRecon;
  anomalies: ReconciliationAnomalyItem[];
  findings: string[];
  recommendations: string[];
  investigationNotes?: string;
  generatedBy?: string;
  generatedByName?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RunReconciliationRequest {
  zoneId?: string;
  authorizationId?: string;
  periodStart?: string;
  periodEnd?: string;
  mineralDensityTonnesPerCubicMeter?: number; // default 2.6
  discrepancyTolerancePercent?: number; // default 15.0
  notes?: string;
}

export interface UpdateReconciliationStatusRequest {
  status: ReconciliationReportStatus;
  investigationNotes?: string;
}

export interface ReconciliationSummaryDto {
  totalReports: number;
  compliantCount: number;
  discrepancyCount: number;
  criticalAnomalyCount: number;
  underInvestigationCount: number;
  resolvedCount: number;
  totalPermittedTonnage: number;
  totalIssuedTonnage: number;
  totalVerifiedTonnage: number;
  unverifiedTransitGapTonnage: number;
}

// ============================================================
// Module M12: Enforcement Case Management & Investigation Workflow
// ============================================================

export enum CaseStatus {
  DETECTED = 'DETECTED',
  CASE_CREATED = 'CASE_CREATED',
  ASSIGNED = 'ASSIGNED',
  UNDER_INVESTIGATION = 'UNDER_INVESTIGATION',
  FIELD_VERIFICATION = 'FIELD_VERIFICATION',
  ACTION_REQUIRED = 'ACTION_REQUIRED',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

export enum CaseSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum CaseType {
  UNRECORDED_EXTRACTION = 'UNRECORDED_EXTRACTION',
  OVER_QUOTA_TRANSPORT = 'OVER_QUOTA_TRANSPORT',
  UNVERIFIED_TRANSIT_GAP = 'UNVERIFIED_TRANSIT_GAP',
  PROTECTED_ZONE_BREACH = 'PROTECTED_ZONE_BREACH',
  VOLUME_DISPROPORTION = 'VOLUME_DISPROPORTION',
  PERMIT_VIOLATION = 'PERMIT_VIOLATION',
  CHECKPOINT_EVASION = 'CHECKPOINT_EVASION',
  OTHER = 'OTHER',
}

export enum EnforcementActionType {
  NOTICE_ISSUED = 'NOTICE_ISSUED',
  SEIZURE_ORDER = 'SEIZURE_ORDER',
  HALT_MINING_ORDER = 'HALT_MINING_ORDER',
  FIR_LODGED = 'FIR_LODGED',
  PENALTY_LEVIED = 'PENALTY_LEVIED',
  NO_ACTION_REQUIRED = 'NO_ACTION_REQUIRED',
  OTHER = 'OTHER',
}

export enum CaseAuditAction {
  CASE_CREATED = 'CASE_CREATED',
  OFFICER_ASSIGNED = 'OFFICER_ASSIGNED',
  STATUS_UPDATED = 'STATUS_UPDATED',
  INVESTIGATION_UPDATED = 'INVESTIGATION_UPDATED',
  FIELD_VERIFICATION_LOGGED = 'FIELD_VERIFICATION_LOGGED',
  ENFORCEMENT_ACTION_RECORDED = 'ENFORCEMENT_ACTION_RECORDED',
  CASE_RESOLVED = 'CASE_RESOLVED',
  CASE_CLOSED = 'CASE_CLOSED',
  ADMIN_OVERRIDE = 'ADMIN_OVERRIDE',
}

export interface FieldVerificationDto {
  verifiedAt?: string;
  verifiedBy?: string;
  verifiedByName?: string;
  locationCoordinates?: [number, number]; // [longitude, latitude]
  siteObservations?: string;
  photoUrls?: string[];
  droneSurveyConducted?: boolean;
  groundDisturbanceConfirmed?: boolean;
  notes?: string;
}

export interface EnforcementActionDto {
  actionType?: EnforcementActionType;
  actionDetails?: string;
  actionDate?: string;
  penaltyAmountInr?: number;
  officialOrderReference?: string;
  issuedBy?: string;
  issuedByName?: string;
}

export interface CaseResolutionDto {
  resolvedAt?: string;
  resolvedBy?: string;
  resolvedByName?: string;
  summary?: string;
  followUpRequired?: boolean;
}

export interface EnforcementCaseDto {
  id: string;
  caseId: string;
  reconciliationReportId?: string;
  reconciliationReportNumber?: string;
  zoneId?: string;
  zoneName?: string;
  authorizationId?: string;
  permitNumber?: string;
  severity: CaseSeverity;
  caseType: CaseType;
  title: string;
  description: string;
  status: CaseStatus;
  assignedOfficerId?: string;
  assignedOfficerName?: string;
  assignedAt?: string;
  investigationFindings: string[];
  fieldVerification?: FieldVerificationDto;
  enforcementAction?: EnforcementActionDto;
  resolutionInfo?: CaseResolutionDto;
  closedAt?: string;
  closedBy?: string;
  closedByName?: string;
  createdBy?: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CaseAuditLogDto {
  id: string;
  auditId: string;
  caseId: string;
  caseNumber: string;
  actorId?: string;
  actorName: string;
  actorRole: string;
  action: CaseAuditAction;
  previousStatus?: CaseStatus;
  newStatus?: CaseStatus;
  remarks: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
  timestamp: string;
}

export interface CreateEnforcementCaseRequest {
  title: string;
  description: string;
  severity: CaseSeverity;
  caseType: CaseType;
  zoneId?: string;
  authorizationId?: string;
  reconciliationReportId?: string;
  assignedOfficerId?: string;
  investigationFindings?: string[];
}

export interface CreateCaseFromReconciliationRequest {
  reconciliationReportId: string;
  assignedOfficerId?: string;
  customTitle?: string;
  customDescription?: string;
}

export interface AssignOfficerRequest {
  assignedOfficerId: string;
  remarks?: string;
}

export interface UpdateCaseStatusRequest {
  status: CaseStatus;
  remarks?: string;
}

export interface UpdateInvestigationRequest {
  findings?: string[];
  fieldVerification?: {
    verifiedAt?: string;
    locationCoordinates?: [number, number];
    siteObservations?: string;
    photoUrls?: string[];
    droneSurveyConducted?: boolean;
    groundDisturbanceConfirmed?: boolean;
    notes?: string;
  };
  remarks?: string;
}

export interface RecordEnforcementActionRequest {
  actionType: EnforcementActionType;
  actionDetails: string;
  penaltyAmountInr?: number;
  officialOrderReference?: string;
  actionDate?: string;
  remarks?: string;
}

export interface CloseCaseRequest {
  resolutionSummary: string;
  followUpRequired?: boolean;
  remarks?: string;
}

export interface EnforcementCaseFilters {
  status?: CaseStatus;
  severity?: CaseSeverity;
  caseType?: CaseType;
  zoneId?: string;
  authorizationId?: string;
  assignedOfficerId?: string;
  reconciliationReportId?: string;
  search?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  skip?: number;
}

export interface EnforcementCaseSummaryDto {
  totalCases: number;
  activeCases: number;
  underInvestigationCount: number;
  fieldVerificationCount: number;
  actionRequiredCount: number;
  resolvedCount: number;
  closedCount: number;
  criticalSeverityCount: number;
  highSeverityCount: number;
  mediumSeverityCount: number;
  lowSeverityCount: number;
}

// ============================================================
// Module M13 — Intelligence Dashboard & Decision Support Types
// ============================================================

export enum ZoneRiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum DecisionSupportCategory {
  CRITICAL_ATTENTION = 'CRITICAL_ATTENTION',
  HIGH_PRIORITY = 'HIGH_PRIORITY',
  MONITOR = 'MONITOR',
  NO_CURRENT_ACTION = 'NO_CURRENT_ACTION',
}

export enum TimeRangePreset {
  SEVEN_DAYS = '7d',
  THIRTY_DAYS = '30d',
  NINETY_DAYS = '90d',
  CUSTOM = 'custom',
}

export interface ExecutiveIntelligenceSummaryDto {
  totalMonitoredZones: number;
  activeZones: number;
  suspiciousZones: number;
  recentSatelliteScansCount: number;
  recentAlertsCount: number;
  criticalAlertsCount: number;
  highAlertsCount: number;
  temporaryMarkedAreasCount: number;
  activeMiningAuthorizationsCount: number;
  activeEPassesCount: number;
  checkpointPassagesCount: number;
  totalReconciliationReportsCount: number;
  criticalDiscrepanciesCount: number;
  activeEnforcementCasesCount: number;
  investigationRequiredCasesCount: number;
  closedEnforcementCasesCount: number;
  recentEnforcementActionsCount: number;
  riskDistribution: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  disclaimer: string;
}

export interface ZoneRiskIntelligenceDto {
  zoneId: string;
  zoneObjectId: string;
  zoneName: string;
  category: ZoneCategory;
  status: ZoneStatus;
  riskLevel: ZoneRiskLevel;
  riskScore: number;
  riskFactors: string[];
  decisionSupportCategory: DecisionSupportCategory;
  decisionSupportRationale: string;
  latestScanDate?: string;
  latestOpticalIndicators?: {
    ndvi?: number;
    bsi?: number;
    ndwi?: number;
  };
  latestSarIndicators?: {
    vvMean?: number;
    vhMean?: number;
    rbi?: number;
  };
  latestDetectedChangePercentage?: number;
  latestAlertSeverity?: AlertSeverity | null;
  unresolvedAlertCount: number;
  reconciliationDiscrepancyScore?: number | null;
  reconciliationStatus?: ReconciliationStatus | null;
  activeEnforcementCaseCount: number;
  latestEnforcementStatus?: CaseStatus | null;
  authorizedMiningQuotaTonnes?: number;
  transportedTonnage?: number;
  checkpointVerifiedTonnage?: number;
  disclaimer: string;
}

export interface CrossModuleCorrelationDto {
  zone: {
    id: string;
    zoneId: string;
    name: string;
    category: string;
    status: string;
    boundary?: GeoJSONPolygon | GeoJSONMultiPolygon;
  };
  satelliteObservations: Array<{
    id: string;
    observationId: string;
    source: string;
    sensorType: string;
    acquisitionDate: string;
    cloudCover?: number;
  }>;
  changeDetections: Array<{
    id: string;
    affectedAreaPercentage: number;
    maxEvidenceStrength: number;
    calculationMode: string;
    detectedAt: string;
  }>;
  alerts: Array<{
    id: string;
    alertId: string;
    severity: AlertSeverity;
    status: AlertStatus;
    highestThresholdCrossed: number;
    evidenceScore: number;
    createdAt: string;
  }>;
  miningAuthorizations: Array<{
    id: string;
    permitNumber: string;
    lesseeName: string;
    mineralType: string;
    permittedWeightTonnes: number;
    remainingQuota: number;
    status: string;
  }>;
  ePasses: Array<{
    id: string;
    ePassNumber: string;
    vehicleNumber: string;
    declaredNetWeightTonnes: number;
    status: string;
    validUntil: string;
  }>;
  checkpointPassages: Array<{
    id: string;
    checkpointName: string;
    vehicleNumber: string;
    verifiedWeightTonnes?: number;
    status: string;
    scannedAt: string;
    isGeofenceValid: boolean;
  }>;
  reconciliationReports: Array<{
    id: string;
    reconciliationId: string;
    reconciliationStatus: ReconciliationStatus;
    discrepancyScore: number;
    status: ReconciliationReportStatus;
    createdAt: string;
  }>;
  enforcementCases: Array<{
    id: string;
    caseId: string;
    title: string;
    severity: CaseSeverity;
    status: CaseStatus;
    caseType: CaseType;
    createdAt: string;
  }>;
  activeBaseline?: {
    id: string;
    baselineId: string;
    sensorType: string;
    effectiveDate: string;
  };
  evidenceDossiers?: Array<{
    id: string;
    dossierId: string;
    caseNumber?: string;
    dossierVersion: number;
    dossierHash: string;
    isSealed: boolean;
    sealedAt?: string;
  }>;
  disclaimer: string;
}

export interface AlertIntelligenceSummaryDto {
  totalAlerts: number;
  unresolvedAlerts: number;
  alertsBySeverity: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  recentCriticalAlerts: Array<{
    id: string;
    alertId: string;
    zoneName: string;
    severity: AlertSeverity;
    evidenceScore: number;
    createdAt: string;
  }>;
  alertAging: {
    lessThan24Hours: number;
    oneToSevenDays: number;
    sevenToThirtyDays: number;
    overThirtyDays: number;
  };
}

export interface TransportMiningIntelligenceSummaryDto {
  totalAuthorizedQuotaTonnes: number;
  totalIssuedTransportTonnes: number;
  totalRemainingQuotaTonnes: number;
  totalCheckpointVerifiedTonnes: number;
  totalUnverifiedTransitGapTonnes: number;
  overallQuotaUtilizationPercent: number;
  ePassCounts: {
    draft: number;
    active: number;
    used: number;
    expired: number;
    cancelled: number;
  };
  units: {
    area: string;
    volume: string;
    mass: string;
    currency: string;
  };
  disclaimer: string;
}

export interface EnforcementIntelligenceSummaryDto {
  totalCases: number;
  activeCases: number;
  criticalCases: number;
  assignedCases: number;
  fieldVerificationCases: number;
  actionRequiredCases: number;
  resolvedCases: number;
  closedCases: number;
  casesByType: Record<string, number>;
  casesBySeverity: Record<string, number>;
  casesByStatus: Record<string, number>;
  averageOpenCaseAgeDays: number;
  recentActions: Array<{
    caseId: string;
    actionType: EnforcementActionType;
    actionDetails: string;
    penaltyAmountInr?: number;
    orderRef?: string;
    actionDate: string;
  }>;
}

export interface TrendAnalyticsDto {
  periodStart: string;
  periodEnd: string;
  preset: TimeRangePreset;
  dataPoints: Array<{
    date: string;
    alertsCount: number;
    criticalAlertsCount: number;
    disturbedAreaHectares: number;
    discrepancyScoreAvg: number;
    transportIssuedTonnes: number;
    checkpointVerifiedTonnes: number;
    enforcementCasesCreated: number;
  }>;
  isDataSufficient: boolean;
  message?: string;
  units: {
    area: string;
    volume: string;
    mass: string;
  };
  disclaimer: string;
}

export interface HotspotPriorityRankingsDto {
  highestRiskZones: ZoneRiskIntelligenceDto[];
  highestDiscrepancyZones: Array<{
    zoneId: string;
    zoneName: string;
    discrepancyScore: number;
    status: string;
    reportId: string;
  }>;
  repeatedAlertZones: Array<{
    zoneId: string;
    zoneName: string;
    alertCount: number;
    criticalCount: number;
    lastAlertAt: string;
  }>;
  unresolvedCriticalCaseZones: Array<{
    zoneId: string;
    zoneName: string;
    caseId: string;
    caseTitle: string;
    severity: CaseSeverity;
    status: CaseStatus;
  }>;
  transportMismatchZones: Array<{
    zoneId: string;
    zoneName: string;
    issuedTonnes: number;
    verifiedTonnes: number;
    gapTonnes: number;
  }>;
  rankingCriteriaDocumentation: Record<string, string>;
  disclaimer: string;
}

export interface DecisionSupportSummaryDto {
  criticalAttention: Array<{
    zoneId: string;
    zoneName: string;
    rationale: string;
    metrics: { riskScore: number; alerts: number; cases: number };
  }>;
  highPriority: Array<{
    zoneId: string;
    zoneName: string;
    rationale: string;
    metrics: { riskScore: number; alerts: number; cases: number };
  }>;
  monitor: Array<{
    zoneId: string;
    zoneName: string;
    rationale: string;
    metrics: { riskScore: number; alerts: number; cases: number };
  }>;
  noCurrentAction: Array<{
    zoneId: string;
    zoneName: string;
    rationale: string;
  }>;
  statutoryDisclaimer: string;
}

export interface IntelligenceQueryFilters {
  zoneId?: string;
  riskLevel?: ZoneRiskLevel;
  category?: ZoneCategory;
  status?: ZoneStatus;
  preset?: TimeRangePreset;
  startDate?: string;
  endDate?: string;
  limit?: number;
  skip?: number;
}

export interface InvestigationTimelineItemDto {
  id: string;
  eventType:
    | 'SATELLITE_ACQUISITION'
    | 'CHANGE_DETECTION'
    | 'ALERT_TRIGGERED'
    | 'MINING_PERMIT_ISSUED'
    | 'EPASS_ISSUED'
    | 'CHECKPOINT_PASSAGE'
    | 'RECONCILIATION_AUDIT'
    | 'ENFORCEMENT_CASE'
    | 'EVIDENCE_DOSSIER_SEALED';
  timestamp: string;
  entityId: string;
  sourceModule: string;
  title: string;
  description: string;
  severity?: string;
  status?: string;
  zoneId?: string;
  zoneName?: string;
  metadata?: Record<string, unknown>;
}

export interface InvestigationTimelineDto {
  totalEvents: number;
  events: InvestigationTimelineItemDto[];
  period?: {
    from?: string;
    to?: string;
  };
  filterApplied?: {
    zoneId?: string;
    module?: string;
    eventType?: string;
  };
  disclaimer: string;
}

export interface IntelligenceSearchResultItemDto {
  entityType:
    | 'ZONE'
    | 'ALERT'
    | 'CASE'
    | 'MINING_LEASE'
    | 'VEHICLE'
    | 'EPASS'
    | 'CHECKPOINT'
    | 'RECONCILIATION'
    | 'EVIDENCE_DOSSIER';
  id: string;
  referenceId: string;
  title: string;
  subtitle: string;
  status: string;
  severity?: string;
  timestamp?: string;
  details?: Record<string, unknown>;
}

export interface IntelligenceSearchDto {
  query: string;
  totalMatches: number;
  results: IntelligenceSearchResultItemDto[];
  disclaimer: string;
}

export interface AlertLineageCorrelationDto {
  alert: {
    id: string;
    alertId: string;
    severity: AlertSeverity;
    status: AlertStatus;
    evidenceScore: number;
    affectedAreaPercentage?: number;
    createdAt: string;
    explanation?: string;
  };
  zone?: {
    id: string;
    zoneId: string;
    name: string;
    category: string;
  };
  changeDetection?: {
    id: string;
    affectedAreaPercentage: number;
    evidenceStrength: number;
    detectedAt: string;
    sensorType?: string;
    source?: string;
  };
  baseline?: {
    id: string;
    baselineId: string;
    effectiveDate?: string;
  };
  observation?: {
    id: string;
    observationId: string;
    source: string;
    acquisitionDate: string;
  };
  enforcementCases: Array<{
    id: string;
    caseId: string;
    title: string;
    status: string;
    severity: string;
  }>;
  reconciliationReports: Array<{
    id: string;
    reconciliationId: string;
    discrepancyScore: number;
    status: string;
  }>;
  evidenceDossiers: Array<{
    id: string;
    dossierId: string;
    dossierHash: string;
    isSealed: boolean;
  }>;
  disclaimer: string;
}

export interface LeaseLineageCorrelationDto {
  lease: {
    id: string;
    permitNumber: string;
    lesseeName: string;
    mineralType: string;
    permittedWeightTonnes: number;
    remainingQuota: number;
    status: string;
    validFrom: string;
    validUntil: string;
  };
  zone?: {
    id: string;
    zoneId: string;
    name: string;
  };
  ePasses: Array<{
    id: string;
    passNumber: string;
    vehicleId?: string;
    netWeightTonnes: number;
    status: string;
  }>;
  checkpointPassages: Array<{
    id: string;
    passNumber: string;
    checkpointName: string;
    declaredQuantityTonnes: number;
    verificationResult: string;
    verificationTimestamp: string;
  }>;
  reconciliationReports: Array<{
    id: string;
    reconciliationId: string;
    discrepancyScore: number;
    reconciliationStatus: string;
  }>;
  enforcementCases: Array<{
    id: string;
    caseId: string;
    title: string;
    status: string;
    severity: string;
  }>;
  disclaimer: string;
}

export interface VehicleLineageCorrelationDto {
  vehicle: {
    id: string;
    vehicleId: string;
    registrationNumber: string;
    vehicleType: string;
    status: string;
    tareWeight: number;
    grossVehicleWeight: number;
    permittedCarryingCapacity: number;
  };
  ePasses: Array<{
    id: string;
    passNumber: string;
    mineralType: string;
    netWeightTonnes: number;
    status: string;
    validUntil: string;
  }>;
  checkpointLogs: Array<{
    id: string;
    checkpointName: string;
    passNumber: string;
    declaredQuantityTonnes: number;
    verificationResult: string;
    locationStatus: string;
    verificationTimestamp: string;
  }>;
  reconciliationReports: Array<{
    id: string;
    reconciliationId: string;
    discrepancyScore: number;
    reconciliationStatus: string;
  }>;
  enforcementCases: Array<{
    id: string;
    caseId: string;
    title: string;
    status: string;
    severity: string;
  }>;
  disclaimer: string;
}

export interface EPassLineageCorrelationDto {
  ePass: {
    id: string;
    passNumber: string;
    mineralType: string;
    netWeightTonnes: number;
    status: string;
    validFrom: string;
    validUntil: string;
    sourceLocation: string;
    destinationCheckpoint: string;
  };
  authorization?: {
    id: string;
    permitNumber: string;
    lesseeName: string;
    mineralType: string;
    permittedWeightTonnes: number;
    remainingQuota: number;
  };
  vehicle?: {
    id: string;
    vehicleId: string;
    registrationNumber: string;
  };
  driver?: {
    id: string;
    driverId: string;
    name: string;
    licenseNumber: string;
  };
  checkpointPassages: Array<{
    id: string;
    checkpointName: string;
    verificationResult: string;
    locationStatus: string;
    verificationTimestamp: string;
  }>;
  reconciliationReports: Array<{
    id: string;
    reconciliationId: string;
    discrepancyScore: number;
  }>;
  disclaimer: string;
}



// ============================================================
// HLS Architecture — Phase 2: Shared Types
//
// Defines the shared type vocabulary for the approved HLS
// (Harmonized Landsat Sentinel) architecture.
//
// ARCHITECTURAL RULES:
//   - ONE logical optical baseline per zone/monitoringTrack.
//   - Native and HLS are comparison REPRESENTATIONS of that baseline.
//   - They are NOT separate baselines.
//   - SAR remains a fully independent monitoringTrack.
//   - SAR must never be routed through HLS.
//
// This file contains TYPE DEFINITIONS ONLY.
// No runtime logic, no GEE calls, no database writes.
// ============================================================


// ─── Phase 3 Addition: HLS Error Stage ───────────────────────────────────────

/**
 * HLSErrorStage identifies at which stage of the HLS representation
 * pipeline a failure occurred.
 *
 * Follows the same pattern as PipelineErrorStage (used by Baseline and
 * SatelliteMetadata) to keep the error-tracking vocabulary consistent.
 *
 * These are future production error stages — no fake errors are generated.
 * Populated only when HLSRepresentationStatus is FAILED.
 */
export enum HLSErrorStage {
  /** GEE HLS collection returned no matching image for the source observation. */
  HLS_NO_IMAGE_FOUND = 'HLS_NO_IMAGE_FOUND',
  /** GEE API call to the HLS collection failed (HTTP error, auth, quota). */
  HLS_API_ERROR = 'HLS_API_ERROR',
  /** GEE export task submission or execution for HLS image failed. */
  HLS_EXPORT_FAILED = 'HLS_EXPORT_FAILED',
  /** Google Drive download of the HLS GeoTIFF failed. */
  HLS_DOWNLOAD_FAILED = 'HLS_DOWNLOAD_FAILED',
  /** Local HLS raster failed band/dimension/CRS validation. */
  HLS_RASTER_INVALID = 'HLS_RASTER_INVALID',
  /** HLS analysis grid construction or alignment failed. */
  HLS_GRID_INVALID = 'HLS_GRID_INVALID',
  /** HLS quality/QA band validation failed. */
  HLS_QA_INVALID = 'HLS_QA_INVALID',
  /** Acquisition date of the retrieved HLS image does not match the baseline source date. */
  HLS_DATE_MISMATCH = 'HLS_DATE_MISMATCH',
  /** Unknown or unclassified failure. */
  HLS_UNKNOWN = 'HLS_UNKNOWN',
}


// ─── STEP 2: Comparison Mode ─────────────────────────────────────────────────

/**
 * ComparisonMode describes HOW an optical comparison is performed —
 * specifically which pixel-alignment/harmonization representation is used.
 *
 * This is NOT the monitoringTrack (OPTICAL | SAR).
 * The monitoringTrack stays OPTICAL for all optical comparisons.
 *
 * Decision logic (implemented in Phase 3+):
 *   Same-family sensor    → NATIVE   (Sentinel-2 vs Sentinel-2, Landsat vs Landsat)
 *   Cross-sensor optical  → HLS      (Sentinel-2 vs Landsat or Landsat vs Sentinel-2)
 *
 * SAR does NOT have a ComparisonMode — it uses its own
 * SarCompatibilityResult and SarChangeDetector paths exclusively.
 */
export enum ComparisonMode {
  /** Native sensor representation — same optical sensor family comparison. */
  NATIVE = 'NATIVE',
  /** HLS representation — cross-sensor optical comparison via harmonized product. */
  HLS = 'HLS',
}


// ─── STEP 3: HLS Product Type ────────────────────────────────────────────────

/**
 * HLSProduct identifies which HLS-generated product is referenced.
 *
 * S30 — Sentinel-2 derived HLS product (30 m, UTM)
 * L30 — Landsat-8 or Landsat-9 derived HLS product (30 m, UTM)
 *
 * These correspond to the NASA HLS V2.0 collection families:
 *   HLSL30 (Landsat)  — GEE: NASA/HLS/HLSL30/v002
 *   HLSS30 (Sentinel) — GEE: NASA/HLS/HLSS30/v002
 *
 * Do NOT add products beyond these two until formally approved.
 */
export enum HLSProduct {
  /** Sentinel-2 derived HLS product at 30 m resolution. */
  S30 = 'S30',
  /** Landsat-derived HLS product at 30 m resolution (Landsat 8 or 9). */
  L30 = 'L30',
}


// ─── STEP 4: HLS Version ─────────────────────────────────────────────────────

/**
 * HLSVersion identifies the HLS collection version used for processing.
 *
 * The approved implementation target is V2.0.
 * Represented as an enum to prevent version strings being scattered
 * as raw literals throughout services and DTOs.
 *
 * If a new version is approved, add it here — do NOT create parallel enums.
 */
export enum HLSVersion {
  /** NASA HLS V2.0 — the approved and supported production version. */
  V2_0 = 'V2.0',
}


// ─── STEP 5: HLS Representation Status ───────────────────────────────────────

/**
 * HLSRepresentationStatus tracks the lifecycle of the HLS representation
 * derived from a logical baseline observation.
 *
 * IMPORTANT: This is the status of the HLS representation artifact.
 * It is NOT the status of the logical Baseline (BaselineStatus).
 * A baseline may be ACTIVE while its HLS representation is still PROCESSING.
 *
 * Lifecycle: NOT_CREATED → PROCESSING → READY (or FAILED)
 */
export enum HLSRepresentationStatus {
  /** HLS representation has not yet been generated. Default state. */
  NOT_CREATED = 'NOT_CREATED',
  /** HLS representation is currently being generated (GEE export running). */
  PROCESSING = 'PROCESSING',
  /** HLS representation is ready and validated for use in comparisons. */
  READY = 'READY',
  /** HLS representation generation failed. See failureReason for details. */
  FAILED = 'FAILED',
}


// ─── STEP 6: Source Lineage Types ────────────────────────────────────────────

/**
 * HLSSourceLineage captures the chain of provenance from logical baseline
 * to HLS representation:
 *
 *   Logical Baseline
 *       ↓ (baselineId)
 *   Original source observation (sourceObservationId / satelliteMetadataId)
 *       ↓
 *   HLS representation (product, version)
 *
 * This type is used by HLSRepresentationDto and future processing services.
 * It references identifiers only — it does NOT embed full SatelliteMetadata
 * documents (to avoid duplication).
 */
export interface HLSSourceLineage {
  /**
   * The logical baseline this HLS representation was generated from.
   * References Baseline._id as a string.
   */
  baselineId: string;

  /**
   * The original GEE asset ID (imageId) from which the baseline was created.
   * Identical to Baseline.imageId / SatelliteMetadata.imageId.
   * Stored explicitly to avoid a round-trip join on every HLS request.
   */
  sourceObservationId: string;

  /**
   * References the SatelliteMetadata document for the original observation.
   * Provides access to footprint, cloudCover, geeReference, and pipeline fields.
   */
  satelliteMetadataId: string;

  /**
   * Satellite platform identifier as recorded in SatelliteMetadata.source.
   * E.g. SatelliteSource.SENTINEL_2 or SatelliteSource.LANDSAT_8.
   */
  sourceSatelliteSource: SatelliteSource;

  /**
   * Sensor track of the original observation. Always OPTICAL for HLS.
   * SAR lineage is never expressed here.
   */
  sourceSensorType: SensorType.OPTICAL;

  /** Platform identifier of the source satellite (e.g. 'Sentinel-2A', 'Landsat-8'). */
  sourcePlatform?: string;

  /** ISO 8601 acquisition date of the original satellite observation. */
  sourceAcquisitionDate: string;

  /** HLS product derived from this observation (S30 or L30). */
  hlsProduct: HLSProduct;

  /** HLS collection version used for this representation. */
  hlsVersion: HLSVersion;

  /** Processing pipeline version string for audit / reproducibility. */
  processingVersion: string;
}


// ─── STEP 7: HLS Representation DTO ──────────────────────────────────────────

/**
 * HLSRepresentationDto is the shared data transfer object for an HLS
 * representation derived from a logical baseline.
 *
 * This DTO maps to the future HLSRepresentation MongoDB model (Phase 3+).
 *
 * FIELD NOTES:
 * - raster/grid/storage fields are intentionally omitted here.
 *   They will be added when the HLSRepresentation model is implemented.
 * - All identity/lineage fields follow the project's existing DTO conventions
 *   (ObjectId serialized as string, dates as ISO 8601 strings).
 */
export interface HLSRepresentationDto {
  /** Serialized MongoDB ObjectId of this HLS representation document. */
  id: string;

  /** Serialized ObjectId of the ONE logical Baseline this was derived from (if applicable). */
  baselineId?: string;

  /** Whether this representation was derived for a candidate/current observation rather than a baseline. */
  isObservationOnly?: boolean;

  /** Serialized ObjectId of the source observation / SatelliteMetadata if applicable. */
  observationId?: string;

  /**
   * The original GEE asset ID used as the source for HLS generation.
   * Matches Baseline.imageId / SatelliteMetadata.imageId.
   */
  sourceObservationId: string;

  /**
   * Serialized ObjectId of the SatelliteMetadata document for the source
   * observation. Provides access to footprint, cloudCover, geeReference.
   */
  satelliteMetadataId: string;

  /**
   * Source satellite platform. Determines whether product is S30 or L30.
   * OPTICAL sensor type only — SAR is never an HLS source.
   */
  sourceSatelliteSource: SatelliteSource;

  /**
   * Sensor type of the source observation. Always OPTICAL.
   * Included explicitly for defensive type safety.
   */
  sourceSensorType: SensorType;

  /** Platform identifier of the source satellite (e.g. 'Sentinel-2A', 'Landsat-8'). */
  sourcePlatform?: string;

  /** ISO 8601 acquisition date of the original satellite observation. */
  sourceAcquisitionDate: string;

  /** HLS product identifier (S30 = Sentinel-2 derived, L30 = Landsat derived). */
  hlsProduct: HLSProduct;

  /**
   * HLS collection version used for generation.
   * Current approved value: HLSVersion.V2_0.
   */
  hlsVersion: HLSVersion;

  /** Lifecycle status of this HLS representation. */
  status: HLSRepresentationStatus;

  /**
   * Processing pipeline version string.
   * Used for audit and reproducibility tracking.
   */
  processingVersion: string;

  /**
   * Operational mode: OFFICIAL_HLS (NASA upstream product) or LOCAL_HLS_COMPATIBLE (locally harmonized).
   */
  hlsMode?: HLSProcessingMode;

  /** Bandpass adjustment version used (e.g. HLS_V2.0_CLAVERIE_2018 or UPSTREAM). */
  bandpassVersion?: string;

  /** BRDF normalization model version used (e.g. HLS_V2.0_MODIS_CFACTOR or UPSTREAM). */
  brdfVersion?: string;

  /** SHA-256 hash of original un-harmonized source GeoTIFF file. */
  sourceRasterHash?: string;

  // ─── GEE / Export Lineage (populated during Phase 5 real HLS acquisition) ──

  /** GEE collection path used for the HLS export (e.g. NASA/HLS/HLSS30/v002). */
  geeCollectionId?: string;

  /** GEE image/asset ID within the HLS collection for this specific observation. */
  geeImageId?: string;

  /** GEE export operation/task ID (from projects/.../operations/...). */
  geeExportTaskId?: string;

  /** Google Drive file ID for the downloaded HLS GeoTIFF. */
  driveFileId?: string;

  /** Google Drive filename for the HLS GeoTIFF. */
  driveFileName?: string;

  /** File size in bytes of the downloaded HLS GeoTIFF. */
  driveFileSizeBytes?: number;

  /** Local filesystem path to the stored HLS GeoTIFF. */
  localRasterPath?: string;

  // ─── Raster / Grid Metadata (populated after raster validation) ────────────

  /** Whether the HLS raster has been validated (band count, dimensions, CRS). */
  rasterValidated?: boolean;

  /** Number of spectral bands in the validated HLS raster. */
  rasterBandCount?: number;

  /** Width of the HLS raster in pixels. */
  rasterWidth?: number;

  /** Height of the HLS raster in pixels. */
  rasterHeight?: number;

  /** CRS (EPSG code) of the HLS raster after normalization. */
  rasterCrs?: string;

  /** Native CRS of the HLS raster as exported from GEE (before normalization). */
  originalCrs?: string;

  /** Ground resolution of the HLS product in metres (always 30 m for HLS V2.0). */
  rasterResolutionMeters?: number;

  /** Area of a single pixel in square metres (for area calculation). */
  pixelAreaM2?: number;

  /** Count of valid (non-masked, non-nodata) pixels in the HLS raster. */
  validPixelCount?: number;

  /** SHA-256 hash of the downloaded HLS GeoTIFF file (for integrity verification). */
  fileHash?: string;

  /** ISO 8601 timestamp when HLS representation processing completed successfully. */
  completedAt?: string;

  // ─── Failure / Error Tracking ─────────────────────────────────────────────

  /**
   * Stage at which HLS generation failed.
   * Follows the same pattern as PipelineErrorStage on Baseline/SatelliteMetadata.
   */
  errorStage?: HLSErrorStage;

  /** Short machine-readable error code. */
  errorCode?: string;

  /** Human-readable error message. */
  errorMessage?: string;

  /** Underlying cause / exception message for diagnostics. */
  errorCause?: string;

  /** ISO 8601 timestamp when the failure was recorded. */
  failedAt?: string;

  /** Human-readable explanation of the failure suitable for logging. */
  failureReason?: string;

  /**
   * ISO 8601 timestamp when this representation was created in the system.
   * Follows the project's standard createdAt / updatedAt convention.
   */
  createdAt: string;

  /** ISO 8601 timestamp of the last update to this representation. */
  updatedAt: string;
}


// ─── STEP 8: Comparison Decision Types ───────────────────────────────────────

/**
 * OpticalComparisonDecision is the result of the future Native-vs-HLS
 * decision service, which determines whether two optical observations
 * (baseline and current) can be compared NATIVELY or require HLS.
 *
 * The decision service logic (to be implemented in Phase 3+):
 *   Sentinel-2  vs Sentinel-2   → NATIVE
 *   Landsat-8   vs Landsat-9    → NATIVE
 *   Sentinel-2  vs Landsat-*    → HLS
 *   Landsat-*   vs Sentinel-2   → HLS
 *   SAR         vs anything     → rejected (not via this service)
 *
 * This type is used in the shared contract between:
 * - The future OpticalComparisonDecisionService
 * - ChangeDetectionService (which will route accordingly)
 * - OpticalCompatibilityService (which enforces the mode)
 */
export interface OpticalComparisonDecision {
  /**
   * The resolved comparison mode for this baseline/current pair.
   * NATIVE or HLS.
   */
  mode: ComparisonMode;

  /**
   * Whether the comparison is feasible (either NATIVE or HLS).
   * false if hard rejection (e.g. SAR vs optical, geometry mismatch).
   */
  isCompatible?: boolean;

  /**
   * The baseline satellite source (e.g. SENTINEL_2, LANDSAT_8).
   * Matches the active baseline's SatelliteMetadata.source.
   */
  baselineSource: SatelliteSource;

  /**
   * The current observation satellite source.
   * Matches the current SatelliteMetadata.source.
   */
  currentSource: SatelliteSource;

  /**
   * Sensor track of the baseline observation (e.g. OPTICAL).
   */
  baselineSensor?: SensorType;

  /**
   * Sensor track of the current observation (e.g. OPTICAL).
   */
  currentSensor?: SensorType;

  /**
   * Whether cross-sensor harmonization is required.
   * true  → mode MUST be HLS
   * false → mode is NATIVE
   */
  requiresHLS: boolean;

  /**
   * The HLS product required for the baseline if HLS mode is selected.
   * S30 for Sentinel-2, L30 for Landsat. Undefined for NATIVE comparisons.
   */
  baselineHLSProduct?: HLSProduct;

  /**
   * The HLS product required for the current observation if HLS mode is selected.
   * S30 for Sentinel-2, L30 for Landsat. Undefined for NATIVE comparisons.
   */
  currentHLSProduct?: HLSProduct;

  /**
   * Human-readable rationale for the decision.
   * E.g.: "Same Sentinel-2 family — NATIVE comparison applicable."
   *       "Sentinel-2 vs Landsat cross-sensor — HLS required."
   */
  reason: string;

  /**
   * If the comparison is not feasible at all (e.g. SAR vs optical, or
   * geometry does not intersect), this field carries the rejection code.
   * Reuses the existing RejectionReasonCode enum to avoid duplication.
   *
   * Present only when the decision is a hard rejection (cannot proceed
   * with either NATIVE or HLS).
   */
  rejectionCode?: HLSRejectionCode | RejectionReasonCode;
}

/**
 * HLSRejectionCode provides structured reasons for decisions where
 * neither NATIVE nor HLS comparison is possible.
 *
 * IMPORTANT: Where an equivalent code already exists in RejectionReasonCode,
 * that enum is the canonical source and should be used for candidate
 * rejection tracking in monitoring pipelines. HLSRejectionCode is specifically
 * for the comparison decision service output contract.
 *
 * Cross-reference with RejectionReasonCode (line ~1750 in shared types):
 *   OPTICAL_SENSOR_MISMATCH  — exists in RejectionReasonCode (reused semantics)
 *   TEMPORAL_INELIGIBLE      — exists in RejectionReasonCode (reused semantics)
 *   GEOMETRY_NOT_INTERSECTING— exists in RejectionReasonCode (reused semantics)
 */
export enum HLSRejectionCode {
  /**
   * SAR observation supplied as one of the optical comparison inputs.
   * SAR is never routed through HLS — use the SAR monitoring track instead.
   */
  SAR_NOT_HLS_COMPATIBLE = 'SAR_NOT_HLS_COMPATIBLE',

  /**
   * Incompatible monitoring-track pairing (e.g. OPTICAL baseline vs SAR candidate).
   */
  SENSOR_TRACK_MISMATCH = 'SENSOR_TRACK_MISMATCH',

  /**
   * Candidate observation is identical to baseline (duplicate observation / same image).
   */
  DUPLICATE_OBSERVATION = 'DUPLICATE_OBSERVATION',

  /**
   * Candidate observation matches baseline observation.
   */
  BASELINE_MATCH = 'BASELINE_MATCH',

  /**
   * HLS processing is required (cross-sensor) but the HLS representation
   * for the baseline has not yet been generated (status: NOT_CREATED or FAILED).
   */
  HLS_REPRESENTATION_NOT_READY = 'HLS_REPRESENTATION_NOT_READY',

  /**
   * The two observations' footprints do not intersect — comparison is
   * geometrically impossible regardless of comparison mode.
   * Semantically equivalent to RejectionReasonCode.GEOMETRY_NOT_INTERSECTING.
   */
  GEOMETRY_NOT_INTERSECTING = 'GEOMETRY_NOT_INTERSECTING',

  /**
   * The observation is outside the acceptable temporal window
   * relative to the baseline. Equivalent to RejectionReasonCode.TEMPORAL_INELIGIBLE.
   */
  TEMPORAL_INELIGIBLE = 'TEMPORAL_INELIGIBLE',

  /**
   * The sensor combination is not a supported optical pairing.
   * E.g.: DEM vs optical, or unsupported experimental sensor.
   * Distinct from SAR_NOT_HLS_COMPATIBLE (which is specifically for SAR).
   */
  UNSUPPORTED_SENSOR_COMBINATION = 'UNSUPPORTED_SENSOR_COMBINATION',
}

/**
 * HLS Processing Mode distinguishes between consuming official NASA HLS V2.0 products
 * (upstream-processed) vs generating a local HLS-compatible harmonized representation.
 */
export enum HLSProcessingMode {
  OFFICIAL_HLS = 'OFFICIAL_HLS',
  LOCAL_HLS_COMPATIBLE = 'LOCAL_HLS_COMPATIBLE',
}

/**
 * HLS Bandpass Coefficient definition for MSI-to-OLI linear regression.
 */
export interface HLSBandpassCoefficient {
  band: string;
  targetBand: string;
  slope: number;
  offset: number;
}

/**
 * Dedicated structured result returned by HlsChangeDetector.
 */
export interface HlsChangeDetectionResult {
  changedPixels: number;
  validComparisonPixels: number;
  stablePixels: number;
  decreasePixels: number;
  increasePixels: number;
  changedAreaM2: number;
  changedAreaHectares: number;
  affectedAreaPercentage: number;
  meanDeltaNdvi: number;
  medianDeltaNdvi: number;
  stdDeltaNdvi: number;
  thresholdCrossed: boolean;
  threshold: number;
  categories: ChangeCategory[];
  changeIndicators: ChangeIndicatorDeltas;
  processingFamily: 'HLS';
  crossSensor: true;
  hlsAlgorithmVersion: string;
  hlsProcessingVersion: string;
  bandpassVersion: string;
  brdfVersion: string;
  gridDefinition: {
    crs: string;
    resolutionMeters: number;
    pixelAreaM2: number;
    width: number;
    height: number;
  };
  qaPolicy: string;
  changedMask: Uint8Array;
  validMask: Uint8Array;
}

/**
 * Cross-sensor validation report returned by HlsValidationService.
 */
export interface HlsValidationReport {
  status: 'VALIDATED' | 'LIMITED' | 'INVALID';
  reasons: string[];
  baseline: {
    sourceImageId: string;
    sourceSensor: string;
    hlsProduct: string;
    hlsMode: HLSProcessingMode;
    rasterHash: string;
    hlsRasterHash: string;
    validPixels: number;
    ndviMean: number;
  };
  current: {
    sourceImageId: string;
    sourceSensor: string;
    hlsProduct: string;
    hlsMode: HLSProcessingMode;
    rasterHash: string;
    hlsRasterHash: string;
    validPixels: number;
    ndviMean: number;
  };
  comparison: {
    commonGridCrs: string;
    resolutionMeters: number;
    validOverlapPixels: number;
    changedPixels: number;
    changedAreaHectares: number;
    affectedAreaPercentage: number;
    temporalDeltaDays: number;
  };
}


// ─── STEP 9: Type Safety Mapping (Reference Constants) ───────────────────────

/**
 * OPTICAL_NATIVE_SENSOR_PAIRS documents which satellite source pairs
 * should use ComparisonMode.NATIVE (no HLS required).
 *
 * This is NOT enforced at runtime in Phase 2 — it serves as a shared
 * reference for the decision service implementation in Phase 3+.
 *
 * Rule: Same-family sensors → NATIVE
 *
 * NATIVE pairs:
 *   SENTINEL_2  ↔ SENTINEL_2
 *   LANDSAT_8   ↔ LANDSAT_8
 *   LANDSAT_9   ↔ LANDSAT_9
 *   LANDSAT_8   ↔ LANDSAT_9  (same family, compatible SR bands)
 *   LANDSAT_9   ↔ LANDSAT_8
 *
 * HLS pairs (cross-sensor → must use HLS):
 *   SENTINEL_2  ↔ LANDSAT_8
 *   SENTINEL_2  ↔ LANDSAT_9
 *   LANDSAT_8   ↔ SENTINEL_2
 *   LANDSAT_9   ↔ SENTINEL_2
 *
 * NEVER valid for HLS routing:
 *   SENTINEL_1 (SAR)  — use SAR monitoringTrack
 *   SRTM (DEM)        — not an optical source
 */
export const OPTICAL_NATIVE_SENSOR_PAIRS: ReadonlyArray<readonly [SatelliteSource, SatelliteSource]> = [
  [SatelliteSource.SENTINEL_2, SatelliteSource.SENTINEL_2],
  [SatelliteSource.LANDSAT_8,  SatelliteSource.LANDSAT_8],
  [SatelliteSource.LANDSAT_9,  SatelliteSource.LANDSAT_9],
  [SatelliteSource.LANDSAT_8,  SatelliteSource.LANDSAT_9],
  [SatelliteSource.LANDSAT_9,  SatelliteSource.LANDSAT_8],
] as const;

/**
 * HLS_REQUIRED_SENSOR_PAIRS documents which cross-sensor optical pairs
 * require ComparisonMode.HLS.
 *
 * Reference only — runtime implementation in Phase 3+.
 */
export const HLS_REQUIRED_SENSOR_PAIRS: ReadonlyArray<readonly [SatelliteSource, SatelliteSource]> = [
  [SatelliteSource.SENTINEL_2, SatelliteSource.LANDSAT_8],
  [SatelliteSource.SENTINEL_2, SatelliteSource.LANDSAT_9],
  [SatelliteSource.LANDSAT_8,  SatelliteSource.SENTINEL_2],
  [SatelliteSource.LANDSAT_9,  SatelliteSource.SENTINEL_2],
] as const;

/**
 * SAR_INCOMPATIBLE_WITH_HLS is a compile-time constant documenting that
 * SENTINEL_1 (SAR) must never appear in HLS comparison paths.
 * It is listed here for documentation and future type guard use.
 */
export const SAR_INCOMPATIBLE_WITH_HLS: ReadonlyArray<SatelliteSource> = [
  SatelliteSource.SENTINEL_1,
] as const;

// ============================================================
// PHASE 11: FORENSIC EVIDENCE DOSSIER, BATCH CHECKPOINT & COMPLIANCE
// ============================================================

// ─── 11.1 Forensic Evidence Dossier DTOs ────────────────────

export interface EvidenceDossierCaseDto {
  caseId: string;
  caseNumber: string;
  title: string;
  description: string;
  severity: CaseSeverity;
  caseType: CaseType;
  status: CaseStatus;
  zoneId?: string;
  zoneName?: string;
  authorizationId?: string;
  permitNumber?: string;
  assignedOfficerId?: string;
  assignedOfficerName?: string;
  assignedAt?: string;
  investigationFindings: string[];
  fieldVerification?: FieldVerificationDto;
  enforcementAction?: EnforcementActionDto;
  resolutionInfo?: CaseResolutionDto;
  closedAt?: string;
  createdAt: string;
}

export interface EvidenceDossierSatelliteDto {
  imageId: string;
  source: SatelliteSource;
  sensorType: SensorType;
  acquisitionDate: string;
  cloudCover: number;
  geeReference: string;
  processingMode?: ProcessingMode;
}

export interface EvidenceDossierChangeDetectionDto {
  changeId: string;
  detectedAt: string;
  sensorType: SensorType;
  source: SatelliteSource;
  monitoringTrack?: MonitoringTrack;
  comparisonMode?: ComparisonMode;
  zoneArea: number;
  changedArea: number;
  affectedAreaPercentage: number;
  severity: AlertSeverity | 'NONE';
  highestThresholdCrossed: number;
  changedGeometry?: GeoJSONPolygon | GeoJSONMultiPolygon;
  rasterStatistics?: SarRasterStatisticsDto | OpticalRasterStatisticsDto;
  categories: ChangeCategory[];
  auditStatus?: string;
}

export interface EvidenceDossierAlertDto {
  alertId: string;
  detectedAt: string;
  severity: AlertSeverity;
  thresholdsCrossed: number[];
  highestThresholdCrossed: number;
  evidenceStrength: number;
  status: AlertStatus;
  explanation: string;
  comparisonMode?: ComparisonMode;
}

export interface EvidenceDossierReconciliationDto {
  reconciliationId: string;
  periodStart: string;
  periodEnd: string;
  discrepancyScore: number;
  reconciliationStatus: ReconciliationStatus;
  anomaliesCount: number;
  anomalies: Array<{
    type: ReconciliationAnomalyType;
    severity: ReconciliationAnomalySeverity;
    title: string;
    description: string;
    evidenceScore: number;
    details?: Record<string, unknown>;
  }>;
  findings: string[];
  recommendations: string[];
}

export interface EvidenceDossierTransportDto {
  permitNumber?: string;
  vehicleRegistrationNumber?: string;
  driverName?: string;
  driverLicenseNumber?: string;
  mineralType?: string;
  authorizedQuantityTonnes?: number;
  declaredQuantityTonnes?: number;
  ePassNumber?: string;
  ePassStatus?: EPassStatus;
}

export interface EvidenceDossierCheckpointDto {
  logId: string;
  checkpointName: string;
  passNumber: string;
  verificationTimestamp: string;
  verificationResult: CheckpointVerificationResult;
  rejectionReasons: string[];
  locationStatus: LocationVerificationStatus;
  distanceFromCheckpointMeters?: number;
  scannedCoordinates?: GeoJSONPoint;
  verifiedByName?: string;
}

export interface EvidenceDossierUavDto {
  droneSurveyConducted: boolean;
  groundDisturbanceConfirmed: boolean;
  siteObservations?: string;
  locationCoordinates?: [number, number];
  photoCount: number;
  photoUrls?: string[];
  verifiedAt?: string;
}

export interface EvidenceDossierAuditDto {
  auditId: string;
  timestamp: string;
  actorName: string;
  actorRole: string;
  action: CaseAuditAction;
  previousStatus?: CaseStatus;
  newStatus?: CaseStatus;
  remarks: string;
}

export interface EvidenceDossierIntegrityDto {
  isValid: boolean;
  isTampered: boolean;
  storedHash: string;
  computedHash: string;
  algorithm: string;
  verifiedAt: string;
  message: string;
  discrepancyDetails?: string;
}

export interface EvidenceDossierDto {
  id: string;
  dossierId: string;
  caseId: string;
  caseNumber: string;
  dossierVersion: number;
  dossierHash: string;
  hashAlgorithm: string;
  isSealed: boolean;
  sealedAt: string;
  sealedBy?: string;
  sealedByName?: string;
  caseDetails: EvidenceDossierCaseDto;
  satelliteLineage: EvidenceDossierSatelliteDto[];
  changeDetections: EvidenceDossierChangeDetectionDto[];
  alerts: EvidenceDossierAlertDto[];
  reconciliation?: EvidenceDossierReconciliationDto;
  transportSummary?: EvidenceDossierTransportDto;
  checkpointPassages: EvidenceDossierCheckpointDto[];
  uavVerification?: EvidenceDossierUavDto;
  auditTrail: EvidenceDossierAuditDto[];
  integrity?: EvidenceDossierIntegrityDto;
  createdAt: string;
  updatedAt: string;
}

export interface VerifyDossierResponseDto {
  dossierId: string;
  isValid: boolean;
  isTampered: boolean;
  storedHash: string;
  computedHash: string;
  algorithm: string;
  verifiedAt: string;
  discrepancyDetails?: string;
}

export interface CompileDossierRequest {
  remarks?: string;
}

// ─── 11.2 Batch Checkpoint Synchronization DTOs ──────────────

export type BatchPassageResultStatus = 'ACCEPTED' | 'DUPLICATE' | 'REJECTED' | 'FAILED';

export interface BatchPassageItemDto {
  clientLogId?: string;
  syncNonce?: string;
  passNumberOrId: string;
  passageTimestamp: string;
  currentLocation?: [number, number];
  declaredQuantityTonnes?: number;
  notes?: string;
}

export interface BatchCheckpointSyncRequest {
  checkpointId: string;
  syncBatchId?: string;
  passages: BatchPassageItemDto[];
}

export interface BatchPassageResultDto {
  clientLogId?: string;
  passNumber: string;
  status: BatchPassageResultStatus;
  message: string;
  logId?: string;
  verificationResult?: CheckpointVerificationResult;
  rejectionReasons?: string[];
}

export interface BatchCheckpointSyncResponse {
  syncBatchId: string;
  checkpointId: string;
  checkpointName?: string;
  totalSubmitted: number;
  acceptedCount: number;
  duplicateCount: number;
  rejectedCount: number;
  failedCount: number;
  syncedAt: string;
  results: BatchPassageResultDto[];
}

// ─── 11.3 Statutory Compliance Export DTOs ───────────────────

export interface ComplianceReportFilters {
  startDate?: string;
  endDate?: string;
  zoneId?: string;
  district?: string;
  severity?: AlertSeverity;
  format?: 'json' | 'csv';
}

export interface ZoneComplianceRecordDto {
  zoneId: string;
  zoneName: string;
  category: ZoneCategory;
  totalAreaHectares: number;
  status: ZoneStatus;
  activeLeasesCount: number;
  alertsCount: number;
  criticalAlertsCount: number;
  disturbedAreaHectares: number;
  complianceStatus: 'COMPLIANT' | 'WARNING' | 'BREACH';
}

export interface StatutoryViolationRecordDto {
  caseId: string;
  caseNumber: string;
  zoneName: string;
  violationType: CaseType;
  severity: CaseSeverity;
  detectedAt: string;
  status: CaseStatus;
  penaltyAmountInr?: number;
  statutoryReference: string;
}

export interface EnforcementActionRecordDto {
  caseId: string;
  caseNumber: string;
  actionType: EnforcementActionType;
  actionDate: string;
  penaltyAmountInr?: number;
  officialOrderReference?: string;
  officerName?: string;
}

export interface ComplianceSummaryMetricsDto {
  totalMonitoredZones: number;
  totalEnvironmentalAlerts: number;
  criticalAlertsCount: number;
  totalDisturbedAreaHectares: number;
  totalAuthorizedMiningLeases: number;
  totalPermittedTonnage: number;
  totalEPassesIssued: number;
  totalCheckpointPassages: number;
  reconciliationAnomaliesCount: number;
  activeEnforcementCasesCount: number;
  penaltiesLeviedInr: number;
}

export interface ComplianceReportDto {
  reportId: string;
  title: string;
  generatedAt: string;
  generatedBy?: string;
  jurisdiction: string;
  statutoryActReference: string;
  reportingPeriod: {
    fromDate: string;
    toDate: string;
  };
  selectedDistrict?: string;
  selectedZoneId?: string;
  summaryMetrics: ComplianceSummaryMetricsDto;
  zoneComplianceSummaries: ZoneComplianceRecordDto[];
  statutoryViolations: StatutoryViolationRecordDto[];
  enforcementActionsSummary: EnforcementActionRecordDto[];
}

// ============================================================
// Module Offline: Satellite Image Change Detection DTOs
// ============================================================

export type OfflineSatelliteSensor =
  | 'Sentinel-2'
  | 'Landsat-8'
  | 'Landsat-9'
  | 'Landsat-5'
  | 'Landsat-7'
  | 'Generic-Optical';

export type OfflinePipelineType = 'SAME_SENSOR' | 'CROSS_SENSOR';

export type OfflineChangeCategory =
  | 'VEGETATION_DECREASE_CANDIDATE'
  | 'VEGETATION_INCREASE_CANDIDATE'
  | 'BARE_GROUND_INCREASE_CANDIDATE'
  | 'BARE_GROUND_DECREASE_CANDIDATE'
  | 'OTHER_SPECTRAL_CHANGE'
  | 'STABLE'
  | 'UNCERTAIN_INVALID';

export interface OfflineBandMapping {
  blue?: number;
  green?: number;
  red?: number;
  nir?: number;
  swir1?: number;
  swir2?: number;
  qa?: number;
}

export interface OfflineRasterMetadata {
  filename: string;
  originalPath?: string;
  width: number;
  height: number;
  numBands: number;
  crs: string;
  pixelSizeX: number;
  pixelSizeY: number;
  originX: number;
  originY: number;
  bbox: [number, number, number, number]; // [minX, minY, maxX, maxY]
  nodata: number | null;
  detectedSensor: OfflineSatelliteSensor;
  acquisitionDate?: string;
  thumbnailPngBase64?: string;
  bandNames?: string[];
}

export interface OfflineChangeCategoryStat {
  category: OfflineChangeCategory;
  label: string;
  pixelCount: number;
  areaHectares: number;
  areaSqKm: number;
  percentage: number;
  colorHex: string;
}

export interface OfflineAreaSummary {
  totalFootprintHectares: number;
  validAnalyzedHectares: number;
  maskedHectares: number;
  validPercentage: number;
  maskedPercentage: number;
  categories: OfflineChangeCategoryStat[];
}

export interface OfflineChangeDetectionParams {
  baselinePath: string;
  observationPath: string;
  baselineSensor?: OfflineSatelliteSensor;
  observationSensor?: OfflineSatelliteSensor;
  baselineBandMapping?: OfflineBandMapping;
  observationBandMapping?: OfflineBandMapping;
  baselineDate?: string;
  observationDate?: string;
  vegetationThreshold?: number; // default 0.15
  soilThreshold?: number; // default 0.12
  maskClouds?: boolean; // default true
  outputResolution?: number; // default 10 or 30
}

export interface OfflineChangeDetectionArtifacts {
  baselineGeoTiff: string;
  observationGeoTiff: string;
  changeMapGeoTiff: string;
  cloudMaskGeoTiff: string;
  ndviDiffGeoTiff?: string;
  bsiDiffGeoTiff?: string;
  metadataJson: string;
  areaSummaryCsv: string;
  validationReportMd: string;
  changeMapPng?: string;
  baselinePng?: string;
  observationPng?: string;
  cloudMaskPng?: string;
}

export interface OfflineChangeDetectionResult {
  jobId: string;
  status: 'SUCCESS' | 'FAILED';
  executedAt: string;
  pipeline: OfflinePipelineType;
  baselineMetadata: OfflineRasterMetadata;
  observationMetadata: OfflineRasterMetadata;
  commonGrid: {
    width: number;
    height: number;
    crs: string;
    resolutionMeters: number;
    bbox: [number, number, number, number];
  };
  areaSummary: OfflineAreaSummary;
  baselinePreviewUrl?: string;
  observationPreviewUrl?: string;
  baselineMaskedPreviewUrl?: string;
  observationMaskedPreviewUrl?: string;
  changeMapPreviewUrl?: string;
  cloudMaskPreviewUrl?: string;
  artifacts: OfflineChangeDetectionArtifacts;
  warnings: string[];
  limitations: string[];
  error?: string;
}



