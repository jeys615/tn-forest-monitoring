import fs from 'fs';
import path from 'path';
import { fromFile } from 'geotiff';

async function inspectLocalRaster() {
  const localDir = path.resolve('storage/raster_temp/6aa6798c2b4fe5808c7e9038');
  console.log('Inspecting local directory:', localDir);
  if (!fs.existsSync(localDir)) {
    console.error('Directory does not exist!');
    return;
  }

  const files = fs.readdirSync(localDir);
  console.log('Files in directory:', files);

  const tifName = files.find((f) => f.endsWith('.tif'));
  if (!tifName) {
    console.log('No .tif file found');
    return;
  }

  const tifPath = path.join(localDir, tifName);
  const stats = fs.statSync(tifPath);
  console.log(`\nLocal GeoTIFF: ${tifPath}`);
  console.log(`File size: ${stats.size} bytes (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`);

  try {
    const tiff = await fromFile(tifPath);
    const image = await tiff.getImage();
    const width = image.getWidth();
    const height = image.getHeight();
    const bandCount = image.getSamplesPerPixel();
    const origin = image.getOrigin();
    const resolution = image.getResolution();
    const geoKeys = image.getGeoKeys();

    console.log('\nGeoTIFF Validation:');
    console.log(`  Width:              ${width} px`);
    console.log(`  Height:             ${height} px`);
    console.log(`  Band count:         ${bandCount}`);
    console.log(`  Origin:            `, origin);
    console.log(`  Resolution:        `, resolution);
    console.log(`  GeoKeys ProjectedCRS:`, geoKeys?.ProjectedCSTypeGeoKey);
    console.log(`  GeoKeys GeographicCRS:`, geoKeys?.GeographicTypeGeoKey);
  } catch (err: any) {
    console.error('GeoTIFF reading error:', err.message);
  }
}

inspectLocalRaster().catch(console.error);
