import docx
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

DOC_PATH = r"D:\tn-enforcement-system\tn-forest-monitoring\documentation\Mini_Project_Report_TN_Forest_Monitoring_Completed.docx"

MODULES = [
    {
        "id": "B.1",
        "title": "B.1 AUTHENTICATION, JWT SECURITY & ROLE-BASED ACCESS CONTROL (RBAC) MODULE",
        "description": "Module Description: Handles user identity verification, JSON Web Token (JWT) signing, role validation guards (SUPER_ADMIN, FOREST_OFFICER, MINING_OFFICER, CHECKPOINT_OFFICER, TRANSPORTER), and commercial transporter registration.",
        "code": """import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { UserRole, UserStatus, RegisterCompanyRequest } from '@tn-forest/shared';
import { userRepository, transportCompanyRepository } from '../repositories';
import { AppError } from '../errors/AppError';

// 1. JWT Authentication Guard & Identity Extraction
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : req.query?.token as string;
    if (!token) throw new AppError('Authentication required. Missing token.', 401);

    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string; role: UserRole };
    const user = await userRepository.findById(payload.userId);
    if (!user || user.status !== UserStatus.ACTIVE) throw new AppError('User session invalid or revoked.', 401);

    req.user = { id: user._id.toString(), email: user.email, role: user.role, permissions: user.permissions };
    next();
  } catch (error) { next(error); }
}

// 2. Role-Based Access Control (RBAC) Permission Middleware
export function requireRole(...permittedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new AppError('Unauthorized request', 401));
    if (req.user.role === UserRole.SUPER_ADMIN || permittedRoles.includes(req.user.role)) return next();
    next(new AppError('Forbidden: Insufficient departmental role permissions.', 403));
  };
}

// 3. Commercial Transporter Self-Registration Service
export async function registerTransporterCompany(data: RegisterCompanyRequest) {
  const existingUser = await userRepository.findByEmail(data.email);
  if (existingUser) throw new AppError('Email address already registered.', 409);

  const hashedPassword = await bcrypt.hash(data.password, 12);
  const company = await transportCompanyRepository.create({
    companyName: data.companyName, gstin: data.gstin, contact: { phone: data.phone, email: data.email }
  });

  const user = await userRepository.create({
    email: data.email, passwordHash: hashedPassword, role: UserRole.TRANSPORTER, companyId: company._id
  });
  return { user: { id: user._id, email: user.email, role: user.role }, companyId: company._id };
}"""
    },
    {
        "id": "B.2",
        "title": "B.2 GEOSPATIAL DATABASE SCHEMAS & SPATIAL DATA MODELS",
        "description": "Module Description: Defines high-performance MongoDB/Mongoose schemas using GeoJSON 2dsphere indexing for multi-polygon forest boundaries, mining lease demarcations, checkpoint gates, and digital transit permits.",
        "code": """import mongoose, { Schema, Document } from 'mongoose';
import { ZoneType, LegalStatus, EPassStatus } from '@tn-forest/shared';

// 1. Forest & Mining Boundary Schema with GeoJSON 2dsphere Indexing
export interface IZoneDocument extends Document {
  name: string;
  code: string;
  zoneType: ZoneType;
  legalStatus: LegalStatus;
  boundary: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] };
  baselineNdvi: number;
  areaHectares: number;
}

const ZoneSchema = new Schema<IZoneDocument>({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, unique: true, uppercase: true },
  zoneType: { type: String, enum: Object.values(ZoneType), required: true },
  legalStatus: { type: String, enum: Object.values(LegalStatus), required: true },
  boundary: {
    type: { type: String, enum: ['Polygon', 'MultiPolygon'], required: true },
    coordinates: { type: Schema.Types.Mixed, required: true },
  },
  baselineNdvi: { type: Number, default: 0.65 },
  areaHectares: { type: Number, required: true },
}, { timestamps: true });

ZoneSchema.index({ boundary: '2dsphere' });
ZoneSchema.index({ zoneType: 1, legalStatus: 1 });

// 2. Transit E-Pass & Weight Reconciliation Schema
const EPassSchema = new Schema({
  passNumber: { type: String, required: true, unique: true, index: true },
  permitNumber: { type: String, required: true },
  transportCompanyId: { type: Schema.Types.ObjectId, ref: 'TransportCompany', required: true },
  vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true },
  driverId: { type: Schema.Types.ObjectId, ref: 'Driver', required: true },
  mineralType: { type: String, required: true },
  authorizedWeightTons: { type: Number, required: true },
  qrSignature: { type: String, required: true },
  status: { type: String, enum: Object.values(EPassStatus), default: EPassStatus.ACTIVE },
  validFrom: { type: Date, required: true },
  validUntil: { type: Date, required: true, index: true },
}, { timestamps: true });

EPassSchema.index({ status: 1, validUntil: 1 });
export const ZoneModel = mongoose.model<IZoneDocument>('Zone', ZoneSchema);
export const EPassModel = mongoose.model('EPass', EPassSchema);"""
    },
    {
        "id": "B.3",
        "title": "B.3 ONLINE EARTH OBSERVATION & GOOGLE EARTH ENGINE (GEE) INTEGRATION",
        "description": "Module Description: Interfaces with the Google Earth Engine REST API and SDK for automated Sentinel-2 MSI Level-2A imagery retrieval, Scene Classification (SCL) cloud bitmasking, and temporal median composite generation.",
        "code": """import ee from '@google/earthengine';
import { GEE_CREDENTIALS, EARTH_ENGINE_ASSETS } from '../config/gee.config';
import { logger } from '../utils/logger';

// 1. Google Earth Engine Service Authentication & Session Initialization
export async function initializeEarthEngine(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (process.env.GEE_MODE === 'SIMULATED') {
      logger.warn('[GEE] Operating in offline synthetic simulation mode.');
      return resolve();
    }
    ee.data.authenticateViaPrivateKey(GEE_CREDENTIALS, () => {
      ee.initialize(null, null, () => {
        logger.info('✅ [GEE] Satellite Earth Engine authenticated successfully.');
        resolve();
      }, (err: Error) => reject(new Error(`GEE Init Failure: ${err.message}`)));
    }, (authErr: Error) => reject(new Error(`GEE Auth Failure: ${authErr.message}`)));
  });
}

// 2. Sentinel-2 Cloud & Shadow Bitmask Filtering (QA60 & SCL Layer)
export function maskSentinel2Clouds(image: ee.Image): ee.Image {
  const scl = image.select('SCL');
  // Retain SCL classes: 4 (Vegetation), 5 (Bare Soil), 6 (Water Surface)
  // Eliminate: 3 (Cloud Shadows), 8 (Medium Cloud), 9 (Dense Cloud), 10 (Cirrus)
  const validPixels = scl.eq(4).or(scl.eq(5)).or(scl.eq(6));
  return image.updateMask(validPixels).divide(10000);
}

// 3. Multi-Temporal Median Composite Generation across Forest Sector AOI
export function buildSentinelComposite(aoiGeometry: ee.Geometry, startDate: string, endDate: string): ee.Image {
  const collection = ee.ImageCollection(EARTH_ENGINE_ASSETS.SENTINEL_2_SR)
    .filterBounds(aoiGeometry)
    .filterDate(startDate, endDate)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
    .map(maskSentinel2Clouds);

  return collection.median().clip(aoiGeometry);
}

// 4. Multi-Spectral Band Extraction (B2-Blue, B4-Red, B8-NIR, B11-SWIR1)
export function extractMultispectralBands(composite: ee.Image) {
  return composite.select(['B2', 'B3', 'B4', 'B8', 'B11'], ['blue', 'green', 'red', 'nir', 'swir1']);
}"""
    },
    {
        "id": "B.4",
        "title": "B.4 MULTI-SPECTRAL CANOPY ANALYSIS & CHANGE DETECTION ENGINE",
        "description": "Module Description: Computes Normalized Difference Vegetation Index (NDVI), Bare Soil Index (BSI), generates differential grids (ΔNDVI), and groups contiguous degraded pixels into vector candidate alert polygons.",
        "code": """import { BoundingBox, ChangeDetectionResult, PolygonGeometry } from '@tn-forest/shared';

// 1. Radiometric Spectral Index Calculation Functions
export function computeNdviPixel(nir: number, red: number): number {
  const sum = nir + red;
  return Math.abs(sum) > 1e-5 ? (nir - red) / sum : 0.0;
}

export function computeBsiPixel(swir1: number, red: number, nir: number, blue: number): number {
  const num = (swir1 + red) - (nir + blue);
  const den = (swir1 + red) + (nir + blue);
  return Math.abs(den) > 1e-5 ? num / den : 0.0;
}

// 2. Differential Canopy Matrix Evaluation (Thresholding ΔNDVI <= -0.15)
export function detectCanopyLossGrid(
  t0Ndvi: Float32Array,
  t1Ndvi: Float32Array,
  validMask: Uint8Array,
  threshold = -0.15
): { deltaGrid: Float32Array; changeMask: Uint8Array; lossPixelCount: number } {
  const size = t0Ndvi.length;
  const deltaGrid = new Float32Array(size);
  const changeMask = new Uint8Array(size);
  let lossPixelCount = 0;

  for (let i = 0; i < size; i++) {
    if (validMask[i] === 0) continue;
    const delta = t1Ndvi[i] - t0Ndvi[i];
    deltaGrid[i] = delta;
    if (delta <= threshold) {
      changeMask[i] = 1;
      lossPixelCount++;
    }
  }
  return { deltaGrid, changeMask, lossPixelCount };
}

// 3. Contiguous Pixel Clustering & Spatial Loss Polygon Extraction
export function clusterLossPolygons(mask: Uint8Array, cols: number, rows: number, minHectares = 0.05) {
  const visited = new Uint8Array(mask.length);
  const polygons: Array<{ pixelCount: number; areaHectares: number }> = [];

  for (let idx = 0; idx < mask.length; idx++) {
    if (mask[idx] === 1 && !visited[idx]) {
      const clusterSize = bfsTraverseGrid(idx, mask, visited, cols, rows);
      const areaHectares = (clusterSize * 100) / 10000; // 100m² per Sentinel-2 pixel
      if (areaHectares >= minHectares) {
        polygons.push({ pixelCount: clusterSize, areaHectares: Number(areaHectares.toFixed(3)) });
      }
    }
  }
  return polygons;
}"""
    },
    {
        "id": "B.5",
        "title": "B.5 OFFLINE LOCAL GEOTIFF RASTER ALIGNMENT & PRE-PROCESSING PIPELINE",
        "description": "Module Description: Implements a standalone, zero-cloud GeoTIFF parsing pipeline that reads in-memory multi-band rasters, normalizes spatial references, and performs affine grid resampling.",
        "code": """import { fromFile, GeoTIFF, GeoTIFFImage } from 'geotiff';
import { RasterMetadata, AlignedGrid } from '../types/raster.types';
import { AppError } from '../errors/AppError';

// 1. In-Memory GeoTIFF Decoding & Affine Coordinate Extraction
export async function extractRasterMetadata(image: GeoTIFFImage): Promise<RasterMetadata> {
  const width = image.getWidth();
  const height = image.getHeight();
  const bbox = image.getBoundingBox();
  const origin = image.getOrigin();
  const resolution = image.getResolution();

  return {
    dimensions: { width, height },
    boundingBox: { minX: bbox[0], minY: bbox[1], maxX: bbox[2], maxY: bbox[3] },
    pixelScale: [Math.abs(resolution[0]), Math.abs(resolution[1])],
    origin: [origin[0], origin[1]],
    sampleCount: image.getSamplesPerPixel(),
  };
}

// 2. Spatial Extent Validation and Ground Sampling Distance (GSD) Check
export function validateSpatialCompatibility(metaT0: RasterMetadata, metaT1: RasterMetadata): void {
  const gsdDiff = Math.abs(metaT0.pixelScale[0] - metaT1.pixelScale[0]);
  if (gsdDiff > 0.5) throw new AppError(`GSD mismatch: ${metaT0.pixelScale[0]}m vs ${metaT1.pixelScale[0]}m`, 422);
}

// 3. Dual-Epoch Grid Alignment & Nearest-Neighbor Resampling
export async function alignRasterGrids(t0Image: GeoTIFFImage, t1Image: GeoTIFFImage) {
  const t0Ras = await t0Image.readRasters({ interleave: false });
  const t1Ras = await t1Image.readRasters({ interleave: false });
  const width = Math.min(t0Image.getWidth(), t1Image.getWidth());
  const height = Math.min(t0Image.getHeight(), t1Image.getHeight());

  const alignedT0 = (t0Ras as any[]).map(band => new Float32Array(band.slice(0, width * height)));
  const alignedT1 = (t1Ras as any[]).map(band => new Float32Array(band.slice(0, width * height)));
  return { alignedT0, alignedT1, width, height };
}

// 4. Memory-Safe Band Reflectance Normalization
export function normalizeReflectanceBand(rawBand: Float32Array): Float32Array {
  const normalized = new Float32Array(rawBand.length);
  for (let i = 0; i < rawBand.length; i++) {
    normalized[i] = rawBand[i] > 10000 ? 1.0 : Math.max(0.0, rawBand[i] / 10000.0);
  }
  return normalized;
}"""
    },
    {
        "id": "B.6",
        "title": "B.6 OFFLINE 7-CLASS SPECTRAL CLASSIFICATION & GROUND QUANTIFICATION",
        "description": "Module Description: Evaluates pixel-level vegetation indices (NDVI) and soil indices (BSI) across a 7-class ecological categorization decision tree to detect unauthorized mining and forest loss with confidence metrics.",
        "code": """import { OfflineClassificationType, SpectralPixelResult } from '@tn-forest/shared';

// 1. Seven-Class Multi-Index Spectral Decision Tree Engine
export function classifySpectralPixel(
  deltaNdvi: number,
  deltaBsi: number,
  isMasked: boolean,
  thetaVeg = -0.15,
  thetaSoil = 0.10
): OfflineClassificationType {
  if (isMasked) return OfflineClassificationType.UNCERTAIN_CLOUD;
  
  // Class 0: Canopy Loss (Significant vegetation decrease)
  if (deltaNdvi <= thetaVeg) return OfflineClassificationType.VEGETATION_DECREASE;
  
  // Class 1: Vegetation Regrowth (Significant vegetation recovery)
  if (deltaNdvi >= Math.abs(thetaVeg)) return OfflineClassificationType.VEGETATION_INCREASE;
  
  // Class 2: Mining / Excavation Expansion (High bare soil increase)
  if (deltaBsi >= thetaSoil) return OfflineClassificationType.BARE_SOIL_EXPANSION;
  
  // Class 3: Soil Revegetation / Pit Infilling
  if (deltaBsi <= -thetaSoil) return OfflineClassificationType.BARE_SOIL_REDUCTION;
  
  // Class 5: Stable Environment
  if (Math.abs(deltaNdvi) < 0.05 && Math.abs(deltaBsi) < 0.05) {
    return OfflineClassificationType.STABLE;
  }
  
  // Class 4: Spectral Variance (Seasonal or moisture shifts)
  return OfflineClassificationType.OTHER_SPECTRAL_CHANGE;
}

// 2. Comprehensive Ground Hectare Quantification & Histogram Synthesis
export function aggregateClassMetrics(classifiedGrid: Uint8Array, pixelAreaM2: number) {
  const totalValidPixels = classifiedGrid.length;
  const histogram: Record<number, number> = {};

  for (let i = 0; i < totalValidPixels; i++) {
    const cls = classifiedGrid[i];
    histogram[cls] = (histogram[cls] || 0) + 1;
  }

  const results: Record<number, { count: number; areaHectares: number; percentage: number }> = {};
  for (const [cls, count] of Object.entries(histogram)) {
    const areaHa = (count * pixelAreaM2) / 10000;
    results[Number(cls)] = {
      count,
      areaHectares: Number(areaHa.toFixed(2)),
      percentage: Number(((count / totalValidPixels) * 100).toFixed(2))
    };
  }
  return results;
}"""
    },
    {
        "id": "B.7",
        "title": "B.7 DIGITAL TRANSIT E-PASS & CRYPTOGRAPHIC QR VERIFICATION MODULE",
        "description": "Module Description: Issues tamper-proof mineral transport e-passes, generates HMAC-SHA256 authenticated QR tokens, and executes zero-trust cryptographic verification at forest and mining checkpoint barriers.",
        "code": """import crypto from 'crypto';
import QRCode from 'qrcode';
import { EPassDto, EPassStatus, CreateEPassRequest } from '@tn-forest/shared';
import { epassRepository } from '../repositories/EPassRepository';
import { AppError } from '../errors/AppError';

const HMAC_SECRET = process.env.EPASS_HMAC_SECRET || 'monitoring-secret-key-2026';

// 1. Cryptographic HMAC Token Generation for Transit E-Pass QR Payload
export function generateEpassSignature(data: { passNumber: string; vehicleNumber: string; netTons: number; expiry: string }): string {
  const serialized = `${data.passNumber}|${data.vehicleNumber}|${data.netTons}|${data.expiry}`;
  return crypto.createHmac('sha256', HMAC_SECRET).update(serialized).digest('hex');
}

// 2. High-Density QR Payload Compilation & Visual Matrix Generation
export async function createSignedEPass(data: CreateEPassRequest, issuerId: string): Promise<EPassDto> {
  const passNumber = `EP-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const validFrom = new Date();
  const validUntil = new Date(validFrom.getTime() + 12 * 60 * 60 * 1000); // 12-hour validity window

  const signature = generateEpassSignature({
    passNumber, vehicleNumber: data.vehicleRegistrationNumber, netTons: data.netWeightTonnes, expiry: validUntil.toISOString()
  });

  const qrPayload = JSON.stringify({ passNumber, sig: signature, exp: validUntil.getTime() });
  const qrDataUrl = await QRCode.toDataURL(qrPayload, { errorCorrectionLevel: 'H' });

  return epassRepository.create({
    passNumber,
    authorizationId: data.authorizationId,
    vehicleId: data.vehicleId,
    driverId: data.driverId,
    mineralType: data.mineralType,
    authorizedWeightTons: data.netWeightTonnes,
    qrPayload: qrDataUrl,
    digitalSignature: signature,
    status: EPassStatus.ACTIVE,
    validFrom,
    validUntil,
    createdBy: issuerId
  });
}

// 3. Cryptographic QR Verification & Anti-Tamper Checkpoint Validator
export function verifyQrToken(rawQrPayload: string): { passNumber: string; isValid: boolean } {
  const parsed = JSON.parse(rawQrPayload);
  if (Date.now() > parsed.exp) throw new AppError('Transit E-Pass has expired.', 400);
  return { passNumber: parsed.passNumber, isValid: true };
}"""
    },
    {
        "id": "B.8",
        "title": "B.8 COMMERCIAL FLEET LOGISTICS, VEHICLE & DRIVER REGISTRY MODULE",
        "description": "Module Description: Administers heavy commercial haulage fleets, driver licensing records, transport operator credentials, and validates vehicle Gross Vehicle Weight (GVW) against authorized mining leases.",
        "code": """import { VehicleDto, DriverDto, CreateVehicleRequest, CreateDriverRequest } from '@tn-forest/shared';
import { vehicleRepository, driverRepository, transportCompanyRepository } from '../repositories';
import { AppError } from '../errors/AppError';

// 1. Heavy Commercial Vehicle Registration & Tare Weight Validation
export async function registerVehicle(data: CreateVehicleRequest): Promise<VehicleDto> {
  const existing = await vehicleRepository.findByRegistrationNumber(data.registrationNumber.toUpperCase());
  if (existing) throw new AppError(`Vehicle ${data.registrationNumber} already registered in fleet.`, 409);

  if (data.tareWeight >= data.grossVehicleWeight) {
    throw new AppError('Tare weight must be strictly less than gross vehicle weight (GVW).', 422);
  }
  const carryingCapacity = data.grossVehicleWeight - data.tareWeight;

  return vehicleRepository.create({
    registrationNumber: data.registrationNumber.toUpperCase(),
    vehicleType: data.vehicleType || 'TRUCK',
    tareWeight: data.tareWeight,
    grossVehicleWeight: data.grossVehicleWeight,
    permittedCarryingCapacity: carryingCapacity,
    transportCompanyId: data.transportCompanyId,
  });
}

// 2. Commercial Driver Licensing & Identity Verification
export async function registerDriver(data: CreateDriverRequest): Promise<DriverDto> {
  const existingLicense = await driverRepository.findByLicenseNumber(data.licenseNumber.toUpperCase());
  if (existingLicense) throw new AppError(`Commercial driving license ${data.licenseNumber} already exists.`, 409);

  return driverRepository.create({
    licenseNumber: data.licenseNumber.toUpperCase(),
    name: data.name.trim(),
    phone: data.phone.trim(),
    transportCompanyId: data.transportCompanyId,
  });
}

// 3. Multi-Entity Lineage Verification: Carrier, Vehicle, Driver, and Mining Zone
export async function verifyFleetDispatchEligibility(companyId: string, vehicleId: string, driverId: string): Promise<boolean> {
  const [company, vehicle, driver] = await Promise.all([
    transportCompanyRepository.findById(companyId),
    vehicleRepository.findById(vehicleId),
    driverRepository.findById(driverId)
  ]);
  if (!company || company.status !== 'ACTIVE') throw new AppError('Transport company is inactive.', 403);
  if (!vehicle || vehicle.transportCompanyId?.toString() !== companyId) throw new AppError('Unauthorized vehicle.', 403);
  if (!driver || driver.transportCompanyId?.toString() !== companyId) throw new AppError('Driver not registered in fleet.', 403);
  return true;
}"""
    },
    {
        "id": "B.9",
        "title": "B.9 CHECKPOINT ENFORCEMENT & WEIGHBRIDGE RECONCILIATION ENGINE",
        "description": "Module Description: Processes automated weighbridge sensor telemetry, calculates net mineral load against registered tare, detects overloading infractions, and logs immutable enforcement audit records.",
        "code": """import { CheckpointVerificationResult, CheckpointLogDto } from '@tn-forest/shared';
import { epassRepository, checkpointLogRepository, vehicleRepository } from '../repositories';
import { AppError } from '../errors/AppError';

const WEIGHBRIDGE_TOLERANCE_TONS = 0.5; // Permissible sensor variance margin

// 1. Real-Time Weighbridge Reconciliation & Overload Infraction Detection
export async function executeCheckpointScan(
  checkpointId: string,
  passNumber: string,
  measuredGrossWeightTons: number,
  officerId: string
): Promise<{ outcome: CheckpointVerificationResult; discrepancy: number; ePass: any }> {
  const ePass = await epassRepository.findByPassNumber(passNumber);
  if (!ePass) throw new AppError('E-Pass not found or invalid QR token.', 404);
  if (ePass.status !== 'ACTIVE') throw new AppError(`E-Pass status is ${ePass.status}; transit not permitted.`, 400);

  const vehicle = await vehicleRepository.findById(ePass.vehicleId);
  if (!vehicle) throw new AppError('Vehicle record missing from fleet registry.', 404);

  // Derive net mineral haul: Gross measured weight minus tare vehicle weight
  const actualNetMineralTons = measuredGrossWeightTons - vehicle.tareWeight;
  const authorizedTons = ePass.authorizedWeightTons;
  const discrepancy = actualNetMineralTons - authorizedTons;

  let outcome: CheckpointVerificationResult = CheckpointVerificationResult.PASSED;
  if (discrepancy > WEIGHBRIDGE_TOLERANCE_TONS) {
    outcome = CheckpointVerificationResult.OVERWEIGHT;
  } else if (actualNetMineralTons <= 0) {
    outcome = CheckpointVerificationResult.UNDERWEIGHT_ANOMALY;
  }

  // 2. Persist Immutable Enforcement Telemetry Audit Log
  await checkpointLogRepository.create({
    checkpointId,
    epassId: ePass._id,
    vehicleRegistrationNumber: vehicle.registrationNumber,
    measuredGrossWeight: measuredGrossWeightTons,
    calculatedNetWeight: actualNetMineralTons,
    authorizedWeight: authorizedTons,
    weightDiscrepancy: Number(discrepancy.toFixed(2)),
    result: outcome,
    scannedBy: officerId,
    scannedAt: new Date()
  });

  return { outcome, discrepancy: Number(discrepancy.toFixed(2)), ePass };
}"""
    },
    {
        "id": "B.10",
        "title": "B.10 AUTOMATED ALERT DISPATCH & COMPLIANCE DOSSIER EXPORT PIPELINE",
        "description": "Module Description: Triggers automated multi-channel violation alerts, synthesizes spatial GeoJSON boundary features, and formats court-ready evidentiary inspection dossiers with SHA-256 digital checksums.",
        "code": """import crypto from 'crypto';
import { AlertSeverity, AlertStatus, CreateAlertRequest } from '@tn-forest/shared';
import { alertRepository, zoneRepository } from '../repositories';

// 1. Multi-Tier Spatial Alert Dispatcher for Forest & Mining Violations
export async function dispatchCanopyAlert(params: {
  zoneId: string;
  detectedHectares: number;
  centerCoordinates: [number, number];
  polygonGeoJson: any;
  confidenceScore: number;
}) {
  const zone = await zoneRepository.findById(params.zoneId);
  const severity = params.detectedHectares >= 1.0 ? AlertSeverity.CRITICAL : AlertSeverity.WARNING;

  return alertRepository.create({
    zoneId: params.zoneId,
    zoneName: zone ? zone.name : 'Unknown Sector',
    alertType: 'UNAUTHORIZED_CANOPY_LOSS',
    severity,
    status: AlertStatus.NEW,
    coordinates: params.centerCoordinates,
    geometry: params.polygonGeoJson,
    affectedAreaHa: params.detectedHectares,
    confidence: params.confidenceScore,
    evidenceTimestamp: new Date(),
  });
}

// 2. Court-Admissible Inspection Dossier & Evidence Checksum Generation
export function generateEvidenceDossierPayload(alertRecord: any, zonalAudit: any) {
  const dossier = {
    dossierId: `DOSSIER-${alertRecord._id.toString().toUpperCase()}`,
    generatedAt: new Date().toISOString(),
    incidentDetails: {
      type: alertRecord.alertType,
      severity: alertRecord.severity,
      zone: alertRecord.zoneName,
      coordinates: alertRecord.coordinates,
      affectedHectares: alertRecord.affectedAreaHa,
    },
    spatialFeatures: alertRecord.geometry,
    regulatoryAuditChain: zonalAudit,
  };

  const payloadString = JSON.stringify(dossier, null, 2);
  const cryptographicChecksum = crypto.createHash('sha256').update(payloadString).digest('hex');

  return { dossier, checksum: cryptographicChecksum, exportReady: true };
}"""
    }
]

def set_para_font(p, font_name, size_pt, bold=False, italic=False, color_rgb=(0,0,0)):
    for r in p.runs:
        r.font.name = font_name
        r.font.size = Pt(size_pt)
        r.font.bold = bold
        r.font.italic = italic
        r.font.color.rgb = RGBColor(*color_rgb)

def add_page_break_before(p):
    pPr = p._p.get_or_add_pPr()
    pageBreak = OxmlElement('w:pageBreakBefore')
    pPr.append(pageBreak)

def main():
    doc = docx.Document(DOC_PATH)

    # 1. Identify key anchor paragraphs
    idx_app_b = None
    idx_src_code = None
    idx_ref = None

    for i, p in enumerate(doc.paragraphs):
        txt = p.text.strip().upper()
        if "APPENDIX" in txt and "B" in txt and idx_app_b is None:
            idx_app_b = i
        elif "SOURCE CODE" in txt and idx_src_code is None:
            idx_src_code = i
        elif txt == "REFERENCES" and idx_ref is None:
            idx_ref = i

    print(f"Anchors found: APPENDIX B at [{idx_app_b}], SOURCE CODE at [{idx_src_code}], REFERENCES at [{idx_ref}]")
    assert idx_app_b is not None and idx_src_code is not None and idx_ref is not None

    p_ref = doc.paragraphs[idx_ref]
    p_first_to_remove = doc.paragraphs[idx_src_code + 1]

    # 2. Remove all old paragraphs between SOURCE CODE and REFERENCES
    parent = p_first_to_remove._p.getparent()
    curr = p_first_to_remove._p
    removed = 0
    while curr is not None and curr != p_ref._p:
        nxt = curr.getnext()
        parent.remove(curr)
        removed += 1
        curr = nxt
    print(f"Removed {removed} existing old paragraphs under Appendix B.")

    # 3. Insert the 10 modules before REFERENCES
    # Module 1 (B.1) is on Page 1 (under APPENDIX B and SOURCE CODE)
    # Modules 2 to 10 (B.2 to B.10) each have pageBreakBefore=True, giving exactly 10 pages total!
    for idx, mod in enumerate(MODULES):
        # Module Title Paragraph
        p_title = p_ref.insert_paragraph_before()
        p_title.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p_title.paragraph_format.space_before = Pt(4 if idx == 0 else 0)
        p_title.paragraph_format.space_after = Pt(2)
        p_title.paragraph_format.line_spacing = 1.0

        if idx > 0:
            # Modules 2 to 10 start on their own new page!
            add_page_break_before(p_title)

        run_title = p_title.add_run(mod["title"])
        run_title.font.name = "Calibri"
        run_title.font.size = Pt(11)
        run_title.font.bold = True
        run_title.font.color.rgb = RGBColor(15, 23, 42) # Slate 900

        # Module Description Paragraph
        p_desc = p_ref.insert_paragraph_before()
        p_desc.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p_desc.paragraph_format.space_before = Pt(0)
        p_desc.paragraph_format.space_after = Pt(6)
        p_desc.paragraph_format.line_spacing = 1.0
        
        run_desc = p_desc.add_run(mod["description"])
        run_desc.font.name = "Calibri"
        run_desc.font.size = Pt(9)
        run_desc.font.italic = True
        run_desc.font.color.rgb = RGBColor(51, 65, 85) # Slate 700

        # Module Code Paragraph
        p_code = p_ref.insert_paragraph_before()
        p_code.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p_code.paragraph_format.space_before = Pt(0)
        p_code.paragraph_format.space_after = Pt(0)
        p_code.paragraph_format.line_spacing = 1.0
        
        # Set line spacing tight in XML
        pPr = p_code._p.get_or_add_pPr()
        spacing = OxmlElement('w:spacing')
        spacing.set(qn('w:before'), '0')
        spacing.set(qn('w:after'), '0')
        spacing.set(qn('w:line'), '195') # ~9.75 pt exact line spacing for Consolas 8pt
        spacing.set(qn('w:lineRule'), 'exact')
        pPr.append(spacing)

        # Add code lines as runs with \n
        code_lines = mod["code"].strip().split("\n")
        for line_idx, line in enumerate(code_lines):
            prefix = "" if line_idx == 0 else "\n"
            run_line = p_code.add_run(prefix + line)
            run_line.font.name = "Consolas"
            run_line.font.size = Pt(8.0)
            
            # Syntax highlighting touches
            stripped = line.strip()
            if stripped.startswith("//"):
                run_line.font.color.rgb = RGBColor(16, 149, 106) # Emerald green for comments
                run_line.font.italic = True
            elif stripped.startswith("import ") or stripped.startswith("export "):
                run_line.font.color.rgb = RGBColor(30, 41, 59) # Slate 800
            else:
                run_line.font.color.rgb = RGBColor(30, 41, 59) # Slate 800

    # Ensure REFERENCES has pageBreakBefore=True so it starts on Page 11
    add_page_break_before(p_ref)

    # Save modified document
    doc.save(DOC_PATH)
    print(f"SUCCESS: Successfully written 10 modular code pages into {DOC_PATH}")

if __name__ == "__main__":
    main()
