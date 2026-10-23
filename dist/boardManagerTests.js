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

// test/boardManagerTests.ts
var fs4 = __toESM(require("fs"));
var os = __toESM(require("os"));
var path5 = __toESM(require("path"));

// test/fixtures/vscodeStub.ts
var fs = __toESM(require("fs"));
var messages = [];
var EventEmitter = class {
  fns = [];
  event = (fn) => {
    this.fns.push(fn);
    return { dispose() {
    } };
  };
  fire(e) {
    this.fns.forEach((f) => f(e));
  }
};
var Uri = { file: (p) => ({ fsPath: p, scheme: "file" }) };
var workspace = {
  workspaceFolders: void 0,
  getConfiguration: () => ({ get: (_k, d) => d }),
  fs: {
    rename: async (a, b, opts) => {
      if (!opts?.overwrite && fs.existsSync(b.fsPath))
        throw new Error("exists");
      fs.renameSync(a.fsPath, b.fsPath);
    }
  },
  createFileSystemWatcher: () => ({ onDidCreate() {
  }, onDidChange() {
  }, onDidDelete() {
  }, dispose() {
  } })
};
var window = {
  showErrorMessage: (text) => {
    messages.push({ level: "error", text });
  },
  showWarningMessage: (text) => {
    messages.push({ level: "warn", text });
  },
  showInformationMessage: (text) => {
    messages.push({ level: "info", text });
  }
};
var RelativePattern = class {
  constructor(base, pattern) {
    this.base = base;
    this.pattern = pattern;
  }
};
var FileType = { Directory: 2, File: 1 };

// src/boardManager.ts
var path4 = __toESM(require("path"));
var fs3 = __toESM(require("fs"));

// src/boardDiscovery.ts
var path2 = __toESM(require("path"));
var fs2 = __toESM(require("fs"));

// src/ticketParser.ts
var path = __toESM(require("path"));
var TicketParser = class {
  static parse(filePath, content, boardRoot, column, subfolder, mtime = Date.now()) {
    const filename = path.basename(filePath);
    const relativePath = path.relative(boardRoot, filePath).replace(/\\/g, "/");
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

// src/boardDiscovery.ts
var BoardDiscovery = class {
  static async discoverBoards(workspaceFolders) {
    const boards = [];
    const config = workspace.getConfiguration("agenticKanban");
    const boardPatterns = config.get("boardPatterns", ["**/Tickets", "**/tickets", "**/.kanban"]);
    const ignoredFiles = config.get("ignoredFiles", []).map((f) => f.toLowerCase());
    const discoveredRoots = /* @__PURE__ */ new Set();
    for (const folder of workspaceFolders) {
      for (const pattern of boardPatterns) {
        const relativePattern = new RelativePattern(folder, pattern);
        const uris = await workspace.findFiles(relativePattern, "**/node_modules/**");
        for (const uri of uris) {
          const stat = await workspace.fs.stat(uri);
          if (stat.type === FileType.Directory) {
            discoveredRoots.add(uri.fsPath);
          }
        }
      }
      await this.scanDirectoryForBoards(folder.uri.fsPath, discoveredRoots, 0);
    }
    for (const rootPath of discoveredRoots) {
      try {
        const board = await this.buildBoard(rootPath, ignoredFiles);
        if (board) {
          boards.push(board);
        }
      } catch (err) {
        console.error(`Error building board at ${rootPath}:`, err);
      }
    }
    boards.sort((a, b) => {
      const aDepth = a.rootPath.split(/[\\/]/).length;
      const bDepth = b.rootPath.split(/[\\/]/).length;
      if (aDepth !== bDepth)
        return aDepth - bDepth;
      const aIsExample = a.rootPath.toLowerCase().includes("example");
      const bIsExample = b.rootPath.toLowerCase().includes("example");
      if (aIsExample !== bIsExample)
        return aIsExample ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
    return boards;
  }
  static async scanDirectoryForBoards(dirPath, discoveredRoots, depth) {
    if (depth > 5)
      return;
    if (path2.basename(dirPath).startsWith(".") || dirPath.includes("node_modules") || dirPath.includes("dist") || dirPath.includes("out")) {
      return;
    }
    try {
      const entries = await fs2.promises.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subPath = path2.join(dirPath, entry.name);
          if (entry.name.toLowerCase() === "tickets") {
            discoveredRoots.add(subPath);
          } else {
            const configPath = path2.join(subPath, "config.md");
            if (fs2.existsSync(configPath)) {
              discoveredRoots.add(subPath);
            } else {
              await this.scanDirectoryForBoards(subPath, discoveredRoots, depth + 1);
            }
          }
        }
      }
    } catch {
    }
  }
  static async buildBoard(rootPath, ignoredFiles) {
    if (!fs2.existsSync(rootPath))
      return null;
    const folderName = path2.basename(rootPath);
    const parentFolder = path2.basename(path2.dirname(rootPath));
    const defaultBoardName = parentFolder && parentFolder !== "." ? `${parentFolder} (${folderName})` : folderName;
    const boardId = Buffer.from(path2.resolve(rootPath).toLowerCase()).toString("base64url");
    let boardConfig = {
      name: defaultBoardName,
      columnsOrder: [],
      autoUpdateStatus: true,
      defaultAgent: null,
      assignees: []
    };
    const configPath = path2.join(rootPath, "config.md");
    if (fs2.existsSync(configPath)) {
      try {
        const configContent = await fs2.promises.readFile(configPath, "utf8");
        boardConfig = ConfigParser.parse(configContent, defaultBoardName);
      } catch (e) {
        console.warn(`Could not parse config.md at ${configPath}:`, e);
      }
    }
    let planDocument = null;
    try {
      const rootFiles = await fs2.promises.readdir(rootPath, { withFileTypes: true });
      for (const file of rootFiles) {
        if (!file.isDirectory() && (file.name.startsWith("00_") || file.name.toLowerCase() === "plan.md")) {
          const filePath = path2.join(rootPath, file.name);
          const content = await fs2.promises.readFile(filePath, "utf8");
          planDocument = {
            path: filePath,
            title: file.name.replace(/\.md$/i, ""),
            content
          };
          break;
        }
      }
    } catch {
    }
    const columns = [];
    const entries = await fs2.promises.readdir(rootPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory())
        continue;
      if (entry.name.startsWith(".") || entry.name === "node_modules")
        continue;
      const columnPath = path2.join(rootPath, entry.name);
      const columnName = entry.name;
      const columnId = columnName.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
      let columnGuide = null;
      const columnWhatwhy = path2.join(columnPath, "Whatwhy.md");
      const columnReadme = path2.join(columnPath, "README.md");
      if (fs2.existsSync(columnWhatwhy)) {
        columnGuide = await fs2.promises.readFile(columnWhatwhy, "utf8");
      } else if (fs2.existsSync(columnReadme)) {
        columnGuide = await fs2.promises.readFile(columnReadme, "utf8");
      }
      const subfolders = [];
      const tickets = [];
      const colChildren = await fs2.promises.readdir(columnPath, { withFileTypes: true });
      for (const child of colChildren) {
        const childPath = path2.join(columnPath, child.name);
        if (child.isDirectory()) {
          if (child.name.startsWith("."))
            continue;
          let subGuide = null;
          const subWhatwhy = path2.join(childPath, "Whatwhy.md");
          if (fs2.existsSync(subWhatwhy)) {
            subGuide = await fs2.promises.readFile(subWhatwhy, "utf8");
          }
          let subTicketCount = 0;
          const subEntries = await fs2.promises.readdir(childPath, { withFileTypes: true });
          for (const subChild of subEntries) {
            if (!subChild.isDirectory() && subChild.name.endsWith(".md")) {
              if (this.isIgnoredFile(subChild.name, ignoredFiles))
                continue;
              const ticketPath = path2.join(childPath, subChild.name);
              const stat = await fs2.promises.stat(ticketPath);
              const content = await fs2.promises.readFile(ticketPath, "utf8");
              const ticket = TicketParser.parse(ticketPath, content, rootPath, columnName, child.name, stat.mtimeMs);
              tickets.push(ticket);
              subTicketCount++;
            }
          }
          subfolders.push({
            name: child.name,
            path: childPath,
            whatWhyGuide: subGuide ? subGuide.trim() : null,
            ticketCount: subTicketCount
          });
        } else if (child.name.endsWith(".md")) {
          if (this.isIgnoredFile(child.name, ignoredFiles))
            continue;
          const ticketPath = childPath;
          const stat = await fs2.promises.stat(ticketPath);
          const content = await fs2.promises.readFile(ticketPath, "utf8");
          const ticket = TicketParser.parse(ticketPath, content, rootPath, columnName, null, stat.mtimeMs);
          tickets.push(ticket);
        }
      }
      columns.push({
        id: columnId,
        name: columnName,
        path: columnPath,
        subfolders,
        tickets,
        whatWhyGuide: columnGuide ? columnGuide.trim() : null
      });
    }
    this.sortColumns(columns, boardConfig.columnsOrder);
    const templates = [];
    const templatesDir = path2.join(rootPath, ".templates");
    if (fs2.existsSync(templatesDir)) {
      try {
        const templateEntries = await fs2.promises.readdir(templatesDir, { withFileTypes: true });
        for (const te of templateEntries) {
          if (!te.isDirectory() && te.name.endsWith(".md")) {
            const tPath = path2.join(templatesDir, te.name);
            const content = await fs2.promises.readFile(tPath, "utf8");
            const id = te.name.replace(/\.md$/i, "").toLowerCase();
            const h1Match = content.match(/^#\s+(.+)$/m);
            const rawName = h1Match ? h1Match[1].replace(/\{id\}\s*[—–\-:]*\s*/i, "").trim() : id.charAt(0).toUpperCase() + id.slice(1);
            templates.push({
              id,
              name: rawName || id,
              filename: te.name,
              content
            });
          }
        }
      } catch (e) {
        console.warn(`Could not read .templates at ${templatesDir}:`, e);
      }
    }
    const ticketMap = /* @__PURE__ */ new Map();
    for (const col of columns) {
      for (const t of col.tickets) {
        if (t.id) {
          ticketMap.set(t.id.toUpperCase(), { column: col.name, ticket: t });
        }
      }
    }
    for (const col of columns) {
      for (const t of col.tickets) {
        if (t.dependsOn && t.dependsOn.length > 0) {
          const unresolved = [];
          for (const dep of t.dependsOn) {
            const depKey = dep.toUpperCase();
            const found = ticketMap.get(depKey);
            if (!found) {
              unresolved.push(dep);
            } else {
              const colLower = found.column.toLowerCase();
              const isCompleted = colLower.includes("complete") || colLower.includes("done");
              if (!isCompleted) {
                unresolved.push(`${dep} (${found.column})`);
              }
            }
          }
          if (unresolved.length > 0) {
            t.unresolvedDependencies = unresolved;
          }
        }
      }
    }
    return {
      id: boardId,
      name: boardConfig.name,
      rootPath,
      columns,
      config: boardConfig,
      planDocument,
      templates: templates.length > 0 ? templates : void 0,
      lastScanned: Date.now()
    };
  }
  static isIgnoredFile(filename, ignoredFiles) {
    const lower = filename.toLowerCase();
    if (lower.startsWith("00_") || lower.startsWith("_"))
      return true;
    return ignoredFiles.includes(lower);
  }
  static sortColumns(columns, preferredOrder) {
    if (preferredOrder && preferredOrder.length > 0) {
      const orderMap = /* @__PURE__ */ new Map();
      preferredOrder.forEach((name, index) => {
        orderMap.set(name.toLowerCase(), index);
      });
      columns.sort((a, b) => {
        const orderA = orderMap.has(a.name.toLowerCase()) ? orderMap.get(a.name.toLowerCase()) : 999;
        const orderB = orderMap.has(b.name.toLowerCase()) ? orderMap.get(b.name.toLowerCase()) : 999;
        if (orderA !== orderB)
          return orderA - orderB;
        return a.name.localeCompare(b.name);
      });
      return;
    }
    const defaultOrder = ["backlog", "ready", "todo", "to do", "ongoing", "in progress", "assistance required", "blocked", "review", "done", "completed"];
    columns.sort((a, b) => {
      const idxA = defaultOrder.indexOf(a.name.toLowerCase());
      const idxB = defaultOrder.indexOf(b.name.toLowerCase());
      const scoreA = idxA !== -1 ? idxA : 100;
      const scoreB = idxB !== -1 ? idxB : 100;
      if (scoreA !== scoreB)
        return scoreA - scoreB;
      return a.name.localeCompare(b.name);
    });
  }
};

// src/pathUtils.ts
var path3 = __toESM(require("path"));
var CASE_INSENSITIVE = process.platform === "win32" || process.platform === "darwin";
function norm(p) {
  const resolved = path3.resolve(p);
  return CASE_INSENSITIVE ? resolved.toLowerCase() : resolved;
}
function isInside(root, candidate) {
  if (!root || !candidate)
    return false;
  const r = norm(root);
  const c = norm(candidate);
  if (c === r)
    return true;
  const prefix = r.endsWith(path3.sep) ? r : r + path3.sep;
  return c.startsWith(prefix);
}
function safeJoin(root, ...segments) {
  let current = path3.resolve(root);
  for (const seg of segments) {
    if (seg === null || seg === void 0 || seg === "")
      continue;
    if (path3.isAbsolute(seg) || /^[a-zA-Z]:/.test(seg))
      return null;
    current = path3.resolve(current, seg);
  }
  return isInside(root, current) ? current : null;
}
function slugify(title, maxLen = 40) {
  const slug = title.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, maxLen).replace(/-$/, "");
  return slug || "untitled";
}

// src/boardManager.ts
var BoardManager = class _BoardManager {
  static instance;
  boards = /* @__PURE__ */ new Map();
  watchers = [];
  changeEmitter = new EventEmitter();
  onDidChangeBoard = this.changeEmitter.event;
  debounceTimer = null;
  pendingFiles = /* @__PURE__ */ new Set();
  workLogCache = /* @__PURE__ */ new Map();
  static getInstance() {
    if (!this.instance) {
      this.instance = new _BoardManager();
    }
    return this.instance;
  }
  async reloadBoards() {
    const folders = workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      this.boards.clear();
      return [];
    }
    const discovered = await BoardDiscovery.discoverBoards(folders);
    this.boards.clear();
    for (const b of discovered) {
      this.boards.set(b.id, b);
    }
    return discovered;
  }
  getAllBoards() {
    return Array.from(this.boards.values());
  }
  getBoard(idOrRoot) {
    if (!idOrRoot)
      return void 0;
    if (this.boards.has(idOrRoot)) {
      return this.boards.get(idOrRoot);
    }
    try {
      const normalizedKey = Buffer.from(path4.resolve(idOrRoot).toLowerCase()).toString("base64url");
      if (this.boards.has(normalizedKey)) {
        return this.boards.get(normalizedKey);
      }
    } catch {
    }
    for (const b of this.boards.values()) {
      if (b.id === idOrRoot || b.rootPath.toLowerCase() === idOrRoot.toLowerCase() || path4.resolve(b.rootPath).toLowerCase() === path4.resolve(idOrRoot).toLowerCase()) {
        return b;
      }
    }
    return void 0;
  }
  getMultiBoardOverview() {
    const boardsList = this.getAllBoards();
    let totalTickets = 0;
    let ongoingTicketsCount = 0;
    let blockedTicketsCount = 0;
    let assistanceRequiredCount = 0;
    let blockedByDependencyCount = 0;
    const recentWorkLogs = [];
    const activeTickets = [];
    const boardsSummary = boardsList.map((b) => {
      const colSummary = {};
      let bTicketCount = 0;
      for (const col of b.columns) {
        const count = col.tickets.length;
        colSummary[col.name] = count;
        bTicketCount += count;
        totalTickets += count;
        const colLower = col.name.toLowerCase();
        if (colLower.includes("ongoing") || colLower.includes("in progress")) {
          ongoingTicketsCount += count;
          col.tickets.forEach((t) => activeTickets.push({ ticket: t, boardId: b.id, boardName: b.name }));
        } else if (colLower.includes("blocked")) {
          blockedTicketsCount += count;
        } else if (colLower.includes("assistance")) {
          assistanceRequiredCount += count;
          col.tickets.forEach((t) => activeTickets.push({ ticket: t, boardId: b.id, boardName: b.name }));
        }
        for (const t of col.tickets) {
          if (t.unresolvedDependencies && t.unresolvedDependencies.length > 0) {
            blockedByDependencyCount++;
          }
          if (t.hasWorkLog) {
            const cached = this.workLogCache.get(t.path);
            if (cached && cached.mtime === t.mtime) {
              recentWorkLogs.push(...cached.logs);
            } else {
              try {
                const fileContent = fs3.readFileSync(t.path, "utf8");
                const logs = TicketParser.extractWorkLogEntries(fileContent, t.id, t.title, t.path, b.id, b.name);
                this.workLogCache.set(t.path, { mtime: t.mtime, logs });
                recentWorkLogs.push(...logs);
              } catch {
              }
            }
          }
        }
      }
      return {
        id: b.id,
        name: b.name,
        rootPath: b.rootPath,
        ticketCount: bTicketCount,
        columnsSummary: colSummary
      };
    });
    recentWorkLogs.sort((a, b) => {
      const timeA = a.timestamp || (a.date ? Date.parse(a.date) : 0) || 0;
      const timeB = b.timestamp || (b.date ? Date.parse(b.date) : 0) || 0;
      return timeB - timeA;
    });
    return {
      totalBoards: boardsList.length,
      totalTickets,
      ongoingTicketsCount,
      blockedTicketsCount,
      assistanceRequiredCount,
      blockedByDependencyCount,
      recentWorkLogs,
      boards: boardsSummary,
      activeTickets
    };
  }
  findBoardForTicketPath(ticketPath) {
    if (!ticketPath)
      return void 0;
    for (const board of this.boards.values()) {
      if (isInside(board.rootPath, ticketPath)) {
        return board;
      }
    }
    for (const board of this.boards.values()) {
      const source = this.resolveTicketPathOnDisk(board, ticketPath);
      if (source) {
        return board;
      }
    }
    return void 0;
  }
  resolveTicketPathOnDisk(board, ticketPath) {
    if (!ticketPath)
      return null;
    const resolved = path4.resolve(ticketPath);
    if (fs3.existsSync(resolved)) {
      return resolved;
    }
    const relToBoard = path4.resolve(board.rootPath, ticketPath);
    if (fs3.existsSync(relToBoard)) {
      return relToBoard;
    }
    const targetFilename = path4.basename(ticketPath).toLowerCase();
    const searchInDir = (dir) => {
      try {
        const entries = fs3.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path4.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
              const res = searchInDir(full);
              if (res)
                return res;
            }
          } else if (entry.name.toLowerCase() === targetFilename) {
            return full;
          }
        }
      } catch {
      }
      return null;
    };
    return searchInDir(board.rootPath);
  }
  async moveTicket(boardId, ticketPath, targetColumn, targetSubfolder) {
    let board = this.getBoard(boardId);
    if (!board || ticketPath && !isInside(board.rootPath, ticketPath)) {
      const candidate = this.findBoardForTicketPath(ticketPath);
      if (candidate) {
        board = candidate;
      }
    }
    if (!board) {
      window.showErrorMessage(`Board not found: ${boardId}`);
      return false;
    }
    const sourcePath = this.resolveTicketPathOnDisk(board, ticketPath);
    if (!sourcePath) {
      window.showErrorMessage(`Ticket file not found on disk: ${ticketPath}`);
      return false;
    }
    const filename = path4.basename(sourcePath);
    const targetDir = safeJoin(board.rootPath, targetColumn, targetSubfolder);
    if (!targetDir || path4.resolve(targetDir) === path4.resolve(board.rootPath)) {
      window.showErrorMessage(`Invalid target column: ${targetColumn}`);
      return false;
    }
    if (!fs3.existsSync(targetDir)) {
      await fs3.promises.mkdir(targetDir, { recursive: true });
    }
    const targetPath = path4.join(targetDir, filename);
    if (path4.resolve(targetPath).toLowerCase() === path4.resolve(sourcePath).toLowerCase()) {
      return true;
    }
    if (fs3.existsSync(targetPath)) {
      window.showErrorMessage(`Cannot move "${filename}": a ticket with that name already exists in ${targetColumn}${targetSubfolder ? "/" + targetSubfolder : ""}.`);
      return false;
    }
    try {
      try {
        await workspace.fs.rename(Uri.file(sourcePath), Uri.file(targetPath), { overwrite: false });
      } catch (fsErr) {
        await fs3.promises.rename(sourcePath, targetPath);
      }
      console.log(`[Agentic Kanban] Successfully moved ticket "${filename}" to "${targetColumn}${targetSubfolder ? "/" + targetSubfolder : ""}"`);
      const autoUpdate = board.config.autoUpdateStatus;
      if (autoUpdate) {
        try {
          const content = await fs3.promises.readFile(targetPath, "utf8");
          const updated = TicketParser.updateTicketStatus(content, targetColumn);
          if (updated !== content) {
            await fs3.promises.writeFile(targetPath, updated, "utf8");
          }
        } catch (e) {
          console.warn("Could not update status field in ticket content:", e);
        }
      }
      await this.reloadSingleBoard(board.rootPath);
      return true;
    } catch (err) {
      window.showErrorMessage(`Failed to move ticket: ${err?.message || err}`);
      return false;
    }
  }
  async assignTicket(boardId, ticketPath, assigneeName) {
    let board = this.getBoard(boardId);
    if (!board || ticketPath && !isInside(board.rootPath, ticketPath)) {
      const candidate = this.findBoardForTicketPath(ticketPath);
      if (candidate) {
        board = candidate;
      }
    }
    if (!board) {
      window.showErrorMessage(`Board not found: ${boardId}`);
      return false;
    }
    const sourcePath = this.resolveTicketPathOnDisk(board, ticketPath);
    if (!sourcePath) {
      window.showErrorMessage(`Ticket file not found on disk: ${ticketPath}`);
      return false;
    }
    try {
      const content = await fs3.promises.readFile(sourcePath, "utf8");
      const updated = TicketParser.updateTicketAssignee(content, assigneeName);
      if (updated !== content) {
        await fs3.promises.writeFile(sourcePath, updated, "utf8");
        console.log(`[Agentic Kanban] Successfully wrote assignment "${assigneeName}" to ${sourcePath}`);
      }
      await this.reloadSingleBoard(board.rootPath);
      return true;
    } catch (err) {
      window.showErrorMessage(`Failed to assign ticket: ${err?.message || err}`);
      return false;
    }
  }
  async toggleTicketCriterion(ticketPath, index, done) {
    const board = this.findBoardForTicketPath(ticketPath);
    const resolvedPath = board ? this.resolveTicketPathOnDisk(board, ticketPath) : fs3.existsSync(ticketPath) ? ticketPath : null;
    if (!resolvedPath) {
      window.showErrorMessage(`Ticket file not found: ${ticketPath}`);
      return false;
    }
    try {
      const content = await fs3.promises.readFile(resolvedPath, "utf8");
      const updated = TicketParser.toggleCriterion(content, index, done);
      if (updated !== content) {
        await fs3.promises.writeFile(resolvedPath, updated, "utf8");
      }
      if (board) {
        await this.reloadSingleBoard(board.rootPath);
      }
      return true;
    } catch (err) {
      window.showErrorMessage(`Failed to update acceptance criterion: ${err?.message || err}`);
      return false;
    }
  }
  async createTicket(boardId, targetColumn, targetSubfolder, title, initialContent) {
    const board = this.getBoard(boardId);
    if (!board)
      return null;
    const targetDir = safeJoin(board.rootPath, targetColumn, targetSubfolder);
    if (!targetDir || path4.resolve(targetDir) === path4.resolve(board.rootPath)) {
      window.showErrorMessage(`Invalid target column: ${targetColumn}`);
      return null;
    }
    if (!fs3.existsSync(targetDir)) {
      await fs3.promises.mkdir(targetDir, { recursive: true });
    }
    const slug = slugify(title);
    const dateStr = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    let filename = `ticket-${dateStr}-${slug}.md`;
    let fullPath = path4.join(targetDir, filename);
    let counter = 1;
    let idSuffix = "";
    while (fs3.existsSync(fullPath)) {
      filename = `ticket-${dateStr}-${slug}-${counter}.md`;
      idSuffix = `-${counter}`;
      fullPath = path4.join(targetDir, filename);
      counter++;
    }
    let defaultContent = initialContent;
    if (defaultContent) {
      const generatedId = `T-${slug.toUpperCase()}${idSuffix}`;
      defaultContent = defaultContent.split("{id}").join(generatedId).split("{title}").join(title).split("{column}").join(targetColumn).split("{date}").join(dateStr).split("{user}").join("Unassigned").split("{assignee}").join("Unassigned");
    } else {
      defaultContent = `# ${title}

| Field | Value |
|-------|-------|
| **Priority** | Normal |
| **Status** | ${targetColumn} |
| **Labels** | |

## Summary
Describe what this ticket is about.

## Acceptance Criteria
- [ ] Requirements defined
- [ ] Implementation completed
- [ ] Tests verified
`;
    }
    await fs3.promises.writeFile(fullPath, defaultContent, "utf8");
    await this.reloadSingleBoard(board.rootPath);
    return fullPath;
  }
  async generateAgentRules(boardId) {
    let board = boardId ? this.getBoard(boardId) : void 0;
    if (!board) {
      const boards = this.getAllBoards();
      if (boards.length > 0)
        board = boards[0];
    }
    if (!board) {
      window.showWarningMessage("No active Kanban board found to generate agent rules.");
      return null;
    }
    const wsFolder = workspace.workspaceFolders?.[0]?.uri.fsPath || path4.dirname(board.rootPath);
    const agentsDir = path4.join(wsFolder, ".agents");
    let targetPath = path4.join(wsFolder, "AGENTS.md");
    if (fs3.existsSync(agentsDir)) {
      const rulesDir = path4.join(agentsDir, "rules");
      if (!fs3.existsSync(rulesDir)) {
        await fs3.promises.mkdir(rulesDir, { recursive: true });
      }
      targetPath = path4.join(rulesDir, "kanban.md");
    } else if (fs3.existsSync(path4.join(wsFolder, "AGENT.md")) && !fs3.existsSync(path4.join(wsFolder, "AGENTS.md"))) {
      targetPath = path4.join(wsFolder, "AGENT.md");
    }
    const relBoardPath = path4.relative(wsFolder, board.rootPath).replace(/\\/g, "/") || "Tickets";
    const colsList = board.columns.map((c) => `- \`${relBoardPath}/${c.name}/\``).join("\n");
    const content = `# Project Operating Rules: Agentic Kanban

This project uses **Agentic Kanban** for task management. All tasks, features, and defects are tracked as Markdown files inside the board directory: \`${relBoardPath}/\`.

## Board Structure & Columns
${colsList}

## Agent Operating Workflow
1. **Discover & Inspect**:
   - Look in \`${relBoardPath}/Backlog/\` (or \`${relBoardPath}/Backlog/Ready/\`) for assigned or available tasks.
   - Check \`| **Depends on** |\` field: do not proceed if prerequisite tickets are not yet in \`${relBoardPath}/Completed/\`.
2. **Claim a Ticket**:
   - Move the ticket file into \`${relBoardPath}/Ongoing/\` (prefer \`git mv\` to preserve history).
   - Set the \`| **Assignee** | <YourName> |\` and \`| **Status** | Ongoing |\` in the ticket metadata table.
   - Add an initial timestamped entry under \`## Work Log\`.
3. **Specify Requirements (if needed)**:
   - Ensure the ticket has a clear summary, technical specification, and structured acceptance criteria with checkboxes (\`- [ ]\`).
4. **Log Progress in Real-Time**:
   - In the ticket file under \`## Work Log\`, append timestamped entries for key steps, investigations, and decisions:
     \`\`\`markdown
     - **YYYY-MM-DD**: Started investigation of ...
     \`\`\`
   - Work logs are append-only; never delete previous entries.
5. **Complete Criteria & Verify**:
   - Check off each criterion under \`## Acceptance Criteria\` by toggling \`- [ ]\` to \`- [x]\`.
   - Run tests, builds, and static analysis to guarantee zero regressions.
6. **Finalize**:
   - Move the ticket file to \`${relBoardPath}/Completed/\`.
   - Update the status field to \`Completed\`.
   - Record a final verification log in \`## Work Log\`.
7. **Blockers & Assistance**:
   - If blocked by human review, credentials, or questions, move ticket to \`${relBoardPath}/Assistance Required/\`.
   - If blocked by dependencies or external factors, move ticket to \`${relBoardPath}/Blocked/\`.
   - Clearly document the blocking factor in \`## Work Log\`.
`;
    return { targetPath, created: !fs3.existsSync(targetPath), content };
  }
  async initTemplates(boardId) {
    let board = boardId ? this.getBoard(boardId) : void 0;
    if (!board) {
      const boards = this.getAllBoards();
      if (boards.length > 0)
        board = boards[0];
    }
    if (!board) {
      window.showWarningMessage("No Kanban board found to initialize templates.");
      return null;
    }
    const templatesDir = path4.join(board.rootPath, ".templates");
    if (!fs3.existsSync(templatesDir)) {
      await fs3.promises.mkdir(templatesDir, { recursive: true });
    }
    const created = [];
    const featurePath = path4.join(templatesDir, "feature.md");
    if (!fs3.existsSync(featurePath)) {
      const featureContent = `# {id} \u2014 {title}

| Field | Value |
|-------|-------|
| **Epic** | |
| **Type** | Feature |
| **Priority** | P1 \u2014 Core |
| **Estimate** | M (2\u20133 days) |
| **Status** | {column} |
| **Depends on** | \u2014 |
| **Blocks** | \u2014 |
| **Labels** | |
| **Milestone** | |

## Summary
Brief description of the feature and what user problem it solves.

## Description
Detailed background, UX requirements, architecture decisions, and implementation outline.

## Acceptance Criteria
- [ ] Requirements defined and reviewed
- [ ] Core implementation complete
- [ ] Unit & integration tests added and passing
- [ ] Documentation updated

## Technical Notes
- Implementation details and architectural guidelines.

## Work Log
- **{date}**: Created ticket.
`;
      await fs3.promises.writeFile(featurePath, featureContent, "utf8");
      created.push("feature.md");
    }
    const bugPath = path4.join(templatesDir, "bug.md");
    if (!fs3.existsSync(bugPath)) {
      const bugContent = `# {id} \u2014 Fix: {title}

| Field | Value |
|-------|-------|
| **Epic** | |
| **Type** | Defect / Bug |
| **Priority** | P0 \u2014 Critical |
| **Estimate** | S (1 day) |
| **Status** | {column} |
| **Depends on** | \u2014 |
| **Blocks** | \u2014 |
| **Labels** | \`bug\`, \`fix\` |
| **Milestone** | |

## Summary
Brief description of the bug and its impact.

## Steps to Reproduce
1. Step 1
2. Step 2
3. Observe unexpected behavior

## Expected vs Actual Behavior
- **Expected**: Describe expected behavior.
- **Actual**: Describe actual observed error or failure.

## Acceptance Criteria
- [ ] Root cause diagnosed and resolved
- [ ] Regression test added
- [ ] Verified fix passes all existing test suites

## Work Log
- **{date}**: Logged bug.
`;
      await fs3.promises.writeFile(bugPath, bugContent, "utf8");
      created.push("bug.md");
    }
    await this.reloadSingleBoard(board.rootPath);
    return created;
  }
  async reloadSingleBoard(rootPath) {
    const config = workspace.getConfiguration("agenticKanban");
    const ignoredFiles = config.get("ignoredFiles", []).map((f) => f.toLowerCase());
    const updated = await BoardDiscovery.buildBoard(rootPath, ignoredFiles);
    if (updated) {
      this.boards.set(updated.id, updated);
      this.changeEmitter.fire(updated);
      return updated;
    }
    return null;
  }
  setupWatchers(context) {
    const watcher = workspace.createFileSystemWatcher("**/*.md");
    const handleFileChange = (uri) => {
      if (/[\\/](node_modules|\.git)[\\/]/.test(uri.fsPath))
        return;
      this.pendingFiles.add(uri.fsPath);
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
      this.debounceTimer = setTimeout(async () => {
        const files = Array.from(this.pendingFiles);
        this.pendingFiles.clear();
        const boardRoots = /* @__PURE__ */ new Set();
        let unknown = false;
        for (const filePath of files) {
          const owner = Array.from(this.boards.values()).find((b) => isInside(b.rootPath, filePath));
          if (owner)
            boardRoots.add(owner.rootPath);
          else
            unknown = true;
        }
        for (const root of boardRoots) {
          await this.reloadSingleBoard(root);
        }
        if (unknown) {
          await this.reloadBoards();
          this.changeEmitter.fire(null);
        }
      }, 300);
    };
    watcher.onDidCreate(handleFileChange);
    watcher.onDidChange(handleFileChange);
    watcher.onDidDelete(handleFileChange);
    this.watchers.push(watcher);
    context.subscriptions.push(watcher);
  }
};

// test/boardManagerTests.ts
var failures = 0;
function check(cond, msg) {
  if (!cond) {
    failures++;
    console.error("  \u2718 " + msg);
  } else {
    console.log("  \u2714 " + msg);
  }
}
var TICKET = (title) => `# ${title}

| Field | Value |
|---|---|
| **Status** | Backlog |

## Acceptance Criteria
- [ ] done
`;
async function main() {
  console.log("\n=== BoardManager regression tests ===");
  const base = fs4.mkdtempSync(path5.join(os.tmpdir(), "bm-"));
  const root = path5.join(base, "Tickets");
  for (const c of ["Backlog", "Ongoing", "Completed"])
    fs4.mkdirSync(path5.join(root, c), { recursive: true });
  fs4.writeFileSync(path5.join(root, "Backlog", "a.md"), TICKET("A"));
  fs4.writeFileSync(path5.join(root, "Ongoing", "a.md"), TICKET("A (already in Ongoing)"));
  fs4.writeFileSync(path5.join(root, "Backlog", "b.md"), TICKET("B"));
  const bm = BoardManager.getInstance();
  const board = await bm.reloadSingleBoard(root);
  check(!!board, "board loads");
  console.log("\n--- moveTicket ---");
  messages.length = 0;
  const clash = await bm.moveTicket(board.id, path5.join(root, "Backlog", "a.md"), "Ongoing", null);
  check(
    clash === false && fs4.readFileSync(path5.join(root, "Ongoing", "a.md"), "utf8").includes("already in Ongoing"),
    "refuses to overwrite a same-named ticket in the target column"
  );
  check(messages.some((m) => /already exists/.test(m.text)), "tells the user why");
  check(fs4.existsSync(path5.join(root, "Backlog", "a.md")), "source ticket is untouched after a refused move");
  const escaped = await bm.moveTicket(board.id, path5.join(root, "Backlog", "b.md"), "../outside", null);
  check(escaped === false && !fs4.existsSync(path5.join(base, "outside")), 'column "../outside" cannot escape the board root');
  const escapedSub = await bm.moveTicket(board.id, path5.join(root, "Backlog", "b.md"), "Ongoing", "../../x");
  check(escapedSub === false && !fs4.existsSync(path5.join(base, "x")), "subfolder traversal is rejected");
  const ok = await bm.moveTicket(board.id, path5.join(root, "Backlog", "b.md"), "Completed", null);
  check(ok === true && fs4.existsSync(path5.join(root, "Completed", "b.md")), "a normal move still works");
  check(fs4.readFileSync(path5.join(root, "Completed", "b.md"), "utf8").includes("| **Status** | Completed |"), "status field follows the column");
  console.log("\n--- createTicket ---");
  const p1 = await bm.createTicket(board.id, "Backlog", null, "\xC5tg\xE4rda buggen i \xD6ppna-menyn");
  check(!!p1 && path5.basename(p1).includes("atgarda-buggen-i-oppna-menyn"), "non-ASCII titles keep a readable filename");
  const p2 = await bm.createTicket(board.id, "Backlog", null, "???");
  check(!!p2 && path5.basename(p2).includes("untitled"), 'symbol-only titles fall back to "untitled"');
  const tpl = "# {id} \u2014 {title}\n\n| Field | Value |\n|---|---|\n| **Status** | {column} |\n";
  const q1 = await bm.createTicket(board.id, "Backlog", null, "Same title", tpl);
  const q2 = await bm.createTicket(board.id, "Backlog", null, "Same title", tpl);
  const id1 = fs4.readFileSync(q1, "utf8").match(/# (\S+)/)[1];
  const id2 = fs4.readFileSync(q2, "utf8").match(/# (\S+)/)[1];
  check(id1 !== id2, `duplicate titles get unique ticket ids (${id1} vs ${id2})`);
  const bad = await bm.createTicket(board.id, "..", null, "evil");
  check(bad === null, "createTicket rejects a column that escapes the board");
  const outside = await bm.createTicket(board.id, "Backlog", "../../..", "evil");
  check(outside === null, "createTicket rejects a traversing subfolder");
  console.log("\n--- board lookup ---");
  fs4.mkdirSync(path5.join(base, "Tickets2", "Backlog"), { recursive: true });
  check(
    bm.findBoardForTicketPath(path5.join(base, "Tickets2", "Backlog", "z.md")) === void 0,
    "a path in a sibling folder sharing the prefix is not claimed by the board"
  );
  check(bm.findBoardForTicketPath(path5.join(root, "Backlog", "x.md"))?.id === board.id, "paths inside the board still resolve");
  const rules = await bm.generateAgentRules(board.id);
  check(rules !== null, "generateAgentRules works");
  fs4.rmSync(base, { recursive: true, force: true });
  if (failures) {
    console.error(`
${failures} BoardManager check(s) FAILED`);
    process.exit(1);
  }
  console.log("\n=== All BoardManager tests passed ===");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
//# sourceMappingURL=boardManagerTests.js.map
