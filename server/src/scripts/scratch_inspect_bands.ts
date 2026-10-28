import { GeoTiffService } from '../services/raster/GeoTiffService.js';

async function checkBands() {
  const b = await GeoTiffService.readGeoTiff('storage/raster_temp/6acb1b449ee540ec5f705ee2/ZONE-261011-6340_6acb1b449ee540ec5f705ee2_CURRENT_Sentinel2_20200109.tif');
  const c = await GeoTiffService.readGeoTiff('storage/raster_temp/6acb1cad9ee540ec5f705fac/ZONE-261011-6340_6acb1cad9ee540ec5f705fac_CURRENT_Sentinel2_20240207.tif');
  
  console.log('Baseline total bands:', b.bandData.length);
  b.bandData.forEach((band, idx) => {
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < Math.min(100000, band.length); i++) {
      const v = band[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    console.log(`  Base Band ${idx}: sample min=${min}, sample max=${max}`);
  });

  console.log('Current total bands:', c.bandData.length);
  c.bandData.forEach((band, idx) => {
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < Math.min(100000, band.length); i++) {
      const v = band[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    console.log(`  Cur Band ${idx}: sample min=${min}, sample max=${max}`);
  });
}

checkBands().catch(console.error);
