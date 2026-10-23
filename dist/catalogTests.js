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

// test/catalogTests.ts
var fs4 = __toESM(require("fs"));
var os3 = __toESM(require("os"));
var path6 = __toESM(require("path"));

// src/fleet/catalog.ts
var fs2 = __toESM(require("fs"));
var http = __toESM(require("http"));
var os2 = __toESM(require("os"));
var path2 = __toESM(require("path"));
var import_child_process = require("child_process");

// src/fleet/detect.ts
var fs = __toESM(require("fs"));
var os = __toESM(require("os"));
var path = __toESM(require("path"));
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
function findForKind(kind, env = process.env, extraDirs) {
  const names = EXECUTABLE_NAMES[kind];
  if (!names)
    return void 0;
  if (kind === "antigravity") {
    const local = env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, "agy", "bin", "agy.exe") : "";
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
function httpGetJson(url, timeoutMs) {
  return new Promise((resolve3, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (d) => body += d);
      res.on("end", () => {
        try {
          resolve3(JSON.parse(body));
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
    const data = await httpGetJson(`http://${host}/api/tags`, 2e3);
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
  const dir = path2.join(home, ".copilot");
  try {
    const cfg = JSON.parse(fs2.readFileSync(path2.join(dir, "config.json"), "utf8").replace(/^\s*\/\/.*$/gm, ""));
    for (const id of cfg.recentModelIds || [])
      ids.add(String(id));
  } catch {
  }
  try {
    const st = JSON.parse(fs2.readFileSync(path2.join(dir, "settings.json"), "utf8"));
    if (st.model)
      ids.add(String(st.model));
  } catch {
  }
  try {
    const logs = fs2.readdirSync(path2.join(dir, "logs")).filter((f) => f.endsWith(".log")).sort().slice(-40);
    for (const f of logs) {
      const text = fs2.readFileSync(path2.join(dir, "logs", f), "utf8");
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
  return new Promise((resolve3, reject) => {
    (0, import_child_process.execFile)(exe, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024, shell: isShim(exe) }, (err, stdout, stderr) => {
      if (err && !String(stdout).trim())
        reject(new Error(String(stderr || err.message).trim().slice(0, 300)));
      else
        resolve3(String(stdout));
    });
  });
}
async function listProviderModels(p, env = process.env, importsDir) {
  const base = { providerId: p.id, providerName: p.name, kind: p.kind, fetchedAt: Date.now() };
  if (importsDir) {
    try {
      const text = fs2.readFileSync(path2.join(importsDir, `${p.id}.txt`), "utf8");
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
      const bin = parts[0] === p.kind || !path2.isAbsolute(parts[0]) ? findExecutable([parts[0]], env) || parts[0] : parts[0];
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
    this.dir = path2.join(workspaceRoot, ".agentic-kanban", "models");
  }
  get rawDir() {
    return path2.join(this.dir, "raw");
  }
  get catalogPath() {
    return path2.join(this.dir, "catalog.json");
  }
  get overridesPath() {
    return path2.join(this.dir, "pricing.overrides.json");
  }
  get importsDir() {
    return path2.join(this.dir, "imports");
  }
  /** Saves a pasted model list for a provider (used by the next refresh). */
  saveImport(providerId, text) {
    const file = path2.join(this.importsDir, `${providerId}.txt`);
    fs2.mkdirSync(path2.dirname(file), { recursive: true });
    fs2.writeFileSync(file, text, "utf8");
    return file;
  }
  get benchPath() {
    return path2.join(this.dir, "bench.json");
  }
  writeJson(file, data) {
    fs2.mkdirSync(path2.dirname(file), { recursive: true });
    const tmp = file + ".tmp";
    fs2.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs2.renameSync(tmp, file);
  }
  saveRaw(raw) {
    const file = path2.join(this.rawDir, `${raw.providerId}.json`);
    this.writeJson(file, raw);
    return file;
  }
  loadRaws() {
    try {
      return fs2.readdirSync(this.rawDir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs2.readFileSync(path2.join(this.rawDir, f), "utf8")));
    } catch {
      return [];
    }
  }
  loadOverrides() {
    try {
      return JSON.parse(fs2.readFileSync(this.overridesPath, "utf8"));
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
      return JSON.parse(fs2.readFileSync(this.catalogPath, "utf8"));
    } catch {
      return void 0;
    }
  }
  loadBench() {
    try {
      return JSON.parse(fs2.readFileSync(this.benchPath, "utf8"));
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
    fs2.mkdirSync(path2.join(this.dir, "full"), { recursive: true });
    if (catalog) {
      const f = path2.join(this.dir, "catalog.md");
      fs2.writeFileSync(f, renderCatalogMarkdown(catalog), "utf8");
      files.push(f);
    }
    for (const raw of this.loadRaws()) {
      const f = path2.join(this.dir, "full", `${raw.providerId}.md`);
      fs2.writeFileSync(f, renderRawMarkdown(raw), "utf8");
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
var CatalogIndex = class {
  constructor(catalog) {
    this.catalog = catalog;
    for (const m of catalog?.models || []) {
      this.byKey.set(m.key, m);
      for (const id of [...Object.values(m.effortVariants), ...m.speedVariants, ...m.members || []]) {
        if (!this.byKey.has(`${m.providerId}::${id}`))
          this.byKey.set(`${m.providerId}::${id}`, m);
      }
    }
  }
  byKey = /* @__PURE__ */ new Map();
  get(providerId, modelId) {
    return this.byKey.get(`${providerId}::${modelId}`);
  }
  /** Price of this exact id: its own listed price when it differs from the family's (fusion combos), else the entry's. */
  pricingFor(providerId, modelId) {
    const e = this.get(providerId, modelId);
    return e?.memberPricing?.[modelId] || e?.pricing;
  }
  visible(providerId) {
    return (this.catalog?.models || []).filter((m) => m.providerId === providerId && !m.hidden);
  }
  hasData() {
    return !!this.catalog?.models.length;
  }
};
function fusionCombos(raw) {
  return raw.models.filter((m) => m.family === "fusion" || /^fusion-/.test(m.id)).map((m) => {
    const label = m.label || m.id;
    const lm = label.match(/^Fusion\s*\((.+?)\s\+\s(.+)\)\s*$/i);
    let main2 = lm?.[1];
    let side = lm?.[2];
    if (!main2 || !side) {
      const im = m.id.match(/^fusion-(.+?)-sidekick-(.+)$/);
      main2 = im?.[1] || label;
      side = im?.[2] || "";
    }
    return { id: m.id, main: main2, side, inPerM: m.pricing?.inPerM, outPerM: m.pricing?.outPerM, contextTokens: m.contextTokens };
  });
}
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

// src/fleet/providers.ts
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

// src/fleet/sessions.ts
var path3 = __toESM(require("path"));

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
    const key = path3.resolve(ticketPath).toLowerCase();
    return this.active().find((s) => path3.resolve(s.ticketPath).toLowerCase() === key);
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
var SpeedBook = class {
  constructor(store) {
    this.store = store;
    this.data = store ? store.load() : {};
  }
  data;
  key(providerId, model) {
    return `${providerId}::${model}`;
  }
  record(providerId, model, points, minutes) {
    if (!(points > 0) || !(minutes > 0) || minutes > 24 * 60)
      return;
    const k = this.key(providerId, model);
    const mpp = minutes / points;
    const cur = this.data[k];
    this.data[k] = cur ? { mpp: cur.mpp * 0.7 + mpp * 0.3, n: cur.n + 1, at: Date.now() } : { mpp, n: 1, at: Date.now() };
    this.store?.save(this.data);
  }
  samples(providerId, model) {
    const s = this.data[this.key(providerId, model)];
    return s ? { minutesPerPoint: s.mpp, n: s.n } : void 0;
  }
  /** Blend measured speed into the prior: 3+ finished runs make the measurement dominant. */
  predict(providerId, model, points, priorMin) {
    const s = this.samples(providerId, model);
    if (!s)
      return priorMin;
    const w = Math.min(1, s.n / 3);
    return w * s.minutesPerPoint * points + (1 - w) * priorMin;
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

// src/fleet/limits.ts
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

// src/agentRunner.ts
var path5 = __toESM(require("path"));
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

// src/pathUtils.ts
var path4 = __toESM(require("path"));
var CASE_INSENSITIVE = process.platform === "win32" || process.platform === "darwin";
function norm(p) {
  const resolved = path4.resolve(p);
  return CASE_INSENSITIVE ? resolved.toLowerCase() : resolved;
}
function isInside(root, candidate) {
  if (!root || !candidate)
    return false;
  const r = norm(root);
  const c = norm(candidate);
  if (c === r)
    return true;
  const prefix = r.endsWith(path4.sep) ? r : r + path4.sep;
  return c.startsWith(prefix);
}

// src/fleet/trust.ts
function isTrusted(trustedRoots, cwd) {
  return trustedRoots.some((r) => isInside(r, cwd));
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
        candidates.push(path5.join(localAppData, "agy", "bin", "agy.exe"));
      }
      const userProfile = process.env.USERPROFILE;
      if (userProfile) {
        candidates.push(path5.join(userProfile, "AppData", "Local", "agy", "bin", "agy.exe"));
      }
      const programFiles = process.env.ProgramFiles;
      if (programFiles) {
        candidates.push(path5.join(programFiles, "agy", "bin", "agy.exe"));
      }
    } else {
      const home = process.env.HOME;
      if (home) {
        candidates.push(path5.join(home, ".agy", "bin", "agy"));
        candidates.push(path5.join(home, ".local", "bin", "agy"));
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
    const workspaceFolder = vscode?.workspace?.workspaceFolders?.[0]?.uri.fsPath || path5.dirname(boardRoot);
    const content = rawTicketContent ?? ticket.summary ?? ticket.title;
    let effectiveBoardConfig = boardConfig;
    if (!effectiveBoardConfig) {
      const configPath = path5.join(boardRoot, "config.md");
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
    if (exePath && first && path5.basename(exePath).replace(/\.[^.]+$/, "").toLowerCase() === first[1].toLowerCase()) {
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
    const workspaceFolder = vscode?.workspace?.workspaceFolders?.[0]?.uri.fsPath || path5.dirname(boardRoot);
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

// test/catalogTests.ts
var order5 = (l) => ["low", "medium", "high", "xhigh", "max"].indexOf(l);
var failures = 0;
function check(cond, msg) {
  if (!cond) {
    failures++;
    console.error("  \u2718 " + msg);
  } else {
    console.log("  \u2714 " + msg);
  }
}
var FIX = path6.join(__dirname, "..", "test", "fixtures", "models");
var read = (f) => fs4.readFileSync(path6.join(FIX, f), "utf8");
var NullLauncher = class {
  async launch(_s) {
    return true;
  }
  show() {
  }
  kill() {
  }
};
function mkTicket(over = {}) {
  return {
    id: "T-1",
    filename: "t-1.md",
    path: path6.join(os3.tmpdir(), "catalog-t1.md"),
    relativePath: "t-1.md",
    column: "Backlog",
    subfolder: "Ready",
    title: "Do it",
    summary: "",
    description: "",
    status: "Backlog",
    priority: "Normal",
    epic: null,
    type: null,
    estimate: "M",
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
function storeWith(data) {
  return { load: () => ({ starts: {}, sessions: [], blocks: {}, spend: [], ...data }), save: (_d) => {
  } };
}
async function main() {
  console.log("\n--- parsing real provider output ---");
  const devin = parseDevinModels(read("devin.txt"));
  check(devin.length > 500, `parses every model line of "devin models list" (${devin.length})`);
  const swe = devin.find((m) => m.id === "swe-2-high");
  check(swe.pricing?.free === true && (swe.contextTokens || 0) >= 262e3, 'reads context size and "Free"');
  const opus = devin.find((m) => m.id === "claude-opus-5-5-medium");
  check(opus.family === "claude-opus-5.5" && opus.pricing?.inPerM === 4 && opus.pricing?.cachedPerM === 0.2 && opus.pricing?.outPerM === 20, "reads family and $/1M input, cached, output");
  check(opus.aliases?.includes("opus") === true, "reads family aliases");
  const agy = parseAgyModels(read("agy.txt"));
  check(agy.length === 13 && agy[0].id === "gemini-4-argon-medium" && agy[0].label === "Gemini 4 Argon (Medium)", 'parses "agy models" (tab separated)');
  check(parseGenericModels("NAME  SIZE\nllama3\nmistral:7b  4GB\n").map((m) => m.id).join() === "llama3,mistral:7b", "generic parser takes the first token of each line");
  console.log("\n--- id parsing ---");
  const a = parseModelId("claude-sonnet-5-5-high");
  check(a.family === "claude-sonnet" && a.version === 5.5 && a.effort === "high", "claude-sonnet-5-5-high -> claude-sonnet, 5.5, high");
  const b = parseModelId("gemini-3.8-flash-medium");
  check(b.family === "gemini-flash" && b.version === 3.8, "gemini-3.8-flash -> gemini-flash 3.8");
  const c = parseModelId("gpt-6-sol-high-priority");
  check(c.family === "gpt-sol" && c.version === 6 && c.speed === "priority" && c.effort === "high", "gpt-6-sol-high-priority -> speed + effort split off");
  check(parseModelId("gemma4:e4b").sizeB === 4 && parseModelId("gemma4:e4b").family === "gemma", "gemma4:e4b -> gemma, 4B");
  check(parseModelId("nomic-embed-text:latest").embedding === true, "embedding models are recognised");
  console.log("\n--- curation: categories, prices, hiding superseded models ---");
  const rawDevin = { providerId: "devin", providerName: "Devin", kind: "devin", fetchedAt: 1, source: "command", command: "devin models list", ok: true, models: devin };
  const rawAgy = { providerId: "agy", providerName: "Antigravity", kind: "antigravity", fetchedAt: 1, source: "command", command: "agy models", ok: true, models: agy };
  const rawOllama = {
    providerId: "ol",
    providerName: "Ollama",
    kind: "ollama",
    fetchedAt: 1,
    source: "api",
    command: "api",
    ok: true,
    models: [{ id: "gemma4:12b", local: true, sizeB: 12 }, { id: "gemma4:e4b", local: true, sizeB: 4 }, { id: "gemma2:2b", local: true, sizeB: 2 }, { id: "nomic-embed-text:latest", local: true }]
  };
  const cat = curate([rawDevin, rawAgy, rawOllama], { keepVersionsPerFamily: 2, now: 5 });
  const dev = cat.models.filter((m) => m.providerId === "devin");
  const visOpus = dev.filter((m) => m.family === "claude-opus" && !m.hidden).map((m) => m.version).sort();
  check(visOpus.join() === "5,5.5", "claude-opus: only the newest two versions (5.5 and 5) stay visible");
  const hidOpus = dev.filter((m) => m.family === "claude-opus" && m.hidden);
  check(hidOpus.length >= 3 && hidOpus.every((m) => /superseded/.test(m.hiddenReason || "")), "older claude-opus versions are hidden with a reason");
  check(dev.filter((m) => m.family === "claude-sonnet" && !m.hidden).length === 2 && dev.some((m) => m.family === "claude-sonnet" && m.hidden), "claude-sonnet: 5.5 and 5 visible, 4.6 hidden");
  check(dev.filter((m) => m.family === "gemini-flash" && !m.hidden).map((m) => m.version).sort().join() === "3.7,3.8", "gemini-flash: 3.8 and 3.7 visible");
  const o55 = dev.find((m) => m.family === "claude-opus" && m.version === 5.5);
  check(o55.id === "claude-opus-5-5-medium" && Object.keys(o55.effortVariants).length >= 5 && o55.speedVariants.length >= 3, "effort and fast variants collapse into one entry represented by the medium variant");
  check(o55.tier === 5 && o55.category === "frontier" && o55.pricing?.outPerM === 20 && o55.pricing?.source === "listed", "opus is frontier with its listed price");
  const sweFree = dev.find((m) => m.family === "swe" && m.version === 2);
  check(sweFree.category === "free" && sweFree.pricing?.free === true, 'free hosted models are categorised "free"');
  check(dev.filter((m) => m.family === "fusion").length === 1, "hundreds of fusion combo ids collapse into one entry");
  check(dev.filter((m) => !m.hidden).length < 45, `the visible list is short (${dev.filter((m) => !m.hidden).length} of ${dev.length} entries)`);
  const ol = cat.models.filter((m) => m.providerId === "ol");
  check(ol.find((m) => m.id === "gemma4:12b").category === "local" && ol.find((m) => m.id === "nomic-embed-text:latest").hidden, 'local models are "local"; embeddings are hidden');
  check(!ol.find((m) => m.id === "gemma2:2b").hidden, "with keep=2 both gemma generations (4 and 2) stay visible");
  const agySonnet = cat.models.find((m) => m.providerId === "agy" && m.id === "claude-sonnet-5-5-medium");
  check(agySonnet.pricing?.source === "reference" && agySonnet.pricing?.outPerM === 10, "a provider without prices borrows the listed price of the same model elsewhere");
  const agyFlash = cat.models.find((m) => m.providerId === "agy" && m.family === "gemini-flash");
  check(agyFlash.tier === 2 && agyFlash.category === "fast", "flash models are the fast category");
  const keep1 = curate([rawDevin], { keepVersionsPerFamily: 1 });
  check(keep1.models.filter((m) => m.family === "claude-opus" && !m.hidden).length === 1, "keep=1 leaves only the newest version");
  console.log("\n--- script files on disk ---");
  const tmp = fs4.mkdtempSync(path6.join(os3.tmpdir(), "cat-"));
  const store = new CatalogStore(tmp);
  store.saveRaw(rawDevin);
  store.saveRaw(rawOllama);
  fs4.mkdirSync(path6.dirname(store.overridesPath), { recursive: true });
  fs4.writeFileSync(store.overridesPath, JSON.stringify({ "ol::*": { outPerM: 0.5, inPerM: 0.1 } }));
  const saved = store.curateSaved(2);
  check(fs4.existsSync(store.catalogPath) && saved.models.length > 20, "curate reads the saved raw files and writes catalog.json");
  const ovr = saved.models.find((m) => m.providerId === "ol" && m.id === "gemma4:12b");
  check(ovr.pricing?.source === "override" && ovr.pricing?.outPerM === 0.5, "pricing.overrides.json overrides listed/estimated prices");
  const patches = providerPatches([{ ...createProvider("devin", []), id: "devin" }], saved);
  check(patches.length === 1 && patches[0].models.length > 5 && patches[0].models.length <= 60 && patches[0].modelTiers.includes("claude-opus-5-5-medium=5"), "catalog -> provider model list and tier hints");
  check(patches[0].defaultModel !== "" && patches[0].models.includes(patches[0].defaultModel), "a valid default model is chosen");
  console.log("\n--- cost & budgets ---");
  check(ticketPoints(mkTicket({ estimate: "S" })) === 1 && ticketPoints(mkTicket({ estimate: "L (4-5 days)" })) === 8 && ticketPoints(mkTicket({ estimate: "M (2-3 days)" })) === 3, "ticket estimates map to points");
  check(estimateCost({ free: true, source: "listed" }, 3) === 0, "free models cost nothing");
  const sonnetCost = estimateCost({ inPerM: 3, cachedPerM: 0.3, outPerM: 15, source: "listed" }, 3);
  check(sonnetCost > 0.3 && sonnetCost < 1, `a medium ticket on a $3/$15 model costs roughly $0.5 (${sonnetCost.toFixed(2)})`);
  const NOW = new Date(2026, 9, 23, 14, 0, 0).getTime();
  check(new Date(periodStart("week", NOW)).getDay() === 1 && new Date(periodEnd("week", NOW)).getDate() === 26, "weeks run Monday to Monday");
  check(new Date(periodStart("month", NOW)).getDate() === 1 && new Date(periodEnd("month", NOW)).getMonth() === 10, "months run 1st to 1st");
  const budgetP = { ...createProvider("claude-code", []), id: "bp", name: "BP", maxParallel: 5, maxSessionsPerWindow: 0, minSpacingSeconds: 0, budgetDaily: 1, budgetWeekly: 5, budgetMonthly: 12, safetyMarginPct: 0 };
  const todayAt = new Date(2026, 9, 23, 9, 0, 0).getTime();
  const mBud = new SessionManager(() => budgetP, new NullLauncher(), storeWith({ spend: [{ providerId: "bp", model: "x", cost: 0.9, at: todayAt }] }), () => NOW);
  check(mBud.canStart(budgetP, NOW, 0.05).ok, "a run that fits under the daily cap is allowed");
  const over = mBud.canStart(budgetP, NOW, 0.2);
  check(!over.ok && /Daily budget/.test(over.reason || "") && over.retryAt === periodEnd("day", NOW), "a run that would cross the daily cap waits until tomorrow");
  const mWeek = new SessionManager(() => budgetP, new NullLauncher(), storeWith({ spend: [
    { providerId: "bp", model: "x", cost: 2.5, at: new Date(2026, 9, 20, 10).getTime() },
    { providerId: "bp", model: "x", cost: 2.4, at: new Date(2026, 9, 21, 10).getTime() }
  ] }), () => NOW);
  const wk = mWeek.canStart(budgetP, NOW, 0.3);
  check(!wk.ok && /Weekly budget/.test(wk.reason || "") && wk.retryAt === periodEnd("week", NOW), "weekly cap blocks even when today is empty");
  const mMonth = new SessionManager(() => budgetP, new NullLauncher(), storeWith({ spend: [{ providerId: "bp", model: "x", cost: 11.9, at: new Date(2026, 9, 2, 10).getTime() }] }), () => NOW);
  check(!mMonth.canStart(budgetP, NOW, 0.3).ok && /Monthly/.test(mMonth.canStart(budgetP, NOW, 0.3).reason || ""), "monthly cap blocks too");
  const mOk = new SessionManager(() => budgetP, new NullLauncher(), storeWith({ spend: [{ providerId: "bp", model: "x", cost: 50, at: new Date(2026, 8, 1).getTime() }] }), () => NOW);
  check(mOk.canStart(budgetP, NOW, 0.3).ok, "spend from earlier periods does not count");
  const started = await mBud.request({ provider: budgetP, model: "m", role: "worker", ticketPath: path6.join(tmp, "x.md"), ticketId: "X", ticketTitle: "X", boardId: "b", payload: {}, estCost: 0.05, points: 3 });
  check(started.status === "running" && Math.abs(mBud.spentSince("bp", periodStart("day", NOW)) - 0.95) < 1e-9, "starting a session records its estimated cost in the ledger");
  check(mBud.usage(budgetP).spend.day > 0.9 && mBud.usage(budgetP).budget.week === 5, "usage reports spend and caps per day / week / month");
  console.log("\n--- speed learning ---");
  const book = new SpeedBook();
  check(book.predict("p", "m", 3, 30) === 30, "with no history the prior is used");
  book.record("p", "m", 3, 6);
  const afterOne = book.predict("p", "m", 3, 30);
  check(afterOne < 30 && afterOne > 6, "one measurement shifts the estimate toward reality");
  book.record("p", "m", 3, 6);
  book.record("p", "m", 3, 6);
  check(Math.abs(book.predict("p", "m", 3, 30) - 6) < 0.5, "three measurements make the measurement dominant");
  console.log("\n--- optimizer: the time / cost / quota trade-off ---");
  const clockNow = NOW;
  const gem = {
    ...createProvider("antigravity", []),
    id: "gm",
    name: "Antigravity CLI",
    agentic: true,
    maxParallel: 3,
    minSpacingSeconds: 0,
    safetyMarginPct: 0,
    models: ["gemini-3.8-flash-medium"],
    defaultModel: "gemini-3.8-flash-medium",
    maxSessionsPerWindow: 40,
    windowMinutes: 300
  };
  const loc = {
    ...createProvider("ollama-aider", []),
    id: "ol",
    name: "Aider + Ollama",
    agentic: true,
    maxParallel: 1,
    minSpacingSeconds: 0,
    models: ["qwen2.5-coder:14b"],
    defaultModel: "qwen2.5-coder:14b",
    maxSessionsPerWindow: 0
  };
  const raws = [
    { providerId: "gm", providerName: "g", kind: "antigravity", fetchedAt: 1, source: "command", command: "", ok: true, models: [{ id: "gemini-3.8-flash-medium", pricing: { inPerM: 0.75, cachedPerM: 0.075, outPerM: 3.75, source: "listed" } }] },
    { providerId: "ol", providerName: "o", kind: "ollama-aider", fetchedAt: 1, source: "api", command: "", ok: true, models: [{ id: "qwen2.5-coder:14b", local: true, sizeB: 14, pricing: { free: true, source: "listed" } }] }
  ];
  const index = new CatalogIndex(curate(raws));
  const ticket = mkTicket({ estimate: "M" });
  const startsA = Array.from({ length: 20 }, (_, i) => clockNow - 285 * 6e4 + i * 6e4);
  const smA = new SessionManager((id) => id === "gm" ? gem : loc, new NullLauncher(), storeWith({ starts: { gm: startsA } }), () => clockNow);
  const ctxA = { catalog: index, speed: new SpeedBook(), bench: { "ol::qwen2.5-coder:14b": { tps: 9.6 } }, now: clockNow };
  const rankA = rankOptions(ticket, [gem, loc], smA, ctxA);
  const oll = rankA.find((o) => o.provider.id === "ol");
  check(Math.abs(oll.estMinutes - 45) <= 3, `Ollama is predicted at ~45 min (${Math.round(oll.estMinutes)})`);
  check(rankA[0].provider.id === "gm", `quota resets in 15 min: the fast hosted model wins (${rankA[0].summary})`);
  const gemWeek = { ...gem, windowMinutes: 7 * 24 * 60, maxSessionsPerWindow: 40 };
  const startsB = Array.from({ length: 32 }, (_, i) => clockNow - 5 * 24 * 36e5 + i * 36e5);
  const smB = new SessionManager((id) => id === "gm" ? gemWeek : loc, new NullLauncher(), storeWith({ starts: { gm: startsB } }), () => clockNow);
  const ctxB = { catalog: index, speed: new SpeedBook(), bench: { "ol::qwen2.5-coder:14b": { tps: 40 } }, now: clockNow };
  const rankB = rankOptions(ticket, [gemWeek, loc], smB, ctxB);
  const pressure = quotaPressure(gemWeek, smB, clockNow);
  check(pressure.lambdaCount > 1.5, `scarce quota is priced in (lambda ${pressure.lambdaCount.toFixed(2)})`);
  check(rankB[0].provider.id === "ol", `80% used, reset in 2 days: the slower local model wins (${rankB[0].summary})`);
  const fast = rankOptions(ticket, [gemWeek, loc], smB, { ...ctxB, objective: "speed" });
  check(fast[0].provider.id === "gm", 'the "speed" objective prefers the fast model');
  const cheap = rankOptions(ticket, [gem, loc], smA, { ...ctxA, objective: "cost" });
  check(cheap.length === 2, 'both options are ranked under the "cost" objective');
  const smBusy = new SessionManager((id) => id === "gm" ? gem : loc, new NullLauncher(), storeWith({ starts: { gm: startsA } }), () => clockNow);
  await smBusy.request({ provider: loc, model: "qwen2.5-coder:14b", role: "worker", ticketPath: path6.join(tmp, "busy.md"), ticketId: "B", ticketTitle: "B", boardId: "b", payload: {} });
  const rankBusy = rankOptions(ticket, [gem, loc], smBusy, ctxA);
  check(rankBusy.find((o) => o.provider.id === "ol").waitMinutes > 0 && !rankBusy.find((o) => o.provider.id === "ol").startsNow, "a busy provider is charged for the wait");
  const hard = mkTicket({ priority: "P0", type: "Architecture" });
  const rankHard = rankOptions(hard, [gem, loc], smA, ctxA);
  check(!rankHard.some((o) => o.provider.id === "gm"), "tickets that need a strong model never go to a weak one, however cheap");
  const gemCapped = { ...gem, budgetDaily: 0.05 };
  const smCap = new SessionManager((id) => id === "gm" ? gemCapped : loc, new NullLauncher(), storeWith({ starts: { gm: startsA }, spend: [{ providerId: "gm", model: "x", cost: 0.05, at: todayAt }] }), () => clockNow);
  const rankCap = rankOptions(ticket, [gemCapped, loc], smCap, ctxA);
  check(rankCap[0].provider.id === "ol" || rankCap.find((o) => o.provider.id === "gm").waitMinutes > 60, "a provider that hit its daily budget cap is deprioritised (it would wait until tomorrow)");
  const plan = planWork([{ ticket, boardId: "b", boardRoot: tmp }], [gem, loc], smA, { now: clockNow, optimizer: ctxA });
  check(plan.length === 1 && plan[0].providerId === "gm" && !!plan[0].estMinutes && plan[0].alternatives.length === 1, "the planner picks by optimizer and lists the runner-up with its estimates");
  console.log("\n--- Copilot model-policy import ---");
  const cop = parseCopilotPolicy(read("copilot.txt"));
  check(cop.length === 26, `parses every model in the pasted policy list (${cop.length})`);
  check(cop.filter((m) => m.enabled).length === 11, `knows which are enabled (${cop.filter((m) => m.enabled).length})`);
  const ids = cop.map((m) => m.id);
  check(ids.includes("claude-sonnet-5.5") && ids.includes("gpt-5.6-luna") && ids.includes("gemini-3.8-flash") && ids.includes("kimi-k3") && ids.includes("mai-code-1.1-flash"), "display names become CLI-style ids");
  check(ids.includes("claude-opus-4.8-fast") && ids.includes("gpt-5-mini") && ids.includes("grok-code-fast-1"), "fast-mode, mini and multi-word names are slugged sensibly");
  const copRaw = { providerId: "cp", providerName: "Copilot", kind: "copilot-cli", fetchedAt: 1, source: "import", command: "imports/cp.txt", ok: true, models: cop };
  const copCat = curate([copRaw], { keepVersionsPerFamily: 2 });
  const usable = copCat.models.filter((m) => !m.hidden);
  check(copCat.models.filter((m) => m.hidden && /disabled/.test(m.hiddenReason || "")).length >= 12, 'disabled models are hidden with the reason "disabled in your account / policy settings"');
  check(usable.every((m) => cop.find((r) => r.id === m.id)?.enabled === true), "only models enabled on your account stay visible");
  check(usable.some((m) => m.id === "claude-opus-4.8") && !usable.some((m) => m.id === "claude-opus-5.5"), "a disabled newer model (Opus 5.5) does not hide the enabled older one (Opus 4.8)");
  check(usable.some((m) => m.id === "claude-sonnet-5.5") && usable.some((m) => m.id === "claude-sonnet-5"), "enabled Sonnet 5.5 and 5 are kept");
  const impTmp = fs4.mkdtempSync(path6.join(os3.tmpdir(), "imp-"));
  const impStore = new CatalogStore(impTmp);
  impStore.saveImport("cp", read("copilot.txt"));
  const viaFile = await listProviderModels({ ...createProvider("copilot-cli", []), id: "cp" }, process.env, impStore.importsDir);
  check(viaFile.source === "import" && viaFile.models.length === 26 && viaFile.ok, "listing a provider prefers its imported model list");
  fs4.rmSync(impTmp, { recursive: true, force: true });
  console.log("\n--- semicolon-separated list with prices ---");
  const dl = parseImportedList(read("copilot-priced.txt"));
  check(dl.length === 26, `parses all 26 lines (${dl.length})`);
  check(dl.filter((m) => m.enabled).length === 11, "reads Enabled / Disabled");
  const s55 = dl.find((m) => m.id === "claude-sonnet-5.5");
  check(s55.enabled === true && s55.pricing?.inPerM === 2 && s55.pricing?.outPerM === 10 && s55.pricing?.source === "listed", 'reads "$2.00 in / $10.00 out" as listed prices');
  check(dl.find((m) => m.id === "gpt-5-mini").pricing === void 0 && dl.find((m) => m.id === "grok-code-fast-1").pricing === void 0, '"N/A" leaves the price unknown');
  check(dl.find((m) => m.id === "kimi-k3").label === "Kimi K3" && dl.find((m) => m.id === "mai-code-1.1-flash").enabled === true, "vendor is dropped; multi-word vendors work (Moonshot AI)");
  check(dl.find((m) => m.id === "claude-opus-4.8-fast").enabled === false, '"(fast mode) Preview" becomes -fast');
  const dRaw = { providerId: "cp", providerName: "Copilot", kind: "copilot-cli", fetchedAt: 1, source: "import", command: "imports/cp.txt", ok: true, models: dl };
  const dCat = curate([dRaw], { keepVersionsPerFamily: 2 });
  const dUse = dCat.models.filter((m) => !m.hidden);
  check(dUse.every((m) => dl.find((r) => r.id === m.id)?.enabled === true) && dUse.length >= 8, `only the enabled models are shown (${dUse.length})`);
  check(dUse.find((m) => m.id === "claude-sonnet-5.5").pricing?.outPerM === 10 && dUse.find((m) => m.id === "claude-sonnet-5.5").pricing?.source === "listed", "your prices are used instead of estimates");
  check(parseImportedList("claude-sonnet-5.5\ngpt-5.6-luna\n").length === 2, "a plain list of ids still works");
  check(parseImportedList(read("copilot.txt")).length === 26, "the Copilot settings-page format still works");
  console.log("\n--- reasoning level ---");
  const opusEntry = dev.find((m) => m.family === "claude-opus" && m.version === 5.5);
  const dvp = { ...createProvider("devin", []), id: "devin", name: "Devin", agentic: true, defaultReasoning: "medium", maxParallel: 5, minSpacingSeconds: 0, maxSessionsPerWindow: 0 };
  check(supportedLevels(dvp, opusEntry).join() === "low,medium,high,xhigh,max", "levels come from the model's effort variants, in order");
  check(supportedLevels(dvp, void 0).length === 0, "a model without effort variants or a flag has no reasoning control");
  check(supportedLevels({ ...dvp, effortFlag: "--effort" }, void 0).join() === "low,medium,high,xhigh,max", "a provider effort flag enables the standard levels");
  const easyT = mkTicket({ priority: "Low", estimate: "S" });
  const normT = mkTicket({ priority: "Normal", estimate: "M" });
  const hardT = mkTicket({ priority: "P0", type: "Architecture", estimate: "L" });
  check(pickReasoning(easyT, dvp, opusEntry) === "low", "easy ticket: one step below the default (low)");
  check(pickReasoning(normT, dvp, opusEntry) === "medium", "normal ticket: the default level");
  check(["high", "xhigh", "max"].includes(pickReasoning(hardT, dvp, opusEntry)) && order5(pickReasoning(hardT, dvp, opusEntry)) >= order5("high"), "critical architecture ticket: raised at least to high");
  check(pickReasoning(normT, { ...dvp, defaultReasoning: "high" }, opusEntry) === "high", "the provider default level is the starting point");
  check(pickReasoning(normT, dvp, opusEntry, "cost") === "low" && pickReasoning(normT, dvp, opusEntry, "speed") === "low", "cost and speed objectives lower it");
  check(pickReasoning(mkTicket({ labels: ["reasoning:max"] }), dvp, opusEntry) === "max" && pickReasoning(mkTicket({ labels: ["reasoning:bogus"] }), dvp, opusEntry) === "medium", "a reasoning:<level> label pins the level (unsupported ones are ignored)");
  const r1 = resolveReasoning(dvp, opusEntry, "claude-opus-5-5-medium", "high");
  check(r1.model === "claude-opus-5-5-high" && r1.level === "high" && r1.effort === void 0, "effort variants are selected by model id (claude-opus-5-5-high)");
  const r2 = resolveReasoning({ ...dvp, effortFlag: "--reasoning-effort" }, void 0, "gpt-x", "high");
  check(r2.model === "gpt-x" && r2.effort === "high", "without variants the level goes to the CLI flag");
  check(resolveReasoning(dvp, void 0, "plain", "high").level === "", "unsupported models ignore the level");
  const effCmd = AgentRunner.formatCliCommand(mkTicket(), { id: "cp", name: "Copilot", type: "agent", agentConfig: { type: "cli", command: 'copilot {model_args} -p "{task}"' } }, os3.tmpdir(), void 0, "b", { shell: "posix", model: "claude-sonnet-5.5", modelFlag: "--model", effort: "high", effortFlag: "--reasoning-effort" });
  check(effCmd.includes("--model claude-sonnet-5.5") && effCmd.endsWith("--reasoning-effort high"), "the effort flag is appended to the command");
  check(!AgentRunner.formatCliCommand(mkTicket(), { id: "cp", name: "C", type: "agent", agentConfig: { type: "cli", command: 'copilot -p "x"' } }, os3.tmpdir(), void 0, "b", { shell: "posix", effort: "high; rm -rf ~", effortFlag: "--reasoning-effort" }).includes("rm -rf"), "effort values are validated before reaching a shell");
  const dvIdx = new CatalogIndex(curate([rawDevin]));
  const dvSm = new SessionManager(() => dvp, new NullLauncher(), storeWith({}), () => clockNow);
  const hiOpts = rankOptions(hardT, [dvp], dvSm, { catalog: dvIdx, speed: new SpeedBook(), now: clockNow });
  const loOpts = rankOptions(easyT, [dvp], dvSm, { catalog: dvIdx, speed: new SpeedBook(), now: clockNow });
  const hiOpus = hiOpts.find((o) => o.model.startsWith("claude-opus-5-5"));
  const loOpus = loOpts.find((o) => o.model.startsWith("claude-opus-5-5"));
  check(!!hiOpus && ["high", "xhigh", "max"].includes(hiOpus.reasoning) && hiOpus.model.endsWith(hiOpus.reasoning), "hard ticket on Opus runs the high-reasoning variant id");
  check(!loOpus || loOpus.reasoning === "low", "easy ticket never gets more than low");
  const mediumCost = estimateRun(normT, dvp, "claude-opus-5-5-medium", { catalog: dvIdx, speed: new SpeedBook() }, "medium");
  const maxCost = estimateRun(normT, dvp, "claude-opus-5-5-max", { catalog: dvIdx, speed: new SpeedBook() }, "max");
  check(maxCost.estCost > mediumCost.estCost * 2 && maxCost.estMinutes > mediumCost.estMinutes * 2, "max reasoning costs ~2.5x the tokens and time of medium");
  console.log("\n--- Devin Fusion picker data ---");
  const combos = fusionCombos(rawDevin);
  check(combos.length === 575, `finds every fusion combination (${combos.length})`);
  const mains = [...new Set(combos.map((c2) => c2.main))];
  check(mains.length > 5 && mains.length < 200 && combos.every((c2) => c2.main && c2.side), `step 1 offers distinct main models (${mains.length}); every combo has a main and a side-kick`);
  const sw = combos.filter((c2) => c2.side === "SWE-2 Medium");
  check(sw.length === 80 || sw.length > 40, `step 2 can offer SWE-2 Medium as side-kick (${sw.length} mains)`);
  const pick = combos.find((c2) => c2.id === "fusion-claude-opus-5-5-medium-sidekick-swe-2-medium");
  check(!!pick && pick.main === "Claude Opus 5.5 Medium" && pick.side === "SWE-2 Medium" && pick.outPerM === 20, "main + side-kick resolve to the exact Devin model id with its own price");
  const fCat = new CatalogIndex(curate([rawDevin]));
  check(fCat.get("devin", pick.id) !== void 0, "a pinned fusion id is recognised by the catalog");
  const otherFusion = combos.find((c2) => c2.outPerM !== void 0 && c2.outPerM !== 20 && c2.outPerM !== void 0);
  check(fCat.pricingFor("devin", otherFusion.id)?.outPerM === otherFusion.outPerM, "each fusion id is priced by its own listing, not the family average");
  fs4.rmSync(tmp, { recursive: true, force: true });
  if (failures) {
    console.error(`
${failures} catalog check(s) FAILED`);
    process.exit(1);
  }
  console.log("\n=== All catalog tests passed ===");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
//# sourceMappingURL=catalogTests.js.map
