import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { SatelliteAcquisitionService } from '../services/SatelliteAcquisitionService.js';
import { GeeSatelliteSearchService } from '../services/gee/GeeSatelliteSearchService.js';
import { SensorType } from '@tn-forest/shared/types';

async function main() {
  console.log('============================================================');
  console.log('STEP 13: VERIFY SATELLITE CATALOG & DISCOVERY');
  console.log('============================================================\n');

  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });

  const acquisitionService = new SatelliteAcquisitionService();
  const searchService = new GeeSatelliteSearchService();

  const vadipatti = await Zone.findOne({ zoneId: 'ZONE-260913-7787' }).lean();
  if (!vadipatti) throw new Error('Vadipatti zone not found');

  // 1. Check existing SatelliteMetadata in catalog
  console.log('--- 1. Vadipatti Catalog Query ---');
  const catalogImages = await acquisitionService.getAllImages({
    zoneId: vadipatti._id.toString(),
  });

  console.log(`Found ${catalogImages.length} images in Satellite Catalog for Vadipatti:`);
  let foundTarget = false;
  for (const img of catalogImages) {
    console.log(`  [${img.source}] ID: ${img.id} | Status: ${img.processingStatus} | Date: ${img.acquisitionDate} | ImageId: ${img.imageId}`);
    if (img.id === '6aa6798c2b4fe5808c7e9038') {
      foundTarget = true;
      if (img.processingStatus !== 'PROCESSED') {
        throw new Error(`Target image status is ${img.processingStatus}, expected PROCESSED`);
      }
    }
  }

  if (!foundTarget) {
    throw new Error('Target SatelliteMetadata 6aa6798c2b4fe5808c7e9038 not found in Vadipatti catalog!');
  }
  console.log('\n? Target Sentinel-2 observation 6aa6798c2b4fe5808c7e9038 is properly displayed in Catalog with status PROCESSED.');

  // 2. Verify Landsat-8 and Landsat-9 catalog discovery
  console.log('\n--- 2. Generic Optical Catalog Discovery Check ---');
  console.log('Searching Earth Engine via GeeSatelliteSearchService for Vadipatti boundary...');
  const searchResult = await searchService.searchObservations({
    geometry: {
      type: 'Polygon',
      coordinates: vadipatti.boundary.coordinates as any,
    },
    startDate: new Date('2022-01-01'),
    endDate: new Date('2022-03-31'),
    maxCloudCover: 25,
    preferredSensorType: SensorType.OPTICAL,
    allowSarFallback: false,
  });

  console.log('MultiSatelliteSearchResult Summary:');
  console.log('  Selected Scene: ', searchResult.selectedScene?.satellite, searchResult.selectedScene?.imageId);
  console.log('  Total Searched: ', searchResult.searchSummary.totalSearched);
  console.log('  Optical Found:  ', searchResult.searchSummary.opticalFound);
  console.log('  Candidates:     ', searchResult.candidatesEvaluated.length);

  const evaluatedSatellites = Array.from(new Set(searchResult.candidatesEvaluated.map((c) => c.satellite)));
  console.log('Satellites evaluated in optical search:', evaluatedSatellites);

  await mongoose.disconnect();
  console.log('\nCatalog and discovery verification completed successfully.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('FAILED:', err);
    process.exit(1);
  });
