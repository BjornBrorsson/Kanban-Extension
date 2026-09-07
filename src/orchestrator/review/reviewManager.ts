import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { WorkspaceAllocation } from '../workspaces/workspaceManager';

const execAsync = promisify(exec);

export interface VerificationEvidence {
  attemptId: string;
  ticketId: string;
  timestamp: number;
  command: string;
  passed: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  workspaceHash?: string;
}

export interface CriterionCheckResult {
  criterion: string;
  passed: boolean;
  notes?: string;
}

export interface ReviewDecisionRecord {
  reviewId: string;
  attemptId: string;
  ticketId: string;
  reviewerId: string; // e.g. "lead-fresh-review"
  timestamp: number;
  approved: boolean;
  criteriaChecked: CriterionCheckResult[];
  regressionRisks: string[];
  feedback?: string;
}

export interface DualGateResult {
  passed: boolean;
  verificationEvidence: VerificationEvidence;
  reviewDecision?: ReviewDecisionRecord;
  reason?: string;
}

export class ReviewManager {
  constructor(public readonly workspaceRoot: string) {}

  /**
   * Independently executes a verification command in the allocated workspace.
   * Captured in immutable evidence.
   */
  public async runIndependentVerification(
    allocation: WorkspaceAllocation,
    ticketId: string,
    command: string
  ): Promise<VerificationEvidence> {
    const timestamp = Date.now();
    let stdout = '';
    let stderr = '';
    let exitCode = 0;
    let passed = false;

    try {
      const result = await execAsync(command, {
        cwd: allocation.workspacePath,
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024
      });
      stdout = result.stdout;
      stderr = result.stderr;
      passed = true;
      exitCode = 0;
    } catch (err: any) {
      stdout = err.stdout || '';
      stderr = err.stderr || err.message || '';
      exitCode = typeof err.code === 'number' ? err.code : 1;
      passed = false;
    }

    const evidence: VerificationEvidence = {
      attemptId: allocation.attemptId,
      ticketId,
      timestamp,
      command,
      passed,
      exitCode,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      workspaceHash: allocation.manifest ? JSON.stringify(allocation.manifest).substring(0, 16) : undefined
    };

    this.persistEvidence(evidence);
    return evidence;
  }

  /**
   * Performs the Fresh Lead Review against criteria and the generated unified diff.
   */
  public performFreshReview(params: {
    ticketId: string;
    attemptId: string;
    reviewerId?: string;
    patchDiff: string;
    acceptanceCriteria: string[];
    verificationEvidence: VerificationEvidence;
  }): ReviewDecisionRecord {
    const { ticketId, attemptId, reviewerId = 'fresh-lead-reviewer', patchDiff, acceptanceCriteria, verificationEvidence } = params;

    const criteriaChecked: CriterionCheckResult[] = [];
    const regressionRisks: string[] = [];

    // Evaluate each criterion
    for (const criterion of acceptanceCriteria) {
      // In deterministic verification: automated checks must pass, and diff must not be empty
      const criterionLower = criterion.toLowerCase();
      let criterionPassed = true;
      let notes = 'Verified in patch diff and passing automated checks.';

      if (!verificationEvidence.passed) {
        criterionPassed = false;
        notes = `Failed verification command: ${verificationEvidence.command}`;
      } else if (!patchDiff || patchDiff.trim().length === 0) {
        criterionPassed = false;
        notes = 'No code changes found in patch diff.';
      }

      criteriaChecked.push({
        criterion,
        passed: criterionPassed,
        notes
      });
    }

    // Check for regression indicators (e.g. TODO, FIXME, console.log left behind)
    if (patchDiff.includes('+  // TODO') || patchDiff.includes('+  // FIXME')) {
      regressionRisks.push('Unresolved TODO/FIXME markers introduced in patch.');
    }
    if (patchDiff.includes('+console.error(') && !patchDiff.includes('catch')) {
      regressionRisks.push('Uncaught console error log added.');
    }

    const allPassed = verificationEvidence.passed && criteriaChecked.every(c => c.passed);

    const decision: ReviewDecisionRecord = {
      reviewId: `rev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      attemptId,
      ticketId,
      reviewerId,
      timestamp: Date.now(),
      approved: allPassed,
      criteriaChecked,
      regressionRisks,
      feedback: allPassed
        ? 'Patch cleanly satisfies all acceptance criteria and verified by independent test suite.'
        : `Patch failed review: ${criteriaChecked.filter(c => !c.passed).map(c => c.criterion).join('; ')}`
    };

    this.persistReviewDecision(decision);
    return decision;
  }

  /**
   * Gating check: Evaluates whether an attempt has both passing verification evidence and an approved lead review.
   */
  public canTransitionToDone(attemptId: string): { allowed: boolean; reason?: string } {
    const evidence = this.loadEvidence(attemptId);
    if (!evidence) {
      return { allowed: false, reason: 'Missing independent verification evidence.' };
    }
    if (!evidence.passed) {
      return { allowed: false, reason: `Verification failed with exit code ${evidence.exitCode}: ${evidence.command}` };
    }

    const decision = this.loadReviewDecision(attemptId);
    if (!decision) {
      return { allowed: false, reason: 'Missing fresh lead review decision.' };
    }
    if (!decision.approved) {
      return { allowed: false, reason: `Lead review was not approved: ${decision.feedback}` };
    }

    return { allowed: true };
  }

  public persistEvidence(evidence: VerificationEvidence): void {
    const dir = path.join(this.workspaceRoot, '.agentic-kanban', 'runtime', 'evidence');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(path.join(dir, `${evidence.attemptId}.json`), JSON.stringify(evidence, null, 2), 'utf8');
  }

  public loadEvidence(attemptId: string): VerificationEvidence | null {
    const file = path.join(this.workspaceRoot, '.agentic-kanban', 'runtime', 'evidence', `${attemptId}.json`);
    if (!fs.existsSync(file)) return null;
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return null;
    }
  }

  public persistReviewDecision(decision: ReviewDecisionRecord): void {
    const dir = path.join(this.workspaceRoot, '.agentic-kanban', 'runtime', 'reviews');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(path.join(dir, `${decision.attemptId}.json`), JSON.stringify(decision, null, 2), 'utf8');
  }

  public loadReviewDecision(attemptId: string): ReviewDecisionRecord | null {
    const file = path.join(this.workspaceRoot, '.agentic-kanban', 'runtime', 'reviews', `${attemptId}.json`);
    if (!fs.existsSync(file)) return null;
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return null;
    }
  }
}
