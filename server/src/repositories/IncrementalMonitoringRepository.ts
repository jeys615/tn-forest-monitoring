import {
  IncrementalMonitoringRecordModel,
  type IIncrementalMonitoringRecord,
} from '../models/IncrementalMonitoringRecord.js';
import {
  IncrementalLifecycleState,
  type AreaMonitoringType,
  type SensorType,
} from '@tn-forest/shared/types';

export interface IncrementalJobFilters {
  areaId?: string;
  areaType?: AreaMonitoringType;
  lifecycleState?: IncrementalLifecycleState | { $in: IncrementalLifecycleState[] };
  sensorType?: SensorType;
  limit?: number;
  skip?: number;
}

export class IncrementalMonitoringRepository {
  async create(data: Partial<IIncrementalMonitoringRecord>): Promise<IIncrementalMonitoringRecord> {
    return await IncrementalMonitoringRecordModel.create(data);
  }

  async findById(id: string): Promise<IIncrementalMonitoringRecord | null> {
    return await IncrementalMonitoringRecordModel.findById(id);
  }

  async findByJobId(jobId: string): Promise<IIncrementalMonitoringRecord | null> {
    return await IncrementalMonitoringRecordModel.findOne({ jobId });
  }

  async findByAreaAndObservation(
    areaId: string,
    targetObservationId: string,
  ): Promise<IIncrementalMonitoringRecord | null> {
    return await IncrementalMonitoringRecordModel.findOne({
      areaId,
      targetObservationId,
    });
  }

  async findAll(filters: IncrementalJobFilters = {}): Promise<IIncrementalMonitoringRecord[]> {
    const query: Record<string, unknown> = {};

    if (filters.areaId) query.areaId = filters.areaId;
    if (filters.areaType) query.areaType = filters.areaType;
    if (filters.lifecycleState) query.lifecycleState = filters.lifecycleState;
    if (filters.sensorType) query.sensorType = filters.sensorType;

    const limit = filters.limit || 50;
    const skip = filters.skip || 0;

    return await IncrementalMonitoringRecordModel.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
  }

  async count(filters: IncrementalJobFilters = {}): Promise<number> {
    const query: Record<string, unknown> = {};

    if (filters.areaId) query.areaId = filters.areaId;
    if (filters.areaType) query.areaType = filters.areaType;
    if (filters.lifecycleState) query.lifecycleState = filters.lifecycleState;
    if (filters.sensorType) query.sensorType = filters.sensorType;

    return await IncrementalMonitoringRecordModel.countDocuments(query);
  }

  async findLatestCompletedForArea(
    areaId: string,
    sensorType?: SensorType,
  ): Promise<IIncrementalMonitoringRecord | null> {
    const query: Record<string, unknown> = {
      areaId,
      lifecycleState: IncrementalLifecycleState.COMPLETED,
    };
    if (sensorType) {
      query.sensorType = sensorType;
    }
    return await IncrementalMonitoringRecordModel.findOne(query).sort({
      acquisitionDate: -1,
      createdAt: -1,
    });
  }

  async updateState(
    id: string,
    state: IncrementalLifecycleState,
    logMessage?: string,
    extraUpdates?: Partial<IIncrementalMonitoringRecord>,
  ): Promise<IIncrementalMonitoringRecord | null> {
    const update: Record<string, unknown> = {
      lifecycleState: state,
      ...extraUpdates,
    };

    const updateQuery: Record<string, unknown> = { $set: update };
    if (logMessage) {
      updateQuery.$push = { logs: `[${new Date().toISOString()}] ${logMessage}` };
    }

    return await IncrementalMonitoringRecordModel.findByIdAndUpdate(id, updateQuery, {
      new: true,
    });
  }

  /**
   * Atomically acquires processing lock for an observation under an area.
   * If record does not exist, creates it in QUEUED state.
   * If record exists in DISCOVERED, FAILED, or RETRY_PENDING, locks it into QUEUED state.
   * If already actively processing or completed, returns the existing record without mutating.
   */
  async acquireJobLock(
    areaId: string,
    targetObservationId: string,
    initialData: Partial<IIncrementalMonitoringRecord>,
  ): Promise<{ record: IIncrementalMonitoringRecord; isLockedByUs: boolean }> {
    const existing = await this.findByAreaAndObservation(areaId, targetObservationId);

    if (existing) {
      // If already successfully completed or actively undergoing processing by another worker
      if (
        existing.lifecycleState === IncrementalLifecycleState.COMPLETED ||
        existing.lifecycleState === IncrementalLifecycleState.QUEUED ||
        existing.lifecycleState === IncrementalLifecycleState.ACQUIRING ||
        existing.lifecycleState === IncrementalLifecycleState.REDUCING ||
        existing.lifecycleState === IncrementalLifecycleState.PROCESSING ||
        existing.lifecycleState === IncrementalLifecycleState.CHANGE_ANALYSIS ||
        existing.lifecycleState === IncrementalLifecycleState.ALERT_EVALUATION
      ) {
        return { record: existing, isLockedByUs: false };
      }

      // If FAILED or RETRY_PENDING or DISCOVERED, atomically acquire lock
      const locked = await IncrementalMonitoringRecordModel.findOneAndUpdate(
        {
          _id: existing._id,
          lifecycleState: {
            $in: [
              IncrementalLifecycleState.DISCOVERED,
              IncrementalLifecycleState.FAILED,
              IncrementalLifecycleState.RETRY_PENDING,
            ],
          },
        },
        {
          $set: {
            lifecycleState: IncrementalLifecycleState.QUEUED,
            startedAt: new Date(),
          },
          $push: {
            logs: `[${new Date().toISOString()}] Acquired atomic execution lock. State set to QUEUED.`,
          },
        },
        { new: true },
      );

      if (locked) {
        return { record: locked, isLockedByUs: true };
      } else {
        // Lost race to another concurrent worker
        const current = (await this.findById(existing._id.toString()))!;
        return { record: current, isLockedByUs: false };
      }
    }

    // New observation: atomically create in QUEUED state
    try {
      const created = await this.create({
        ...initialData,
        areaId,
        targetObservationId,
        lifecycleState: IncrementalLifecycleState.QUEUED,
        startedAt: new Date(),
        logs: [
          `[${new Date().toISOString()}] Initialized and acquired atomic execution lock in QUEUED state.`,
        ],
      });
      return { record: created, isLockedByUs: true };
    } catch (err: unknown) {
      // In case of unique index race condition
      const current = await this.findByAreaAndObservation(areaId, targetObservationId);
      if (current) {
        return { record: current, isLockedByUs: false };
      }
      throw err;
    }
  }

  /**
   * Discovers jobs stuck in active states older than staleThresholdDate.
   */
  async findStaleJobs(staleThresholdDate: Date): Promise<IIncrementalMonitoringRecord[]> {
    return await IncrementalMonitoringRecordModel.find({
      lifecycleState: {
        $in: [
          IncrementalLifecycleState.QUEUED,
          IncrementalLifecycleState.ACQUIRING,
          IncrementalLifecycleState.REDUCING,
          IncrementalLifecycleState.PROCESSING,
          IncrementalLifecycleState.CHANGE_ANALYSIS,
          IncrementalLifecycleState.ALERT_EVALUATION,
        ],
      },
      updatedAt: { $lt: staleThresholdDate },
    }).exec();
  }

  /**
   * Discovers jobs scheduled for retry whose nextRetryAt is <= nowDate.
   */
  async findRetryPendingJobs(nowDate: Date = new Date()): Promise<IIncrementalMonitoringRecord[]> {
    return await IncrementalMonitoringRecordModel.find({
      lifecycleState: IncrementalLifecycleState.RETRY_PENDING,
      $or: [
        { nextRetryAt: { $lte: nowDate } },
        { nextRetryAt: { $exists: false } },
        { nextRetryAt: null },
      ],
    }).exec();
  }

  async countStaleJobs(staleThresholdDate: Date): Promise<number> {
    return await IncrementalMonitoringRecordModel.countDocuments({
      lifecycleState: {
        $in: [
          IncrementalLifecycleState.QUEUED,
          IncrementalLifecycleState.ACQUIRING,
          IncrementalLifecycleState.REDUCING,
          IncrementalLifecycleState.PROCESSING,
          IncrementalLifecycleState.CHANGE_ANALYSIS,
          IncrementalLifecycleState.ALERT_EVALUATION,
        ],
      },
      updatedAt: { $lt: staleThresholdDate },
    });
  }
}

