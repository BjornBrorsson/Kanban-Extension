import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { AttemptManifest } from '../types';
import { TicketAttemptManager } from '../models/ticketAttempt';
import { WorkspaceAllocation, IntegrationResult } from './workspaceManager';

export interface ShelvesetResult {
  shelvesetName: string;
  files: string[];
  outputPath: string;
}

export class TfvcWorkspaceProvider {
  private activeWriterAttemptId: string | null = null;
  private readonly shelvesetsDir: string;

  constructor(private readonly workspaceRoot: string) {
    this.shelvesetsDir = path.join(this.workspaceRoot, '.agentic-kanban', 'shelvesets');
    if (!fs.existsSync(this.shelvesetsDir)) {
      fs.mkdirSync(this.shelvesetsDir, { recursive: true });
    }
  }

  /**
   * Enforces single-writer lock for TFVC workspace.
   */
  public acquireWriterLock(attemptId: string): boolean {
    if (this.activeWriterAttemptId && this.activeWriterAttemptId !== attemptId) {
      return false;
    }
    this.activeWriterAttemptId = attemptId;
    return true;
  }

  public releaseWriterLock(attemptId: string): void {
    if (this.activeWriterAttemptId === attemptId) {
      this.activeWriterAttemptId = null;
    }
  }

  public hasWriterLock(attemptId: string): boolean {
    return this.activeWriterAttemptId === attemptId;
  }

  /**
   * Captures baseline manifest and scopes checkout.
   */
  public async captureBaseline(filePaths: string[] = []): Promise<AttemptManifest> {
    return TicketAttemptManager.createManifest('tfvc-workspace-baseline', filePaths);
  }

  /**
   * Checks out files within ticket scope using `tf checkout` (or local RW simulation if tf CLI is absent).
   */
  public async checkoutScopedFiles(filePaths: string[]): Promise<{ success: boolean; checkedOut: string[] }> {
    const checkedOut: string[] = [];

    for (const filePath of filePaths) {
      if (fs.existsSync(filePath)) {
        try {
          // Attempt tf checkout if tf executable exists
          cp.execSync(`tf checkout "${filePath}"`, { cwd: this.workspaceRoot, stdio: 'ignore' });
        } catch {
          // If tf not available, ensure file is writable
          try {
            fs.chmodSync(filePath, 0o666);
          } catch {}
        }
        checkedOut.push(filePath);
      }
    }

    return { success: true, checkedOut };
  }

  /**
   * Creates a shelveset of modifications instead of direct check-in.
   */
  public async createShelveset(ticketId: string, allocation: WorkspaceAllocation): Promise<ShelvesetResult> {
    const shelvesetName = `shelveset_${ticketId}_${Date.now()}`;
    const shelvesetFile = path.join(this.shelvesetsDir, `${shelvesetName}.json`);

    const modifiedFiles: { path: string; diff: string }[] = [];

    for (const [origPath, origHash] of Object.entries(allocation.manifest.fileHashes)) {
      const relPath = path.relative(this.workspaceRoot, origPath);
      const allocatedPath = path.join(allocation.workspacePath, relPath);

      if (fs.existsSync(allocatedPath)) {
        const newContent = fs.readFileSync(allocatedPath, 'utf8');
        const newHash = TicketAttemptManager.computeHash(Buffer.from(newContent, 'utf8'));

        if (newHash !== origHash) {
          const oldContent = fs.existsSync(origPath) ? fs.readFileSync(origPath, 'utf8') : '';
          modifiedFiles.push({
            path: relPath,
            diff: `--- a/${relPath}\n+++ b/${relPath}\n${newContent}`
          });
        }
      }
    }

    const payload = {
      shelvesetName,
      ticketId,
      timestamp: Date.now(),
      files: modifiedFiles
    };

    fs.writeFileSync(shelvesetFile, JSON.stringify(payload, null, 2), 'utf8');

    return {
      shelvesetName,
      files: modifiedFiles.map(f => f.path),
      outputPath: shelvesetFile
    };
  }

  /**
   * Integrates changes with single-writer validation and divergence check.
   */
  public async integrate(allocation: WorkspaceAllocation): Promise<IntegrationResult> {
    if (!this.hasWriterLock(allocation.attemptId)) {
      return {
        success: false,
        appliedFiles: [],
        errorMessage: `TFVC Lock Error: Attempt ${allocation.attemptId} does not hold the active TFVC writer lock.`
      };
    }

    const conflicts: string[] = [];
    const filesToApply: { sourcePath: string; destPath: string }[] = [];

    for (const [origPath, expectedHash] of Object.entries(allocation.manifest.fileHashes)) {
      const relPath = path.relative(this.workspaceRoot, origPath);
      const allocatedPath = path.join(allocation.workspacePath, relPath);

      if (fs.existsSync(allocatedPath)) {
        const newContent = fs.readFileSync(allocatedPath);
        const newHash = TicketAttemptManager.computeHash(newContent);

        if (newHash !== expectedHash) {
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
        errorMessage: `TFVC baseline divergence: Files modified externally during attempt: ${conflicts.join(', ')}`
      };
    }

    const applied: string[] = [];
    for (const item of filesToApply) {
      fs.mkdirSync(path.dirname(item.destPath), { recursive: true });
      fs.copyFileSync(item.sourcePath, item.destPath);
      applied.push(path.relative(this.workspaceRoot, item.destPath));
    }

    this.releaseWriterLock(allocation.attemptId);

    return {
      success: true,
      appliedFiles: applied
    };
  }
}
