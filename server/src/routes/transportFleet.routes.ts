import { Router } from 'express';
import { transportFleetController } from '../controllers/TransportFleetController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';
import { UserRole } from '@tn-forest/shared/types';

// Router for /api/vehicles
export const vehicleRouter = Router();
vehicleRouter.use(requireAuth);
vehicleRouter.post(
  '/',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MINING_OFFICER, UserRole.FOREST_OFFICER),
  transportFleetController.createVehicle,
);
vehicleRouter.get('/', transportFleetController.getAllVehicles);
vehicleRouter.get('/:id', transportFleetController.getVehicleById);

// Router for /api/drivers
export const driverRouter = Router();
driverRouter.use(requireAuth);
driverRouter.post(
  '/',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MINING_OFFICER, UserRole.FOREST_OFFICER),
  transportFleetController.createDriver,
);
driverRouter.get('/', transportFleetController.getAllDrivers);
driverRouter.get('/:id', transportFleetController.getDriverById);

// Router for /api/transport-companies
export const transportCompanyRouter = Router();
transportCompanyRouter.use(requireAuth);
transportCompanyRouter.post(
  '/',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MINING_OFFICER, UserRole.FOREST_OFFICER),
  transportFleetController.createTransportCompany,
);
transportCompanyRouter.get('/', transportFleetController.getAllTransportCompanies);
transportCompanyRouter.get('/:id', transportFleetController.getTransportCompanyById);
