import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { AttemptManifest } from '../types';
import { TicketAttemptManager } from '../models/ticketAttempt';

export interface WorkspaceAllocation {
  attemptId: string;
  workspacePath: string;
  strategy: 'git-worktree' | 'snapshot';
  manifest: AttemptManifest;
}

export interface VerificationResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  passed: boolean;
}

export interface IntegrationResult {
  success: boolean;
  appliedFiles: string[];
  conflictFiles?: string[];
  errorMessage?: string;
}

export class WorkspaceManager {
  private readonly worktreesDir: string;

  constructor(private readonly workspaceRoot: string) {
    this.worktreesDir = path.join(this.workspaceRoot, '.agentic-kanban', 'worktrees');
    if (!fs.existsSync(this.worktreesDir)) {
      fs.mkdirSync(this.worktreesDir, { recursive: true });
    }
  }

  /**
   * Captures baseline revision SHA and file content hashes.
   */
  public async captureBaseline(filePaths: string[] = []): Promise<AttemptManifest> {
    let baseRevision = 'local-unversioned';

    try {
      if (this.isGitRepo()) {
        const rev = cp.execSync('git rev-parse HEAD', { cwd: this.workspaceRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
        baseRevision = rev || 'git-initial';
      }
    } catch {
      // Fallback for non-git workspaces
    }

    return TicketAttemptManager.createManifest(baseRevision, filePaths);
  }

  /**
   * Allocates an isolated workspace for an attempt.
   * Uses git worktree if git repo is clean; otherwise creates a guarded snapshot copy.
   */
  public async allocate(attemptId: string, manifest: AttemptManifest): Promise<WorkspaceAllocation> {
    const targetDir = path.join(this.worktreesDir, attemptId);
    if (fs.existsSync(targetDir)) {
      this.cleanup(attemptId);
    }

    const isCleanGit = this.isGitClean();

    if (isCleanGit) {
      try {
        cp.execSync(`git worktree add -d "${targetDir}"`, { cwd: this.workspaceRoot, stdio: 'ignore' });
        return {
          attemptId,
          workspacePath: targetDir,
          strategy: 'git-worktree',
          manifest
        };
      } catch {
        // Fallback to snapshot on worktree failure
      }
    }

    // Snapshot allocation: Copy files recorded in manifest or relevant workspace files
    fs.mkdirSync(targetDir, { recursive: true });
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
   * Generates a unified diff of modifications made in the allocated workspace against baseline.
   */
  public captureDiff(allocation: WorkspaceAllocation): string {
    const diffs: string[] = [];

    for (const [origPath, origHash] of Object.entries(allocation.manifest.fileHashes)) {
      const relPath = path.relative(this.workspaceRoot, origPath);
      const allocatedFilePath = path.join(allocation.workspacePath, relPath);

      if (fs.existsSync(allocatedFilePath)) {
        const newContent = fs.readFileSync(allocatedFilePath, 'utf8');
        const newHash = TicketAttemptManager.computeHash(Buffer.from(newContent, 'utf8'));

        if (newHash !== origHash) {
          const oldContent = fs.existsSync(origPath) ? fs.readFileSync(origPath, 'utf8') : '';
          diffs.push(this.createSimpleUnifiedDiff(relPath, oldContent, newContent));
        }
      }
    }

    return diffs.join('\n');
  }

  /**
   * Executes deterministic verification command inside allocated workspace.
   */
  public async verify(allocation: WorkspaceAllocation, command: string): Promise<VerificationResult> {
    return new Promise(resolve => {
      cp.exec(command, { cwd: allocation.workspacePath, timeout: 60000 }, (err, stdout, stderr) => {
        const exitCode = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
        resolve({
          command,
          exitCode,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          passed: exitCode === 0
        });
      });
    });
  }

  /**
   * Guarded patch integration:
   * Verifies that target files still match their baseline hashes before applying any changes.
   * If any file diverged externally during the run, integration is aborted safely.
   */
  public async integrate(allocation: WorkspaceAllocation): Promise<IntegrationResult> {
    const conflicts: string[] = [];
    const filesToApply: { sourcePath: string; destPath: string }[] = [];

    for (const [origPath, expectedHash] of Object.entries(allocation.manifest.fileHashes)) {
      const relPath = path.relative(this.workspaceRoot, origPath);
      const allocatedFilePath = path.join(allocation.workspacePath, relPath);

      if (fs.existsSync(allocatedFilePath)) {
        const newContent = fs.readFileSync(allocatedFilePath);
        const newHash = TicketAttemptManager.computeHash(newContent);

        // File was modified by agent
        if (newHash !== expectedHash) {
          // Check if current target on disk diverged from baseline
          if (fs.existsSync(origPath)) {
            const currentTargetContent = fs.readFileSync(origPath);
            const currentTargetHash = TicketAttemptManager.computeHash(currentTargetContent);

            if (currentTargetHash !== expectedHash) {
              // Conflict: User or another process touched the file during attempt!
              conflicts.push(relPath);
              continue;
            }
          }
          filesToApply.push({ sourcePath: allocatedFilePath, destPath: origPath });
        }
      }
    }

    if (conflicts.length > 0) {
      return {
        success: false,
        appliedFiles: [],
        conflictFiles: conflicts,
        errorMessage: `Baseline divergence detected. The following files were modified externally during attempt: ${conflicts.join(', ')}`
      };
    }

    // Apply verified changes safely
    const applied: string[] = [];
    for (const item of filesToApply) {
      fs.mkdirSync(path.dirname(item.destPath), { recursive: true });
      fs.copyFileSync(item.sourcePath, item.destPath);
      applied.push(path.relative(this.workspaceRoot, item.destPath));
    }

    // Cleanup workspace after successful integration
    this.cleanup(allocation.attemptId);

    return {
      success: true,
      appliedFiles: applied
    };
  }

  /**
   * Cleans up allocated worktree or snapshot directory.
   */
  public cleanup(attemptId: string): void {
    const targetDir = path.join(this.worktreesDir, attemptId);
    if (!fs.existsSync(targetDir)) return;

    try {
      if (this.isGitRepo()) {
        try {
          cp.execSync(`git worktree remove --force "${targetDir}"`, { cwd: this.workspaceRoot, stdio: 'ignore' });
        } catch {}
      }
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
    } catch {}
  }

  private isGitRepo(): boolean {
    return fs.existsSync(path.join(this.workspaceRoot, '.git'));
  }

  private isGitClean(): boolean {
    if (!this.isGitRepo()) return false;
    try {
      const status = cp.execSync('git status --porcelain', { cwd: this.workspaceRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      return status.length === 0;
    } catch {
      return false;
    }
  }

  private createSimpleUnifiedDiff(filename: string, oldStr: string, newStr: string): string {
    return `--- a/${filename}\n+++ b/${filename}\n@@ -1 +1 @@\n-${oldStr.slice(0, 100)}\n+${newStr.slice(0, 100)}`;
  }
}
