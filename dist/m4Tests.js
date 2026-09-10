"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// test/m4Tests.ts
var fs12 = __toESM(require("fs"));
var path14 = __toESM(require("path"));

// src/orchestrator/scheduler/dependencyScheduler.ts
var DependencyScheduler = class {
  /**
   * Evaluates dependencies across tickets and identifies which tickets are ready for dispatch.
   * A ticket is ready if and only if all of its `dependsOn` tickets are in the completedIds set.
   */
  static getReadyTasks(ticketsByBoard, completedIds) {
    const readyTasks = [];
    for (const [boardId, tickets] of ticketsByBoard.entries()) {
      for (const ticket of tickets) {
        if (completedIds.has(ticket.id) || ticket.status === "Completed" || ticket.column === "Completed") {
          continue;
        }
        const deps = ticket.dependsOn || [];
        const allDepsResolved = deps.every((depId) => completedIds.has(depId));
        if (allDepsResolved) {
          readyTasks.push({
            boardId,
            ticket,
            dependencies: deps,
            resolved: true
          });
        }
      }
    }
    return readyTasks;
  }
  /**
   * Generates a topologically sorted execution plan for a set of tickets.
   * Returns ordered ticket IDs or throws if a circular dependency exists.
   */
  static computeTopologicalOrder(tickets) {
    const ticketMap = /* @__PURE__ */ new Map();
    const inDegree = /* @__PURE__ */ new Map();
    const adjList = /* @__PURE__ */ new Map();
    for (const t of tickets) {
      ticketMap.set(t.id, t);
      inDegree.set(t.id, 0);
      adjList.set(t.id, []);
    }
    for (const t of tickets) {
      const deps = t.dependsOn || [];
      for (const depId of deps) {
        if (ticketMap.has(depId)) {
          adjList.get(depId).push(t.id);
          inDegree.set(t.id, (inDegree.get(t.id) || 0) + 1);
        }
      }
    }
    const queue = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) {
        queue.push(id);
      }
    }
    const order = [];
    while (queue.length > 0) {
      const curr = queue.shift();
      order.push(curr);
      const neighbors = adjList.get(curr) || [];
      for (const neighbor of neighbors) {
        const newDeg = inDegree.get(neighbor) - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) {
          queue.push(neighbor);
        }
      }
    }
    if (order.length !== tickets.length) {
      throw new Error("Cyclic dependency detected: Cannot establish topological execution order.");
    }
    return order;
  }
};

// src/orchestrator/scheduler/concurrencyQueue.ts
var ConcurrencyQueue = class {
  constructor(limits = { maxGlobalWorkers: 2, maxWorkersPerBoard: 1 }) {
    this.limits = limits;
  }
  isPaused = false;
  activeGlobalWorkers = 0;
  activeBoardWorkers = /* @__PURE__ */ new Map();
  boardQueueIndices = /* @__PURE__ */ new Map();
  pause() {
    this.isPaused = true;
  }
  resume() {
    this.isPaused = false;
  }
  getPaused() {
    return this.isPaused;
  }
  canDispatch(boardId) {
    if (this.isPaused)
      return false;
    if (this.activeGlobalWorkers >= this.limits.maxGlobalWorkers)
      return false;
    const currentBoardActive = this.activeBoardWorkers.get(boardId) || 0;
    if (currentBoardActive >= this.limits.maxWorkersPerBoard)
      return false;
    return true;
  }
  acquireSlot(boardId) {
    if (!this.canDispatch(boardId)) {
      return false;
    }
    this.activeGlobalWorkers++;
    this.activeBoardWorkers.set(boardId, (this.activeBoardWorkers.get(boardId) || 0) + 1);
    return true;
  }
  releaseSlot(boardId) {
    this.activeGlobalWorkers = Math.max(0, this.activeGlobalWorkers - 1);
    const boardCount = this.activeBoardWorkers.get(boardId) || 0;
    this.activeBoardWorkers.set(boardId, Math.max(0, boardCount - 1));
  }
  /**
   * Selects next dispatchable task using fair-share round-robin across boards.
   */
  selectNextTask(readyTasks) {
    if (this.isPaused || readyTasks.length === 0) {
      return null;
    }
    const boardGroups = /* @__PURE__ */ new Map();
    for (const task of readyTasks) {
      const list = boardGroups.get(task.boardId) || [];
      list.push(task);
      boardGroups.set(task.boardId, list);
    }
    const availableBoards = Array.from(boardGroups.keys()).filter((b) => this.canDispatch(b));
    if (availableBoards.length === 0) {
      return null;
    }
    for (const boardId of availableBoards) {
      const tasks = boardGroups.get(boardId);
      if (tasks.length > 0) {
        return tasks[0];
      }
    }
    return null;
  }
  getStatus() {
    const boardSlots = {};
    for (const [boardId, count] of this.activeBoardWorkers.entries()) {
      boardSlots[boardId] = count;
    }
    return {
      paused: this.isPaused,
      activeGlobal: this.activeGlobalWorkers,
      maxGlobal: this.limits.maxGlobalWorkers,
      boardSlots
    };
  }
};

// src/orchestrator/scheduler/autonomousProfile.ts
var AutonomousProfileManager = class {
  constructor(config) {
    this.config = config;
  }
  consecutiveTerminalFailures = 0;
  totalBatchSpent = 0;
  totalCompletedTickets = 0;
  interventionQueue = [];
  /**
   * Evaluates whether the next task can be scheduled under the active execution profile.
   * Pre-dispatch check: Halts immediately if batch ceiling would be exceeded or circuit breaker tripped.
   */
  canDispatchNext(requestedCost = 1) {
    if (this.config.profile === "plan-only") {
      return { allowed: false, reason: "Profile is plan-only: Code execution is disabled." };
    }
    const threshold = this.config.circuitBreakerThreshold || 3;
    if (this.consecutiveTerminalFailures >= threshold) {
      return {
        allowed: false,
        reason: `Circuit breaker tripped: ${this.consecutiveTerminalFailures} consecutive terminal task failures occurred.`
      };
    }
    if (this.config.maxCompletedTickets && this.totalCompletedTickets >= this.config.maxCompletedTickets) {
      return {
        allowed: false,
        reason: `Batch limit reached: Maximum ticket limit of ${this.config.maxCompletedTickets} completed.`
      };
    }
    if (this.config.maxBatchCeilingCurrency) {
      if (this.totalBatchSpent + requestedCost > this.config.maxBatchCeilingCurrency) {
        return {
          allowed: false,
          reason: `Batch ceiling reached: Total batch spend (${this.totalBatchSpent.toFixed(2)} + ${requestedCost.toFixed(2)}) exceeds ceiling of ${this.config.maxBatchCeilingCurrency.toFixed(2)} ${this.config.batchCurrency || "EUR"}.`
        };
      }
    }
    return { allowed: true };
  }
  /**
   * Records task outcome.
   * Note: Routine worker-to-lead escalation is EXPECTED behavior and does NOT increment terminal failures!
   */
  recordTaskOutcome(params) {
    this.totalBatchSpent += params.actualSpent;
    if (params.success) {
      this.consecutiveTerminalFailures = 0;
      this.totalCompletedTickets++;
    } else {
      if (params.wasRoutineEscalation) {
        return;
      }
      this.consecutiveTerminalFailures++;
      if (params.terminalFailureReason) {
        this.interventionQueue.push({
          ticketId: params.ticketId,
          attemptId: params.attemptId,
          timestamp: Date.now(),
          reason: params.terminalFailureReason,
          actionablePrompt: `Task ${params.ticketId} encountered a terminal failure: ${params.terminalFailureReason}. Please inspect workspace or clarify requirements.`
        });
      }
    }
  }
  getInterventionQueue() {
    return [...this.interventionQueue];
  }
  getStatus() {
    const threshold = this.config.circuitBreakerThreshold || 3;
    return {
      profile: this.config.profile,
      consecutiveFailures: this.consecutiveTerminalFailures,
      totalSpent: this.totalBatchSpent,
      completedCount: this.totalCompletedTickets,
      circuitBreakerTripped: this.consecutiveTerminalFailures >= threshold,
      interventionsCount: this.interventionQueue.length
    };
  }
};

// src/orchestrator/adapters/managedProcessAdapter.ts
var cp = __toESM(require("child_process"));
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var ManagedProcessAdapter = class {
  constructor(id, name, options) {
    this.options = options;
    this.id = id;
    this.name = name;
  }
  id;
  name;
  tier = "managed";
  activeProcesses = /* @__PURE__ */ new Map();
  async probe() {
    return {
      tier: "managed",
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
  async start(context, onEvent) {
    const executionId = `proc_${context.attemptId}_${Date.now()}`;
    const cwd = this.options.workingDir || context.workspaceRoot;
    const patchOutPath = path.join(cwd, ".agentic-kanban", "worktrees", `${context.attemptId}.patch`);
    const args = this.options.argsTemplate.map(
      (arg) => arg.replace("{ticket_id}", context.ticketId).replace("{attempt_id}", context.attemptId).replace("{objective}", context.objective).replace("{patch_out}", patchOutPath)
    );
    const child = cp.spawn(this.options.executable, args, {
      cwd,
      env: { ...process.env, ...this.options.env, ATTEMPT_ID: context.attemptId },
      stdio: ["pipe", "pipe", "pipe"]
    });
    const pid = child.pid || 0;
    const stdoutLines = [];
    const stderrLines = [];
    child.stdout?.on("data", (data) => {
      const text = data.toString();
      stdoutLines.push(text);
      if (onEvent) {
        onEvent({ type: "stdout", timestamp: Date.now(), message: text });
      }
    });
    child.stderr?.on("data", (data) => {
      const text = data.toString();
      stderrLines.push(text);
      if (onEvent) {
        onEvent({ type: "stderr", timestamp: Date.now(), message: text });
      }
    });
    const exitPromise = new Promise((resolve) => {
      child.on("close", (code, signal) => {
        resolve({ exitCode: code ?? 0, signal: signal || void 0 });
      });
      child.on("error", (err) => {
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
  async collectResult(executionId) {
    const proc = this.activeProcesses.get(executionId);
    if (!proc) {
      throw new Error(`Execution ${executionId} not tracked.`);
    }
    const { exitCode } = await proc.exitPromise;
    let patchContent;
    if (proc.patchPath && fs.existsSync(proc.patchPath)) {
      try {
        patchContent = fs.readFileSync(proc.patchPath, "utf8");
      } catch {
      }
    }
    const fullStdout = proc.stdout.join("");
    const fullStderr = proc.stderr.join("");
    return {
      success: exitCode === 0,
      exitCode,
      patch: patchContent,
      rawOutput: fullStdout,
      errorMessage: exitCode !== 0 ? fullStderr || "Subprocess exited with non-zero exit code." : void 0
    };
  }
  async cancel(executionId) {
    const proc = this.activeProcesses.get(executionId);
    if (!proc || !proc.pid) {
      return { confirmed: true, reason: "Process already finished or unknown" };
    }
    try {
      if (process.platform === "win32") {
        cp.execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: "ignore" });
      } else {
        process.kill(-proc.pid, "SIGKILL");
      }
      return { confirmed: true, terminatedPid: proc.pid };
    } catch {
      try {
        proc.child.kill("SIGKILL");
        return { confirmed: true, terminatedPid: proc.pid };
      } catch (err) {
        return { confirmed: false, reason: err.message };
      }
    }
  }
};

// src/orchestrator/adapters/clineAdapter.ts
var ClineManagedAdapter = class extends ManagedProcessAdapter {
  constructor(clineExecutable = "cline") {
    super("cline", "cline", {
      executable: clineExecutable,
      argsTemplate: [
        "--headless",
        "--workspace",
        "{workspace}",
        "--prompt",
        "{objective}",
        "--output-patch",
        "{patch}"
      ]
    });
  }
};

// src/orchestrator/adapters/copilotCliAdapter.ts
var CopilotCliAdapter = class extends ManagedProcessAdapter {
  constructor(copilotExecutable = "gh") {
    super("github-copilot-cli", "github-copilot-cli", {
      executable: copilotExecutable,
      argsTemplate: [
        "copilot",
        "run",
        "--prompt",
        "{objective}"
      ]
    });
  }
};

// src/orchestrator/adapters/devinCliAdapter.ts
var DevinCliAdapter = class extends ManagedProcessAdapter {
  constructor(devinExecutable = "devin") {
    super("devin-cli", "devin-cli", {
      executable: devinExecutable,
      argsTemplate: [
        "run",
        "--dir",
        "{workspace}",
        "--objective",
        "{objective}"
      ]
    });
  }
};

// src/orchestrator/adapters/antigravityAdapter.ts
var AntigravityManagedAdapter = class extends ManagedProcessAdapter {
  constructor(agyExecutable = "agy") {
    super("antigravity-cli", "Antigravity CLI", {
      executable: agyExecutable,
      argsTemplate: [
        "-p",
        "{objective}",
        "--dangerously-skip-permissions"
      ]
    });
  }
};

// src/orchestrator/daemon/orchestratorDaemon.ts
var http = __toESM(require("http"));
var fs10 = __toESM(require("fs"));
var path11 = __toESM(require("path"));
var crypto4 = __toESM(require("crypto"));

// src/orchestrator/core/runtimeJournal.ts
var fs3 = __toESM(require("fs"));
var path3 = __toESM(require("path"));

// src/orchestrator/models/ticketAttempt.ts
var crypto = __toESM(require("crypto"));
var fs2 = __toESM(require("fs"));
var path2 = __toESM(require("path"));
var TicketAttemptManager = class {
  /**
   * Generates a unique monotonic attempt ID.
   */
  static generateAttemptId(ticketId, generation) {
    const timestamp = Date.now();
    const randomSuffix = crypto.randomBytes(3).toString("hex");
    return `att_${ticketId.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}_g${generation}_${timestamp}_${randomSuffix}`;
  }
  /**
   * Computes SHA-256 hash of a string or file buffer.
   */
  static computeHash(content) {
    return crypto.createHash("sha256").update(content).digest("hex");
  }
  /**
   * Generates a snapshot manifest of baseline file contents.
   */
  static createManifest(baseRevision, filePaths) {
    const fileHashes = {};
    for (const fp of filePaths) {
      if (fs2.existsSync(fp) && !fs2.statSync(fp).isDirectory()) {
        const fileData = fs2.readFileSync(fp);
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
  static createAttempt(ticketId, generation, agentId, tier, manifest, budgetReservation, metadata) {
    const now = Date.now();
    return {
      attemptId: this.generateAttemptId(ticketId, generation),
      ticketId,
      generation,
      status: "Pending",
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
  static getRuntimeStoreDir(workspaceRoot) {
    const dir = path2.join(workspaceRoot, ".agentic-kanban", "runtime");
    if (!fs2.existsSync(dir)) {
      fs2.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }
  /**
   * Persists an attempt record durably to the runtime store.
   */
  static saveAttempt(workspaceRoot, attempt) {
    const attemptsDir = path2.join(this.getRuntimeStoreDir(workspaceRoot), "attempts");
    if (!fs2.existsSync(attemptsDir)) {
      fs2.mkdirSync(attemptsDir, { recursive: true });
    }
    attempt.updatedAt = Date.now();
    const filePath = path2.join(attemptsDir, `${attempt.attemptId}.json`);
    const tempPath = `${filePath}.tmp`;
    fs2.writeFileSync(tempPath, JSON.stringify(attempt, null, 2), "utf8");
    fs2.renameSync(tempPath, filePath);
  }
  /**
   * Reads an attempt record from disk.
   */
  static loadAttempt(workspaceRoot, attemptId) {
    const filePath = path2.join(this.getRuntimeStoreDir(workspaceRoot), "attempts", `${attemptId}.json`);
    if (!fs2.existsSync(filePath)) {
      return null;
    }
    try {
      const data = fs2.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
};

// src/orchestrator/core/runtimeJournal.ts
var RuntimeJournal = class {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
    this.runtimeDir = TicketAttemptManager.getRuntimeStoreDir(workspaceRoot);
    this.lockFile = path3.join(this.runtimeDir, "workspace.lock");
    this.journalFile = path3.join(this.runtimeDir, "journal.jsonl");
    this.ensureGitIgnore();
  }
  runtimeDir;
  lockFile;
  journalFile;
  isOwner = false;
  currentOwnerId = "";
  /**
   * Ensures .agentic-kanban/ is added to .gitignore if workspace is a git repo.
   */
  ensureGitIgnore() {
    try {
      const gitIgnorePath = path3.join(this.workspaceRoot, ".gitignore");
      if (fs3.existsSync(path3.join(this.workspaceRoot, ".git"))) {
        let content = "";
        if (fs3.existsSync(gitIgnorePath)) {
          content = fs3.readFileSync(gitIgnorePath, "utf8");
        }
        if (!content.includes(".agentic-kanban")) {
          const suffix = content.endsWith("\n") || !content ? "" : "\n";
          fs3.writeFileSync(gitIgnorePath, `${content}${suffix}# Agentic Kanban local runtime store
.agentic-kanban/
`, "utf8");
        }
      }
    } catch {
    }
  }
  /**
   * Acquires the exclusive workspace owner lock.
   * Stale lock recovery: If recorded process is no longer running, the stale lock is safely replaced.
   */
  acquireWorkspaceLock(ownerId = `process_${process.pid}`) {
    if (fs3.existsSync(this.lockFile)) {
      try {
        const lockContent = fs3.readFileSync(this.lockFile, "utf8");
        const lock = JSON.parse(lockContent);
        if (this.isPidAlive(lock.pid)) {
          if (lock.ownerId === ownerId || lock.pid === process.pid) {
            this.isOwner = true;
            this.currentOwnerId = ownerId;
            return true;
          }
          return false;
        } else {
          this.logEntry({
            timestamp: Date.now(),
            type: "CRASH_DETECTED",
            details: { previousPid: lock.pid, previousOwner: lock.ownerId, action: "recovering_stale_lock" }
          });
        }
      } catch {
      }
    }
    const lockData = {
      pid: process.pid,
      ownerId,
      acquiredAt: Date.now()
    };
    const tempLock = `${this.lockFile}.tmp`;
    fs3.writeFileSync(tempLock, JSON.stringify(lockData, null, 2), "utf8");
    fs3.renameSync(tempLock, this.lockFile);
    this.isOwner = true;
    this.currentOwnerId = ownerId;
    this.logEntry({
      timestamp: Date.now(),
      type: "LOCK_ACQUIRED",
      details: { pid: process.pid, ownerId }
    });
    return true;
  }
  /**
   * Releases workspace lock.
   */
  releaseWorkspaceLock() {
    if (this.isOwner && fs3.existsSync(this.lockFile)) {
      try {
        fs3.unlinkSync(this.lockFile);
        this.logEntry({
          timestamp: Date.now(),
          type: "LOCK_RELEASED",
          details: { ownerId: this.currentOwnerId }
        });
      } catch {
      }
      this.isOwner = false;
    }
  }
  /**
   * Appends an immutable log entry to journal.jsonl.
   */
  logEntry(entry) {
    try {
      const line = JSON.stringify(entry) + "\n";
      fs3.appendFileSync(this.journalFile, line, "utf8");
    } catch {
    }
  }
  /**
   * Transitions an attempt's state atomically in the durable store.
   */
  transitionAttempt(attemptId, toStatus, extra) {
    const attempt = TicketAttemptManager.loadAttempt(this.workspaceRoot, attemptId);
    if (!attempt) {
      throw new Error(`Cannot transition non-existent attempt: ${attemptId}`);
    }
    const fromStatus = attempt.status;
    attempt.status = toStatus;
    attempt.updatedAt = Date.now();
    if (toStatus === "Running" && !attempt.startedAt) {
      attempt.startedAt = Date.now();
    }
    if ((toStatus === "Completed" || toStatus === "Failed" || toStatus === "Cancelled") && !attempt.completedAt) {
      attempt.completedAt = Date.now();
    }
    if (extra) {
      Object.assign(attempt, extra);
    }
    TicketAttemptManager.saveAttempt(this.workspaceRoot, attempt);
    this.logEntry({
      timestamp: Date.now(),
      type: "ATTEMPT_TRANSITION",
      ticketId: attempt.ticketId,
      attemptId,
      fromStatus,
      toStatus,
      details: extra
    });
    return attempt;
  }
  /**
   * Scans store for active attempts interrupted by crash/restart.
   */
  scanInterruptedAttempts() {
    const attemptsDir = path3.join(this.runtimeDir, "attempts");
    if (!fs3.existsSync(attemptsDir))
      return [];
    const interrupted = [];
    const files = fs3.readdirSync(attemptsDir).filter((f) => f.endsWith(".json") && !f.endsWith(".tmp"));
    for (const f of files) {
      try {
        const data = fs3.readFileSync(path3.join(attemptsDir, f), "utf8");
        const attempt = JSON.parse(data);
        if (attempt.status === "Running" || attempt.status === "Pending") {
          interrupted.push(attempt);
        }
      } catch {
      }
    }
    return interrupted;
  }
  /**
   * Checks if PID is active on current OS.
   */
  isPidAlive(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch (err) {
      return err.code === "EPERM";
    }
  }
  getRuntimeDir() {
    return this.runtimeDir;
  }
};

// src/orchestrator/core/leaseManager.ts
var crypto2 = __toESM(require("crypto"));
var LeaseManager = class {
  constructor(workspaceRoot, journal, defaultLeaseDurationMs = 3e4) {
    this.workspaceRoot = workspaceRoot;
    this.journal = journal;
    this.defaultLeaseDurationMs = defaultLeaseDurationMs;
  }
  activeLeases = /* @__PURE__ */ new Map();
  ticketGenerations = /* @__PURE__ */ new Map();
  /**
   * Acquires or increments generation for a ticket and issues an expiring lease token.
   */
  acquireLease(ticketId, durationMs) {
    const currentGen = (this.ticketGenerations.get(ticketId) || 0) + 1;
    this.ticketGenerations.set(ticketId, currentGen);
    const token = `lease_${ticketId}_g${currentGen}_${crypto2.randomBytes(6).toString("hex")}`;
    const expiresAt = Date.now() + (durationMs || this.defaultLeaseDurationMs);
    const lease = {
      token,
      attemptId: "",
      // Assigned upon attempt creation
      ticketId,
      generation: currentGen,
      expiresAt,
      heartbeatIntervalMs: Math.floor((durationMs || this.defaultLeaseDurationMs) / 3)
    };
    this.activeLeases.set(token, lease);
    this.journal.logEntry({
      timestamp: Date.now(),
      type: "LEASE_ACQUIRED",
      ticketId,
      details: { token, generation: currentGen, expiresAt }
    });
    return lease;
  }
  /**
   * Associates a lease with its attempt record.
   */
  bindAttempt(token, attempt) {
    const lease = this.activeLeases.get(token);
    if (lease) {
      lease.attemptId = attempt.attemptId;
      attempt.leaseToken = token;
      attempt.leaseExpiresAt = lease.expiresAt;
      TicketAttemptManager.saveAttempt(this.workspaceRoot, attempt);
    }
  }
  /**
   * Extends lease expiration (heartbeat).
   */
  heartbeat(token, extendMs) {
    const lease = this.activeLeases.get(token);
    if (!lease)
      return false;
    if (Date.now() > lease.expiresAt) {
      this.revokeLease(token, "lease_expired_before_heartbeat");
      return false;
    }
    lease.expiresAt = Date.now() + (extendMs || this.defaultLeaseDurationMs);
    return true;
  }
  /**
   * Validates that a worker's lease is active, unexpired, and matches current ticket generation.
   * Stale workers with an outdated generation are rejected.
   */
  validateLease(token, ticketId, expectedGeneration) {
    const lease = this.activeLeases.get(token);
    if (!lease) {
      return { valid: false, reason: "Lease token not found or already revoked." };
    }
    if (lease.ticketId !== ticketId) {
      return { valid: false, reason: `Lease ticket mismatch: ${lease.ticketId} vs ${ticketId}` };
    }
    if (Date.now() > lease.expiresAt) {
      this.revokeLease(token, "lease_expired");
      return { valid: false, reason: "Lease has expired." };
    }
    const currentTicketGen = this.ticketGenerations.get(ticketId) || 0;
    if (lease.generation < currentTicketGen) {
      return { valid: false, reason: `Stale generation: lease is generation ${lease.generation}, current is ${currentTicketGen}.` };
    }
    if (expectedGeneration !== void 0 && lease.generation !== expectedGeneration) {
      return { valid: false, reason: `Generation mismatch: expected ${expectedGeneration}, got ${lease.generation}.` };
    }
    return { valid: true };
  }
  /**
   * Revokes a lease token.
   */
  revokeLease(token, reason = "manual_revocation") {
    const lease = this.activeLeases.get(token);
    if (lease) {
      this.activeLeases.delete(token);
      this.journal.logEntry({
        timestamp: Date.now(),
        type: "LEASE_EXPIRED",
        ticketId: lease.ticketId,
        attemptId: lease.attemptId,
        details: { token, reason }
      });
    }
  }
  getGeneration(ticketId) {
    return this.ticketGenerations.get(ticketId) || 0;
  }
  listActiveLeases() {
    return Array.from(this.activeLeases.values()).filter((l) => Date.now() <= l.expiresAt);
  }
};

// src/orchestrator/workspaces/workspaceManager.ts
var cp2 = __toESM(require("child_process"));
var fs4 = __toESM(require("fs"));
var path4 = __toESM(require("path"));
var WorkspaceManager = class {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
    this.worktreesDir = path4.join(this.workspaceRoot, ".agentic-kanban", "worktrees");
    if (!fs4.existsSync(this.worktreesDir)) {
      fs4.mkdirSync(this.worktreesDir, { recursive: true });
    }
  }
  worktreesDir;
  /**
   * Captures baseline revision SHA and file content hashes.
   */
  async captureBaseline(filePaths = []) {
    let baseRevision = "local-unversioned";
    try {
      if (this.isGitRepo()) {
        const rev = cp2.execSync("git rev-parse HEAD", { cwd: this.workspaceRoot, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
        baseRevision = rev || "git-initial";
      }
    } catch {
    }
    return TicketAttemptManager.createManifest(baseRevision, filePaths);
  }
  /**
   * Allocates an isolated workspace for an attempt.
   * Uses git worktree if git repo is clean; otherwise creates a guarded snapshot copy.
   */
  async allocate(attemptId, manifest) {
    const targetDir = path4.join(this.worktreesDir, attemptId);
    if (fs4.existsSync(targetDir)) {
      this.cleanup(attemptId);
    }
    const isCleanGit = this.isGitClean();
    if (isCleanGit) {
      try {
        cp2.execSync(`git worktree add -d "${targetDir}"`, { cwd: this.workspaceRoot, stdio: "ignore" });
        return {
          attemptId,
          workspacePath: targetDir,
          strategy: "git-worktree",
          manifest
        };
      } catch {
      }
    }
    fs4.mkdirSync(targetDir, { recursive: true });
    for (const [filePath] of Object.entries(manifest.fileHashes)) {
      if (fs4.existsSync(filePath)) {
        const relPath = path4.relative(this.workspaceRoot, filePath);
        const destPath = path4.join(targetDir, relPath);
        fs4.mkdirSync(path4.dirname(destPath), { recursive: true });
        fs4.copyFileSync(filePath, destPath);
      }
    }
    return {
      attemptId,
      workspacePath: targetDir,
      strategy: "snapshot",
      manifest
    };
  }
  /**
   * Generates a unified diff of modifications made in the allocated workspace against baseline.
   */
  captureDiff(allocation) {
    const diffs = [];
    for (const [origPath, origHash] of Object.entries(allocation.manifest.fileHashes)) {
      const relPath = path4.relative(this.workspaceRoot, origPath);
      const allocatedFilePath = path4.join(allocation.workspacePath, relPath);
      if (fs4.existsSync(allocatedFilePath)) {
        const newContent = fs4.readFileSync(allocatedFilePath, "utf8");
        const newHash = TicketAttemptManager.computeHash(Buffer.from(newContent, "utf8"));
        if (newHash !== origHash) {
          const oldContent = fs4.existsSync(origPath) ? fs4.readFileSync(origPath, "utf8") : "";
          diffs.push(this.createSimpleUnifiedDiff(relPath, oldContent, newContent));
        }
      }
    }
    return diffs.join("\n");
  }
  /**
   * Executes deterministic verification command inside allocated workspace.
   */
  async verify(allocation, command) {
    return new Promise((resolve) => {
      cp2.exec(command, { cwd: allocation.workspacePath, timeout: 6e4 }, (err, stdout, stderr) => {
        const exitCode = err ? typeof err.code === "number" ? err.code : 1 : 0;
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
  async integrate(allocation) {
    const conflicts = [];
    const filesToApply = [];
    for (const [origPath, expectedHash] of Object.entries(allocation.manifest.fileHashes)) {
      const relPath = path4.relative(this.workspaceRoot, origPath);
      const allocatedFilePath = path4.join(allocation.workspacePath, relPath);
      if (fs4.existsSync(allocatedFilePath)) {
        const newContent = fs4.readFileSync(allocatedFilePath);
        const newHash = TicketAttemptManager.computeHash(newContent);
        if (newHash !== expectedHash) {
          if (fs4.existsSync(origPath)) {
            const currentTargetContent = fs4.readFileSync(origPath);
            const currentTargetHash = TicketAttemptManager.computeHash(currentTargetContent);
            if (currentTargetHash !== expectedHash) {
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
        errorMessage: `Baseline divergence detected. The following files were modified externally during attempt: ${conflicts.join(", ")}`
      };
    }
    const applied = [];
    for (const item of filesToApply) {
      fs4.mkdirSync(path4.dirname(item.destPath), { recursive: true });
      fs4.copyFileSync(item.sourcePath, item.destPath);
      applied.push(path4.relative(this.workspaceRoot, item.destPath));
    }
    this.cleanup(allocation.attemptId);
    return {
      success: true,
      appliedFiles: applied
    };
  }
  /**
   * Cleans up allocated worktree or snapshot directory.
   */
  cleanup(attemptId) {
    const targetDir = path4.join(this.worktreesDir, attemptId);
    if (!fs4.existsSync(targetDir))
      return;
    try {
      if (this.isGitRepo()) {
        try {
          cp2.execSync(`git worktree remove --force "${targetDir}"`, { cwd: this.workspaceRoot, stdio: "ignore" });
        } catch {
        }
      }
      if (fs4.existsSync(targetDir)) {
        fs4.rmSync(targetDir, { recursive: true, force: true });
      }
    } catch {
    }
  }
  isGitRepo() {
    return fs4.existsSync(path4.join(this.workspaceRoot, ".git"));
  }
  isGitClean() {
    if (!this.isGitRepo())
      return false;
    try {
      const status = cp2.execSync("git status --porcelain", { cwd: this.workspaceRoot, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
      return status.length === 0;
    } catch {
      return false;
    }
  }
  createSimpleUnifiedDiff(filename, oldStr, newStr) {
    return `--- a/${filename}
+++ b/${filename}
@@ -1 +1 @@
-${oldStr.slice(0, 100)}
+${newStr.slice(0, 100)}`;
  }
};

// src/orchestrator/context/contextPackager.ts
var fs5 = __toESM(require("fs"));
var path5 = __toESM(require("path"));
var crypto3 = __toESM(require("crypto"));
var ContextPackager = class {
  /**
   * Computes SHA-256 hash for a file.
   */
  static hashFile(filePath) {
    if (!fs5.existsSync(filePath)) {
      return "";
    }
    const content = fs5.readFileSync(filePath);
    return crypto3.createHash("sha256").update(content).digest("hex");
  }
  /**
   * Builds an immutable, bounded DelegationPackage.
   */
  static packageForWorker(input) {
    const sourceReferences = [];
    const targets = input.targetFiles || [];
    for (const relOrAbs of targets) {
      const absPath = path5.isAbsolute(relOrAbs) ? relOrAbs : path5.join(input.workspaceRoot, relOrAbs);
      if (fs5.existsSync(absPath) && fs5.statSync(absPath).isFile()) {
        const relPath = path5.relative(input.workspaceRoot, absPath).replace(/\\/g, "/");
        sourceReferences.push({
          path: relPath,
          hash: this.hashFile(absPath)
        });
      }
    }
    const composite = sourceReferences.map((s) => `${s.path}:${s.hash}`).join(";");
    const baseRevision = crypto3.createHash("sha256").update(composite || input.ticketId).digest("hex").substring(0, 12);
    return {
      ticketId: input.ticketId,
      attemptId: input.attemptId,
      timestamp: Date.now(),
      objective: input.objective,
      allowedScope: input.allowedScope,
      constraints: input.constraints || [
        "Modify only files within allowedScope.",
        "Do not introduce external dependencies without escalation.",
        "Ensure all automated tests pass before requesting review."
      ],
      sourceReferences,
      baseRevision,
      currentDiff: input.currentDiff,
      failingChecks: input.failingChecks,
      openQuestions: input.openQuestions,
      allocatedBudget: input.budget || { currency: "EUR", maxUnits: 1 },
      nextSuggestedAction: input.nextSuggestedAction || "Implement required changes and run verification."
    };
  }
  /**
   * Persists the delegation package in .agentic-kanban/runtime/handoffs/
   */
  static persistPackage(workspaceRoot, pkg) {
    const handoffsDir = path5.join(workspaceRoot, ".agentic-kanban", "runtime", "handoffs");
    if (!fs5.existsSync(handoffsDir)) {
      fs5.mkdirSync(handoffsDir, { recursive: true });
    }
    const filePath = path5.join(handoffsDir, `${pkg.attemptId}.json`);
    fs5.writeFileSync(filePath, JSON.stringify(pkg, null, 2), "utf8");
    return filePath;
  }
  /**
   * Loads a persisted delegation package.
   */
  static loadPackage(workspaceRoot, attemptId) {
    const filePath = path5.join(workspaceRoot, ".agentic-kanban", "runtime", "handoffs", `${attemptId}.json`);
    if (!fs5.existsSync(filePath)) {
      return null;
    }
    try {
      return JSON.parse(fs5.readFileSync(filePath, "utf8"));
    } catch {
      return null;
    }
  }
};

// src/orchestrator/lead/escalationHandler.ts
var fs6 = __toESM(require("fs"));
var path7 = __toESM(require("path"));

// src/orchestrator/lead/delegationProtocol.ts
var path6 = __toESM(require("path"));
var DelegationProtocol = class {
  /**
   * Matches a normalized relative file path against an allowed scope pattern.
   * Supports:
   * - Exact matches: "src/Feature.ts"
   * - Directory prefixes: "src/**" or "src/"
   * - Extension wildcards: "*.ts" or "**\/*.ts"
   */
  static matchesScope(filePath, pattern) {
    const normPath = filePath.replace(/\\/g, "/");
    const normPattern = pattern.replace(/\\/g, "/");
    if (normPattern === "*" || normPattern === "**" || normPattern === "**/*") {
      return true;
    }
    if (normPath === normPattern) {
      return true;
    }
    if (normPattern.endsWith("/**")) {
      const prefix = normPattern.slice(0, -3);
      return normPath.startsWith(prefix + "/");
    }
    if (normPattern.endsWith("/")) {
      return normPath.startsWith(normPattern);
    }
    if (normPattern.startsWith("*.") || normPattern.startsWith("**/*.")) {
      const ext = normPattern.split(".").pop();
      return normPath.endsWith(`.${ext}`);
    }
    if (!normPattern.includes("/")) {
      const baseName = path6.basename(normPath);
      return baseName === normPattern;
    }
    return false;
  }
  /**
   * Validates that all modified files in a worker's attempt strictly conform to the allowedScope.
   */
  static validateScope(modifiedFiles, allowedScope, workspaceRoot) {
    if (!allowedScope || allowedScope.length === 0) {
      return { valid: true, violatedFiles: [] };
    }
    const violatedFiles = [];
    for (const file of modifiedFiles) {
      let relPath = file;
      if (workspaceRoot && path6.isAbsolute(file)) {
        relPath = path6.relative(workspaceRoot, file);
      }
      relPath = relPath.replace(/\\/g, "/");
      const matchesAny = allowedScope.some((pattern) => this.matchesScope(relPath, pattern));
      if (!matchesAny) {
        violatedFiles.push(relPath);
      }
    }
    if (violatedFiles.length > 0) {
      return {
        valid: false,
        violatedFiles,
        reason: `Scope expansion detected: Worker modified file(s) outside allowedScope [${allowedScope.join(", ")}]: ${violatedFiles.join(", ")}`
      };
    }
    return { valid: true, violatedFiles: [] };
  }
  /**
   * Extracts list of changed files from a unified diff string.
   */
  static extractFilesFromDiff(diff) {
    const files = /* @__PURE__ */ new Set();
    const lines = diff.split("\n");
    for (const line of lines) {
      if (line.startsWith("--- a/") || line.startsWith("+++ b/")) {
        const file = line.substring(6).trim();
        if (file && file !== "/dev/null") {
          files.add(file);
        }
      }
    }
    return Array.from(files);
  }
};

// src/orchestrator/lead/escalationHandler.ts
var EscalationHandler = class {
  constructor(workspaceRoot, journal, leaseManager, workspaceManager) {
    this.workspaceRoot = workspaceRoot;
    this.journal = journal;
    this.leaseManager = leaseManager;
    this.workspaceManager = workspaceManager;
  }
  /**
   * Evaluates whether an attempt should trigger escalation based on execution results.
   */
  evaluateEscalationTriggers(params) {
    const { ticketId, attemptId, workerId, delegationPackage, diff, verificationResult, consecutiveFailures = 0, maxRetries = 2, errorText } = params;
    if (diff) {
      const modifiedFiles = DelegationProtocol.extractFilesFromDiff(diff);
      const scopeCheck = DelegationProtocol.validateScope(modifiedFiles, delegationPackage.allowedScope);
      if (!scopeCheck.valid) {
        return this.createEscalationRecord({
          ticketId,
          attemptId,
          workerId,
          triggerType: "OUT_OF_SCOPE",
          message: scopeCheck.reason || "Worker edited files outside allowed scope.",
          checkpointDiff: diff,
          violatedFiles: scopeCheck.violatedFiles
        });
      }
    }
    if (verificationResult && !verificationResult.passed) {
      if (consecutiveFailures >= maxRetries) {
        return this.createEscalationRecord({
          ticketId,
          attemptId,
          workerId,
          triggerType: "RETRY_LIMIT_EXCEEDED",
          message: `Worker exceeded retry limit (${maxRetries}) on verification failure.`,
          checkpointDiff: diff,
          failingChecks: verificationResult.command ? [{ command: verificationResult.command, output: verificationResult.error || "" }] : void 0
        });
      }
    }
    if (errorText) {
      const lower = errorText.toLowerCase();
      if (lower.includes("ambiguous") || lower.includes("architectural decision") || lower.includes("clarification needed")) {
        return this.createEscalationRecord({
          ticketId,
          attemptId,
          workerId,
          triggerType: "AMBIGUITY_DETECTED",
          message: `Worker requested clarification: ${errorText}`,
          checkpointDiff: diff
        });
      }
    }
    return null;
  }
  /**
   * Creates, logs, and persists an escalation record.
   */
  createEscalationRecord(data) {
    const escalationId = `esc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const record = {
      escalationId,
      ticketId: data.ticketId,
      attemptId: data.attemptId,
      timestamp: Date.now(),
      triggerType: data.triggerType,
      message: data.message,
      workerId: data.workerId,
      checkpointDiff: data.checkpointDiff,
      failingChecks: data.failingChecks,
      violatedFiles: data.violatedFiles,
      resolved: false
    };
    this.journal.logEntry({
      timestamp: record.timestamp,
      type: "ESCALATION_TRIGGERED",
      ticketId: data.ticketId,
      attemptId: data.attemptId,
      details: {
        escalationId,
        triggerType: data.triggerType,
        workerId: data.workerId,
        message: data.message
      }
    });
    const escDir = path7.join(this.workspaceRoot, ".agentic-kanban", "runtime", "escalations");
    if (!fs6.existsSync(escDir)) {
      fs6.mkdirSync(escDir, { recursive: true });
    }
    fs6.writeFileSync(path7.join(escDir, `${escalationId}.json`), JSON.stringify(record, null, 2), "utf8");
    return record;
  }
  /**
   * Executes Lead Checkpoint Takeover:
   * 1. Atomically revokes worker's write lease.
   * 2. Acquires fresh attempt lease for Lead.
   * 3. Invokes Lead adapter with the worker's checkpoint diff and failing check context.
   * 4. If Lead resolves it, updates escalation record and returns resolved patch.
   */
  async executeLeadTakeover(escalation, leadAdapter, workerLeaseToken, allocation, leadObjectiveOverride) {
    this.leaseManager.revokeLease(workerLeaseToken, "lead_takeover");
    const leadLease = this.leaseManager.acquireLease(escalation.ticketId);
    this.journal.logEntry({
      timestamp: Date.now(),
      type: "LEAD_TAKEOVER_STARTED",
      ticketId: escalation.ticketId,
      attemptId: escalation.attemptId,
      details: {
        escalationId: escalation.escalationId,
        leadGeneration: leadLease.generation
      }
    });
    const leadObjective = leadObjectiveOverride || `Lead Takeover for ticket ${escalation.ticketId}: Resolve blocker (${escalation.triggerType}): ${escalation.message}. Resume from checkpoint diff.`;
    try {
      const startResult = await leadAdapter.start({
        ticketId: escalation.ticketId,
        attemptId: `lead-takeover-${escalation.attemptId}`,
        objective: leadObjective,
        workspaceRoot: allocation.workspacePath,
        role: "lead",
        allocatedBudget: { currency: "EUR", maxUnits: 2 }
      });
      const result = await leadAdapter.collectResult(startResult.executionId);
      const leaseCheck = this.leaseManager.validateLease(leadLease.token, escalation.ticketId, leadLease.generation);
      if (!leaseCheck.valid) {
        return {
          success: false,
          outcome: "FAILED",
          errorMessage: `Lead lease expired or invalid: ${leaseCheck.reason}`
        };
      }
      if (result.success) {
        escalation.resolved = true;
        escalation.resolutionStrategy = "LEAD_TAKEOVER";
        escalation.resolutionNotes = "Lead successfully resolved the blocker and produced a verified patch.";
        this.updateEscalationRecord(escalation);
        this.leaseManager.revokeLease(leadLease.token, "lead_takeover_completed");
        return {
          success: true,
          resolvedPatch: result.patch || this.workspaceManager.captureDiff(allocation),
          leadAttemptId: `lead-takeover-${escalation.attemptId}`,
          outcome: "RESOLVED_BY_LEAD"
        };
      } else {
        escalation.resolved = false;
        escalation.resolutionStrategy = "HUMAN_ASSISTANCE_REQUIRED";
        escalation.resolutionNotes = `Lead takeover could not automatically resolve issue: ${result.errorMessage}`;
        this.updateEscalationRecord(escalation);
        this.leaseManager.revokeLease(leadLease.token, "escalated_to_human");
        return {
          success: false,
          outcome: "NEEDS_HUMAN_ASSISTANCE",
          errorMessage: result.errorMessage || "Automated lead resolution failed."
        };
      }
    } catch (err) {
      this.leaseManager.revokeLease(leadLease.token, "lead_takeover_error");
      return {
        success: false,
        outcome: "FAILED",
        errorMessage: `Lead takeover error: ${err.message}`
      };
    }
  }
  updateEscalationRecord(record) {
    const escDir = path7.join(this.workspaceRoot, ".agentic-kanban", "runtime", "escalations");
    const filePath = path7.join(escDir, `${record.escalationId}.json`);
    if (fs6.existsSync(filePath)) {
      fs6.writeFileSync(filePath, JSON.stringify(record, null, 2), "utf8");
    }
  }
};

// src/orchestrator/review/reviewManager.ts
var fs7 = __toESM(require("fs"));
var path8 = __toESM(require("path"));
var import_child_process = require("child_process");
var import_util = require("util");
var execAsync = (0, import_util.promisify)(import_child_process.exec);
var ReviewManager = class {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
  }
  /**
   * Independently executes a verification command in the allocated workspace.
   * Captured in immutable evidence.
   */
  async runIndependentVerification(allocation, ticketId, command) {
    const timestamp = Date.now();
    let stdout = "";
    let stderr = "";
    let exitCode = 0;
    let passed = false;
    try {
      const result = await execAsync(command, {
        cwd: allocation.workspacePath,
        timeout: 6e4,
        maxBuffer: 10 * 1024 * 1024
      });
      stdout = result.stdout;
      stderr = result.stderr;
      passed = true;
      exitCode = 0;
    } catch (err) {
      stdout = err.stdout || "";
      stderr = err.stderr || err.message || "";
      exitCode = typeof err.code === "number" ? err.code : 1;
      passed = false;
    }
    const evidence = {
      attemptId: allocation.attemptId,
      ticketId,
      timestamp,
      command,
      passed,
      exitCode,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      workspaceHash: allocation.manifest ? JSON.stringify(allocation.manifest).substring(0, 16) : void 0
    };
    this.persistEvidence(evidence);
    return evidence;
  }
  /**
   * Performs the Fresh Lead Review against criteria and the generated unified diff.
   */
  performFreshReview(params) {
    const { ticketId, attemptId, reviewerId = "fresh-lead-reviewer", patchDiff, acceptanceCriteria, verificationEvidence } = params;
    const criteriaChecked = [];
    const regressionRisks = [];
    for (const criterion of acceptanceCriteria) {
      const criterionLower = criterion.toLowerCase();
      let criterionPassed = true;
      let notes = "Verified in patch diff and passing automated checks.";
      if (!verificationEvidence.passed) {
        criterionPassed = false;
        notes = `Failed verification command: ${verificationEvidence.command}`;
      } else if (!patchDiff || patchDiff.trim().length === 0) {
        criterionPassed = false;
        notes = "No code changes found in patch diff.";
      }
      criteriaChecked.push({
        criterion,
        passed: criterionPassed,
        notes
      });
    }
    if (patchDiff.includes("+  // TODO") || patchDiff.includes("+  // FIXME")) {
      regressionRisks.push("Unresolved TODO/FIXME markers introduced in patch.");
    }
    if (patchDiff.includes("+console.error(") && !patchDiff.includes("catch")) {
      regressionRisks.push("Uncaught console error log added.");
    }
    const allPassed = verificationEvidence.passed && criteriaChecked.every((c) => c.passed);
    const decision = {
      reviewId: `rev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      attemptId,
      ticketId,
      reviewerId,
      timestamp: Date.now(),
      approved: allPassed,
      criteriaChecked,
      regressionRisks,
      feedback: allPassed ? "Patch cleanly satisfies all acceptance criteria and verified by independent test suite." : `Patch failed review: ${criteriaChecked.filter((c) => !c.passed).map((c) => c.criterion).join("; ")}`
    };
    this.persistReviewDecision(decision);
    return decision;
  }
  /**
   * Gating check: Evaluates whether an attempt has both passing verification evidence and an approved lead review.
   */
  canTransitionToDone(attemptId) {
    const evidence = this.loadEvidence(attemptId);
    if (!evidence) {
      return { allowed: false, reason: "Missing independent verification evidence." };
    }
    if (!evidence.passed) {
      return { allowed: false, reason: `Verification failed with exit code ${evidence.exitCode}: ${evidence.command}` };
    }
    const decision = this.loadReviewDecision(attemptId);
    if (!decision) {
      return { allowed: false, reason: "Missing fresh lead review decision." };
    }
    if (!decision.approved) {
      return { allowed: false, reason: `Lead review was not approved: ${decision.feedback}` };
    }
    return { allowed: true };
  }
  persistEvidence(evidence) {
    const dir = path8.join(this.workspaceRoot, ".agentic-kanban", "runtime", "evidence");
    if (!fs7.existsSync(dir)) {
      fs7.mkdirSync(dir, { recursive: true });
    }
    fs7.writeFileSync(path8.join(dir, `${evidence.attemptId}.json`), JSON.stringify(evidence, null, 2), "utf8");
  }
  loadEvidence(attemptId) {
    const file = path8.join(this.workspaceRoot, ".agentic-kanban", "runtime", "evidence", `${attemptId}.json`);
    if (!fs7.existsSync(file))
      return null;
    try {
      return JSON.parse(fs7.readFileSync(file, "utf8"));
    } catch {
      return null;
    }
  }
  persistReviewDecision(decision) {
    const dir = path8.join(this.workspaceRoot, ".agentic-kanban", "runtime", "reviews");
    if (!fs7.existsSync(dir)) {
      fs7.mkdirSync(dir, { recursive: true });
    }
    fs7.writeFileSync(path8.join(dir, `${decision.attemptId}.json`), JSON.stringify(decision, null, 2), "utf8");
  }
  loadReviewDecision(attemptId) {
    const file = path8.join(this.workspaceRoot, ".agentic-kanban", "runtime", "reviews", `${attemptId}.json`);
    if (!fs7.existsSync(file))
      return null;
    try {
      return JSON.parse(fs7.readFileSync(file, "utf8"));
    } catch {
      return null;
    }
  }
};

// src/orchestrator/policy/providerEligibility.ts
var ProviderRegistry = class {
  static registry = /* @__PURE__ */ new Map([
    [
      "ollama",
      {
        id: "ollama",
        displayName: "Ollama (Local Models)",
        region: "LOCAL",
        endpointHost: "localhost",
        isLocalOnly: true,
        isAuditable: true,
        subprocessors: [],
        dataRetentionDays: 0
      }
    ],
    [
      "llama.cpp",
      {
        id: "llama.cpp",
        displayName: "llama.cpp (Local Server)",
        region: "LOCAL",
        endpointHost: "localhost",
        isLocalOnly: true,
        isAuditable: true,
        subprocessors: [],
        dataRetentionDays: 0
      }
    ],
    [
      "fake-deterministic",
      {
        id: "fake-deterministic",
        displayName: "Fake Deterministic Test Runner",
        region: "LOCAL",
        endpointHost: "localhost",
        isLocalOnly: true,
        isAuditable: true,
        subprocessors: [],
        dataRetentionDays: 0
      }
    ],
    [
      "mistral-eu",
      {
        id: "mistral-eu",
        displayName: "Mistral AI (EU Endpoint)",
        region: "EU",
        endpointHost: "api.mistral.ai",
        isLocalOnly: false,
        isAuditable: true,
        subprocessors: ["Mistral AI SAS (France)"],
        dataRetentionDays: 30
      }
    ],
    [
      "claude-eu",
      {
        id: "claude-eu",
        displayName: "Anthropic Claude (EU Residency)",
        region: "EU",
        endpointHost: "api.anthropic.com",
        isLocalOnly: false,
        isAuditable: true,
        subprocessors: ["AWS Europe (Frankfurt)", "GCP Europe (Belgium)"],
        dataRetentionDays: 30
      }
    ],
    [
      "claude-global",
      {
        id: "claude-global",
        displayName: "Anthropic Claude (Global)",
        region: "GLOBAL",
        endpointHost: "api.anthropic.com",
        isLocalOnly: false,
        isAuditable: true,
        subprocessors: ["Anthropic PBC (US)"],
        dataRetentionDays: 30
      }
    ],
    [
      "openai-global",
      {
        id: "openai-global",
        displayName: "OpenAI GPT-4o (Global)",
        region: "GLOBAL",
        endpointHost: "api.openai.com",
        isLocalOnly: false,
        isAuditable: true,
        subprocessors: ["OpenAI LLC (US)"],
        dataRetentionDays: 30
      }
    ],
    [
      "opaque-cli",
      {
        id: "opaque-cli",
        displayName: "Unspecified Remote CLI (Opaque Routing)",
        region: "GLOBAL",
        endpointHost: "unknown",
        isLocalOnly: false,
        isAuditable: false,
        subprocessors: ["Unknown"],
        dataRetentionDays: -1
      }
    ]
  ]);
  static getProvider(providerId) {
    return this.registry.get(providerId.toLowerCase());
  }
  static registerProvider(metadata) {
    this.registry.set(metadata.id.toLowerCase(), metadata);
  }
  static getAllProviders() {
    return Array.from(this.registry.values());
  }
};

// src/orchestrator/policy/policyEngine.ts
var PolicyEngine = class {
  /**
   * Evaluates provider eligibility strictly against board configuration policies.
   * Order of evaluation: Policy Eligibility is checked first before capabilities or budget.
   */
  static evaluateEligibility(input) {
    const { providerId, policies } = input;
    const provider = ProviderRegistry.getProvider(providerId) || {
      id: providerId,
      displayName: providerId,
      region: "GLOBAL",
      endpointHost: "unknown",
      isLocalOnly: false,
      isAuditable: false,
      subprocessors: ["Unknown"],
      dataRetentionDays: -1
    };
    const violations = [];
    const reasons = [];
    if (policies.localOnly) {
      if (!provider.isLocalOnly) {
        violations.push(
          `Local-only policy violation: Provider '${provider.displayName}' connects to non-local host '${provider.endpointHost}'.`
        );
      } else {
        reasons.push(`Satisfies local-only policy (runs strictly on localhost).`);
      }
    }
    if (policies.euOnly) {
      const isEuOrLocal = provider.region === "EU" || provider.region === "LOCAL";
      if (!isEuOrLocal) {
        violations.push(
          `EU-only policy violation: Provider '${provider.displayName}' operates in region '${provider.region}' (must be EU or LOCAL).`
        );
      } else {
        reasons.push(`Satisfies EU-only policy (residency region: ${provider.region}).`);
      }
    }
    if (policies.strictMode) {
      if (!provider.isAuditable) {
        violations.push(
          `Strict compliance violation: Provider '${provider.displayName}' has opaque routing or unknown network telemetry.`
        );
      }
      if (provider.endpointHost === "unknown") {
        violations.push(
          `Strict compliance violation: Unknown endpoint destination for '${provider.displayName}'.`
        );
      }
    }
    const eligible = violations.length === 0;
    return {
      eligible,
      provider,
      violations,
      reasons: eligible ? reasons : violations
    };
  }
  /**
   * Filters a list of candidate providers to only those that pass policy eligibility.
   * Never falls back to an ineligible provider regardless of cost!
   */
  static filterEligibleProviders(candidateIds, policies) {
    const eligible = [];
    const rejected = [];
    for (const id of candidateIds) {
      const evalResult = this.evaluateEligibility({ providerId: id, policies });
      if (evalResult.eligible) {
        eligible.push(id);
      } else {
        rejected.push({ providerId: id, violations: evalResult.violations });
      }
    }
    return { eligible, rejected };
  }
};

// src/orchestrator/policy/budgetManager.ts
var fs8 = __toESM(require("fs"));
var path9 = __toESM(require("path"));
var BudgetManager = class {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
    this.storePath = path9.join(workspaceRoot, ".agentic-kanban", "runtime", "budgets.json");
    this.loadState();
  }
  storePath;
  accounts = /* @__PURE__ */ new Map();
  activeReservations = /* @__PURE__ */ new Map();
  rateLimits = /* @__PURE__ */ new Map();
  /**
   * Initializes or updates a budget account.
   */
  registerAccount(account) {
    this.accounts.set(account.currency.toUpperCase(), account);
    this.saveState();
  }
  getAccount(currency) {
    const key = currency.toUpperCase();
    if (!this.accounts.has(key)) {
      this.accounts.set(key, {
        currency: key,
        totalCeiling: 100,
        // Default ceiling
        totalSpentReported: 0,
        totalSpentEstimated: 0,
        totalReserved: 0,
        isSubscriptionQuota: false
      });
    }
    return this.accounts.get(key);
  }
  /**
   * Atomically reserves funds before dispatch.
   * Pre-dispatch check: Halts immediately if available funds < reservation.
   * Enforces Lead Review reserve priority (holds minimum reserve for final review).
   */
  reserve(params) {
    const currency = (params.currency || "EUR").toUpperCase();
    const account = this.getAccount(currency);
    const available = account.totalCeiling - (account.totalSpentReported + account.totalSpentEstimated + account.totalReserved);
    if (available < params.totalAmount) {
      return {
        allowed: false,
        remainingBefore: available,
        reason: `Budget exhausted: Available ${available.toFixed(2)} ${currency} is less than requested reservation ${params.totalAmount.toFixed(2)} ${currency}.`
      };
    }
    const leadReviewReserved = params.leadReviewPortion || Math.min(params.totalAmount * 0.3, 0.5);
    const workerReserved = Math.max(0, params.totalAmount - leadReviewReserved);
    account.totalReserved += params.totalAmount;
    const reservation = {
      ticketId: params.ticketId,
      attemptId: params.attemptId,
      amount: params.totalAmount,
      currency,
      timestamp: Date.now(),
      leadReviewReserved,
      workerReserved,
      reconciled: false
    };
    this.activeReservations.set(params.attemptId, reservation);
    this.saveState();
    return {
      allowed: true,
      reservation,
      remainingBefore: available,
      remainingAfter: available - params.totalAmount
    };
  }
  /**
   * Reconciles actual spending when attempt completes.
   * Decrements reservation and increments spent account balance.
   */
  reconcile(params) {
    const reservation = this.activeReservations.get(params.attemptId);
    if (!reservation || reservation.reconciled) {
      return;
    }
    const account = this.getAccount(reservation.currency);
    account.totalReserved = Math.max(0, account.totalReserved - reservation.amount);
    if (params.isReported) {
      account.totalSpentReported += params.actualSpent;
    } else {
      account.totalSpentEstimated += params.actualSpent;
    }
    reservation.reconciled = true;
    this.activeReservations.delete(params.attemptId);
    this.saveState();
  }
  /**
   * Releases full reservation if attempt cancelled or aborted before execution.
   */
  releaseReservation(attemptId) {
    const reservation = this.activeReservations.get(attemptId);
    if (reservation && !reservation.reconciled) {
      const account = this.getAccount(reservation.currency);
      account.totalReserved = Math.max(0, account.totalReserved - reservation.amount);
      this.activeReservations.delete(attemptId);
      this.saveState();
    }
  }
  /**
   * Checks rate limit for a provider (RPM / TPM sliding window).
   */
  checkRateLimit(providerId, maxRpm, tokensRequested, maxTpm) {
    const now = Date.now();
    let window = this.rateLimits.get(providerId);
    if (!window) {
      window = { maxRpm, maxTpm, requestTimestamps: [], tokenCounts: [] };
      this.rateLimits.set(providerId, window);
    }
    window.requestTimestamps = window.requestTimestamps.filter((t) => now - t < 6e4);
    window.tokenCounts = window.tokenCounts.filter((t) => now - t.timestamp < 6e4);
    if (window.requestTimestamps.length >= maxRpm) {
      return false;
    }
    if (maxTpm && tokensRequested) {
      const currentTokens = window.tokenCounts.reduce((sum, t) => sum + t.tokens, 0);
      if (currentTokens + tokensRequested > maxTpm) {
        return false;
      }
    }
    window.requestTimestamps.push(now);
    if (tokensRequested) {
      window.tokenCounts.push({ timestamp: now, tokens: tokensRequested });
    }
    return true;
  }
  loadState() {
    if (fs8.existsSync(this.storePath)) {
      try {
        const raw = JSON.parse(fs8.readFileSync(this.storePath, "utf8"));
        if (raw.accounts) {
          for (const acc of raw.accounts) {
            this.accounts.set(acc.currency, acc);
          }
        }
      } catch {
      }
    }
  }
  saveState() {
    const dir = path9.dirname(this.storePath);
    if (!fs8.existsSync(dir)) {
      fs8.mkdirSync(dir, { recursive: true });
    }
    const data = {
      accounts: Array.from(this.accounts.values()),
      reservations: Array.from(this.activeReservations.values()),
      updatedAt: Date.now()
    };
    fs8.writeFileSync(this.storePath, JSON.stringify(data, null, 2), "utf8");
  }
};

// src/orchestrator/policy/egressController.ts
var fs9 = __toESM(require("fs"));
var path10 = __toESM(require("path"));
var EgressController = class {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
    this.auditLogPath = path10.join(workspaceRoot, ".agentic-kanban", "runtime", "audit.log");
  }
  auditLogPath;
  /**
   * Validates whether outbound communication to an endpoint host is allowed by active policies.
   */
  isEgressAllowed(params) {
    const { endpointHost, localOnly, euOnly, allowedDomains = [] } = params;
    const host = endpointHost.toLowerCase();
    if (localOnly) {
      if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
        return { allowed: true, reason: "Allowed by local-only policy (loopback)." };
      }
      return { allowed: false, reason: `Egress blocked: Local-only policy prohibits external host '${endpointHost}'.` };
    }
    if (allowedDomains.length > 0) {
      const match = allowedDomains.some((d) => host === d.toLowerCase() || host.endsWith("." + d.toLowerCase()));
      if (!match) {
        return { allowed: false, reason: `Egress blocked: Host '${endpointHost}' not in allowed domain whitelist.` };
      }
    }
    if (euOnly) {
      if (host.includes("us-") || host.endsWith(".us") || host.includes("global")) {
        return { allowed: false, reason: `Egress blocked: Non-EU regional endpoint '${endpointHost}' forbidden.` };
      }
    }
    return { allowed: true, reason: "Endpoint egress allowed by policy." };
  }
  /**
   * Generates environment variables for subprocess execution based on policy.
   * If localOnly, injects offline flags.
   */
  getEnvironmentOverrides(localOnly) {
    if (localOnly) {
      return {
        OFFLINE: "1",
        HF_HUB_OFFLINE: "1",
        TRANSFORMERS_OFFLINE: "1",
        NO_PROXY: "*",
        CURL_CA_BUNDLE: ""
      };
    }
    return {};
  }
  /**
   * Appends an audit entry to the local append-only audit.log.
   */
  logAudit(entry) {
    try {
      const dir = path10.dirname(this.auditLogPath);
      if (!fs9.existsSync(dir)) {
        fs9.mkdirSync(dir, { recursive: true });
      }
      const line = `[${new Date(entry.timestamp).toISOString()}] [${entry.allowed ? "ALLOW" : "DENY"}] ticket=${entry.ticketId} attempt=${entry.attemptId} provider=${entry.providerId} host=${entry.targetEndpoint} action=${entry.action} rule="${entry.policyRule}"
`;
      fs9.appendFileSync(this.auditLogPath, line, "utf8");
    } catch {
    }
  }
};

// src/orchestrator/core/cancellationController.ts
var cp3 = __toESM(require("child_process"));
var CancellationController = class _CancellationController {
  constructor(journal, leaseManager, budgetManager) {
    this.journal = journal;
    this.leaseManager = leaseManager;
    this.budgetManager = budgetManager;
  }
  /**
   * Checks whether a system process PID is alive.
   */
  static isPidAlive(pid) {
    try {
      if (process.platform === "win32") {
        const out = cp3.execSync(`tasklist /FI "PID eq ${pid}" /NH`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
        return out.includes(String(pid));
      } else {
        process.kill(pid, 0);
        return true;
      }
    } catch {
      return false;
    }
  }
  /**
   * Coordinated attempt cancellation:
   * 1. Issues cancellation to runner adapter.
   * 2. Asserts process termination via PID checks.
   * 3. If confirmed dead, releases budget reservation and revokes attempt lease.
   * 4. If unconfirmed, retains reservation and marks CancellationUnconfirmed.
   */
  async cancelAttempt(params) {
    const { ticketId, attemptId, executionId, adapter, leaseToken, pid, timeoutMs = 3e3 } = params;
    const start = Date.now();
    let confirmed = true;
    try {
      const adapterRes = await adapter.cancel(executionId);
      if (adapterRes && adapterRes.confirmed === false) {
        confirmed = false;
      }
    } catch {
      confirmed = false;
    }
    if (pid) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (!_CancellationController.isPidAlive(pid)) {
          confirmed = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      if (_CancellationController.isPidAlive(pid)) {
        try {
          if (process.platform === "win32") {
            cp3.execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" });
          } else {
            process.kill(-pid, "SIGKILL");
          }
        } catch {
        }
        confirmed = !_CancellationController.isPidAlive(pid);
      }
    }
    const durationMs = Date.now() - start;
    if (confirmed) {
      try {
        this.journal.transitionAttempt(attemptId, "Cancelled", {
          failureReason: "Cancelled by user / orchestrator."
        });
      } catch {
        this.journal.logEntry({
          timestamp: Date.now(),
          type: "ATTEMPT_TRANSITION",
          ticketId,
          attemptId,
          toStatus: "Cancelled",
          details: { reason: "Cancelled before persistence" }
        });
      }
      this.budgetManager.releaseReservation(attemptId);
      this.leaseManager.revokeLease(leaseToken, "cancelled_confirmed");
      return {
        confirmed: true,
        attemptId,
        ticketId,
        durationMs,
        pidKilled: pid,
        status: "CANCELLED_CONFIRMED",
        message: "Attempt successfully cancelled and process termination confirmed."
      };
    } else {
      try {
        this.journal.transitionAttempt(attemptId, "Failed", {
          failureReason: "Cancellation unconfirmed: Process failed to terminate within deadline."
        });
      } catch {
        this.journal.logEntry({
          timestamp: Date.now(),
          type: "ATTEMPT_TRANSITION",
          ticketId,
          attemptId,
          toStatus: "Failed",
          details: { reason: "Cancellation unconfirmed before persistence" }
        });
      }
      return {
        confirmed: false,
        attemptId,
        ticketId,
        durationMs,
        pidKilled: pid,
        status: "CANCELLATION_UNCONFIRMED",
        message: "Cancellation unconfirmed: Process may still be running; retained reservation."
      };
    }
  }
};

// src/orchestrator/scheduler/subtaskRouter.ts
var SubtaskRouter = class {
  static DEFAULT_PROFILES = [
    {
      id: "fast-discovery",
      name: "Gemma 4 E4B (Local / Fast)",
      model: "gemma4:e4b",
      provider: "ollama",
      costTier: "free",
      recommendedFor: ["discovery", "quick-fix"]
    },
    {
      id: "deep-reasoner",
      name: "Fable / Astra (Deep Reasoning)",
      model: "astra-reasoning-v1",
      provider: "openai-compatible",
      costTier: "high",
      recommendedFor: ["architecture", "escalation"]
    },
    {
      id: "standard-coder",
      name: "Claude 3.7 Sonnet / Copilot",
      model: "claude-3-7-sonnet",
      provider: "anthropic",
      costTier: "medium",
      recommendedFor: ["implementation", "verification", "refactor"]
    }
  ];
  static DEFAULT_ROUTING = {
    defaultTier: "standard-coder",
    categoryRoutes: {
      discovery: "fast-discovery",
      "quick-fix": "fast-discovery",
      architecture: "deep-reasoner",
      escalation: "deep-reasoner",
      implementation: "standard-coder",
      verification: "standard-coder",
      refactor: "standard-coder"
    },
    fallbackTier: "standard-coder"
  };
  /**
   * Classifies a planned subtask, ticket, or task description into a TaskCategory.
   */
  static classify(task) {
    const labels = (task.labels || []).map((l) => l.toLowerCase());
    if (labels.some((l) => l.includes("discover") || l.includes("search") || l.includes("research") || l.includes("probe"))) {
      return "discovery";
    }
    if (labels.some((l) => l.includes("architect") || l.includes("design") || l.includes("spec") || l.includes("plan"))) {
      return "architecture";
    }
    if (labels.some((l) => l.includes("verify") || l.includes("test") || l.includes("qa") || l.includes("audit"))) {
      return "verification";
    }
    if (labels.some((l) => l.includes("quick-fix") || l.includes("typo") || l.includes("lint") || l.includes("whitespace"))) {
      return "quick-fix";
    }
    if (labels.some((l) => l.includes("refactor") || l.includes("cleanup"))) {
      return "refactor";
    }
    if (labels.some((l) => l.includes("escalat"))) {
      return "escalation";
    }
    const combinedText = [
      task.title || "",
      task.objective || "",
      task.summary || ""
    ].join(" ").toLowerCase();
    if (/\b(discover|discovery|search|find|locate|inspect|explore|investigate|probe|survey|file listing)\b/i.test(combinedText)) {
      return "discovery";
    }
    if (/\b(architect|architecture|decomposition|decompose|blueprint|high-level design|schema design|cycle resolution)\b/i.test(combinedText)) {
      return "architecture";
    }
    if (/\b(verify|verification|assert|validate|validation|smoke test|unit test|integration test|regression|benchmark)\b/i.test(combinedText)) {
      return "verification";
    }
    if (/\b(typo|lint|formatting|whitespace|rename symbol|docstring|comment fix)\b/i.test(combinedText)) {
      return "quick-fix";
    }
    if (/\b(refactor|restructure|decouple|cleanup|clean up|migrate|migration)\b/i.test(combinedText)) {
      return "refactor";
    }
    if (/\b(escalat|checkpoint takeover|lead resolution)\b/i.test(combinedText)) {
      return "escalation";
    }
    return "implementation";
  }
  /**
   * Resolves the optimal ModelTierProfile for a given TaskCategory, taking into account:
   * - Configured subtask routing table
   * - Registered model tier profiles
   * - Policy constraints (local-only, EU-only)
   * - Automatic fallback handling
   */
  static resolveModel(category, routingConfig, availableTiers, policies) {
    const routing = routingConfig || this.DEFAULT_ROUTING;
    const profiles = availableTiers && availableTiers.length > 0 ? availableTiers : this.DEFAULT_PROFILES;
    const requestedTierId = routing.categoryRoutes?.[category] || routing.defaultTier || "standard-coder";
    let profile = profiles.find((p) => p.id.toLowerCase() === requestedTierId.toLowerCase());
    let isFallback = false;
    let reason;
    if (!profile) {
      profile = profiles.find((p) => p.id.toLowerCase() === (routing.fallbackTier || routing.defaultTier).toLowerCase()) || profiles[0];
      isFallback = true;
      reason = `Preferred tier "${requestedTierId}" not found; fell back to "${profile.id}".`;
    }
    if (policies) {
      if (policies.localOnly) {
        const isLocal = profile.provider === "ollama" || profile.provider === "cli-bridge" || profile.costTier === "free";
        if (!isLocal) {
          const localProfile = profiles.find((p) => p.provider === "ollama" || p.provider === "cli-bridge" || p.costTier === "free");
          if (localProfile && localProfile.id !== profile.id) {
            reason = `Policy "localOnly" active; rerouted from cloud tier "${profile.id}" to local tier "${localProfile.id}".`;
            profile = localProfile;
            isFallback = true;
          }
        }
      }
    }
    return {
      profile,
      category,
      requestedTierId,
      effectiveTierId: profile.id,
      isFallback,
      reason
    };
  }
};

// src/orchestrator/core/orchestratorRuntime.ts
var OrchestratorRuntime = class {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
    this.journal = new RuntimeJournal(workspaceRoot);
    this.leaseManager = new LeaseManager(workspaceRoot, this.journal);
    this.workspaceManager = new WorkspaceManager(workspaceRoot);
    this.escalationHandler = new EscalationHandler(workspaceRoot, this.journal, this.leaseManager, this.workspaceManager);
    this.reviewManager = new ReviewManager(workspaceRoot);
    this.budgetManager = new BudgetManager(workspaceRoot);
    this.egressController = new EgressController(workspaceRoot);
    this.cancellationController = new CancellationController(this.journal, this.leaseManager, this.budgetManager);
  }
  journal;
  leaseManager;
  workspaceManager;
  escalationHandler;
  reviewManager;
  budgetManager;
  egressController;
  cancellationController;
  /**
   * Initializes runtime and performs startup crash recovery.
   */
  async initialize() {
    this.journal.acquireWorkspaceLock();
    const interrupted = this.journal.scanInterruptedAttempts();
    for (const attempt of interrupted) {
      this.journal.transitionAttempt(attempt.attemptId, "Interrupted", {
        failureReason: "Interrupted by extension restart or crash."
      });
      this.workspaceManager.cleanup(attempt.attemptId);
    }
    if (interrupted.length > 0) {
      this.journal.logEntry({
        timestamp: Date.now(),
        type: "RECOVERY_COMPLETE",
        details: { count: interrupted.length }
      });
    }
    return { recoveredCount: interrupted.length };
  }
  /**
   * Executes a single supervised ticket attempt from start to verified patch.
   */
  async runAttempt(adapter, options, onEvent) {
    const { ticketId, agentId, objective, targetFiles = [], verificationCommand, autoIntegrate } = options;
    if (options.policies) {
      const policyCheck = PolicyEngine.evaluateEligibility({
        providerId: agentId,
        policies: options.policies,
        role: options.role || "worker"
      });
      if (!policyCheck.eligible) {
        this.egressController.logAudit({
          timestamp: Date.now(),
          ticketId,
          attemptId: "pre-dispatch",
          providerId: agentId,
          action: "dispatch_request",
          targetEndpoint: policyCheck.provider.endpointHost,
          allowed: false,
          policyRule: policyCheck.violations.join("; ")
        });
        return {
          success: false,
          attempt: { ticketId, status: "Blocked", failureReason: policyCheck.violations.join("; ") },
          errorMessage: `Policy violation: ${policyCheck.violations.join("; ")}`
        };
      }
    }
    const taskCategory = options.category || SubtaskRouter.classify({
      title: ticketId,
      objective,
      labels: options.labels,
      allowedScope: targetFiles
    });
    const modelResolution = SubtaskRouter.resolveModel(
      taskCategory,
      options.routingConfig,
      options.modelTiers,
      options.policies
    );
    const budgetRequested = options.budgetRequested || 1;
    const reservation = this.budgetManager.reserve({
      ticketId,
      attemptId: `temp-${ticketId}-${Date.now()}`,
      totalAmount: budgetRequested
    });
    if (!reservation.allowed) {
      return {
        success: false,
        attempt: { ticketId, status: "Blocked", failureReason: reservation.reason },
        reservation,
        errorMessage: reservation.reason,
        modelResolution
      };
    }
    const lease = this.leaseManager.acquireLease(ticketId);
    const manifest = await this.workspaceManager.captureBaseline(targetFiles);
    const attempt = TicketAttemptManager.createAttempt(
      ticketId,
      lease.generation,
      agentId,
      adapter.tier,
      manifest,
      { currency: "EUR", unitsReserved: 1, unitsSpentReported: 0, unitsSpentEstimated: 0, isSubscriptionQuota: false },
      { taskCategory, modelTier: modelResolution.effectiveTierId }
    );
    this.leaseManager.bindAttempt(lease.token, attempt);
    TicketAttemptManager.saveAttempt(this.workspaceRoot, attempt);
    let currentAttempt = attempt;
    let allocation;
    try {
      allocation = await this.workspaceManager.allocate(attempt.attemptId, manifest);
    } catch (err) {
      currentAttempt = this.journal.transitionAttempt(attempt.attemptId, "Failed", { failureReason: `Workspace allocation failed: ${err.message}` });
      this.leaseManager.revokeLease(lease.token);
      return { success: false, attempt: currentAttempt, errorMessage: err.message };
    }
    currentAttempt = this.journal.transitionAttempt(attempt.attemptId, "Running");
    const attemptContext = {
      ticketId,
      attemptId: attempt.attemptId,
      objective,
      workspaceRoot: allocation.workspacePath,
      targetFiles,
      role: options.role || "worker",
      allocatedBudget: { currency: "EUR", maxUnits: 1 }
    };
    let executionId;
    try {
      const startResult = await adapter.start(attemptContext, (event) => {
        if (onEvent)
          onEvent(event);
      });
      executionId = startResult.executionId;
    } catch (err) {
      currentAttempt = this.journal.transitionAttempt(attempt.attemptId, "Failed", { failureReason: `Adapter failed to start: ${err.message}` });
      this.workspaceManager.cleanup(attempt.attemptId);
      this.leaseManager.revokeLease(lease.token);
      return { success: false, attempt: currentAttempt, errorMessage: err.message };
    }
    const result = await adapter.collectResult(executionId);
    const leaseCheck = this.leaseManager.validateLease(lease.token, ticketId, lease.generation);
    if (!leaseCheck.valid) {
      currentAttempt = this.journal.transitionAttempt(attempt.attemptId, "Failed", {
        failureReason: `Lease validation failed: ${leaseCheck.reason}`
      });
      this.workspaceManager.cleanup(attempt.attemptId);
      return { success: false, attempt: currentAttempt, errorMessage: leaseCheck.reason };
    }
    if (!result.success) {
      currentAttempt = this.journal.transitionAttempt(attempt.attemptId, "Failed", {
        failureReason: result.errorMessage || "Runner execution failed."
      });
      this.workspaceManager.cleanup(attempt.attemptId);
      this.leaseManager.revokeLease(lease.token);
      return { success: false, attempt: currentAttempt, errorMessage: result.errorMessage };
    }
    const diff = result.patch || this.workspaceManager.captureDiff(allocation);
    let verificationPassed = true;
    if (verificationCommand) {
      const verResult = await this.workspaceManager.verify(allocation, verificationCommand);
      verificationPassed = verResult.passed;
      if (!verificationPassed) {
        currentAttempt = this.journal.transitionAttempt(attempt.attemptId, "Failed", {
          failureReason: `Independent verification failed (${verificationCommand}): ${verResult.stderr || verResult.stdout}`
        });
        this.workspaceManager.cleanup(attempt.attemptId);
        this.leaseManager.revokeLease(lease.token);
        return { success: false, attempt: currentAttempt, diff, verificationPassed: false, errorMessage: "Verification failed." };
      }
    }
    currentAttempt = this.journal.transitionAttempt(attempt.attemptId, "Review", {
      patchUnified: diff
    });
    let integrated = false;
    if (autoIntegrate) {
      const integResult = await this.workspaceManager.integrate(allocation);
      integrated = integResult.success;
      if (integrated) {
        currentAttempt = this.journal.transitionAttempt(attempt.attemptId, "Completed");
      } else {
        currentAttempt = this.journal.transitionAttempt(attempt.attemptId, "Blocked", {
          failureReason: integResult.errorMessage
        });
      }
    }
    this.leaseManager.revokeLease(lease.token, "attempt_completed");
    if (reservation.reservation) {
      this.budgetManager.reconcile({
        attemptId: reservation.reservation.attemptId,
        actualSpent: budgetRequested * 0.5,
        isReported: true
      });
    }
    return {
      success: true,
      attempt: currentAttempt,
      diff,
      verificationPassed,
      integrated,
      reservation,
      modelResolution
    };
  }
  /**
   * Executes a bounded delegated attempt:
   * 1. Packages context into immutable DelegationPackage with allowedScope.
   * 2. Runs worker in isolated workspace.
   * 3. Validates scope on worker's patch.
   * 4. Evaluates escalation triggers (scope violation, verification failure).
   * 5. If escalated and leadAdapter is provided, executes Lead Checkpoint Takeover.
   * 6. Runs independent verification & fresh lead review.
   * 7. Transitions attempt to Review (or Completed if autoIntegrate).
   */
  async runDelegatedAttempt(options, onEvent) {
    const {
      ticketId,
      workerAdapter,
      workerId,
      leadAdapter,
      objective,
      allowedScope,
      acceptanceCriteria,
      targetFiles = [],
      verificationCommand,
      autoIntegrate,
      maxRetries = 1
    } = options;
    if (options.policies) {
      const workerPolicyCheck = PolicyEngine.evaluateEligibility({
        providerId: workerId,
        policies: options.policies,
        role: "worker"
      });
      if (!workerPolicyCheck.eligible) {
        return {
          success: false,
          attempt: { ticketId, status: "Blocked", failureReason: workerPolicyCheck.violations.join("; ") },
          delegationPackage: null,
          errorMessage: `Worker policy violation: ${workerPolicyCheck.violations.join("; ")}`
        };
      }
    }
    const taskCategory = options.category || SubtaskRouter.classify({
      title: ticketId,
      objective,
      labels: options.labels,
      allowedScope
    });
    const modelResolution = SubtaskRouter.resolveModel(
      taskCategory,
      options.routingConfig,
      options.modelTiers,
      options.policies
    );
    const budgetRequested = options.budgetRequested || 1;
    const reservation = this.budgetManager.reserve({
      ticketId,
      attemptId: `temp-del-${ticketId}-${Date.now()}`,
      totalAmount: budgetRequested
    });
    if (!reservation.allowed) {
      return {
        success: false,
        attempt: { ticketId, status: "Blocked", failureReason: reservation.reason },
        delegationPackage: null,
        reservation,
        errorMessage: reservation.reason,
        modelResolution
      };
    }
    const lease = this.leaseManager.acquireLease(ticketId);
    const manifest = await this.workspaceManager.captureBaseline(targetFiles);
    const attempt = TicketAttemptManager.createAttempt(
      ticketId,
      lease.generation,
      workerId,
      workerAdapter.tier,
      manifest,
      { currency: "EUR", unitsReserved: 1, unitsSpentReported: 0, unitsSpentEstimated: 0, isSubscriptionQuota: false },
      { taskCategory, modelTier: modelResolution.effectiveTierId }
    );
    this.leaseManager.bindAttempt(lease.token, attempt);
    TicketAttemptManager.saveAttempt(this.workspaceRoot, attempt);
    let currentAttempt = attempt;
    const allocation = await this.workspaceManager.allocate(attempt.attemptId, manifest);
    const delegationPackage = ContextPackager.packageForWorker({
      ticketId,
      attemptId: attempt.attemptId,
      objective,
      allowedScope,
      workspaceRoot: this.workspaceRoot,
      targetFiles,
      budget: { currency: "EUR", maxUnits: 1 }
    });
    ContextPackager.persistPackage(this.workspaceRoot, delegationPackage);
    currentAttempt = this.journal.transitionAttempt(attempt.attemptId, "Running");
    let workerSuccess = false;
    let workerDiff = "";
    let errorMessage;
    try {
      const startResult = await workerAdapter.start({
        ticketId,
        attemptId: attempt.attemptId,
        objective,
        workspaceRoot: allocation.workspacePath,
        targetFiles,
        role: "worker",
        allocatedBudget: { currency: "EUR", maxUnits: 1 }
      }, onEvent);
      const result = await workerAdapter.collectResult(startResult.executionId);
      workerSuccess = result.success;
      workerDiff = result.patch || this.workspaceManager.captureDiff(allocation);
      if (!workerSuccess) {
        errorMessage = result.errorMessage;
      }
    } catch (err) {
      workerSuccess = false;
      errorMessage = err.message;
    }
    let finalDiff = workerDiff;
    let escalation;
    let takeoverResult;
    let verResult = { passed: true, error: void 0, command: verificationCommand };
    if (verificationCommand) {
      const execVer = await this.workspaceManager.verify(allocation, verificationCommand);
      verResult = {
        passed: execVer.passed,
        error: execVer.passed ? void 0 : execVer.stderr || execVer.stdout,
        command: verificationCommand
      };
    }
    const triggeredEsc = this.escalationHandler.evaluateEscalationTriggers({
      ticketId,
      attemptId: attempt.attemptId,
      workerId,
      delegationPackage,
      diff: finalDiff,
      verificationResult: verResult,
      consecutiveFailures: verResult.passed && workerSuccess ? 0 : 1,
      maxRetries,
      errorText: errorMessage
    });
    if (triggeredEsc) {
      escalation = triggeredEsc;
      if (leadAdapter) {
        takeoverResult = await this.escalationHandler.executeLeadTakeover(
          escalation,
          leadAdapter,
          lease.token,
          allocation
        );
        if (takeoverResult.success && takeoverResult.resolvedPatch) {
          finalDiff = takeoverResult.resolvedPatch;
          if (verificationCommand) {
            const reVer = await this.workspaceManager.verify(allocation, verificationCommand);
            verResult = {
              passed: reVer.passed,
              error: reVer.passed ? void 0 : reVer.stderr || reVer.stdout,
              command: verificationCommand
            };
          }
        } else {
          currentAttempt = this.journal.transitionAttempt(attempt.attemptId, "Blocked", {
            failureReason: `Escalated to Lead: ${takeoverResult.errorMessage || escalation.message}`
          });
          this.workspaceManager.cleanup(attempt.attemptId);
          return {
            success: false,
            attempt: currentAttempt,
            delegationPackage,
            escalation,
            takeoverResult,
            errorMessage: takeoverResult.errorMessage || escalation.message
          };
        }
      } else {
        currentAttempt = this.journal.transitionAttempt(attempt.attemptId, "Blocked", {
          failureReason: `Worker escalated without lead available: ${escalation.message}`
        });
        this.workspaceManager.cleanup(attempt.attemptId);
        this.leaseManager.revokeLease(lease.token);
        return {
          success: false,
          attempt: currentAttempt,
          delegationPackage,
          escalation,
          errorMessage: escalation.message
        };
      }
    }
    let verificationEvidence;
    if (verificationCommand) {
      verificationEvidence = await this.reviewManager.runIndependentVerification(
        allocation,
        ticketId,
        verificationCommand
      );
    } else {
      verificationEvidence = {
        attemptId: attempt.attemptId,
        ticketId,
        timestamp: Date.now(),
        command: "none",
        passed: true,
        exitCode: 0,
        stdout: "No verification command specified",
        stderr: ""
      };
      this.reviewManager.persistEvidence(verificationEvidence);
    }
    const reviewDecision = this.reviewManager.performFreshReview({
      ticketId,
      attemptId: attempt.attemptId,
      reviewerId: options.leadId || "fresh-lead-reviewer",
      patchDiff: finalDiff,
      acceptanceCriteria,
      verificationEvidence
    });
    const gate = this.reviewManager.canTransitionToDone(attempt.attemptId);
    if (!gate.allowed) {
      currentAttempt = this.journal.transitionAttempt(attempt.attemptId, "Failed", {
        failureReason: `Fresh review gating failed: ${gate.reason}`
      });
      this.workspaceManager.cleanup(attempt.attemptId);
      this.leaseManager.revokeLease(lease.token);
      return {
        success: false,
        attempt: currentAttempt,
        diff: finalDiff,
        delegationPackage,
        escalation,
        takeoverResult,
        verificationEvidence,
        reviewDecision,
        errorMessage: gate.reason
      };
    }
    currentAttempt = this.journal.transitionAttempt(attempt.attemptId, "Review", {
      patchUnified: finalDiff
    });
    let integrated = false;
    if (autoIntegrate) {
      const integResult = await this.workspaceManager.integrate(allocation);
      integrated = integResult.success;
      if (integrated) {
        currentAttempt = this.journal.transitionAttempt(attempt.attemptId, "Completed");
      } else {
        currentAttempt = this.journal.transitionAttempt(attempt.attemptId, "Blocked", {
          failureReason: integResult.errorMessage
        });
      }
    }
    this.leaseManager.revokeLease(lease.token, "attempt_completed");
    if (reservation.reservation) {
      this.budgetManager.reconcile({
        attemptId: reservation.reservation.attemptId,
        actualSpent: budgetRequested * 0.5,
        isReported: true
      });
    }
    return {
      success: true,
      attempt: currentAttempt,
      diff: finalDiff,
      delegationPackage,
      escalation,
      takeoverResult,
      verificationEvidence,
      reviewDecision,
      reservation,
      integrated,
      modelResolution
    };
  }
  /**
   * Cancels an active attempt with confirmed process termination and budget release.
   */
  async cancelAttempt(params) {
    return this.cancellationController.cancelAttempt(params);
  }
  dispose() {
    this.journal.releaseWorkspaceLock();
  }
};

// src/orchestrator/daemon/orchestratorDaemon.ts
var OrchestratorDaemon = class {
  workspaceRoot;
  runtime;
  concurrencyQueue;
  profileManager;
  server = null;
  port = 0;
  authToken = "";
  startedAt = 0;
  defaultAdapter;
  isShuttingDown = false;
  constructor(config) {
    this.workspaceRoot = config.workspaceRoot;
    this.runtime = new OrchestratorRuntime(this.workspaceRoot);
    this.concurrencyQueue = new ConcurrencyQueue(config.concurrencyLimits || { maxGlobalWorkers: 2, maxWorkersPerBoard: 1 });
    this.profileManager = new AutonomousProfileManager(
      config.profileConfig || {
        profile: "bounded-autonomous",
        maxBatchCeilingCurrency: 10,
        circuitBreakerThreshold: 3
      }
    );
    this.defaultAdapter = config.defaultAdapter;
  }
  getDaemonInfoPath() {
    return path11.join(this.workspaceRoot, ".agentic-kanban", "runtime", "daemon.json");
  }
  async start(desiredPort = 0) {
    await this.runtime.initialize();
    this.authToken = crypto4.randomBytes(24).toString("hex");
    this.startedAt = Date.now();
    this.server = http.createServer(this.handleRequest.bind(this));
    await new Promise((resolve, reject) => {
      this.server.listen(desiredPort, "127.0.0.1", () => {
        const addr = this.server.address();
        if (addr && typeof addr === "object") {
          this.port = addr.port;
          resolve();
        } else {
          reject(new Error("Failed to obtain server listening address"));
        }
      });
      this.server.on("error", reject);
    });
    const info = {
      pid: process.pid,
      port: this.port,
      authToken: this.authToken,
      startedAt: this.startedAt,
      workspaceRoot: this.workspaceRoot
    };
    const runtimeDir = path11.dirname(this.getDaemonInfoPath());
    fs10.mkdirSync(runtimeDir, { recursive: true });
    fs10.writeFileSync(this.getDaemonInfoPath(), JSON.stringify(info, null, 2), "utf8");
    const shutdownHook = () => {
      if (!this.isShuttingDown) {
        this.shutdown().catch(() => {
        });
      }
    };
    process.once("SIGINT", shutdownHook);
    process.once("SIGTERM", shutdownHook);
    return info;
  }
  async shutdown() {
    if (this.isShuttingDown)
      return;
    this.isShuttingDown = true;
    const infoPath = this.getDaemonInfoPath();
    if (fs10.existsSync(infoPath)) {
      try {
        fs10.unlinkSync(infoPath);
      } catch {
      }
    }
    if (this.server) {
      await new Promise((resolve) => {
        this.server.close(() => resolve());
      });
      this.server = null;
    }
    this.runtime.dispose();
  }
  getPort() {
    return this.port;
  }
  getAuthToken() {
    return this.authToken;
  }
  async handleRequest(req, res) {
    res.setHeader("Content-Type", "application/json");
    const authHeader = req.headers["authorization"];
    if (!authHeader || authHeader !== `Bearer ${this.authToken}`) {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: "Unauthorized: Invalid or missing bearer token" }));
      return;
    }
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    const method = req.method?.toUpperCase();
    try {
      if (method === "GET" && url.pathname === "/status") {
        const activeLeases = this.runtime.leaseManager.listActiveLeases();
        const account = this.runtime.budgetManager.getAccount("EUR");
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
      if (method === "POST" && url.pathname === "/pause") {
        this.concurrencyQueue.pause();
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, paused: true }));
        return;
      }
      if (method === "POST" && url.pathname === "/resume") {
        this.concurrencyQueue.resume();
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, paused: false }));
        return;
      }
      if (method === "POST" && url.pathname === "/run") {
        const body = await this.readJsonBody(req);
        const readyTickets = body.tickets || [];
        const boardId = body.boardId || "default-board";
        const ticketsMap = /* @__PURE__ */ new Map();
        ticketsMap.set(boardId, readyTickets);
        const readyTasks = DependencyScheduler.getReadyTasks(ticketsMap, new Set(body.completedIds || []));
        const nextTask = this.concurrencyQueue.selectNextTask(readyTasks);
        if (!nextTask) {
          res.statusCode = 200;
          res.end(JSON.stringify({
            dispatched: 0,
            status: this.concurrencyQueue.getPaused() ? "paused" : "idle",
            reason: readyTasks.length === 0 ? "No ready tasks available" : "Concurrency limit reached or queue paused"
          }));
          return;
        }
        const check = this.profileManager.canDispatchNext(1);
        if (!check.allowed) {
          res.statusCode = 200;
          res.end(JSON.stringify({
            dispatched: 0,
            status: "blocked",
            reason: check.reason
          }));
          return;
        }
        this.concurrencyQueue.acquireSlot(boardId);
        let runResult = null;
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
              attemptId: runResult.attempt?.attemptId || "att-unknown",
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
      if (method === "POST" && url.pathname === "/cancel") {
        const body = await this.readJsonBody(req);
        if (!body.ticketId || !body.attemptId) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "Missing ticketId or attemptId" }));
          return;
        }
        const cancelRes = await this.runtime.cancelAttempt({
          ticketId: body.ticketId,
          attemptId: body.attemptId,
          executionId: body.executionId || body.attemptId,
          adapter: this.defaultAdapter || { name: "unknown", tier: "worker", stop: async () => {
          } },
          leaseToken: body.leaseToken || "revocation"
        });
        res.statusCode = 200;
        res.end(JSON.stringify(cancelRes));
        return;
      }
      if (method === "GET" && url.pathname.startsWith("/review/")) {
        const ticketId = decodeURIComponent(url.pathname.substring("/review/".length));
        const attemptsDir = path11.join(this.workspaceRoot, ".agentic-kanban", "runtime", "attempts");
        let diff = "";
        let status = "Unknown";
        let foundAttempt = null;
        if (fs10.existsSync(attemptsDir)) {
          const files = fs10.readdirSync(attemptsDir);
          for (const file of files) {
            if (file.endsWith(".json")) {
              try {
                const data = JSON.parse(fs10.readFileSync(path11.join(attemptsDir, file), "utf8"));
                if (data.ticketId === ticketId) {
                  foundAttempt = data;
                  status = data.status;
                  diff = data.patchUnified || "";
                  break;
                }
              } catch {
              }
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
      if (method === "POST" && url.pathname === "/stop") {
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, message: "Daemon shutting down." }));
        setImmediate(() => {
          this.shutdown().catch(() => {
          });
        });
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "Endpoint not found" }));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message || "Internal daemon error" }));
    }
  }
  readJsonBody(req) {
    return new Promise((resolve, reject) => {
      let data = "";
      req.on("data", (chunk) => {
        data += chunk;
      });
      req.on("end", () => {
        if (!data.trim()) {
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error("Invalid JSON payload"));
        }
      });
      req.on("error", reject);
    });
  }
};

// src/orchestrator/daemon/daemonClient.ts
var http2 = __toESM(require("http"));
var fs11 = __toESM(require("fs"));
var path12 = __toESM(require("path"));
var DaemonClient = class {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
  }
  getDaemonInfoPath() {
    return path12.join(this.workspaceRoot, ".agentic-kanban", "runtime", "daemon.json");
  }
  getDaemonInfo() {
    const infoPath = this.getDaemonInfoPath();
    if (!fs11.existsSync(infoPath)) {
      return null;
    }
    try {
      return JSON.parse(fs11.readFileSync(infoPath, "utf8"));
    } catch {
      return null;
    }
  }
  async isDaemonRunning() {
    const info = this.getDaemonInfo();
    if (!info || !info.port || !info.authToken) {
      return false;
    }
    try {
      const status = await this.getStatus();
      return status && status.running === true;
    } catch {
      return false;
    }
  }
  async getStatus() {
    return this.sendRequest("GET", "/status");
  }
  async pause() {
    return this.sendRequest("POST", "/pause");
  }
  async resume() {
    return this.sendRequest("POST", "/resume");
  }
  async run(params) {
    return this.sendRequest("POST", "/run", params);
  }
  async cancel(ticketId, attemptId, extra) {
    return this.sendRequest("POST", "/cancel", { ticketId, attemptId, ...extra });
  }
  async getReview(ticketId) {
    return this.sendRequest("GET", `/review/${encodeURIComponent(ticketId)}`);
  }
  async stop() {
    return this.sendRequest("POST", "/stop");
  }
  sendRequest(method, endpoint, body) {
    const info = this.getDaemonInfo();
    if (!info) {
      return Promise.reject(new Error(`Daemon is not running in ${this.workspaceRoot} (no daemon.json found)`));
    }
    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : void 0;
      const options = {
        hostname: "127.0.0.1",
        port: info.port,
        path: endpoint,
        method,
        headers: {
          "Authorization": `Bearer ${info.authToken}`,
          "Content-Type": "application/json",
          ...payload ? { "Content-Length": Buffer.byteLength(payload) } : {}
        },
        timeout: 5e3
      };
      const req = http2.request(options, (res) => {
        let responseData = "";
        res.on("data", (chunk) => {
          responseData += chunk;
        });
        res.on("end", () => {
          if (!responseData.trim()) {
            resolve({});
            return;
          }
          try {
            const parsed = JSON.parse(responseData);
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(parsed.error || `Request failed with status ${res.statusCode}`));
            } else {
              resolve(parsed);
            }
          } catch {
            reject(new Error(`Failed to parse daemon response: ${responseData}`));
          }
        });
      });
      req.on("timeout", () => {
        req.destroy();
        reject(new Error(`Daemon request to ${endpoint} timed out`));
      });
      req.on("error", (err) => {
        reject(new Error(`Connection to daemon failed: ${err.message}`));
      });
      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }
};

// src/orchestrator/cli/orchestratorCli.ts
var path13 = __toESM(require("path"));
async function runCli(args, workspaceRoot = process.cwd()) {
  const client = new DaemonClient(workspaceRoot);
  const command = args[0] || "help";
  try {
    switch (command) {
      case "status": {
        const isJson = args.includes("--json");
        const isRunning = await client.isDaemonRunning();
        if (!isRunning) {
          const out = isJson ? JSON.stringify({ running: false, workspaceRoot }, null, 2) : `Orchestrator daemon is not running in ${workspaceRoot}`;
          return { exitCode: 0, output: out };
        }
        const status = await client.getStatus();
        if (isJson) {
          return { exitCode: 0, output: JSON.stringify(status, null, 2) };
        }
        const lines = [
          `=== Kanban Orchestrator Status ===`,
          `Daemon PID:      ${status.pid}`,
          `Started At:      ${new Date(status.startedAt).toISOString()}`,
          `Queue Paused:    ${status.scheduler.paused ? "YES" : "NO"}`,
          `Active Global:   ${status.scheduler.activeGlobal} / ${status.scheduler.maxGlobal}`,
          `Profile:         ${status.profile.profile}`,
          `Consecutive Fails: ${status.profile.consecutiveFailures}`,
          `Total Spent:     \u20AC${status.profile.totalSpent.toFixed(2)}`,
          `Active Leases:   ${status.leases.length}`,
          `Interventions:   ${status.interventions.length}`
        ];
        return { exitCode: 0, output: lines.join("\n") };
      }
      case "pause": {
        const res = await client.pause();
        return { exitCode: 0, output: `Orchestrator queue paused.` };
      }
      case "resume": {
        const res = await client.resume();
        return { exitCode: 0, output: `Orchestrator queue resumed.` };
      }
      case "run": {
        const boardIndex = args.indexOf("--board");
        const boardId = boardIndex !== -1 && args[boardIndex + 1] ? args[boardIndex + 1] : void 0;
        const res = await client.run({ boardId });
        return { exitCode: 0, output: `Run completed: Dispatched ${res.dispatched} task(s). Status: ${res.status || "ok"}` };
      }
      case "cancel": {
        const ticketId = args[1];
        const attemptId = args[2] || "active";
        if (!ticketId) {
          return { exitCode: 1, output: "Usage: kanban-orch cancel <ticketId> [attemptId]" };
        }
        const res = await client.cancel(ticketId, attemptId);
        return { exitCode: 0, output: `Cancelled attempt for ticket ${ticketId}: ${JSON.stringify(res)}` };
      }
      case "review": {
        const ticketId = args[1];
        if (!ticketId) {
          return { exitCode: 1, output: "Usage: kanban-orch review <ticketId>" };
        }
        const review = await client.getReview(ticketId);
        const lines = [
          `=== Review for Ticket: ${review.ticketId} ===`,
          `Status: ${review.status}`,
          `--- Patch Unified ---`,
          review.diff || "(No patch generated)"
        ];
        return { exitCode: 0, output: lines.join("\n") };
      }
      case "stop": {
        const res = await client.stop();
        return { exitCode: 0, output: `Daemon stopping: ${res.message || "ok"}` };
      }
      case "start": {
        const portIndex = args.indexOf("--port");
        const desiredPort = portIndex !== -1 && args[portIndex + 1] ? parseInt(args[portIndex + 1], 10) : 0;
        const daemon = new OrchestratorDaemon({ workspaceRoot });
        const info = await daemon.start(desiredPort);
        return { exitCode: 0, output: `Daemon started on port ${info.port} (PID: ${info.pid})` };
      }
      case "help":
      default: {
        const helpText = [
          `Usage: kanban-orch <command> [options]`,
          ``,
          `Commands:`,
          `  status [--json]          Display daemon status, queue state, and active leases`,
          `  run [--board <path>]     Trigger scheduler loop for ready tasks`,
          `  pause                    Pause queue dispatch`,
          `  resume                   Resume queue dispatch`,
          `  cancel <ticket> [att]    Cancel active attempt`,
          `  review <ticketId>        Display verification evidence and patch diff`,
          `  start [--port <port>]    Start daemon process`,
          `  stop                     Stop running daemon`
        ].join("\n");
        return { exitCode: 0, output: helpText };
      }
    }
  } catch (err) {
    return { exitCode: 1, output: `Error: ${err.message}` };
  }
}
var isDirectCliInvocation = typeof process !== "undefined" && Boolean(process.argv[1]) && (path13.basename(process.argv[1]) === "cli.js" || path13.basename(process.argv[1]) === "orchestratorCli.js" || path13.basename(process.argv[1]) === "kanban-orch");
if (isDirectCliInvocation) {
  const args = process.argv.slice(2);
  runCli(args).then((result) => {
    console.log(result.output);
    process.exit(result.exitCode);
  });
}

// test/fixtures/fakeAdapter.ts
var FakeDeterministicAdapter = class {
  id = "fake-deterministic";
  name = "Deterministic Fake Adapter";
  tier = "managed";
  activeExecutions = /* @__PURE__ */ new Map();
  behavior = {
    delayMs: 10,
    exitCode: 0,
    patchToGenerate: `--- a/README.md
+++ b/README.md
@@ -1,3 +1,4 @@
 # Title
+Added line by Fake Deterministic Worker
`,
    reportedCost: { currency: "EUR", units: 0.05, isSubscriptionUnits: false }
  };
  async probe() {
    return {
      tier: "managed",
      installed: true,
      version: "1.0.0-fake",
      detectedPath: "/fake/bin/runner",
      supportsStructuredOutput: true,
      supportsResumableSessions: true,
      supportsTokenReporting: true,
      supportsCostLimits: true,
      supportsModelSelection: true,
      supportsNetworkRestrictions: true,
      supportsToolWhitelisting: true,
      notes: "Fake deterministic test adapter for CI and failure simulation"
    };
  }
  async start(context, onEvent) {
    const executionId = `exec_${context.attemptId}_${Date.now()}`;
    const pid = 999e3 + Math.floor(Math.random() * 1e3);
    this.activeExecutions.set(executionId, { context, cancelled: false });
    if (onEvent) {
      onEvent({
        type: "status_change",
        timestamp: Date.now(),
        message: `Starting fake execution for ticket ${context.ticketId}`
      });
      onEvent({
        type: "stdout",
        timestamp: Date.now(),
        message: `Inspecting target files: ${JSON.stringify(context.targetFiles || [])}`
      });
    }
    return { pid, executionId };
  }
  async collectResult(executionId) {
    const exec3 = this.activeExecutions.get(executionId);
    if (!exec3) {
      throw new Error(`Execution not found: ${executionId}`);
    }
    if (this.behavior.delayMs && this.behavior.delayMs > 0) {
      await new Promise((r) => setTimeout(r, this.behavior.delayMs));
    }
    if (exec3.cancelled) {
      return {
        success: false,
        exitCode: 130,
        errorMessage: "Execution was cancelled by user."
      };
    }
    if (this.behavior.simulateRateLimit) {
      return {
        success: false,
        exitCode: 429,
        errorMessage: "Provider HTTP 429: Rate limit exceeded (sliding window throttled)."
      };
    }
    if (this.behavior.simulateCrash) {
      throw new Error("SIGKILL: Runner process terminated abruptly.");
    }
    if (this.behavior.simulateMalformedPatch) {
      return {
        success: true,
        exitCode: 0,
        patch: "MALFORMED PATCH CORRUPTED HEADER &&*&@#",
        reportedUsage: this.behavior.reportedCost
      };
    }
    const exitCode = this.behavior.exitCode !== void 0 ? this.behavior.exitCode : 0;
    const isSuccess = exitCode === 0;
    return {
      success: isSuccess,
      exitCode,
      patch: isSuccess ? this.behavior.patchToGenerate : void 0,
      evidence: [
        { command: "npm test", exitCode: isSuccess ? 0 : 1, output: isSuccess ? "All checks passed." : "Assertion error in test suite." }
      ],
      reportedUsage: this.behavior.reportedCost,
      unresolvedQuestions: this.behavior.unresolvedQuestions,
      rawOutput: `Worker execution complete with exit code ${exitCode}.`
    };
  }
  async cancel(executionId) {
    const exec3 = this.activeExecutions.get(executionId);
    if (!exec3) {
      return { confirmed: true, reason: "Already terminated or unknown" };
    }
    if (this.behavior.simulateCancellationHang) {
      return {
        confirmed: false,
        reason: "Process ignored SIGTERM and cancellation timed out."
      };
    }
    exec3.cancelled = true;
    return {
      confirmed: true,
      reason: "SIGTERM acknowledged and process terminated cleanly."
    };
  }
};

// test/m4Tests.ts
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}
async function runM4Tests() {
  console.log("=== Running Milestone M4 Integration Tests ===");
  const testRoot = path14.join(__dirname, "..", "scratch", "m4-test-workspace");
  fs12.mkdirSync(testRoot, { recursive: true });
  console.log("\n--- Test 1: Dependency Scheduler & DAG Ordering ---");
  const ticketA = {
    id: "TICK-A",
    title: "Core Architecture",
    status: "Ready",
    column: "Ready",
    priority: "P1",
    dependsOn: [],
    filePath: "/tmp/a.md"
  };
  const ticketB = {
    id: "TICK-B",
    title: "Database Layer",
    status: "Ready",
    column: "Ready",
    priority: "P1",
    dependsOn: ["TICK-A"],
    filePath: "/tmp/b.md"
  };
  const ticketC = {
    id: "TICK-C",
    title: "API Endpoints",
    status: "Ready",
    column: "Ready",
    priority: "P2",
    dependsOn: ["TICK-B"],
    filePath: "/tmp/c.md"
  };
  const ticketsMap = /* @__PURE__ */ new Map();
  ticketsMap.set("board-alpha", [ticketA, ticketB, ticketC]);
  const readyInitially = DependencyScheduler.getReadyTasks(ticketsMap, /* @__PURE__ */ new Set());
  assert(readyInitially.length === 1, "Only TICK-A should be ready initially");
  assert(readyInitially[0].ticket.id === "TICK-A", "Ready task must be TICK-A");
  const readyAfterA = DependencyScheduler.getReadyTasks(ticketsMap, /* @__PURE__ */ new Set(["TICK-A"]));
  assert(readyAfterA.length === 1, "Only TICK-B should be ready after TICK-A");
  assert(readyAfterA[0].ticket.id === "TICK-B", "Ready task must be TICK-B");
  const order = DependencyScheduler.computeTopologicalOrder([ticketC, ticketA, ticketB]);
  assert(order[0] === "TICK-A" && order[1] === "TICK-B" && order[2] === "TICK-C", "Topological sort must order A -> B -> C");
  const cyclicA = { id: "CYC-A", title: "A", status: "Ready", column: "Ready", priority: "P1", dependsOn: ["CYC-B"], filePath: "" };
  const cyclicB = { id: "CYC-B", title: "B", status: "Ready", column: "Ready", priority: "P1", dependsOn: ["CYC-A"], filePath: "" };
  let cycleThrew = false;
  try {
    DependencyScheduler.computeTopologicalOrder([cyclicA, cyclicB]);
  } catch (e) {
    cycleThrew = true;
    assert(e.message.includes("Cyclic dependency"), "Cycle detection must report cyclic dependency");
  }
  assert(cycleThrew, "Cycle detection must throw for circular dependencies");
  console.log("\u2713 Multi-board dependency resolution and DAG ordering verified.");
  console.log("\n--- Test 2: Fair-Share Concurrency Queue & Pause/Resume ---");
  const queue = new ConcurrencyQueue({ maxGlobalWorkers: 2, maxWorkersPerBoard: 1 });
  assert(queue.canDispatch("board-1") === true, "Board 1 should be dispatchable");
  assert(queue.acquireSlot("board-1") === true, "Acquiring slot for Board 1 should succeed");
  assert(queue.canDispatch("board-1") === false, "Board 1 should NOT be dispatchable (exceeds max 1 per board)");
  assert(queue.canDispatch("board-2") === true, "Board 2 should be dispatchable (global active: 1 < 2)");
  assert(queue.acquireSlot("board-2") === true, "Acquiring slot for Board 2 should succeed");
  assert(queue.canDispatch("board-3") === false, "Global limit reached (2/2 active)");
  queue.releaseSlot("board-1");
  assert(queue.canDispatch("board-1") === true, "Board 1 can dispatch again after release");
  queue.pause();
  assert(queue.canDispatch("board-1") === false, "Paused queue blocks all dispatch");
  assert(queue.selectNextTask(readyInitially) === null, "selectNextTask returns null when paused");
  queue.resume();
  assert(queue.canDispatch("board-1") === true, "Resumed queue permits dispatch");
  queue.releaseSlot("board-2");
  console.log("\u2713 Fair-share concurrency limits and pause/resume controls verified.");
  console.log("\n--- Test 3: Validated Runner Adapters (Cline, Copilot CLI, Devin CLI) ---");
  const clineAdapter = new ClineManagedAdapter("cline");
  assert(clineAdapter.name === "cline", "Cline adapter name correct");
  assert(clineAdapter.tier === "managed", "Cline adapter tier is managed");
  const copilotAdapter = new CopilotCliAdapter("gh");
  assert(copilotAdapter.name === "github-copilot-cli", "Copilot CLI adapter name correct");
  const devinAdapter = new DevinCliAdapter("devin");
  assert(devinAdapter.name === "devin-cli", "Devin CLI adapter name correct");
  const antigravityAdapter = new AntigravityManagedAdapter("agy");
  assert(antigravityAdapter.name === "Antigravity CLI", "Antigravity adapter name correct");
  assert(antigravityAdapter.tier === "managed", "Antigravity adapter tier is managed");
  console.log("\u2713 Additional runner adapters instantiated and configured.");
  console.log("\n--- Test 4: Bounded Autonomous Execution Profile & Safeguards ---");
  const profileMgr = new AutonomousProfileManager({
    profile: "bounded-autonomous",
    maxBatchCeilingCurrency: 5,
    batchCurrency: "EUR",
    circuitBreakerThreshold: 3,
    maxCompletedTickets: 2
  });
  const check1 = profileMgr.canDispatchNext(1);
  assert(check1.allowed === true, "Dispatch under budget ceiling allowed");
  const checkOver = profileMgr.canDispatchNext(6);
  assert(checkOver.allowed === false, "Dispatch exceeding batch budget ceiling blocked");
  assert(checkOver.reason?.includes("Batch ceiling reached") === true, "Reason mentions batch ceiling");
  profileMgr.recordTaskOutcome({
    ticketId: "TICK-ESC-01",
    attemptId: "att-01",
    success: false,
    actualSpent: 0.5,
    wasRoutineEscalation: true
  });
  assert(profileMgr.getStatus().consecutiveFailures === 0, "Routine escalation must NOT increment terminal failure count");
  profileMgr.recordTaskOutcome({
    ticketId: "TICK-FAIL-01",
    attemptId: "att-f1",
    success: false,
    actualSpent: 0.5,
    wasRoutineEscalation: false,
    terminalFailureReason: "Compilation failed unrecoverably"
  });
  profileMgr.recordTaskOutcome({
    ticketId: "TICK-FAIL-02",
    attemptId: "att-f2",
    success: false,
    actualSpent: 0.5,
    wasRoutineEscalation: false,
    terminalFailureReason: "Git conflict on main"
  });
  assert(profileMgr.canDispatchNext(1).allowed === true, "Still allowed at 2 failures");
  profileMgr.recordTaskOutcome({
    ticketId: "TICK-FAIL-03",
    attemptId: "att-f3",
    success: false,
    actualSpent: 0.5,
    wasRoutineEscalation: false,
    terminalFailureReason: "Uncaught segfault"
  });
  const breakerCheck = profileMgr.canDispatchNext(1);
  assert(breakerCheck.allowed === false, "Circuit breaker must trip after 3 terminal failures");
  assert(breakerCheck.reason?.includes("Circuit breaker tripped") === true, "Reason states circuit breaker tripped");
  assert(profileMgr.getInterventionQueue().length === 3, "Intervention queue must record 3 blocked items");
  console.log("\u2713 Autonomous profile safeguards: budget ceiling, circuit breaker, and intervention queue verified.");
  console.log("\n--- Test 5: Headless Runtime Daemon & Standalone CLI ---");
  const daemonRoot = path14.join(testRoot, "daemon-ws");
  fs12.mkdirSync(daemonRoot, { recursive: true });
  const fakeAdapter = new FakeDeterministicAdapter("fake-daemon-worker", "worker");
  const daemon = new OrchestratorDaemon({
    workspaceRoot: daemonRoot,
    defaultAdapter: fakeAdapter
  });
  const daemonInfo = await daemon.start(0);
  assert(daemonInfo.port > 0, "Daemon must listen on an ephemeral port");
  assert(fs12.existsSync(daemon.getDaemonInfoPath()), "daemon.json must be written to runtime dir");
  const client = new DaemonClient(daemonRoot);
  const isRunning = await client.isDaemonRunning();
  assert(isRunning === true, "DaemonClient must verify daemon is running");
  const status = await client.getStatus();
  assert(status.running === true, "Status reports daemon running");
  assert(status.scheduler.paused === false, "Queue initially unpaused");
  await client.pause();
  const pausedStatus = await client.getStatus();
  assert(pausedStatus.scheduler.paused === true, "Queue pause propagated over IPC");
  await client.resume();
  const resumedStatus = await client.getStatus();
  assert(resumedStatus.scheduler.paused === false, "Queue resume propagated over IPC");
  const cliStatus = await runCli(["status"], daemonRoot);
  assert(cliStatus.exitCode === 0, "CLI status command succeeds");
  assert(cliStatus.output.includes("Daemon PID:"), "CLI output contains daemon PID");
  const cliJson = await runCli(["status", "--json"], daemonRoot);
  assert(cliJson.exitCode === 0, "CLI JSON status succeeds");
  const parsedJson = JSON.parse(cliJson.output);
  assert(parsedJson.running === true, "CLI JSON status reports running: true");
  const cliPause = await runCli(["pause"], daemonRoot);
  assert(cliPause.exitCode === 0, "CLI pause command succeeds");
  const cliResume = await runCli(["resume"], daemonRoot);
  assert(cliResume.exitCode === 0, "CLI resume command succeeds");
  await daemon.shutdown();
  assert(!fs12.existsSync(daemon.getDaemonInfoPath()), "daemon.json must be removed after graceful shutdown");
  const runningAfterShutdown = await client.isDaemonRunning();
  assert(runningAfterShutdown === false, "DaemonClient reports stopped after shutdown");
  console.log("\u2713 Headless runtime daemon, IPC client, and standalone CLI verified.");
  console.log("\n=== All Milestone M4 Tests Passed Successfully ===");
}
runM4Tests().catch((err) => {
  console.error("Milestone M4 Test Failed:", err);
  process.exit(1);
});
//# sourceMappingURL=m4Tests.js.map
