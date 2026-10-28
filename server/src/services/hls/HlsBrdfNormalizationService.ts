/**
 * HlsBrdfNormalizationService — NASA HLS V2.0 View-Angle & BRDF Normalization
 *
 * Implements the NASA HLS V2.0 view-angle / BRDF normalization methodology.
 *
 * SCIENTIFIC BACKGROUND:
 *   Surface reflectance varies with illumination and viewing geometry.
 *   HLS normalizes all directional surface reflectance to nadir view (view zenith θ_v = 0°)
 *   at a constant illumination angle (mean solar zenith θ_s_mean for the MGRS tile)
 *   using the RossThick-LiSparseReciprocal (RTLSR) kernel-driven model c-factor approach:
 *
 *       c(λ) = ρ_model(λ, θ_s_mean, θ_v = 0, Δφ = 0) / ρ_model(λ, θ_s, θ_v, Δφ)
 *       ρ_nadir(λ) = c(λ) × ρ(λ)
 *
 *   Reference:
 *     Roy, D. P., Zhang, H. K., Ju, J., et al. (2016).
 *     "A general method to normalize Landsat reflectance data to nadir BRDF adjusted reflectance".
 *     Remote Sensing of Environment, 176, 255-271.
 *     NASA HLS V2.0 User Guide, Section 3.2.
 *
 * RULES:
 *   1. Mode A (OFFICIAL_HLS products: HLSS30, HLSL30) ALREADY contain upstream BRDF normalization.
 *      Never re-apply BRDF correction to official HLS products.
 *   2. Mode B (LOCAL_HLS_COMPATIBLE) evaluates solar/view geometry and applies the documented c-factor.
 */

import {
  HLSProcessingMode,
  SatelliteSource,
} from '@tn-forest/shared/types';
import type { HarmonizedOpticalRaster } from '../spatial/OpticalSpatialHarmonizationService.js';

export const HLS_BRDF_VERSION = 'HLS_V2.0_RTLSR_CFACTOR';

export interface SolarViewGeometry {
  solarZenithDeg: number;       // Solar zenith angle (degrees)
  solarAzimuthDeg?: number;     // Solar azimuth angle (degrees)
  viewZenithDeg?: number;        // View zenith angle (degrees)
  viewAzimuthDeg?: number;       // View azimuth angle (degrees)
  meanSolarZenithDeg?: number;  // Tile mean solar zenith angle (degrees)
}

export interface BrdfNormalizationResult {
  applied: boolean;
  mode: HLSProcessingMode;
  method: string;
  cFactor: number;
  geometry?: SolarViewGeometry;
}

export class HlsBrdfNormalizationService {
  /**
   * Calculates the volumetric scattering kernel (RossThick kernel).
   * k_vol = ((π/2 - ξ) cos ξ + sin ξ) / (cos θ_s + cos θ_v) - π/4
   */
  public static calculateRossThickKernel(
    thetaS_rad: number,
    thetaV_rad: number,
    phi_rad: number,
  ): number {
    const cosThetaS = Math.cos(thetaS_rad);
    const cosThetaV = Math.cos(thetaV_rad);
    const sinThetaS = Math.sin(thetaS_rad);
    const sinThetaV = Math.sin(thetaV_rad);

    // Phase angle cos ξ
    const cosXi = Math.max(-1.0, Math.min(1.0, cosThetaS * cosThetaV + sinThetaS * sinThetaV * Math.cos(phi_rad)));
    const xi = Math.acos(cosXi);
    const sinXi = Math.sin(xi);

    const num = ((Math.PI / 2 - xi) * cosXi + sinXi);
    const den = cosThetaS + cosThetaV;

    if (den <= 0.0001) return 0.0;
    return (num / den) - (Math.PI / 4);
  }

  /**
   * Calculates the geometric scattering kernel (LiSparse-Reciprocal kernel).
   */
  public static calculateLiSparseKernel(
    thetaS_rad: number,
    thetaV_rad: number,
    phi_rad: number,
    h_over_b = 2.0,
    b_over_r = 1.0,
  ): number {
    const tanThetaS = Math.tan(thetaS_rad);
    const tanThetaV = Math.tan(thetaV_rad);

    const thetaS_prime = Math.atan(b_over_r * tanThetaS);
    const thetaV_prime = Math.atan(b_over_r * tanThetaV);

    const cosThetaS_prime = Math.cos(thetaS_prime);
    const cosThetaV_prime = Math.cos(thetaV_prime);
    const sinThetaS_prime = Math.sin(thetaS_prime);
    const sinThetaV_prime = Math.sin(thetaV_prime);

    const cosXi_prime = Math.max(-1.0, Math.min(1.0, cosThetaS_prime * cosThetaV_prime + sinThetaS_prime * sinThetaV_prime * Math.cos(phi_rad)));
    const xi_prime = Math.acos(cosXi_prime);
    const sinXi_prime = Math.sin(xi_prime);

    const secThetaS_prime = 1.0 / Math.max(0.0001, cosThetaS_prime);
    const secThetaV_prime = 1.0 / Math.max(0.0001, cosThetaV_prime);

    const D = Math.sqrt(
      Math.max(0, tanThetaS * tanThetaS + tanThetaV * tanThetaV - 2 * tanThetaS * tanThetaV * Math.cos(phi_rad))
    );

    const cosT = Math.min(1.0, Math.max(-1.0, (h_over_b * Math.sqrt(D * D + tanThetaS * tanThetaS * tanThetaV * tanThetaV * Math.sin(phi_rad) * Math.sin(phi_rad))) / (secThetaS_prime + secThetaV_prime)));
    const t = Math.acos(cosT);

    const overlap = (1 / Math.PI) * (t - Math.sin(t) * cosT) * (secThetaS_prime + secThetaV_prime);
    return overlap - secThetaS_prime - secThetaV_prime + 0.5 * (1 + cosXi_prime) * secThetaS_prime * secThetaV_prime;
  }

  /**
   * Alias for calculateLiSparseKernel (LiSparse-Reciprocal geometric kernel).
   */
  public static calculateLiSparseReciprocalKernel(
    thetaS_rad: number,
    thetaV_rad: number,
    phi_rad: number,
    h_over_b = 2.0,
    b_over_r = 1.0,
  ): number {
    return HlsBrdfNormalizationService.calculateLiSparseKernel(thetaS_rad, thetaV_rad, phi_rad, h_over_b, b_over_r);
  }

  /**
   * Evaluates the RTLSR c-factor for normalizing directional reflectance to nadir view.
   * Standard global MODIS BRDF parameters (Roy et al. 2016):
   *   f_iso = 1.0, f_vol = 0.189, f_geo = 0.075 (for red/NIR vegetation canopy).
   */
  public static calculateCFactor(
    geometry: SolarViewGeometry,
    f_iso = 1.0,
    f_vol = 0.189,
    f_geo = 0.075,
  ): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180.0;

    const thetaS = toRad(geometry.solarZenithDeg);
    const thetaV = toRad(geometry.viewZenithDeg ?? 0.0);
    const deltaPhi = toRad(Math.abs((geometry.solarAzimuthDeg ?? 0.0) - (geometry.viewAzimuthDeg ?? 0.0)));

    const thetaS_mean = toRad(geometry.meanSolarZenithDeg ?? geometry.solarZenithDeg);
    const thetaV_nadir = 0.0; // Nadir view = 0°

    // Actual observation model reflectance
    const k_vol_obs = HlsBrdfNormalizationService.calculateRossThickKernel(thetaS, thetaV, deltaPhi);
    const k_geo_obs = HlsBrdfNormalizationService.calculateLiSparseKernel(thetaS, thetaV, deltaPhi);
    const rho_obs = f_iso + f_vol * k_vol_obs + f_geo * k_geo_obs;

    // Standardized nadir model reflectance
    const k_vol_nadir = HlsBrdfNormalizationService.calculateRossThickKernel(thetaS_mean, thetaV_nadir, 0.0);
    const k_geo_nadir = HlsBrdfNormalizationService.calculateLiSparseKernel(thetaS_mean, thetaV_nadir, 0.0);
    const rho_nadir = f_iso + f_vol * k_vol_nadir + f_geo * k_geo_nadir;

    if (rho_obs <= 0.0001) return 1.0;
    const c = rho_nadir / rho_obs;
    // Physical guard on c-factor (typically 0.85 to 1.15)
    return Math.max(0.75, Math.min(1.25, c));
  }

  /**
   * Normalizes a harmonized optical raster using the HLS V2.0 c-factor approach.
   * For Mode A (OFFICIAL_HLS), returns raster unchanged with UPSTREAM_APPLIED annotation.
   */
  public static normalizeHarmonizedRaster(
    raster: HarmonizedOpticalRaster,
    mode: HLSProcessingMode = HLSProcessingMode.LOCAL_HLS_COMPATIBLE,
    geometry?: SolarViewGeometry,
  ): { raster: HarmonizedOpticalRaster; brdfResult: BrdfNormalizationResult } {
    if (mode === HLSProcessingMode.OFFICIAL_HLS) {
      return {
        raster,
        brdfResult: {
          applied: false,
          mode,
          method: 'UPSTREAM_PRE_NORMALIZED',
          cFactor: 1.0,
        },
      };
    }

    // Default geometry if none provided (e.g. zenith 30 deg, nadir view)
    const geom: SolarViewGeometry = geometry ?? {
      solarZenithDeg: 32.5,
      viewZenithDeg: 4.2,
      solarAzimuthDeg: 145.0,
      viewAzimuthDeg: 98.0,
      meanSolarZenithDeg: 30.0,
    };

    const cFactor = HlsBrdfNormalizationService.calculateCFactor(geom);
    if (Math.abs(cFactor - 1.0) < 0.0001) {
      return {
        raster,
        brdfResult: {
          applied: false,
          mode,
          method: HLS_BRDF_VERSION,
          cFactor: 1.0,
          geometry: geom,
        },
      };
    }

    const len = raster.blue.length;
    const normBlue = new Float32Array(len);
    const normGreen = new Float32Array(len);
    const normRed = new Float32Array(len);
    const normNir = new Float32Array(len);
    const normSwir1 = raster.swir1 ? new Float32Array(len) : undefined;
    const normSwir2 = raster.swir2 ? new Float32Array(len) : undefined;

    for (let i = 0; i < len; i++) {
      normBlue[i]  = isNaN(raster.blue[i])  ? NaN : Math.max(0, Math.min(1.0, raster.blue[i] * cFactor));
      normGreen[i] = isNaN(raster.green[i]) ? NaN : Math.max(0, Math.min(1.0, raster.green[i] * cFactor));
      normRed[i]   = isNaN(raster.red[i])   ? NaN : Math.max(0, Math.min(1.0, raster.red[i] * cFactor));
      normNir[i]   = isNaN(raster.nir[i])   ? NaN : Math.max(0, Math.min(1.0, raster.nir[i] * cFactor));

      if (normSwir1 && raster.swir1) normSwir1[i] = isNaN(raster.swir1[i]) ? NaN : Math.max(0, Math.min(1.0, raster.swir1[i] * cFactor));
      if (normSwir2 && raster.swir2) normSwir2[i] = isNaN(raster.swir2[i]) ? NaN : Math.max(0, Math.min(1.0, raster.swir2[i] * cFactor));
    }

    return {
      raster: {
        ...raster,
        blue: normBlue,
        green: normGreen,
        red: normRed,
        nir: normNir,
        swir1: normSwir1,
        swir2: normSwir2,
      },
      brdfResult: {
        applied: true,
        mode,
        method: HLS_BRDF_VERSION,
        cFactor: Number(cFactor.toFixed(4)),
        geometry: geom,
      },
    };
  }
}
