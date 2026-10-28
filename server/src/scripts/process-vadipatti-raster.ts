import path from 'path';
import { GeoTiffService } from '../services/raster/GeoTiffService.js';

async function processRaster() {
  const filePath = path.resolve('storage/raster_temp/6aa6798c2b4fe5808c7e9038/ZONE-260913-7787_6aa6798c2b4fe5808c7e9038_CURRENT_Sentinel2_20260909.tif');
  console.log(`Processing GeoTIFF: ${filePath}`);

  const parsed = await GeoTiffService.readGeoTiff(filePath);
  console.log('Metadata:');
  console.log('  Width:             ', parsed.metadata.width);
  console.log('  Height:            ', parsed.metadata.height);
  console.log('  Bands:             ', parsed.metadata.numBands);
  console.log('  Pixel Scale:       ', parsed.metadata.pixelScale);
  console.log('  Original CRS:      ', parsed.metadata.originalCrs);
  console.log('  Normalized CRS:    ', parsed.metadata.normalizedCrs);
  console.log('  Pixel Area (m2):   ', parsed.metadata.pixelAreaM2);

  const indices = GeoTiffService.calculateSpectralIndices(parsed, { satellite: 'Sentinel-2' });
  console.log('\nCalculated Spectral Indices:');
  console.log('  Mean NDVI:         ', indices.ndvi);
  console.log('  Mean NDWI:         ', indices.ndwi);
  console.log('  Mean NDBI:         ', indices.ndbi);
  console.log('  Valid Pixel Count: ', indices.pixelCount);
}

processRaster().catch(console.error);
