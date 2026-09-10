import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { AttemptRecord, AttemptManifest, AttemptOutcome, ExecutionTier, BudgetReservation, TaskCategory } from '../types';

export class TicketAttemptManager {
  /**
   * Generates a unique monotonic attempt ID.
   */
  public static generateAttemptId(ticketId: string, generation: number): string {
    const timestamp = Date.now();
    const randomSuffix = crypto.randomBytes(3).toString('hex');
    return `att_${ticketId.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}_g${generation}_${timestamp}_${randomSuffix}`;
  }

  /**
   * Computes SHA-256 hash of a string or file buffer.
   */
  public static computeHash(content: string | Buffer): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Generates a snapshot manifest of baseline file contents.
   */
  public static createManifest(baseRevision: string, filePaths: string[]): AttemptManifest {
    const fileHashes: Record<string, string> = {};

    for (const fp of filePaths) {
      if (fs.existsSync(fp) && !fs.statSync(fp).isDirectory()) {
        const fileData = fs.readFileSync(fp);
        fileHashes[fp] = this.computeHash(fileData);
      }
    }

    return {
      baseRevision,
      fileHashes,
      manifestTimestamp: Date.now()
    };
  }

  /**
   * Initializes a new AttemptRecord.
   */
  public static createAttempt(
    ticketId: string,
    generation: number,
    agentId: string,
    tier: ExecutionTier,
    manifest: AttemptManifest,
    budgetReservation: BudgetReservation,
    metadata?: { taskCategory?: TaskCategory; modelTier?: string }
  ): AttemptRecord {
    const now = Date.now();
    return {
      attemptId: this.generateAttemptId(ticketId, generation),
      ticketId,
      generation,
      status: 'Pending',
      agentId,
      tier,
      createdAt: now,
      updatedAt: now,
      manifest,
      budgetReservation,
      taskCategory: metadata?.taskCategory,
      modelTier: metadata?.modelTier
    };
  }

  /**
   * Resolves the runtime store directory for a workspace.
   * Invariant: This store is durable across crashes, uncommitted to version control,
   * and never wiped while active attempts or recovery obligations exist.
   */
  public static getRuntimeStoreDir(workspaceRoot: string): string {
    const dir = path.join(workspaceRoot, '.agentic-kanban', 'runtime');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  /**
   * Persists an attempt record durably to the runtime store.
   */
  public static saveAttempt(workspaceRoot: string, attempt: AttemptRecord): void {
    const attemptsDir = path.join(this.getRuntimeStoreDir(workspaceRoot), 'attempts');
    if (!fs.existsSync(attemptsDir)) {
      fs.mkdirSync(attemptsDir, { recursive: true });
    }

    attempt.updatedAt = Date.now();
    const filePath = path.join(attemptsDir, `${attempt.attemptId}.json`);
    const tempPath = `${filePath}.tmp`;

    // Atomic write to prevent partial corruption on sudden power loss/crash
    fs.writeFileSync(tempPath, JSON.stringify(attempt, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
  }

  /**
   * Reads an attempt record from disk.
   */
  public static loadAttempt(workspaceRoot: string, attemptId: string): AttemptRecord | null {
    const filePath = path.join(this.getRuntimeStoreDir(workspaceRoot), 'attempts', `${attemptId}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data) as AttemptRecord;
    } catch {
      return null;
    }
  }
}
