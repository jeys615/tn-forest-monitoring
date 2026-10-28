import type { Request, Response } from 'express';
import { UserService } from '../services/UserService.js';
import { HTTP_STATUS } from '../constants/index.js';
import { AppError } from '../utils/AppError.js';
import type { UserRole, UserStatus } from '@tn-forest/shared/types';

export class UserController {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  getUsers = async (req: Request, res: Response): Promise<void> => {
    const role = req.query.role as UserRole | undefined;
    const status = req.query.status as UserStatus | undefined;
    const users = await this.userService.getAllUsers({ role, status });
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Users retrieved successfully',
      data: users,
      timestamp: new Date().toISOString(),
    });
  };

  getUserById = async (req: Request, res: Response): Promise<void> => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const user = await this.userService.getUserById(id);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'User retrieved successfully',
      data: user,
      timestamp: new Date().toISOString(),
    });
  };

  createUser = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required', HTTP_STATUS.UNAUTHORIZED);
    }
    const user = await this.userService.createUser(req.user, req.body);
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: 'User created successfully',
      data: user,
      timestamp: new Date().toISOString(),
    });
  };

  updateUser = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required', HTTP_STATUS.UNAUTHORIZED);
    }
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const user = await this.userService.updateUser(req.user, id, req.body);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'User updated successfully',
      data: user,
      timestamp: new Date().toISOString(),
    });
  };

  updateUserStatus = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required', HTTP_STATUS.UNAUTHORIZED);
    }
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { status } = req.body;
    const user = await this.userService.updateUserStatus(req.user, id, status);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'User status updated successfully',
      data: user,
      timestamp: new Date().toISOString(),
    });
  };
}
