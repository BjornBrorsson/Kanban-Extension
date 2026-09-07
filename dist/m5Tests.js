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

// test/m5Tests.ts
var fs7 = __toESM(require("fs"));
var path7 = __toESM(require("path"));

// src/orchestrator/workspaces/plainFolderWorkspace.ts
var fs2 = __toESM(require("fs"));
var path2 = __toESM(require("path"));

// src/orchestrator/models/ticketAttempt.ts
var crypto = __toESM(require("crypto"));
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
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
    const dir = path.join(workspaceRoot, ".agentic-kanban", "runtime");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }
  /**
   * Persists an attempt record durably to the runtime store.
   */
  static saveAttempt(workspaceRoot, attempt) {
    const attemptsDir = path.join(this.getRuntimeStoreDir(workspaceRoot), "attempts");
    if (!fs.existsSync(attemptsDir)) {
      fs.mkdirSync(attemptsDir, { recursive: true });
    }
    attempt.updatedAt = Date.now();
    const filePath = path.join(attemptsDir, `${attempt.attemptId}.json`);
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(attempt, null, 2), "utf8");
    fs.renameSync(tempPath, filePath);
  }
  /**
   * Reads an attempt record from disk.
   */
  static loadAttempt(workspaceRoot, attemptId) {
    const filePath = path.join(this.getRuntimeStoreDir(workspaceRoot), "attempts", `${attemptId}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    try {
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
};

// src/orchestrator/workspaces/plainFolderWorkspace.ts
var PlainFolderWorkspaceProvider = class {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
    this.snapshotsDir = path2.join(this.workspaceRoot, ".agentic-kanban", "snapshots");
    if (!fs2.existsSync(this.snapshotsDir)) {
      fs2.mkdirSync(this.snapshotsDir, { recursive: true });
    }
  }
  snapshotsDir;
  /**
   * Captures baseline manifest of target files for a non-VCS workspace.
   */
  async captureBaseline(filePaths = []) {
    return TicketAttemptManager.createManifest("plain-folder-baseline", filePaths);
  }
  /**
   * Allocates an isolated snapshot directory for an attempt.
   */
  async allocateSnapshot(attemptId, manifest) {
    const targetDir = path2.join(this.snapshotsDir, attemptId);
    if (fs2.existsSync(targetDir)) {
      fs2.rmSync(targetDir, { recursive: true, force: true });
    }
    fs2.mkdirSync(targetDir, { recursive: true });
    for (const [filePath] of Object.entries(manifest.fileHashes)) {
      if (fs2.existsSync(filePath)) {
        const relPath = path2.relative(this.workspaceRoot, filePath);
        const destPath = path2.join(targetDir, relPath);
        fs2.mkdirSync(path2.dirname(destPath), { recursive: true });
        fs2.copyFileSync(filePath, destPath);
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
   * Applies changes made in snapshot back to main workspace with baseline hash guarding.
   */
  async integrateSnapshot(allocation) {
    const conflicts = [];
    const filesToApply = [];
    for (const [origPath, expectedHash] of Object.entries(allocation.manifest.fileHashes)) {
      const relPath = path2.relative(this.workspaceRoot, origPath);
      const allocatedPath = path2.join(allocation.workspacePath, relPath);
      if (fs2.existsSync(allocatedPath)) {
        const newContent = fs2.readFileSync(allocatedPath);
        const newHash = TicketAttemptManager.computeHash(newContent);
        if (newHash !== expectedHash) {
          if (fs2.existsSync(origPath)) {
            const currentContent = fs2.readFileSync(origPath);
            const currentHash = TicketAttemptManager.computeHash(currentContent);
            if (currentHash !== expectedHash) {
              conflicts.push(relPath);
              continue;
            }
          }
          filesToApply.push({ sourcePath: allocatedPath, destPath: origPath });
        }
      }
    }
    if (conflicts.length > 0) {
      return {
        success: false,
        appliedFiles: [],
        conflictFiles: conflicts,
        errorMessage: `Plain folder conflict: Files modified externally during attempt: ${conflicts.join(", ")}`
      };
    }
    const applied = [];
    for (const item of filesToApply) {
      fs2.mkdirSync(path2.dirname(item.destPath), { recursive: true });
      fs2.copyFileSync(item.sourcePath, item.destPath);
      applied.push(path2.relative(this.workspaceRoot, item.destPath));
    }
    this.cleanup(allocation.attemptId);
    return {
      success: true,
      appliedFiles: applied
    };
  }
  cleanup(attemptId) {
    const targetDir = path2.join(this.snapshotsDir, attemptId);
    if (fs2.existsSync(targetDir)) {
      fs2.rmSync(targetDir, { recursive: true, force: true });
    }
  }
};

// src/orchestrator/workspaces/tfvcWorkspace.ts
var fs3 = __toESM(require("fs"));
var path3 = __toESM(require("path"));
var cp = __toESM(require("child_process"));
var TfvcWorkspaceProvider = class {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
    this.shelvesetsDir = path3.join(this.workspaceRoot, ".agentic-kanban", "shelvesets");
    if (!fs3.existsSync(this.shelvesetsDir)) {
      fs3.mkdirSync(this.shelvesetsDir, { recursive: true });
    }
  }
  activeWriterAttemptId = null;
  shelvesetsDir;
  /**
   * Enforces single-writer lock for TFVC workspace.
   */
  acquireWriterLock(attemptId) {
    if (this.activeWriterAttemptId && this.activeWriterAttemptId !== attemptId) {
      return false;
    }
    this.activeWriterAttemptId = attemptId;
    return true;
  }
  releaseWriterLock(attemptId) {
    if (this.activeWriterAttemptId === attemptId) {
      this.activeWriterAttemptId = null;
    }
  }
  hasWriterLock(attemptId) {
    return this.activeWriterAttemptId === attemptId;
  }
  /**
   * Captures baseline manifest and scopes checkout.
   */
  async captureBaseline(filePaths = []) {
    return TicketAttemptManager.createManifest("tfvc-workspace-baseline", filePaths);
  }
  /**
   * Checks out files within ticket scope using `tf checkout` (or local RW simulation if tf CLI is absent).
   */
  async checkoutScopedFiles(filePaths) {
    const checkedOut = [];
    for (const filePath of filePaths) {
      if (fs3.existsSync(filePath)) {
        try {
          cp.execSync(`tf checkout "${filePath}"`, { cwd: this.workspaceRoot, stdio: "ignore" });
        } catch {
          try {
            fs3.chmodSync(filePath, 438);
          } catch {
          }
        }
        checkedOut.push(filePath);
      }
    }
    return { success: true, checkedOut };
  }
  /**
   * Creates a shelveset of modifications instead of direct check-in.
   */
  async createShelveset(ticketId, allocation) {
    const shelvesetName = `shelveset_${ticketId}_${Date.now()}`;
    const shelvesetFile = path3.join(this.shelvesetsDir, `${shelvesetName}.json`);
    const modifiedFiles = [];
    for (const [origPath, origHash] of Object.entries(allocation.manifest.fileHashes)) {
      const relPath = path3.relative(this.workspaceRoot, origPath);
      const allocatedPath = path3.join(allocation.workspacePath, relPath);
      if (fs3.existsSync(allocatedPath)) {
        const newContent = fs3.readFileSync(allocatedPath, "utf8");
        const newHash = TicketAttemptManager.computeHash(Buffer.from(newContent, "utf8"));
        if (newHash !== origHash) {
          const oldContent = fs3.existsSync(origPath) ? fs3.readFileSync(origPath, "utf8") : "";
          modifiedFiles.push({
            path: relPath,
            diff: `--- a/${relPath}
+++ b/${relPath}
${newContent}`
          });
        }
      }
    }
    const payload = {
      shelvesetName,
      ticketId,
      timestamp: Date.now(),
      files: modifiedFiles
    };
    fs3.writeFileSync(shelvesetFile, JSON.stringify(payload, null, 2), "utf8");
    return {
      shelvesetName,
      files: modifiedFiles.map((f) => f.path),
      outputPath: shelvesetFile
    };
  }
  /**
   * Integrates changes with single-writer validation and divergence check.
   */
  async integrate(allocation) {
    if (!this.hasWriterLock(allocation.attemptId)) {
      return {
        success: false,
        appliedFiles: [],
        errorMessage: `TFVC Lock Error: Attempt ${allocation.attemptId} does not hold the active TFVC writer lock.`
      };
    }
    const conflicts = [];
    const filesToApply = [];
    for (const [origPath, expectedHash] of Object.entries(allocation.manifest.fileHashes)) {
      const relPath = path3.relative(this.workspaceRoot, origPath);
      const allocatedPath = path3.join(allocation.workspacePath, relPath);
      if (fs3.existsSync(allocatedPath)) {
        const newContent = fs3.readFileSync(allocatedPath);
        const newHash = TicketAttemptManager.computeHash(newContent);
        if (newHash !== expectedHash) {
          if (fs3.existsSync(origPath)) {
            const currentContent = fs3.readFileSync(origPath);
            const currentHash = TicketAttemptManager.computeHash(currentContent);
            if (currentHash !== expectedHash) {
              conflicts.push(relPath);
              continue;
            }
          }
          filesToApply.push({ sourcePath: allocatedPath, destPath: origPath });
        }
      }
    }
    if (conflicts.length > 0) {
      return {
        success: false,
        appliedFiles: [],
        conflictFiles: conflicts,
        errorMessage: `TFVC baseline divergence: Files modified externally during attempt: ${conflicts.join(", ")}`
      };
    }
    const applied = [];
    for (const item of filesToApply) {
      fs3.mkdirSync(path3.dirname(item.destPath), { recursive: true });
      fs3.copyFileSync(item.sourcePath, item.destPath);
      applied.push(path3.relative(this.workspaceRoot, item.destPath));
    }
    this.releaseWriterLock(allocation.attemptId);
    return {
      success: true,
      appliedFiles: applied
    };
  }
};

// src/orchestrator/workspaces/worktreeAllocator.ts
var cp2 = __toESM(require("child_process"));
var fs4 = __toESM(require("fs"));
var path4 = __toESM(require("path"));
var MultiWorktreeAllocator = class {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
    this.worktreesDir = path4.join(this.workspaceRoot, ".agentic-kanban", "worktrees");
    if (!fs4.existsSync(this.worktreesDir)) {
      fs4.mkdirSync(this.worktreesDir, { recursive: true });
    }
  }
  worktreesDir;
  activeLeases = /* @__PURE__ */ new Map();
  /**
   * Checks if an attempt can be allocated without file scope collision.
   * Read-only attempts (e.g. Lead planning) never collide.
   * Writing attempts cannot overlap target files with any other active writing attempt.
   */
  canAllocate(params) {
    if (params.isReadOnly) {
      return { allowed: true };
    }
    const requestedSet = new Set(params.targetFiles.map((f) => path4.resolve(this.workspaceRoot, f)));
    for (const [activeId, lease] of this.activeLeases.entries()) {
      if (activeId === params.attemptId || lease.isReadOnly) {
        continue;
      }
      for (const activeFile of lease.targetFiles) {
        const resolvedActive = path4.resolve(this.workspaceRoot, activeFile);
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
  async allocateWorktree(params) {
    const check = this.canAllocate({
      attemptId: params.attemptId,
      targetFiles: params.targetFiles,
      isReadOnly: params.isReadOnly
    });
    if (!check.allowed) {
      throw new Error(check.reason);
    }
    const targetDir = path4.join(this.worktreesDir, params.attemptId);
    if (fs4.existsSync(targetDir)) {
      this.cleanupWorktree(params.attemptId);
    }
    let strategy = "snapshot";
    if (this.isGitRepo() && !params.isReadOnly) {
      try {
        cp2.execSync(`git worktree add -d "${targetDir}"`, { cwd: this.workspaceRoot, stdio: "ignore" });
        strategy = "git-worktree";
      } catch {
        strategy = "snapshot";
      }
    }
    if (strategy === "snapshot" || params.isReadOnly) {
      fs4.mkdirSync(targetDir, { recursive: true });
      for (const [filePath] of Object.entries(params.manifest.fileHashes)) {
        if (fs4.existsSync(filePath)) {
          const relPath = path4.relative(this.workspaceRoot, filePath);
          const destPath = path4.join(targetDir, relPath);
          fs4.mkdirSync(path4.dirname(destPath), { recursive: true });
          fs4.copyFileSync(filePath, destPath);
        }
      }
    }
    const lease = {
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
  cleanupWorktree(attemptId) {
    this.activeLeases.delete(attemptId);
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
  getActiveLeases() {
    return Array.from(this.activeLeases.values());
  }
  isGitRepo() {
    return fs4.existsSync(path4.join(this.workspaceRoot, ".git"));
  }
};

// src/orchestrator/workspaces/integrationPipeline.ts
var fs5 = __toESM(require("fs"));
var path5 = __toESM(require("path"));
var cp3 = __toESM(require("child_process"));
var SerializedIntegrationPipeline = class {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
  }
  queueLock = Promise.resolve();
  /**
   * Enqueues and executes patch integration sequentially.
   */
  async enqueueIntegration(item) {
    const prevLock = this.queueLock;
    let releaseLock = () => {
    };
    this.queueLock = new Promise((resolve2) => {
      releaseLock = resolve2;
    });
    try {
      await prevLock;
      return await this.executeSerializedIntegration(item);
    } finally {
      releaseLock();
    }
  }
  async executeSerializedIntegration(item) {
    const { allocation, verificationCommands = [] } = item;
    const conflicts = [];
    const filesToApply = [];
    for (const [origPath, expectedHash] of Object.entries(allocation.manifest.fileHashes)) {
      const relPath = path5.relative(this.workspaceRoot, origPath);
      const allocatedPath = path5.join(allocation.workspacePath, relPath);
      if (fs5.existsSync(allocatedPath)) {
        const allocatedContent = fs5.readFileSync(allocatedPath);
        const allocatedHash = TicketAttemptManager.computeHash(allocatedContent);
        if (allocatedHash !== expectedHash) {
          if (fs5.existsSync(origPath)) {
            const currentContent = fs5.readFileSync(origPath);
            const currentHash = TicketAttemptManager.computeHash(currentContent);
            if (currentHash !== expectedHash) {
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
        status: "conflict",
        appliedFiles: [],
        conflictFiles: conflicts,
        errorMessage: `Merge conflict: Target files diverged since baseline: ${conflicts.join(", ")}`
      };
    }
    const appliedFiles = [];
    for (const file of filesToApply) {
      fs5.mkdirSync(path5.dirname(file.destPath), { recursive: true });
      fs5.copyFileSync(file.sourcePath, file.destPath);
      appliedFiles.push(path5.relative(this.workspaceRoot, file.destPath));
    }
    for (const cmd of verificationCommands) {
      const replayResult = await this.runReplayCommand(cmd);
      if (!replayResult.passed) {
        this.rollback(filesToApply);
        return {
          status: "regression_failure",
          appliedFiles: [],
          replayedVerificationPassed: false,
          errorMessage: `Regression check failed on integrated state: '${cmd}' failed with code ${replayResult.exitCode}. Error: ${replayResult.stderr || replayResult.stdout}`
        };
      }
    }
    return {
      status: "success",
      appliedFiles,
      replayedVerificationPassed: true
    };
  }
  rollback(applied) {
    for (const item of applied) {
      if (item.originalBackup) {
        fs5.writeFileSync(item.destPath, item.originalBackup);
      } else {
        if (fs5.existsSync(item.destPath)) {
          fs5.unlinkSync(item.destPath);
        }
      }
    }
  }
  runReplayCommand(command) {
    return new Promise((resolve2) => {
      cp3.exec(command, { cwd: this.workspaceRoot, timeout: 3e4 }, (err, stdout, stderr) => {
        const exitCode = err ? typeof err.code === "number" ? err.code : 1 : 0;
        resolve2({
          passed: exitCode === 0,
          exitCode,
          stdout: stdout.toString(),
          stderr: stderr.toString()
        });
      });
    });
  }
};

// src/orchestrator/context/knowledgeStore.ts
var fs6 = __toESM(require("fs"));
var path6 = __toESM(require("path"));
var crypto2 = __toESM(require("crypto"));
var KnowledgeStore = class {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
    this.contextRootDir = path6.join(this.workspaceRoot, ".agentic-kanban", "context");
    if (!fs6.existsSync(this.contextRootDir)) {
      fs6.mkdirSync(this.contextRootDir, { recursive: true });
    }
  }
  contextRootDir;
  getBoardDir(boardId) {
    const dir = path6.join(this.contextRootDir, boardId);
    if (!fs6.existsSync(dir)) {
      fs6.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }
  /**
   * Saves a curated knowledge note along with its source file references for invalidation tracking.
   */
  saveNote(boardId, noteName, content, sourceFiles = []) {
    const boardDir = this.getBoardDir(boardId);
    const notePath = path6.join(boardDir, noteName);
    const metaPath = path6.join(boardDir, `${noteName}.meta.json`);
    fs6.writeFileSync(notePath, content, "utf8");
    const refs = sourceFiles.map((file) => {
      const absPath = path6.isAbsolute(file) ? file : path6.join(this.workspaceRoot, file);
      const rel = path6.relative(this.workspaceRoot, absPath);
      let mtime = 0;
      let sha = "";
      if (fs6.existsSync(absPath)) {
        const stat = fs6.statSync(absPath);
        mtime = stat.mtimeMs;
        const buf = fs6.readFileSync(absPath);
        sha = crypto2.createHash("sha256").update(buf).digest("hex");
      }
      return { relativePath: rel, mtimeMs: mtime, sha256: sha };
    });
    const meta = {
      noteName,
      generatedAt: Date.now(),
      sourceFiles: refs
    };
    fs6.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf8");
  }
  /**
   * Retrieves note content if cache is valid. Returns null if note does not exist or cache is invalidated.
   */
  getNote(boardId, noteName) {
    if (!this.isCacheValid(boardId, noteName)) {
      return null;
    }
    const notePath = path6.join(this.getBoardDir(boardId), noteName);
    return fs6.readFileSync(notePath, "utf8");
  }
  /**
   * Checks whether the note's cached content is still valid against source files on disk.
   */
  isCacheValid(boardId, noteName) {
    const boardDir = this.getBoardDir(boardId);
    const notePath = path6.join(boardDir, noteName);
    const metaPath = path6.join(boardDir, `${noteName}.meta.json`);
    if (!fs6.existsSync(notePath) || !fs6.existsSync(metaPath)) {
      return false;
    }
    try {
      const meta = JSON.parse(fs6.readFileSync(metaPath, "utf8"));
      for (const ref of meta.sourceFiles) {
        const absPath = path6.join(this.workspaceRoot, ref.relativePath);
        if (!fs6.existsSync(absPath)) {
          return false;
        }
        const currentStat = fs6.statSync(absPath);
        if (currentStat.mtimeMs > ref.mtimeMs) {
          if (ref.sha256) {
            const currentHash = crypto2.createHash("sha256").update(fs6.readFileSync(absPath)).digest("hex");
            if (currentHash !== ref.sha256) {
              return false;
            }
          } else {
            return false;
          }
        }
      }
      return true;
    } catch {
      return false;
    }
  }
  /**
   * Records a completed ticket outcome into the board's outcomes log.
   */
  appendTicketOutcome(boardId, outcome) {
    const boardDir = this.getBoardDir(boardId);
    const outcomesPath = path6.join(boardDir, "completed-ticket-outcomes.jsonl");
    fs6.appendFileSync(outcomesPath, JSON.stringify(outcome) + "\n", "utf8");
  }
  /**
   * Retrieves all completed ticket outcomes for a board.
   */
  getTicketOutcomes(boardId) {
    const outcomesPath = path6.join(this.getBoardDir(boardId), "completed-ticket-outcomes.jsonl");
    if (!fs6.existsSync(outcomesPath)) {
      return [];
    }
    const lines = fs6.readFileSync(outcomesPath, "utf8").split("\n").filter((l) => l.trim().length > 0);
    return lines.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
  }
};

// src/orchestrator/context/outcomeReporter.ts
var OutcomeReporter = class {
  static generateReport(params) {
    const durationSec = Math.max(1, Math.round((params.endTime - params.startTime) / 1e3));
    const totalFiles = /* @__PURE__ */ new Set();
    params.tickets.forEach((t) => t.filesModified.forEach((f) => totalFiles.add(f)));
    const lines = [
      `# Run Outcome Report \u2014 ${params.boardId}`,
      ``,
      `| Field | Value |`,
      `|---|---|`,
      `| **Run ID** | \`${params.runId}\` |`,
      `| **Board** | ${params.boardId} |`,
      `| **Completed At** | ${new Date(params.endTime).toISOString()} |`,
      `| **Duration** | ${durationSec}s |`,
      `| **Tickets Executed** | ${params.tickets.length} |`,
      `| **Total Files Modified** | ${totalFiles.size} |`,
      `| **Cash Spent** | ${params.cashCurrency} ${params.cashSpent.toFixed(2)} |`,
      `| **Subscription Units** | ${params.subscriptionUnitsSpent} |`,
      ``,
      `## Executed Tickets`,
      ``,
      `| Ticket | Title | Status | Tests | Replay | Files Modified |`,
      `|---|---|---|---|---|---|`
    ];
    for (const t of params.tickets) {
      const testsStr = t.testPassed ? "\u2713 Passed" : "\u2717 Failed";
      const replayStr = t.replayPassed !== void 0 ? t.replayPassed ? "\u2713 Passed" : "\u2717 Failed" : "N/A";
      const filesStr = t.filesModified.length > 0 ? t.filesModified.join(", ") : "*(none)*";
      lines.push(`| **${t.ticketId}** | ${t.title} | \`${t.status}\` | ${testsStr} | ${replayStr} | ${filesStr} |`);
    }
    lines.push(``);
    lines.push(`## Financial Summary`);
    lines.push(`- **Cash Expenditure**: ${params.cashCurrency} ${params.cashSpent.toFixed(2)}`);
    lines.push(`- **Subscription Allowance Spent**: ${params.subscriptionUnitsSpent} units`);
    if (params.blockers.length > 0) {
      lines.push(``);
      lines.push(`## Outstanding Blockers & Interventions`);
      for (const b of params.blockers) {
        lines.push(`- \u26A0\uFE0F ${b}`);
      }
    } else {
      lines.push(``);
      lines.push(`> [!NOTE]`);
      lines.push(`> Zero outstanding blockers or policy violations during this execution.`);
    }
    return lines.join("\n");
  }
};

// test/m5Tests.ts
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}
async function runM5Tests() {
  console.log("=== Running Milestone M5 Integration Tests ===");
  const testRoot = path7.join(__dirname, "..", "scratch", "m5-test-workspace");
  if (fs7.existsSync(testRoot)) {
    fs7.rmSync(testRoot, { recursive: true, force: true });
  }
  fs7.mkdirSync(testRoot, { recursive: true });
  console.log("\n--- Test 1: Plain Folder Workspace Provider & Divergence Guarding ---");
  const plainWs = path7.join(testRoot, "plain-ws");
  fs7.mkdirSync(plainWs, { recursive: true });
  const plainFile = path7.join(plainWs, "index.txt");
  fs7.writeFileSync(plainFile, "Initial plain content\n", "utf8");
  const plainProvider = new PlainFolderWorkspaceProvider(plainWs);
  const plainManifest = await plainProvider.captureBaseline([plainFile]);
  const plainAlloc = await plainProvider.allocateSnapshot("att-plain-01", plainManifest);
  assert(fs7.existsSync(plainAlloc.workspacePath), "Snapshot dir should exist");
  const snapFile = path7.join(plainAlloc.workspacePath, "index.txt");
  assert(fs7.existsSync(snapFile), "Target file should be copied into snapshot");
  fs7.writeFileSync(snapFile, "Modified in snapshot\n", "utf8");
  const plainIntegResult = await plainProvider.integrateSnapshot(plainAlloc);
  assert(plainIntegResult.success === true, "Plain snapshot integration should succeed when target unchanged");
  assert(fs7.readFileSync(plainFile, "utf8") === "Modified in snapshot\n", "Changes must be reflected in main workspace");
  const plainManifest2 = await plainProvider.captureBaseline([plainFile]);
  const plainAlloc2 = await plainProvider.allocateSnapshot("att-plain-02", plainManifest2);
  const snapFile2 = path7.join(plainAlloc2.workspacePath, "index.txt");
  fs7.writeFileSync(snapFile2, "Worker modification\n", "utf8");
  fs7.writeFileSync(plainFile, "External user WIP edit\n", "utf8");
  const plainConflictResult = await plainProvider.integrateSnapshot(plainAlloc2);
  assert(plainConflictResult.success === false, "Integration must abort on baseline divergence");
  assert(plainConflictResult.errorMessage?.includes("Plain folder conflict") === true, "Conflict message emitted");
  assert(fs7.readFileSync(plainFile, "utf8") === "External user WIP edit\n", "User WIP must NOT be overwritten");
  console.log("\u2713 Plain folder snapshotting, integration, and divergence protection verified.");
  console.log("\n--- Test 2: TFVC Workspace Provider, Single-Writer Lock, & Shelvesets ---");
  const tfvcWs = path7.join(testRoot, "tfvc-ws");
  fs7.mkdirSync(tfvcWs, { recursive: true });
  const tfvcFile = path7.join(tfvcWs, "Module.cs");
  fs7.writeFileSync(tfvcFile, "// Original TFVC file\n", "utf8");
  const tfvcProvider = new TfvcWorkspaceProvider(tfvcWs);
  assert(tfvcProvider.acquireWriterLock("att-tfvc-01") === true, "First writer acquires lock");
  assert(tfvcProvider.acquireWriterLock("att-tfvc-02") === false, "Second writer blocked by single-writer lock");
  const checkoutRes = await tfvcProvider.checkoutScopedFiles([tfvcFile]);
  assert(checkoutRes.success === true && checkoutRes.checkedOut.length === 1, "Scoped files checked out");
  const tfvcManifest = await tfvcProvider.captureBaseline([tfvcFile]);
  const tfvcAlloc = {
    attemptId: "att-tfvc-01",
    workspacePath: path7.join(tfvcWs, ".agentic-kanban", "worktrees", "att-tfvc-01"),
    strategy: "snapshot",
    manifest: tfvcManifest
  };
  fs7.mkdirSync(tfvcAlloc.workspacePath, { recursive: true });
  const tfvcAllocFile = path7.join(tfvcAlloc.workspacePath, "Module.cs");
  fs7.writeFileSync(tfvcAllocFile, "// Modified by AI agent\n", "utf8");
  const shelveset = await tfvcProvider.createShelveset("ORCH-TFVC-101", tfvcAlloc);
  assert(shelveset.files.includes("Module.cs"), "Shelveset records modified Module.cs");
  assert(fs7.existsSync(shelveset.outputPath), "Shelveset metadata JSON file written");
  const tfvcInteg = await tfvcProvider.integrate(tfvcAlloc);
  assert(tfvcInteg.success === true, "TFVC integration succeeds");
  assert(tfvcProvider.hasWriterLock("att-tfvc-01") === false, "Writer lock released upon completion");
  console.log("\u2713 TFVC single-writer lock, scoped checkout, shelveset generation, and integration verified.");
  console.log("\n--- Test 3: Multi-Worktree Allocator & Parallel Worker Isolation ---");
  const multiWs = path7.join(testRoot, "multi-ws");
  fs7.mkdirSync(multiWs, { recursive: true });
  const fileA = path7.join(multiWs, "featureA.ts");
  const fileB = path7.join(multiWs, "featureB.ts");
  fs7.writeFileSync(fileA, "const A = 1;\n", "utf8");
  fs7.writeFileSync(fileB, "const B = 2;\n", "utf8");
  const allocator = new MultiWorktreeAllocator(multiWs);
  const manifestA = TicketAttemptManager.createManifest("base", [fileA]);
  const manifestB = TicketAttemptManager.createManifest("base", [fileB]);
  const alloc1 = await allocator.allocateWorktree({
    attemptId: "worker-1",
    ticketId: "TICK-PAR-01",
    manifest: manifestA,
    targetFiles: ["featureA.ts"]
  });
  assert(fs7.existsSync(alloc1.workspacePath), "Worker 1 worktree created");
  const alloc2 = await allocator.allocateWorktree({
    attemptId: "worker-2",
    ticketId: "TICK-PAR-02",
    manifest: manifestB,
    targetFiles: ["featureB.ts"]
  });
  assert(fs7.existsSync(alloc2.workspacePath), "Worker 2 worktree created concurrently");
  assert(allocator.getActiveLeases().length === 2, "Two parallel worker leases active");
  const collisionCheck = allocator.canAllocate({ attemptId: "worker-3", targetFiles: ["featureA.ts"] });
  assert(collisionCheck.allowed === false, "Overlapping target file must be blocked by exclusive file lock");
  assert(collisionCheck.reason?.includes("Scope collision") === true, "Reason mentions scope collision");
  const leadCheck = allocator.canAllocate({ attemptId: "lead-planner", targetFiles: ["featureA.ts"], isReadOnly: true });
  assert(leadCheck.allowed === true, "Read-only Lead planning allowed alongside active worker");
  const leadAlloc = await allocator.allocateWorktree({
    attemptId: "lead-planner",
    ticketId: "TICK-LEAD-PLAN",
    manifest: manifestA,
    targetFiles: ["featureA.ts"],
    isReadOnly: true
  });
  assert(leadAlloc.strategy === "snapshot", "Read-only lead allocated isolated snapshot");
  allocator.cleanupWorktree("worker-1");
  allocator.cleanupWorktree("worker-2");
  allocator.cleanupWorktree("lead-planner");
  assert(allocator.getActiveLeases().length === 0, "All worktrees cleaned up");
  console.log("\u2713 Multi-worktree parallel allocation, scope collision prevention, and read-only Lead planning verified.");
  console.log("\n--- Test 4: Serialized Integration Pipeline & Regression Check Replay ---");
  const integWs = path7.join(testRoot, "integ-ws");
  fs7.mkdirSync(integWs, { recursive: true });
  const codeFile = path7.join(integWs, "calc.js");
  fs7.writeFileSync(codeFile, "function add(a, b) { return a + b; }\nmodule.exports = { add };\n", "utf8");
  const pipeline = new SerializedIntegrationPipeline(integWs);
  const integManifest = TicketAttemptManager.createManifest("base", [codeFile]);
  const integAlloc1 = {
    attemptId: "att-integ-pass",
    workspacePath: path7.join(integWs, "scratch-alloc1"),
    manifest: integManifest
  };
  fs7.mkdirSync(integAlloc1.workspacePath, { recursive: true });
  fs7.writeFileSync(path7.join(integAlloc1.workspacePath, "calc.js"), "function add(a, b) { return a + b; }\nfunction sub(a, b) { return a - b; }\nmodule.exports = { add, sub };\n", "utf8");
  const passResult = await pipeline.enqueueIntegration({
    ticketId: "TICK-INT-01",
    attemptId: "att-integ-pass",
    allocation: integAlloc1,
    verificationCommands: [`node -e "const { add, sub } = require('./calc.js'); if (add(1, 2) !== 3 || sub(5, 2) !== 3) process.exit(1);"`]
  });
  assert(passResult.status === "success", "Clean integration with passing verification must succeed");
  assert(passResult.replayedVerificationPassed === true, "Replay test passed");
  const currentContent = fs7.readFileSync(codeFile, "utf8");
  const integManifest2 = TicketAttemptManager.createManifest("base", [codeFile]);
  const integAlloc2 = {
    attemptId: "att-integ-fail",
    workspacePath: path7.join(integWs, "scratch-alloc2"),
    manifest: integManifest2
  };
  fs7.mkdirSync(integAlloc2.workspacePath, { recursive: true });
  fs7.writeFileSync(path7.join(integAlloc2.workspacePath, "calc.js"), "function add(a, b) { return a * b; }\nmodule.exports = { add };\n", "utf8");
  const failResult = await pipeline.enqueueIntegration({
    ticketId: "TICK-INT-02",
    attemptId: "att-integ-fail",
    allocation: integAlloc2,
    verificationCommands: [`node -e "const { add } = require('./calc.js'); if (add(1, 2) !== 3) process.exit(1);"`]
  });
  assert(failResult.status === "regression_failure", "Regression failure detected on combined state");
  assert(failResult.replayedVerificationPassed === false, "Replay test failed");
  assert(fs7.readFileSync(codeFile, "utf8") === currentContent, "Workspace rolled back cleanly after regression failure");
  console.log("\u2713 Serialized integration, divergence check, and automatic regression rollback verified.");
  console.log("\n--- Test 5: Explicit Knowledge Store, Revision Invalidation, & Outcome Reporting ---");
  const kStore = new KnowledgeStore(testRoot);
  const srcFile = path7.join(testRoot, "arch_source.ts");
  fs7.writeFileSync(srcFile, "// Architecture definitions v1\n", "utf8");
  kStore.saveNote("board-alpha", "architecture-decisions.md", "# Architecture Decisions\nUse modular pipelines.", [srcFile]);
  assert(kStore.isCacheValid("board-alpha", "architecture-decisions.md") === true, "Cache valid initially");
  assert(kStore.getNote("board-alpha", "architecture-decisions.md")?.includes("modular pipelines") === true, "Note content retrieved");
  assert(kStore.getNote("board-beta", "architecture-decisions.md") === null, "Board isolation: note not visible to board-beta");
  fs7.writeFileSync(srcFile, "// Architecture definitions v2 (modified!)\n", "utf8");
  assert(kStore.isCacheValid("board-alpha", "architecture-decisions.md") === false, "Cache invalidated automatically upon source modification");
  assert(kStore.getNote("board-alpha", "architecture-decisions.md") === null, "Invalidated note returns null to trigger refresh");
  kStore.appendTicketOutcome("board-alpha", {
    ticketId: "ORCH-021",
    attemptId: "att-021",
    timestamp: Date.now(),
    summary: "Implemented TFVC & plain folder workspace providers",
    filesModified: ["src/orchestrator/workspaces/tfvcWorkspace.ts"],
    testPassed: true,
    costReported: 0.5
  });
  const outcomes = kStore.getTicketOutcomes("board-alpha");
  assert(outcomes.length === 1, "One ticket outcome recorded");
  assert(outcomes[0].ticketId === "ORCH-021", "Ticket ID matches");
  const report = OutcomeReporter.generateReport({
    boardId: "board-alpha",
    runId: "run-overnight-001",
    startTime: Date.now() - 3e4,
    endTime: Date.now(),
    tickets: [
      {
        ticketId: "ORCH-021",
        title: "TFVC & Plain Folder Workspaces",
        status: "Completed",
        filesModified: ["src/orchestrator/workspaces/tfvcWorkspace.ts", "plainFolderWorkspace.ts"],
        testPassed: true,
        replayPassed: true
      },
      {
        ticketId: "ORCH-022",
        title: "Multi-Worktree Parallelism",
        status: "Completed",
        filesModified: ["src/orchestrator/workspaces/worktreeAllocator.ts"],
        testPassed: true,
        replayPassed: true
      }
    ],
    cashSpent: 1.25,
    cashCurrency: "EUR",
    subscriptionUnitsSpent: 15,
    blockers: []
  });
  assert(report.includes("# Run Outcome Report \u2014 board-alpha"), "Report title present");
  assert(report.includes("Cash Spent") && report.includes("EUR 1.25"), "Cash spent recorded");
  assert(report.includes("Subscription Allowance Spent") && report.includes("15 units"), "Subscription units recorded separately");
  assert(report.includes("Zero outstanding blockers"), "Zero blockers noted");
  console.log("\u2713 Knowledge store revision invalidation, board isolation, and outcome reporting verified.");
  console.log("\n=== All Milestone M5 Tests Passed Successfully ===");
}
runM5Tests().catch((err) => {
  console.error("Milestone M5 Test Failed:", err);
  process.exit(1);
});
//# sourceMappingURL=m5Tests.js.map
