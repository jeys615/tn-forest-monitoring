import type { Request, Response } from 'express';
import { AlertService } from '../services/AlertService.js';
import { HTTP_STATUS } from '../constants/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AlertAction } from '@tn-forest/shared/types';

export class AlertController {
  private alertService: AlertService;

  constructor() {
    this.alertService = new AlertService();
  }

  // ─── List & stats ─────────────────────────────────────────────────────────

  getAlerts = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const filters = req.query as Record<string, unknown>;
    const result = await this.alertService.getAlerts(filters);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: result.data,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
      count: result.data.length,
    });
  });

  getAlertStats = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { zoneId, fromDate, toDate } = req.query as Record<string, string | undefined>;
    const filters: { zoneId?: string; fromDate?: Date; toDate?: Date } = {};
    if (zoneId) filters.zoneId = zoneId;
    if (fromDate) filters.fromDate = new Date(fromDate);
    if (toDate) filters.toDate = new Date(toDate);

    const stats = await this.alertService.getAlertStats(filters);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: stats,
    });
  });

  // ─── Single alert ──────────────────────────────────────────────────────────

  getAlertById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const alert = await this.alertService.getAlertById(id);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: alert,
    });
  });

  // ─── Zone-scoped list ─────────────────────────────────────────────────────

  getZoneAlerts = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const zoneId = Array.isArray(req.params.zoneId) ? req.params.zoneId[0] : req.params.zoneId;
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const alerts = await this.alertService.getZoneAlerts(zoneId, limit);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: alerts,
      count: alerts.length,
    });
  });

  // ─── Audit history ────────────────────────────────────────────────────────

  getAlertAuditHistory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const history = await this.alertService.getAlertAuditHistory(id);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: history,
      count: history.length,
    });
  });

  // ─── Lifecycle action ─────────────────────────────────────────────────────

  performAction = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const userId = req.user?.id;

    if (!userId) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({ success: false, message: 'Authentication required' });
      return;
    }

    const { action, notes, dismissalReason, resolutionInfo, assigneeId } = req.body as {
      action: AlertAction;
      notes?: string;
      dismissalReason?: string;
      resolutionInfo?: string;
      assigneeId?: string;
    };

    const updated = await this.alertService.performAction(id, action, userId, {
      notes,
      dismissalReason,
      resolutionInfo,
      assigneeId,
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Alert action ${action} applied successfully`,
      data: updated,
    });
  });

  // ─── Assignment shortcut ──────────────────────────────────────────────────

  assignAlert = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const assignerId = req.user?.id;

    if (!assignerId) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({ success: false, message: 'Authentication required' });
      return;
    }

    const { assigneeId, notes } = req.body as { assigneeId: string; notes?: string };
    const updated = await this.alertService.assignAlert(id, assigneeId, assignerId, notes);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Alert assigned successfully',
      data: updated,
    });
  });

  // ─── Legacy status update (kept for backward compat) ────────────────────

  updateAlertStatus = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const userId = req.user?.id;
    const updated = await this.alertService.updateAlertStatus(id, req.body, userId);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Alert status updated to ${updated.status}`,
      data: updated,
    });
  });
}
