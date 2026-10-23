#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/fleet/modelsCli.ts
var modelsCli_exports = {};
__export(modelsCli_exports, {
  main: () => main,
  parseArgs: () => parseArgs,
  providersFor: () => providersFor,
  summarize: () => summarize
});
module.exports = __toCommonJS(modelsCli_exports);

// src/fleet/providers.ts
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
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
    this.filePath = path.join(workspaceRoot, ".agentic-kanban", "providers.json");
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
      const raw = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
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
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, providers: this.providers }, null, 2), "utf8");
    fs.renameSync(tmp, this.filePath);
    this.listeners.forEach((fn) => fn());
  }
};

// src/fleet/catalog.ts
var fs3 = __toESM(require("fs"));
var http2 = __toESM(require("http"));
var os2 = __toESM(require("os"));
var path3 = __toESM(require("path"));
var import_child_process2 = require("child_process");

// src/fleet/detect.ts
var fs2 = __toESM(require("fs"));
var http = __toESM(require("http"));
var os = __toESM(require("os"));
var path2 = __toESM(require("path"));
var import_child_process = require("child_process");
var EXECUTABLE_NAMES = {
  "claude-code": ["claude"],
  devin: ["devin", "devin-desktop"],
  antigravity: ["agy"],
  gemini: ["gemini"],
  codex: ["codex"],
  aider: ["aider"],
  "copilot-cli": ["copilot"],
  cline: ["cline"],
  ollama: ["ollama"]
};
var isWin = () => process.platform === "win32";
function pathExts() {
  if (!isWin())
    return [""];
  return ["", ...(process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";").map((e) => e.toLowerCase())];
}
function isFile(p) {
  try {
    return fs2.statSync(p).isFile();
  } catch {
    return false;
  }
}
function extraSearchDirs(env = process.env) {
  const home = env.USERPROFILE || env.HOME || os.homedir();
  const dirs = [];
  if (isWin()) {
    const local = env.LOCALAPPDATA || path2.join(home, "AppData", "Local");
    const roaming = env.APPDATA || path2.join(home, "AppData", "Roaming");
    dirs.push(
      path2.join(roaming, "npm"),
      path2.join(local, "Programs", "Ollama"),
      path2.join(local, "Programs", "Devin", "bin"),
      path2.join(local, "Programs", "Devin Next", "bin"),
      path2.join(local, "agy", "bin"),
      path2.join(local, "Microsoft", "WindowsApps"),
      path2.join(home, ".local", "bin"),
      path2.join(home, ".claude", "local"),
      path2.join(env.ProgramFiles || "C:\\Program Files", "Ollama"),
      path2.join(env.ProgramFiles || "C:\\Program Files", "agy", "bin")
    );
    for (const root of [path2.join(local, "fnm_multishells"), env.FNM_DIR ? path2.join(env.FNM_DIR, "node-versions") : "", "C:\\fnm\\node-versions"]) {
      if (!root || !fs2.existsSync(root))
        continue;
      try {
        for (const v of fs2.readdirSync(root))
          dirs.push(path2.join(root, v, "installation"), path2.join(root, v));
      } catch {
      }
    }
  } else {
    dirs.push(
      path2.join(home, ".local", "bin"),
      path2.join(home, ".claude", "local"),
      path2.join(home, ".agy", "bin"),
      path2.join(home, ".npm-global", "bin"),
      path2.join(home, ".cargo", "bin"),
      "/usr/local/bin",
      "/opt/homebrew/bin",
      "/usr/bin"
    );
  }
  return dirs;
}
function findExecutable(names, env = process.env, extraDirs = extraSearchDirs(env)) {
  const pathDirs = (env.PATH || env.Path || "").split(path2.delimiter).filter(Boolean);
  const dirs = [...pathDirs, ...extraDirs];
  const exts = pathExts();
  for (const name of names) {
    for (const dir of dirs) {
      for (const ext of exts) {
        const candidate = path2.join(dir, name + ext);
        if (isFile(candidate))
          return candidate;
      }
    }
  }
  return void 0;
}
function findForKind(kind, env = process.env, extraDirs) {
  const names = EXECUTABLE_NAMES[kind];
  if (!names)
    return void 0;
  if (kind === "antigravity") {
    const local = env.LOCALAPPDATA ? path2.join(env.LOCALAPPDATA, "agy", "bin", "agy.exe") : "";
    if (local && isFile(local))
      return local;
    for (const key of ["AGY_PATH", "ANTIGRAVITY_PATH"]) {
      const v = env[key];
      if (v && isFile(v))
        return v;
    }
  }
  return findExecutable(names, env, extraDirs);
}
function parseOllamaList(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length && /^name\s+/i.test(lines[0]))
    lines.shift();
  return lines.map((l) => l.split(/\s+/)[0]).filter(Boolean);
}
function httpGetJson(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (d) => body += d);
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
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
  return new Promise((resolve) => {
    (0, import_child_process.execFile)(exe, ["list"], { timeout: 4e3, windowsHide: true, shell: isWin() && /\.(cmd|bat)$/i.test(exe) }, (err, stdout) => {
      resolve(err ? [] : parseOllamaList(String(stdout)));
    });
  });
}
async function detectAll(env = process.env) {
  const out = [];
  for (const kind of Object.keys(EXECUTABLE_NAMES)) {
    const p = findForKind(kind, env);
    if (!p)
      continue;
    const d = { kind, path: p };
    if (kind === "ollama")
      d.models = await detectOllamaModels(void 0, p);
    out.push(d);
  }
  return out;
}

// src/fleet/catalog.ts
function toMillions(n, unit) {
  return /m/i.test(unit || "") ? n * 1e6 : /k/i.test(unit || "") ? n * 1e3 : n;
}
function parseDevinBracket(b) {
  const out = {};
  const ctx = b.match(/([\d.]+)\s*([KM])?\s*context/i);
  if (ctx)
    out.contextTokens = Math.round(toMillions(Number(ctx[1]), ctx[2]));
  if (/\bfree\b/i.test(b)) {
    out.pricing = { free: true, inPerM: 0, outPerM: 0, source: "listed" };
  } else {
    const inp = b.match(/\$([\d.]+)\s*\/\s*1M\s*Input/i);
    const cached = b.match(/\$([\d.]+)\s*\/\s*1M\s*Cached/i);
    const outp = b.match(/\$([\d.]+)\s*\/\s*1M\s*Output/i);
    if (inp || outp) {
      out.pricing = {
        inPerM: inp ? Number(inp[1]) : void 0,
        cachedPerM: cached ? Number(cached[1]) : void 0,
        outPerM: outp ? Number(outp[1]) : void 0,
        source: "listed"
      };
    }
  }
  return out;
}
function parseDevinModels(text) {
  const models = [];
  let family;
  let aliases = [];
  const familyStart = [];
  for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
    if (!raw.trim())
      continue;
    if (!/^\s/.test(raw)) {
      const h = raw.match(/^(.+?)\s+\(([^()\s]+)\)\s*$/);
      if (h && !/^available models/i.test(raw)) {
        family = h[2];
        aliases = [];
        familyStart.push(models.length);
      }
      continue;
    }
    const al = raw.match(/^\s+aliases:\s*(.+)$/i);
    if (al) {
      aliases = al[1].split(",").map((s) => s.trim()).filter(Boolean);
      continue;
    }
    const m = raw.match(/^\s+(\S+)\s{2,}(.+?)\s{2,}\[(.+)\]\s*$/);
    if (m) {
      const extra = parseDevinBracket(m[3]);
      models.push({ id: m[1], label: m[2].trim(), family, aliases: aliases.length ? aliases : void 0, ...extra });
    }
  }
  return models;
}
function parseAgyModels(text) {
  const out = [];
  for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const m = raw.match(/^([A-Za-z0-9][\w.:\/-]*)\t(.+)$/);
    if (m)
      out.push({ id: m[1], label: m[2].trim() });
  }
  return out;
}
function parseGenericModels(text) {
  const out = [];
  for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const m = raw.trim().match(/^([A-Za-z0-9][\w.:\/-]*)(?:\s+(.*))?$/);
    if (!m || /^(name|id|model|models|available|fetching|usage|error)\b/i.test(m[1]))
      continue;
    out.push({ id: m[1], label: m[2]?.trim() || void 0 });
  }
  return out;
}
function sizeFromParameterSize(s) {
  const m = (s || "").match(/([\d.]+)\s*([MBT])/i);
  if (!m)
    return void 0;
  const n = Number(m[1]);
  return /t/i.test(m[2]) ? n * 1e3 : /m/i.test(m[2]) ? n / 1e3 : n;
}
function httpGetJson2(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http2.get(url, { timeout: timeoutMs }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (d) => body += d);
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}
async function listOllamaModels(host = "127.0.0.1:11434", exePath) {
  try {
    const data = await httpGetJson2(`http://${host}/api/tags`, 2e3);
    const list = (data?.models || []).map((m) => ({
      id: String(m.name || m.model),
      label: String(m.name || m.model),
      sizeB: sizeFromParameterSize(m.details?.parameter_size),
      local: true,
      pricing: { free: true, inPerM: 0, outPerM: 0, source: "listed" }
    }));
    if (list.length)
      return list;
  } catch {
  }
  const exe = exePath || findExecutable(["ollama"]);
  if (!exe)
    return [];
  const text = await runCapture(exe, ["list"]);
  return parseOllamaList(text).map((id) => ({ id, label: id, local: true, pricing: { free: true, inPerM: 0, outPerM: 0, source: "listed" } }));
}
function slugFromDisplayName(name) {
  return name.replace(/^(?:Anthropic|OpenAI|Google|xAI|Microsoft|Moonshot AI|Meta|Mistral(?: AI)?|DeepSeek|Alibaba|Amazon)\s+/i, "").replace(/\(\s*fast mode\s*\)/i, "fast").replace(/\b(?:preview|beta)\b/gi, "").trim().toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "");
}
function parseCopilotPolicy(text) {
  const out = [];
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*[*\u2022-]\s+(.+?)\s*$/);
    if (!m)
      continue;
    const next = (lines[i + 1] || "").trim();
    if (!/^(enabled|disabled)$/i.test(next))
      continue;
    const id = slugFromDisplayName(m[1]);
    if (id)
      out.push({ id, label: m[1].trim(), enabled: /^enabled$/i.test(next), idGuessed: true });
  }
  return out;
}
function parseDelimitedModels(text) {
  const out = [];
  for (const line of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    if (!line.trim())
      continue;
    const delim = line.includes(";") ? ";" : line.includes("	") ? "	" : line.includes("|") ? "|" : "";
    if (!delim)
      continue;
    const cells = line.split(delim).map((c) => c.trim()).filter((c) => c.length);
    if (cells.length < 2)
      continue;
    const stateIdx = cells.findIndex((c) => /^(enabled|disabled|on|off)$/i.test(c));
    const priceCells = cells.filter((c) => /\$\s*[\d.]+|^free$/i.test(c) || /^n\/?a\b/i.test(c));
    const rest = cells.filter((c, i) => i !== stateIdx && !priceCells.includes(c));
    const name = rest[rest.length - 1];
    if (!name)
      continue;
    const enabled = stateIdx >= 0 ? /^(enabled|on)$/i.test(cells[stateIdx]) : void 0;
    let pricing;
    const priceText2 = priceCells.join(" ");
    if (/^free$/i.test(priceText2.trim())) {
      pricing = { free: true, inPerM: 0, outPerM: 0, source: "listed" };
    } else {
      const inp = priceText2.match(/\$\s*([\d.]+)\s*(?:\/\s*1M\s*)?in\b/i);
      const outp = priceText2.match(/\$\s*([\d.]+)\s*(?:\/\s*1M\s*)?out\b/i);
      const cached = priceText2.match(/\$\s*([\d.]+)\s*(?:\/\s*1M\s*)?cach\w*/i);
      if (inp || outp)
        pricing = { inPerM: inp ? Number(inp[1]) : void 0, outPerM: outp ? Number(outp[1]) : void 0, cachedPerM: cached ? Number(cached[1]) : void 0, source: "listed" };
    }
    const id = slugFromDisplayName(name);
    if (id)
      out.push({ id, label: name, enabled, pricing, idGuessed: true });
  }
  return out;
}
function parseImportedList(text) {
  const policy = parseCopilotPolicy(text);
  if (policy.length)
    return policy;
  const delimited = parseDelimitedModels(text);
  if (delimited.length)
    return delimited;
  return parseGenericModels(text);
}
function listCopilotLearned(home = os2.homedir()) {
  const ids = /* @__PURE__ */ new Set();
  const dir = path3.join(home, ".copilot");
  try {
    const cfg = JSON.parse(fs3.readFileSync(path3.join(dir, "config.json"), "utf8").replace(/^\s*\/\/.*$/gm, ""));
    for (const id of cfg.recentModelIds || [])
      ids.add(String(id));
  } catch {
  }
  try {
    const st = JSON.parse(fs3.readFileSync(path3.join(dir, "settings.json"), "utf8"));
    if (st.model)
      ids.add(String(st.model));
  } catch {
  }
  try {
    const logs = fs3.readdirSync(path3.join(dir, "logs")).filter((f) => f.endsWith(".log")).sort().slice(-40);
    for (const f of logs) {
      const text = fs3.readFileSync(path3.join(dir, "logs", f), "utf8");
      for (const m of text.matchAll(/Using default model:\s*([\w.:\/-]+)/g))
        ids.add(m[1]);
    }
  } catch {
  }
  ids.delete("auto");
  return [...ids].map((id) => ({ id, label: id }));
}
function isShim(exe) {
  return process.platform === "win32" && /\.(cmd|bat)$/i.test(exe);
}
function runCapture(exe, args, timeoutMs = 3e4) {
  return new Promise((resolve, reject) => {
    (0, import_child_process2.execFile)(exe, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024, shell: isShim(exe) }, (err, stdout, stderr) => {
      if (err && !String(stdout).trim())
        reject(new Error(String(stderr || err.message).trim().slice(0, 300)));
      else
        resolve(String(stdout));
    });
  });
}
async function listProviderModels(p, env = process.env, importsDir) {
  const base = { providerId: p.id, providerName: p.name, kind: p.kind, fetchedAt: Date.now() };
  if (importsDir) {
    try {
      const text = fs3.readFileSync(path3.join(importsDir, `${p.id}.txt`), "utf8");
      const models = parseImportedList(text);
      if (models.length)
        return { ...base, source: "import", command: `imports/${p.id}.txt`, ok: true, models };
    } catch {
    }
  }
  const exe = p.path || findForKind(p.kind, env);
  const fail = (command, error) => ({ ...base, source: "command", command, ok: false, error, models: [] });
  try {
    if (p.listCommand) {
      const parts = p.listCommand.trim().split(/\s+/);
      const bin = parts[0] === p.kind || !path3.isAbsolute(parts[0]) ? findExecutable([parts[0]], env) || parts[0] : parts[0];
      const text = await runCapture(bin, parts.slice(1));
      return { ...base, source: "command", command: p.listCommand, ok: true, models: parseGenericModels(text) };
    }
    switch (p.kind) {
      case "devin": {
        if (!exe)
          return fail("devin models list", "devin executable not found");
        const text = await runCapture(exe, ["models", "list"]);
        return { ...base, source: "command", command: "devin models list", ok: true, models: parseDevinModels(text) };
      }
      case "antigravity": {
        if (!exe)
          return fail("agy models", "agy executable not found");
        const text = await runCapture(exe, ["models"]);
        return { ...base, source: "command", command: "agy models", ok: true, models: parseAgyModels(text) };
      }
      case "ollama":
      case "ollama-aider": {
        const models = await listOllamaModels(void 0, exe);
        return { ...base, source: "api", command: "GET http://127.0.0.1:11434/api/tags (fallback: ollama list)", ok: models.length > 0, error: models.length ? void 0 : "Ollama not reachable or no models installed", models };
      }
      case "copilot-cli": {
        const models = listCopilotLearned();
        return {
          ...base,
          source: "learned",
          command: "~/.copilot (config, settings, logs)",
          ok: models.length > 0,
          error: models.length ? void 0 : "Copilot CLI has no model list command and no model usage was found locally",
          models: models.length ? models : p.models.map((id) => ({ id }))
        };
      }
      default:
        return { ...base, source: "configured", command: "(no list command; using the provider's configured models)", ok: p.models.length > 0, models: p.models.map((id) => ({ id })) };
    }
  } catch (e) {
    return fail(p.listCommand || p.kind, e?.message || String(e));
  }
}
var EFFORT_ORDER = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];
var SPEED_WORDS = ["fast", "priority", "lightning"];
function parseModelId(id) {
  const lower = id.toLowerCase().replace(/^.*\//, "");
  let tokens = lower.split(/[-_:\s]+/).filter(Boolean);
  let effort;
  let speed;
  tokens = tokens.filter((t) => t !== "latest" && t !== "thinking" && t !== "preview");
  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1];
    if (SPEED_WORDS.includes(last)) {
      speed = last;
      tokens.pop();
    } else if (EFFORT_ORDER.includes(last)) {
      effort = last;
      tokens.pop();
    } else
      break;
  }
  let sizeB;
  const rest = [];
  const nums = [];
  let numDone = false;
  for (const t of tokens) {
    const size = t.match(/^e?(\d+(?:\.\d+)?)b$/);
    if (size) {
      sizeB = Number(size[1]);
      continue;
    }
    if (/^\d+(\.\d+)?$/.test(t)) {
      if (!numDone)
        nums.push(t);
      continue;
    }
    const prefixed = t.match(/^([a-z]{1,2})(\d+(?:\.\d+)?)$/);
    const glued = t.match(/^([a-z]{3,})(\d+(?:\.\d+)?)$/);
    if (prefixed) {
      rest.push(prefixed[1]);
      if (!numDone)
        nums.push(prefixed[2]);
      continue;
    }
    if (glued) {
      rest.push(glued[1]);
      if (!numDone)
        nums.push(glued[2]);
      continue;
    }
    if (nums.length)
      numDone = true;
    rest.push(t);
  }
  let version = null;
  if (nums.length) {
    version = nums.length >= 2 && !nums[0].includes(".") && !nums[1].includes(".") ? Number(`${nums[0]}.${nums[1]}`) : Number(nums[0]);
  }
  return { family: rest.join("-") || lower, version, sizeB, effort, speed, embedding: /embed/.test(lower) };
}
function tierFromName(name, sizeB) {
  const n = name.toLowerCase();
  const b = sizeB ?? (n.match(/(\d+(?:\.\d+)?)b\b/) ? Number(n.match(/(\d+(?:\.\d+)?)b\b/)[1]) : void 0);
  if (b !== void 0)
    return b <= 4 ? 1 : b <= 9 ? 2 : b <= 40 ? 3 : b < 100 ? 4 : 5;
  if (/haiku|flash|(?:^|[-_ :])mini|nano|lite|small|instant/.test(n))
    return 2;
  if (/fable|opus|gpt-?[5-9]|o3|o1|ultra|argon|gemini.*pro|deepseek-r1|astra|max/.test(n))
    return 5;
  if (/sonnet|gpt-?4|codex|codestral|devstral|coder|sol\b|pro\b/.test(n))
    return 4;
  return 3;
}
function priceTier(p) {
  if (!p || p.free || p.outPerM === void 0)
    return void 0;
  return p.outPerM <= 2 ? 2 : p.outPerM <= 8 ? 3 : p.outPerM <= 25 ? 4 : 5;
}
var ESTIMATED_OUT_PER_M = { 1: 0, 2: 1.5, 3: 6, 4: 15, 5: 30 };
function estimatePricing(tier, local) {
  if (local)
    return { free: true, inPerM: 0, outPerM: 0, source: "estimated" };
  const out = ESTIMATED_OUT_PER_M[tier] ?? 6;
  return { inPerM: out / 5, cachedPerM: out / 50, outPerM: out, source: "estimated" };
}
function pickRepresentative(variants) {
  const byEffort = (e) => variants.find((v) => v.effort === e)?.id;
  return byEffort("medium") || variants.find((v) => !v.effort)?.id || byEffort("high") || byEffort("low") || variants[0].id;
}
function categoryOf(tier, local, pricing, embedding) {
  if (embedding)
    return "specialist";
  if (local)
    return "local";
  if (pricing?.free)
    return "free";
  return tier >= 5 ? "frontier" : tier >= 3 ? "balanced" : "fast";
}
function curate(raws, opts = {}) {
  const keep = Math.max(1, opts.keepVersionsPerFamily ?? 2);
  const overrides = opts.overrides || {};
  const models = [];
  for (const raw of raws) {
    if (!raw.ok && !raw.models.length)
      continue;
    const groups = /* @__PURE__ */ new Map();
    for (const m of raw.models) {
      const parsed = parseModelId(m.id);
      const fam = m.family ? parseModelId(m.family) : void 0;
      const key = m.family ? `fam|${m.family}` : `${parsed.family}|${parsed.version ?? ""}|${parsed.sizeB ?? ""}`;
      const g = groups.get(key) || { parsed: fam ? { ...fam, sizeB: fam.sizeB ?? parsed.sizeB } : parsed, items: [] };
      g.items.push({ raw: m, effort: parsed.effort, speed: parsed.speed });
      groups.set(key, g);
    }
    const entries = [];
    for (const g of groups.values()) {
      const normal = g.items.filter((i) => !i.speed);
      const base = normal.length ? normal : g.items;
      const rep = pickRepresentative(base.map((i) => ({ id: i.raw.id, effort: i.effort })));
      const repItem = g.items.find((i) => i.raw.id === rep);
      const effortVariants = {};
      for (const i of base)
        if (i.effort)
          effortVariants[i.effort] = i.raw.id;
      const local = !!repItem.raw.local;
      const sizeB = g.parsed.sizeB ?? repItem.raw.sizeB;
      const nameTier = tierFromName(repItem.raw.id, sizeB);
      const ovKey = [`${raw.providerId}::${rep}`, `${raw.providerId}::*`, `*::${rep}`].find((k) => overrides[k]);
      let pricing = repItem.raw.pricing;
      if (ovKey)
        pricing = { ...pricing || {}, ...overrides[ovKey], source: "override" };
      const pTier = priceTier(pricing);
      const tier = local ? nameTier : pTier ? Math.max(1, Math.min(5, Math.round((nameTier * 2 + pTier) / 3))) : nameTier;
      if (!pricing)
        pricing = estimatePricing(tier, local);
      entries.push({
        key: `${raw.providerId}::${rep}`,
        providerId: raw.providerId,
        id: rep,
        label: (repItem.raw.label || rep).replace(/\s*\((?:low|medium|high|xhigh|max|none|minimal)\)\s*$/i, "").replace(/\s+(?:low|medium|high|xhigh|max)(?:\s+thinking)?$/i, "").trim(),
        family: g.parsed.family,
        version: g.parsed.version,
        sizeB,
        tier,
        category: categoryOf(tier, local, pricing, g.parsed.embedding),
        pricing,
        contextTokens: repItem.raw.contextTokens,
        local,
        effortVariants,
        speedVariants: g.items.filter((i) => i.speed).map((i) => i.raw.id),
        members: g.items.map((i) => i.raw.id),
        memberPricing: (() => {
          const mp = {};
          for (const i of g.items) {
            const p = i.raw.pricing;
            if (p && !p.free && (p.inPerM !== repItem.raw.pricing?.inPerM || p.outPerM !== repItem.raw.pricing?.outPerM))
              mp[i.raw.id] = p;
          }
          return Object.keys(mp).length ? mp : void 0;
        })(),
        hidden: false
      });
      if (repItem.raw.enabled === false) {
        const e = entries[entries.length - 1];
        e.hidden = true;
        e.hiddenReason = "disabled in your account / policy settings";
      }
      if (g.parsed.embedding) {
        const e = entries[entries.length - 1];
        e.hidden = true;
        e.hiddenReason = "embedding model (not usable as a coding agent)";
      }
    }
    const byFamily = /* @__PURE__ */ new Map();
    for (const e of entries) {
      const list = byFamily.get(e.family) || [];
      list.push(e);
      byFamily.set(e.family, list);
    }
    for (const [family, list] of byFamily) {
      const versions = [...new Set(list.filter((e) => e.version !== null && e.hiddenReason !== "disabled in your account / policy settings").map((e) => e.version))].sort((a, b) => b - a);
      const keepSet = new Set(versions.slice(0, keep));
      for (const e of list) {
        if (e.hidden || e.version === null || keepSet.has(e.version))
          continue;
        e.hidden = true;
        e.hiddenReason = `superseded: ${family} v${versions[0]} is newest (keeping the latest ${keep} version${keep === 1 ? "" : "s"})`;
      }
    }
    models.push(...entries);
  }
  const listed = /* @__PURE__ */ new Map();
  for (const m of models) {
    if (m.pricing?.source === "listed" && !m.pricing.free && m.version !== null)
      listed.set(`${m.family}|${m.version}`, m.pricing);
  }
  for (const m of models) {
    if (m.pricing?.source !== "estimated" || m.local || m.version === null)
      continue;
    const ref = listed.get(`${m.family}|${m.version}`);
    if (ref)
      m.pricing = { ...ref, source: "reference" };
  }
  models.sort((a, b) => a.providerId.localeCompare(b.providerId) || Number(a.hidden) - Number(b.hidden) || b.tier - a.tier || a.family.localeCompare(b.family) || (b.version ?? 0) - (a.version ?? 0));
  return { version: 1, generatedAt: opts.now ?? Date.now(), keepVersionsPerFamily: keep, models };
}
var CatalogStore = class {
  dir;
  constructor(workspaceRoot) {
    this.dir = path3.join(workspaceRoot, ".agentic-kanban", "models");
  }
  get rawDir() {
    return path3.join(this.dir, "raw");
  }
  get catalogPath() {
    return path3.join(this.dir, "catalog.json");
  }
  get overridesPath() {
    return path3.join(this.dir, "pricing.overrides.json");
  }
  get importsDir() {
    return path3.join(this.dir, "imports");
  }
  /** Saves a pasted model list for a provider (used by the next refresh). */
  saveImport(providerId, text) {
    const file = path3.join(this.importsDir, `${providerId}.txt`);
    fs3.mkdirSync(path3.dirname(file), { recursive: true });
    fs3.writeFileSync(file, text, "utf8");
    return file;
  }
  get benchPath() {
    return path3.join(this.dir, "bench.json");
  }
  writeJson(file, data) {
    fs3.mkdirSync(path3.dirname(file), { recursive: true });
    const tmp = file + ".tmp";
    fs3.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs3.renameSync(tmp, file);
  }
  saveRaw(raw) {
    const file = path3.join(this.rawDir, `${raw.providerId}.json`);
    this.writeJson(file, raw);
    return file;
  }
  loadRaws() {
    try {
      return fs3.readdirSync(this.rawDir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs3.readFileSync(path3.join(this.rawDir, f), "utf8")));
    } catch {
      return [];
    }
  }
  loadOverrides() {
    try {
      return JSON.parse(fs3.readFileSync(this.overridesPath, "utf8"));
    } catch {
      return {};
    }
  }
  saveCatalog(c) {
    this.writeJson(this.catalogPath, c);
    return this.catalogPath;
  }
  loadCatalog() {
    try {
      return JSON.parse(fs3.readFileSync(this.catalogPath, "utf8"));
    } catch {
      return void 0;
    }
  }
  loadBench() {
    try {
      return JSON.parse(fs3.readFileSync(this.benchPath, "utf8"));
    } catch {
      return {};
    }
  }
  saveBench(b) {
    this.writeJson(this.benchPath, b);
  }
  /** Step 1: ask every provider for its models and save the raw results. */
  async refreshRaw(providers, env = process.env) {
    const out = [];
    for (const p of providers) {
      if (!p.enabled)
        continue;
      const raw = await listProviderModels(p, env, this.importsDir);
      this.saveRaw(raw);
      out.push(raw);
    }
    return out;
  }
  /** Writes catalog.md (cleaned) and full/<provider>.md (complete raw lists) for human review. */
  exportDocs() {
    const files = [];
    const catalog = this.loadCatalog();
    fs3.mkdirSync(path3.join(this.dir, "full"), { recursive: true });
    if (catalog) {
      const f = path3.join(this.dir, "catalog.md");
      fs3.writeFileSync(f, renderCatalogMarkdown(catalog), "utf8");
      files.push(f);
    }
    for (const raw of this.loadRaws()) {
      const f = path3.join(this.dir, "full", `${raw.providerId}.md`);
      fs3.writeFileSync(f, renderRawMarkdown(raw), "utf8");
      files.push(f);
    }
    return files;
  }
  /** Step 2: curate the saved raw files into catalog.json. */
  curateSaved(keepVersionsPerFamily = 2) {
    const c = curate(this.loadRaws(), { keepVersionsPerFamily, overrides: this.loadOverrides() });
    this.saveCatalog(c);
    return c;
  }
};
function priceText(p) {
  if (!p)
    return "?";
  if (p.free)
    return "free";
  if (p.outPerM === void 0)
    return "?";
  const tag = p.source === "estimated" ? " (est.)" : p.source === "reference" ? " (ref.)" : p.source === "override" ? " (override)" : "";
  return `$${p.inPerM ?? "?"} / $${p.outPerM}${tag}`;
}
function renderCatalogMarkdown(catalog) {
  const out = [`# Model catalog (cleaned)`, "", `Generated ${new Date(catalog.generatedAt).toISOString()} \xB7 newest ${catalog.keepVersionsPerFamily} version(s) of each family kept \xB7 prices are USD per 1M tokens (input / output)`, ""];
  const providers = [...new Set(catalog.models.map((m) => m.providerId))];
  for (const id of providers) {
    const list = catalog.models.filter((m) => m.providerId === id);
    const shown = list.filter((m) => !m.hidden);
    out.push(`## ${id} \u2014 ${shown.length} shown, ${list.length - shown.length} hidden`, "", "| Model id | Label | Category | Tier | Price | Efforts | Variants |", "|---|---|---|---|---|---|---|");
    for (const m of shown) {
      out.push(`| \`${m.id}\` | ${m.label} | ${m.category} | T${m.tier} | ${priceText(m.pricing)} | ${Object.keys(m.effortVariants).join(", ") || "-"} | ${m.members.length} |`);
    }
    const hidden = list.filter((m) => m.hidden);
    if (hidden.length) {
      out.push("", `### Hidden in ${id}`, "", "| Model id | Why |", "|---|---|");
      for (const m of hidden)
        out.push(`| \`${m.id}\` | ${m.hiddenReason || ""} |`);
    }
    out.push("");
  }
  return out.join("\n");
}
function renderRawMarkdown(raw) {
  const out = [`# ${raw.providerName} \u2014 full model list (${raw.models.length})`, "", `Source: ${raw.source} (\`${raw.command}\`) \xB7 fetched ${new Date(raw.fetchedAt).toISOString()}${raw.ok ? "" : " \xB7 FAILED: " + raw.error}`, ""];
  const byFamily = /* @__PURE__ */ new Map();
  for (const m of raw.models)
    byFamily.set(m.family || "(no family)", [...byFamily.get(m.family || "(no family)") || [], m]);
  for (const [fam, list] of byFamily) {
    out.push(`## ${fam} (${list.length})`, "");
    for (const m of list) {
      const price = m.pricing ? priceText(m.pricing) : "";
      const ctx = m.contextTokens ? `${Math.round(m.contextTokens / 1e3)}K ctx` : "";
      const enabled = m.enabled === false ? "DISABLED" : "";
      out.push(`- \`${m.id}\`${[m.label && m.label !== m.id ? m.label : "", ctx, price, enabled].filter(Boolean).length ? " \u2014 " + [m.label && m.label !== m.id ? m.label : "", ctx, price, enabled].filter(Boolean).join(" \xB7 ") : ""}`);
    }
    out.push("");
  }
  return out.join("\n");
}
function providerPatches(providers, catalog, maxModels = 60) {
  const patches = [];
  for (const p of providers) {
    const visible = catalog.models.filter((m) => m.providerId === p.id && !m.hidden && m.category !== "specialist");
    if (!visible.length)
      continue;
    const sorted = [...visible].sort((a, b) => b.tier - a.tier || (a.pricing?.outPerM ?? 0) - (b.pricing?.outPerM ?? 0)).slice(0, maxModels);
    const models = [.../* @__PURE__ */ new Set([...sorted.map((m) => m.id), ...p.pinnedModels || []])];
    const strong = sorted.filter((m) => m.tier >= 4).sort((a, b) => (a.pricing?.outPerM ?? 0) - (b.pricing?.outPerM ?? 0));
    const defaultModel = models.includes(p.defaultModel) ? p.defaultModel : (strong[0] || sorted[0]).id;
    const existing = (p.modelTiers || "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    const known = new Set(existing.map((e) => e.split(/[=:]/)[0].trim().toLowerCase()));
    const added = sorted.filter((m) => !known.has(m.id.toLowerCase())).map((m) => `${m.id}=${m.tier}`);
    patches.push({ id: p.id, models, defaultModel, modelTiers: [...existing, ...added].join(", ") });
  }
  return patches;
}

// src/fleet/bench.ts
var http3 = __toESM(require("http"));
function benchOllama(model, host = "127.0.0.1:11434", timeoutMs = 18e4) {
  return new Promise((resolve, reject) => {
    const [hostname, port] = host.split(":");
    const body = JSON.stringify({
      model,
      prompt: "Write a clear 150 word explanation of how a hash map works.",
      stream: false,
      options: { num_predict: 200 }
    });
    const req = http3.request(
      { hostname, port: Number(port) || 11434, path: "/api/generate", method: "POST", timeout: timeoutMs, headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (d) => data += d);
        res.on("end", () => {
          try {
            const j = JSON.parse(data);
            if (j.error)
              return reject(new Error(String(j.error)));
            const tps = j.eval_count && j.eval_duration ? j.eval_count / (j.eval_duration / 1e9) : 0;
            tps > 0 ? resolve(tps) : reject(new Error("no timing data returned"));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end(body);
  });
}

// src/fleet/modelsCli.ts
function parseArgs(argv) {
  const a = { cmd: argv[0] || "all", dir: process.cwd(), keep: 2, hidden: false, apply: false };
  for (let i = 1; i < argv.length; i++) {
    const v = argv[i];
    if (v === "--dir")
      a.dir = argv[++i];
    else if (v === "--only")
      a.only = argv[++i];
    else if (v === "--file")
      a.file = argv[++i];
    else if (v === "--keep")
      a.keep = Math.max(1, Number(argv[++i]) || 2);
    else if (v === "--hidden")
      a.hidden = true;
    else if (v === "--apply")
      a.apply = true;
  }
  return a;
}
async function providersFor(dir, only) {
  const registry = new ProviderRegistry(dir);
  let providers = registry.list();
  if (!providers.length) {
    const found = await detectAll();
    const made = [];
    for (const d of found) {
      const p = createProvider(d.kind, made);
      made.push({ ...p, path: d.path, models: d.models?.length ? d.models : p.models });
    }
    providers = made;
  }
  return only ? providers.filter((p) => p.id === only || p.kind === only) : providers;
}
function summarize(c) {
  const lines = [];
  const byProvider = /* @__PURE__ */ new Map();
  for (const m of c.models)
    byProvider.set(m.providerId, [...byProvider.get(m.providerId) || [], m]);
  for (const [id, list] of byProvider) {
    const vis = list.filter((m) => !m.hidden);
    lines.push(`
${id}: ${vis.length} shown, ${list.length - vis.length} hidden`);
    for (const m of vis) {
      const price = m.pricing?.free ? "free" : m.pricing?.outPerM !== void 0 ? `$${m.pricing.inPerM ?? "?"}/$${m.pricing.outPerM} per 1M` : "?";
      lines.push(`  [${m.category.padEnd(8)}] T${m.tier}  ${m.id.padEnd(34)} ${price}${m.pricing?.source === "estimated" ? " (est.)" : m.pricing?.source === "reference" ? " (ref.)" : ""}`);
    }
  }
  return lines.join("\n");
}
async function main(argv) {
  const args = parseArgs(argv);
  const store = new CatalogStore(args.dir);
  if (args.cmd === "import") {
    if (!args.only || !args.file) {
      console.error("Usage: import --only <providerId> --file <list.txt>");
      return 2;
    }
    const saved = store.saveImport(args.only, require("fs").readFileSync(args.file, "utf8"));
    console.log(`Saved ${saved}. Run "list" and "curate" (or "all") to use it.`);
    return 0;
  }
  if (args.cmd === "list" || args.cmd === "all") {
    const providers = await providersFor(args.dir, args.only);
    if (!providers.length) {
      console.error("No providers configured or detected. Add some in the Agents screen first.");
      return 1;
    }
    console.log(`Listing models for ${providers.length} provider(s)...`);
    const raws = await store.refreshRaw(providers);
    for (const r of raws) {
      console.log(`  ${r.ok ? "ok " : "FAIL"} ${r.providerName.padEnd(28)} ${String(r.models.length).padStart(4)} models  via ${r.source}${r.error ? "  - " + r.error : ""}`);
    }
    console.log(`Raw lists saved in ${store.rawDir}`);
  }
  if (args.cmd === "curate" || args.cmd === "all") {
    const c = store.curateSaved(args.keep);
    const hidden = c.models.filter((m) => m.hidden).length;
    for (const f of store.exportDocs())
      console.log(`  wrote ${f}`);
    console.log(`
Catalog: ${c.models.length - hidden} models shown, ${hidden} hidden (kept the newest ${c.keepVersionsPerFamily} version(s) of each family). Saved to ${store.catalogPath}`);
  }
  if (args.cmd === "bench") {
    const providers = (await providersFor(args.dir, args.only)).filter((p) => p.kind === "ollama" || p.kind === "ollama-aider");
    const bench = store.loadBench();
    for (const p of providers) {
      const models = p.models.filter((m) => !/embed/i.test(m));
      for (const m of models) {
        process.stdout.write(`Benchmarking ${p.id} / ${m} ... `);
        try {
          const tps = await benchOllama(m);
          bench[`${p.id}::${m}`] = { tps, at: Date.now() };
          console.log(`${tps.toFixed(1)} tokens/s`);
        } catch (e) {
          console.log(`failed (${e?.message || e})`);
        }
      }
    }
    store.saveBench(bench);
    console.log(`Saved to ${store.benchPath}`);
  }
  if (args.cmd === "apply" || args.cmd === "all" && args.apply) {
    const c = store.loadCatalog();
    if (!c) {
      console.error('No catalog yet. Run "curate" first.');
      return 1;
    }
    const registry = new ProviderRegistry(args.dir);
    const patches = providerPatches(registry.list(), c);
    for (const patch of patches) {
      const p = registry.get(patch.id);
      registry.upsert({ ...p, models: patch.models, defaultModel: patch.defaultModel, modelTiers: patch.modelTiers });
    }
    console.log(`Applied the curated catalog to ${patches.length} provider(s) in ${registry.filePath}`);
  }
  if (args.cmd === "export") {
    for (const f of store.exportDocs())
      console.log(`wrote ${f}`);
    return 0;
  }
  if (args.cmd === "show") {
    const c = store.loadCatalog();
    if (!c) {
      console.error('No catalog yet. Run "all" first.');
      return 1;
    }
    console.log(summarize(c));
    if (args.hidden) {
      console.log("\nHidden:");
      for (const m of c.models.filter((x) => x.hidden))
        console.log(`  ${m.providerId}::${m.id}  - ${m.hiddenReason}`);
    }
  }
  if (!["list", "curate", "bench", "apply", "show", "all", "import", "export"].includes(args.cmd)) {
    console.error("Usage: models-cli <list|curate|bench|apply|show|all> [--dir <workspace>] [--only <provider>] [--keep <n>] [--apply] [--hidden]");
    return 2;
  }
  return 0;
}
if (require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code)).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  main,
  parseArgs,
  providersFor,
  summarize
});
