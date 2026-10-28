import { MonitoringJobModel, type IMonitoringJob } from '../models/MonitoringJob.js';
import { MonitoringJobStatus, type MonitoringJobDto } from '@tn-forest/shared/types';
import { Types } from 'mongoose';

export interface MonitoringJobFilters {
  status?: string;
  zoneId?: string;
  type?: string;
  sensorType?: string;
  source?: string;
  startDate?: string | Date;
  endDate?: string | Date;
}

export class MonitoringJobRepository {
  async create(data: Partial<IMonitoringJob>): Promise<IMonitoringJob> {
    const job = new MonitoringJobModel(data);
    return await job.save();
  }

  async findById(id: string): Promise<IMonitoringJob | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return await MonitoringJobModel.findById(id).exec();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async findAll(filters: MonitoringJobFilters = {}): Promise<IMonitoringJob[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query: any = {};
    if (filters.status) query.status = filters.status;
    if (filters.zoneId && Types.ObjectId.isValid(filters.zoneId))
      query.zoneId = new Types.ObjectId(filters.zoneId);
    if (filters.type) query.type = filters.type;
    if (filters.sensorType) query.sensorType = filters.sensorType;
    if (filters.source) query.source = filters.source;
    if (filters.startDate || filters.endDate) {
      query.scheduledAt = {};
      if (filters.startDate) query.scheduledAt.$gte = new Date(filters.startDate);
      if (filters.endDate) query.scheduledAt.$lte = new Date(filters.endDate);
    }

    return await MonitoringJobModel.find(query).sort({ scheduledAt: -1 }).exec();
  }

  async update(id: string, data: Partial<IMonitoringJob>): Promise<IMonitoringJob | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return await MonitoringJobModel.findByIdAndUpdate(id, { $set: data }, { new: true }).exec();
  }

  async findPendingJobsToExecute(currentTime: Date): Promise<IMonitoringJob[]> {
    return await MonitoringJobModel.find({
      status: { $in: ['PENDING', 'FAILED'] },
      scheduledAt: { $lte: currentTime },
      $expr: { $lt: ['$retryCount', '$maxRetries'] },
    })
      .sort({ scheduledAt: 1 })
      .exec();
  }

  async findStaleJobs(staleThresholdDate: Date): Promise<IMonitoringJob[]> {
    const activeStatuses = ['PROCESSING', 'DOWNLOADING', 'ACQUIRING', 'EXPORTING', 'PREPROCESSING'];
    return await MonitoringJobModel.find({
      status: { $in: activeStatuses },
      $or: [
        { heartbeatAt: { $exists: true, $ne: null, $lt: staleThresholdDate } },
        { heartbeatAt: { $in: [null, undefined] }, updatedAt: { $lt: staleThresholdDate } },
      ],
    })
      .sort({ updatedAt: 1 })
      .exec();
  }

  async countByStatus(): Promise<Record<string, number>> {
    const counts = await MonitoringJobModel.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const result: Record<string, number> = {};
    for (const item of counts) {
      if (item._id) {
        result[item._id] = item.count;
      }
    }
    return result;
  }

  async recoverStaleJob(id: string, logMessage: string): Promise<IMonitoringJob | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const activeStatuses = ['PROCESSING', 'DOWNLOADING', 'ACQUIRING', 'EXPORTING', 'PREPROCESSING'];
    return await MonitoringJobModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        status: { $in: activeStatuses },
      },
      {
        $set: {
          status: MonitoringJobStatus.FAILED,
          completedAt: new Date(),
          errorMessage: 'Job execution timed out and was recovered from stale PROCESSING state',
        },
        $push: {
          logs: logMessage,
        },
      },
      { new: true },
    ).exec();
  }

  public mapToDto(job: IMonitoringJob): MonitoringJobDto {
    return {
      id: job._id.toString(),
      jobId: job.jobId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      type: job.type as any,
      zoneId: job.zoneId?.toString(),
      satelliteMetadataId: job.satelliteMetadataId?.toString(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sensorType: job.sensorType as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      source: job.source as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      status: job.status as any,
      retryCount: job.retryCount,
      maxRetries: job.maxRetries,
      logs: job.logs,
      scheduledAt: job.scheduledAt.toISOString(),
      startedAt: job.startedAt?.toISOString(),
      completedAt: job.completedAt?.toISOString(),
      errorMessage: job.errorMessage,
      results: job.results,
      diagnostics: job.diagnostics,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
  }
}
