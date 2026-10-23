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

// test/fleetTests.ts
var fs3 = __toESM(require("fs"));
var os = __toESM(require("os"));
var path6 = __toESM(require("path"));

// src/pathUtils.ts
var path = __toESM(require("path"));
var CASE_INSENSITIVE = process.platform === "win32" || process.platform === "darwin";
function norm(p) {
  const resolved = path.resolve(p);
  return CASE_INSENSITIVE ? resolved.toLowerCase() : resolved;
}
function isInside(root, candidate) {
  if (!root || !candidate)
    return false;
  const r = norm(root);
  const c = norm(candidate);
  if (c === r)
    return true;
  const prefix = r.endsWith(path.sep) ? r : r + path.sep;
  return c.startsWith(prefix);
}
function safeJoin(root, ...segments) {
  let current = path.resolve(root);
  for (const seg of segments) {
    if (seg === null || seg === void 0 || seg === "")
      continue;
    if (path.isAbsolute(seg) || /^[a-zA-Z]:/.test(seg))
      return null;
    current = path.resolve(current, seg);
  }
  return isInside(root, current) ? current : null;
}
function slugify(title, maxLen = 40) {
  const slug = title.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, maxLen).replace(/-$/, "");
  return slug || "untitled";
}

// src/shellEscape.ts
function detectShellKind(shellPath, platform = process.platform) {
  const name = (shellPath || "").split(/[\\/]/).pop()?.toLowerCase() || "";
  if (name.includes("pwsh") || name.includes("powershell"))
    return "powershell";
  if (name === "cmd.exe" || name === "cmd")
    return "cmd";
  if (name)
    return "posix";
  return platform === "win32" ? "powershell" : "posix";
}
function escapeForDoubleQuotes(value, shell) {
  const flat = String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/[\u0000-\u001f\u007f]/g, "");
  switch (shell) {
    case "powershell":
      return flat.replace(/[`$"“”„]/g, (ch) => "`" + ch);
    case "cmd":
      return flat.replace(/"/g, '""').replace(/%/g, "%%");
    default:
      return flat.replace(/[\\"$`!]/g, (ch) => "\\" + ch);
  }
}

// src/agentRunner.ts
var path2 = __toESM(require("path"));
var fs = __toESM(require("fs"));

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
    let modelTiers;
    if (Array.isArray(raw.modelTiers)) {
      modelTiers = raw.modelTiers.map((m) => ({
        id: String(m.id || ""),
        name: String(m.name || m.id || ""),
        model: String(m.model || ""),
        provider: m.provider || "ollama",
        costTier: m.costTier || "low",
        maxInputTokens: m.maxInputTokens ? Number(m.maxInputTokens) : void 0,
        maxOutputTokens: m.maxOutputTokens ? Number(m.maxOutputTokens) : void 0,
        temperature: m.temperature !== void 0 ? Number(m.temperature) : void 0,
        recommendedFor: Array.isArray(m.recommendedFor) ? m.recommendedFor : void 0
      }));
    }
    let subtaskRouting;
    if (raw.subtaskRouting && typeof raw.subtaskRouting === "object") {
      const srObj = raw.subtaskRouting;
      subtaskRouting = {
        defaultTier: String(srObj.defaultTier || "standard-coder"),
        categoryRoutes: srObj.categoryRoutes && typeof srObj.categoryRoutes === "object" ? srObj.categoryRoutes : void 0,
        fallbackTier: srObj.fallbackTier ? String(srObj.fallbackTier) : void 0
      };
    }
    return {
      schemaVersion: 1,
      orchestration,
      roles,
      policies,
      budgets,
      modelTiers,
      subtaskRouting
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
        let listContext = currentContext;
        if (!Array.isArray(listContext) && typeof listContext === "object" && Object.keys(listContext).length === 0) {
          const parent = stack.length > 1 ? stack[stack.length - 2].target : null;
          if (parent && typeof parent === "object" && !Array.isArray(parent)) {
            const parentRecord = parent;
            for (const pk of Object.keys(parentRecord)) {
              if (parentRecord[pk] === listContext) {
                const arr = [];
                parentRecord[pk] = arr;
                stack[stack.length - 1].target = arr;
                listContext = arr;
                break;
              }
            }
          }
        }
        const itemContent = listMatch[1].trim();
        const subKv = itemContent.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
        if (subKv) {
          const itemKey = subKv[1];
          const itemVal = this.parseScalarOrInlineArray(subKv[2].trim());
          const itemObj = { [itemKey]: itemVal };
          if (Array.isArray(listContext)) {
            listContext.push(itemObj);
            stack.push({ indent, target: itemObj });
          }
        } else {
          const val = this.parseScalarOrInlineArray(itemContent);
          if (Array.isArray(listContext)) {
            listContext.push(val);
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
          } else if (key.includes("antigravity path") || key.includes("agy path") || key.includes("antigravity executable") || key.includes("agy executable")) {
            config.antigravityPath = val.replace(/^["'`](.*)["'`]$/, "$1");
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
      let agentPath;
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
          } else if (k === "path" || k === "executable" || k === "bin" || k === "agentpath" || k === "exec") {
            agentPath = v;
          }
        }
      }
      let agentConfig;
      if (type === "agent") {
        agentConfig = {
          type: agentType,
          command,
          workingDir,
          prompt,
          path: agentPath,
          executable: agentPath
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
- **Antigravity CLI**
  - ID: antigravity-cli
  - Type: cli
  - Command: \`& "{agy_path}" -p "Review requirements and implement ticket {ticket_path}: {ticket_title}" --dangerously-skip-permissions\`

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

// src/agentRunner.ts
var DEFAULT_TASK = "Review requirements and implement ticket {ticket_path}: {ticket_title}";
var MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:\/@+-]*$/;
function getVsCode() {
  try {
    return require("vscode");
  } catch {
    return void 0;
  }
}
var AgentRunner = class {
  /**
   * Resolves the executable path for the Antigravity CLI (agy).
   * Resolution priority:
   * 1. Explicitly configured path on assignee agentConfig
   * 2. BoardConfig.antigravityPath (from Settings)
   * 3. VS Code configuration 'agenticKanban.antigravityPath'
   * 4. Environment variables AGY_PATH or ANTIGRAVITY_PATH
   * 5. Standard installation paths on Windows/POSIX
   * 6. Fallback to 'agy.exe' (Windows) or 'agy' (POSIX)
   */
  static resolveAntigravityPath(configuredPath, boardConfig) {
    if (configuredPath && configuredPath.trim()) {
      return configuredPath.trim();
    }
    if (boardConfig?.antigravityPath && boardConfig.antigravityPath.trim()) {
      return boardConfig.antigravityPath.trim();
    }
    try {
      const vscode = getVsCode();
      const vscodeConfig = vscode?.workspace?.getConfiguration?.("agenticKanban")?.get("antigravityPath");
      if (vscodeConfig && vscodeConfig.trim()) {
        return vscodeConfig.trim();
      }
    } catch {
    }
    if (process.env.AGY_PATH && process.env.AGY_PATH.trim()) {
      return process.env.AGY_PATH.trim();
    }
    if (process.env.ANTIGRAVITY_PATH && process.env.ANTIGRAVITY_PATH.trim()) {
      return process.env.ANTIGRAVITY_PATH.trim();
    }
    const candidates = [];
    if (process.platform === "win32") {
      const localAppData = process.env.LOCALAPPDATA;
      if (localAppData) {
        candidates.push(path2.join(localAppData, "agy", "bin", "agy.exe"));
      }
      const userProfile = process.env.USERPROFILE;
      if (userProfile) {
        candidates.push(path2.join(userProfile, "AppData", "Local", "agy", "bin", "agy.exe"));
      }
      const programFiles = process.env.ProgramFiles;
      if (programFiles) {
        candidates.push(path2.join(programFiles, "agy", "bin", "agy.exe"));
      }
    } else {
      const home = process.env.HOME;
      if (home) {
        candidates.push(path2.join(home, ".agy", "bin", "agy"));
        candidates.push(path2.join(home, ".local", "bin", "agy"));
      }
      candidates.push("/usr/local/bin/agy");
      candidates.push("/usr/bin/agy");
    }
    for (const candidate of candidates) {
      if (candidate && fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return process.platform === "win32" ? "agy.exe" : "agy";
  }
  /**
   * Formats the CLI command string for an agent, performing template substitution,
   * path resolution, and legacy syntax upgrade.
   */
  static formatCliCommand(ticket, assignee, boardRoot, boardConfig, rawTicketContent, options = {}) {
    const config = assignee.agentConfig;
    if (!config)
      return "";
    const vscode = getVsCode();
    const shell = options.shell || detectShellKind(vscode?.env?.shell);
    const esc = (v) => escapeForDoubleQuotes(v, shell);
    const workspaceFolder = vscode?.workspace?.workspaceFolders?.[0]?.uri.fsPath || path2.dirname(boardRoot);
    const content = rawTicketContent ?? ticket.summary ?? ticket.title;
    let effectiveBoardConfig = boardConfig;
    if (!effectiveBoardConfig) {
      const configPath = path2.join(boardRoot, "config.md");
      if (fs.existsSync(configPath)) {
        try {
          const cfgText = fs.readFileSync(configPath, "utf8");
          effectiveBoardConfig = ConfigParser.parse(cfgText, "board");
        } catch {
        }
      }
    }
    const agyPath = this.resolveAntigravityPath(config.path || config.executable, effectiveBoardConfig);
    const model = options.model && MODEL_ID_PATTERN.test(options.model) ? options.model : "";
    const modelArgs = model && options.modelFlag ? `${options.modelFlag} ${model}` : "";
    const rawTask = (options.task || DEFAULT_TASK).replace(/\{ticket_path\}/g, () => ticket.path).replace(/\{ticket_title\}/g, () => ticket.title).replace(/\{ticket_id\}/g, () => ticket.id);
    const replacements = {
      "{task}": esc(rawTask),
      "{ticket_path}": esc(ticket.path),
      "{ticket_rel_path}": esc(ticket.relativePath),
      "{ticket_name}": esc(ticket.filename),
      "{ticket_id}": esc(ticket.id),
      "{ticket_title}": esc(ticket.title),
      "{ticket_summary}": esc(ticket.summary),
      "{ticket_content}": esc(content.slice(0, 1500)),
      "{workspace_root}": esc(workspaceFolder),
      "{board_root}": esc(boardRoot),
      "{column}": esc(ticket.column),
      "{model}": model,
      "{model_args}": modelArgs,
      "{agy_path}": agyPath,
      "{antigravity_path}": agyPath,
      "{executable}": config.path || config.executable || agyPath,
      "{agent_path}": config.path || config.executable || agyPath
    };
    const isAntigravity = assignee.id === "antigravity-cli" || assignee.id === "agy" || assignee.name.toLowerCase().includes("antigravity");
    let command = config.command || "";
    if (isAntigravity) {
      if (!command || !command.trim()) {
        command = `& "{agy_path}" -p "Review requirements and implement ticket {ticket_path}: {ticket_title}" --dangerously-skip-permissions`;
      } else if (/^agy\s+chat\b/i.test(command)) {
        command = command.replace(/^agy\s+chat\b/i, `& "{agy_path}" -p`);
        if (!command.includes("--dangerously-skip-permissions")) {
          command += " --dangerously-skip-permissions";
        }
      } else if (/^agy\b/i.test(command) && !command.startsWith("&")) {
        command = command.replace(/^agy\b/i, `& "{agy_path}"`);
      }
    }
    if (modelArgs && !command.includes("{model_args}") && !command.includes("{model}")) {
      command = `${command.trimEnd()} ${modelArgs}`;
    }
    command = command.replace(/\{[a-z_]+\}/g, (m) => m in replacements ? replacements[m] : m);
    command = command.replace(/ {2,}/g, " ").trim();
    if (process.platform === "win32") {
      const trimmed = command.trim();
      if (trimmed.startsWith('"') && !trimmed.startsWith("&")) {
        command = "& " + trimmed;
      }
    }
    return command;
  }
  /** Resolves everything needed to start an agent for a ticket (command text, cwd, prompt) without starting it. */
  static async prepareLaunch(ticket, assignee, boardRoot, boardConfig, options = {}) {
    const vscode = getVsCode();
    if (assignee.type !== "agent" || !assignee.agentConfig) {
      vscode?.window.showWarningMessage(`Assignee "${assignee.name}" is not configured as an executable agent.`);
      return null;
    }
    const config = assignee.agentConfig;
    const workspaceFolder = vscode?.workspace?.workspaceFolders?.[0]?.uri.fsPath || path2.dirname(boardRoot);
    let ticketContent = "";
    try {
      ticketContent = await fs.promises.readFile(ticket.path, "utf8");
    } catch {
      ticketContent = ticket.summary || ticket.title;
    }
    if (config.type === "cli") {
      const command = this.formatCliCommand(ticket, assignee, boardRoot, boardConfig, ticketContent, options);
      const cwd = config.workingDir ? config.workingDir.replace("{workspace_root}", workspaceFolder).replace("{board_root}", boardRoot) : workspaceFolder;
      return { kind: "cli", ticket, assignee, command, cwd, model: options.model };
    }
    if (config.type === "vscode-command") {
      const replacements = {
        "{ticket_path}": ticket.path,
        "{ticket_rel_path}": ticket.relativePath,
        "{ticket_name}": ticket.filename,
        "{ticket_id}": ticket.id,
        "{ticket_title}": ticket.title,
        "{ticket_summary}": ticket.summary,
        "{ticket_content}": ticketContent.slice(0, 1500),
        "{workspace_root}": workspaceFolder,
        "{board_root}": boardRoot,
        "{column}": ticket.column,
        "{model}": options.model || ""
      };
      let prompt = config.prompt || `Please review and work on ticket "${ticket.title}" at: ${ticket.path}

Summary:
${ticket.summary}`;
      for (const [placeholder, value] of Object.entries(replacements)) {
        prompt = prompt.split(placeholder).join(value);
      }
      return { kind: "vscode-command", ticket, assignee, command: config.command, cwd: workspaceFolder, prompt, model: options.model };
    }
    return null;
  }
  /** Optional hook (set by the fleet controller) that tracks each launch as a session. */
  static launcher;
  static async dispatch(ticket, assignee, boardRoot, boardConfig, options = {}) {
    const req = await this.prepareLaunch(ticket, assignee, boardRoot, boardConfig, options);
    if (!req)
      return false;
    return this.launcher ? this.launcher(req) : this.launchDefault(req);
  }
  /** Fallback launcher: a fresh terminal per dispatch (never type a new command into a still-running agent). */
  static async launchDefault(req) {
    const vscode = getVsCode();
    if (req.kind === "cli") {
      const base = `Agent: ${req.assignee.name} \xB7 ${req.ticket.id || req.ticket.filename}`;
      let name = base;
      let n = 2;
      while (vscode?.window.terminals?.some((t) => t.name === name))
        name = `${base} #${n++}`;
      const terminal = vscode?.window.createTerminal({ name, cwd: req.cwd });
      if (!terminal)
        return false;
      terminal.show(false);
      await new Promise((r) => setTimeout(r, 600));
      terminal.sendText(req.command);
      vscode?.window.showInformationMessage(`Dispatched ticket "${req.ticket.title}" to ${req.assignee.name}.`);
      return true;
    }
    await vscode?.env.clipboard.writeText(req.prompt || "");
    vscode?.window.showInformationMessage(`Copied ticket context to clipboard! Triggering ${req.assignee.name} (${req.command})...`);
    try {
      await vscode?.commands.executeCommand(req.command);
    } catch (err) {
      vscode?.window.showErrorMessage(`Failed to execute command "${req.command}": ${err?.message || err}`);
    }
    return true;
  }
};

// src/ticketParser.ts
var path3 = __toESM(require("path"));
var TicketParser = class {
  static parse(filePath, content, boardRoot, column, subfolder, mtime = Date.now()) {
    const filename = path3.basename(filePath);
    const relativePath = path3.relative(boardRoot, filePath).replace(/\\/g, "/");
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
      updated = updated.replace(tableRegex, (_m, pre, _old, rest) => `${pre}${newStatus} ${rest.trimStart()}`);
      return updated;
    }
    const frontmatterRegex = /^(status\s*:\s*)([^\r\n]+)$/im;
    if (frontmatterRegex.test(updated)) {
      updated = updated.replace(frontmatterRegex, (_m, pre) => `${pre}${newStatus}`);
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
      updated = updated.replace(tableAssigneeRegex, (_m, pre, _old, rest) => `${pre}${val} ${rest.trimStart()}`);
      return updated;
    }
    const statusRowRegex = /^(\|\s*\*{0,2}Status\*{0,2}\s*\|.*)$/im;
    if (statusRowRegex.test(updated)) {
      updated = updated.replace(statusRowRegex, (_m, row) => `${row}${eol}| **Assignee** | ${val} |`);
      return updated;
    }
    const dividerRegex = /^(\|[-:\s|]+[-:]+\|)$/im;
    if (dividerRegex.test(updated)) {
      updated = updated.replace(dividerRegex, (_m, row) => `${row}${eol}| **Assignee** | ${val} |`);
      return updated;
    }
    const anyTableRowRegex = /^(\|\s*\*{0,2}(?:Priority|Type|Epic|Estimate|Milestone)\*{0,2}\s*\|.*)$/im;
    if (anyTableRowRegex.test(updated)) {
      updated = updated.replace(anyTableRowRegex, (_m, row) => `${row}${eol}| **Assignee** | ${val} |`);
      return updated;
    }
    const frontmatterAssigneeRegex = /^(assignee\s*:\s*)([^\r\n]+)$/im;
    if (frontmatterAssigneeRegex.test(updated)) {
      updated = updated.replace(frontmatterAssigneeRegex, (_m, pre) => `${pre}${val === "\u2014" ? "" : val}`);
      return updated;
    }
    const frontmatterBlockRegex = /^---\r?\n([\s\S]*?)\r?\n---/;
    const fmMatch = updated.match(frontmatterBlockRegex);
    if (fmMatch) {
      const fmContent = fmMatch[1];
      const newFm = `---${eol}${fmContent}${eol}assignee: ${val === "\u2014" ? "" : val}${eol}---`;
      return updated.replace(frontmatterBlockRegex, () => newFm);
    }
    const headingRegex = /^(#\s+[^\r\n]+(?:\r?\n)+)/;
    const headingMatch = updated.match(headingRegex);
    const tableBlock = `| Field | Value |${eol}|-------|-------|${eol}| **Assignee** | ${val} |${eol}${eol}`;
    if (headingMatch) {
      return updated.replace(headingRegex, () => `${headingMatch[1]}${tableBlock}`);
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

// src/fleet/providers.ts
var fs2 = __toESM(require("fs"));
var path4 = __toESM(require("path"));
var PROVIDER_PRESETS = [
  {
    kind: "claude-code",
    label: "Claude Code",
    type: "cli",
    command: `claude {model_args} -p "{task}"`,
    modelFlag: "--model",
    models: ["opus", "sonnet", "haiku"],
    defaultModel: "sonnet",
    maxParallel: 3,
    maxSessionsPerWindow: 40,
    windowMinutes: 300,
    minSpacingSeconds: 10
  },
  {
    kind: "devin",
    label: "Devin",
    type: "cli",
    command: `devin {model_args} -p "{task}"`,
    modelFlag: "--model",
    models: [],
    defaultModel: "",
    maxParallel: 2,
    maxSessionsPerWindow: 0,
    windowMinutes: 60,
    minSpacingSeconds: 30
  },
  {
    kind: "antigravity",
    label: "Antigravity CLI",
    type: "cli",
    command: `& "{agy_path}" {model_args} -p "{task}" --dangerously-skip-permissions`,
    modelFlag: "--model",
    models: [],
    defaultModel: "",
    maxParallel: 2,
    maxSessionsPerWindow: 0,
    windowMinutes: 60,
    minSpacingSeconds: 15
  },
  {
    kind: "gemini",
    label: "Gemini CLI",
    type: "cli",
    command: `gemini {model_args} --prompt "{task}"`,
    modelFlag: "--model",
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
    defaultModel: "gemini-2.5-pro",
    maxParallel: 2,
    maxSessionsPerWindow: 60,
    windowMinutes: 60,
    minSpacingSeconds: 10
  },
  {
    kind: "codex",
    label: "Codex CLI",
    type: "cli",
    command: `codex exec {model_args} "{task}"`,
    modelFlag: "--model",
    models: [],
    defaultModel: "",
    maxParallel: 2,
    maxSessionsPerWindow: 0,
    windowMinutes: 300,
    minSpacingSeconds: 10
  },
  {
    kind: "aider",
    label: "Aider",
    type: "cli",
    command: 'aider {model_args} --message "Implement ticket requirements in {ticket_path}" "{ticket_path}"',
    modelFlag: "--model",
    models: [],
    defaultModel: "",
    maxParallel: 2,
    maxSessionsPerWindow: 0,
    windowMinutes: 60,
    minSpacingSeconds: 5
  },
  {
    kind: "copilot-cli",
    label: "GitHub Copilot CLI",
    type: "cli",
    command: `copilot {model_args} -p "{task}"`,
    modelFlag: "--model",
    models: [],
    defaultModel: "",
    maxParallel: 1,
    maxSessionsPerWindow: 0,
    windowMinutes: 60,
    minSpacingSeconds: 10
  },
  {
    kind: "cline",
    label: "Cline CLI",
    type: "cli",
    command: `cline {model_args} "{task}"`,
    modelFlag: "-m",
    models: [],
    defaultModel: "",
    maxParallel: 2,
    maxSessionsPerWindow: 0,
    windowMinutes: 60,
    minSpacingSeconds: 5
  },
  {
    kind: "ide-chat",
    label: "IDE Chat (Copilot / Cursor / Antigravity)",
    type: "vscode-command",
    command: "workbench.action.chat.open",
    models: [],
    defaultModel: "",
    maxParallel: 1,
    maxSessionsPerWindow: 0,
    windowMinutes: 60,
    minSpacingSeconds: 0,
    prompt: "Please work on ticket {ticket_title} located at: {ticket_path}"
  },
  {
    kind: "custom",
    label: "Custom CLI",
    type: "cli",
    command: `my-agent {model_args} "{task}"`,
    modelFlag: "--model",
    models: [],
    defaultModel: "",
    maxParallel: 1,
    maxSessionsPerWindow: 0,
    windowMinutes: 60,
    minSpacingSeconds: 5
  }
];
function getPreset(kind) {
  return PROVIDER_PRESETS.find((p) => p.kind === kind) || PROVIDER_PRESETS[PROVIDER_PRESETS.length - 1];
}
var LEGACY_ID_TO_KIND = {
  "antigravity-cli": "antigravity",
  agy: "antigravity",
  "claude-code": "claude-code",
  claude: "claude-code",
  "gemini-cli": "gemini",
  gemini: "gemini",
  "devin-cli": "devin",
  devin: "devin",
  aider: "aider",
  "ide-chat": "ide-chat",
  codex: "codex",
  "codex-cli": "codex",
  "copilot-cli": "copilot-cli",
  "cline-ollama": "cline",
  cline: "cline"
};
function clampInt(v, min, max, fallback) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
function sanitizeProvider(raw, existingIds = []) {
  const kind = PROVIDER_PRESETS.some((p) => p.kind === raw?.kind) ? raw.kind : "custom";
  const preset = getPreset(kind);
  const name = String(raw?.name || preset.label).trim().slice(0, 60) || preset.label;
  let id = String(raw?.id || "").trim().replace(/[^a-zA-Z0-9_-]/g, "-");
  if (!id)
    id = uniqueProviderId(kind, existingIds);
  const models = Array.isArray(raw?.models) ? raw.models.map((m) => String(m).trim()).filter(Boolean) : preset.models.slice();
  const defaultModel = String(raw?.defaultModel ?? preset.defaultModel).trim();
  const roles = (Array.isArray(raw?.roles) ? raw.roles : ["worker"]).filter((r) => r === "worker" || r === "reviewer" || r === "orchestrator");
  return {
    id,
    kind,
    name,
    account: raw?.account ? String(raw.account).trim().slice(0, 60) : void 0,
    enabled: raw?.enabled !== false,
    type: raw?.type === "vscode-command" ? "vscode-command" : raw?.type === "cli" ? "cli" : preset.type,
    command: String(raw?.command ?? preset.command),
    modelFlag: raw?.modelFlag !== void 0 ? String(raw.modelFlag).trim() || void 0 : preset.modelFlag,
    workingDir: raw?.workingDir ? String(raw.workingDir) : void 0,
    path: raw?.path ? String(raw.path) : void 0,
    prompt: raw?.prompt ? String(raw.prompt) : preset.prompt,
    models,
    defaultModel: defaultModel && models.length && !models.includes(defaultModel) ? models[0] : defaultModel,
    maxParallel: clampInt(raw?.maxParallel, 1, 32, preset.maxParallel),
    maxSessionsPerWindow: clampInt(raw?.maxSessionsPerWindow, 0, 1e5, preset.maxSessionsPerWindow),
    windowMinutes: clampInt(raw?.windowMinutes, 1, 10080, preset.windowMinutes),
    minSpacingSeconds: clampInt(raw?.minSpacingSeconds, 0, 3600, preset.minSpacingSeconds),
    safetyMarginPct: clampInt(raw?.safetyMarginPct, 0, 50, 10),
    roles: roles.length ? roles : ["worker"]
  };
}
function uniqueProviderId(base, existing) {
  if (!existing.includes(base))
    return base;
  let n = 2;
  while (existing.includes(`${base}-${n}`))
    n++;
  return `${base}-${n}`;
}
function createProvider(kind, existing, name) {
  const preset = getPreset(kind);
  const ids = existing.map((p) => p.id);
  const sameKind = existing.filter((p) => p.kind === kind).length;
  return sanitizeProvider({
    ...preset,
    id: uniqueProviderId(kind, ids),
    kind,
    name: name || (sameKind ? `${preset.label} ${sameKind + 1}` : preset.label),
    models: preset.models.slice(),
    roles: kind === "ide-chat" ? ["worker"] : ["worker", "reviewer"]
  }, ids);
}
function providersFromAssignees(assignees, existing = []) {
  const out = [];
  const ids = existing.map((p) => p.id);
  for (const a of assignees) {
    if (a.type !== "agent" || !a.agentConfig)
      continue;
    if (existing.some((p2) => p2.id === a.id || p2.name.toLowerCase() === a.name.toLowerCase()))
      continue;
    const kind = LEGACY_ID_TO_KIND[a.id] || "custom";
    const preset = getPreset(kind);
    const p = sanitizeProvider({
      ...preset,
      id: uniqueProviderId(a.id, ids.concat(out.map((o) => o.id))),
      kind,
      name: a.name,
      type: a.agentConfig.type,
      command: a.agentConfig.command || preset.command,
      workingDir: a.agentConfig.workingDir,
      path: a.agentConfig.path || a.agentConfig.executable,
      prompt: a.agentConfig.prompt || preset.prompt,
      models: preset.models.slice(),
      // legacy commands have no model placeholder and must keep working unchanged
      modelFlag: void 0,
      // legacy commands hard-code an "implement" prompt, so they cannot act as reviewers/planners
      roles: ["worker"]
    });
    out.push(p);
  }
  return out;
}
function providerToAssignee(p) {
  return {
    id: p.id,
    name: p.name,
    type: "agent",
    role: p.account ? `Account: ${p.account}` : void 0,
    agentConfig: {
      type: p.type,
      command: p.command,
      workingDir: p.workingDir,
      prompt: p.prompt,
      path: p.path,
      executable: p.path
    }
  };
}
var ProviderRegistry = class {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
    this.filePath = path4.join(workspaceRoot, ".agentic-kanban", "providers.json");
    this.load();
  }
  providers = [];
  listeners = [];
  filePath;
  onChange(fn) {
    this.listeners.push(fn);
  }
  load() {
    try {
      const raw = JSON.parse(fs2.readFileSync(this.filePath, "utf8"));
      const list = Array.isArray(raw) ? raw : raw?.providers || [];
      const ids = [];
      this.providers = list.map((r) => {
        const p = sanitizeProvider(r, ids);
        ids.push(p.id);
        return p;
      });
    } catch {
      this.providers = [];
    }
  }
  isEmpty() {
    return this.providers.length === 0;
  }
  list() {
    return this.providers.map((p) => ({ ...p, models: p.models.slice(), roles: p.roles.slice() }));
  }
  get(idOrName) {
    if (!idOrName)
      return void 0;
    const key = idOrName.toLowerCase();
    return this.providers.find((p) => p.id.toLowerCase() === key) || this.providers.find((p) => p.name.toLowerCase() === key);
  }
  upsert(raw) {
    const others = this.providers.filter((p2) => p2.id !== raw?.id).map((p2) => p2.id);
    const p = sanitizeProvider(raw, others);
    const idx = this.providers.findIndex((x) => x.id === p.id);
    if (idx >= 0)
      this.providers[idx] = p;
    else
      this.providers.push(p);
    this.save();
    return p;
  }
  add(kind, name) {
    const p = createProvider(kind, this.providers, name);
    this.providers.push(p);
    this.save();
    return p;
  }
  duplicate(id) {
    const src = this.providers.find((p) => p.id === id);
    if (!src)
      return void 0;
    const copy = {
      ...src,
      models: src.models.slice(),
      roles: src.roles.slice(),
      id: uniqueProviderId(src.kind, this.providers.map((p) => p.id)),
      name: `${src.name} (copy)`
    };
    this.providers.push(copy);
    this.save();
    return copy;
  }
  remove(id) {
    const before = this.providers.length;
    this.providers = this.providers.filter((p) => p.id !== id);
    if (this.providers.length !== before) {
      this.save();
      return true;
    }
    return false;
  }
  seedFromAssignees(assignees) {
    const added = providersFromAssignees(assignees, this.providers);
    if (added.length) {
      this.providers.push(...added);
      this.save();
    }
    return added.length;
  }
  save() {
    fs2.mkdirSync(path4.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs2.writeFileSync(tmp, JSON.stringify({ version: 1, providers: this.providers }, null, 2), "utf8");
    fs2.renameSync(tmp, this.filePath);
    this.listeners.forEach((fn) => fn());
  }
};

// src/fleet/sessions.ts
var path5 = __toESM(require("path"));
var QUICK_FAIL_MS = 2e4;
var COOLDOWN_BASE_MIN = 5;
var COOLDOWN_MAX_MIN = 30;
var DEFAULT_SESSION_TIMEOUT_MIN = 180;
var SessionManager = class {
  constructor(getProvider, launcher, store, clock = Date.now, sessionTimeoutMinutes = DEFAULT_SESSION_TIMEOUT_MIN) {
    this.getProvider = getProvider;
    this.launcher = launcher;
    this.store = store;
    this.clock = clock;
    this.sessionTimeoutMinutes = sessionTimeoutMinutes;
    this.starts = store ? store.load().starts : {};
  }
  sessions = [];
  payloads = /* @__PURE__ */ new Map();
  starts;
  cooldownUntil = /* @__PURE__ */ new Map();
  quickFails = /* @__PURE__ */ new Map();
  listeners = [];
  seq = 0;
  onChange(fn) {
    this.listeners.push(fn);
  }
  emit() {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch {
      }
    });
  }
  list() {
    return this.sessions.map((s) => ({ ...s }));
  }
  get(id) {
    return this.sessions.find((s) => s.id === id);
  }
  active() {
    return this.sessions.filter((s) => s.status === "running" || s.status === "queued");
  }
  activeForTicket(ticketPath) {
    const key = path5.resolve(ticketPath).toLowerCase();
    return this.active().find((s) => path5.resolve(s.ticketPath).toLowerCase() === key);
  }
  startsInWindow(p, now) {
    const since = now - p.windowMinutes * 6e4;
    return (this.starts[p.id] || []).filter((t) => t > since);
  }
  /** Can this provider start another session right now? Never throws. */
  canStart(p, now = this.clock()) {
    if (!p.enabled)
      return { ok: false, state: "disabled", reason: "Provider is disabled" };
    const cd = this.cooldownUntil.get(p.id) || 0;
    if (cd > now) {
      return { ok: false, state: "cooldown", reason: "Cooling down after a failed start (possible rate limit)", retryAt: cd };
    }
    const running = this.sessions.filter((s) => s.providerId === p.id && s.status === "running").length;
    if (running >= p.maxParallel) {
      return { ok: false, state: "busy", reason: `${running}/${p.maxParallel} parallel sessions in use` };
    }
    const recent = this.startsInWindow(p, now);
    if (p.maxSessionsPerWindow > 0) {
      const allowed = Math.max(1, Math.floor(p.maxSessionsPerWindow * (1 - p.safetyMarginPct / 100)));
      if (recent.length >= allowed) {
        const oldest = Math.min(...recent);
        return {
          ok: false,
          state: "throttled",
          reason: `${recent.length}/${p.maxSessionsPerWindow} sessions used in the last ${p.windowMinutes} min (keeping ${p.safetyMarginPct}% headroom)`,
          retryAt: oldest + p.windowMinutes * 6e4
        };
      }
    }
    const last = recent.length ? Math.max(...recent) : 0;
    const readyAt = last + p.minSpacingSeconds * 1e3;
    if (p.minSpacingSeconds > 0 && last && readyAt > now) {
      return { ok: false, state: "throttled", reason: `Spacing starts by ${p.minSpacingSeconds}s`, retryAt: readyAt };
    }
    return { ok: true, state: "ready" };
  }
  /** How many sessions could start right now without breaking any limit (0 when throttled/busy/cooling). */
  headroom(p, now = this.clock()) {
    if (!this.canStart(p, now).ok)
      return 0;
    const running = this.sessions.filter((x) => x.providerId === p.id && x.status === "running").length;
    let room = p.maxParallel - running;
    if (p.maxSessionsPerWindow > 0) {
      const allowed = Math.max(1, Math.floor(p.maxSessionsPerWindow * (1 - p.safetyMarginPct / 100)));
      room = Math.min(room, allowed - this.startsInWindow(p, now).length);
    }
    if (p.minSpacingSeconds > 0)
      room = Math.min(room, 1);
    return Math.max(0, room);
  }
  usage(p, now = this.clock()) {
    const check2 = this.canStart(p, now);
    const recent = this.startsInWindow(p, now).length;
    return {
      providerId: p.id,
      state: check2.state,
      reason: check2.reason,
      running: this.sessions.filter((s) => s.providerId === p.id && s.status === "running").length,
      queued: this.sessions.filter((s) => s.providerId === p.id && s.status === "queued").length,
      maxParallel: p.maxParallel,
      startsInWindow: recent,
      maxSessionsPerWindow: p.maxSessionsPerWindow,
      windowMinutes: p.windowMinutes,
      pct: p.maxSessionsPerWindow > 0 ? Math.min(100, Math.round(recent / p.maxSessionsPerWindow * 100)) : null,
      retryAt: check2.retryAt,
      cooldownUntil: this.cooldownUntil.get(p.id)
    };
  }
  /** Starts the session now if the provider has capacity, otherwise queues it (or rejects when queueIfBusy is false). */
  async request(req) {
    const existing = this.activeForTicket(req.ticketPath);
    if (existing && existing.providerId === req.provider.id && existing.role === req.role) {
      return existing;
    }
    const now = this.clock();
    const session = {
      id: `s${now.toString(36)}${(++this.seq).toString(36)}`,
      providerId: req.provider.id,
      providerName: req.provider.name,
      model: req.model,
      role: req.role,
      ticketPath: req.ticketPath,
      ticketId: req.ticketId,
      ticketTitle: req.ticketTitle,
      boardId: req.boardId,
      status: "queued",
      queuedAt: now
    };
    this.sessions.push(session);
    this.payloads.set(session.id, { req });
    const check2 = this.canStart(req.provider, now);
    if (check2.ok) {
      await this.start(session);
    } else if (req.queueIfBusy === false) {
      session.status = "cancelled";
      session.endedAt = now;
      session.note = `Not started: ${check2.reason}`;
      this.payloads.delete(session.id);
    } else {
      session.note = `Queued: ${check2.reason}`;
    }
    this.emit();
    return session;
  }
  async start(session) {
    const entry = this.payloads.get(session.id);
    const provider = this.getProvider(session.providerId);
    if (!entry || !provider) {
      this.finish(session, "failed", void 0, "Provider no longer exists");
      return;
    }
    const now = this.clock();
    session.status = "running";
    session.startedAt = now;
    session.note = void 0;
    (this.starts[provider.id] ||= []).push(now);
    this.trimHistory(provider, now);
    this.store?.save({ starts: this.starts });
    this.emit();
    let ok = false;
    try {
      ok = await this.launcher.launch(session, entry.req.payload);
    } catch (e) {
      session.note = `Launch error: ${e?.message || e}`;
    }
    if (!ok && session.status === "running") {
      this.finish(session, "failed", void 0, session.note || "Launcher could not start the session");
    }
  }
  trimHistory(p, now) {
    const keep = now - Math.max(p.windowMinutes, 60) * 6e4;
    this.starts[p.id] = (this.starts[p.id] || []).filter((t) => t > keep);
  }
  /** Called by the launcher when the agent process/terminal ends. exitCode may be unknown. */
  ended(sessionId, exitCode, note) {
    const s = this.get(sessionId);
    if (!s || s.status !== "running" && s.status !== "queued")
      return;
    const now = this.clock();
    const quick = s.startedAt !== void 0 && now - s.startedAt < QUICK_FAIL_MS;
    if (exitCode !== void 0 && exitCode !== 0) {
      this.finish(s, "failed", exitCode, note || `Exited with code ${exitCode}`);
      if (quick)
        this.enterCooldown(s.providerId, now);
    } else {
      this.finish(s, "finished", exitCode, note);
      if (exitCode === 0)
        this.quickFails.set(s.providerId, 0);
    }
    void this.pump();
  }
  enterCooldown(providerId, now) {
    const n = (this.quickFails.get(providerId) || 0) + 1;
    this.quickFails.set(providerId, n);
    const minutes = Math.min(COOLDOWN_MAX_MIN, COOLDOWN_BASE_MIN * 2 ** (n - 1));
    this.cooldownUntil.set(providerId, now + minutes * 6e4);
  }
  finish(s, status, exitCode, note) {
    s.status = status;
    s.endedAt = this.clock();
    if (exitCode !== void 0)
      s.exitCode = exitCode;
    if (note)
      s.note = note;
    this.payloads.delete(s.id);
    this.emit();
  }
  markFinished(id) {
    const s = this.get(id);
    if (s && s.status === "running") {
      this.finish(s, "finished", void 0, "Marked finished manually");
      void this.pump();
    }
  }
  cancel(id) {
    const s = this.get(id);
    if (!s)
      return;
    if (s.status === "running") {
      try {
        this.launcher.kill(s);
      } catch {
      }
      this.finish(s, "cancelled", void 0, "Cancelled by user");
      void this.pump();
    } else if (s.status === "queued") {
      this.finish(s, "cancelled", void 0, "Cancelled by user");
    }
  }
  show(id) {
    const s = this.get(id);
    if (s)
      this.launcher.show(s);
  }
  /** Starts queued sessions (oldest first) wherever capacity has opened up. Safe to call often. */
  async pump() {
    const now = this.clock();
    for (const s of this.sessions.filter((x) => x.status === "queued").sort((a, b) => a.queuedAt - b.queuedAt)) {
      const p = this.getProvider(s.providerId);
      if (!p) {
        this.finish(s, "failed", void 0, "Provider no longer exists");
        continue;
      }
      const check2 = this.canStart(p, now);
      if (check2.ok) {
        await this.start(s);
      } else {
        const note = `Queued: ${check2.reason}`;
        if (s.note !== note) {
          s.note = note;
          this.emit();
        }
      }
    }
  }
  /** Periodic housekeeping: start queued work and retire sessions that clearly outlived any real run. */
  async tick() {
    const now = this.clock();
    for (const s of this.sessions.filter((x) => x.status === "running")) {
      if (s.startedAt && now - s.startedAt > this.sessionTimeoutMinutes * 6e4) {
        this.finish(s, "finished", void 0, `Assumed finished after ${this.sessionTimeoutMinutes} min`);
      }
    }
    await this.pump();
  }
  /** Drops finished sessions older than `keepMinutes` so the list stays readable. */
  prune(keepMinutes = 240) {
    const cutoff = this.clock() - keepMinutes * 6e4;
    const before = this.sessions.length;
    this.sessions = this.sessions.filter((s) => s.status === "running" || s.status === "queued" || (s.endedAt || 0) > cutoff);
    if (this.sessions.length !== before)
      this.emit();
  }
};

// src/fleet/scheduler.ts
var PRIORITY_RANK = {
  p0: 0,
  critical: 0,
  p1: 1,
  high: 1,
  p2: 2,
  medium: 2,
  normal: 2,
  p3: 3,
  low: 3
};
function priorityRank(priority) {
  const m = (priority || "").toLowerCase().match(/^(p[0-3]|critical|high|medium|normal|low)/);
  return m ? PRIORITY_RANK[m[1]] : 2;
}
function automatableWorkers(providers) {
  return providers.filter((p) => p.enabled && p.type === "cli" && p.roles.includes("worker"));
}
function modelFor(provider, ticket) {
  const label = (ticket.labels || []).map((l) => l.replace(/[`\s]/g, "")).find((l) => /^model:/i.test(l));
  if (label) {
    const wanted = label.slice(label.indexOf(":") + 1).toLowerCase();
    const hit = provider.models.find((m) => m.toLowerCase() === wanted);
    if (hit)
      return hit;
  }
  return provider.defaultModel;
}
function matchProvider(providers, assignee) {
  if (!assignee)
    return void 0;
  const key = assignee.trim().toLowerCase();
  return providers.find((p) => p.id.toLowerCase() === key) || providers.find((p) => p.name.toLowerCase() === key);
}
function planWork(candidates, providers, sessions, opts = {}) {
  const now = opts.now ?? Date.now();
  const maxNew = opts.maxNew ?? 8;
  const workers = automatableWorkers(providers);
  const spent = /* @__PURE__ */ new Map();
  const room = (p) => sessions.headroom(p, now) - (spent.get(p.id) || 0);
  const ordered = candidates.filter((c) => !sessions.activeForTicket(c.ticket.path)).filter((c) => !(c.ticket.unresolvedDependencies && c.ticket.unresolvedDependencies.length)).sort((a, b) => priorityRank(a.ticket.priority) - priorityRank(b.ticket.priority) || a.ticket.mtime - b.ticket.mtime);
  const out = [];
  for (const c of ordered) {
    if (out.length >= maxNew)
      break;
    const t = c.ticket;
    const requested = matchProvider(providers, t.assignee);
    let chosen;
    let reason;
    if (requested) {
      if (!workers.includes(requested))
        continue;
      chosen = requested;
      reason = `Assigned to ${requested.name}`;
    } else if (t.assignee && !/^(unassigned|—|-)$/i.test(t.assignee.trim())) {
      continue;
    } else {
      const ranked = workers.map((p) => ({ p, free: room(p), u: sessions.usage(p, now) })).filter((x) => x.free > 0).sort((a, b) => (a.u.pct ?? 0) - (b.u.pct ?? 0) || b.free - a.free);
      chosen = ranked[0]?.p;
      reason = chosen ? "Most headroom available" : "No provider has free capacity";
    }
    if (!chosen)
      continue;
    const startsNow = room(chosen) > 0;
    if (startsNow)
      spent.set(chosen.id, (spent.get(chosen.id) || 0) + 1);
    out.push({
      ticketPath: t.path,
      ticketId: t.id,
      title: t.title,
      boardId: c.boardId,
      providerId: chosen.id,
      providerName: chosen.name,
      model: modelFor(chosen, t),
      startsNow,
      reason: startsNow ? reason : `${reason} \u2014 will queue (${sessions.canStart(chosen, now).reason || "at capacity"})`
    });
  }
  return out;
}
function pickReviewer(providers, sessions, authorProviderId, now = Date.now()) {
  const reviewers = providers.filter((p) => p.enabled && p.type === "cli" && p.roles.includes("reviewer"));
  const scored = reviewers.map((p) => ({ p, free: sessions.headroom(p, now), other: p.id !== authorProviderId ? 1 : 0, pct: sessions.usage(p, now).pct ?? 0 })).sort((a, b) => (b.free > 0 ? 1 : 0) - (a.free > 0 ? 1 : 0) || b.other - a.other || a.pct - b.pct);
  return scored[0]?.p;
}

// test/fleetTests.ts
var failures = 0;
function check(cond, msg) {
  if (!cond) {
    failures++;
    console.error("  \u2718 " + msg);
  } else {
    console.log("  \u2714 " + msg);
  }
}
function mkTicket(over = {}) {
  return {
    id: "T-1",
    filename: "t-1.md",
    path: path6.join(os.tmpdir(), "Tickets", "Backlog", "Ready", "t-1.md"),
    relativePath: "Backlog/Ready/t-1.md",
    column: "Backlog",
    subfolder: "Ready",
    title: "Do it",
    summary: "sum",
    description: "",
    status: "Backlog",
    priority: "Normal",
    epic: null,
    type: null,
    estimate: null,
    milestone: null,
    assignee: null,
    dependsOn: [],
    blocks: [],
    labels: [],
    acceptanceCriteria: [],
    progress: { done: 0, total: 0 },
    mtime: 1,
    hasWorkLog: false,
    ...over
  };
}
var FakeLauncher = class {
  launched = [];
  killed = [];
  async launch(s) {
    this.launched.push(s.id);
    return true;
  }
  show() {
  }
  kill(s) {
    this.killed.push(s.id);
  }
};
async function main() {
  console.log("\n--- pathUtils ---");
  const root = path6.join(os.tmpdir(), "board");
  check(isInside(root, path6.join(root, "Backlog", "a.md")), "child path is inside");
  check(!isInside(root, root + "2"), "sibling with shared prefix is NOT inside");
  check(safeJoin(root, "Backlog", "Ready") === path6.join(root, "Backlog", "Ready"), "safeJoin accepts normal names");
  check(safeJoin(root, "..", "x") === null, "safeJoin rejects ..");
  check(safeJoin(root, "Backlog", "../../etc") === null, "safeJoin rejects nested traversal");
  check(safeJoin(root, "C:\\Windows") === null && safeJoin(root, "/etc") === null, "safeJoin rejects absolute segments");
  check(slugify("\xC5tg\xE4rda buggen i \xD6ppna-menyn") === "atgarda-buggen-i-oppna-menyn", "slugify folds accents");
  check(slugify("???") === "untitled", "slugify never returns an empty slug");
  console.log("\n--- shell escaping / command building ---");
  check(detectShellKind("C:\\Program Files\\PowerShell\\7\\pwsh.exe") === "powershell", "detects pwsh");
  check(detectShellKind("/bin/bash") === "posix" && detectShellKind("cmd.exe") === "cmd", "detects bash / cmd");
  const evil = 'x"; Remove-Item -Recurse C:\\; $(calc) `whoami`\nnext';
  const ps = escapeForDoubleQuotes(evil, "powershell");
  check(!/(^|[^`])\$\(/.test(ps) && !/(^|[^`])"/.test(ps) && !ps.includes("\n"), 'powershell: $( and " are backtick-escaped, newline flattened');
  const sh = escapeForDoubleQuotes(evil, "posix");
  check(!/(^|[^\\])\$\(/.test(sh) && !/(^|[^\\])"/.test(sh), 'posix: $( and " are backslash-escaped');
  const agent = {
    id: "claude-code",
    name: "Claude Code",
    type: "agent",
    agentConfig: { type: "cli", command: 'claude {model_args} -p "{task}" # {ticket_title}' }
  };
  const evilTicket = mkTicket({ title: 'Fix $(calc) "now" {model}', id: "E-1" });
  const cmd = AgentRunner.formatCliCommand(evilTicket, agent, os.tmpdir(), void 0, "body", {
    shell: "powershell",
    model: "opus",
    modelFlag: "--model"
  });
  check(cmd.startsWith('claude --model opus -p "'), "model_args expands to --model opus");
  check(cmd.includes("`$(calc)") && cmd.includes('`"now`"'), "ticket title is escaped inside the command");
  check(cmd.includes("{model}"), "placeholder-looking text in a ticket stays literal (single pass)");
  const badModel = AgentRunner.formatCliCommand(mkTicket(), agent, os.tmpdir(), void 0, "b", {
    shell: "posix",
    model: "opus; rm -rf ~",
    modelFlag: "--model"
  });
  check(!badModel.includes("rm -rf"), "unsafe model ids are dropped");
  const appended = AgentRunner.formatCliCommand(mkTicket(), {
    id: "x",
    name: "X",
    type: "agent",
    agentConfig: { type: "cli", command: 'mytool "{ticket_title}"' }
  }, os.tmpdir(), void 0, "b", { shell: "posix", model: "big", modelFlag: "-m" });
  check(appended.endsWith("-m big"), "model flag is appended when the template has no placeholder");
  console.log("\n--- ticket parser: replacement specials ---");
  const md = "# T\n\n| Field | Value |\n|---|---|\n| **Status** | Backlog | extra |\n| **Assignee** | Bob |\n";
  const st = TicketParser.updateTicketStatus(md, "Done $& $' end");
  check(st.includes("| **Status** | Done $& $' end | extra |"), "status keeps $-patterns literal and preserves trailing cells");
  const as = TicketParser.updateTicketAssignee(md, "Dev$`in");
  check(as.includes("| **Assignee** | Dev$`in |"), "assignee keeps $-patterns literal");
  console.log("\n--- providers ---");
  const tmp = fs3.mkdtempSync(path6.join(os.tmpdir(), "fleet-"));
  const reg = new ProviderRegistry(tmp);
  const d1 = reg.add("devin", "Devin (work)");
  const d2 = reg.add("devin", "Devin (personal)");
  check(d1.id !== d2.id && reg.list().length === 2, "two providers of the same kind get distinct ids");
  const renamed = reg.upsert({ ...d1, name: "Devin \u2013 Acme", account: "work" });
  check(renamed.id === d1.id && reg.get(d1.id).name === "Devin \u2013 Acme", "rename keeps the id");
  check(new ProviderRegistry(tmp).list().length === 2, "registry persists to disk");
  const weird = sanitizeProvider({ kind: "claude-code", name: "  ", maxParallel: 999, safetyMarginPct: 99, models: ["a", "b"], defaultModel: "zzz" });
  check(weird.maxParallel === 32 && weird.safetyMarginPct === 50 && weird.defaultModel === "a", "sanitize clamps limits and fixes default model");
  const seeded = new ProviderRegistry(fs3.mkdtempSync(path6.join(os.tmpdir(), "fleet-")));
  check(seeded.seedFromAssignees([agent, { id: "bj", name: "Bj", type: "human" }]) === 1 && seeded.list()[0].kind === "claude-code", "legacy agents are imported, humans ignored");
  check(providerToAssignee(d1).id === d1.id && providerToAssignee(d1).type === "agent", "provider converts to an assignee");
  console.log("\n--- sessions: parallel, window, spacing, cooldown ---");
  let now = 1e6;
  const clock = () => now;
  const provs = {};
  const mk = (over2) => {
    const p = { ...createProvider("claude-code", Object.values(provs)), ...over2 };
    provs[p.id] = p;
    return p;
  };
  const a = mk({ id: "a", name: "A", maxParallel: 2, maxSessionsPerWindow: 0, minSpacingSeconds: 0 });
  const launcher = new FakeLauncher();
  const sm = new SessionManager((id) => provs[id], launcher, void 0, clock);
  const req = (p, n) => ({
    provider: p,
    model: "m",
    role: "worker",
    ticketPath: path6.join(tmp, `t${n}.md`),
    ticketId: `T${n}`,
    ticketTitle: `T${n}`,
    boardId: "b",
    payload: {}
  });
  const s1 = await sm.request(req(a, 1));
  const s2 = await sm.request(req(a, 2));
  const s3 = await sm.request(req(a, 3));
  check(s1.status === "running" && s2.status === "running" && s3.status === "queued", "third session queues at maxParallel=2");
  check((await sm.request(req(a, 1))).id === s1.id, "same ticket + provider is not started twice");
  now += 6e4;
  sm.ended(s1.id, 0);
  await new Promise((r) => setTimeout(r, 5));
  check(sm.get(s3.id).status === "running", "queued session starts when a slot frees");
  const w = mk({ id: "w", name: "W", maxParallel: 10, maxSessionsPerWindow: 10, windowMinutes: 60, safetyMarginPct: 20, minSpacingSeconds: 0 });
  for (let i = 0; i < 8; i++)
    await sm.request(req(w, 100 + i));
  check(sm.canStart(w).ok === false && sm.canStart(w).state === "throttled", "8 of 10 (20% margin) throttles the provider");
  const over = await sm.request({ ...req(w, 200), queueIfBusy: false });
  check(over.status === "cancelled", "queueIfBusy=false rejects instead of queueing");
  check(sm.usage(w).pct === 80, "usage reports 80%");
  now += 61 * 6e4;
  check(sm.canStart(w).ok && sm.usage(w).startsInWindow === 0, "window slides forward and capacity returns");
  const sp = mk({ id: "sp", name: "SP", maxParallel: 5, maxSessionsPerWindow: 0, minSpacingSeconds: 30 });
  await sm.request(req(sp, 300));
  check(sm.canStart(sp).state === "throttled" && !!sm.canStart(sp).retryAt, "minimum spacing between starts is enforced");
  now += 31e3;
  check(sm.canStart(sp).ok, "spacing clears after the delay");
  const cd = mk({ id: "cd", name: "CD", maxParallel: 5, maxSessionsPerWindow: 0, minSpacingSeconds: 0 });
  const q = await sm.request(req(cd, 400));
  now += 3e3;
  sm.ended(q.id, 1);
  check(sm.canStart(cd).state === "cooldown", "quick non-zero exit puts the provider in cooldown");
  now += 6 * 6e4;
  check(sm.canStart(cd).ok, "cooldown expires");
  const old = await sm.request(req(cd, 500));
  now += 181 * 6e4;
  await sm.tick();
  check(sm.get(old.id).status === "finished", "sessions that outlive the timeout are retired so slots never leak");
  const run = await sm.request(req(cd, 501));
  sm.cancel(run.id);
  check(launcher.killed.includes(run.id) && sm.get(run.id).status === "cancelled", "cancel kills the terminal");
  console.log("\n--- scheduler ---");
  check(priorityRank("P0 \u2014 Critical") < priorityRank("Normal") && priorityRank("P3") > priorityRank("Normal"), "priority ranking");
  const now2 = 5e9;
  const sm2 = new SessionManager((id) => provs2[id], new FakeLauncher(), void 0, () => now2);
  const provs2 = {};
  const p1 = { ...createProvider("claude-code", []), id: "p1", name: "Claude A", maxParallel: 1, minSpacingSeconds: 0, models: ["opus", "sonnet"], defaultModel: "sonnet", maxSessionsPerWindow: 0 };
  const p2 = { ...createProvider("gemini", []), id: "p2", name: "Gemini", maxParallel: 1, minSpacingSeconds: 0, maxSessionsPerWindow: 0 };
  provs2.p1 = p1;
  provs2.p2 = p2;
  const cands = [
    { ticket: mkTicket({ id: "L", path: path6.join(tmp, "l.md"), priority: "Low", mtime: 1 }), boardId: "b", boardRoot: tmp },
    { ticket: mkTicket({ id: "H", path: path6.join(tmp, "h.md"), priority: "P0", mtime: 2, labels: ["model:opus"] }), boardId: "b", boardRoot: tmp },
    { ticket: mkTicket({ id: "D", path: path6.join(tmp, "d.md"), priority: "P0", unresolvedDependencies: ["X"] }), boardId: "b", boardRoot: tmp },
    { ticket: mkTicket({ id: "N", path: path6.join(tmp, "n.md"), priority: "P1", assignee: "Bj\xF6rn" }), boardId: "b", boardRoot: tmp },
    { ticket: mkTicket({ id: "A", path: path6.join(tmp, "a.md"), priority: "P2", assignee: "Gemini" }), boardId: "b", boardRoot: tmp }
  ];
  const plan = planWork(cands, [p1, p2], sm2, { now: now2 });
  const byId = Object.fromEntries(plan.map((d) => [d.ticketId, d]));
  check(plan[0].ticketId === "H", "highest priority is planned first");
  check(!byId.D && !byId.N, "tickets with open dependencies or a human assignee are skipped");
  check(byId.A.providerId === "p2", "explicit assignee is honoured");
  check(byId.H.model === "opus" && modelFor(p1, cands[0].ticket) === "sonnet", "model:<name> label picks the model, default otherwise");
  const startsNow = plan.filter((d) => d.startsNow);
  check(startsNow.filter((d) => d.providerId === "p1").length <= 1 && startsNow.filter((d) => d.providerId === "p2").length <= 1, "plan never exceeds a provider's free parallel slots");
  check(plan.some((d) => d.ticketId === "L") === false || byId.L.startsNow === false, "overflow work is marked as queued, not started");
  const rev = pickReviewer([{ ...p1, roles: ["worker", "reviewer"] }, { ...p2, roles: ["worker", "reviewer"] }], sm2, "p1", now2);
  check(rev?.id === "p2", "reviewer prefers a different provider than the author");
  fs3.rmSync(tmp, { recursive: true, force: true });
  if (failures) {
    console.error(`
${failures} fleet check(s) FAILED`);
    process.exit(1);
  }
  console.log("\n=== All fleet tests passed ===");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
//# sourceMappingURL=fleetTests.js.map
