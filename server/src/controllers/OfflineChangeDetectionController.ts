import type { Request, Response, NextFunction } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import * as GeoTIFF from 'geotiff';
import { HTTP_STATUS } from '../constants/index.js';
import { AppError } from '../utils/AppError.js';
import { OfflineChangeDetectionService } from '../services/offline/OfflineChangeDetectionService.js';
import type { OfflineChangeDetectionParams } from '@tn-forest/shared/types';

const MAX_UPLOAD_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB maximum limit

/**
 * Validates classic and BigTIFF magic byte headers.
 */
function isValidTiffHeader(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(4);
    const bytesRead = fs.readSync(fd, buffer, 0, 4, 0);
    fs.closeSync(fd);
    if (bytesRead < 4) return false;

    // Classic TIFF little-endian (II 42)
    if (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2A && buffer[3] === 0x00) return true;
    // Classic TIFF big-endian (MM 42)
    if (buffer[0] === 0x4D && buffer[1] === 0x4D && buffer[2] === 0x00 && buffer[3] === 0x2A) return true;
    // BigTIFF little-endian (II 43)
    if (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2B && buffer[3] === 0x00) return true;
    // BigTIFF big-endian (MM 43)
    if (buffer[0] === 0x4D && buffer[1] === 0x4D && buffer[2] === 0x00 && buffer[3] === 0x2B) return true;

    return false;
  } catch {
    return false;
  }
}

export class OfflineChangeDetectionController {
  /**
   * Lists authentic local satellite GeoTIFF rasters available on disk.
   */
  public getLocalCatalog = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rasters = OfflineChangeDetectionService.listAvailableLocalRasters();
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Available local satellite rasters retrieved',
        data: rasters,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Handles local direct file upload supporting both multipart/form-data and octet-stream.
   * Performs file size enforcement, stream piping, and GeoTIFF integrity validation.
   */
  public uploadRaster = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    let targetPath: string | null = null;
    try {
      const targetDir = OfflineChangeDetectionService.getUploadsDir();
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const contentType = req.headers['content-type'] || '';
      let originalFilename = '';

      if (contentType.includes('multipart/form-data')) {
        // Native Web Request and FormData parsing via modern Node Web APIs
        const fullUrl = `http://${req.headers.host || 'localhost'}${req.url}`;
        const webStream = Readable.toWeb(req) as unknown as BodyInit;
        const webReq = new Request(fullUrl, {
          method: req.method,
          headers: req.headers as HeadersInit,
          body: webStream,
          duplex: 'half',
        } as RequestInit);

        const formData = await webReq.formData();
        let fileEntry: File | null = null;
        for (const [, value] of formData.entries()) {
          if (value && typeof value === 'object' && 'arrayBuffer' in value && typeof (value as File).name === 'string') {
            fileEntry = value as File;
            break;
          }
        }

        if (!fileEntry) {
          throw new AppError('No file provided in multipart/form-data request.', HTTP_STATUS.BAD_REQUEST);
        }

        if (fileEntry.size === 0) {
          throw new AppError('Uploaded file is empty (0 bytes).', HTTP_STATUS.BAD_REQUEST);
        }

        if (fileEntry.size > MAX_UPLOAD_SIZE_BYTES) {
          throw new AppError(
            `File size (${(fileEntry.size / 1024 / 1024).toFixed(1)} MB) exceeds maximum allowed limit of 200 MB.`,
            HTTP_STATUS.PAYLOAD_TOO_LARGE,
          );
        }

        originalFilename = fileEntry.name || (req.query.filename as string) || `upload_${Date.now()}.tif`;
        const sanitizedName = originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
        targetPath = path.join(targetDir, sanitizedName);

        const nodeStream = Readable.fromWeb(fileEntry.stream() as any);
        const writeStream = fs.createWriteStream(targetPath);
        await new Promise<void>((resolve, reject) => {
          nodeStream.pipe(writeStream).on('finish', () => resolve()).on('error', reject);
        });
      } else {
        // Direct octet-stream / binary upload fallback
        const contentLength = req.headers['content-length'];
        if (contentLength && parseInt(contentLength, 10) > MAX_UPLOAD_SIZE_BYTES) {
          throw new AppError(
            `File size (${(parseInt(contentLength, 10) / 1024 / 1024).toFixed(1)} MB) exceeds maximum allowed limit of 200 MB.`,
            HTTP_STATUS.PAYLOAD_TOO_LARGE,
          );
        }

        originalFilename = (req.query.filename as string) || `upload_${Date.now()}.tif`;
        const sanitizedName = originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
        targetPath = path.join(targetDir, sanitizedName);

        const writeStream = fs.createWriteStream(targetPath);
        let bytesWritten = 0;
        let limitExceeded = false;

        await new Promise<void>((resolve, reject) => {
          req.on('data', (chunk: Buffer) => {
            bytesWritten += chunk.length;
            if (bytesWritten > MAX_UPLOAD_SIZE_BYTES) {
              limitExceeded = true;
              req.destroy();
              writeStream.destroy();
              reject(new AppError('File size exceeds maximum allowed limit of 200 MB.', HTTP_STATUS.PAYLOAD_TOO_LARGE));
            }
          });

          req.pipe(writeStream);
          writeStream.on('finish', () => {
            if (!limitExceeded) resolve();
          });
          writeStream.on('error', reject);
        });

        if (bytesWritten === 0) {
          throw new AppError('Uploaded file is empty (0 bytes).', HTTP_STATUS.BAD_REQUEST);
        }
      }

      // Verify file was written and is non-empty
      const stat = fs.statSync(targetPath);
      if (stat.size === 0) {
        throw new AppError('Uploaded file is empty (0 bytes).', HTTP_STATUS.BAD_REQUEST);
      }

      // Check TIFF magic byte header
      if (!isValidTiffHeader(targetPath)) {
        throw new AppError(
          'Uploaded file is not a valid GeoTIFF raster (.tif / .tiff). TIFF magic byte header is missing or corrupted.',
          HTTP_STATUS.BAD_REQUEST,
        );
      }

      // Validate GeoTIFF structure by reading metadata
      try {
        const tiff = await GeoTIFF.fromFile(targetPath);
        const image = await tiff.getImage(0);
        const width = image.getWidth();
        const height = image.getHeight();
        if (!width || !height || width <= 0 || height <= 0) {
          throw new Error(`Invalid dimensions: ${width}x${height}`);
        }
      } catch (tiffErr: unknown) {
        const msg = tiffErr instanceof Error ? tiffErr.message : String(tiffErr);
        throw new AppError(`Uploaded file is not a readable GeoTIFF raster: ${msg}`, HTTP_STATUS.BAD_REQUEST);
      }

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        message: 'Satellite raster uploaded and verified successfully',
        data: {
          filename: path.basename(targetPath),
          filePath: targetPath,
          relativePath: path.relative(process.cwd(), targetPath),
          sizeBytes: stat.size,
        },
      });
    } catch (error) {
      if (targetPath && fs.existsSync(targetPath)) {
        try {
          fs.unlinkSync(targetPath);
        } catch {
          // Ignore cleanup errors
        }
      }
      next(error);
    }
  };

  /**
   * Inspects a local GeoTIFF file, extracting metadata and base64 preview thumbnail.
   */
  public inspectRaster = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { filePath } = req.body;
      if (!filePath || typeof filePath !== 'string') {
        throw new AppError('Field "filePath" is required', HTTP_STATUS.BAD_REQUEST);
      }

      const meta = await OfflineChangeDetectionService.inspectRaster(filePath);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Satellite raster metadata inspected successfully',
        data: meta,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Executes offline change detection between baseline and observation rasters.
   */
  public executeChangeDetection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const params = req.body as OfflineChangeDetectionParams;
      if (!params.baselinePath || !params.observationPath) {
        throw new AppError('Both "baselinePath" and "observationPath" are required', HTTP_STATUS.BAD_REQUEST);
      }

      const result = await OfflineChangeDetectionService.executeChangeDetection(params);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Offline satellite change detection completed successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Retrieves status and results of a previously executed offline job.
   */
  public getJobResult = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const jobId = String(req.params.jobId || '');
      const jobDir = path.join(OfflineChangeDetectionService.getJobsDir(), jobId);
      const metaPath = path.join(jobDir, 'change_metadata.json');

      if (!fs.existsSync(metaPath)) {
        throw new AppError(`Job not found: ${jobId}`, HTTP_STATUS.NOT_FOUND);
      }

      const data = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Offline change detection result retrieved',
        data,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Streams a generated artifact (GeoTIFF, PNG, CSV, JSON, Markdown).
   */
  public downloadArtifact = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const jobId = String(req.params.jobId || '');
      const artifactName = String(req.params.artifactName || '');
      const jobDir = path.join(OfflineChangeDetectionService.getJobsDir(), jobId);
      const filePath = path.join(jobDir, path.basename(artifactName));

      if (!fs.existsSync(filePath)) {
        throw new AppError(`Artifact not found: ${artifactName}`, HTTP_STATUS.NOT_FOUND);
      }

      if (artifactName.endsWith('.png')) {
        res.setHeader('Content-Type', 'image/png');
      } else if (artifactName.endsWith('.tif') || artifactName.endsWith('.tiff')) {
        res.setHeader('Content-Type', 'image/tiff');
      } else if (artifactName.endsWith('.csv')) {
        res.setHeader('Content-Type', 'text/csv');
      } else if (artifactName.endsWith('.json')) {
        res.setHeader('Content-Type', 'application/json');
      } else if (artifactName.endsWith('.md')) {
        res.setHeader('Content-Type', 'text/markdown');
      } else {
        res.setHeader('Content-Type', 'application/octet-stream');
      }

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  };
}
