/**
 * Centralized, authoritative M6 pixel and area calculation engine.
 * Ensures consistent mathematical derivation of affected area, pixel accounting,
 * thresholds, and severity across the entire application without arbitrary rounding.
 */

export interface M6CalculationInput {
  changedPixels: number;
  validPixels: number;
  pixelResolutionMeters?: number;
  pixelAreaM2?: number;
  zoneAreaM2?: number;
  operationalThresholdPercentage?: number;
}

export interface M6CalculationResult {
  pixelResolutionMeters: number;
  pixelAreaM2: number;
  changedPixels: number;
  validPixels: number;
  noChangePixels: number;
  affectedAreaM2: number;
  affectedAreaHa: number;
  zoneAreaM2: number;
  zoneAreaHa: number;
  affectedAreaPercentage: number;
  operationalThresholdPercentage: number;
  thresholdCrossed: boolean;
  alertGenerated: boolean;
  severity: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  pixelAccountingValid: boolean;
}

export function calculateM6Metrics(input: M6CalculationInput): M6CalculationResult {
  const pixelResolutionMeters = input.pixelResolutionMeters && input.pixelResolutionMeters > 0 ? input.pixelResolutionMeters : 10;
  const pixelAreaM2 = input.pixelAreaM2 && input.pixelAreaM2 > 0 ? input.pixelAreaM2 : pixelResolutionMeters * pixelResolutionMeters;
  const rawValidPixels = Math.round(input.validPixels || 0);
  const validPixels = Math.max(0, rawValidPixels);
  const changedPixels = validPixels > 0 ? Math.min(validPixels, Math.max(0, Math.round(input.changedPixels || 0))) : 0;
  const noChangePixels = Math.max(0, validPixels - changedPixels);

  const affectedAreaM2 = changedPixels * pixelAreaM2;
  const affectedAreaHa = affectedAreaM2 / 10000.0;

  // Use authoritative zoneAreaM2 if provided and positive, otherwise default to validPixels * pixelAreaM2
  const zoneAreaM2 =
    input.zoneAreaM2 && input.zoneAreaM2 > 0 ? input.zoneAreaM2 : validPixels * pixelAreaM2;
  const zoneAreaHa = zoneAreaM2 / 10000.0;

  // Authoritative affected area percentage: (changedPixels / validPixels) * 100 (never derived from rounded hectares)
  const affectedAreaPercentage = validPixels > 0 ? (changedPixels / validPixels) * 100.0 : 0.0;

  const operationalThresholdPercentage =
    input.operationalThresholdPercentage !== undefined && input.operationalThresholdPercentage > 0
      ? input.operationalThresholdPercentage
      : 2.0;

  const thresholdCrossed = affectedAreaPercentage >= operationalThresholdPercentage;
  const alertGenerated = thresholdCrossed;

  let severity: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' = 'NONE';
  if (thresholdCrossed) {
    if (affectedAreaPercentage >= 10.0) {
      severity = 'HIGH';
    } else if (affectedAreaPercentage >= 5.0) {
      severity = 'MEDIUM';
    } else {
      severity = 'LOW';
    }
  }

  const pixelAccountingValid = validPixels === changedPixels + noChangePixels;

  return {
    pixelResolutionMeters,
    pixelAreaM2,
    changedPixels,
    validPixels,
    noChangePixels,
    affectedAreaM2,
    affectedAreaHa,
    zoneAreaM2,
    zoneAreaHa,
    affectedAreaPercentage,
    operationalThresholdPercentage,
    thresholdCrossed,
    alertGenerated,
    severity,
    pixelAccountingValid,
  };
}
