import { getGeeConfig } from '../../config/gee.js';
import { GeeAuthService } from './GeeAuthService.js';

export type GeeTaskState =
  | 'EXPORT_REQUESTED'
  | 'EXPORT_READY'
  | 'EXPORT_RUNNING'
  | 'EXPORT_COMPLETED'
  | 'EXPORT_FAILED'
  | 'EXPORT_TIMEOUT';

export interface GeeTaskStatus {
  taskId: string;
  state: GeeTaskState;
  progressPercentage?: number;
  errorMessage?: string;
  updatedAt: Date;
  isTransientError?: boolean;
}

export class GeeTaskService {
  private authService: GeeAuthService;

  constructor() {
    this.authService = GeeAuthService.getInstance();
  }

  /**
   * Checks the status of an ongoing Google Earth Engine Export Task.
   * Retries transient network failures and HTTP 502/503 up to maxRetries.
   */
  public async getTaskStatus(
    taskId: string,
    options?: { maxRetries?: number },
  ): Promise<GeeTaskStatus> {
    const config = getGeeConfig();
    const token = await this.authService.getAccessToken();

    if (token && config.hasCredentials && taskId.startsWith('projects/')) {
      const maxRetries = options?.maxRetries ?? 2;
      let attempt = 0;

      while (true) {
        try {
          const url = `https://earthengine.googleapis.com/v1alpha/${taskId}`;
          const res = await fetch(url, {
            headers: {
              Authorization: `Bearer ${token}`,
              'X-Goog-User-Project': config.projectId,
            },
          });

          if (res.ok) {
            const data = (await res.json()) as {
              done?: boolean;
              error?: { message?: string; code?: number };
              metadata?: { state?: string; progress?: number; description?: string };
            };

            if (data.done) {
              if (data.error || data.metadata?.state === 'FAILED') {
                const errMsg =
                  data.error?.message ||
                  `Earth Engine task failed with state ${data.metadata?.state}`;
                console.error(`[GEE_EXPORT] Status: FAILED (${errMsg})`);
                return {
                  taskId,
                  state: 'EXPORT_FAILED',
                  errorMessage: errMsg,
                  updatedAt: new Date(),
                  isTransientError: false,
                };
              }
              console.info(`[GEE_EXPORT] Status: COMPLETED`);
              return {
                taskId,
                state: 'EXPORT_COMPLETED',
                progressPercentage: 100,
                updatedAt: new Date(),
                isTransientError: false,
              };
            }

            const rawState = data.metadata?.state;
            const state: GeeTaskState = rawState === 'READY' ? 'EXPORT_READY' : 'EXPORT_RUNNING';
            console.info(`[GEE_EXPORT] Status: ${rawState || 'RUNNING'}`);

            return {
              taskId,
              state,
              progressPercentage: data.metadata?.progress
                ? Math.round(data.metadata.progress * 100)
                : 50,
              updatedAt: new Date(),
              isTransientError: false,
            };
          } else {
            const isTransient = res.status === 502 || res.status === 503;
            if (isTransient && attempt < maxRetries) {
              attempt++;
              const backoffMs = Math.min(1000, 300 * Math.pow(2, attempt - 1));
              console.warn(
                `[GEE_TASK] Transient HTTP ${res.status} polling ${taskId}. Retrying in ${backoffMs}ms (attempt ${attempt}/${maxRetries})...`,
              );
              await new Promise((resolve) => setTimeout(resolve, backoffMs));
              continue;
            }

            const errText = await res.text().catch(() => '');
            console.error(`[GEE_EXPORT] Poll HTTP ${res.status}: ${errText}`);
            return {
              taskId,
              state: 'EXPORT_FAILED',
              errorMessage: `Earth Engine poll failed with HTTP ${res.status}: ${errText}`,
              updatedAt: new Date(),
              isTransientError: isTransient,
            };
          }
        } catch (err) {
          if (attempt < maxRetries) {
            attempt++;
            const backoffMs = Math.min(1000, 300 * Math.pow(2, attempt - 1));
            const errMsg = err instanceof Error ? err.message : String(err);
            console.warn(
              `[GEE_TASK] Temporary network failure polling ${taskId}: ${errMsg}. Retrying in ${backoffMs}ms (attempt ${attempt}/${maxRetries})...`,
            );
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            continue;
          }

          const errMsg = err instanceof Error ? err.message : String(err);
          console.warn(`[GEE_EXPORT] Polling network error: ${errMsg}`);
          return {
            taskId,
            state: 'EXPORT_FAILED',
            errorMessage: `Network error polling GEE export task: ${errMsg}`,
            updatedAt: new Date(),
            isTransientError: true,
          };
        }
      }
    }

    console.error(`[GEE_EXPORT] Cannot poll invalid or non-GEE task ID: ${taskId}`);
    return {
      taskId,
      state: 'EXPORT_FAILED',
      errorMessage: `Cannot poll invalid or non-GEE task ID: ${taskId}`,
      updatedAt: new Date(),
      isTransientError: false,
    };
  }

  /**
   * Polls a GEE task until COMPLETED, FAILED, or TIMEOUT.
   * Tolerates bounded consecutive transient failures before failing.
   */
  public async pollTaskCompletion(
    taskId: string,
    options?: {
      timeoutMs?: number;
      pollIntervalMs?: number;
      maxConsecutiveTransientErrors?: number;
    },
  ): Promise<GeeTaskStatus> {
    const config = getGeeConfig();
    const timeoutMs = options?.timeoutMs || config.exportTimeoutMs;
    const pollIntervalMs = options?.pollIntervalMs || config.pollIntervalMs;
    const maxConsecutiveTransientErrors = options?.maxConsecutiveTransientErrors ?? 3;
    let consecutiveTransientErrors = 0;
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getTaskStatus(taskId);
      if (status.state === 'EXPORT_COMPLETED') {
        return status;
      }
      if (status.state === 'EXPORT_FAILED') {
        if (status.isTransientError && consecutiveTransientErrors < maxConsecutiveTransientErrors) {
          consecutiveTransientErrors++;
          console.warn(
            `[GEE_TASK] Transient error polling ${taskId} (${consecutiveTransientErrors}/${maxConsecutiveTransientErrors}): ${status.errorMessage}. Continuing polling...`,
          );
          await new Promise((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, 2000)));
          continue;
        }
        return status;
      }

      consecutiveTransientErrors = 0;
      await new Promise((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, 2000)));
    }

    return {
      taskId,
      state: 'EXPORT_TIMEOUT',
      errorMessage: `Export task timed out after ${(timeoutMs / 1000).toFixed(0)} seconds`,
      updatedAt: new Date(),
      isTransientError: false,
    };
  }
}
