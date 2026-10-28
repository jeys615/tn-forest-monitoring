import type { Request, Response, NextFunction } from 'express';
import {
  checkpointService,
  CheckpointService,
} from '../services/CheckpointService.js';
import {
  createCheckpointSchema,
  updateCheckpointSchema,
  verifyEPassSchema,
  recordPassageSchema,
  checkpointLogQuerySchema,
  batchCheckpointSyncSchema,
} from '../validators/checkpoint.validator.js';
import { HTTP_STATUS } from '../constants/index.js';
import {
  CheckpointStatus,
  CheckpointVerificationResult,
  type VerifyEPassRequest,
  type RecordPassageRequest,
} from '@tn-forest/shared/types';

export class CheckpointController {
  constructor(private readonly service: CheckpointService = checkpointService) {}

  createCheckpoint = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validated = createCheckpointSchema.parse(req.body);
      const userId = req.user?.id;
      const created = await this.service.createCheckpoint(validated, userId);

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        message: 'Checkpoint registered successfully',
        data: created,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getAllCheckpoints = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const status = req.query.status as CheckpointStatus | undefined;
      const district = req.query.district as string | undefined;

      const list = await this.service.getCheckpoints({ status, district });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Checkpoints retrieved successfully',
        data: list,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getCheckpointById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const doc = await this.service.getCheckpointById(req.params.id as string);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Checkpoint retrieved successfully',
        data: doc,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  updateCheckpoint = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validated = updateCheckpointSchema.parse(req.body);
      const updated = await this.service.updateCheckpoint(req.params.id as string, validated);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Checkpoint updated successfully',
        data: updated,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  verifyEPass = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validated = verifyEPassSchema.parse(req.body);
      const userId = req.user?.id;
      const verification = await this.service.verifyEPass(validated as VerifyEPassRequest, userId);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message:
          verification.result === CheckpointVerificationResult.VALID
            ? 'E-Pass verified successfully'
            : 'E-Pass verification failed',
        data: verification,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  recordPassage = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validated = recordPassageSchema.parse(req.body);
      const userId = req.user?.id;
      const passage = await this.service.recordPassage(validated as RecordPassageRequest, userId);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: passage.message,
        data: passage,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getLogs = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const query = checkpointLogQuerySchema.parse(req.query);
      const logs = await this.service.getLogs({
        checkpointId: query.checkpointId,
        zoneId: query.zoneId,
        passNumber: query.passNumber,
        verificationResult: query.verificationResult as CheckpointVerificationResult | undefined,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        limit: query.limit,
        longitude: query.longitude,
        latitude: query.latitude,
        maxDistanceMeters: query.maxDistanceMeters,
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Checkpoint logs retrieved successfully',
        data: logs,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getPassVerificationHistory = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const history = await this.service.getPassVerificationHistory(req.params.passNumber as string);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Pass verification history retrieved successfully',
        data: history,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getSummaryStats = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const summary = await this.service.getSummaryStats();
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Checkpoint summary statistics retrieved successfully',
        data: summary,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  syncBatch = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validated = batchCheckpointSyncSchema.parse(req.body);
      const officerId = req.user?.id;
      const result = await this.service.syncBatchPassages(validated, officerId);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: `Batch synchronized: ${result.acceptedCount} accepted, ${result.duplicateCount} duplicates, ${result.rejectedCount} rejected, ${result.failedCount} failed`,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };
}

export const checkpointController = new CheckpointController();
