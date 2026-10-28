import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'crypto';

export class TempImageManager {
  private static readonly BASE_TEMP_DIR = path.resolve(process.cwd(), 'tmp', 'gee-processing');

  /**
   * Creates a dedicated temporary directory for ephemeral image processing tasks.
   */
  public static async createTempWorkspace(scopeId: string = 'job'): Promise<string> {
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    const safeScope = scopeId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const dirName = `${safeScope}_${Date.now()}_${randomSuffix}`;
    const workspacePath = path.join(this.BASE_TEMP_DIR, dirName);

    await fs.mkdir(workspacePath, { recursive: true });
    return workspacePath;
  }

  /**
   * Recursively removes the temporary workspace and all intermediate files.
   */
  public static async cleanupTempWorkspace(workspacePath: string): Promise<void> {
    if (!workspacePath) return;

    try {
      if (fsSync.existsSync(workspacePath)) {
        await fs.rm(workspacePath, { recursive: true, force: true });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.warn(`[GEE Cleanup] Warning: Failed to delete temporary workspace ${workspacePath}: ${msg}`);
    }
  }

  /**
   * Executes an image processing operation within an ephemeral temporary workspace
   * and guarantees complete cleanup in a finally block.
   */
  public static async withTemporaryWorkspace<T>(
    scopeId: string,
    action: (workspaceDir: string) => Promise<T>,
  ): Promise<T> {
    const workspaceDir = await this.createTempWorkspace(scopeId);
    try {
      return await action(workspaceDir);
    } finally {
      await this.cleanupTempWorkspace(workspaceDir);
    }
  }

  /**
   * Diagnostic helper to check if any temporary workspaces remain on disk.
   */
  public static getActiveWorkspacesCount(): number {
    if (!fsSync.existsSync(this.BASE_TEMP_DIR)) {
      return 0;
    }
    try {
      const entries = fsSync.readdirSync(this.BASE_TEMP_DIR);
      return entries.length;
    } catch {
      return 0;
    }
  }

  /**
   * Diagnostic helper to completely purge the base temp directory.
   */
  public static async cleanupAllWorkspaces(): Promise<void> {
    try {
      if (fsSync.existsSync(this.BASE_TEMP_DIR)) {
        await fs.rm(this.BASE_TEMP_DIR, { recursive: true, force: true });
      }
    } catch {
      // Ignored
    }
  }
}
