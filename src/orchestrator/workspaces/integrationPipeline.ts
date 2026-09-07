import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { WorkspaceAllocation } from './workspaceManager';
import { TicketAttemptManager } from '../models/ticketAttempt';

export interface IntegrationQueueItem {
  ticketId: string;
  attemptId: string;
  allocation: WorkspaceAllocation;
  verificationCommands?: string[];
}

export type IntegrationStatus = 'success' | 'conflict' | 'regression_failure';

export interface SerializedIntegrationOutput {
  status: IntegrationStatus;
  appliedFiles: string[];
  conflictFiles?: string[];
  replayedVerificationPassed?: boolean;
  errorMessage?: string;
}

export class SerializedIntegrationPipeline {
  private queueLock: Promise<void> = Promise.resolve();

  constructor(private readonly workspaceRoot: string) {}

  /**
   * Enqueues and executes patch integration sequentially.
   */
  public async enqueueIntegration(item: IntegrationQueueItem): Promise<SerializedIntegrationOutput> {
    // Chain onto current queue lock to guarantee sequential execution
    const prevLock = this.queueLock;
    let releaseLock: () => void = () => {};
    this.queueLock = new Promise<void>(resolve => {
      releaseLock = resolve;
    });

    try {
      await prevLock;
      return await this.executeSerializedIntegration(item);
    } finally {
      releaseLock();
    }
  }

  private async executeSerializedIntegration(item: IntegrationQueueItem): Promise<SerializedIntegrationOutput> {
    const { allocation, verificationCommands = [] } = item;
    const conflicts: string[] = [];
    const filesToApply: { sourcePath: string; destPath: string; originalBackup?: Buffer }[] = [];

    // 1. Detect base divergence and prepare backups for rollback
    for (const [origPath, expectedHash] of Object.entries(allocation.manifest.fileHashes)) {
      const relPath = path.relative(this.workspaceRoot, origPath);
      const allocatedPath = path.join(allocation.workspacePath, relPath);

      if (fs.existsSync(allocatedPath)) {
        const allocatedContent = fs.readFileSync(allocatedPath);
        const allocatedHash = TicketAttemptManager.computeHash(allocatedContent);

        if (allocatedHash !== expectedHash) {
          // File was modified by worker
          if (fs.existsSync(origPath)) {
            const currentContent = fs.readFileSync(origPath);
            const currentHash = TicketAttemptManager.computeHash(currentContent);

            if (currentHash !== expectedHash) {
              // Divergence! Both worker and target modified the file
              conflicts.push(relPath);
              continue;
            }
            filesToApply.push({
              sourcePath: allocatedPath,
              destPath: origPath,
              originalBackup: currentContent
            });
          } else {
            filesToApply.push({
              sourcePath: allocatedPath,
              destPath: origPath
            });
          }
        }
      }
    }

    if (conflicts.length > 0) {
      return {
        status: 'conflict',
        appliedFiles: [],
        conflictFiles: conflicts,
        errorMessage: `Merge conflict: Target files diverged since baseline: ${conflicts.join(', ')}`
      };
    }

    // 2. Apply modifications to main workspace
    const appliedFiles: string[] = [];
    for (const file of filesToApply) {
      fs.mkdirSync(path.dirname(file.destPath), { recursive: true });
      fs.copyFileSync(file.sourcePath, file.destPath);
      appliedFiles.push(path.relative(this.workspaceRoot, file.destPath));
    }

    // 3. Automated Regression Check Replay on combined workspace state
    for (const cmd of verificationCommands) {
      const replayResult = await this.runReplayCommand(cmd);
      if (!replayResult.passed) {
        // Regression detected! Rollback all changes
        this.rollback(filesToApply);
        return {
          status: 'regression_failure',
          appliedFiles: [],
          replayedVerificationPassed: false,
          errorMessage: `Regression check failed on integrated state: '${cmd}' failed with code ${replayResult.exitCode}. Error: ${replayResult.stderr || replayResult.stdout}`
        };
      }
    }

    return {
      status: 'success',
      appliedFiles,
      replayedVerificationPassed: true
    };
  }

  private rollback(applied: { destPath: string; originalBackup?: Buffer }[]): void {
    for (const item of applied) {
      if (item.originalBackup) {
        fs.writeFileSync(item.destPath, item.originalBackup);
      } else {
        if (fs.existsSync(item.destPath)) {
          fs.unlinkSync(item.destPath);
        }
      }
    }
  }

  private runReplayCommand(command: string): Promise<{ passed: boolean; exitCode: number; stdout: string; stderr: string }> {
    return new Promise(resolve => {
      cp.exec(command, { cwd: this.workspaceRoot, timeout: 30000 }, (err, stdout, stderr) => {
        const exitCode = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
        resolve({
          passed: exitCode === 0,
          exitCode,
          stdout: stdout.toString(),
          stderr: stderr.toString()
        });
      });
    });
  }
}
