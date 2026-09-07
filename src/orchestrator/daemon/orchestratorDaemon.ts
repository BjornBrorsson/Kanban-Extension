import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { OrchestratorRuntime } from '../core/orchestratorRuntime';
import { ConcurrencyQueue, ConcurrencyLimits } from '../scheduler/concurrencyQueue';
import { DependencyScheduler, ScheduledTask } from '../scheduler/dependencyScheduler';
import { AutonomousProfileManager, AutonomousProfileConfig } from '../scheduler/autonomousProfile';
import { Ticket } from '../../types';
import { RunnerAdapter } from '../adapters/types';

export interface DaemonInfo {
  pid: number;
  port: number;
  authToken: string;
  startedAt: number;
  workspaceRoot: string;
}

export interface DaemonConfig {
  workspaceRoot: string;
  port?: number;
  profileConfig?: AutonomousProfileConfig;
  concurrencyLimits?: ConcurrencyLimits;
  defaultAdapter?: RunnerAdapter;
}

export class OrchestratorDaemon {
  public readonly workspaceRoot: string;
  public readonly runtime: OrchestratorRuntime;
  public readonly concurrencyQueue: ConcurrencyQueue;
  public readonly profileManager: AutonomousProfileManager;
  private server: http.Server | null = null;
  private port: number = 0;
  private authToken: string = '';
  private startedAt: number = 0;
  private defaultAdapter?: RunnerAdapter;
  private isShuttingDown: boolean = false;

  constructor(config: DaemonConfig) {
    this.workspaceRoot = config.workspaceRoot;
    this.runtime = new OrchestratorRuntime(this.workspaceRoot);
    this.concurrencyQueue = new ConcurrencyQueue(config.concurrencyLimits || { maxGlobalWorkers: 2, maxWorkersPerBoard: 1 });
    this.profileManager = new AutonomousProfileManager(
      config.profileConfig || {
        profile: 'bounded-autonomous',
        maxBatchCeilingCurrency: 10.0,
        circuitBreakerThreshold: 3
      }
    );
    this.defaultAdapter = config.defaultAdapter;
  }

  public getDaemonInfoPath(): string {
    return path.join(this.workspaceRoot, '.agentic-kanban', 'runtime', 'daemon.json');
  }

  public async start(desiredPort: number = 0): Promise<DaemonInfo> {
    // 1. Initialize runtime and recover interrupted attempts
    await this.runtime.initialize();

    // 2. Generate secure authentication token
    this.authToken = crypto.randomBytes(24).toString('hex');
    this.startedAt = Date.now();

    // 3. Create HTTP server bound strictly to 127.0.0.1
    this.server = http.createServer(this.handleRequest.bind(this));

    await new Promise<void>((resolve, reject) => {
      this.server!.listen(desiredPort, '127.0.0.1', () => {
        const addr = this.server!.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
          resolve();
        } else {
          reject(new Error('Failed to obtain server listening address'));
        }
      });
      this.server!.on('error', reject);
    });

    const info: DaemonInfo = {
      pid: process.pid,
      port: this.port,
      authToken: this.authToken,
      startedAt: this.startedAt,
      workspaceRoot: this.workspaceRoot
    };

    // 4. Persist daemon info
    const runtimeDir = path.dirname(this.getDaemonInfoPath());
    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.writeFileSync(this.getDaemonInfoPath(), JSON.stringify(info, null, 2), 'utf8');

    // 5. Register process shutdown handlers
    const shutdownHook = () => {
      if (!this.isShuttingDown) {
        this.shutdown().catch(() => {});
      }
    };
    process.once('SIGINT', shutdownHook);
    process.once('SIGTERM', shutdownHook);

    return info;
  }

  public async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    // Delete daemon info
    const infoPath = this.getDaemonInfoPath();
    if (fs.existsSync(infoPath)) {
      try {
        fs.unlinkSync(infoPath);
      } catch {}
    }

    // Close HTTP server
    if (this.server) {
      await new Promise<void>(resolve => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }

    // Release workspace lock and cleanup
    this.runtime.dispose();
  }

  public getPort(): number {
    return this.port;
  }

  public getAuthToken(): string {
    return this.authToken;
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    res.setHeader('Content-Type', 'application/json');

    // 1. Verify Authorization Bearer token
    const authHeader = req.headers['authorization'];
    if (!authHeader || authHeader !== `Bearer ${this.authToken}`) {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: 'Unauthorized: Invalid or missing bearer token' }));
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    const method = req.method?.toUpperCase();

    try {
      if (method === 'GET' && url.pathname === '/status') {
        const activeLeases = this.runtime.leaseManager.listActiveLeases();
        const account = this.runtime.budgetManager.getAccount('EUR');
        res.statusCode = 200;
        res.end(JSON.stringify({
          running: true,
          pid: process.pid,
          startedAt: this.startedAt,
          scheduler: this.concurrencyQueue.getStatus(),
          profile: this.profileManager.getStatus(),
          leases: activeLeases,
          budget: account,
          interventions: this.profileManager.getInterventionQueue()
        }));
        return;
      }

      if (method === 'POST' && url.pathname === '/pause') {
        this.concurrencyQueue.pause();
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, paused: true }));
        return;
      }

      if (method === 'POST' && url.pathname === '/resume') {
        this.concurrencyQueue.resume();
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, paused: false }));
        return;
      }

      if (method === 'POST' && url.pathname === '/run') {
        const body = await this.readJsonBody(req);
        const readyTickets: Ticket[] = body.tickets || [];
        const boardId = body.boardId || 'default-board';

        // Evaluate ready tickets with DependencyScheduler
        const ticketsMap = new Map<string, Ticket[]>();
        ticketsMap.set(boardId, readyTickets);

        const readyTasks = DependencyScheduler.getReadyTasks(ticketsMap, new Set(body.completedIds || []));
        const nextTask = this.concurrencyQueue.selectNextTask(readyTasks);

        if (!nextTask) {
          res.statusCode = 200;
          res.end(JSON.stringify({
            dispatched: 0,
            status: this.concurrencyQueue.getPaused() ? 'paused' : 'idle',
            reason: readyTasks.length === 0 ? 'No ready tasks available' : 'Concurrency limit reached or queue paused'
          }));
          return;
        }

        // Check profile budget & breaker
        const check = this.profileManager.canDispatchNext(1.0);
        if (!check.allowed) {
          res.statusCode = 200;
          res.end(JSON.stringify({
            dispatched: 0,
            status: 'blocked',
            reason: check.reason
          }));
          return;
        }

        // Slot acquired
        this.concurrencyQueue.acquireSlot(boardId);
        let runResult: any = null;

        try {
          if (this.defaultAdapter) {
            runResult = await this.runtime.runAttempt(this.defaultAdapter, {
              ticketId: nextTask.ticket.id,
              agentId: this.defaultAdapter.name,
              objective: nextTask.ticket.title,
              targetFiles: []
            });

            this.profileManager.recordTaskOutcome({
              ticketId: nextTask.ticket.id,
              attemptId: runResult.attempt?.attemptId || 'att-unknown',
              success: runResult.success,
              actualSpent: 0.5
            });
          }
        } finally {
          this.concurrencyQueue.releaseSlot(boardId);
        }

        res.statusCode = 200;
        res.end(JSON.stringify({
          dispatched: 1,
          task: nextTask.ticket.id,
          result: runResult
        }));
        return;
      }

      if (method === 'POST' && url.pathname === '/cancel') {
        const body = await this.readJsonBody(req);
        if (!body.ticketId || !body.attemptId) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Missing ticketId or attemptId' }));
          return;
        }

        // Cancel attempt via cancellation controller
        const cancelRes = await this.runtime.cancelAttempt({
          ticketId: body.ticketId,
          attemptId: body.attemptId,
          executionId: body.executionId || body.attemptId,
          adapter: this.defaultAdapter || ({ name: 'unknown', tier: 'worker', stop: async () => {} } as any),
          leaseToken: body.leaseToken || 'revocation'
        });

        res.statusCode = 200;
        res.end(JSON.stringify(cancelRes));
        return;
      }

      if (method === 'GET' && url.pathname.startsWith('/review/')) {
        const ticketId = decodeURIComponent(url.pathname.substring('/review/'.length));
        const attemptsDir = path.join(this.workspaceRoot, '.agentic-kanban', 'runtime', 'attempts');
        let diff = '';
        let status = 'Unknown';
        let foundAttempt: any = null;

        if (fs.existsSync(attemptsDir)) {
          const files = fs.readdirSync(attemptsDir);
          for (const file of files) {
            if (file.endsWith('.json')) {
              try {
                const data = JSON.parse(fs.readFileSync(path.join(attemptsDir, file), 'utf8'));
                if (data.ticketId === ticketId) {
                  foundAttempt = data;
                  status = data.status;
                  diff = data.patchUnified || '';
                  break;
                }
              } catch {}
            }
          }
        }

        res.statusCode = 200;
        res.end(JSON.stringify({
          ticketId,
          status,
          diff,
          attempt: foundAttempt
        }));
        return;
      }

      if (method === 'POST' && url.pathname === '/stop') {
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, message: 'Daemon shutting down.' }));
        setImmediate(() => {
          this.shutdown().catch(() => {});
        });
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Endpoint not found' }));
    } catch (err: any) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message || 'Internal daemon error' }));
    }
  }

  private readJsonBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => {
        data += chunk;
      });
      req.on('end', () => {
        if (!data.trim()) {
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON payload'));
        }
      });
      req.on('error', reject);
    });
  }
}
