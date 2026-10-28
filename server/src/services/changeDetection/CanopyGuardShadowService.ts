/**
 * Phase 5B: Canopy Guard Shadow Service
 *
 * Implements Algorithm v2.1-SHADOW:
 * Non-intrusive evaluation of the decoupled baseline canopy guard.
 *
 * Safeguards:
 * 1. Zero database writes or schema mutations.
 * 2. Algorithm v2.0 remains the sole official production authority.
 * 3. Enforces SCL validity gate prior to canopy screening:
 *    Invalid classes {0, 1, 3, 8, 9, 10, 11} strictly route to UNCERTAIN.
 * 4. PRE_SCREENED_NON_FOREST introduced in shadow telemetry only.
 * 5. Empirically testable rollback via CANOPY_GUARD_MODE flag.
 */

export type CanopyGuardMode = 'OFF' | 'SHADOW' | 'ACTIVE';

export enum Sen2CorSclClass {
  NO_DATA = 0,
  SATURATED_OR_DEFECTIVE = 1,
  DARK_AREA_PIXELS = 2,
  CLOUD_SHADOWS = 3,
  VEGETATION = 4,
  NOT_VEGETATED = 5,
  WATER = 6,
  UNCLASSIFIED = 7,
  CLOUD_MEDIUM_PROBABILITY = 8,
  CLOUD_HIGH_PROBABILITY = 9,
  THIN_CIRRUS = 10,
  SNOW = 11,
}

export interface CanopyEvaluationResult {
  isValidObservation: boolean;
  isCanopy: boolean;
  shadowCategory: 'CANOPY_EVALUATED' | 'PRE_SCREENED_NON_FOREST' | 'UNCERTAIN_OBSCURED';
  reason: string;
  sclClass: number;
  ndviBase: number;
}

export interface ShadowAccountingModel {
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

export class CanopyGuardShadowService {
  private static mode: CanopyGuardMode = 'SHADOW';

  /**
   * Configure the operational mode of the canopy guard.
   * Defaults to 'SHADOW'.
   * Safely validates input: invalid values fail safe to 'SHADOW'.
   */
  public static setMode(newMode: CanopyGuardMode | string): void {
    if (newMode === 'OFF' || newMode === 'SHADOW' || newMode === 'ACTIVE') {
      this.mode = newMode;
    } else {
      console.warn(`[CanopyGuard] Invalid mode '${newMode}' supplied to setMode. Defaulting safely to 'SHADOW'.`);
      this.mode = 'SHADOW';
    }
  }

  public static getMode(): CanopyGuardMode {
    return this.mode;
  }

  /**
   * Initializes the Canopy Guard operational mode from validated environment config.
   */
  public static initializeFromEnv(configMode?: CanopyGuardMode | string): void {
    const targetMode = configMode || 'SHADOW';
    this.setMode(targetMode);
    console.info(`[CanopyGuard] Initialized operational mode: ${this.mode}`);
  }

  /**
   * Check whether a Sen2Cor SCL class represents a valid, unmasked surface observation.
   * Valid classes: 2 (Dark area / topo shadow), 4 (Vegetation), 5 (Bare soil), 6 (Water), 7 (Unclassified).
   * Invalid / obscured classes: 0 (No data), 1 (Defective), 3 (Cloud shadow), 8, 9 (Cloud), 10 (Cirrus), 11 (Snow).
   */
  public static isValidObservation(scl: number): boolean {
    return scl === 2 || scl === 4 || scl === 5 || scl === 6 || scl === 7;
  }

  /**
   * Evaluates a single pixel against the SCL Validity Gate and the Decoupled Canopy Guard.
   *
   * Cardinal Precedence Rule:
   * 1. SCL Validity checked first. If invalid/obscured/missing -> UNCERTAIN_OBSCURED.
   * 2. If valid, evaluate decoupled canopy guard:
   *    (NDVI_base >= 0.40) || (SCL_base == 4 && NDVI_base >= 0.30)
   * 3. If valid observation but not canopy -> PRE_SCREENED_NON_FOREST.
   */
  public static evaluatePixel(
    ndviBase: number,
    sclBase: number | undefined,
    modeOverride?: CanopyGuardMode,
  ): CanopyEvaluationResult {
    const activeMode = modeOverride || this.mode;

    // When mode is OFF, guard is bypassed completely
    if (activeMode === 'OFF') {
      return {
        isValidObservation: true,
        isCanopy: true,
        shadowCategory: 'CANOPY_EVALUATED',
        reason: 'GUARD_BYPASSED_MODE_OFF',
        sclClass: sclBase ?? -1,
        ndviBase,
      };
    }

    // Step 0: Missing or NaN SCL handling
    // Obscured/malformed observations must remain uncertain, never pre-screened non-forest,
    // and never silently classified as valid canopy.
    if (sclBase === undefined || isNaN(sclBase) || sclBase < 0) {
      return {
        isValidObservation: false,
        isCanopy: false,
        shadowCategory: 'UNCERTAIN_OBSCURED',
        reason: 'MALFORMED_OR_MISSING_SCL',
        sclClass: -1,
        ndviBase,
      };
    }

    // Step 1: Observation Validity Gate
    if (!this.isValidObservation(sclBase)) {
      return {
        isValidObservation: false,
        isCanopy: false,
        shadowCategory: 'UNCERTAIN_OBSCURED',
        reason: `OBSCURED_OBSERVATION_SCL_${sclBase}`,
        sclClass: sclBase,
        ndviBase,
      };
    }

    // Step 2: Decoupled Canopy Guard (Clear observations only)
    const isHighCanopy = ndviBase >= 0.40;
    const isOpenScrubCanopy = sclBase === Sen2CorSclClass.VEGETATION && ndviBase >= 0.30;
    const isCanopy = isHighCanopy || isOpenScrubCanopy;

    if (isCanopy) {
      const reason = isHighCanopy
        ? `HIGH_CANOPY_VEGETATION (NDVI=${ndviBase.toFixed(4)} >= 0.40, SCL=${sclBase})`
        : `OPEN_SCRUB_CANOPY (SCL=4, NDVI=${ndviBase.toFixed(4)} >= 0.30)`;

      return {
        isValidObservation: true,
        isCanopy: true,
        shadowCategory: 'CANOPY_EVALUATED',
        reason,
        sclClass: sclBase,
        ndviBase,
      };
    }

    // Step 3: Valid Observation but non-forest surface (soil, rock, water, barren fringe)
    return {
      isValidObservation: true,
      isCanopy: false,
      shadowCategory: 'PRE_SCREENED_NON_FOREST',
      reason: `NON_CANOPY_SURFACE (SCL=${sclBase}, NDVI=${ndviBase.toFixed(4)} < ${sclBase === 4 ? 0.30 : 0.40})`,
      sclClass: sclBase,
      ndviBase,
    };
  }

  /**
   * Computes dynamic 4-way spatial accounting and tripartite denominators
   * from raw integer pixel counts.
   */
  public static computeAccountingModel(params: {
    fullCandidatePool: number;
    fullyObservableSubset: number;
    seasonalCount: number;
    persistentCount: number;
    uncertainCount: number;
    preScreenedNonForestCount: number;
  }): ShadowAccountingModel {
    const {
      fullCandidatePool,
      fullyObservableSubset,
      seasonalCount,
      persistentCount,
      uncertainCount,
      preScreenedNonForestCount,
    } = params;

    const partitionSum = seasonalCount + persistentCount + uncertainCount + preScreenedNonForestCount;
    const partitionConservationValid = partitionSum === fullCandidatePool;
    const outcomeDeterminedSubset = seasonalCount + persistentCount;

    const fullPoolHectares = fullCandidatePool * 0.01;
    const seasonalHectares = seasonalCount * 0.01;
    const persistentHectares = persistentCount * 0.01;
    const uncertainHectares = uncertainCount * 0.01;
    const preScreenedHectares = preScreenedNonForestCount * 0.01;

    const candidateReductionRate = fullCandidatePool > 0
      ? ((fullCandidatePool - persistentCount) / fullCandidatePool) * 100
      : 0;

    return {
      fullCandidatePool,
      fullyObservableSubset,
      outcomeDeterminedSubset,
      seasonalCount,
      persistentCount,
      uncertainCount,
      preScreenedNonForestCount,
      seasonalHectares,
      persistentHectares,
      uncertainHectares,
      preScreenedHectares,
      fullPoolHectares,
      candidateReductionRate,
      partitionConservationValid,
      partitionSum,
    };
  }
}
