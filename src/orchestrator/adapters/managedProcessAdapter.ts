import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { RunnerAdapter, AdapterCapabilities, AttemptContext, ExecutionEvent, CancellationResult, AttemptResult } from './types';

export interface ManagedProcessOptions {
  executable: string;
  argsTemplate: string[];
  workingDir?: string;
  env?: Record<string, string>;
}

export class ManagedProcessAdapter implements RunnerAdapter {
  public readonly id: string;
  public readonly name: string;
  public readonly tier = 'managed';

  private activeProcesses: Map<string, {
    child: cp.ChildProcess;
    pid: number;
    stdout: string[];
    stderr: string[];
    patchPath?: string;
    exitPromise: Promise<{ exitCode: number; signal?: string }>;
  }> = new Map();

  constructor(
    id: string,
    name: string,
    private readonly options: ManagedProcessOptions
  ) {
    this.id = id;
    this.name = name;
  }

  public async probe(): Promise<AdapterCapabilities> {
    return {
      tier: 'managed',
      installed: true,
      supportsStructuredOutput: true,
      supportsResumableSessions: false,
      supportsTokenReporting: true,
      supportsCostLimits: true,
      supportsModelSelection: true,
      supportsNetworkRestrictions: false,
      supportsToolWhitelisting: true
    };
  }

  public async start(
    context: AttemptContext,
    onEvent?: (event: ExecutionEvent) => void
  ): Promise<{ pid?: number; executionId: string }> {
    const executionId = `proc_${context.attemptId}_${Date.now()}`;
    const cwd = this.options.workingDir || context.workspaceRoot;

    // Substitute template arguments
    const patchOutPath = path.join(cwd, '.agentic-kanban', 'worktrees', `${context.attemptId}.patch`);
    const args = this.options.argsTemplate.map(arg =>
      arg
        .replace('{ticket_id}', context.ticketId)
        .replace('{attempt_id}', context.attemptId)
        .replace('{objective}', context.objective)
        .replace('{patch_out}', patchOutPath)
    );

    const child = cp.spawn(this.options.executable, args, {
      cwd,
      env: { ...process.env, ...this.options.env, ATTEMPT_ID: context.attemptId },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const pid = child.pid || 0;
    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];

    child.stdout?.on('data', data => {
      const text = data.toString();
      stdoutLines.push(text);
      if (onEvent) {
        onEvent({ type: 'stdout', timestamp: Date.now(), message: text });
      }
    });

    child.stderr?.on('data', data => {
      const text = data.toString();
      stderrLines.push(text);
      if (onEvent) {
        onEvent({ type: 'stderr', timestamp: Date.now(), message: text });
      }
    });

    const exitPromise = new Promise<{ exitCode: number; signal?: string }>(resolve => {
      child.on('close', (code, signal) => {
        resolve({ exitCode: code ?? 0, signal: signal || undefined });
      });
      child.on('error', err => {
        stderrLines.push(err.message);
        resolve({ exitCode: 1 });
      });
    });

    this.activeProcesses.set(executionId, {
      child,
      pid,
      stdout: stdoutLines,
      stderr: stderrLines,
      patchPath: patchOutPath,
      exitPromise
    });

    return { pid, executionId };
  }

  public async collectResult(executionId: string): Promise<AttemptResult> {
    const proc = this.activeProcesses.get(executionId);
    if (!proc) {
      throw new Error(`Execution ${executionId} not tracked.`);
    }

    const { exitCode } = await proc.exitPromise;
    let patchContent: string | undefined;

    if (proc.patchPath && fs.existsSync(proc.patchPath)) {
      try {
        patchContent = fs.readFileSync(proc.patchPath, 'utf8');
      } catch {}
    }

    const fullStdout = proc.stdout.join('');
    const fullStderr = proc.stderr.join('');

    return {
      success: exitCode === 0,
      exitCode,
      patch: patchContent,
      rawOutput: fullStdout,
      errorMessage: exitCode !== 0 ? fullStderr || 'Subprocess exited with non-zero exit code.' : undefined
    };
  }

  public async cancel(executionId: string): Promise<CancellationResult> {
    const proc = this.activeProcesses.get(executionId);
    if (!proc || !proc.pid) {
      return { confirmed: true, reason: 'Process already finished or unknown' };
    }

    try {
      if (process.platform === 'win32') {
        cp.execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' });
      } else {
        process.kill(-proc.pid, 'SIGKILL');
      }
      return { confirmed: true, terminatedPid: proc.pid };
    } catch {
      try {
        proc.child.kill('SIGKILL');
        return { confirmed: true, terminatedPid: proc.pid };
      } catch (err: any) {
        return { confirmed: false, reason: err.message };
      }
    }
  }
}
