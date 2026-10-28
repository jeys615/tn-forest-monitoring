import type { Request, Response, NextFunction } from 'express';
import {
  transportFleetService,
  TransportFleetService,
} from '../services/TransportFleetService.js';
import { HTTP_STATUS } from '../constants/index.js';
import {
  createTransportCompanySchema,
  createVehicleSchema,
  createDriverSchema,
} from '../validators/transportFleet.validator.js';
import {
  TransportCompanyStatus,
  VehicleStatus,
  DriverVerificationStatus,
} from '@tn-forest/shared/types';

export class TransportFleetController {
  constructor(private fleetService: TransportFleetService = transportFleetService) {}

  // ---------------------------------------------------------------------------
  // Transport Companies
  // ---------------------------------------------------------------------------

  createTransportCompany = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validated = createTransportCompanySchema.parse(req.body);
      const userId = req.user?.id;
      const created = await this.fleetService.createTransportCompany(validated, userId);

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        message: 'Transport company created successfully',
        data: created,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getAllTransportCompanies = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const status = req.query.status as TransportCompanyStatus | undefined;
      const list = await this.fleetService.getAllTransportCompanies({ status });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Transport companies retrieved successfully',
        data: list,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getTransportCompanyById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const doc = await this.fleetService.getTransportCompanyById(req.params.id as string);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Transport company retrieved successfully',
        data: doc,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  // ---------------------------------------------------------------------------
  // Vehicles
  // ---------------------------------------------------------------------------

  createVehicle = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validated = createVehicleSchema.parse(req.body);
      const userId = req.user?.id;
      const created = await this.fleetService.createVehicle(validated, userId);

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        message: 'Vehicle registered successfully',
        data: created,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getAllVehicles = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const status = req.query.status as VehicleStatus | undefined;
      const transportCompanyId = req.query.transportCompanyId as string | undefined;
      const zoneId = req.query.zoneId as string | undefined;

      const list = await this.fleetService.getAllVehicles({ status, transportCompanyId, zoneId });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Vehicles retrieved successfully',
        data: list,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getVehicleById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const doc = await this.fleetService.getVehicleById(req.params.id as string);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Vehicle retrieved successfully',
        data: doc,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  // ---------------------------------------------------------------------------
  // Drivers
  // ---------------------------------------------------------------------------

  createDriver = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validated = createDriverSchema.parse(req.body);
      const userId = req.user?.id;
      const created = await this.fleetService.createDriver(validated, userId);

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        message: 'Driver registered successfully',
        data: created,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getAllDrivers = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const verificationStatus = req.query.verificationStatus as DriverVerificationStatus | undefined;
      const transportCompanyId = req.query.transportCompanyId as string | undefined;
      const zoneId = req.query.zoneId as string | undefined;

      const list = await this.fleetService.getAllDrivers({ verificationStatus, transportCompanyId, zoneId });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Drivers retrieved successfully',
        data: list,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getDriverById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const doc = await this.fleetService.getDriverById(req.params.id as string);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Driver retrieved successfully',
        data: doc,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };
}

export const transportFleetController = new TransportFleetController();
