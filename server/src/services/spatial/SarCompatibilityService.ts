import {
  RejectionReasonCode,
  SensorType,
  SatelliteSource,
} from '@tn-forest/shared/types';
import { getRejectionReasonLabel } from '@tn-forest/shared/constants';

export interface SarObservationGeometry {
  imageId: string;
  source?: SatelliteSource | string;
  sensorType?: SensorType | string;
  platform?: string;
  mission?: string;
  instrument?: string;
  productType?: string;
  mode?: string;
  polarizations?: string[];
  orbitDirection?: string;
  absoluteOrbitNumber?: number;
  relativeOrbitNumber?: number;
}

export interface SarCompatibilityResult {
  isCompatible: boolean;
  rejectionCode?: RejectionReasonCode;
  reason?: string;
  details?: {
    baselineRelativeOrbit?: number;
    candidateRelativeOrbit?: number;
    baselineOrbitDirection?: string;
    candidateOrbitDirection?: string;
    baselineMode?: string;
    candidateMode?: string;
    baselinePolarizations?: string[];
    candidatePolarizations?: string[];
    baselinePlatform?: string;
    candidatePlatform?: string;
    baselineProductType?: string;
    candidateProductType?: string;
  };
}

export interface ParsedSarMetadata {
  platform: 'Sentinel-1A' | 'Sentinel-1B';
  mission: 'S1A' | 'S1B';
  instrument: string;
  productType: string;
  mode: string;
  polarizations: string[];
  orbitDirection: 'DESCENDING' | 'ASCENDING';
  absoluteOrbitNumber?: number;
  relativeOrbitNumber?: number;
  acquisitionDate?: Date;
}

/**
 * Centralized SAR Compatibility Policy and Verification Engine.
 * Enforces strict radiometric and geometric comparability rules between Sentinel-1
 * baseline and current observations before spatial harmonization or change detection.
 *
 * Relative orbit (repeat-pass track) is enforced as a first-class compatibility attribute:
 * differing repeat-pass tracks view terrain from disparate look angles (e.g. Near-range 31° vs
 * Far-range 42°), which induces severe topographic radiometric distortions that cannot be
 * eliminated by geographic coordinate reprojection alone.
 */
export class SarCompatibilityService {
  /**
   * Calculates the Sentinel-1 relative orbit number (Track 1-175) from the absolute orbit number.
   * Based on ESA Sentinel-1 175-orbit 12-day repeat cycle reference orbit numbers:
   *   Sentinel-1A: relativeOrbit = ((absoluteOrbit - 73) % 175) + 1
   *   Sentinel-1B: relativeOrbit = ((absoluteOrbit - 27) % 175) + 1
   */
  public static calculateRelativeOrbit(
    absoluteOrbit: number,
    platform: 'Sentinel-1A' | 'Sentinel-1B' | string,
  ): number {
    const isS1B = String(platform).includes('1B') || String(platform).includes('S1B');
    const phaseOffset = isS1B ? 27 : 73;
    let rel = ((absoluteOrbit - phaseOffset) % 175) + 1;
    if (rel <= 0) {
      rel += 175;
    }
    return rel;
  }

  /**
   * Parses authentic Sentinel-1 metadata from the canonical Earth Engine asset ID or raw GEE properties.
   * e.g.: COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20200102T003240_20200102T003305_030614_0381E6_3EAD
   */
  public static parseSentinel1Metadata(
    imageId: string,
    rawProperties?: Record<string, unknown>,
  ): ParsedSarMetadata {
    const parts = imageId.split('/');
    const assetName = parts[parts.length - 1] || imageId;
    const tokens = assetName.split('_');

    const missionToken = tokens[0] || 'S1A';
    const isS1B = missionToken.toUpperCase().includes('S1B') || missionToken.toUpperCase().includes('1B');
    const mission: 'S1A' | 'S1B' = isS1B ? 'S1B' : 'S1A';
    const platform: 'Sentinel-1A' | 'Sentinel-1B' = isS1B ? 'Sentinel-1B' : 'Sentinel-1A';

    const mode = (tokens[1] || (rawProperties?.sensorOperationalMode as string) || 'IW').toUpperCase();
    const productType = (tokens[2] || 'GRDH').toUpperCase();

    // Polarization parsing
    const polCode = tokens[3] || '1SDV';
    let polarizations = ['VV', 'VH'];
    if (Array.isArray(rawProperties?.transmitterReceiverPolarisation)) {
      polarizations = rawProperties.transmitterReceiverPolarisation as string[];
    } else if (polCode.includes('DV')) {
      polarizations = ['VV', 'VH'];
    } else if (polCode.includes('DH')) {
      polarizations = ['HH', 'HV'];
    } else if (polCode.includes('SH')) {
      polarizations = ['HH'];
    } else if (polCode.includes('SV')) {
      polarizations = ['VV'];
    }

    // Absolute orbit parsing
    let absoluteOrbitNumber: number | undefined;
    if (tokens[6] && /^\d+$/.test(tokens[6])) {
      absoluteOrbitNumber = parseInt(tokens[6], 10);
    } else if (typeof rawProperties?.['orbitProperties_absOrbit'] === 'number') {
      absoluteOrbitNumber = rawProperties['orbitProperties_absOrbit'] as number;
    }

    // Relative orbit (track) parsing
    let relativeOrbitNumber: number | undefined;
    if (typeof rawProperties?.relativeOrbitNumber_start === 'number') {
      relativeOrbitNumber = rawProperties.relativeOrbitNumber_start as number;
    } else if (typeof rawProperties?.relative_orbit_number_descending === 'number') {
      relativeOrbitNumber = rawProperties.relative_orbit_number_descending as number;
    } else if (typeof rawProperties?.relative_orbit_number_ascending === 'number') {
      relativeOrbitNumber = rawProperties.relative_orbit_number_ascending as number;
    } else if (typeof rawProperties?.['orbitProperties_cycleOrbit'] === 'number') {
      relativeOrbitNumber = rawProperties['orbitProperties_cycleOrbit'] as number;
    } else if (absoluteOrbitNumber !== undefined) {
      relativeOrbitNumber = this.calculateRelativeOrbit(absoluteOrbitNumber, platform);
    }

    // Orbit direction parsing
    let orbitDirection: 'DESCENDING' | 'ASCENDING' = 'DESCENDING';
    const rawPass = (rawProperties?.orbitProperties_pass as string) || (rawProperties?.orbitDirection as string);
    if (rawPass && rawPass.toUpperCase().includes('ASC')) {
      orbitDirection = 'ASCENDING';
    } else {
      orbitDirection = 'DESCENDING';
    }

    // Acquisition Date parsing
    let acquisitionDate: Date | undefined;
    const timeStartProp = rawProperties?.['system:time_start'];
    if (typeof timeStartProp === 'number' || typeof timeStartProp === 'string') {
      const parsedDate = new Date(Number(timeStartProp));
      if (!isNaN(parsedDate.getTime())) {
        acquisitionDate = parsedDate;
      }
    }
    if (!acquisitionDate) {
      const timeToken = tokens[4];
      if (timeToken && timeToken.length >= 15 && timeToken.includes('T')) {
        const yr = timeToken.slice(0, 4);
        const mo = timeToken.slice(4, 6);
        const da = timeToken.slice(6, 8);
        const hr = timeToken.slice(9, 11);
        const mi = timeToken.slice(11, 13);
        const se = timeToken.slice(13, 15);
        const parsed = new Date(`${yr}-${mo}-${da}T${hr}:${mi}:${se}.000Z`);
        if (!isNaN(parsed.getTime())) {
          acquisitionDate = parsed;
        }
      }
    }

    return {
      platform,
      mission,
      instrument: 'C-SAR',
      productType,
      mode,
      polarizations,
      orbitDirection,
      absoluteOrbitNumber,
      relativeOrbitNumber,
      acquisitionDate,
    };
  }

  /**
   * Evaluates compatibility between an active SAR baseline and a current observation candidate.
   * Centralized policy requiring:
   *   1. Same compatible Sentinel-1 acquisition mode (e.g. IW)
   *   2. Same required polarization set (e.g. VV+VH)
   *   3. Same orbit direction (ASCENDING vs DESCENDING)
   *   4. SAME RELATIVE ORBIT (repeat-pass track)
   */
  public static evaluateSarCompatibility(
    baseline: SarObservationGeometry,
    candidate: SarObservationGeometry,
  ): SarCompatibilityResult {
    // Resolve baseline metadata attributes (from explicit fields or imageId)
    const baseParsed = baseline.imageId
      ? this.parseSentinel1Metadata(baseline.imageId)
      : undefined;
    const baseRelOrbit = baseline.relativeOrbitNumber ?? baseParsed?.relativeOrbitNumber;
    const baseOrbitDir = (baseline.orbitDirection ?? baseParsed?.orbitDirection ?? 'DESCENDING').toUpperCase();
    const baseMode = (baseline.mode ?? baseParsed?.mode ?? 'IW').toUpperCase();
    const basePols = baseline.polarizations ?? baseParsed?.polarizations ?? ['VV', 'VH'];
    const basePlatform = baseline.platform ?? baseParsed?.platform ?? 'Sentinel-1';

    // Resolve candidate metadata attributes
    const candParsed = candidate.imageId
      ? this.parseSentinel1Metadata(candidate.imageId)
      : undefined;
    const candRelOrbit = candidate.relativeOrbitNumber ?? candParsed?.relativeOrbitNumber;
    const candOrbitDir = (candidate.orbitDirection ?? candParsed?.orbitDirection ?? 'DESCENDING').toUpperCase();
    const candMode = (candidate.mode ?? candParsed?.mode ?? 'IW').toUpperCase();
    const candPols = candidate.polarizations ?? candParsed?.polarizations ?? ['VV', 'VH'];
    const candPlatform = candidate.platform ?? candParsed?.platform ?? 'Sentinel-1';

    const details = {
      baselineRelativeOrbit: baseRelOrbit,
      candidateRelativeOrbit: candRelOrbit,
      baselineOrbitDirection: baseOrbitDir,
      candidateOrbitDirection: candOrbitDir,
      baselineMode: baseMode,
      candidateMode: candMode,
      baselinePolarizations: basePols,
      candidatePolarizations: candPols,
      baselinePlatform: basePlatform,
      candidatePlatform: candPlatform,
    };

    // 1. Mode Compatibility (e.g. IW vs EW / SM)
    if (baseMode !== candMode) {
      return {
        isCompatible: false,
        rejectionCode: RejectionReasonCode.SAR_ACQUISITION_MODE_MISMATCH,
        reason: `SAR acquisition mode mismatch: Baseline is ${baseMode}, candidate is ${candMode}. Both must be ${baseMode}.`,
        details,
      };
    }

    // 2. Polarization Compatibility (e.g. VV+VH required)
    const hasRequiredPols = basePols.every((p) => candPols.includes(p));
    if (!hasRequiredPols) {
      return {
        isCompatible: false,
        rejectionCode: RejectionReasonCode.SAR_POLARIZATION_MISMATCH,
        reason: `SAR polarization mismatch: Baseline requires [${basePols.join(', ')}], but candidate has [${candPols.join(', ')}].`,
        details,
      };
    }

    // 3. Orbit Direction Compatibility (ASCENDING vs DESCENDING)
    if (baseOrbitDir !== candOrbitDir) {
      return {
        isCompatible: false,
        rejectionCode: RejectionReasonCode.SAR_ORBIT_DIRECTION_MISMATCH,
        reason: `SAR orbit direction mismatch: Baseline is ${baseOrbitDir}, candidate is ${candOrbitDir}. Geometric look angles are inverted.`,
        details,
      };
    }

    // 4. Relative Orbit Number (Repeat-pass Track) Match — FIRST-CLASS CONSTRAINT
    if (baseRelOrbit !== undefined && candRelOrbit !== undefined && baseRelOrbit !== candRelOrbit) {
      return {
        isCompatible: false,
        rejectionCode: RejectionReasonCode.SAR_RELATIVE_ORBIT_MISMATCH,
        reason: `SAR relative orbit mismatch: Baseline is Track ${baseRelOrbit}, but candidate is Track ${candRelOrbit}. Observations from different repeat-pass tracks exhibit different incidence angle ranges and cannot be directly differenced.`,
        details,
      };
    }

    // All compatibility gates passed
    return {
      isCompatible: true,
      details,
    };
  }
}
