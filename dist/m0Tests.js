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

// test/m0Tests.ts
var fs2 = __toESM(require("fs"));
var path3 = __toESM(require("path"));

// src/orchestrator/config/orchestrationConfig.ts
var OrchestrationConfigParser = class {
  /**
   * Extracts and parses the versioned fenced YAML block from config.md content.
   * Returns undefined if no orchestration YAML block is found or if it is disabled.
   */
  static extractFromMarkdown(content) {
    if (!content || !content.trim()) {
      return void 0;
    }
    const yamlBlockMatch = content.match(/```(?:yaml|yml)\s*\r?\n([\s\S]*?)\r?\n```/i);
    if (!yamlBlockMatch) {
      return void 0;
    }
    const yamlText = yamlBlockMatch[1].trim();
    if (!yamlText.includes("schemaVersion")) {
      return void 0;
    }
    return this.parseYaml(yamlText);
  }
  /**
   * Parses the YAML text into a validated OrchestrationConfig structure.
   */
  static parseYaml(yamlText) {
    const raw = this.parseSimpleYaml(yamlText);
    const schemaVersion = Number(raw.schemaVersion) || 1;
    if (schemaVersion !== 1) {
      throw new Error(`Unsupported orchestration schemaVersion: ${raw.schemaVersion}. Supported versions: 1`);
    }
    const orchestrationRaw = typeof raw.orchestration === "object" && raw.orchestration !== null ? raw.orchestration : {};
    const orchestration = {
      enabled: Boolean(orchestrationRaw.enabled === true || orchestrationRaw.enabled === "true"),
      profile: typeof orchestrationRaw.profile === "string" ? orchestrationRaw.profile : void 0,
      maxConcurrentWorkers: typeof orchestrationRaw.maxConcurrentWorkers === "number" ? orchestrationRaw.maxConcurrentWorkers : orchestrationRaw.maxConcurrentWorkers ? parseInt(String(orchestrationRaw.maxConcurrentWorkers), 10) : 1,
      completionTarget: orchestrationRaw.completionTarget === "reviewed-patch" || orchestrationRaw.completionTarget === "local-build" || orchestrationRaw.completionTarget === "pr" ? orchestrationRaw.completionTarget : "reviewed-patch",
      retryLimit: typeof orchestrationRaw.retryLimit === "number" ? orchestrationRaw.retryLimit : 1
    };
    let roles;
    if (raw.roles && typeof raw.roles === "object") {
      roles = {
        lead: typeof raw.roles.lead === "string" ? raw.roles.lead : void 0,
        worker: typeof raw.roles.worker === "string" ? raw.roles.worker : void 0,
        reviewer: typeof raw.roles.reviewer === "string" ? raw.roles.reviewer : void 0
      };
    }
    let policies;
    if (raw.policies && typeof raw.policies === "object") {
      policies = {};
      for (const [pName, pVal] of Object.entries(raw.policies)) {
        if (typeof pVal === "object" && pVal !== null) {
          const pObj = pVal;
          const allowedExecRaw = Array.isArray(pObj.allowedExecution) ? pObj.allowedExecution : typeof pObj.allowedExecution === "string" ? pObj.allowedExecution.split(",").map((s) => s.trim()) : ["local"];
          policies[pName] = {
            allowedExecution: allowedExecRaw,
            unknownDestination: pObj.unknownDestination === "allow" ? "allow" : "deny",
            allowedDataClasses: Array.isArray(pObj.allowedDataClasses) ? pObj.allowedDataClasses : void 0,
            allowedEndpoints: Array.isArray(pObj.allowedEndpoints) ? pObj.allowedEndpoints : void 0
          };
        }
      }
    }
    let budgets;
    if (raw.budgets && typeof raw.budgets === "object") {
      const bObj = raw.budgets;
      budgets = {
        dailyCurrency: typeof bObj.dailyCurrency === "string" ? bObj.dailyCurrency : "EUR",
        dailyLimit: typeof bObj.dailyLimit === "number" ? bObj.dailyLimit : parseFloat(bObj.dailyLimit) || void 0,
        reserveForReview: typeof bObj.reserveForReview === "number" ? bObj.reserveForReview : parseFloat(bObj.reserveForReview) || 1,
        batchCeiling: typeof bObj.batchCeiling === "number" ? bObj.batchCeiling : parseFloat(bObj.batchCeiling) || void 0,
        maxPerTicketSpend: typeof bObj.maxPerTicketSpend === "number" ? bObj.maxPerTicketSpend : parseFloat(bObj.maxPerTicketSpend) || void 0
      };
    }
    return {
      schemaVersion: 1,
      orchestration,
      roles,
      policies,
      budgets
    };
  }
  /**
   * Lightweight indent-based YAML parser supporting objects, scalars, inline arrays [a, b], and list items.
   */
  static parseSimpleYaml(yaml) {
    const lines = yaml.split(/\r?\n/);
    const root = {};
    const stack = [
      { indent: -1, target: root }
    ];
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const originalLine = lines[lineIndex];
      if (!originalLine.trim() || originalLine.trim().startsWith("#")) {
        continue;
      }
      const indent = originalLine.search(/\S/);
      const trimmed = originalLine.trim();
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }
      const currentContext = stack[stack.length - 1].target;
      const kvMatch = trimmed.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
      if (kvMatch) {
        const key = kvMatch[1];
        const valStr = kvMatch[2].trim();
        if (valStr === "") {
          const newObj = {};
          if (Array.isArray(currentContext)) {
            currentContext.push({ [key]: newObj });
          } else {
            currentContext[key] = newObj;
          }
          stack.push({ indent, target: newObj });
        } else {
          const parsedVal = this.parseScalarOrInlineArray(valStr);
          if (Array.isArray(currentContext)) {
            currentContext.push({ [key]: parsedVal });
          } else {
            currentContext[key] = parsedVal;
          }
        }
        continue;
      }
      const listMatch = trimmed.match(/^-\s+(.*)$/);
      if (listMatch) {
        const itemContent = listMatch[1].trim();
        const subKv = itemContent.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
        if (subKv) {
          const itemKey = subKv[1];
          const itemVal = this.parseScalarOrInlineArray(subKv[2].trim());
          const itemObj = { [itemKey]: itemVal };
          if (Array.isArray(currentContext)) {
            currentContext.push(itemObj);
          }
        } else {
          const val = this.parseScalarOrInlineArray(itemContent);
          if (Array.isArray(currentContext)) {
            currentContext.push(val);
          }
        }
      }
    }
    return root;
  }
  static parseScalarOrInlineArray(val) {
    if (!val)
      return "";
    if (val.startsWith("[") && val.endsWith("]")) {
      const inner = val.slice(1, -1).trim();
      if (!inner)
        return [];
      return inner.split(",").map((s) => this.parseScalarOrInlineArray(s.trim()));
    }
    if (val.startsWith('"') && val.endsWith('"') || val.startsWith("'") && val.endsWith("'")) {
      return val.slice(1, -1);
    }
    if (val.toLowerCase() === "true")
      return true;
    if (val.toLowerCase() === "false")
      return false;
    if (/^-?\d+(\.\d+)?$/.test(val)) {
      const num = Number(val);
      if (!isNaN(num))
        return num;
    }
    return val;
  }
};

// src/configParser.ts
var ConfigParser = class {
  static parse(content, defaultBoardName) {
    const config = {
      name: defaultBoardName,
      columnsOrder: [],
      autoUpdateStatus: true,
      defaultAgent: null,
      assignees: []
    };
    if (!content || !content.trim()) {
      return config;
    }
    const settingsMatch = content.match(/##\s+Settings\s*\r?\n([\s\S]*?)(?=\r?\n##\s+|$)/i);
    if (settingsMatch) {
      const settingsBlock = settingsMatch[1];
      const lines = settingsBlock.split(/\r?\n/);
      for (const line of lines) {
        const kvMatch = line.match(/^[-*]\s+\*{0,2}([^:*]+)\*{0,2}\s*:\s*(.+)$/);
        if (kvMatch) {
          const key = kvMatch[1].trim().toLowerCase();
          const val = kvMatch[2].trim();
          if (key.includes("board name")) {
            config.name = val;
          } else if (key.includes("columns order") || key.includes("column order")) {
            config.columnsOrder = val.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
          } else if (key.includes("auto update status")) {
            config.autoUpdateStatus = val.toLowerCase() !== "false";
          } else if (key.includes("default agent")) {
            config.defaultAgent = val;
          } else if (key.includes("prompt template") || key.includes("agent prompt")) {
            config.agentPromptTemplate = val.replace(/^["'`](.*)["'`]$/, "$1");
          }
        }
      }
    }
    const assigneesMatch = content.match(/##\s+Assignees\s*\r?\n([\s\S]*?)(?=\r?\n##\s+|$)/i);
    if (assigneesMatch) {
      const assigneesBlock = assigneesMatch[1];
      this.parseAssignees(assigneesBlock, config);
    }
    const promptMatch = content.match(/##\s+(?:Agent\s+|Task\s+)?Prompt\s+Template\s*\r?\n([\s\S]*?)(?=\r?\n##\s+|$)/i);
    if (promptMatch) {
      const templateContent = promptMatch[1].trim();
      const codeBlockMatch = templateContent.match(/^```(?:markdown|md)?\r?\n([\s\S]*?)\r?\n```$/);
      config.agentPromptTemplate = codeBlockMatch ? codeBlockMatch[1].trim() : templateContent;
    }
    try {
      config.orchestration = OrchestrationConfigParser.extractFromMarkdown(content);
    } catch (e) {
      console.warn("Could not parse orchestration block in config.md:", e);
    }
    return config;
  }
  static parseAssignees(block, config) {
    const humanMatch = block.match(/###\s+Humans\s*\r?\n([\s\S]*?)(?=\r?\n###\s+|$)/i);
    if (humanMatch) {
      this.parseUserList(humanMatch[1], "human", config);
    }
    const agentMatch = block.match(/###\s+Agents\s*\r?\n([\s\S]*?)(?=\r?\n###\s+|$)/i);
    if (agentMatch) {
      this.parseUserList(agentMatch[1], "agent", config);
    }
    if (!humanMatch && !agentMatch) {
      this.parseUserList(block, "human", config);
    }
  }
  static parseUserList(block, defaultType, config) {
    const itemSplits = block.split(/(?=^[-*]\s+\*{0,2}[A-Za-z0-9])/m);
    for (const item of itemSplits) {
      const trimmed = item.trim();
      if (!trimmed || !trimmed.startsWith("-") && !trimmed.startsWith("*"))
        continue;
      const lines = trimmed.split(/\r?\n/);
      const headerLine = lines[0];
      const nameMatch = headerLine.match(/^[-*]\s+\*{0,2}(.+?)\*{0,2}(?:\s*\(.*?\))?$/);
      if (!nameMatch)
        continue;
      const name = nameMatch[1].trim();
      let id = name.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
      let role = "";
      let type = defaultType;
      let agentType = "cli";
      let command = "";
      let workingDir;
      let prompt;
      for (let i = 1; i < lines.length; i++) {
        const subLine = lines[i].trim();
        const kv = subLine.match(/^[-*]\s*([^:]+)\s*:\s*(.+)$/);
        if (kv) {
          const k = kv[1].trim().toLowerCase();
          let v = kv[2].trim();
          if (v.startsWith("`") && v.endsWith("`") || v.startsWith('"') && v.endsWith('"')) {
            v = v.slice(1, -1);
          }
          if (k === "id") {
            id = v;
          } else if (k === "role") {
            role = v;
          } else if (k === "type" || k === "agenttype") {
            const vLower = v.toLowerCase();
            if (vLower === "human") {
              type = "human";
            } else if (vLower === "agent" || vLower === "cli" || vLower.includes("vscode")) {
              type = "agent";
              if (vLower.includes("vscode")) {
                agentType = "vscode-command";
              } else if (vLower === "cli") {
                agentType = "cli";
              }
            }
          } else if (k === "command" || k === "cmd") {
            command = v;
          } else if (k === "workingdir" || k === "cwd") {
            workingDir = v;
          } else if (k === "prompt") {
            prompt = v;
          }
        }
      }
      let agentConfig;
      if (type === "agent") {
        agentConfig = {
          type: agentType,
          command,
          workingDir,
          prompt
        };
      }
      config.assignees.push({
        id,
        name,
        role: role || void 0,
        type,
        agentConfig
      });
    }
  }
  static generateDefaultConfig(boardName) {
    return `# Board Configuration

## Settings
- **Board Name**: ${boardName}
- **Columns Order**: Backlog, Ongoing, Assistance Required, Blocked, Completed
- **Auto Update Status In File**: true

## Assignees

### Humans
- **Developer**
  - ID: dev
  - Role: Full-stack Developer
  - Type: human

### Agents
- **Claude Code**
  - ID: claude-code
  - Type: cli
  - Command: \`claude -p "Review and implement ticket {ticket_path}"\`

- **Gemini CLI**
  - ID: gemini-cli
  - Type: cli
  - Command: \`gemini --prompt "Please work on ticket {ticket_path}: {ticket_title}"\`

- **Aider**
  - ID: aider
  - Type: cli
  - Command: \`aider --message "Implement ticket requirements in {ticket_path}" {ticket_path}\`

- **IDE Chat (Antigravity / Cursor / Copilot)**
  - ID: ide-chat
  - Type: vscode-command
  - Command: \`workbench.action.chat.open\`
  - Prompt: \`Please work on ticket {ticket_title} located at: {ticket_path}\`
`;
  }
};

// src/orchestrator/adapters/capabilityProbe.ts
var cp = __toESM(require("child_process"));
var KNOWN_RUNNERS = [
  {
    id: "cline",
    name: "Cline CLI",
    command: "cline",
    versionArgs: ["--version"],
    defaultTier: "managed",
    supportsStructuredOutput: true,
    supportsResumableSessions: false,
    supportsTokenReporting: true,
    supportsCostLimits: true,
    supportsModelSelection: true,
    supportsNetworkRestrictions: false,
    supportsToolWhitelisting: true
  },
  {
    id: "copilot-cli",
    name: "GitHub Copilot CLI",
    command: "copilot",
    versionArgs: ["--version"],
    defaultTier: "assisted",
    supportsStructuredOutput: false,
    supportsResumableSessions: false,
    supportsTokenReporting: false,
    supportsCostLimits: false,
    supportsModelSelection: false,
    supportsNetworkRestrictions: false,
    supportsToolWhitelisting: false
  },
  {
    id: "devin-cli",
    name: "Devin CLI",
    command: "devin",
    versionArgs: ["--version"],
    defaultTier: "managed",
    supportsStructuredOutput: true,
    supportsResumableSessions: true,
    supportsTokenReporting: true,
    supportsCostLimits: true,
    supportsModelSelection: true,
    supportsNetworkRestrictions: false,
    supportsToolWhitelisting: true
  },
  {
    id: "claude-code",
    name: "Claude Code",
    command: "claude",
    versionArgs: ["--version"],
    defaultTier: "assisted",
    supportsStructuredOutput: false,
    supportsResumableSessions: true,
    supportsTokenReporting: false,
    supportsCostLimits: false,
    supportsModelSelection: true,
    supportsNetworkRestrictions: false,
    supportsToolWhitelisting: false
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    command: "gemini",
    versionArgs: ["--version"],
    defaultTier: "assisted",
    supportsStructuredOutput: false,
    supportsResumableSessions: false,
    supportsTokenReporting: false,
    supportsCostLimits: false,
    supportsModelSelection: true,
    supportsNetworkRestrictions: false,
    supportsToolWhitelisting: false
  },
  {
    id: "aider",
    name: "Aider",
    command: "aider",
    versionArgs: ["--version"],
    defaultTier: "assisted",
    supportsStructuredOutput: false,
    supportsResumableSessions: false,
    supportsTokenReporting: true,
    supportsCostLimits: false,
    supportsModelSelection: true,
    supportsNetworkRestrictions: false,
    supportsToolWhitelisting: false
  }
];
var CapabilityProbe = class {
  /**
   * Probes the local environment for a specific runner executable.
   */
  static async probeRunner(spec) {
    const isWindows = process.platform === "win32";
    const checkCmd = isWindows ? `where ${spec.command}` : `which ${spec.command}`;
    try {
      const detectedPath = await this.execWithTimeout(checkCmd, 2e3);
      const versionOutput = await this.execWithTimeout(`${spec.command} ${spec.versionArgs.join(" ")}`, 3e3);
      const cleanVersion = versionOutput.trim().split(/\r?\n/)[0] || void 0;
      return {
        tier: spec.defaultTier,
        installed: true,
        version: cleanVersion,
        detectedPath: detectedPath.trim().split(/\r?\n/)[0],
        supportsStructuredOutput: spec.supportsStructuredOutput,
        supportsResumableSessions: spec.supportsResumableSessions,
        supportsTokenReporting: spec.supportsTokenReporting,
        supportsCostLimits: spec.supportsCostLimits,
        supportsModelSelection: spec.supportsModelSelection,
        supportsNetworkRestrictions: spec.supportsNetworkRestrictions,
        supportsToolWhitelisting: spec.supportsToolWhitelisting,
        notes: `Detected at ${detectedPath.trim().split(/\r?\n/)[0]}`
      };
    } catch {
      return {
        tier: "assisted",
        installed: false,
        supportsStructuredOutput: false,
        supportsResumableSessions: false,
        supportsTokenReporting: false,
        supportsCostLimits: false,
        supportsModelSelection: false,
        supportsNetworkRestrictions: false,
        supportsToolWhitelisting: false,
        notes: `Executable "${spec.command}" not found in PATH.`
      };
    }
  }
  /**
   * Probes all known runners and returns a capability map.
   */
  static async probeAllRunners() {
    const results = {};
    for (const spec of KNOWN_RUNNERS) {
      results[spec.id] = await this.probeRunner(spec);
    }
    return results;
  }
  static execWithTimeout(cmd, timeoutMs) {
    return new Promise((resolve, reject) => {
      cp.exec(cmd, { timeout: timeoutMs }, (err, stdout) => {
        if (err) {
          reject(err);
        } else {
          resolve(stdout);
        }
      });
    });
  }
};

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

// src/orchestrator/models/migration.ts
var path2 = __toESM(require("path"));
var TicketMigrationUtility = class {
  /**
   * Assigns a stable ID to a ticket if it lacks one, updating the file content
   * and optionally renaming the file to include the ID.
   */
  static migrateTicketContent(content, existingId, generatedId) {
    if (existingId && existingId !== "\u2014" && existingId !== "-") {
      return { migrated: false, assignedId: existingId, content };
    }
    let updatedContent = content;
    if (updatedContent.trim().startsWith("---")) {
      const secondIndex = updatedContent.indexOf("---", 3);
      if (secondIndex !== -1) {
        const frontmatter = updatedContent.slice(3, secondIndex);
        if (!/^\s*id\s*:/im.test(frontmatter)) {
          const newFrontmatter = `
id: ${generatedId}` + frontmatter;
          updatedContent = `---${newFrontmatter}---` + updatedContent.slice(secondIndex + 3);
          return { migrated: true, assignedId: generatedId, content: updatedContent };
        }
      }
    }
    const idTableMatch = updatedContent.match(/(\|\s*\*\*ID\*\*\s*\|\s*)(.*?)(\s*\|)/i);
    if (idTableMatch) {
      const currentVal = idTableMatch[2].trim();
      if (!currentVal || currentVal === "\u2014" || currentVal === "-") {
        updatedContent = updatedContent.replace(
          /(\|\s*\*\*ID\*\*\s*\|\s*)(.*?)(\s*\|)/i,
          `$1${generatedId}$3`
        );
        return { migrated: true, assignedId: generatedId, content: updatedContent };
      }
    }
    const h1Match = updatedContent.match(/^#\s+(.+)$/m);
    if (h1Match) {
      const title = h1Match[1].trim();
      if (!/^[A-Z0-9_-]+\s*—/i.test(title) && !/^[A-Z0-9_-]+\s*:\s*/i.test(title)) {
        updatedContent = updatedContent.replace(/^#\s+(.+)$/m, `# ${generatedId} \u2014 $1`);
        return { migrated: true, assignedId: generatedId, content: updatedContent };
      }
    }
    return { migrated: false, content };
  }
  /**
   * Scans existing tickets in a board directory and discovers the next available numeric sequence for a prefix.
   */
  static getNextSequenceNumber(ticketFiles, prefix) {
    let maxSeq = 0;
    const regex = new RegExp(`^${prefix}-(\\d+)`, "i");
    for (const f of ticketFiles) {
      const base = path2.basename(f);
      const match = base.match(regex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxSeq) {
          maxSeq = num;
        }
      }
    }
    return maxSeq + 1;
  }
};

// test/m0Tests.ts
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}
async function runM0Tests() {
  console.log("=== Running Milestone M0 Tests ===");
  console.log("\nTesting ORCH-001 & ORCH-002: Config Parsing & Backward Compatibility...");
  const legacyConfigMarkdown = `# Board Configuration
## Settings
- **Board Name**: Legacy Board
- **Columns Order**: Backlog, Done
`;
  const legacyParsed = ConfigParser.parse(legacyConfigMarkdown, "Legacy Board");
  assert(legacyParsed.name === "Legacy Board", "Legacy board name should match");
  assert(legacyParsed.orchestration === void 0, "Legacy board should have undefined orchestration");
  console.log("\u2713 Legacy config backward compatibility confirmed.");
  const orchConfigMarkdown = `# Board Configuration
## Settings
- **Board Name**: Orchestrated Board
- **Columns Order**: Backlog, Ongoing, Review, Done

\`\`\`yaml
schemaVersion: 1
orchestration:
  enabled: true
  profile: work-eu
  maxConcurrentWorkers: 2
  completionTarget: reviewed-patch
  retryLimit: 2
roles:
  lead: approved-frontier
  worker: approved-economical
policies:
  work-eu:
    allowedExecution: [local, verified-eu]
    unknownDestination: deny
budgets:
  dailyCurrency: EUR
  dailyLimit: 15
  reserveForReview: 2
\`\`\`

## Assignees
### Humans
- **Bj\xF6rn**
  - ID: bjorn
  - Role: Lead
`;
  const orchParsed = ConfigParser.parse(orchConfigMarkdown, "Default Name");
  assert(orchParsed.orchestration !== void 0, "Orchestration block should be parsed");
  assert(orchParsed.orchestration?.orchestration.enabled === true, "Orchestration should be enabled");
  assert(orchParsed.orchestration?.orchestration.profile === "work-eu", "Profile should be work-eu");
  assert(orchParsed.orchestration?.orchestration.maxConcurrentWorkers === 2, "Max workers should be 2");
  assert(orchParsed.orchestration?.roles?.lead === "approved-frontier", "Lead role should match");
  assert(orchParsed.orchestration?.policies?.["work-eu"]?.unknownDestination === "deny", "Policy unknownDestination should be deny");
  assert(orchParsed.orchestration?.budgets?.dailyLimit === 15, "Daily limit should be 15");
  assert(orchParsed.assignees.length === 1 && orchParsed.assignees[0].id === "bjorn", "Assignees should parse normally");
  console.log("\u2713 Versioned orchestration config parsed correctly with assignees intact.");
  try {
    OrchestrationConfigParser.parseYaml(`schemaVersion: 99
orchestration:
  enabled: true`);
    assert(false, "Should have thrown on unsupported schema version");
  } catch (e) {
    assert(e.message.includes("Unsupported orchestration schemaVersion"), "Error should mention unsupported schema");
  }
  console.log("\u2713 Unsupported schema version properly rejected.");
  console.log("\nTesting ORCH-003: Adapter Capability Probes & Contracts...");
  const clineSpec = KNOWN_RUNNERS.find((r) => r.id === "cline");
  assert(clineSpec !== void 0, "Cline spec should be registered");
  assert(clineSpec?.defaultTier === "managed", "Cline default tier should be managed");
  assert(clineSpec?.supportsStructuredOutput === true, "Cline should support structured output");
  const copilotSpec = KNOWN_RUNNERS.find((r) => r.id === "copilot-cli");
  assert(copilotSpec?.defaultTier === "assisted", "Copilot CLI default tier should be assisted");
  const probeResults = await CapabilityProbe.probeAllRunners();
  assert(probeResults["cline"] !== void 0, "Probe results should include cline");
  assert(probeResults["copilot-cli"] !== void 0, "Probe results should include copilot-cli");
  console.log("\u2713 Capability discovery probes evaluated successfully across all runners.");
  console.log("\nTesting ORCH-004: Ticket Attempt Model, Manifest, and Migration...");
  const tempWorkspace = path3.join(__dirname, "..", "scratch", "test-orch");
  fs2.mkdirSync(tempWorkspace, { recursive: true });
  const testFilePath = path3.join(tempWorkspace, "sample.txt");
  fs2.writeFileSync(testFilePath, "Hello Orchestrator!", "utf8");
  const manifest = TicketAttemptManager.createManifest("commit-sha-12345", [testFilePath]);
  assert(manifest.baseRevision === "commit-sha-12345", "Manifest baseRevision should match");
  assert(manifest.fileHashes[testFilePath] !== void 0, "File hash should be present in manifest");
  const attempt = TicketAttemptManager.createAttempt(
    "ORCH-001",
    1,
    "cline-ollama",
    "managed",
    manifest,
    { currency: "EUR", unitsReserved: 5, unitsSpentReported: 0, unitsSpentEstimated: 0, isSubscriptionQuota: false }
  );
  assert(attempt.ticketId === "ORCH-001", "Attempt ticket ID should match");
  assert(attempt.generation === 1, "Attempt generation should match");
  assert(attempt.status === "Pending", "Attempt status should be Pending");
  TicketAttemptManager.saveAttempt(tempWorkspace, attempt);
  const loadedAttempt = TicketAttemptManager.loadAttempt(tempWorkspace, attempt.attemptId);
  assert(loadedAttempt !== null, "Saved attempt should be loadable");
  assert(loadedAttempt?.attemptId === attempt.attemptId, "Loaded attempt ID should match");
  assert(loadedAttempt?.budgetReservation.unitsReserved === 5, "Reserved budget should be preserved");
  console.log("\u2713 Attempt lifecycle, manifest hashing, and durable crash-safe store verified.");
  const unnumberedTicket = `# Add Dark Mode Toggle

| Field | Value |
|---|---|
| **Status** | Backlog |

## Description
Add dark mode.`;
  const migrationResult = TicketMigrationUtility.migrateTicketContent(unnumberedTicket, null, "EXT-042");
  assert(migrationResult.migrated === true, "Unnumbered ticket should be migrated");
  assert(migrationResult.content.includes("# EXT-042 \u2014 Add Dark Mode Toggle"), "Heading should include new ID");
  assert(migrationResult.content.includes("## Description"), "Body formatting should be intact");
  const alreadyNumberedTicket = `# EXT-001 \u2014 Existing Title

| Field | Value |
|---|---|
| **Status** | Backlog |
`;
  const noopResult = TicketMigrationUtility.migrateTicketContent(alreadyNumberedTicket, "EXT-001", "EXT-999");
  assert(noopResult.migrated === false, "Already numbered ticket should not be re-migrated");
  console.log("\u2713 Non-destructive ticket ID migration verified.");
  try {
    fs2.rmSync(tempWorkspace, { recursive: true, force: true });
  } catch {
  }
  console.log("\n=== ALL M0 TESTS PASSED SUCCESSFULLY! ===\n");
}
runM0Tests().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
//# sourceMappingURL=m0Tests.js.map
