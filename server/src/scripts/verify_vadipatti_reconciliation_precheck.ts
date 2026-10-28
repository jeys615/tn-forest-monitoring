import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as GeoTIFF from 'geotiff';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import { getGeeConfig } from '../config/gee.js';
import { GoogleDriveService } from '../services/drive/GoogleDriveService.js';
import { GeoTiffService } from '../services/raster/GeoTiffService.js';
import { RasterReaderService } from '../services/raster/RasterReaderService.js';
import { SensorNormalizationService } from '../services/raster/SensorNormalizationService.js';
import { RasterPreprocessingService } from '../services/raster/RasterPreprocessingService.js';
import { PixelAnalysisService } from '../services/raster/PixelAnalysisService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('============================================================');
  console.log('STEP 1: VERIFY GEE OPERATION');
  console.log('============================================================');
  const auth = GeeAuthService.getInstance();
  const config = getGeeConfig();
  const token = await auth.getAccessToken();

  const opName = 'projects/monitoring-system-506515/operations/IOURBULPWG6MD2WKPH6VCLQE';
  const opUrl = `https://earthengine.googleapis.com/v1alpha/${opName}`;
  const opRes = await fetch(opUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Goog-User-Project': config.projectId,
    },
  });

  if (!opRes.ok) {
    throw new Error(`GEE Operation API returned HTTP ${opRes.status} ${opRes.statusText}`);
  }
  const opData = (await opRes.json()) as any;
  console.log('GEE Operation Details:');
  console.log('  Name:       ', opData.name);
  console.log('  Done:       ', opData.done);
  console.log('  Error:      ', opData.error ? JSON.stringify(opData.error) : 'None');
  console.log('  Description:', opData.metadata?.description);
  console.log('  State:      ', opData.metadata?.state);
  console.log('  CreateTime: ', opData.metadata?.createTime);
  console.log('  EndTime:    ', opData.metadata?.endTime);

  if (opData.done !== true || opData.metadata?.state !== 'SUCCEEDED') {
    throw new Error(`GEE operation is not SUCCEEDED. Current state: ${opData.metadata?.state}`);
  }

  console.log('\n============================================================');
  console.log('STEP 2: VERIFY GOOGLE DRIVE FILE');
  console.log('============================================================');
  const driveService = new GoogleDriveService();
  const driveClient = (driveService as any).driveClient;
  const driveFileId = '1-JHsxCLIGmpYdfB1AgvTQtUPcyzMui0B';
  const driveFileRes = await driveClient.files.get({
    fileId: driveFileId,
    fields: 'id, name, size, mimeType, createdTime, modifiedTime, md5Checksum',
  });
  const file = driveFileRes.data;
  console.log('Drive File Details:');
  console.log('  ID:          ', file.id);
  console.log('  Name:        ', file.name);
  console.log('  Size (bytes):', file.size);
  console.log('  MimeType:    ', file.mimeType);
  console.log('  CreatedTime: ', file.createdTime);
  console.log('  MD5:         ', file.md5Checksum);

  if (!file.id || parseInt(file.size || '0', 10) <= 0) {
    throw new Error(`Drive file invalid or size <= 0`);
  }

  console.log('\n============================================================');
  console.log('STEP 3: VERIFY LOCAL RASTER');
  console.log('============================================================');
  const localRasterRel = 'storage/raster_temp/6aa6798c2b4fe5808c7e9038/ZONE-260913-7787_6aa6798c2b4fe5808c7e9038_CURRENT_Sentinel2_20260909.tif';
  const localRasterPath = path.resolve(__dirname, '../../', localRasterRel);
  console.log(`Local Raster Path: ${localRasterPath}`);

  if (!fs.existsSync(localRasterPath)) {
    throw new Error(`Local raster does not exist at ${localRasterPath}`);
  }
  const stat = fs.statSync(localRasterPath);
  console.log(`  File size on disk: ${stat.size} bytes`);

  const tiffBuffer = fs.readFileSync(localRasterPath);
  const arrayBuffer = tiffBuffer.buffer.slice(
    tiffBuffer.byteOffset,
    tiffBuffer.byteOffset + tiffBuffer.byteLength,
  ) as ArrayBuffer;
  const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
  const image = await tiff.getImage();

  const width = image.getWidth();
  const height = image.getHeight();
  const numBands = image.getSamplesPerPixel();
  const sampleFormat = image.getSampleFormat();
  const bitsPerSample = image.getBitsPerSample();
  const nodata = image.getGDALNoData();
  const resolution = image.getResolution();
  const fileDirectory = image.getFileDirectory() as any;

  console.log(`  Width:        ${width} px`);
  console.log(`  Height:       ${height} px`);
  console.log(`  Bands:        ${numBands}`);
  console.log(`  Resolution:   ${JSON.stringify(resolution)}`);
  console.log(`  NoData:       ${nodata}`);

  console.log('\n============================================================');
  console.log('STEP 4: INSPECT THE SIX BANDS');
  console.log('============================================================');
  // Check GDAL metadata or band descriptions if present
  const gdalMetadata = fileDirectory?.GDAL_METADATA;
  console.log('  GDAL Metadata Tag:', gdalMetadata ? 'Present' : 'Not specified');

  const parsed = await GeoTiffService.readGeoTiff(localRasterPath);
  console.log(`  Parsed CRS:          ${parsed.metadata.crs}`);
  console.log(`  Original CRS:        ${parsed.metadata.originalCrs}`);
  console.log(`  Normalized CRS:      ${parsed.metadata.normalizedCrs}`);
  console.log(`  Pixel Area (m2):     ${parsed.metadata.pixelAreaM2}`);

  // Band inspection
  const standardSentinel2Bands = [
    { num: 1, name: 'B2 (Blue)', expectedRange: '0 - 10000 DN', desc: 'Visible Blue ~490nm' },
    { num: 2, name: 'B3 (Green)', expectedRange: '0 - 10000 DN', desc: 'Visible Green ~560nm' },
    { num: 3, name: 'B4 (Red)', expectedRange: '0 - 10000 DN', desc: 'Visible Red ~665nm' },
    { num: 4, name: 'B8 (NIR)', expectedRange: '0 - 10000 DN', desc: 'Near Infrared ~842nm' },
    { num: 5, name: 'B11 (SWIR1)', expectedRange: '0 - 10000 DN', desc: 'Shortwave Infrared 1 ~1610nm' },
    { num: 6, name: 'B12 (SWIR2)', expectedRange: '0 - 10000 DN', desc: 'Shortwave Infrared 2 ~2190nm' },
  ];

  for (let i = 0; i < parsed.bandData.length; i++) {
    const data = parsed.bandData[i];
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let nonZeroCount = 0;
    for (let p = 0; p < data.length; p++) {
      const v = data[p];
      if (!isNaN(v) && v !== nodata) {
        if (v < min) min = v;
        if (v > max) max = v;
        if (v > 0) {
          sum += v;
          nonZeroCount++;
        }
      }
    }
    const mean = nonZeroCount > 0 ? (sum / nonZeroCount).toFixed(2) : '0';
    const info = standardSentinel2Bands[i] || { num: i + 1, name: `Band_${i + 1}`, desc: 'Unknown' };
    console.log(`  Band ${info.num}: ${info.name.padEnd(14)} | Type: Float32 (16-bit source) | Res: 10m | NoData: ${nodata} | Min: ${min} | Max: ${max} | Mean: ${mean}`);
  }

  console.log('\n============================================================');
  console.log('STEP 5 & 6: OPTICAL RASTER VALIDATION & SPECTRAL INDICES');
  console.log('============================================================');
  // 1. GeoTiffService basic indices
  const basicIndices = GeoTiffService.calculateSpectralIndices(parsed, { satellite: 'Sentinel-2' });
  console.log('GeoTiffService Indices:');
  console.log('  NDVI: ', basicIndices.ndvi);
  console.log('  NDWI: ', basicIndices.ndwi);
  console.log('  NDBI: ', basicIndices.ndbi);
  console.log('  Valid Pixels: ', basicIndices.pixelCount);

  // 2. Full Pixel Analysis (PixelAnalysisService)
  const opticalRaster = await RasterReaderService.readOpticalRaster(localRasterPath, 'Sentinel-2');
  const normalized = SensorNormalizationService.normalizeOpticalBands(opticalRaster);
  const preproc = RasterPreprocessingService.generateValidPixelMask(normalized, 19.87);
  const fullSpectral = PixelAnalysisService.calculateSpectralIndices(normalized, preproc.validMask);

  // Let's compute SAVI and EVI and BSI mean
  console.log('\nFull PixelAnalysisService Spectral Indices (Zonal Statistics):');
  console.log('  NDVI Mean: ', fullSpectral.stats.ndviMean);
  console.log('  NDWI Mean: ', fullSpectral.stats.ndwiMean);
  console.log('  NBR Mean:  ', fullSpectral.stats.nbrMean);
  console.log('  BSI Mean:  ', fullSpectral.stats.bsiMean);
  console.log('  SAVI Mean: ', fullSpectral.stats.saviMean);
  console.log('  EVI Mean:  ', fullSpectral.stats.eviMean);
  console.log('  Valid Pixels: ', fullSpectral.stats.validPixelCount);

  // Also calculate NDBI explicitly: (SWIR1 - NIR) / (SWIR1 + NIR)
  // For GeoTIFF: GeoTiffService calculated ndbi as basicIndices.ndbi
  console.log('\nConsolidated 6 Spectral Indices from Exact Raster:');
  console.log(`  NDVI: ${basicIndices.ndvi}`);
  console.log(`  NDWI: ${basicIndices.ndwi}`);
  console.log(`  NDBI: ${basicIndices.ndbi}`);
  console.log(`  BSI:  ${Number(fullSpectral.stats.bsiMean.toFixed(3))}`);
  console.log(`  SAVI: ${Number(fullSpectral.stats.saviMean.toFixed(3))}`);
  console.log(`  EVI:  ${Number(fullSpectral.stats.eviMean.toFixed(3))}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('FAILED:', err);
    process.exit(1);
  });
