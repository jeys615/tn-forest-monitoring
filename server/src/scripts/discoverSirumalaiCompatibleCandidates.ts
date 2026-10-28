import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { GeeClientService } from '../services/gee/GeeClientService.js';
import { SarCompatibilityService } from '../services/spatial/SarCompatibilityService.js';
import { SensorType } from '@tn-forest/shared/types';

async function main() {
  console.info('=== SIRUMALAI SAR COMPATIBLE CANDIDATE DISCOVERY ===');
  await mongoose.connect(env.MONGODB_URI);

  // 1. Load Sirumalai zone
  const zone = await Zone.findOne({ $or: [{ zoneId: 'ZONE-260925-8986' }, { name: /sirumalai/i }] });
  if (!zone) {
    console.error('Sirumalai zone not found');
    process.exit(1);
  }
  console.info(`Zone: ${zone.name} (${zone.zoneId})`);

  // 2. Load active SAR baseline
  const baseline = await BaselineModel.findOne({
    zoneId: zone._id,
    sensorType: SensorType.SAR,
    isActive: true,
  });
  if (!baseline) {
    console.error('Active SAR baseline not found');
    process.exit(1);
  }
  const baselineMeta = await SatelliteMetadata.findById(baseline.satelliteMetadataId);
  const baseParsed = SarCompatibilityService.parseSentinel1Metadata(
    baselineMeta?.imageId || baseline.imageId || '',
    baselineMeta?.metadata as Record<string, unknown> | undefined,
  );

  console.info('\n--- BASELINE GEOMETRY ---');
  console.info(`Image ID:       ${baselineMeta?.imageId}`);
  console.info(`Acquisition:    ${baselineMeta?.acquisitionDate.toISOString()}`);
  console.info(`Platform:       ${baseParsed.platform}`);
  console.info(`Mode:           ${baseParsed.mode}`);
  console.info(`Polarization:   ${baseParsed.polarizations.join('+')}`);
  console.info(`Orbit Direction:${baseParsed.orbitDirection}`);
  console.info(`Relative Orbit: Track ${baseParsed.relativeOrbitNumber}`);
  console.info(`Absolute Orbit: ${baseParsed.absoluteOrbitNumber}`);

  // 3. Query GEE for real Sentinel-1 observations over Sirumalai in January/February 2020
  const geeClient = new GeeClientService();
  const startDate = new Date('2020-01-03T00:00:00.000Z');
  const endDate = new Date('2020-02-15T00:00:00.000Z');

  console.info(`\nQuerying GEE COPERNICUS/S1_GRD for date range ${startDate.toISOString().slice(0, 10)} to ${endDate.toISOString().slice(0, 10)}...`);

  const rawImages = await geeClient.querySarCollection({
    collection: 'COPERNICUS/S1_GRD',
    geometry: zone.boundary,
    startDate,
    endDate,
    maxPages: 5,
  });

  console.info(`Discovered ${rawImages.length} raw Sentinel-1 observations in GEE.`);

  console.info('\n--- CANDIDATE COMPATIBILITY EVALUATION ---');
  const compatibleCandidates: any[] = [];
  const incompatibleCandidates: any[] = [];

  for (const raw of rawImages) {
    const candParsed = SarCompatibilityService.parseSentinel1Metadata(raw.id, raw.properties);
    const timeStart = candParsed.acquisitionDate
      ? candParsed.acquisitionDate.toISOString()
      : new Date(Number(raw.properties?.['system:time_start'] || 0)).toISOString();

    const compat = SarCompatibilityService.evaluateSarCompatibility(
      {
        imageId: baselineMeta?.imageId || '',
        relativeOrbitNumber: baseParsed.relativeOrbitNumber,
        orbitDirection: baseParsed.orbitDirection,
        mode: baseParsed.mode,
        polarizations: baseParsed.polarizations,
        platform: baseParsed.platform,
      },
      {
        imageId: raw.id,
        relativeOrbitNumber: candParsed.relativeOrbitNumber,
        orbitDirection: candParsed.orbitDirection,
        mode: candParsed.mode,
        polarizations: candParsed.polarizations,
        platform: candParsed.platform,
      },
    );

    const entry = {
      imageId: raw.id,
      acquisitionDate: timeStart,
      platform: candParsed.platform,
      mode: candParsed.mode,
      polarization: candParsed.polarizations.join('+'),
      orbitDirection: candParsed.orbitDirection,
      relativeOrbit: candParsed.relativeOrbitNumber ? `Track ${candParsed.relativeOrbitNumber}` : 'Unknown',
      relativeOrbitNumber: candParsed.relativeOrbitNumber,
      absoluteOrbit: candParsed.absoluteOrbitNumber,
      isCompatible: compat.isCompatible,
      rejectionCode: compat.rejectionCode,
      reason: compat.reason,
    };

    if (compat.isCompatible) {
      compatibleCandidates.push(entry);
    } else {
      incompatibleCandidates.push(entry);
    }
  }

  console.info(`\nCOMPATIBLE CANDIDATES FOUND: ${compatibleCandidates.length}`);
  for (const c of compatibleCandidates) {
    console.info(`\n  [COMPATIBLE] ${c.imageId}`);
    console.info(`    Acquisition:    ${c.acquisitionDate}`);
    console.info(`    Platform:       ${c.platform}`);
    console.info(`    Relative Orbit: ${c.relativeOrbit} (Baseline: Track ${baseParsed.relativeOrbitNumber})`);
    console.info(`    Direction:      ${c.orbitDirection} (Baseline: ${baseParsed.orbitDirection})`);
    console.info(`    Mode:           ${c.mode} | Polarizations: ${c.polarization}`);
    console.info(`    Result:         ✓ SAME RELATIVE ORBIT & COMPATIBLE GEOMETRY`);
  }

  console.info(`\nINCOMPATIBLE CANDIDATES FOUND: ${incompatibleCandidates.length}`);
  for (const inc of incompatibleCandidates.slice(0, 5)) {
    console.info(`\n  [INCOMPATIBLE] ${inc.imageId}`);
    console.info(`    Acquisition:    ${inc.acquisitionDate}`);
    console.info(`    Relative Orbit: ${inc.relativeOrbit} (Baseline: Track ${baseParsed.relativeOrbitNumber})`);
    console.info(`    Direction:      ${inc.orbitDirection} (Baseline: ${baseParsed.orbitDirection})`);
    console.info(`    Rejection Code: ${inc.rejectionCode}`);
    console.info(`    Reason:         ${inc.reason}`);
  }

  await mongoose.disconnect();
}

main().catch(console.error);
