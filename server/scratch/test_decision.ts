import { OpticalComparisonDecisionService } from '../src/services/spatial/OpticalComparisonDecisionService.js';
import { SatelliteSource, SensorType, ComparisonMode } from '@tn-forest/shared/types';

const res = OpticalComparisonDecisionService.decideComparison(
  {
    imageId: 'COPERNICUS/S2_SR/20260115_S2',
    source: SatelliteSource.SENTINEL_2,
    sensorType: SensorType.OPTICAL,
    acquisitionDate: new Date('2026-01-15T00:00:00.000Z'),
    zoneId: '6abc0c9db66bbf781fc2bc92',
  },
  {
    imageId: 'LANDSAT/LC08/C02/T1_L2/20260301_LC08',
    source: SatelliteSource.LANDSAT_8,
    sensorType: SensorType.OPTICAL,
    acquisitionDate: new Date('2026-03-01T00:00:00.000Z'),
    zoneId: '6abc0c9db66bbf781fc2bc92',
  },
);

console.log(JSON.stringify(res, null, 2));
