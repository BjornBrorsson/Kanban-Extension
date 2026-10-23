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
var fs6 = __toESM(require("fs"));
var os3 = __toESM(require("os"));
var http2 = __toESM(require("http"));
var path8 = __toESM(require("path"));

// src/fleet/detect.ts
var fs = __toESM(require("fs"));
var http = __toESM(require("http"));
var os = __toESM(require("os"));
var path = __toESM(require("path"));
var import_child_process = require("child_process");
var isWin = () => process.platform === "win32";
function pathExts() {
  if (!isWin())
    return [""];
  return ["", ...(process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";").map((e) => e.toLowerCase())];
}
function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}
function extraSearchDirs(env = process.env) {
  const home = env.USERPROFILE || env.HOME || os.homedir();
  const dirs = [];
  if (isWin()) {
    const local = env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    const roaming = env.APPDATA || path.join(home, "AppData", "Roaming");
    dirs.push(
      path.join(roaming, "npm"),
      path.join(local, "Programs", "Ollama"),
      path.join(local, "Programs", "Devin", "bin"),
      path.join(local, "Programs", "Devin Next", "bin"),
      path.join(local, "agy", "bin"),
      path.join(local, "Microsoft", "WindowsApps"),
      path.join(home, ".local", "bin"),
      path.join(home, ".claude", "local"),
      path.join(env.ProgramFiles || "C:\\Program Files", "Ollama"),
      path.join(env.ProgramFiles || "C:\\Program Files", "agy", "bin")
    );
    for (const root of [path.join(local, "fnm_multishells"), env.FNM_DIR ? path.join(env.FNM_DIR, "node-versions") : "", "C:\\fnm\\node-versions"]) {
      if (!root || !fs.existsSync(root))
        continue;
      try {
        for (const v of fs.readdirSync(root))
          dirs.push(path.join(root, v, "installation"), path.join(root, v));
      } catch {
      }
    }
  } else {
    dirs.push(
      path.join(home, ".local", "bin"),
      path.join(home, ".claude", "local"),
      path.join(home, ".agy", "bin"),
      path.join(home, ".npm-global", "bin"),
      path.join(home, ".cargo", "bin"),
      "/usr/local/bin",
      "/opt/homebrew/bin",
      "/usr/bin"
    );
  }
  return dirs;
}
function findExecutable(names, env = process.env, extraDirs = extraSearchDirs(env)) {
  const pathDirs = (env.PATH || env.Path || "").split(path.delimiter).filter(Boolean);
  const dirs = [...pathDirs, ...extraDirs];
  const exts = pathExts();
  for (const name of names) {
    for (const dir of dirs) {
      for (const ext of exts) {
        const candidate = path.join(dir, name + ext);
        if (isFile(candidate))
          return candidate;
      }
    }
  }
  return void 0;
}
function parseOllamaList(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length && /^name\s+/i.test(lines[0]))
    lines.shift();
  return lines.map((l) => l.split(/\s+/)[0]).filter(Boolean);
}
function httpGetJson(url, timeoutMs) {
  return new Promise((resolve4, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (d) => body += d);
      res.on("end", () => {
        try {
          resolve4(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}
async function detectOllamaModels(host = "127.0.0.1:11434", exePath) {
  try {
    const data = await httpGetJson(`http://${host}/api/tags`, 1500);
    const names = (data?.models || []).map((m) => String(m.name || m.model || "")).filter(Boolean);
    if (names.length)
      return names;
  } catch {
  }
  const exe = exePath || findExecutable(["ollama"]);
  if (!exe)
    return [];
  return new Promise((resolve4) => {
    (0, import_child_process.execFile)(exe, ["list"], { timeout: 4e3, windowsHide: true, shell: isWin() && /\.(cmd|bat)$/i.test(exe) }, (err, stdout) => {
      resolve4(err ? [] : parseOllamaList(String(stdout)));
    });
  });
}

// src/pathUtils.ts
var path2 = __toESM(require("path"));
var CASE_INSENSITIVE = process.platform === "win32" || process.platform === "darwin";
function norm(p) {
  const resolved = path2.resolve(p);
  return CASE_INSENSITIVE ? resolved.toLowerCase() : resolved;
}
function isInside(root, candidate) {
  if (!root || !candidate)
    return false;
  const r = norm(root);
  const c = norm(candidate);
  if (c === r)
    return true;
  const prefix = r.endsWith(path2.sep) ? r : r + path2.sep;
  return c.startsWith(prefix);
}
function safeJoin(root, ...segments) {
  let current = path2.resolve(root);
  for (const seg of segments) {
    if (seg === null || seg === void 0 || seg === "")
      continue;
    if (path2.isAbsolute(seg) || /^[a-zA-Z]:/.test(seg))
      return null;
    current = path2.resolve(current, seg);
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
var path4 = __toESM(require("path"));
var fs3 = __toESM(require("fs"));

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

// src/fleet/trust.ts
var fs2 = __toESM(require("fs"));
var os2 = __toESM(require("os"));
var path3 = __toESM(require("path"));
function isTrusted(trustedRoots, cwd) {
  return trustedRoots.some((r) => isInside(r, cwd));
}
var same = (a, b) => path3.resolve(a).toLowerCase() === path3.resolve(b).toLowerCase();
function readCopilotConfig(home) {
  const file = path3.join(home, ".copilot", "config.json");
  let text = "";
  try {
    text = fs2.readFileSync(file, "utf8");
  } catch {
  }
  const lines = text.split(/\r?\n/);
  const header = [];
  while (lines.length && /^\s*\/\//.test(lines[0]))
    header.push(lines.shift());
  let json = {};
  try {
    json = JSON.parse(lines.join("\n") || "{}");
  } catch {
    throw new Error(`Could not parse ${file}; not changing it.`);
  }
  return { header: header.join("\n"), json, file };
}
function writeCopilotConfig(c) {
  fs2.mkdirSync(path3.dirname(c.file), { recursive: true });
  const body = JSON.stringify(c.json, null, 2);
  const tmp = c.file + ".tmp";
  fs2.writeFileSync(tmp, (c.header ? c.header + "\n" : "") + body + "\n", "utf8");
  fs2.renameSync(tmp, c.file);
}
function addCopilotTrustedFolder(folder, home = os2.homedir()) {
  const c = readCopilotConfig(home);
  const list = Array.isArray(c.json.trustedFolders) ? c.json.trustedFolders : [];
  if (list.some((f) => same(f, folder)))
    return { changed: false, file: c.file };
  c.json.trustedFolders = [...list, folder];
  writeCopilotConfig(c);
  return { changed: true, file: c.file };
}
function removeCopilotTrustedFolder(folder, home = os2.homedir()) {
  const c = readCopilotConfig(home);
  const list = Array.isArray(c.json.trustedFolders) ? c.json.trustedFolders : [];
  const next = list.filter((f) => !same(f, folder));
  if (next.length === list.length)
    return { changed: false, file: c.file };
  c.json.trustedFolders = next;
  writeCopilotConfig(c);
  return { changed: true, file: c.file };
}
function copilotTrusts(folder, home = os2.homedir()) {
  try {
    const c = readCopilotConfig(home);
    return Array.isArray(c.json.trustedFolders) && c.json.trustedFolders.some((f) => same(f, folder));
  } catch {
    return false;
  }
}

// src/agentRunner.ts
var DEFAULT_TASK = "Review requirements and implement ticket {ticket_path}: {ticket_title}";
var SESSION_ID_PATTERN = /^[0-9a-fA-F-]{8,64}$/;
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
        candidates.push(path4.join(localAppData, "agy", "bin", "agy.exe"));
      }
      const userProfile = process.env.USERPROFILE;
      if (userProfile) {
        candidates.push(path4.join(userProfile, "AppData", "Local", "agy", "bin", "agy.exe"));
      }
      const programFiles = process.env.ProgramFiles;
      if (programFiles) {
        candidates.push(path4.join(programFiles, "agy", "bin", "agy.exe"));
      }
    } else {
      const home = process.env.HOME;
      if (home) {
        candidates.push(path4.join(home, ".agy", "bin", "agy"));
        candidates.push(path4.join(home, ".local", "bin", "agy"));
      }
      candidates.push("/usr/local/bin/agy");
      candidates.push("/usr/bin/agy");
    }
    for (const candidate of candidates) {
      if (candidate && fs3.existsSync(candidate)) {
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
    const workspaceFolder = vscode?.workspace?.workspaceFolders?.[0]?.uri.fsPath || path4.dirname(boardRoot);
    const content = rawTicketContent ?? ticket.summary ?? ticket.title;
    let effectiveBoardConfig = boardConfig;
    if (!effectiveBoardConfig) {
      const configPath = path4.join(boardRoot, "config.md");
      if (fs3.existsSync(configPath)) {
        try {
          const cfgText = fs3.readFileSync(configPath, "utf8");
          effectiveBoardConfig = ConfigParser.parse(cfgText, "board");
        } catch {
        }
      }
    }
    const agyPath = this.resolveAntigravityPath(config.path || config.executable, effectiveBoardConfig);
    const model = options.model && MODEL_ID_PATTERN.test(options.model) ? options.model : "";
    const modelArgs = model && options.modelFlag ? `${options.modelFlag} ${model}` : "";
    const effort = options.effort && /^[a-z]+$/.test(options.effort) ? options.effort : "";
    const effortArgs = effort && options.effortFlag ? `${options.effortFlag} ${effort}` : "";
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
      "{session_id}": options.sessionId && SESSION_ID_PATTERN.test(options.sessionId) ? options.sessionId : "",
      "{model_args}": modelArgs,
      "{effort_args}": effortArgs,
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
    if (options.trusted && options.trustFlag && /^[\w =.-]+$/.test(options.trustFlag) && !command.includes(options.trustFlag)) {
      command = `${command.trimEnd()} ${options.trustFlag}`;
    }
    if (effortArgs && !command.includes("{effort_args}")) {
      command = `${command.trimEnd()} ${effortArgs}`;
    }
    command = command.replace(/\{[a-z_]+\}/g, (m) => m in replacements ? replacements[m] : m);
    command = command.replace(/ {2,}/g, " ").trim();
    const exePath = config.path || config.executable;
    const first = command.match(/^([A-Za-z][\w.-]*)(?=\s|$)/);
    if (exePath && first && path4.basename(exePath).replace(/\.[^.]+$/, "").toLowerCase() === first[1].toLowerCase()) {
      const quoted = `"${exePath}"`;
      command = (shell === "powershell" ? "& " : "") + quoted + command.slice(first[1].length);
    }
    if (process.platform === "win32" && shell === "powershell") {
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
    const workspaceFolder = vscode?.workspace?.workspaceFolders?.[0]?.uri.fsPath || path4.dirname(boardRoot);
    let ticketContent = "";
    try {
      ticketContent = await fs3.promises.readFile(ticket.path, "utf8");
    } catch {
      ticketContent = ticket.summary || ticket.title;
    }
    if (config.type === "cli") {
      const cwd = config.workingDir ? config.workingDir.replace("{workspace_root}", workspaceFolder).replace("{board_root}", boardRoot) : workspaceFolder;
      const trusted = options.trustedRoots ? isTrusted(options.trustedRoots, cwd) : options.trusted;
      const command = this.formatCliCommand(ticket, assignee, boardRoot, boardConfig, ticketContent, { ...options, trusted });
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
var path5 = __toESM(require("path"));
var TicketParser = class {
  static parse(filePath, content, boardRoot, column, subfolder, mtime = Date.now()) {
    const filename = path5.basename(filePath);
    const relativePath = path5.relative(boardRoot, filePath).replace(/\\/g, "/");
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
var fs4 = __toESM(require("fs"));
var path6 = __toESM(require("path"));
var PROVIDER_PRESETS = [
  {
    kind: "claude-code",
    label: "Claude Code",
    type: "cli",
    command: `claude {model_args} --session-id {session_id} -p "{task}"`,
    modelFlag: "--model",
    resumeCommand: `claude {model_args} --resume {session_id} -p "{task}"`,
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
    trustFlag: "--respect-workspace-trust false",
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
    effortFlag: "--effort",
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
    resumeCommand: 'aider {model_args} --restore-chat-history --message "{task}" "{ticket_path}"',
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
    effortFlag: "--reasoning-effort",
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
    // Local models. `ollama run` answers/chats but cannot edit files; use Aider/Cline pointed at Ollama for coding.
    kind: "ollama",
    label: "Ollama (local)",
    type: "cli",
    command: 'ollama run {model} "{task}"',
    models: [],
    defaultModel: "",
    maxParallel: 1,
    maxSessionsPerWindow: 0,
    windowMinutes: 60,
    minSpacingSeconds: 0
  },
  {
    // Local models driven by Aider, which can edit files (unlike plain `ollama run`).
    kind: "ollama-aider",
    label: "Aider + Ollama (local, edits files)",
    type: "cli",
    command: 'aider {model_args} --message "{task}" "{ticket_path}"',
    modelFlag: "--model",
    resumeCommand: 'aider {model_args} --restore-chat-history --message "{task}" "{ticket_path}"',
    models: [],
    defaultModel: "",
    maxParallel: 1,
    maxSessionsPerWindow: 0,
    windowMinutes: 60,
    minSpacingSeconds: 0
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
  ollama: "ollama",
  "ollama-aider": "ollama-aider",
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
    defaultReasoning: ["none", "minimal", "low", "medium", "high", "xhigh", "max"].includes(String(raw?.defaultReasoning)) ? String(raw.defaultReasoning) : "",
    trustFlag: raw?.trustFlag !== void 0 ? String(raw.trustFlag).trim() || void 0 : getPreset(kind).trustFlag,
    effortFlag: raw?.effortFlag !== void 0 ? String(raw.effortFlag).trim() || void 0 : getPreset(kind).effortFlag,
    pinnedModels: Array.isArray(raw?.pinnedModels) ? raw.pinnedModels.map((m) => String(m).trim()).filter(Boolean) : [],
    listCommand: raw?.listCommand ? String(raw.listCommand).slice(0, 300) : void 0,
    agentic: raw?.agentic !== void 0 ? !!raw.agentic : kind !== "ollama" && kind !== "ide-chat",
    budgetDaily: Math.max(0, Number(raw?.budgetDaily) || 0),
    budgetWeekly: Math.max(0, Number(raw?.budgetWeekly) || 0),
    budgetMonthly: Math.max(0, Number(raw?.budgetMonthly) || 0),
    modelTiers: raw?.modelTiers ? String(raw.modelTiers).slice(0, 400) : void 0,
    resumeCommand: raw?.resumeCommand !== void 0 ? String(raw.resumeCommand).trim() || void 0 : preset.resumeCommand,
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
    roles: kind === "ide-chat" || kind === "ollama" ? ["worker"] : ["worker", "reviewer"]
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
var OLD_CLAUDE_COMMAND = 'claude {model_args} -p "{task}"';
function migrateProvider(raw) {
  if (raw?.kind === "claude-code" && raw.command === OLD_CLAUDE_COMMAND) {
    const preset = getPreset("claude-code");
    return { ...raw, command: preset.command, resumeCommand: raw.resumeCommand || preset.resumeCommand };
  }
  return raw;
}
var ProviderRegistry = class {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
    this.filePath = path6.join(workspaceRoot, ".agentic-kanban", "providers.json");
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
      const raw = JSON.parse(fs4.readFileSync(this.filePath, "utf8"));
      const list = Array.isArray(raw) ? raw : raw?.providers || [];
      const ids = [];
      this.providers = list.map((r) => {
        const p = sanitizeProvider(migrateProvider(r), ids);
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
  /** Applies a detection result to one provider: fills a missing path, and refreshes models for Ollama. */
  applyDetection(id, d) {
    const p = this.providers.find((x) => x.id === id);
    if (!p)
      return void 0;
    const next = { ...p };
    if (d.path && !p.path)
      next.path = d.path;
    if (d.models && d.models.length) {
      next.models = d.models;
      if (!d.models.includes(p.defaultModel))
        next.defaultModel = d.models[0];
    }
    return this.upsert(next);
  }
  /** Adds a provider for every detected tool that has none yet. Returns the new providers. */
  addDetected(found) {
    const added = [];
    for (const d of found) {
      if (this.providers.some((p2) => p2.kind === d.kind))
        continue;
      const p = createProvider(d.kind, this.providers);
      this.providers.push(p);
      added.push(this.applyDetection(p.id, d) || p);
    }
    if (added.length)
      this.save();
    return added;
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
    fs4.mkdirSync(path6.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs4.writeFileSync(tmp, JSON.stringify({ version: 1, providers: this.providers }, null, 2), "utf8");
    fs4.renameSync(tmp, this.filePath);
    this.listeners.forEach((fn) => fn());
  }
};

// src/fleet/sessions.ts
var fs5 = __toESM(require("fs"));
var path7 = __toESM(require("path"));

// src/fleet/cost.ts
function ticketPoints(t) {
  const e = (t.estimate || "").trim().toLowerCase();
  if (/^(xs|s\b|small)/.test(e))
    return 1;
  if (/^(xl|extra)/.test(e))
    return 13;
  if (/^(l\b|large)/.test(e))
    return 8;
  if (/^(m\b|medium)/.test(e))
    return 3;
  return 3;
}
var TOKENS_PER_POINT = { input: 6e4, output: 8e3 };
var CACHED_SHARE = 0.7;
function estimateCost(pricing, points) {
  if (!pricing || pricing.free)
    return 0;
  const inTok = TOKENS_PER_POINT.input * points;
  const outTok = TOKENS_PER_POINT.output * points;
  const inPrice = pricing.inPerM ?? 0;
  const cachedPrice = pricing.cachedPerM ?? inPrice;
  const inCost = (inTok * (1 - CACHED_SHARE) * inPrice + inTok * CACHED_SHARE * cachedPrice) / 1e6;
  return inCost + outTok * (pricing.outPerM ?? 0) / 1e6;
}
function periodStart(period, now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (period === "week") {
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
  } else if (period === "month") {
    d.setDate(1);
  }
  return d.getTime();
}
function periodEnd(period, now) {
  const d = new Date(periodStart(period, now));
  if (period === "day")
    d.setDate(d.getDate() + 1);
  else if (period === "week")
    d.setDate(d.getDate() + 7);
  else
    d.setMonth(d.getMonth() + 1);
  return d.getTime();
}
var PERIODS = ["day", "week", "month"];
function budgetOf(p, period) {
  return period === "day" ? p.budgetDaily : period === "week" ? p.budgetWeekly : p.budgetMonthly;
}

// src/fleet/sessions.ts
var QUICK_FAIL_MS = 2e4;
var COOLDOWN_BASE_MIN = 5;
var COOLDOWN_MAX_MIN = 30;
var DEFAULT_SESSION_TIMEOUT_MIN = 180;
var JsonFleetStore = class {
  constructor(file) {
    this.file = file;
  }
  load() {
    try {
      const raw = JSON.parse(fs5.readFileSync(this.file, "utf8"));
      return {
        starts: raw?.starts && typeof raw.starts === "object" ? raw.starts : {},
        sessions: Array.isArray(raw?.sessions) ? raw.sessions : [],
        blocks: raw?.blocks && typeof raw.blocks === "object" ? raw.blocks : {},
        spend: Array.isArray(raw?.spend) ? raw.spend : []
      };
    } catch {
      return { starts: {}, sessions: [] };
    }
  }
  save(data) {
    try {
      fs5.mkdirSync(path7.dirname(this.file), { recursive: true });
      const tmp = this.file + ".tmp";
      fs5.writeFileSync(tmp, JSON.stringify(data), "utf8");
      fs5.renameSync(tmp, this.file);
    } catch {
    }
  }
};
var SessionManager = class {
  constructor(getProvider, launcher, store, clock = Date.now, sessionTimeoutMinutes = DEFAULT_SESSION_TIMEOUT_MIN) {
    this.getProvider = getProvider;
    this.launcher = launcher;
    this.store = store;
    this.clock = clock;
    this.sessionTimeoutMinutes = sessionTimeoutMinutes;
    const saved = store ? store.load() : { starts: {}, sessions: [] };
    this.starts = saved.starts;
    this.blocks = saved.blocks || {};
    this.spend = saved.spend || [];
    for (const s of saved.sessions || []) {
      if (s.status === "running" || s.status === "queued") {
        s.interruptKind = s.status === "queued" ? "queued-lost" : "host-closed";
        s.note = s.status === "queued" ? "Was queued when the editor closed" : "Interrupted: the editor or PC closed while this agent was running";
        s.status = "interrupted";
        s.endedAt = this.clock();
      }
      this.sessions.push(s);
    }
    if (saved.sessions?.some((x) => x.status === "interrupted"))
      this.persist();
  }
  sessions = [];
  payloads = /* @__PURE__ */ new Map();
  starts;
  blocks = {};
  spend = [];
  cooldownUntil = /* @__PURE__ */ new Map();
  quickFails = /* @__PURE__ */ new Map();
  listeners = [];
  seq = 0;
  persist() {
    this.store?.save({ starts: this.starts, sessions: this.sessions, blocks: this.blocks, spend: this.spend });
  }
  onChange(fn) {
    this.listeners.push(fn);
  }
  emit() {
    this.persist();
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
    const key = path7.resolve(ticketPath).toLowerCase();
    return this.active().find((s) => path7.resolve(s.ticketPath).toLowerCase() === key);
  }
  startsInWindow(p, now) {
    const since = now - p.windowMinutes * 6e4;
    return (this.starts[p.id] || []).filter((t) => t > since);
  }
  /** Can this provider start another session right now? Never throws. */
  canStart(p, now = this.clock(), estCost = 0) {
    if (!p.enabled)
      return { ok: false, state: "disabled", reason: "Provider is disabled" };
    const cd = this.cooldownUntil.get(p.id) || 0;
    if (cd > now) {
      return { ok: false, state: "cooldown", reason: "Cooling down after a failed start (possible rate limit)", retryAt: cd };
    }
    if (p.models.length && p.models.every((m) => this.modelBlock(p.id, m, now))) {
      const untils = p.models.map((m) => this.modelBlock(p.id, m, now).until);
      return { ok: false, state: "throttled", reason: "Every model is at its usage limit", retryAt: Math.min(...untils) };
    }
    for (const period of PERIODS) {
      const cap = budgetOf(p, period);
      if (cap <= 0)
        continue;
      const allowed = cap * (1 - p.safetyMarginPct / 100);
      const spent = this.spentSince(p.id, periodStart(period, now));
      if (spent + estCost > allowed && (spent > 0 || estCost > allowed)) {
        const label = period === "day" ? "Daily" : period === "week" ? "Weekly" : "Monthly";
        return {
          ok: false,
          state: "throttled",
          reason: `${label} budget reached ($${spent.toFixed(2)} of $${cap.toFixed(2)} used${estCost ? `, this run ~$${estCost.toFixed(2)}` : ""})`,
          retryAt: periodEnd(period, now)
        };
      }
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
  // ---------------------------------------------------------------- spend & windows
  spentSince(providerId, since) {
    return this.spend.filter((e) => e.providerId === providerId && e.at >= since).reduce((sum, e) => sum + e.cost, 0);
  }
  recordSpend(providerId, model, cost, sessionId) {
    if (!(cost > 0))
      return;
    this.spend.push({ providerId, model, cost, at: this.clock(), sessionId });
    const keep = this.clock() - 65 * 24 * 60 * 6e4;
    this.spend = this.spend.filter((e) => e.at >= keep);
    this.persist();
  }
  /** Start times inside the provider's rolling window (oldest first). */
  windowStarts(p, now = this.clock()) {
    return this.startsInWindow(p, now).sort((a, b) => a - b);
  }
  runningCount(providerId) {
    return this.sessions.filter((s) => s.providerId === providerId && s.status === "running").length;
  }
  // ---------------------------------------------------------------- model usage limits
  blockKey(providerId, model) {
    return `${providerId}::${model}`;
  }
  /** Active block for this model, if any. Expired blocks are dropped lazily. */
  modelBlock(providerId, model, now = this.clock()) {
    const key = this.blockKey(providerId, model);
    const b = this.blocks[key];
    if (!b)
      return void 0;
    if (b.until <= now) {
      delete this.blocks[key];
      return void 0;
    }
    return b;
  }
  blockedModels(providerId, now = this.clock()) {
    const prefix = `${providerId}::`;
    return Object.keys(this.blocks).filter((k) => k.startsWith(prefix)).map((k) => ({ model: k.slice(prefix.length), b: this.modelBlock(providerId, k.slice(prefix.length), now) })).filter((x) => !!x.b).map((x) => ({ model: x.model, until: x.b.until, unknown: x.b.unknown }));
  }
  /** Block a model until its reset time; with no known reset it is assumed back after `assumeMinutes` and re-probed. */
  blockModel(providerId, model, resetAt, assumeMinutes = 30) {
    const now = this.clock();
    const block = resetAt && resetAt > now ? { until: resetAt, unknown: false } : { until: now + assumeMinutes * 6e4, unknown: true };
    this.blocks[this.blockKey(providerId, model)] = block;
    this.persist();
    return block;
  }
  /** A running session reported a usage limit: stop tracking it as running and remember the model is exhausted. */
  limitHit(id, info) {
    const s = this.get(id);
    if (!s || s.status !== "running" && s.status !== "queued")
      return void 0;
    const model = info.model || s.model;
    const block = this.blockModel(s.providerId, model, info.resetAt);
    s.limit = { model, resetAt: info.resetAt };
    s.resumeAfter = info.resetAt;
    this.interrupt(id, "usage-limit", `Usage limit reached${model ? ` on ${model}` : ""}${info.excerpt ? `: ${info.excerpt}` : ""}`);
    return block;
  }
  setAttention(id, text) {
    const s = this.get(id);
    if (!s || s.attention === text)
      return;
    s.attention = text;
    this.emit();
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
      blockedModels: this.blockedModels(p.id, now),
      spend: {
        day: this.spentSince(p.id, periodStart("day", now)),
        week: this.spentSince(p.id, periodStart("week", now)),
        month: this.spentSince(p.id, periodStart("month", now))
      },
      budget: { day: p.budgetDaily, week: p.budgetWeekly, month: p.budgetMonthly },
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
      queuedAt: now,
      agentSessionId: req.agentSessionId,
      attempt: req.attempt ?? 1,
      resumedFrom: req.resumedFrom,
      hidden: req.hidden,
      cwd: req.cwd,
      reasoning: req.reasoning,
      points: req.points,
      estCost: req.estCost,
      estMinutes: req.estMinutes
    };
    this.sessions.push(session);
    this.payloads.set(session.id, { req });
    const check2 = this.canStart(req.provider, now, req.estCost || 0);
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
    if (session.estCost)
      this.recordSpend(provider.id, session.model, session.estCost, session.id);
    this.trimHistory(provider, now);
    this.persist();
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
  ended(sessionId, exitCode, note, terminalClosed = false) {
    const s = this.get(sessionId);
    if (!s || s.status !== "running" && s.status !== "queued")
      return;
    const now = this.clock();
    const quick = s.startedAt !== void 0 && now - s.startedAt < QUICK_FAIL_MS;
    if (exitCode === void 0 && terminalClosed) {
      this.interrupt(s.id, "user-closed", note || "Terminal closed before the agent finished");
      return;
    }
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
  /** Marks a live session interrupted (resumable). Does not touch the terminal. */
  interrupt(id, kind, note) {
    const s = this.get(id);
    if (!s || s.status !== "running" && s.status !== "queued")
      return;
    s.status = "interrupted";
    s.interruptKind = kind;
    s.endedAt = this.clock();
    if (note)
      s.note = note;
    this.payloads.delete(s.id);
    this.emit();
    void this.pump();
  }
  /** Editor is closing: everything still live becomes resumable on the next start. */
  shutdown() {
    for (const s of this.sessions.filter((x) => x.status === "running" || x.status === "queued")) {
      s.status = "interrupted";
      s.interruptKind = s.startedAt ? "host-closed" : "queued-lost";
      s.endedAt = this.clock();
      s.note = "Interrupted: the editor closed while this agent was running";
    }
    this.persist();
  }
  /** Sessions the user can pick up again: interrupted or failed, and not already resumed. */
  resumable() {
    return this.sessions.filter((s) => (s.status === "interrupted" || s.status === "failed") && !s.resumedBy);
  }
  markResumed(oldId, newId) {
    const s = this.get(oldId);
    if (s) {
      s.resumedBy = newId;
      this.emit();
    }
  }
  /** Dismiss an interrupted/failed session ("it was actually done"): hides Resume without running anything. */
  dismiss(id) {
    const s = this.get(id);
    if (s && (s.status === "interrupted" || s.status === "failed")) {
      s.status = "finished";
      s.note = (s.note ? s.note + " \xB7 " : "") + "Dismissed";
      this.emit();
    }
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
    const keepRecoverable = this.clock() - 7 * 24 * 60 * 6e4;
    this.sessions = this.sessions.filter((s) => s.status === "running" || s.status === "queued" || (s.endedAt || 0) > cutoff || (s.status === "interrupted" || s.status === "failed") && !s.resumedBy && (s.endedAt || 0) > keepRecoverable);
    if (this.sessions.length !== before)
      this.emit();
  }
};

// src/fleet/catalog.ts
var ESTIMATED_OUT_PER_M = { 1: 0, 2: 1.5, 3: 6, 4: 15, 5: 30 };
function estimatePricing(tier, local) {
  if (local)
    return { free: true, inPerM: 0, outPerM: 0, source: "estimated" };
  const out = ESTIMATED_OUT_PER_M[tier] ?? 6;
  return { inPerM: out / 5, cachedPerM: out / 50, outPerM: out, source: "estimated" };
}

// src/fleet/speed.ts
function priorTps(tier, local, sizeB, benchTps) {
  if (benchTps && benchTps > 0)
    return benchTps;
  if (local) {
    const b = sizeB ?? 8;
    return b <= 4 ? 40 : b <= 9 ? 25 : b <= 16 ? 14 : b <= 40 ? 6 : 3;
  }
  return tier <= 1 ? 200 : tier === 2 ? 180 : tier === 3 ? 110 : tier === 4 ? 75 : 45;
}
function priorMinutes(points, tps) {
  const generation = TOKENS_PER_POINT.output * points / tps / 60;
  return generation + 2 + points;
}

// src/fleet/reasoning.ts
var REASONING_LEVELS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];
var REASONING_FACTOR = { none: 0.55, minimal: 0.65, low: 0.75, medium: 1, high: 1.4, xhigh: 1.9, max: 2.5 };
function isLevel(v) {
  return !!v && REASONING_LEVELS.includes(v);
}
var order = (l) => REASONING_LEVELS.indexOf(l);
function supportedLevels(provider, entry) {
  const variants = Object.keys(entry?.effortVariants || {}).filter(isLevel);
  if (variants.length >= 2)
    return variants.sort((a, b) => order(a) - order(b));
  if (provider.effortFlag)
    return ["low", "medium", "high", "xhigh", "max"];
  return [];
}
function pickReasoning(ticket, provider, entry, objective = "balanced") {
  const levels = supportedLevels(provider, entry);
  if (!levels.length)
    return "";
  const label = (ticket.labels || []).map((l) => l.replace(/[`\s]/g, "")).find((l) => /^reasoning:/i.test(l));
  if (label) {
    const wanted = label.split(":")[1].toLowerCase();
    if (levels.includes(wanted))
      return wanted;
  }
  const baseline = isLevel(provider.defaultReasoning) && levels.includes(provider.defaultReasoning) ? provider.defaultReasoning : levels.includes("medium") ? "medium" : levels[Math.floor(levels.length / 2)];
  let shift = 0;
  const need = requiredTier(ticket);
  if (need >= 5)
    shift += 2;
  else if (need === 4)
    shift += 1;
  if (priorityRank(ticket.priority) === 3 || /^(xs|s\b|small)/i.test(ticket.estimate || ""))
    shift -= 1;
  if (priorityRank(ticket.priority) === 0)
    shift += 1;
  if (/^(l|xl|large)\b/i.test(ticket.estimate || ""))
    shift += 1;
  if (objective === "cost" || objective === "speed")
    shift -= 1;
  shift = Math.max(-2, Math.min(2, shift));
  const idx = Math.max(0, Math.min(levels.length - 1, levels.indexOf(baseline) + shift));
  return levels[idx];
}
function resolveReasoning(provider, entry, model, level) {
  if (!level || !isLevel(level))
    return { model, level: "" };
  const variants = entry?.effortVariants || {};
  if (variants[level])
    return { model: variants[level], level };
  if (provider.effortFlag)
    return { model, effort: level, level };
  return { model, level: "" };
}

// src/fleet/optimizer.ts
var OBJECTIVES = {
  balanced: { timeValuePerMin: 0.2, quotaValue: 50 },
  cost: { timeValuePerMin: 0.05, quotaValue: 50 },
  speed: { timeValuePerMin: 1, quotaValue: 20 }
};
var MAX_WAIT_MIN = 8 * 60;
var pow2 = (x) => x * x;
function quotaPressure(p, sessions, now) {
  let lambdaCount = 0;
  let share = 0;
  if (p.maxSessionsPerWindow > 0) {
    const starts = sessions.windowStarts(p, now);
    const windowMs = p.windowMinutes * 6e4;
    const remaining = Math.max(0, 1 - starts.length / p.maxSessionsPerWindow);
    const timeLeft = starts.length ? Math.min(1, Math.max(0, (starts[0] + windowMs - now) / windowMs)) : 1;
    lambdaCount = remaining <= 1e-3 ? 10 : Math.min(10, pow2(timeLeft / remaining));
    share = 1 / p.maxSessionsPerWindow;
  }
  let lambdaBudget = 0;
  for (const period of PERIODS) {
    const cap = budgetOf(p, period);
    if (cap <= 0)
      continue;
    const start = periodStart(period, now);
    const end = periodEnd(period, now);
    const remaining = Math.max(0, 1 - sessions.spentSince(p.id, start) / cap);
    const timeLeft = (end - now) / (end - start);
    lambdaBudget = Math.max(lambdaBudget, remaining <= 1e-3 ? 10 : Math.min(10, pow2(timeLeft / remaining)));
  }
  return { lambdaCount, lambdaBudget, share };
}
function estimateRun(ticket, p, model, ctx, level = "") {
  const points = ticketPoints(ticket);
  const entry = ctx.catalog.get(p.id, model);
  const local = entry ? entry.local : p.kind === "ollama" || p.kind === "ollama-aider";
  const hasOverride = parseTierOverrides(p.modelTiers)[model.toLowerCase()] !== void 0;
  const tier = entry && !hasOverride ? entry.tier : modelTier(p, model);
  const pricing = ctx.catalog.pricingFor(p.id, model) || entry?.pricing || estimatePricing(tier, local);
  const factor = REASONING_FACTOR[level] ?? 1;
  const tps = priorTps(tier, local, entry?.sizeB, ctx.bench?.[`${p.id}::${model}`]?.tps);
  return {
    points,
    tier,
    local,
    estCost: estimateCost(pricing, points) * factor,
    estMinutes: ctx.speed.predict(p.id, model, points, priorMinutes(points, tps)) * factor
  };
}
function candidateModels(p, catalog) {
  const fromCatalog = catalog.visible(p.id).map((m) => m.id);
  const ids = fromCatalog.length ? fromCatalog : p.models.length ? p.models : [p.defaultModel];
  return [.../* @__PURE__ */ new Set([...ids, ...p.pinnedModels || []])];
}
function rankOptions(ticket, providers, sessions, ctx, restrictTo) {
  const now = ctx.now ?? Date.now();
  const w = { ...OBJECTIVES[ctx.objective || "balanced"], ...ctx.weights || {} };
  const points = ticketPoints(ticket);
  const needed = requiredTier(ticket);
  const options = [];
  for (const p of restrictTo ? [restrictTo] : providers) {
    const pressure = quotaPressure(p, sessions, now);
    for (const model of candidateModels(p, ctx.catalog)) {
      if (sessions.modelBlock(p.id, model, now))
        continue;
      const entry = ctx.catalog.get(p.id, model);
      const wanted = pickReasoning(ticket, p, entry, ctx.objective || "balanced");
      const resolved = resolveReasoning(p, entry, model, wanted);
      if (resolved.model !== model && sessions.modelBlock(p.id, resolved.model, now))
        continue;
      const run = estimateRun(ticket, p, resolved.model, ctx, resolved.level);
      const { tier, estCost, estMinutes } = run;
      if (tier < needed)
        continue;
      const check2 = sessions.canStart(p, now, estCost);
      const virtual = ctx.virtualSpent?.get(p.id) || 0;
      let waitMinutes = 0;
      if (!check2.ok) {
        waitMinutes = check2.retryAt ? Math.max(0, (check2.retryAt - now) / 6e4) : estMinutes / 2;
      } else if (sessions.headroom(p, now) - virtual <= 0) {
        waitMinutes = estMinutes / 2;
      }
      if (waitMinutes > MAX_WAIT_MIN)
        continue;
      const lambda = Math.max(pressure.lambdaCount, pressure.lambdaBudget);
      const timeCost = (estMinutes + waitMinutes) * w.timeValuePerMin;
      const moneyCost = estCost * (1 + pressure.lambdaBudget);
      const quotaCost = pressure.lambdaCount * pressure.share * w.quotaValue;
      const score = timeCost + moneyCost + quotaCost;
      const startsNow = waitMinutes === 0;
      options.push({
        provider: p,
        model: resolved.model,
        tier,
        points,
        estMinutes,
        estCost,
        reasoning: resolved.level,
        effort: resolved.effort,
        waitMinutes,
        lambda,
        score,
        startsNow,
        summary: `${p.name}${resolved.model ? " \xB7 " + resolved.model : ""}${resolved.level && !resolved.model.endsWith(resolved.level) ? " (" + resolved.level + ")" : ""}: ~${Math.round(estMinutes)} min${estCost > 0 ? `, ~$${estCost.toFixed(2)}` : ", free"}${waitMinutes > 0 ? `, starts in ~${Math.round(waitMinutes)} min` : ""}${lambda > 0.5 ? `, quota ${lambda >= 2 ? "scarce" : "tight"}` : ""}`
      });
    }
  }
  return options.sort((a, b) => a.score - b.score);
}

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
  return providers.filter((p) => p.enabled && p.type === "cli" && p.agentic && p.roles.includes("worker"));
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
function availableModel(provider, wanted, sessions, now) {
  if (!wanted || !sessions.modelBlock(provider.id, wanted, now))
    return wanted;
  return provider.models.find((m) => !sessions.modelBlock(provider.id, m, now)) ?? wanted;
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
    if (opts.optimizer) {
      if (requested && !workers.includes(requested))
        continue;
      if (!requested && t.assignee && !/^(unassigned|\u2014|-)$/i.test(t.assignee.trim()))
        continue;
      const ranked = rankOptions(t, workers, sessions, { ...opts.optimizer, now, virtualSpent: spent }, requested);
      const best = ranked[0];
      if (!best)
        continue;
      if (best.startsNow)
        spent.set(best.provider.id, (spent.get(best.provider.id) || 0) + 1);
      out.push({
        ticketPath: t.path,
        ticketId: t.id,
        title: t.title,
        boardId: c.boardId,
        providerId: best.provider.id,
        providerName: best.provider.name,
        model: best.model,
        startsNow: best.startsNow,
        reason: (requested ? `Assigned to ${requested.name}. ` : "Best time/cost/quota trade-off. ") + best.summary,
        estMinutes: best.estMinutes,
        estCost: best.estCost,
        points: best.points,
        reasoning: best.reasoning,
        alternatives: ranked.slice(1, 4).map((o) => o.summary)
      });
      continue;
    }
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
      model: availableModel(chosen, modelFor(chosen, t), sessions, now),
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

// src/fleet/limits.ts
var ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[()][A-Za-z0-9]|\u001b[=>]/g;
function stripAnsi(text) {
  return text.replace(ANSI, "").replace(/\r(?!\n)/g, "\n");
}
var LIMIT_RE = new RegExp(
  [
    "usage limit",
    "rate[- ]limit",
    "quota (?:exceeded|exhausted|reached)",
    "limit (?:reached|exceeded)",
    "hit your (?:usage |weekly |daily |5-hour |session )?limit",
    "out of (?:credits|usage|quota)",
    "too many requests",
    "(?:http|status|error|code)\\D{0,12}429",
    "resource[_ ]exhausted",
    "insufficient[_ ]quota"
  ].join("|"),
  "i"
);
function nextClockTime(hour, minute, meridiem, now) {
  let h = hour;
  if (meridiem) {
    const pm = /p/i.test(meridiem);
    h = h % 12 + (pm ? 12 : 0);
  }
  const d = new Date(now);
  d.setHours(h, minute, 0, 0);
  if (d.getTime() <= now)
    d.setDate(d.getDate() + 1);
  return d.getTime();
}
function parseReset(window, now) {
  const epoch = window.match(/limit reached\|(\d{10})/i);
  if (epoch)
    return Number(epoch[1]) * 1e3;
  const phrase = /\b(?:in|after|retry[- ]after:?)\s+(\d[^.\n]{0,40})/gi;
  let pm;
  while ((pm = phrase.exec(window)) !== null) {
    const p = pm[1];
    const h = p.match(/(\d+(?:\.\d+)?)\s*(?:h|hrs?|hours?)\b/i);
    const mi = p.match(/(\d+)\s*(?:m|mins?|minutes?)\b/i);
    const se = p.match(/(\d+)\s*(?:s|secs?|seconds?)\b/i);
    const ms = ((h ? Number(h[1]) * 3600 : 0) + (mi ? Number(mi[1]) * 60 : 0) + (se ? Number(se[1]) : 0)) * 1e3;
    if (ms > 0)
      return now + ms;
  }
  const clock = window.match(/resets?(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (clock && (clock[3] || clock[2] || Number(clock[1]) > 12)) {
    return nextClockTime(Number(clock[1]), Number(clock[2] || 0), clock[3], now);
  }
  return void 0;
}
function detectLimit(text, models = [], now = Date.now()) {
  const clean = stripAnsi(text);
  const m = LIMIT_RE.exec(clean);
  if (!m)
    return null;
  const start = Math.max(0, m.index - 120);
  const around = clean.slice(start, m.index + 260);
  const lower = around.toLowerCase();
  const model = [...models].sort((a, b) => b.length - a.length).find((x) => x && lower.includes(x.toLowerCase()));
  return {
    resetAt: parseReset(clean.slice(m.index, m.index + 260), now),
    model,
    excerpt: clean.slice(Math.max(0, m.index - 20), m.index + 140).replace(/\s+/g, " ").trim()
  };
}
function detectFatal(text) {
  const clean = stripAnsi(text);
  const rules = [
    {
      re: /(?:refusing to run in an )?untrusted workspace|workspace (?:is )?not trusted|trust this (?:folder|workspace|directory)/i,
      kind: "workspace-trust",
      message: "The agent refuses to run in a folder it does not trust. Open the agent interactively in that folder once to trust it (or turn off workspace trust in the agent's config)."
    },
    {
      re: /not (?:logged|signed) in|please (?:log ?in|sign ?in)|authentication (?:required|failed)|invalid (?:api key|token)|\b401 unauthorized/i,
      kind: "auth",
      message: "The agent is not signed in (or its token expired). Sign in from its terminal, then resume."
    },
    {
      re: /is not recognized as an internal or external command|command not found|no such file or directory.*(?:devin|claude|gemini|agy|copilot|codex|aider)|cannot find the path specified/i,
      kind: "missing-cli",
      message: "The agent command was not found. Check the executable path in Agent Providers (use Detect)."
    }
  ];
  for (const r of rules) {
    const m = r.re.exec(clean);
    if (m)
      return { kind: r.kind, message: r.message, excerpt: clean.slice(Math.max(0, m.index - 10), m.index + 140).replace(/\s+/g, " ").trim() };
  }
  return null;
}
var ATTENTION_RE = [
  /\(y\/n\)|\[y\/n\]|\[yes\/no\]/i,
  /do you want to (?:proceed|continue|allow|make this edit|run)/i,
  /press (?:enter|any key)/i,
  /waiting for (?:your )?(?:input|approval|confirmation|response)/i,
  /(?:permission|approval) (?:required|needed)/i,
  /(?:please )?(?:log ?in|sign ?in|authenticate)\b.*(?:required|first|to continue)/i,
  /enter (?:a |your )?(?:password|passphrase|token|api key|code)/i,
  /(?:choose|select) an option/i
];
function detectAttention(text) {
  const lines = stripAnsi(text).split("\n").map((l) => l.trim()).filter(Boolean).slice(-12);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (ATTENTION_RE.some((re) => re.test(lines[i])))
      return lines[i].slice(0, 140);
  }
  return void 0;
}
function parseTierOverrides(text) {
  const out = {};
  for (const part of (text || "").split(/[,\n]/)) {
    const m = part.trim().match(/^(.+?)\s*[=:]\s*([1-5])$/);
    if (m)
      out[m[1].trim().toLowerCase()] = Number(m[2]);
  }
  return out;
}
function modelTier(provider, model) {
  const name = (model || provider.defaultModel || "").toLowerCase();
  const over = parseTierOverrides(provider.modelTiers);
  if (over[name] !== void 0)
    return over[name];
  const size = name.match(/(\d+(?:\.\d+)?)b\b/);
  if (size) {
    const b = Number(size[1]);
    return b <= 4 ? 1 : b <= 9 ? 2 : b <= 40 ? 3 : b < 100 ? 4 : 5;
  }
  if (/haiku|flash|(?:^|[-_ :])mini|nano|lite|small|instant/.test(name))
    return 2;
  if (/fable|opus|gpt-?5|o3|o1|ultra|gemini.*pro|deepseek-r1/.test(name))
    return 5;
  if (/sonnet|gpt-?4|codex|codestral|devstral|coder/.test(name))
    return 4;
  return 3;
}
function requiredTier(ticket) {
  let req = 2;
  const rank = priorityRank(ticket.priority);
  if (rank === 0)
    req = 4;
  else if (rank === 1)
    req = 3;
  if (/architect|security|migration|refactor/i.test(ticket.type || ""))
    req = Math.max(req, 4);
  if (/^(l|xl|large)\b/i.test(ticket.estimate || ""))
    req += 1;
  if ((ticket.labels || []).some((l) => /complex|hard/i.test(l)))
    req = Math.max(req, 4);
  return Math.min(5, req);
}
function pickFallback(providers, sessions, from, ticket, now = Date.now()) {
  const origin = providers.find((p) => p.id === from.providerId);
  const originTier = origin ? modelTier(origin, from.model) : 5;
  const needed = Math.min(requiredTier(ticket), originTier);
  const role = from.role === "orchestrator" ? "worker" : from.role;
  const options = [];
  for (const p of providers) {
    if (!p.enabled || p.type !== "cli" || !p.agentic || !p.roles.includes(role))
      continue;
    if (sessions.headroom(p, now) <= 0 && p.id !== from.providerId)
      continue;
    const models = p.models.length ? p.models : [p.defaultModel];
    for (const model of models) {
      if (p.id === from.providerId && model === from.model)
        continue;
      if (sessions.modelBlock(p.id, model, now))
        continue;
      const tier = modelTier(p, model);
      if (tier < needed)
        continue;
      options.push({ provider: p, model, tier, sameProvider: p.id === from.providerId, pct: sessions.usage(p, now).pct ?? 0 });
    }
  }
  options.sort((a, b) => a.tier - b.tier || Number(b.sameProvider) - Number(a.sameProvider) || a.pct - b.pct);
  const best = options[0];
  return best ? { provider: best.provider, model: best.model, tier: best.tier, sameProvider: best.sameProvider } : null;
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
    path: path8.join(os3.tmpdir(), "Tickets", "Backlog", "Ready", "t-1.md"),
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
  const root = path8.join(os3.tmpdir(), "board");
  check(isInside(root, path8.join(root, "Backlog", "a.md")), "child path is inside");
  check(!isInside(root, root + "2"), "sibling with shared prefix is NOT inside");
  check(safeJoin(root, "Backlog", "Ready") === path8.join(root, "Backlog", "Ready"), "safeJoin accepts normal names");
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
  const cmd = AgentRunner.formatCliCommand(evilTicket, agent, os3.tmpdir(), void 0, "body", {
    shell: "powershell",
    model: "opus",
    modelFlag: "--model"
  });
  check(cmd.startsWith('claude --model opus -p "'), "model_args expands to --model opus");
  check(cmd.includes("`$(calc)") && cmd.includes('`"now`"'), "ticket title is escaped inside the command");
  check(cmd.includes("{model}"), "placeholder-looking text in a ticket stays literal (single pass)");
  const badModel = AgentRunner.formatCliCommand(mkTicket(), agent, os3.tmpdir(), void 0, "b", {
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
  }, os3.tmpdir(), void 0, "b", { shell: "posix", model: "big", modelFlag: "-m" });
  check(appended.endsWith("-m big"), "model flag is appended when the template has no placeholder");
  console.log("\n--- ticket parser: replacement specials ---");
  const md = "# T\n\n| Field | Value |\n|---|---|\n| **Status** | Backlog | extra |\n| **Assignee** | Bob |\n";
  const st = TicketParser.updateTicketStatus(md, "Done $& $' end");
  check(st.includes("| **Status** | Done $& $' end | extra |"), "status keeps $-patterns literal and preserves trailing cells");
  const as = TicketParser.updateTicketAssignee(md, "Dev$`in");
  check(as.includes("| **Assignee** | Dev$`in |"), "assignee keeps $-patterns literal");
  console.log("\n--- providers ---");
  const tmp = fs6.mkdtempSync(path8.join(os3.tmpdir(), "fleet-"));
  const reg = new ProviderRegistry(tmp);
  const d1 = reg.add("devin", "Devin (work)");
  const d2 = reg.add("devin", "Devin (personal)");
  check(d1.id !== d2.id && reg.list().length === 2, "two providers of the same kind get distinct ids");
  const renamed = reg.upsert({ ...d1, name: "Devin \u2013 Acme", account: "work" });
  check(renamed.id === d1.id && reg.get(d1.id).name === "Devin \u2013 Acme", "rename keeps the id");
  check(new ProviderRegistry(tmp).list().length === 2, "registry persists to disk");
  const weird = sanitizeProvider({ kind: "claude-code", name: "  ", maxParallel: 999, safetyMarginPct: 99, models: ["a", "b"], defaultModel: "zzz" });
  check(weird.maxParallel === 32 && weird.safetyMarginPct === 50 && weird.defaultModel === "a", "sanitize clamps limits and fixes default model");
  const seeded = new ProviderRegistry(fs6.mkdtempSync(path8.join(os3.tmpdir(), "fleet-")));
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
    ticketPath: path8.join(tmp, `t${n}.md`),
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
    { ticket: mkTicket({ id: "L", path: path8.join(tmp, "l.md"), priority: "Low", mtime: 1 }), boardId: "b", boardRoot: tmp },
    { ticket: mkTicket({ id: "H", path: path8.join(tmp, "h.md"), priority: "P0", mtime: 2, labels: ["model:opus"] }), boardId: "b", boardRoot: tmp },
    { ticket: mkTicket({ id: "D", path: path8.join(tmp, "d.md"), priority: "P0", unresolvedDependencies: ["X"] }), boardId: "b", boardRoot: tmp },
    { ticket: mkTicket({ id: "N", path: path8.join(tmp, "n.md"), priority: "P1", assignee: "Bj\xF6rn" }), boardId: "b", boardRoot: tmp },
    { ticket: mkTicket({ id: "A", path: path8.join(tmp, "a.md"), priority: "P2", assignee: "Gemini" }), boardId: "b", boardRoot: tmp }
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
  console.log("\n--- auto-detect & ollama ---");
  const bin = fs6.mkdtempSync(path8.join(os3.tmpdir(), "bin-"));
  const exeName = process.platform === "win32" ? "claude.cmd" : "claude";
  fs6.writeFileSync(path8.join(bin, exeName), process.platform === "win32" ? "@echo off\r\n" : "#!/bin/sh\n");
  const fakeEnv = { PATH: "", PATHEXT: ".CMD;.EXE" };
  check(findExecutable(["claude"], fakeEnv, [bin]) === path8.join(bin, exeName), "findExecutable finds a CLI in an extra install folder");
  check(findExecutable(["claude"], { ...fakeEnv, PATH: bin }, []) === path8.join(bin, exeName), "findExecutable finds a CLI on PATH");
  check(findExecutable(["definitely-not-installed-xyz"], fakeEnv, [bin]) === void 0, "missing tools return undefined");
  check(JSON.stringify(parseOllamaList("NAME  ID  SIZE  MODIFIED\nllama3.2:3b  abc  2 GB  1 day ago\nqwen2.5-coder:7b  def  4 GB  2 days ago\n")) === '["llama3.2:3b","qwen2.5-coder:7b"]', "parses `ollama list` output");
  const srv = http2.createServer((req2, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ models: [{ name: "llama3.2:3b" }, { name: "codestral:22b" }] }));
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", () => r()));
  const port = srv.address().port;
  const models = await detectOllamaModels(`127.0.0.1:${port}`);
  srv.close();
  check(models.length === 2 && models[0] === "llama3.2:3b", "detects models from the Ollama HTTP API");
  check((await detectOllamaModels("127.0.0.1:1", path8.join(bin, "nonexistent"))).length === 0, "unreachable Ollama yields an empty list, not an error");
  const oreg = new ProviderRegistry(fs6.mkdtempSync(path8.join(os3.tmpdir(), "fleet-")));
  const addedP = oreg.addDetected([{ kind: "ollama", path: path8.join(bin, "ollama.exe"), models: ["llama3.2:3b", "codestral:22b"] }, { kind: "claude-code", path: path8.join(bin, exeName) }]);
  const oll = addedP.find((p) => p.kind === "ollama");
  check(addedP.length === 2 && oll.models.length === 2 && oll.defaultModel === "llama3.2:3b" && oll.path.includes("ollama"), "addDetected creates providers with path and detected models");
  check(oreg.addDetected([{ kind: "ollama", path: "x" }]).length === 0, "addDetected does not duplicate an existing kind");
  const keepPath = oreg.applyDetection(oll.id, { kind: "ollama", path: "other", models: ["phi4:14b"] });
  check(keepPath.path === oll.path && keepPath.defaultModel === "phi4:14b", "applyDetection keeps an existing path and fixes the default model");
  const ollCmd = AgentRunner.formatCliCommand(mkTicket({ title: "Say hi" }), providerToAssignee({ ...oll, path: void 0 }), os3.tmpdir(), void 0, "b", { shell: "posix", model: "llama3.2:3b", modelFlag: oll.modelFlag });
  check(ollCmd.startsWith('ollama run llama3.2:3b "'), 'ollama preset builds `ollama run <model> "<task>"`');
  const viaPath = AgentRunner.formatCliCommand(mkTicket(), providerToAssignee({ ...oll, path: "C:/Tools/ollama.exe" }), os3.tmpdir(), void 0, "b", { shell: "powershell", model: "m" });
  check(viaPath.startsWith('& "C:/Tools/ollama.exe" run m'), "a detected path replaces the bare tool name (PATH-independent)");
  const noSwap = AgentRunner.formatCliCommand(mkTicket(), { id: "x", name: "X", type: "agent", agentConfig: { type: "cli", command: 'othertool "{ticket_title}"', path: "C:/Tools/ollama.exe" } }, os3.tmpdir(), void 0, "b", { shell: "posix" });
  check(noSwap.startsWith("othertool "), "path is only substituted when it matches the command's tool name");
  const sm3 = new SessionManager(() => void 0, new FakeLauncher(), void 0, () => 1);
  check(planWork([{ ticket: mkTicket({ path: path8.join(tmp, "o.md") }), boardId: "b", boardRoot: tmp }], [oll], sm3, { now: 1 }).length === 0, "autopilot never hands tickets to answer-only Ollama");
  console.log("\n--- recovery: persisted sessions survive a restart ---");
  const storeFile = path8.join(tmp, "fleet-usage.json");
  let t0 = 1e7;
  const rp = { ...createProvider("claude-code", []), id: "rp", name: "RP", maxParallel: 3, maxSessionsPerWindow: 0, minSpacingSeconds: 0, models: ["opus", "sonnet", "haiku"], defaultModel: "opus" };
  const rmap = { rp };
  const smA = new SessionManager((id) => rmap[id], new FakeLauncher(), new JsonFleetStore(storeFile), () => t0);
  const run1 = await smA.request({ provider: rp, model: "opus", role: "worker", ticketPath: path8.join(tmp, "r1.md"), ticketId: "R1", ticketTitle: "R1", boardId: "b", payload: {}, agentSessionId: "aaaaaaaa-1111-2222-3333-444444444444", hidden: true });
  const queuedOnly = await smA.request({ provider: { ...rp, maxParallel: 1 }, model: "opus", role: "worker", ticketPath: path8.join(tmp, "r2.md"), ticketId: "R2", ticketTitle: "R2", boardId: "b", payload: {} });
  check(run1.status === "running" && queuedOnly.status === "queued", 'one session running, one queued before the "crash"');
  t0 += 5 * 6e4;
  const smB = new SessionManager((id) => rmap[id], new FakeLauncher(), new JsonFleetStore(storeFile), () => t0);
  const back = smB.get(run1.id);
  check(back.status === "interrupted" && back.interruptKind === "host-closed", "a session that was running comes back as interrupted (host-closed)");
  check(back.agentSessionId === "aaaaaaaa-1111-2222-3333-444444444444" && back.hidden === true, "its agent conversation id and background flag survive");
  check(smB.get(queuedOnly.id).interruptKind === "queued-lost", "a queued session is kept as interrupted too");
  check(smB.resumable().length === 2 && smB.active().length === 0, 'both are resumable and nothing is falsely "running"');
  smB.markResumed(run1.id, "new");
  check(smB.resumable().length === 1, "once resumed, a session stops offering Resume");
  smB.dismiss(queuedOnly.id);
  check(smB.get(queuedOnly.id).status === "finished" && smB.resumable().length === 0, "Dismiss removes it from the recovery list");
  const fresh = await smB.request({ provider: rp, model: "sonnet", role: "worker", ticketPath: path8.join(tmp, "r3.md"), ticketId: "R3", ticketTitle: "R3", boardId: "b", payload: {} });
  smB.ended(fresh.id, void 0, void 0, true);
  check(smB.get(fresh.id).status === "interrupted" && smB.get(fresh.id).interruptKind === "user-closed", 'a terminal closed without an exit code is "interrupted", never "finished"');
  const fresh2 = await smB.request({ provider: rp, model: "sonnet", role: "worker", ticketPath: path8.join(tmp, "r4.md"), ticketId: "R4", ticketTitle: "R4", boardId: "b", payload: {} });
  smB.shutdown();
  check(smB.get(fresh2.id).interruptKind === "host-closed", "shutdown() marks live sessions host-closed");
  check(new SessionManager((id) => rmap[id], new FakeLauncher(), new JsonFleetStore(storeFile), () => t0).get(fresh2.id).status === "interrupted", "shutdown state is persisted");
  console.log("\n--- usage limits: detection ---");
  const NOW = new Date(2026, 9, 23, 14, 0, 0).getTime();
  const esc27 = String.fromCharCode(27);
  const l1 = detectLimit("Claude AI usage limit reached|1760000000", ["opus"], NOW);
  check(!!l1 && l1.resetAt === 176e10, "parses the epoch reset time Claude Code prints");
  const l2 = detectLimit("You've hit your limit for Opus - resets 7pm (Europe/Stockholm)", ["opus", "sonnet"], NOW);
  check(!!l2 && l2.model === "opus" && new Date(l2.resetAt).getHours() === 19 && l2.resetAt > NOW, 'parses "resets 7pm" to the next 19:00 and finds the model');
  const l3 = detectLimit("Error: rate limit exceeded, try again in 2 hours 30 minutes", [], NOW);
  check(!!l3 && l3.resetAt === NOW + 150 * 6e4, 'parses relative "in 2 hours 30 minutes"');
  const l4 = detectLimit("HTTP error 429 Too Many Requests", [], NOW);
  check(!!l4 && l4.resetAt === void 0, "detects a limit with no reset time");
  const l5 = detectLimit(esc27 + "[31mQuota exceeded" + esc27 + "[0m for gemini-2.5-pro. Retry after 90s", ["gemini-2.5-pro"], NOW);
  check(!!l5 && l5.model === "gemini-2.5-pro" && l5.resetAt === NOW + 9e4, 'strips ANSI colour codes and reads "retry after 90s"');
  check(detectLimit("Compiled 429 files, no rate problems at all, all good", [], NOW) === null, "ordinary output (even containing 429) is not a limit");
  check(!!detectAttention("Do you want to proceed? (y/n)") && !!detectAttention("Press Enter to continue") && detectAttention("Reading src/index.ts") === void 0, "detects prompts that need a human");
  console.log("\n--- fatal setup errors (need a human, never retry) ---");
  const trustErr = "Error: Refusing to run in an untrusted workspace: C:\\Aptic\nStart `devin.exe` interactively in this directory to trust it, or set `respect_workspace_trust: false` in your config to restore the previous behavior.";
  const fa = detectFatal(trustErr);
  check(!!fa && fa.kind === "workspace-trust" && /trust/i.test(fa.message), `recognises Devin's "untrusted workspace" refusal`);
  check(detectFatal("Please log in first: run devin auth login")?.kind === "auth" && detectFatal("Error 401 Unauthorized")?.kind === "auth", "recognises a signed-out CLI");
  check(detectFatal("'agy' is not recognized as an internal or external command")?.kind === "missing-cli", "recognises a missing executable");
  check(detectFatal("Reading src/index.ts\nRunning tests... 12 passed") === null && detectFatal("I trusted the tests and signed the release notes") === null, "ordinary output is not flagged");
  console.log("\n--- workspace trust ---");
  const trustHome = fs6.mkdtempSync(path8.join(os3.tmpdir(), "home-"));
  fs6.mkdirSync(path8.join(trustHome, ".copilot"));
  const cfgFile = path8.join(trustHome, ".copilot", "config.json");
  fs6.writeFileSync(cfgFile, '// User settings belong in settings.json.\n// This file is managed automatically.\n{\n  "firstLaunchAt": "2026-08-21T12:55:20.970Z",\n  "trustedFolders": ["C:\\\\Aptic"],\n  "recentModelIds": ["kimi-k3"]\n}\n');
  const r1 = addCopilotTrustedFolder("C:\\Work\\Proj", trustHome);
  const txt = fs6.readFileSync(cfgFile, "utf8");
  check(r1.changed && txt.startsWith("// User settings belong in settings.json.\n// This file is managed automatically.\n"), "Copilot config: the folder is added and the comment header is kept");
  const parsed = JSON.parse(txt.split("\n").filter((l) => !l.startsWith("//")).join("\n"));
  check(parsed.trustedFolders.length === 2 && parsed.recentModelIds[0] === "kimi-k3" && parsed.firstLaunchAt === "2026-08-21T12:55:20.970Z", "other settings are untouched");
  check(addCopilotTrustedFolder("c:\\work\\proj", trustHome).changed === false && copilotTrusts("C:\\WORK\\PROJ", trustHome), "adding again (any letter case) changes nothing");
  check(removeCopilotTrustedFolder("C:\\Work\\Proj", trustHome).changed && !copilotTrusts("C:\\Work\\Proj", trustHome) && copilotTrusts("C:\\Aptic", trustHome), "removing only removes that folder");
  fs6.writeFileSync(cfgFile, "{ not json");
  let threw = false;
  try {
    addCopilotTrustedFolder("C:\\x", trustHome);
  } catch {
    threw = true;
  }
  check(threw && fs6.readFileSync(cfgFile, "utf8") === "{ not json", "an unreadable config is never overwritten");
  fs6.rmSync(trustHome, { recursive: true, force: true });
  check(isTrusted(["C:\\Aptic"], "C:\\Aptic\\sub\\dir") && isTrusted(["c:\\aptic"], "C:\\APTIC") && !isTrusted(["C:\\Aptic"], "C:\\Aptic2"), "trust covers the folder and its subfolders, not look-alike siblings");
  const devinAssignee = { id: "devin", name: "Devin", type: "agent", agentConfig: { type: "cli", command: 'devin {model_args} -p "{task}"', workingDir: "C:\\Aptic" } };
  const trustedCmd = await AgentRunner.prepareLaunch(mkTicket(), devinAssignee, "C:\\Aptic\\Tickets", void 0, { trustedRoots: ["C:\\Aptic"], trustFlag: "--respect-workspace-trust false", model: "swe-2-high", modelFlag: "--model" });
  check(trustedCmd.command.endsWith("--respect-workspace-trust false") && trustedCmd.command.includes("--model swe-2-high"), "Devin sessions in a trusted workspace get --respect-workspace-trust false");
  const untrustedCmd = await AgentRunner.prepareLaunch(mkTicket(), devinAssignee, "C:\\Aptic\\Tickets", void 0, { trustedRoots: ["D:\\Other"], trustFlag: "--respect-workspace-trust false" });
  check(!untrustedCmd.command.includes("respect-workspace-trust"), "no flag in a workspace that was not marked trusted");
  const evilFlag = await AgentRunner.prepareLaunch(mkTicket(), devinAssignee, "C:\\Aptic\\Tickets", void 0, { trustedRoots: ["C:\\Aptic"], trustFlag: "--x; rm -rf ~" });
  check(!evilFlag.command.includes("rm -rf"), "a malformed trust flag is never put on the command line");
  console.log("\n--- usage limits: block, fallback, wait ---");
  const fclock = () => t0;
  const claude = { ...createProvider("claude-code", []), id: "cc", name: "Claude", maxParallel: 2, maxSessionsPerWindow: 0, minSpacingSeconds: 0, models: ["opus", "sonnet", "haiku"], defaultModel: "opus" };
  const gem = { ...createProvider("gemini", [{ id: "cc" }]), id: "gm", name: "Gemini", maxParallel: 2, maxSessionsPerWindow: 0, minSpacingSeconds: 0, models: ["gemini-2.5-pro", "gemini-2.5-flash"], defaultModel: "gemini-2.5-pro" };
  const olla = { ...createProvider("ollama", []), id: "ol", name: "Ollama", models: ["llama3.2:3b"], defaultModel: "llama3.2:3b" };
  const pm = { cc: claude, gm: gem, ol: olla };
  const sm5 = new SessionManager((id) => pm[id], new FakeLauncher(), void 0, fclock);
  const lim = await sm5.request({ provider: claude, model: "opus", role: "worker", ticketPath: path8.join(tmp, "l1.md"), ticketId: "L1", ticketTitle: "L1", boardId: "b", payload: {} });
  const resetAt = t0 + 90 * 6e4;
  sm5.limitHit(lim.id, { model: "opus", resetAt });
  check(sm5.get(lim.id).status === "interrupted" && sm5.get(lim.id).interruptKind === "usage-limit" && sm5.get(lim.id).resumeAfter === resetAt, "limitHit interrupts the session and records the reset time");
  check(!!sm5.modelBlock("cc", "opus") && !sm5.modelBlock("cc", "sonnet"), "only the limited model is blocked");
  check(sm5.usage(claude).blockedModels.length === 1, "usage lists the blocked model");
  check(sm5.canStart(claude).ok, "the provider itself stays usable through its other models");
  check(modelTier(claude, "opus") === 5 && modelTier(claude, "sonnet") === 4 && modelTier(claude, "haiku") === 2, "tier heuristics: opus 5, sonnet 4, haiku 2");
  check(modelTier(olla, "llama3.2:3b") === 1 && modelTier(olla, "qwen2.5-coder:32b") === 3, "tier heuristics use parameter count for local models");
  check(modelTier({ ...claude, modelTiers: "haiku=3" }, "haiku") === 3, "per-provider tier overrides win");
  const hard = mkTicket({ priority: "P0", type: "Architecture" });
  const easy = mkTicket({ priority: "Low" });
  check(requiredTier(hard) === 4 && requiredTier(easy) === 2, "critical/architecture tickets need tier 4, easy ones tier 2");
  const fbEasy = pickFallback([claude, gem, olla], sm5, { providerId: "cc", model: "opus", role: "worker" }, easy, t0);
  check(fbEasy.provider.id === "cc" && fbEasy.model === "haiku", "easy ticket: the weakest capable model (haiku) takes over, saving stronger ones");
  const fbHard = pickFallback([claude, gem, olla], sm5, { providerId: "cc", model: "opus", role: "worker" }, hard, t0);
  check(fbHard.tier >= 4 && fbHard.model === "sonnet", "hard ticket: sonnet (tier 4) is capable enough and takes over");
  sm5.blockModel("cc", "sonnet", resetAt);
  const fbHard2 = pickFallback([claude, gem, olla], sm5, { providerId: "cc", model: "opus", role: "worker" }, hard, t0);
  check(fbHard2.provider.id === "gm" && fbHard2.model === "gemini-2.5-pro", "with sonnet also limited, another provider takes over");
  sm5.blockModel("gm", "gemini-2.5-pro", resetAt);
  check(pickFallback([claude, gem, olla], sm5, { providerId: "cc", model: "opus", role: "worker" }, hard, t0) === null, "no capable model left: no fallback (small local models never qualify)");
  check(pickFallback([claude, gem], new SessionManager((id) => pm[id], new FakeLauncher(), void 0, fclock), { providerId: "cc", model: "haiku", role: "worker" }, hard, t0).tier >= 2, "a weak origin model only needs an equal-tier replacement");
  sm5.blockModel("cc", "haiku", resetAt);
  check(sm5.canStart(claude).state === "throttled" && sm5.canStart(claude).retryAt === resetAt, "when every model is limited the provider reports throttled with the reset time");
  t0 = resetAt + 1e3;
  check(sm5.canStart(claude).ok && sm5.blockedModels("cc").length === 0, "blocks expire at the reset time");
  const unk = sm5.blockModel("gm", "gemini-2.5-flash");
  check(unk.unknown === true && unk.until === t0 + 30 * 6e4, "an unknown reset is assumed ~30 min and re-probed");
  const planModel = planWork([{ ticket: mkTicket({ path: path8.join(tmp, "pm.md") }), boardId: "b", boardRoot: tmp }], [claude], (() => {
    const m = new SessionManager((id) => pm[id], new FakeLauncher(), void 0, fclock);
    m.blockModel("cc", "opus", t0 + 6e4);
    return m;
  })(), { now: t0 });
  check(planModel.length === 1 && planModel[0].model !== "opus", "the planner avoids a model that is at its limit");
  fs6.rmSync(tmp, { recursive: true, force: true });
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
