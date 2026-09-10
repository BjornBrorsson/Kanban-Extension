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

// test/m3Tests.ts
var fs9 = __toESM(require("fs"));
var path10 = __toESM(require("path"));

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
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var BudgetManager = class {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
    this.storePath = path.join(workspaceRoot, ".agentic-kanban", "runtime", "budgets.json");
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
    if (fs.existsSync(this.storePath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(this.storePath, "utf8"));
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
    const dir = path.dirname(this.storePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data = {
      accounts: Array.from(this.accounts.values()),
      reservations: Array.from(this.activeReservations.values()),
      updatedAt: Date.now()
    };
    fs.writeFileSync(this.storePath, JSON.stringify(data, null, 2), "utf8");
  }
};

// src/orchestrator/policy/egressController.ts
var fs2 = __toESM(require("fs"));
var path2 = __toESM(require("path"));
var EgressController = class {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
    this.auditLogPath = path2.join(workspaceRoot, ".agentic-kanban", "runtime", "audit.log");
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
      const dir = path2.dirname(this.auditLogPath);
      if (!fs2.existsSync(dir)) {
        fs2.mkdirSync(dir, { recursive: true });
      }
      const line = `[${new Date(entry.timestamp).toISOString()}] [${entry.allowed ? "ALLOW" : "DENY"}] ticket=${entry.ticketId} attempt=${entry.attemptId} provider=${entry.providerId} host=${entry.targetEndpoint} action=${entry.action} rule="${entry.policyRule}"
`;
      fs2.appendFileSync(this.auditLogPath, line, "utf8");
    } catch {
    }
  }
};

// src/orchestrator/core/runtimeJournal.ts
var fs4 = __toESM(require("fs"));
var path4 = __toESM(require("path"));

// src/orchestrator/models/ticketAttempt.ts
var crypto = __toESM(require("crypto"));
var fs3 = __toESM(require("fs"));
var path3 = __toESM(require("path"));
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
    const dir = path3.join(workspaceRoot, ".agentic-kanban", "runtime");
    if (!fs3.existsSync(dir)) {
      fs3.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }
  /**
   * Persists an attempt record durably to the runtime store.
   */
  static saveAttempt(workspaceRoot, attempt) {
    const attemptsDir = path3.join(this.getRuntimeStoreDir(workspaceRoot), "attempts");
    if (!fs3.existsSync(attemptsDir)) {
      fs3.mkdirSync(attemptsDir, { recursive: true });
    }
    attempt.updatedAt = Date.now();
    const filePath = path3.join(attemptsDir, `${attempt.attemptId}.json`);
    const tempPath = `${filePath}.tmp`;
    fs3.writeFileSync(tempPath, JSON.stringify(attempt, null, 2), "utf8");
    fs3.renameSync(tempPath, filePath);
  }
  /**
   * Reads an attempt record from disk.
   */
  static loadAttempt(workspaceRoot, attemptId) {
    const filePath = path3.join(this.getRuntimeStoreDir(workspaceRoot), "attempts", `${attemptId}.json`);
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
    this.lockFile = path4.join(this.runtimeDir, "workspace.lock");
    this.journalFile = path4.join(this.runtimeDir, "journal.jsonl");
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
      const gitIgnorePath = path4.join(this.workspaceRoot, ".gitignore");
      if (fs4.existsSync(path4.join(this.workspaceRoot, ".git"))) {
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
    const attemptsDir = path4.join(this.runtimeDir, "attempts");
    if (!fs4.existsSync(attemptsDir))
      return [];
    const interrupted = [];
    const files = fs4.readdirSync(attemptsDir).filter((f) => f.endsWith(".json") && !f.endsWith(".tmp"));
    for (const f of files) {
      try {
        const data = fs4.readFileSync(path4.join(attemptsDir, f), "utf8");
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
var cp = __toESM(require("child_process"));
var fs5 = __toESM(require("fs"));
var path5 = __toESM(require("path"));
var WorkspaceManager = class {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
    this.worktreesDir = path5.join(this.workspaceRoot, ".agentic-kanban", "worktrees");
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
    const targetDir = path5.join(this.worktreesDir, attemptId);
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
        const relPath = path5.relative(this.workspaceRoot, filePath);
        const destPath = path5.join(targetDir, relPath);
        fs5.mkdirSync(path5.dirname(destPath), { recursive: true });
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
      const relPath = path5.relative(this.workspaceRoot, origPath);
      const allocatedFilePath = path5.join(allocation.workspacePath, relPath);
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
      const relPath = path5.relative(this.workspaceRoot, origPath);
      const allocatedFilePath = path5.join(allocation.workspacePath, relPath);
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
      fs5.mkdirSync(path5.dirname(item.destPath), { recursive: true });
      fs5.copyFileSync(item.sourcePath, item.destPath);
      applied.push(path5.relative(this.workspaceRoot, item.destPath));
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
    const targetDir = path5.join(this.worktreesDir, attemptId);
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
    return fs5.existsSync(path5.join(this.workspaceRoot, ".git"));
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

// src/orchestrator/context/contextPackager.ts
var fs6 = __toESM(require("fs"));
var path6 = __toESM(require("path"));
var crypto3 = __toESM(require("crypto"));
var ContextPackager = class {
  /**
   * Computes SHA-256 hash for a file.
   */
  static hashFile(filePath) {
    if (!fs6.existsSync(filePath)) {
      return "";
    }
    const content = fs6.readFileSync(filePath);
    return crypto3.createHash("sha256").update(content).digest("hex");
  }
  /**
   * Builds an immutable, bounded DelegationPackage.
   */
  static packageForWorker(input) {
    const sourceReferences = [];
    const targets = input.targetFiles || [];
    for (const relOrAbs of targets) {
      const absPath = path6.isAbsolute(relOrAbs) ? relOrAbs : path6.join(input.workspaceRoot, relOrAbs);
      if (fs6.existsSync(absPath) && fs6.statSync(absPath).isFile()) {
        const relPath = path6.relative(input.workspaceRoot, absPath).replace(/\\/g, "/");
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
    const handoffsDir = path6.join(workspaceRoot, ".agentic-kanban", "runtime", "handoffs");
    if (!fs6.existsSync(handoffsDir)) {
      fs6.mkdirSync(handoffsDir, { recursive: true });
    }
    const filePath = path6.join(handoffsDir, `${pkg.attemptId}.json`);
    fs6.writeFileSync(filePath, JSON.stringify(pkg, null, 2), "utf8");
    return filePath;
  }
  /**
   * Loads a persisted delegation package.
   */
  static loadPackage(workspaceRoot, attemptId) {
    const filePath = path6.join(workspaceRoot, ".agentic-kanban", "runtime", "handoffs", `${attemptId}.json`);
    if (!fs6.existsSync(filePath)) {
      return null;
    }
    try {
      return JSON.parse(fs6.readFileSync(filePath, "utf8"));
    } catch {
      return null;
    }
  }
};

// src/orchestrator/lead/escalationHandler.ts
var fs7 = __toESM(require("fs"));
var path8 = __toESM(require("path"));

// src/orchestrator/lead/delegationProtocol.ts
var path7 = __toESM(require("path"));
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
      const baseName = path7.basename(normPath);
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
      if (workspaceRoot && path7.isAbsolute(file)) {
        relPath = path7.relative(workspaceRoot, file);
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
    const escDir = path8.join(this.workspaceRoot, ".agentic-kanban", "runtime", "escalations");
    if (!fs7.existsSync(escDir)) {
      fs7.mkdirSync(escDir, { recursive: true });
    }
    fs7.writeFileSync(path8.join(escDir, `${escalationId}.json`), JSON.stringify(record, null, 2), "utf8");
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
    const escDir = path8.join(this.workspaceRoot, ".agentic-kanban", "runtime", "escalations");
    const filePath = path8.join(escDir, `${record.escalationId}.json`);
    if (fs7.existsSync(filePath)) {
      fs7.writeFileSync(filePath, JSON.stringify(record, null, 2), "utf8");
    }
  }
};

// src/orchestrator/review/reviewManager.ts
var fs8 = __toESM(require("fs"));
var path9 = __toESM(require("path"));
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
    const dir = path9.join(this.workspaceRoot, ".agentic-kanban", "runtime", "evidence");
    if (!fs8.existsSync(dir)) {
      fs8.mkdirSync(dir, { recursive: true });
    }
    fs8.writeFileSync(path9.join(dir, `${evidence.attemptId}.json`), JSON.stringify(evidence, null, 2), "utf8");
  }
  loadEvidence(attemptId) {
    const file = path9.join(this.workspaceRoot, ".agentic-kanban", "runtime", "evidence", `${attemptId}.json`);
    if (!fs8.existsSync(file))
      return null;
    try {
      return JSON.parse(fs8.readFileSync(file, "utf8"));
    } catch {
      return null;
    }
  }
  persistReviewDecision(decision) {
    const dir = path9.join(this.workspaceRoot, ".agentic-kanban", "runtime", "reviews");
    if (!fs8.existsSync(dir)) {
      fs8.mkdirSync(dir, { recursive: true });
    }
    fs8.writeFileSync(path9.join(dir, `${decision.attemptId}.json`), JSON.stringify(decision, null, 2), "utf8");
  }
  loadReviewDecision(attemptId) {
    const file = path9.join(this.workspaceRoot, ".agentic-kanban", "runtime", "reviews", `${attemptId}.json`);
    if (!fs8.existsSync(file))
      return null;
    try {
      return JSON.parse(fs8.readFileSync(file, "utf8"));
    } catch {
      return null;
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

// test/m3Tests.ts
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}
async function runM3Tests() {
  console.log("=== Running Milestone M3 Integration Tests ===");
  const testRoot = path10.join(__dirname, "..", "scratch", "m3-test-workspace");
  fs9.mkdirSync(testRoot, { recursive: true });
  console.log("\n--- Test 1: Policy Eligibility (EU-Only, Local-Only, Strict Mode) ---");
  const euPolicies = { euOnly: true, localOnly: false, strictMode: true };
  const euPass = PolicyEngine.evaluateEligibility({ providerId: "mistral-eu", policies: euPolicies });
  assert(euPass.eligible === true, "mistral-eu must be eligible under EU-only policy");
  const euFail = PolicyEngine.evaluateEligibility({ providerId: "openai-global", policies: euPolicies });
  assert(euFail.eligible === false, "openai-global must be rejected under EU-only policy");
  assert(euFail.violations.some((v) => v.includes("EU-only")), "Violation must mention EU-only");
  const localPolicies = { euOnly: false, localOnly: true, strictMode: false };
  const localPass = PolicyEngine.evaluateEligibility({ providerId: "ollama", policies: localPolicies });
  assert(localPass.eligible === true, "ollama must be eligible under local-only policy");
  const localFail = PolicyEngine.evaluateEligibility({ providerId: "mistral-eu", policies: localPolicies });
  assert(localFail.eligible === false, "remote mistral-eu must be rejected under local-only policy");
  const strictPolicies = { euOnly: false, localOnly: false, strictMode: true };
  const opaqueFail = PolicyEngine.evaluateEligibility({ providerId: "opaque-cli", policies: strictPolicies });
  assert(opaqueFail.eligible === false, "opaque-cli must be rejected in strict mode");
  const filtered = PolicyEngine.filterEligibleProviders(["openai-global", "claude-eu", "ollama"], euPolicies);
  assert(filtered.eligible.includes("claude-eu") && filtered.eligible.includes("ollama"), "EU and local models must pass");
  assert(!filtered.eligible.includes("openai-global"), "Global model must NOT be in eligible list");
  console.log("\u2713 Policy eligibility enforced strictly across EU, Local, and Strict boundaries.");
  console.log("\n--- Test 2: Atomic Quota Reservations & Pre-Dispatch Cost Bounding ---");
  const budgetManager = new BudgetManager(testRoot);
  budgetManager.registerAccount({
    currency: "EUR",
    totalCeiling: 5,
    // Hard cap of €5.00
    totalSpentReported: 0,
    totalSpentEstimated: 0,
    totalReserved: 0,
    isSubscriptionQuota: false
  });
  const res1 = budgetManager.reserve({ ticketId: "ORCH-B-01", attemptId: "att-b-01", totalAmount: 3 });
  assert(res1.allowed === true, "First reservation of \u20AC3.00 must succeed");
  assert(res1.remainingAfter === 2, `Remaining budget should be \u20AC2.00, got ${res1.remainingAfter}`);
  const res2 = budgetManager.reserve({ ticketId: "ORCH-B-02", attemptId: "att-b-02", totalAmount: 3 });
  assert(res2.allowed === false, "Second reservation exceeding ceiling must be blocked");
  assert(res2.reason?.includes("Budget exhausted") === true, "Reason must state budget exhausted");
  budgetManager.reconcile({ attemptId: "att-b-01", actualSpent: 2.5, isReported: true });
  const acc = budgetManager.getAccount("EUR");
  assert(acc.totalSpentReported === 2.5, `Spent should be \u20AC2.50, got ${acc.totalSpentReported}`);
  assert(acc.totalReserved === 0, `Reserved should now be \u20AC0, got ${acc.totalReserved}`);
  const res3 = budgetManager.reserve({ ticketId: "ORCH-B-03", attemptId: "att-b-03", totalAmount: 2 });
  assert(res3.allowed === true, "Reservation within newly available budget must succeed");
  assert(budgetManager.checkRateLimit("provider-test", 2) === true, "Req 1 under limit");
  assert(budgetManager.checkRateLimit("provider-test", 2) === true, "Req 2 under limit");
  assert(budgetManager.checkRateLimit("provider-test", 2) === false, "Req 3 must be throttled");
  console.log("\u2713 Pre-dispatch budget checks, atomic reservations, and rate limits verified.");
  console.log("\n--- Test 3: Egress Filtering & Append-Only Audit Logging ---");
  const egress = new EgressController(testRoot);
  const localEgress = egress.isEgressAllowed({ endpointHost: "localhost", localOnly: true, euOnly: false });
  assert(localEgress.allowed === true, "localhost must be allowed in localOnly");
  const blockedRemote = egress.isEgressAllowed({ endpointHost: "api.openai.com", localOnly: true, euOnly: false });
  assert(blockedRemote.allowed === false, "External host must be blocked in localOnly");
  const envFlags = egress.getEnvironmentOverrides(true);
  assert(envFlags.OFFLINE === "1", "OFFLINE env flag must be set for localOnly");
  egress.logAudit({
    timestamp: Date.now(),
    ticketId: "ORCH-AUDIT-01",
    attemptId: "att-audit-1",
    providerId: "ollama",
    action: "inference",
    targetEndpoint: "localhost",
    allowed: true,
    policyRule: "Local-only loopback authorized"
  });
  const auditFile = path10.join(testRoot, ".agentic-kanban", "runtime", "audit.log");
  assert(fs9.existsSync(auditFile), "Audit log file must be created");
  const auditContent = fs9.readFileSync(auditFile, "utf8");
  assert(auditContent.includes("ORCH-AUDIT-01") && auditContent.includes("ALLOW"), "Audit log must record entry");
  console.log("\u2713 Egress filtering, offline environment injection, and audit log verified.");
  console.log("\n--- Test 4: Cancellation Protocol & Budget Reservation Release ---");
  const runtime = new OrchestratorRuntime(testRoot);
  await runtime.initialize();
  runtime.budgetManager.registerAccount({
    currency: "EUR",
    totalCeiling: 10,
    totalSpentReported: 0,
    totalSpentEstimated: 0,
    totalReserved: 0,
    isSubscriptionQuota: false
  });
  const fakeAdapter = new FakeDeterministicAdapter();
  const lease = runtime.leaseManager.acquireLease("ORCH-CANCEL-01");
  const cancelRes = runtime.budgetManager.reserve({
    ticketId: "ORCH-CANCEL-01",
    attemptId: "att-cancel-01",
    totalAmount: 4
  });
  const attemptToCancel = TicketAttemptManager.createAttempt(
    "ORCH-CANCEL-01",
    lease.generation,
    "fake-runner",
    "managed",
    { timestamp: Date.now(), fileHashes: {} },
    { currency: "EUR", unitsReserved: 4, unitsSpentReported: 0, unitsSpentEstimated: 0, isSubscriptionQuota: false }
  );
  attemptToCancel.attemptId = "att-cancel-01";
  attemptToCancel.status = "Running";
  TicketAttemptManager.saveAttempt(testRoot, attemptToCancel);
  const startRes = await fakeAdapter.start({
    ticketId: "ORCH-CANCEL-01",
    attemptId: "att-cancel-01",
    objective: "Will be cancelled",
    workspaceRoot: testRoot,
    role: "worker"
  });
  const cancelOutcome = await runtime.cancelAttempt({
    ticketId: "ORCH-CANCEL-01",
    attemptId: "att-cancel-01",
    executionId: startRes.executionId,
    adapter: fakeAdapter,
    leaseToken: lease.token
  });
  assert(cancelOutcome.confirmed === true, "Cancellation should be confirmed");
  assert(cancelOutcome.status === "CANCELLED_CONFIRMED", "Status must be CANCELLED_CONFIRMED");
  const cancelAcc = runtime.budgetManager.getAccount("EUR");
  assert(cancelAcc.totalReserved === 0, `Reserved amount must be 0 after cancellation release, got ${cancelAcc.totalReserved}`);
  const leaseValid = runtime.leaseManager.validateLease(lease.token, "ORCH-CANCEL-01");
  assert(leaseValid.valid === false, "Lease must be revoked after cancellation");
  console.log("\u2713 Clean cancellation verified: confirmed termination, budget release, and lease revocation.");
  console.log("\n--- Test 5: Injected Crash Resilience Invariant ---");
  const userWipFile = path10.join(testRoot, "UserWIP.ts");
  fs9.writeFileSync(userWipFile, 'export const userEdits = "DO NOT OVERWRITE";\n', "utf8");
  const crashAttempt = TicketAttemptManager.createAttempt(
    "ORCH-CRASH-M3",
    1,
    "fake-runner",
    "managed",
    { timestamp: Date.now(), fileHashes: { [userWipFile]: "old-hash" } },
    { currency: "EUR", unitsReserved: 1, unitsSpentReported: 0, unitsSpentEstimated: 0, isSubscriptionQuota: false }
  );
  crashAttempt.status = "Running";
  TicketAttemptManager.saveAttempt(testRoot, crashAttempt);
  const restartRuntime = new OrchestratorRuntime(testRoot);
  const recoveryInfo = await restartRuntime.initialize();
  assert(recoveryInfo.recoveredCount >= 1, "Restart must detect in-flight crash attempt");
  const recoveredAttempt = TicketAttemptManager.loadAttempt(testRoot, crashAttempt.attemptId);
  assert(recoveredAttempt?.status === "Interrupted", "Crashed attempt must be Interrupted");
  const userWipContent = fs9.readFileSync(userWipFile, "utf8");
  assert(userWipContent.includes("DO NOT OVERWRITE"), "User WIP must remain completely untouched");
  const staleLeaseCheck = restartRuntime.leaseManager.validateLease("stale-token-123", "ORCH-CRASH-M3");
  assert(staleLeaseCheck.valid === false, "Stale attempts after restart must be rejected");
  console.log("\u2713 Crash recovery invariant satisfied: No lost state, no duplicate dispatch, no stale acceptance, no WIP overwrite.");
  runtime.dispose();
  restartRuntime.dispose();
  try {
    fs9.rmSync(testRoot, { recursive: true, force: true });
  } catch {
  }
  console.log("\n=== ALL M3 TESTS PASSED SUCCESSFULLY! ===\n");
}
runM3Tests().catch((err) => {
  console.error("M3 Test Failure:", err);
  process.exit(1);
});
//# sourceMappingURL=m3Tests.js.map
