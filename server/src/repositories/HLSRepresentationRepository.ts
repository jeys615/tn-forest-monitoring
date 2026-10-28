/**
 * HLSRepresentationRepository — Data Access Layer
 *
 * Provides typed persistence and retrieval operations for HLSRepresentation
 * documents.
 *
 * ARCHITECTURAL INVARIANTS:
 *   - HLSRepresentation is an artifact/representation of ONE logical baseline.
 *   - Querying by identity ensures uniqueness across (baselineId, sourceObservationId,
 *     hlsProduct, hlsVersion, processingVersion).
 *   - Never mutates historical baseline documents.
 */

import { Types } from 'mongoose';
import {
  HLSRepresentationModel,
  type IHLSRepresentation,
} from '../models/HLSRepresentation.js';
import {
  HLSProduct,
  HLSVersion,
  HLSRepresentationStatus,
  type HLSRepresentationDto,
} from '@tn-forest/shared/types';

export interface HLSRepresentationFilters {
  baselineId?: string;
  sourceObservationId?: string;
  hlsProduct?: HLSProduct;
  hlsVersion?: HLSVersion;
  status?: HLSRepresentationStatus;
  processingVersion?: string;
}

export class HLSRepresentationRepository {
  /**
   * Persists a new HLSRepresentation document.
   */
  async create(data: Partial<IHLSRepresentation>): Promise<IHLSRepresentation> {
    const doc = new HLSRepresentationModel(data);
    return await doc.save();
  }

  /**
   * Finds an HLSRepresentation document by its MongoDB ObjectId.
   */
  async findById(id: string): Promise<IHLSRepresentation | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return await HLSRepresentationModel.findById(id).exec();
  }

  /**
   * Finds all representations associated with a given logical baseline.
   */
  async findByBaselineId(baselineId: string): Promise<IHLSRepresentation[]> {
    if (!Types.ObjectId.isValid(baselineId)) return [];
    return await HLSRepresentationModel.find({
      baselineId: new Types.ObjectId(baselineId),
    })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Finds the validated READY representation for a baseline and product.
   */
  async findReadyByBaselineId(
    baselineId: string,
    hlsProduct?: HLSProduct,
  ): Promise<IHLSRepresentation | null> {
    if (!Types.ObjectId.isValid(baselineId)) return null;
    const query: Record<string, unknown> = {
      baselineId: new Types.ObjectId(baselineId),
      status: HLSRepresentationStatus.READY,
    };
    if (hlsProduct) {
      query.hlsProduct = hlsProduct;
    }
    return await HLSRepresentationModel.findOne(query).exec();
  }

  /**
   * Finds a representation by its exact unique conceptual identity tuple.
   */
  async findByIdentity(
    baselineId: string,
    sourceObservationId: string,
    hlsProduct: HLSProduct,
    hlsVersion: HLSVersion = HLSVersion.V2_0,
    processingVersion: string = '1.0.0',
  ): Promise<IHLSRepresentation | null> {
    if (!Types.ObjectId.isValid(baselineId)) return null;
    return await HLSRepresentationModel.findOne({
      baselineId: new Types.ObjectId(baselineId),
      sourceObservationId,
      hlsProduct,
      hlsVersion,
      processingVersion,
    }).exec();
  }

  /**
   * Finds an observation-only representation by its exact unique conceptual identity tuple.
   */
  async findByObservationIdentity(
    sourceObservationId: string,
    hlsProduct: HLSProduct,
    hlsVersion: HLSVersion = HLSVersion.V2_0,
    processingVersion: string = '1.0.0',
  ): Promise<IHLSRepresentation | null> {
    return await HLSRepresentationModel.findOne({
      sourceObservationId,
      hlsProduct,
      hlsVersion,
      processingVersion,
      status: HLSRepresentationStatus.READY,
    }).exec();
  }

  /**
   * Finds all representations matching the specified filter criteria.
   */
  async findAll(filters: HLSRepresentationFilters = {}): Promise<IHLSRepresentation[]> {
    const query: Record<string, unknown> = {};

    if (filters.baselineId && Types.ObjectId.isValid(filters.baselineId)) {
      query.baselineId = new Types.ObjectId(filters.baselineId);
    }
    if (filters.sourceObservationId) {
      query.sourceObservationId = filters.sourceObservationId;
    }
    if (filters.hlsProduct) {
      query.hlsProduct = filters.hlsProduct;
    }
    if (filters.hlsVersion) {
      query.hlsVersion = filters.hlsVersion;
    }
    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.processingVersion) {
      query.processingVersion = filters.processingVersion;
    }

    return await HLSRepresentationModel.find(query).sort({ createdAt: -1 }).exec();
  }

  /**
   * Updates an existing representation by its ID.
   * Note: Pre-findOneAndUpdate hook guards against modifying immutable source lineage.
   */
  async update(
    id: string,
    updates: Partial<IHLSRepresentation>,
  ): Promise<IHLSRepresentation | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return await HLSRepresentationModel.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true },
    ).exec();
  }

  /**
   * Deletes a representation by its ID (used primarily for test cleanup).
   */
  async deleteById(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const res = await HLSRepresentationModel.findByIdAndDelete(id).exec();
    return res !== null;
  }

  /**
   * Converts an IHLSRepresentation Mongoose document to its DTO.
   */
  public mapToDto(rep: IHLSRepresentation): HLSRepresentationDto {
    return rep.toDto();
  }
}
