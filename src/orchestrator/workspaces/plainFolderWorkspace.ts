import * as fs from 'fs';
import * as path from 'path';
import { AttemptManifest } from '../types';
import { TicketAttemptManager } from '../models/ticketAttempt';
import { WorkspaceAllocation, IntegrationResult } from './workspaceManager';

export class PlainFolderWorkspaceProvider {
  private readonly snapshotsDir: string;

  constructor(private readonly workspaceRoot: string) {
    this.snapshotsDir = path.join(this.workspaceRoot, '.agentic-kanban', 'snapshots');
    if (!fs.existsSync(this.snapshotsDir)) {
      fs.mkdirSync(this.snapshotsDir, { recursive: true });
    }
  }

  /**
   * Captures baseline manifest of target files for a non-VCS workspace.
   */
  public async captureBaseline(filePaths: string[] = []): Promise<AttemptManifest> {
    return TicketAttemptManager.createManifest('plain-folder-baseline', filePaths);
  }

  /**
   * Allocates an isolated snapshot directory for an attempt.
   */
  public async allocateSnapshot(attemptId: string, manifest: AttemptManifest): Promise<WorkspaceAllocation> {
    const targetDir = path.join(this.snapshotsDir, attemptId);
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }

    fs.mkdirSync(targetDir, { recursive: true });

    // Snapshot target files into isolated directory
    for (const [filePath] of Object.entries(manifest.fileHashes)) {
      if (fs.existsSync(filePath)) {
        const relPath = path.relative(this.workspaceRoot, filePath);
        const destPath = path.join(targetDir, relPath);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(filePath, destPath);
      }
    }

    return {
      attemptId,
      workspacePath: targetDir,
      strategy: 'snapshot',
      manifest
    };
  }

  /**
   * Applies changes made in snapshot back to main workspace with baseline hash guarding.
   */
  public async integrateSnapshot(allocation: WorkspaceAllocation): Promise<IntegrationResult> {
    const conflicts: string[] = [];
    const filesToApply: { sourcePath: string; destPath: string }[] = [];

    for (const [origPath, expectedHash] of Object.entries(allocation.manifest.fileHashes)) {
      const relPath = path.relative(this.workspaceRoot, origPath);
      const allocatedPath = path.join(allocation.workspacePath, relPath);

      if (fs.existsSync(allocatedPath)) {
        const newContent = fs.readFileSync(allocatedPath);
        const newHash = TicketAttemptManager.computeHash(newContent);

        if (newHash !== expectedHash) {
          // Check if destination on disk diverged externally
          if (fs.existsSync(origPath)) {
            const currentContent = fs.readFileSync(origPath);
            const currentHash = TicketAttemptManager.computeHash(currentContent);

            if (currentHash !== expectedHash) {
              conflicts.push(relPath);
              continue;
            }
          }
          filesToApply.push({ sourcePath: allocatedPath, destPath: origPath });
        }
      }
    }

    if (conflicts.length > 0) {
      return {
        success: false,
        appliedFiles: [],
        conflictFiles: conflicts,
        errorMessage: `Plain folder conflict: Files modified externally during attempt: ${conflicts.join(', ')}`
      };
    }

    const applied: string[] = [];
    for (const item of filesToApply) {
      fs.mkdirSync(path.dirname(item.destPath), { recursive: true });
      fs.copyFileSync(item.sourcePath, item.destPath);
      applied.push(path.relative(this.workspaceRoot, item.destPath));
    }

    this.cleanup(allocation.attemptId);

    return {
      success: true,
      appliedFiles: applied
    };
  }

  public cleanup(attemptId: string): void {
    const targetDir = path.join(this.snapshotsDir, attemptId);
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
  }
}
