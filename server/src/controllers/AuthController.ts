import type { Request, Response } from 'express';
import { AuthService } from '../services/AuthService.js';
import { UserService } from '../services/UserService.js';
import { HTTP_STATUS } from '../constants/index.js';
import { AppError } from '../utils/AppError.js';

export class AuthController {
  private authService: AuthService;
  private userService: UserService;

  constructor() {
    this.authService = new AuthService();
    this.userService = new UserService();
  }

  login = async (req: Request, res: Response): Promise<void> => {
    const result = await this.authService.login(req.body);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Login successful',
      data: result,
      timestamp: new Date().toISOString(),
    });
  };

  me = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required', HTTP_STATUS.UNAUTHORIZED);
    }
    const userDto = await this.userService.getUserById(req.user.id);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Current user profile retrieved',
      data: userDto,
      timestamp: new Date().toISOString(),
    });
  };

  logout = async (_req: Request, res: Response): Promise<void> => {
    // Statistically logged out (client clears JWT token)
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Logout successful',
      timestamp: new Date().toISOString(),
    });
  };

  changePassword = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required', HTTP_STATUS.UNAUTHORIZED);
    }
    await this.authService.changePassword(req.user.id, req.body);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Password changed successfully',
      timestamp: new Date().toISOString(),
    });
  };

  registerCompany = async (req: Request, res: Response): Promise<void> => {
    const result = await this.authService.registerCompany(req.body);
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: 'Company and Transporter account registered successfully',
      data: result,
      timestamp: new Date().toISOString(),
    });
  };
}
