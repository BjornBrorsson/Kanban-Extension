import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { AttemptManifest } from '../types';
import { WorkspaceAllocation } from './workspaceManager';

export interface WorktreeLease {
  attemptId: string;
  ticketId: string;
  workspacePath: string;
  targetFiles: string[];
  isReadOnly: boolean;
  allocatedAt: number;
}

export class MultiWorktreeAllocator {
  private readonly worktreesDir: string;
  private activeLeases: Map<string, WorktreeLease> = new Map();

  constructor(private readonly workspaceRoot: string) {
    this.worktreesDir = path.join(this.workspaceRoot, '.agentic-kanban', 'worktrees');
    if (!fs.existsSync(this.worktreesDir)) {
      fs.mkdirSync(this.worktreesDir, { recursive: true });
    }
  }

  /**
   * Checks if an attempt can be allocated without file scope collision.
   * Read-only attempts (e.g. Lead planning) never collide.
   * Writing attempts cannot overlap target files with any other active writing attempt.
   */
  public canAllocate(params: { attemptId: string; targetFiles: string[]; isReadOnly?: boolean }): { allowed: boolean; reason?: string } {
    if (params.isReadOnly) {
      return { allowed: true };
    }

    const requestedSet = new Set(params.targetFiles.map(f => path.resolve(this.workspaceRoot, f)));

    for (const [activeId, lease] of this.activeLeases.entries()) {
      if (activeId === params.attemptId || lease.isReadOnly) {
        continue;
      }

      for (const activeFile of lease.targetFiles) {
        const resolvedActive = path.resolve(this.workspaceRoot, activeFile);
        if (requestedSet.has(resolvedActive)) {
          return {
            allowed: false,
            reason: `Scope collision: File '${activeFile}' is currently locked exclusively by attempt '${activeId}'.`
          };
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Allocates an isolated worktree for an attempt.
   */
  public async allocateWorktree(params: {
    attemptId: string;
    ticketId: string;
    manifest: AttemptManifest;
    targetFiles: string[];
    isReadOnly?: boolean;
  }): Promise<WorkspaceAllocation> {
    const check = this.canAllocate({
      attemptId: params.attemptId,
      targetFiles: params.targetFiles,
      isReadOnly: params.isReadOnly
    });

    if (!check.allowed) {
      throw new Error(check.reason);
    }

    const targetDir = path.join(this.worktreesDir, params.attemptId);
    if (fs.existsSync(targetDir)) {
      this.cleanupWorktree(params.attemptId);
    }

    let strategy: 'git-worktree' | 'snapshot' = 'snapshot';

    if (this.isGitRepo() && !params.isReadOnly) {
      try {
        cp.execSync(`git worktree add -d "${targetDir}"`, { cwd: this.workspaceRoot, stdio: 'ignore' });
        strategy = 'git-worktree';
      } catch {
        strategy = 'snapshot';
      }
    }

    if (strategy === 'snapshot' || params.isReadOnly) {
      fs.mkdirSync(targetDir, { recursive: true });
      for (const [filePath] of Object.entries(params.manifest.fileHashes)) {
        if (fs.existsSync(filePath)) {
          const relPath = path.relative(this.workspaceRoot, filePath);
          const destPath = path.join(targetDir, relPath);
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.copyFileSync(filePath, destPath);
        }
      }
    }

    const lease: WorktreeLease = {
      attemptId: params.attemptId,
      ticketId: params.ticketId,
      workspacePath: targetDir,
      targetFiles: params.targetFiles,
      isReadOnly: Boolean(params.isReadOnly),
      allocatedAt: Date.now()
    };

    this.activeLeases.set(params.attemptId, lease);

    return {
      attemptId: params.attemptId,
      workspacePath: targetDir,
      strategy,
      manifest: params.manifest
    };
  }

  /**
   * Releases and cleans up an allocated worktree.
   */
  public cleanupWorktree(attemptId: string): void {
    this.activeLeases.delete(attemptId);
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

  public getActiveLeases(): WorktreeLease[] {
    return Array.from(this.activeLeases.values());
  }

  private isGitRepo(): boolean {
    return fs.existsSync(path.join(this.workspaceRoot, '.git'));
  }
}
