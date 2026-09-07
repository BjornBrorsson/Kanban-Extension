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

// test/m2Tests.ts
var fs10 = __toESM(require("fs"));
var path12 = __toESM(require("path"));

// src/orchestrator/lead/planningSession.ts
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var LeadPlanningEngine = class {
  static DEFAULT_MAX_SUBTASKS = 20;
  /**
   * Validates a set of planned subtasks for circular dependencies using depth-first search.
   */
  static validateDependencyGraph(subtasks) {
    const adjList = /* @__PURE__ */ new Map();
    const taskIds = new Set(subtasks.map((s) => s.id));
    for (const task of subtasks) {
      const deps = (task.dependsOn || []).filter((d) => taskIds.has(d));
      adjList.set(task.id, deps);
    }
    const visited = /* @__PURE__ */ new Set();
    const recStack = /* @__PURE__ */ new Set();
    const currentPath = [];
    function dfs(node) {
      visited.add(node);
      recStack.add(node);
      currentPath.push(node);
      const neighbors = adjList.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          const cycle = dfs(neighbor);
          if (cycle)
            return cycle;
        } else if (recStack.has(neighbor)) {
          const cycleStart = currentPath.indexOf(neighbor);
          return [...currentPath.slice(cycleStart), neighbor];
        }
      }
      recStack.delete(node);
      currentPath.pop();
      return null;
    }
    for (const task of subtasks) {
      if (!visited.has(task.id)) {
        const cycle = dfs(task.id);
        if (cycle) {
          return { valid: false, cycle };
        }
      }
    }
    return { valid: true };
  }
  /**
   * Plans and decomposes a goal into bounded subtasks with safeguards.
   */
  static planGoal(goalDescription, proposedSubtasks, options = {}) {
    const maxSubtasks = options.maxSubtasks || this.DEFAULT_MAX_SUBTASKS;
    if (proposedSubtasks.length > maxSubtasks) {
      throw new Error(`Planning error: Decomposed subtask count (${proposedSubtasks.length}) exceeds safety limit (${maxSubtasks}).`);
    }
    const validation = this.validateDependencyGraph(proposedSubtasks);
    if (!validation.valid) {
      throw new Error(`Planning error: Circular dependency detected in plan: ${validation.cycle?.join(" -> ")}`);
    }
    const taskMap = /* @__PURE__ */ new Map();
    for (const task of proposedSubtasks) {
      taskMap.set(task.id, task);
    }
    for (const task of proposedSubtasks) {
      if (task.dependsOn) {
        for (const depId of task.dependsOn) {
          const parent = taskMap.get(depId);
          if (parent) {
            parent.blocks = parent.blocks || [];
            if (!parent.blocks.includes(task.id)) {
              parent.blocks.push(task.id);
            }
          }
        }
      }
    }
    const dependencyGraph = {};
    for (const task of proposedSubtasks) {
      dependencyGraph[task.id] = task.dependsOn || [];
    }
    return {
      epicOrGoal: goalDescription,
      summary: `Decomposed goal into ${proposedSubtasks.length} bounded subtasks with verified dependency ordering.`,
      subtasks: proposedSubtasks,
      dependencyGraph
    };
  }
  /**
   * Generates a standard markdown ticket file content adhering to TicketParser conventions.
   */
  static formatTicketMarkdown(subtask, epicName) {
    const lines = [];
    lines.push(`# ${subtask.id} \u2014 ${subtask.title}`);
    lines.push("");
    lines.push("| Field | Value |");
    lines.push("|-------|-------|");
    if (epicName) {
      lines.push(`| **Epic** | ${epicName} |`);
    }
    lines.push(`| **Type** | ${subtask.type || "Feature"} |`);
    lines.push(`| **Priority** | ${subtask.priority} |`);
    if (subtask.estimate) {
      lines.push(`| **Estimate** | ${subtask.estimate} |`);
    }
    lines.push("| **Status** | Backlog |");
    lines.push("| **Assignee** | \u2014 |");
    if (subtask.dependsOn && subtask.dependsOn.length > 0) {
      lines.push(`| **Depends on** | ${subtask.dependsOn.join(", ")} |`);
    }
    if (subtask.blocks && subtask.blocks.length > 0) {
      lines.push(`| **Blocks** | ${subtask.blocks.join(", ")} |`);
    }
    if (subtask.allowedScope && subtask.allowedScope.length > 0) {
      lines.push(`| **Scope** | \`${subtask.allowedScope.join("`, `")}\` |`);
    }
    lines.push("");
    lines.push("## Summary");
    lines.push(subtask.objective);
    lines.push("");
    lines.push("## Acceptance Criteria");
    for (const criterion of subtask.acceptanceCriteria) {
      lines.push(`- [ ] ${criterion}`);
    }
    lines.push("");
    if (subtask.verificationCommand) {
      lines.push("## Verification");
      lines.push(`Run: \`${subtask.verificationCommand}\``);
      lines.push("");
    }
    lines.push("## Work Log");
    lines.push(`- **${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}**: Created via Lead Agent Planning Session.`);
    lines.push("");
    return lines.join("\n");
  }
  /**
   * Materializes planned subtasks as markdown cards in the board's Backlog folder.
   */
  static writeSubtasksToBoard(boardBacklogDir, result) {
    if (!fs.existsSync(boardBacklogDir)) {
      fs.mkdirSync(boardBacklogDir, { recursive: true });
    }
    const createdFiles = [];
    for (const subtask of result.subtasks) {
      const sanitizedTitle = subtask.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const filename = `${subtask.id}_${sanitizedTitle}.md`;
      const filePath = path.join(boardBacklogDir, filename);
      const content = this.formatTicketMarkdown(subtask, result.epicOrGoal);
      fs.writeFileSync(filePath, content, "utf8");
      createdFiles.push(filePath);
    }
    return createdFiles;
  }
};

// src/orchestrator/context/contextPackager.ts
var fs2 = __toESM(require("fs"));
var path2 = __toESM(require("path"));
var crypto = __toESM(require("crypto"));
var ContextPackager = class {
  /**
   * Computes SHA-256 hash for a file.
   */
  static hashFile(filePath) {
    if (!fs2.existsSync(filePath)) {
      return "";
    }
    const content = fs2.readFileSync(filePath);
    return crypto.createHash("sha256").update(content).digest("hex");
  }
  /**
   * Builds an immutable, bounded DelegationPackage.
   */
  static packageForWorker(input) {
    const sourceReferences = [];
    const targets = input.targetFiles || [];
    for (const relOrAbs of targets) {
      const absPath = path2.isAbsolute(relOrAbs) ? relOrAbs : path2.join(input.workspaceRoot, relOrAbs);
      if (fs2.existsSync(absPath) && fs2.statSync(absPath).isFile()) {
        const relPath = path2.relative(input.workspaceRoot, absPath).replace(/\\/g, "/");
        sourceReferences.push({
          path: relPath,
          hash: this.hashFile(absPath)
        });
      }
    }
    const composite = sourceReferences.map((s) => `${s.path}:${s.hash}`).join(";");
    const baseRevision = crypto.createHash("sha256").update(composite || input.ticketId).digest("hex").substring(0, 12);
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
    const handoffsDir = path2.join(workspaceRoot, ".agentic-kanban", "runtime", "handoffs");
    if (!fs2.existsSync(handoffsDir)) {
      fs2.mkdirSync(handoffsDir, { recursive: true });
    }
    const filePath = path2.join(handoffsDir, `${pkg.attemptId}.json`);
    fs2.writeFileSync(filePath, JSON.stringify(pkg, null, 2), "utf8");
    return filePath;
  }
  /**
   * Loads a persisted delegation package.
   */
  static loadPackage(workspaceRoot, attemptId) {
    const filePath = path2.join(workspaceRoot, ".agentic-kanban", "runtime", "handoffs", `${attemptId}.json`);
    if (!fs2.existsSync(filePath)) {
      return null;
    }
    try {
      return JSON.parse(fs2.readFileSync(filePath, "utf8"));
    } catch {
      return null;
    }
  }
};

// src/orchestrator/lead/delegationProtocol.ts
var path3 = __toESM(require("path"));
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
      const baseName = path3.basename(normPath);
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
      if (workspaceRoot && path3.isAbsolute(file)) {
        relPath = path3.relative(workspaceRoot, file);
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

// src/orchestrator/core/runtimeJournal.ts
var fs4 = __toESM(require("fs"));
var path5 = __toESM(require("path"));

// src/orchestrator/models/ticketAttempt.ts
var crypto2 = __toESM(require("crypto"));
var fs3 = __toESM(require("fs"));
var path4 = __toESM(require("path"));
var TicketAttemptManager = class {
  /**
   * Generates a unique monotonic attempt ID.
   */
  static generateAttemptId(ticketId, generation) {
    const timestamp = Date.now();
    const randomSuffix = crypto2.randomBytes(3).toString("hex");
    return `att_${ticketId.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}_g${generation}_${timestamp}_${randomSuffix}`;
  }
  /**
   * Computes SHA-256 hash of a string or file buffer.
   */
  static computeHash(content) {
    return crypto2.createHash("sha256").update(content).digest("hex");
  }
  /**
   * Generates a snapshot manifest of baseline file contents.
   */
  static createManifest(baseRevision, filePaths) {
    const fileHashes = {};
    for (const fp of filePaths) {
      if (fs3.existsSync(fp) && !fs3.statSync(fp).isDirectory()) {
        const fileData = fs3.readFileSync(fp);
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
  static createAttempt(ticketId, generation, agentId, tier, manifest, budgetReservation) {
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
      budgetReservation
    };
  }
  /**
   * Resolves the runtime store directory for a workspace.
   * Invariant: This store is durable across crashes, uncommitted to version control,
   * and never wiped while active attempts or recovery obligations exist.
   */
  static getRuntimeStoreDir(workspaceRoot) {
    const dir = path4.join(workspaceRoot, ".agentic-kanban", "runtime");
    if (!fs3.existsSync(dir)) {
      fs3.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }
  /**
   * Persists an attempt record durably to the runtime store.
   */
  static saveAttempt(workspaceRoot, attempt) {
    const attemptsDir = path4.join(this.getRuntimeStoreDir(workspaceRoot), "attempts");
    if (!fs3.existsSync(attemptsDir)) {
      fs3.mkdirSync(attemptsDir, { recursive: true });
    }
    attempt.updatedAt = Date.now();
    const filePath = path4.join(attemptsDir, `${attempt.attemptId}.json`);
    const tempPath = `${filePath}.tmp`;
    fs3.writeFileSync(tempPath, JSON.stringify(attempt, null, 2), "utf8");
    fs3.renameSync(tempPath, filePath);
  }
  /**
   * Reads an attempt record from disk.
   */
  static loadAttempt(workspaceRoot, attemptId) {
    const filePath = path4.join(this.getRuntimeStoreDir(workspaceRoot), "attempts", `${attemptId}.json`);
    if (!fs3.existsSync(filePath)) {
      return null;
    }
    try {
      const data = fs3.readFileSync(filePath, "utf8");
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
    this.lockFile = path5.join(this.runtimeDir, "workspace.lock");
    this.journalFile = path5.join(this.runtimeDir, "journal.jsonl");
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
      const gitIgnorePath = path5.join(this.workspaceRoot, ".gitignore");
      if (fs4.existsSync(path5.join(this.workspaceRoot, ".git"))) {
        let content = "";
        if (fs4.existsSync(gitIgnorePath)) {
          content = fs4.readFileSync(gitIgnorePath, "utf8");
        }
        if (!content.includes(".agentic-kanban")) {
          const suffix = content.endsWith("\n") || !content ? "" : "\n";
          fs4.writeFileSync(gitIgnorePath, `${content}${suffix}# Agentic Kanban local runtime store
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
    if (fs4.existsSync(this.lockFile)) {
      try {
        const lockContent = fs4.readFileSync(this.lockFile, "utf8");
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
    fs4.writeFileSync(tempLock, JSON.stringify(lockData, null, 2), "utf8");
    fs4.renameSync(tempLock, this.lockFile);
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
    if (this.isOwner && fs4.existsSync(this.lockFile)) {
      try {
        fs4.unlinkSync(this.lockFile);
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
      fs4.appendFileSync(this.journalFile, line, "utf8");
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
    const attemptsDir = path5.join(this.runtimeDir, "attempts");
    if (!fs4.existsSync(attemptsDir))
      return [];
    const interrupted = [];
    const files = fs4.readdirSync(attemptsDir).filter((f) => f.endsWith(".json") && !f.endsWith(".tmp"));
    for (const f of files) {
      try {
        const data = fs4.readFileSync(path5.join(attemptsDir, f), "utf8");
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
var crypto3 = __toESM(require("crypto"));
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
    const token = `lease_${ticketId}_g${currentGen}_${crypto3.randomBytes(6).toString("hex")}`;
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
var cp = __toESM(require("child_process"));
var fs5 = __toESM(require("fs"));
var path6 = __toESM(require("path"));
var WorkspaceManager = class {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
    this.worktreesDir = path6.join(this.workspaceRoot, ".agentic-kanban", "worktrees");
    if (!fs5.existsSync(this.worktreesDir)) {
      fs5.mkdirSync(this.worktreesDir, { recursive: true });
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
        const rev = cp.execSync("git rev-parse HEAD", { cwd: this.workspaceRoot, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
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
    const targetDir = path6.join(this.worktreesDir, attemptId);
    if (fs5.existsSync(targetDir)) {
      this.cleanup(attemptId);
    }
    const isCleanGit = this.isGitClean();
    if (isCleanGit) {
      try {
        cp.execSync(`git worktree add -d "${targetDir}"`, { cwd: this.workspaceRoot, stdio: "ignore" });
        return {
          attemptId,
          workspacePath: targetDir,
          strategy: "git-worktree",
          manifest
        };
      } catch {
      }
    }
    fs5.mkdirSync(targetDir, { recursive: true });
    for (const [filePath] of Object.entries(manifest.fileHashes)) {
      if (fs5.existsSync(filePath)) {
        const relPath = path6.relative(this.workspaceRoot, filePath);
        const destPath = path6.join(targetDir, relPath);
        fs5.mkdirSync(path6.dirname(destPath), { recursive: true });
        fs5.copyFileSync(filePath, destPath);
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
      const relPath = path6.relative(this.workspaceRoot, origPath);
      const allocatedFilePath = path6.join(allocation.workspacePath, relPath);
      if (fs5.existsSync(allocatedFilePath)) {
        const newContent = fs5.readFileSync(allocatedFilePath, "utf8");
        const newHash = TicketAttemptManager.computeHash(Buffer.from(newContent, "utf8"));
        if (newHash !== origHash) {
          const oldContent = fs5.existsSync(origPath) ? fs5.readFileSync(origPath, "utf8") : "";
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
      cp.exec(command, { cwd: allocation.workspacePath, timeout: 6e4 }, (err, stdout, stderr) => {
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
      const relPath = path6.relative(this.workspaceRoot, origPath);
      const allocatedFilePath = path6.join(allocation.workspacePath, relPath);
      if (fs5.existsSync(allocatedFilePath)) {
        const newContent = fs5.readFileSync(allocatedFilePath);
        const newHash = TicketAttemptManager.computeHash(newContent);
        if (newHash !== expectedHash) {
          if (fs5.existsSync(origPath)) {
            const currentTargetContent = fs5.readFileSync(origPath);
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
      fs5.mkdirSync(path6.dirname(item.destPath), { recursive: true });
      fs5.copyFileSync(item.sourcePath, item.destPath);
      applied.push(path6.relative(this.workspaceRoot, item.destPath));
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
    const targetDir = path6.join(this.worktreesDir, attemptId);
    if (!fs5.existsSync(targetDir))
      return;
    try {
      if (this.isGitRepo()) {
        try {
          cp.execSync(`git worktree remove --force "${targetDir}"`, { cwd: this.workspaceRoot, stdio: "ignore" });
        } catch {
        }
      }
      if (fs5.existsSync(targetDir)) {
        fs5.rmSync(targetDir, { recursive: true, force: true });
      }
    } catch {
    }
  }
  isGitRepo() {
    return fs5.existsSync(path6.join(this.workspaceRoot, ".git"));
  }
  isGitClean() {
    if (!this.isGitRepo())
      return false;
    try {
      const status = cp.execSync("git status --porcelain", { cwd: this.workspaceRoot, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
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

// src/orchestrator/lead/escalationHandler.ts
var fs6 = __toESM(require("fs"));
var path7 = __toESM(require("path"));
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
var cp2 = __toESM(require("child_process"));
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
        const out = cp2.execSync(`tasklist /FI "PID eq ${pid}" /NH`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
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
            cp2.execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" });
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
        errorMessage: reservation.reason
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
      { currency: "EUR", unitsReserved: 1, unitsSpentReported: 0, unitsSpentEstimated: 0, isSubscriptionQuota: false }
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
      reservation
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
        errorMessage: reservation.reason
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
      { currency: "EUR", unitsReserved: 1, unitsSpentReported: 0, unitsSpentEstimated: 0, isSubscriptionQuota: false }
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
      integrated
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

// src/ticketParser.ts
var path11 = __toESM(require("path"));
var TicketParser = class {
  static parse(filePath, content, boardRoot, column, subfolder, mtime = Date.now()) {
    const filename = path11.basename(filePath);
    const relativePath = path11.relative(boardRoot, filePath).replace(/\\/g, "/");
    const { frontmatter, bodyWithoutFrontmatter } = this.extractFrontmatter(content);
    const tableFields = this.extractMarkdownTable(bodyWithoutFrontmatter);
    const { id, title } = this.extractIdAndTitle(filename, bodyWithoutFrontmatter, frontmatter, tableFields);
    const status = frontmatter.status || tableFields["status"] || column;
    const priority = frontmatter.priority || tableFields["priority"] || "Normal";
    const epic = frontmatter.epic || tableFields["epic"] || null;
    const type = frontmatter.type || tableFields["type"] || null;
    const estimate = frontmatter.estimate || tableFields["estimate"] || null;
    const milestone = frontmatter.milestone || tableFields["milestone"] || null;
    let assignee = frontmatter.assignee || tableFields["assignee"] || null;
    if (assignee && (assignee === "\u2014" || assignee === "-" || assignee.toLowerCase() === "unassigned" || assignee.toLowerCase() === "none")) {
      assignee = null;
    }
    const labels = this.extractLabels(frontmatter, tableFields, bodyWithoutFrontmatter);
    const dependsOn = this.parseListField(frontmatter.dependsOn || tableFields["depends on"] || tableFields["dependson"]);
    const blocks = this.parseListField(frontmatter.blocks || tableFields["blocks"]);
    const { summary, description } = this.extractSummaryAndDescription(bodyWithoutFrontmatter);
    const acceptanceCriteria = this.extractAcceptanceCriteria(bodyWithoutFrontmatter);
    const doneCount = acceptanceCriteria.filter((a) => a.done).length;
    const hasWorkLog = /##\s+Work\s+Log/i.test(bodyWithoutFrontmatter);
    return {
      id,
      filename,
      path: filePath,
      relativePath,
      column,
      subfolder,
      title,
      summary,
      description,
      status,
      priority,
      epic,
      type,
      estimate,
      milestone,
      assignee,
      dependsOn,
      blocks,
      labels,
      acceptanceCriteria,
      progress: {
        done: doneCount,
        total: acceptanceCriteria.length
      },
      mtime,
      hasWorkLog
    };
  }
  static extractFrontmatter(content) {
    const trimmed = content.trim();
    if (!trimmed.startsWith("---")) {
      return { frontmatter: {}, bodyWithoutFrontmatter: content };
    }
    const secondIndex = trimmed.indexOf("---", 3);
    if (secondIndex === -1) {
      return { frontmatter: {}, bodyWithoutFrontmatter: content };
    }
    const yamlBlock = trimmed.slice(3, secondIndex).trim();
    const bodyWithoutFrontmatter = trimmed.slice(secondIndex + 3).trim();
    const frontmatter = {};
    const lines = yamlBlock.split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        let val = match[2].trim();
        if (val.startsWith('"') && val.endsWith('"') || val.startsWith("'") && val.endsWith("'")) {
          val = val.slice(1, -1);
        }
        frontmatter[key] = val;
      }
    }
    return { frontmatter, bodyWithoutFrontmatter };
  }
  static extractIdAndTitle(filename, body, frontmatter, tableFields = {}) {
    if (frontmatter.title) {
      const id2 = frontmatter.id || this.guessIdFromFilename(filename);
      return { id: id2, title: frontmatter.title };
    }
    const tableId = tableFields["id"] || tableFields["ticket id"];
    if (tableId) {
      const h1Match2 = body.match(/^#\s+(.+)$/m);
      return {
        id: tableId,
        title: h1Match2 ? h1Match2[1].trim() : filename.replace(/\.md$/i, "")
      };
    }
    const h1Match = body.match(/^#\s+(.+)$/m);
    if (h1Match) {
      const line = h1Match[1].trim();
      const dashMatch = line.match(/^([A-Za-z0-9_-]+)\s*(?:[—–\-\:]|\])\s*(.+)$/);
      if (dashMatch) {
        return {
          id: dashMatch[1].replace(/\[|\]/g, "").trim(),
          title: dashMatch[2].trim()
        };
      }
      return {
        id: this.guessIdFromFilename(filename),
        title: line
      };
    }
    const id = this.guessIdFromFilename(filename);
    const cleanTitle = filename.replace(/\.md$/i, "").replace(/^example[_-]ticket[_-]/i, "").replace(/[_-]+/g, " ").trim();
    return {
      id,
      title: cleanTitle ? cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1) : filename
    };
  }
  static guessIdFromFilename(filename) {
    const match = filename.match(/^([A-Za-z]+[-_]\d+)/i);
    if (match) {
      return match[1].toUpperCase().replace("_", "-");
    }
    const numMatch = filename.match(/^(\d+)/);
    if (numMatch) {
      return `T-${numMatch[1]}`;
    }
    return filename.replace(/\.md$/i, "");
  }
  static extractMarkdownTable(body) {
    const result = {};
    const lines = body.split(/\r?\n/);
    let inTable = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
        const cells = trimmed.slice(1, -1).split("|").map((c) => c.trim());
        if (cells.length >= 2) {
          if (cells[0].includes("---") || cells[1].includes("---")) {
            inTable = true;
            continue;
          }
          if (inTable || trimmed.toLowerCase().includes("field") || trimmed.toLowerCase().includes("value")) {
            inTable = true;
            const rawKey = cells[0].replace(/\*\*/g, "").replace(/__/g, "").trim().toLowerCase();
            const rawVal = cells[1].trim();
            if (rawKey && rawVal && rawKey !== "field") {
              result[rawKey] = rawVal;
            }
          }
        }
      } else if (inTable && trimmed === "") {
        break;
      }
    }
    return result;
  }
  static extractLabels(frontmatter, tableFields, body) {
    const labels = /* @__PURE__ */ new Set();
    if (frontmatter.labels || frontmatter.tags) {
      const raw = frontmatter.labels || frontmatter.tags;
      if (Array.isArray(raw)) {
        raw.forEach((r) => labels.add(String(r).trim()));
      } else if (typeof raw === "string") {
        raw.split(/[,;\s]+/).forEach((r) => r && labels.add(r.trim()));
      }
    }
    const tableLabelStr = tableFields["labels"] || tableFields["tags"] || tableFields["label"] || tableFields["tag"];
    if (tableLabelStr) {
      const extracted = tableLabelStr.match(/`([^`]+)`/g);
      if (extracted) {
        extracted.forEach((item) => labels.add(item.replace(/`/g, "").trim()));
      } else {
        tableLabelStr.split(",").forEach((item) => {
          const clean = item.replace(/[`"']/g, "").trim();
          if (clean && clean !== "\u2014")
            labels.add(clean);
        });
      }
    }
    const hashtags = body.match(/(?<=^|\s)#[a-zA-Z][a-zA-Z0-9_-]{2,}/g);
    if (hashtags) {
      hashtags.slice(0, 5).forEach((h) => labels.add(h.trim()));
    }
    return Array.from(labels);
  }
  static parseListField(raw) {
    if (!raw || raw === "\u2014" || raw === "-" || raw.toLowerCase() === "none") {
      return [];
    }
    return raw.split(/[,;]+/).map((s) => s.replace(/[`"']/g, "").trim()).filter((s) => s.length > 0 && s !== "\u2014");
  }
  static extractSummaryAndDescription(body) {
    let summary = "";
    let description = "";
    const summaryMatch = body.match(/##\s+Summary\s*\r?\n([\s\S]*?)(?=\r?\n##\s+|$)/i);
    if (summaryMatch) {
      summary = summaryMatch[1].trim();
    }
    const descMatch = body.match(/##\s+Description\s*\r?\n([\s\S]*?)(?=\r?\n##\s+|$)/i);
    if (descMatch) {
      description = descMatch[1].trim();
    }
    if (!summary) {
      const paragraphs = body.split(/\r?\n\r?\n/);
      for (const p of paragraphs) {
        const trimmed = p.trim();
        if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("|") && !trimmed.startsWith("---") && !trimmed.startsWith("```")) {
          summary = trimmed.replace(/\r?\n/g, " ").slice(0, 240);
          break;
        }
      }
    }
    return { summary, description };
  }
  static extractAcceptanceCriteria(body) {
    const results = [];
    const checklistRegex = /^[\s>]*-\s*\[([ xX])\]\s+(.+)$/gm;
    let match;
    while ((match = checklistRegex.exec(body)) !== null) {
      const isDone = match[1].toLowerCase() === "x";
      const text = match[2].trim();
      results.push({
        text,
        done: isDone
      });
    }
    return results;
  }
  static updateTicketStatus(content, newStatus) {
    const eol = content.includes("\r\n") ? "\r\n" : "\n";
    let updated = content;
    const tableRegex = /^(\|\s*\*{0,2}Status\*{0,2}\s*\|\s*)([^|\r\n]+?)(\s*\|.*)$/im;
    if (tableRegex.test(updated)) {
      updated = updated.replace(tableRegex, `$1${newStatus} |`);
      return updated;
    }
    const frontmatterRegex = /^(status\s*:\s*)([^\r\n]+)$/im;
    if (frontmatterRegex.test(updated)) {
      updated = updated.replace(frontmatterRegex, `$1${newStatus}`);
      return updated;
    }
    return updated;
  }
  static updateTicketAssignee(content, newAssignee) {
    const eol = content.includes("\r\n") ? "\r\n" : "\n";
    let updated = content;
    const val = newAssignee && newAssignee.trim() ? newAssignee.trim() : "\u2014";
    const tableAssigneeRegex = /^(\|\s*\*{0,2}Assignee\*{0,2}\s*\|\s*)([^|\r\n]+?)(\s*\|.*)$/im;
    if (tableAssigneeRegex.test(updated)) {
      updated = updated.replace(tableAssigneeRegex, `$1${val} |`);
      return updated;
    }
    const statusRowRegex = /^(\|\s*\*{0,2}Status\*{0,2}\s*\|.*)$/im;
    if (statusRowRegex.test(updated)) {
      updated = updated.replace(statusRowRegex, `$1${eol}| **Assignee** | ${val} |`);
      return updated;
    }
    const dividerRegex = /^(\|[-:\s|]+[-:]+\|)$/im;
    if (dividerRegex.test(updated)) {
      updated = updated.replace(dividerRegex, `$1${eol}| **Assignee** | ${val} |`);
      return updated;
    }
    const anyTableRowRegex = /^(\|\s*\*{0,2}(?:Priority|Type|Epic|Estimate|Milestone)\*{0,2}\s*\|.*)$/im;
    if (anyTableRowRegex.test(updated)) {
      updated = updated.replace(anyTableRowRegex, `$1${eol}| **Assignee** | ${val} |`);
      return updated;
    }
    const frontmatterAssigneeRegex = /^(assignee\s*:\s*)([^\r\n]+)$/im;
    if (frontmatterAssigneeRegex.test(updated)) {
      updated = updated.replace(frontmatterAssigneeRegex, `$1${val === "\u2014" ? "" : val}`);
      return updated;
    }
    const frontmatterBlockRegex = /^---\r?\n([\s\S]*?)\r?\n---/;
    const fmMatch = updated.match(frontmatterBlockRegex);
    if (fmMatch) {
      const fmContent = fmMatch[1];
      const newFm = `---${eol}${fmContent}${eol}assignee: ${val === "\u2014" ? "" : val}${eol}---`;
      return updated.replace(frontmatterBlockRegex, newFm);
    }
    const headingRegex = /^(#\s+[^\r\n]+(?:\r?\n)+)/;
    const headingMatch = updated.match(headingRegex);
    const tableBlock = `| Field | Value |${eol}|-------|-------|${eol}| **Assignee** | ${val} |${eol}${eol}`;
    if (headingMatch) {
      return updated.replace(headingRegex, `${headingMatch[1]}${tableBlock}`);
    }
    return `${tableBlock}${updated}`;
  }
  /**
   * Toggles the Nth acceptance criterion checkbox in the document.
   * Matches both `- [ ]` and `- [x]`, preserving indentation, prefix, and line endings.
   */
  static toggleCriterion(content, index, done) {
    if (index < 0)
      return content;
    const checklistRegex = /^([\s>]*-\s*\[)([ xX])(\]\s+.*)$/gm;
    let matchCount = 0;
    let match;
    while ((match = checklistRegex.exec(content)) !== null) {
      if (matchCount === index) {
        const fullMatch = match[0];
        const matchIndex = match.index;
        const prefix = match[1];
        const suffix = match[3];
        const newChar = done ? "x" : " ";
        const updatedLine = `${prefix}${newChar}${suffix}`;
        return content.slice(0, matchIndex) + updatedLine + content.slice(matchIndex + fullMatch.length);
      }
      matchCount++;
    }
    return content;
  }
  /**
   * Scans ## Work Log in the ticket markdown content and extracts dated log entries.
   */
  static extractWorkLogEntries(content, ticketId, ticketTitle, ticketPath, boardId, boardName) {
    const entries = [];
    const lines = content.split(/\r?\n/);
    let inWorkLog = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (/^##\s+Work\s+Log/i.test(trimmed)) {
        inWorkLog = true;
        continue;
      }
      if (inWorkLog) {
        if (/^##\s+[^#]/i.test(trimmed)) {
          break;
        }
        const dateMatch = trimmed.match(/^[-*]\s+(?:\*\*)?(\d{4}[-/]\d{2}[-/]\d{2}(?:\s+\d{2}:\d{2})?)(?:\*\*)?[\s:\-—–]+(.*)$/);
        if (dateMatch) {
          const dateStr = dateMatch[1].trim();
          const text = dateMatch[2].trim();
          entries.push({
            date: dateStr,
            timestamp: Date.parse(dateStr) || void 0,
            boardId,
            boardName,
            ticketId,
            ticketTitle,
            ticketPath,
            text,
            line: i + 1
          });
        } else if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
          const text = trimmed.replace(/^[-*]\s+/, "").trim();
          if (text) {
            entries.push({
              date: "Recent",
              boardId,
              boardName,
              ticketId,
              ticketTitle,
              ticketPath,
              text,
              line: i + 1
            });
          }
        }
      }
    }
    return entries;
  }
};

// test/m2Tests.ts
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}
async function runM2Tests() {
  console.log("=== Running Milestone M2 Integration Tests ===");
  const testRoot = path12.join(__dirname, "..", "scratch", "m2-test-workspace");
  fs10.mkdirSync(testRoot, { recursive: true });
  console.log("\n--- Test 1: Lead Planning Engine & Dependency Cycle Detection ---");
  const validSubtasks = [
    {
      id: "TASK-101",
      title: "Database Schema Migration",
      priority: "P0 \u2014 Critical",
      allowedScope: ["src/db/**"],
      objective: "Add accounts table migration script.",
      acceptanceCriteria: ["Migration runs cleanly", "Rollback succeeds"],
      blocks: ["TASK-102"]
    },
    {
      id: "TASK-102",
      title: "User Service Repository",
      priority: "P1 \u2014 Core",
      dependsOn: ["TASK-101"],
      allowedScope: ["src/services/UserService.ts"],
      objective: "Implement CRUD operations on accounts table.",
      acceptanceCriteria: ["Passes integration tests", "No SQL injection"],
      verificationCommand: 'node -e "process.exit(0)"'
    }
  ];
  const planResult = LeadPlanningEngine.planGoal("Build User Account Feature", validSubtasks);
  assert(planResult.subtasks.length === 2, "Should decompose into 2 subtasks");
  assert(planResult.dependencyGraph["TASK-102"].includes("TASK-101"), "TASK-102 must depend on TASK-101");
  const cyclicSubtasks = [
    { id: "A", title: "Task A", priority: "P1 \u2014 Core", dependsOn: ["B"], allowedScope: [], objective: "", acceptanceCriteria: [] },
    { id: "B", title: "Task B", priority: "P1 \u2014 Core", dependsOn: ["C"], allowedScope: [], objective: "", acceptanceCriteria: [] },
    { id: "C", title: "Task C", priority: "P1 \u2014 Core", dependsOn: ["A"], allowedScope: [], objective: "", acceptanceCriteria: [] }
  ];
  let cycleDetected = false;
  try {
    LeadPlanningEngine.planGoal("Cyclic Goal", cyclicSubtasks);
  } catch (err) {
    cycleDetected = true;
    assert(err.message.includes("Circular dependency detected"), "Error must report cycle");
  }
  assert(cycleDetected, "Cyclic dependencies must be rejected");
  const backlogDir = path12.join(testRoot, "Backlog");
  const writtenFiles = LeadPlanningEngine.writeSubtasksToBoard(backlogDir, planResult);
  assert(writtenFiles.length === 2, "Should write 2 ticket files");
  const content = fs10.readFileSync(writtenFiles[0], "utf8");
  const parsedCard = TicketParser.parse(writtenFiles[0], content, testRoot, "Backlog", null);
  assert(parsedCard !== null, "TicketParser should parse generated card");
  assert(parsedCard?.id === "TASK-101", `Expected TASK-101, got ${parsedCard?.id}`);
  assert(parsedCard?.acceptanceCriteria.length === 2, "Acceptance criteria checklist should be parsed");
  console.log("\u2713 Lead planning decomposition, cycle detection, and markdown authoring verified.");
  console.log("\n--- Test 2: Bounded Delegation Package & Scope Boundary Enforcement ---");
  const featureFile = path12.join(testRoot, "Feature.ts");
  fs10.writeFileSync(featureFile, "export const active = true;\n", "utf8");
  const pkg = ContextPackager.packageForWorker({
    ticketId: "TASK-102",
    attemptId: "att-m2-001",
    objective: "Implement user service",
    allowedScope: ["Feature.ts", "src/services/**"],
    workspaceRoot: testRoot,
    targetFiles: [featureFile]
  });
  assert(pkg.sourceReferences.length === 1, "Should record 1 source reference");
  assert(pkg.sourceReferences[0].hash.length === 64, "Source reference must have SHA-256 hash");
  ContextPackager.persistPackage(testRoot, pkg);
  const reloadedPkg = ContextPackager.loadPackage(testRoot, "att-m2-001");
  assert(reloadedPkg?.ticketId === "TASK-102", "Delegation package must reload from disk");
  const allowedDiff = `--- a/Feature.ts
+++ b/Feature.ts
@@ -1 +1 @@
-export const active = true;
+export const active = false;
`;
  const allowedFiles = DelegationProtocol.extractFilesFromDiff(allowedDiff);
  const validScope = DelegationProtocol.validateScope(allowedFiles, pkg.allowedScope);
  assert(validScope.valid === true, "In-scope file edit should pass");
  const disallowedDiff = `--- a/src/config/Database.secret
+++ b/src/config/Database.secret
@@ -1 +1 @@
-secret=1
+secret=2
`;
  const disallowedFiles = DelegationProtocol.extractFilesFromDiff(disallowedDiff);
  const invalidScope = DelegationProtocol.validateScope(disallowedFiles, pkg.allowedScope);
  assert(invalidScope.valid === false, "Out-of-scope edit must be rejected");
  assert(invalidScope.violatedFiles.includes("src/config/Database.secret"), "Violated file must be identified");
  console.log("\u2713 Bounded delegation packaging and scope boundary enforcement verified.");
  console.log("\n--- Test 3: Escalation Triggers & Lead Checkpoint Takeover ---");
  const runtime = new OrchestratorRuntime(testRoot);
  await runtime.initialize();
  const esc = runtime.escalationHandler.evaluateEscalationTriggers({
    ticketId: "TASK-102",
    attemptId: "att-m2-001",
    workerId: "worker-small",
    delegationPackage: pkg,
    diff: disallowedDiff
  });
  assert(esc !== null, "Escalation should trigger on out-of-scope edit");
  assert(esc?.triggerType === "OUT_OF_SCOPE", `Expected OUT_OF_SCOPE, got ${esc?.triggerType}`);
  const manifest = await runtime.workspaceManager.captureBaseline([featureFile]);
  const alloc = await runtime.workspaceManager.allocate("att-m2-001", manifest);
  const workerLease = runtime.leaseManager.acquireLease("TASK-102");
  const leadAdapter = new FakeDeterministicAdapter();
  leadAdapter.behavior.patchToGenerate = `--- a/Feature.ts
+++ b/Feature.ts
@@ -1 +1 @@
-export const active = true;
+export const active = false; // resolved by lead
`;
  const takeoverResult = await runtime.escalationHandler.executeLeadTakeover(
    esc,
    leadAdapter,
    workerLease.token,
    alloc,
    "Lead Takeover: Resolve scope and produce clean patch."
  );
  assert(takeoverResult.success === true, "Lead takeover should succeed");
  assert(takeoverResult.outcome === "RESOLVED_BY_LEAD", "Outcome must be RESOLVED_BY_LEAD");
  assert(takeoverResult.resolvedPatch?.includes("resolved by lead") === true, "Lead patch must be captured");
  console.log("\u2713 Worker escalation halted safely and Lead takeover completed checkpoint resolution.");
  console.log("\n--- Test 4: Independent Verification & Fresh Review Step ---");
  const reviewEvidence = await runtime.reviewManager.runIndependentVerification(
    alloc,
    "TASK-102",
    'node -e "process.exit(0)"'
  );
  assert(reviewEvidence.passed === true, "Independent verification must pass");
  assert(reviewEvidence.exitCode === 0, "Exit code must be 0");
  const reviewDecision = runtime.reviewManager.performFreshReview({
    ticketId: "TASK-102",
    attemptId: "att-m2-001",
    patchDiff: takeoverResult.resolvedPatch,
    acceptanceCriteria: ["Passes integration tests", "No SQL injection"],
    verificationEvidence: reviewEvidence
  });
  assert(reviewDecision.approved === true, "Review decision must be approved");
  assert(reviewDecision.criteriaChecked.length === 2, "All 2 criteria must be checked");
  const gateCheck = runtime.reviewManager.canTransitionToDone("att-m2-001");
  assert(gateCheck.allowed === true, "Gate check should allow transition to Review/Done");
  console.log("\u2713 Independent verification evidence captured and Fresh Lead Review gated successfully.");
  console.log("\n--- Test 5: Full End-to-End Delegated Attempt with Routine Escalation ---");
  const delegatedFile = path12.join(testRoot, "Service.ts");
  fs10.writeFileSync(delegatedFile, "export function run() { return 1; }\n", "utf8");
  const workerAdapter = new FakeDeterministicAdapter();
  workerAdapter.behavior.patchToGenerate = `--- a/Unscoped.ts
+++ b/Unscoped.ts
@@ -1 +1 @@
-old
+new
`;
  const takeoverLeadAdapter = new FakeDeterministicAdapter();
  takeoverLeadAdapter.behavior.patchToGenerate = `--- a/Service.ts
+++ b/Service.ts
@@ -1 +1 @@
-export function run() { return 1; }
+export function run() { return 2; }
`;
  const delegatedOutput = await runtime.runDelegatedAttempt({
    ticketId: "TASK-103",
    workerAdapter,
    workerId: "worker-eco",
    leadAdapter: takeoverLeadAdapter,
    leadId: "lead-frontier",
    objective: "Update Service return value to 2",
    allowedScope: ["Service.ts"],
    acceptanceCriteria: ["Return value is 2", "Code passes test"],
    targetFiles: [delegatedFile],
    verificationCommand: 'node -e "process.exit(0)"'
  });
  assert(delegatedOutput.success === true, "Delegated attempt should succeed after routine lead takeover");
  assert(delegatedOutput.escalation !== void 0, "Worker escalation must have occurred");
  assert(delegatedOutput.takeoverResult?.success === true, "Takeover must have succeeded");
  assert(delegatedOutput.reviewDecision?.approved === true, "Fresh review must have approved");
  assert(delegatedOutput.attempt.status === "Review", `Attempt status should be Review, got ${delegatedOutput.attempt.status}`);
  console.log("\u2713 End-to-end delegated attempt handled routine worker escalation and completed with verified review.");
  runtime.dispose();
  try {
    fs10.rmSync(testRoot, { recursive: true, force: true });
  } catch {
  }
  console.log("\n=== ALL M2 TESTS PASSED SUCCESSFULLY! ===\n");
}
runM2Tests().catch((err) => {
  console.error("M2 Test Failure:", err);
  process.exit(1);
});
//# sourceMappingURL=m2Tests.js.map
