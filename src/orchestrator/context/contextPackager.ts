import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface SourceReference {
  path: string;
  hash: string;
}

export interface FailingCheckTrace {
  command: string;
  output: string;
  exitCode?: number;
}

export interface ContextPackagingInput {
  ticketId: string;
  attemptId: string;
  objective: string;
  allowedScope: string[];
  constraints?: string[];
  workspaceRoot: string;
  targetFiles?: string[];
  currentDiff?: string;
  failingChecks?: FailingCheckTrace[];
  openQuestions?: string[];
  budget?: { currency?: string; maxUnits: number };
  nextSuggestedAction?: string;
}

export interface DelegationPackage {
  ticketId: string;
  attemptId: string;
  timestamp: number;
  objective: string;
  allowedScope: string[];
  constraints: string[];
  sourceReferences: SourceReference[];
  baseRevision: string;
  currentDiff?: string;
  failingChecks?: FailingCheckTrace[];
  openQuestions?: string[];
  allocatedBudget: { currency?: string; maxUnits: number };
  nextSuggestedAction: string;
}

export class ContextPackager {
  /**
   * Computes SHA-256 hash for a file.
   */
  public static hashFile(filePath: string): string {
    if (!fs.existsSync(filePath)) {
      return '';
    }
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Builds an immutable, bounded DelegationPackage.
   */
  public static packageForWorker(input: ContextPackagingInput): DelegationPackage {
    const sourceReferences: SourceReference[] = [];

    // Collect hashes of relevant target/reference files
    const targets = input.targetFiles || [];
    for (const relOrAbs of targets) {
      const absPath = path.isAbsolute(relOrAbs)
        ? relOrAbs
        : path.join(input.workspaceRoot, relOrAbs);
      if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
        const relPath = path.relative(input.workspaceRoot, absPath).replace(/\\/g, '/');
        sourceReferences.push({
          path: relPath,
          hash: this.hashFile(absPath)
        });
      }
    }

    // Determine base revision or composite hash
    const composite = sourceReferences.map(s => `${s.path}:${s.hash}`).join(';');
    const baseRevision = crypto.createHash('sha256').update(composite || input.ticketId).digest('hex').substring(0, 12);

    return {
      ticketId: input.ticketId,
      attemptId: input.attemptId,
      timestamp: Date.now(),
      objective: input.objective,
      allowedScope: input.allowedScope,
      constraints: input.constraints || [
        'Modify only files within allowedScope.',
        'Do not introduce external dependencies without escalation.',
        'Ensure all automated tests pass before requesting review.'
      ],
      sourceReferences,
      baseRevision,
      currentDiff: input.currentDiff,
      failingChecks: input.failingChecks,
      openQuestions: input.openQuestions,
      allocatedBudget: input.budget || { currency: 'EUR', maxUnits: 1 },
      nextSuggestedAction: input.nextSuggestedAction || 'Implement required changes and run verification.'
    };
  }

  /**
   * Persists the delegation package in .agentic-kanban/runtime/handoffs/
   */
  public static persistPackage(workspaceRoot: string, pkg: DelegationPackage): string {
    const handoffsDir = path.join(workspaceRoot, '.agentic-kanban', 'runtime', 'handoffs');
    if (!fs.existsSync(handoffsDir)) {
      fs.mkdirSync(handoffsDir, { recursive: true });
    }
    const filePath = path.join(handoffsDir, `${pkg.attemptId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(pkg, null, 2), 'utf8');
    return filePath;
  }

  /**
   * Loads a persisted delegation package.
   */
  public static loadPackage(workspaceRoot: string, attemptId: string): DelegationPackage | null {
    const filePath = path.join(workspaceRoot, '.agentic-kanban', 'runtime', 'handoffs', `${attemptId}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return null;
    }
  }
}
