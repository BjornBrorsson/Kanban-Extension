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

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode6 = __toESM(require("vscode"));
var path7 = __toESM(require("path"));
var fs5 = __toESM(require("fs"));

// src/boardManager.ts
var vscode2 = __toESM(require("vscode"));
var path3 = __toESM(require("path"));
var fs2 = __toESM(require("fs"));

// src/boardDiscovery.ts
var vscode = __toESM(require("vscode"));
var path2 = __toESM(require("path"));
var fs = __toESM(require("fs"));

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

// src/boardDiscovery.ts
var BoardDiscovery = class {
  static async discoverBoards(workspaceFolders) {
    const boards = [];
    const config = vscode.workspace.getConfiguration("agenticKanban");
    const boardPatterns = config.get("boardPatterns", ["**/Tickets", "**/tickets", "**/.kanban"]);
    const ignoredFiles = config.get("ignoredFiles", []).map((f) => f.toLowerCase());
    const discoveredRoots = /* @__PURE__ */ new Set();
    for (const folder of workspaceFolders) {
      for (const pattern of boardPatterns) {
        const relativePattern = new vscode.RelativePattern(folder, pattern);
        const uris = await vscode.workspace.findFiles(relativePattern, "**/node_modules/**");
        for (const uri of uris) {
          const stat = await vscode.workspace.fs.stat(uri);
          if (stat.type === vscode.FileType.Directory) {
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
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subPath = path2.join(dirPath, entry.name);
          if (entry.name.toLowerCase() === "tickets") {
            discoveredRoots.add(subPath);
          } else {
            const configPath = path2.join(subPath, "config.md");
            if (fs.existsSync(configPath)) {
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
    if (!fs.existsSync(rootPath))
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
    if (fs.existsSync(configPath)) {
      try {
        const configContent = await fs.promises.readFile(configPath, "utf8");
        boardConfig = ConfigParser.parse(configContent, defaultBoardName);
      } catch (e) {
        console.warn(`Could not parse config.md at ${configPath}:`, e);
      }
    }
    let planDocument = null;
    try {
      const rootFiles = await fs.promises.readdir(rootPath, { withFileTypes: true });
      for (const file of rootFiles) {
        if (!file.isDirectory() && (file.name.startsWith("00_") || file.name.toLowerCase() === "plan.md")) {
          const filePath = path2.join(rootPath, file.name);
          const content = await fs.promises.readFile(filePath, "utf8");
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
    const entries = await fs.promises.readdir(rootPath, { withFileTypes: true });
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
      if (fs.existsSync(columnWhatwhy)) {
        columnGuide = await fs.promises.readFile(columnWhatwhy, "utf8");
      } else if (fs.existsSync(columnReadme)) {
        columnGuide = await fs.promises.readFile(columnReadme, "utf8");
      }
      const subfolders = [];
      const tickets = [];
      const colChildren = await fs.promises.readdir(columnPath, { withFileTypes: true });
      for (const child of colChildren) {
        const childPath = path2.join(columnPath, child.name);
        if (child.isDirectory()) {
          if (child.name.startsWith("."))
            continue;
          let subGuide = null;
          const subWhatwhy = path2.join(childPath, "Whatwhy.md");
          if (fs.existsSync(subWhatwhy)) {
            subGuide = await fs.promises.readFile(subWhatwhy, "utf8");
          }
          let subTicketCount = 0;
          const subEntries = await fs.promises.readdir(childPath, { withFileTypes: true });
          for (const subChild of subEntries) {
            if (!subChild.isDirectory() && subChild.name.endsWith(".md")) {
              if (this.isIgnoredFile(subChild.name, ignoredFiles))
                continue;
              const ticketPath = path2.join(childPath, subChild.name);
              const stat = await fs.promises.stat(ticketPath);
              const content = await fs.promises.readFile(ticketPath, "utf8");
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
          const stat = await fs.promises.stat(ticketPath);
          const content = await fs.promises.readFile(ticketPath, "utf8");
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
    if (fs.existsSync(templatesDir)) {
      try {
        const templateEntries = await fs.promises.readdir(templatesDir, { withFileTypes: true });
        for (const te of templateEntries) {
          if (!te.isDirectory() && te.name.endsWith(".md")) {
            const tPath = path2.join(templatesDir, te.name);
            const content = await fs.promises.readFile(tPath, "utf8");
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

// src/boardManager.ts
var BoardManager = class _BoardManager {
  static instance;
  boards = /* @__PURE__ */ new Map();
  watchers = [];
  changeEmitter = new vscode2.EventEmitter();
  onDidChangeBoard = this.changeEmitter.event;
  debounceTimer = null;
  static getInstance() {
    if (!this.instance) {
      this.instance = new _BoardManager();
    }
    return this.instance;
  }
  async reloadBoards() {
    const folders = vscode2.workspace.workspaceFolders;
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
      const normalizedKey = Buffer.from(path3.resolve(idOrRoot).toLowerCase()).toString("base64url");
      if (this.boards.has(normalizedKey)) {
        return this.boards.get(normalizedKey);
      }
    } catch {
    }
    for (const b of this.boards.values()) {
      if (b.id === idOrRoot || b.rootPath.toLowerCase() === idOrRoot.toLowerCase() || path3.resolve(b.rootPath).toLowerCase() === path3.resolve(idOrRoot).toLowerCase()) {
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
          if (t.hasWorkLog && fs2.existsSync(t.path)) {
            try {
              const fileContent = fs2.readFileSync(t.path, "utf8");
              const logs = TicketParser.extractWorkLogEntries(fileContent, t.id, t.title, t.path, b.id, b.name);
              recentWorkLogs.push(...logs);
            } catch {
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
    const resolved = path3.resolve(ticketPath).toLowerCase();
    for (const board of this.boards.values()) {
      const boardRoot = path3.resolve(board.rootPath).toLowerCase();
      if (resolved.startsWith(boardRoot)) {
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
    const resolved = path3.resolve(ticketPath);
    if (fs2.existsSync(resolved)) {
      return resolved;
    }
    const relToBoard = path3.resolve(board.rootPath, ticketPath);
    if (fs2.existsSync(relToBoard)) {
      return relToBoard;
    }
    const targetFilename = path3.basename(ticketPath).toLowerCase();
    const searchInDir = (dir) => {
      try {
        const entries = fs2.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path3.join(dir, entry.name);
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
    if (!board || ticketPath && !path3.resolve(ticketPath).toLowerCase().startsWith(path3.resolve(board.rootPath).toLowerCase())) {
      const candidate = this.findBoardForTicketPath(ticketPath);
      if (candidate) {
        board = candidate;
      }
    }
    if (!board) {
      vscode2.window.showErrorMessage(`Board not found: ${boardId}`);
      return false;
    }
    const sourcePath = this.resolveTicketPathOnDisk(board, ticketPath);
    if (!sourcePath) {
      vscode2.window.showErrorMessage(`Ticket file not found on disk: ${ticketPath}`);
      return false;
    }
    const filename = path3.basename(sourcePath);
    let targetDir = path3.join(board.rootPath, targetColumn);
    if (targetSubfolder) {
      targetDir = path3.join(targetDir, targetSubfolder);
    }
    if (!fs2.existsSync(targetDir)) {
      await fs2.promises.mkdir(targetDir, { recursive: true });
    }
    const targetPath = path3.join(targetDir, filename);
    if (path3.resolve(targetPath).toLowerCase() === path3.resolve(sourcePath).toLowerCase()) {
      return true;
    }
    try {
      try {
        await vscode2.workspace.fs.rename(vscode2.Uri.file(sourcePath), vscode2.Uri.file(targetPath), { overwrite: true });
      } catch (fsErr) {
        await fs2.promises.rename(sourcePath, targetPath);
      }
      console.log(`[Agentic Kanban] Successfully moved ticket "${filename}" to "${targetColumn}${targetSubfolder ? "/" + targetSubfolder : ""}"`);
      const autoUpdate = board.config.autoUpdateStatus;
      if (autoUpdate) {
        try {
          const content = await fs2.promises.readFile(targetPath, "utf8");
          const updated = TicketParser.updateTicketStatus(content, targetColumn);
          if (updated !== content) {
            await fs2.promises.writeFile(targetPath, updated, "utf8");
          }
        } catch (e) {
          console.warn("Could not update status field in ticket content:", e);
        }
      }
      await this.reloadSingleBoard(board.rootPath);
      return true;
    } catch (err) {
      vscode2.window.showErrorMessage(`Failed to move ticket: ${err?.message || err}`);
      return false;
    }
  }
  async assignTicket(boardId, ticketPath, assigneeName) {
    let board = this.getBoard(boardId);
    if (!board || ticketPath && !path3.resolve(ticketPath).toLowerCase().startsWith(path3.resolve(board.rootPath).toLowerCase())) {
      const candidate = this.findBoardForTicketPath(ticketPath);
      if (candidate) {
        board = candidate;
      }
    }
    if (!board) {
      vscode2.window.showErrorMessage(`Board not found: ${boardId}`);
      return false;
    }
    const sourcePath = this.resolveTicketPathOnDisk(board, ticketPath);
    if (!sourcePath) {
      vscode2.window.showErrorMessage(`Ticket file not found on disk: ${ticketPath}`);
      return false;
    }
    try {
      const content = await fs2.promises.readFile(sourcePath, "utf8");
      const updated = TicketParser.updateTicketAssignee(content, assigneeName);
      if (updated !== content) {
        await fs2.promises.writeFile(sourcePath, updated, "utf8");
        console.log(`[Agentic Kanban] Successfully wrote assignment "${assigneeName}" to ${sourcePath}`);
      }
      await this.reloadSingleBoard(board.rootPath);
      return true;
    } catch (err) {
      vscode2.window.showErrorMessage(`Failed to assign ticket: ${err?.message || err}`);
      return false;
    }
  }
  async toggleTicketCriterion(ticketPath, index, done) {
    const board = this.findBoardForTicketPath(ticketPath);
    const resolvedPath = board ? this.resolveTicketPathOnDisk(board, ticketPath) : fs2.existsSync(ticketPath) ? ticketPath : null;
    if (!resolvedPath) {
      vscode2.window.showErrorMessage(`Ticket file not found: ${ticketPath}`);
      return false;
    }
    try {
      const content = await fs2.promises.readFile(resolvedPath, "utf8");
      const updated = TicketParser.toggleCriterion(content, index, done);
      if (updated !== content) {
        await fs2.promises.writeFile(resolvedPath, updated, "utf8");
      }
      if (board) {
        await this.reloadSingleBoard(board.rootPath);
      }
      return true;
    } catch (err) {
      vscode2.window.showErrorMessage(`Failed to update acceptance criterion: ${err?.message || err}`);
      return false;
    }
  }
  async createTicket(boardId, targetColumn, targetSubfolder, title, initialContent) {
    const board = this.getBoard(boardId);
    if (!board)
      return null;
    let targetDir = path3.join(board.rootPath, targetColumn);
    if (targetSubfolder) {
      targetDir = path3.join(targetDir, targetSubfolder);
    }
    if (!fs2.existsSync(targetDir)) {
      await fs2.promises.mkdir(targetDir, { recursive: true });
    }
    const slug = title.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 40);
    const dateStr = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    let filename = `ticket-${dateStr}-${slug}.md`;
    let fullPath = path3.join(targetDir, filename);
    let counter = 1;
    while (fs2.existsSync(fullPath)) {
      filename = `ticket-${dateStr}-${slug}-${counter}.md`;
      fullPath = path3.join(targetDir, filename);
      counter++;
    }
    let defaultContent = initialContent;
    if (defaultContent) {
      const generatedId = `T-${slug.toUpperCase()}`;
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
    await fs2.promises.writeFile(fullPath, defaultContent, "utf8");
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
      vscode2.window.showWarningMessage("No active Kanban board found to generate agent rules.");
      return null;
    }
    const wsFolder = vscode2.workspace.workspaceFolders?.[0]?.uri.fsPath || path3.dirname(board.rootPath);
    const agentsDir = path3.join(wsFolder, ".agents");
    let targetPath = path3.join(wsFolder, "AGENT.md");
    if (fs2.existsSync(agentsDir)) {
      const rulesDir = path3.join(agentsDir, "rules");
      if (!fs2.existsSync(rulesDir)) {
        await fs2.promises.mkdir(rulesDir, { recursive: true });
      }
      targetPath = path3.join(rulesDir, "kanban.md");
    }
    const relBoardPath = path3.relative(wsFolder, board.rootPath).replace(/\\/g, "/") || "Tickets";
    const colsList = board.columns.map((c) => `- \`${relBoardPath}/${c.name}/\``).join("\n");
    const content = `# Project Operating Rules: Agentic Kanban

This project uses **Agentic Kanban** for task management. All tasks, features, and defects are tracked as Markdown files inside the board directory: \`${relBoardPath}/\`.

## Board Structure & Columns
${colsList}

## Agent Operating Workflow
1. **Discover & Inspect**: Look in \`${relBoardPath}/Backlog/\` (or \`${relBoardPath}/Backlog/Ready/\`) for assigned or available tasks.
2. **Claim a Ticket**:
   - Move the ticket file into \`${relBoardPath}/Ongoing/\`.
   - Set the \`| **Assignee** | <YourName> |\` and \`| **Status** | Ongoing |\` in the ticket metadata table.
3. **Log Progress in Real-Time**:
   - In the ticket file under \`## Work Log\`, append a timestamped entry for key steps or decisions:
     \`\`\`markdown
     - **YYYY-MM-DD**: Started investigation of ...
     \`\`\`
4. **Complete Criteria & Verify**:
   - Check off each criterion under \`## Acceptance Criteria\` by toggling \`- [ ]\` to \`- [x]\`.
   - Run tests and static analysis to guarantee zero regressions.
5. **Finalize**:
   - Move the ticket file to \`${relBoardPath}/Completed/\`.
   - Update the status field to \`Completed\`.
6. **Blockers & Assistance**:
   - If blocked by missing dependencies or external requirements, move the ticket to \`${relBoardPath}/Blocked/\` or \`${relBoardPath}/Assistance Required/\` and record the blocking reason in the \`## Work Log\`.
`;
    return { targetPath, created: true, content };
  }
  async initTemplates(boardId) {
    let board = boardId ? this.getBoard(boardId) : void 0;
    if (!board) {
      const boards = this.getAllBoards();
      if (boards.length > 0)
        board = boards[0];
    }
    if (!board) {
      vscode2.window.showWarningMessage("No Kanban board found to initialize templates.");
      return null;
    }
    const templatesDir = path3.join(board.rootPath, ".templates");
    if (!fs2.existsSync(templatesDir)) {
      await fs2.promises.mkdir(templatesDir, { recursive: true });
    }
    const created = [];
    const featurePath = path3.join(templatesDir, "feature.md");
    if (!fs2.existsSync(featurePath)) {
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
      await fs2.promises.writeFile(featurePath, featureContent, "utf8");
      created.push("feature.md");
    }
    const bugPath = path3.join(templatesDir, "bug.md");
    if (!fs2.existsSync(bugPath)) {
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
      await fs2.promises.writeFile(bugPath, bugContent, "utf8");
      created.push("bug.md");
    }
    await this.reloadSingleBoard(board.rootPath);
    return created;
  }
  async reloadSingleBoard(rootPath) {
    const config = vscode2.workspace.getConfiguration("agenticKanban");
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
    const watcher = vscode2.workspace.createFileSystemWatcher("**/*.md");
    const handleFileChange = (uri) => {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
      this.debounceTimer = setTimeout(async () => {
        const filePath = uri.fsPath;
        for (const board of this.boards.values()) {
          if (filePath.startsWith(board.rootPath)) {
            await this.reloadSingleBoard(board.rootPath);
            return;
          }
        }
        await this.reloadBoards();
        this.changeEmitter.fire(null);
      }, 300);
    };
    watcher.onDidCreate(handleFileChange);
    watcher.onDidChange(handleFileChange);
    watcher.onDidDelete(handleFileChange);
    this.watchers.push(watcher);
    context.subscriptions.push(watcher);
  }
};

// src/sidebarProvider.ts
var vscode3 = __toESM(require("vscode"));
var BoardsTreeProvider = class {
  constructor(boardManager) {
    this.boardManager = boardManager;
    this.boardManager.onDidChangeBoard(() => {
      this.refresh();
    });
  }
  _onDidChangeTreeData = new vscode3.EventEmitter();
  onDidChangeTreeData = this._onDidChangeTreeData.event;
  refresh() {
    this._onDidChangeTreeData.fire();
  }
  getTreeItem(element) {
    return element;
  }
  async getChildren(element) {
    if (!element) {
      const boards = this.boardManager.getAllBoards();
      const nodes = [];
      const overviewNode = new TreeItemNode(
        "Workspace Overview",
        vscode3.TreeItemCollapsibleState.None,
        "overview",
        {
          command: "agenticKanban.openOverview",
          title: "Open Multi-Board Overview"
        }
      );
      overviewNode.iconPath = new vscode3.ThemeIcon("dashboard");
      overviewNode.description = `${boards.length} boards`;
      nodes.push(overviewNode);
      for (const board of boards) {
        const totalTickets = board.columns.reduce((acc, col) => acc + col.tickets.length, 0);
        const boardNode = new TreeItemNode(
          board.name,
          vscode3.TreeItemCollapsibleState.Expanded,
          "board",
          {
            command: "agenticKanban.openBoard",
            title: "Open Board",
            arguments: [board.id]
          },
          board
        );
        boardNode.iconPath = new vscode3.ThemeIcon("layout-kanban");
        boardNode.description = `${totalTickets} tickets`;
        boardNode.tooltip = `${board.name}
${board.rootPath}`;
        nodes.push(boardNode);
      }
      return nodes;
    }
    if (element.contextValue === "board" && element.board) {
      const colNodes = [];
      for (const col of element.board.columns) {
        const colNode = new TreeItemNode(
          col.name,
          vscode3.TreeItemCollapsibleState.None,
          "column",
          {
            command: "agenticKanban.openBoard",
            title: "Open Board Column",
            arguments: [element.board.id, col.name]
          },
          element.board,
          col
        );
        colNode.iconPath = this.getColumnIcon(col.name);
        colNode.description = `${col.tickets.length}`;
        colNodes.push(colNode);
      }
      return colNodes;
    }
    return [];
  }
  getColumnIcon(colName) {
    const lower = colName.toLowerCase();
    if (lower.includes("backlog") || lower.includes("todo"))
      return new vscode3.ThemeIcon("inbox");
    if (lower.includes("ongoing") || lower.includes("progress"))
      return new vscode3.ThemeIcon("play");
    if (lower.includes("assist") || lower.includes("help"))
      return new vscode3.ThemeIcon("question");
    if (lower.includes("block"))
      return new vscode3.ThemeIcon("circle-slash");
    if (lower.includes("done") || lower.includes("completed"))
      return new vscode3.ThemeIcon("check");
    return new vscode3.ThemeIcon("folder");
  }
};
var TreeItemNode = class extends vscode3.TreeItem {
  constructor(label, collapsibleState, contextValue, command, board, column) {
    super(label, collapsibleState);
    this.label = label;
    this.collapsibleState = collapsibleState;
    this.contextValue = contextValue;
    this.command = command;
    this.board = board;
    this.column = column;
  }
};

// src/webviewPanel.ts
var vscode5 = __toESM(require("vscode"));
var path6 = __toESM(require("path"));
var fs4 = __toESM(require("fs"));

// src/agentRunner.ts
var vscode4 = __toESM(require("vscode"));
var path4 = __toESM(require("path"));
var fs3 = __toESM(require("fs"));
var AgentRunner = class {
  static terminals = /* @__PURE__ */ new Map();
  static async dispatch(ticket, assignee, boardRoot) {
    if (assignee.type !== "agent" || !assignee.agentConfig) {
      vscode4.window.showWarningMessage(`Assignee "${assignee.name}" is not configured as an executable agent.`);
      return false;
    }
    const config = assignee.agentConfig;
    const workspaceFolder = vscode4.workspace.workspaceFolders?.[0]?.uri.fsPath || path4.dirname(boardRoot);
    let ticketContent = "";
    try {
      ticketContent = await fs3.promises.readFile(ticket.path, "utf8");
    } catch {
      ticketContent = ticket.summary || ticket.title;
    }
    const replacements = {
      "{ticket_path}": ticket.path,
      "{ticket_rel_path}": ticket.relativePath,
      "{ticket_name}": ticket.filename,
      "{ticket_id}": ticket.id,
      "{ticket_title}": ticket.title,
      "{ticket_summary}": ticket.summary,
      "{ticket_content}": ticketContent.replace(/"/g, '\\"').slice(0, 1500),
      "{workspace_root}": workspaceFolder,
      "{board_root}": boardRoot,
      "{column}": ticket.column
    };
    if (config.type === "cli") {
      let command = config.command;
      for (const [placeholder, value] of Object.entries(replacements)) {
        const safeValue = placeholder === "{ticket_title}" || placeholder === "{ticket_summary}" || placeholder === "{ticket_name}" ? value.replace(/"/g, '\\"') : value;
        command = command.split(placeholder).join(safeValue);
      }
      const cwd = config.workingDir ? config.workingDir.replace("{workspace_root}", workspaceFolder).replace("{board_root}", boardRoot) : workspaceFolder;
      const terminalName = `Agent: ${assignee.name}`;
      let terminal = this.terminals.get(terminalName);
      const existing = vscode4.window.terminals.find((t) => t.name === terminalName);
      if (!existing) {
        terminal = vscode4.window.createTerminal({
          name: terminalName,
          cwd
        });
        this.terminals.set(terminalName, terminal);
      } else {
        terminal = existing;
      }
      terminal.show(false);
      if (!existing) {
        await new Promise((r) => setTimeout(r, 600));
      }
      terminal.sendText(command);
      vscode4.window.showInformationMessage(`Dispatched ticket "${ticket.title}" to ${assignee.name}.`);
      return true;
    } else if (config.type === "vscode-command") {
      let prompt = config.prompt || `Please review and work on ticket "${ticket.title}" at: ${ticket.path}

Summary:
${ticket.summary}`;
      for (const [placeholder, value] of Object.entries(replacements)) {
        prompt = prompt.split(placeholder).join(value);
      }
      await vscode4.env.clipboard.writeText(prompt);
      vscode4.window.showInformationMessage(
        `Copied ticket context to clipboard! Triggering ${assignee.name} (${config.command})...`
      );
      try {
        await vscode4.commands.executeCommand(config.command);
      } catch (err) {
        vscode4.window.showErrorMessage(`Failed to execute command "${config.command}": ${err?.message || err}`);
      }
      return true;
    }
    return false;
  }
};

// src/promptFormatter.ts
var path5 = __toESM(require("path"));
var PromptFormatter = class {
  static DEFAULT_TEMPLATE = `Please review and work on ticket **{id}: {title}** located at \`{relative_path}\`.

### Summary
{summary}

### Key Acceptance Criteria
{acceptance_criteria}

### Instructions
1. Inspect the codebase and execute the necessary changes.
2. Verify that all acceptance criteria are met and pass tests.
3. Record your timestamped progress under \`## Work Log\` in the ticket file.
4. Move the ticket to \`{completed_path}\` once done.`;
  /**
   * Formats a structured agent prompt for a ticket based on board config or default template.
   */
  static formatPrompt(ticket, boardConfig, workspaceRoot, boardRoot) {
    let relPath = ticket.relativePath || ticket.filename;
    if (workspaceRoot && ticket.path) {
      const calculated = path5.relative(workspaceRoot, ticket.path).replace(/\\/g, "/");
      if (!calculated.startsWith("..")) {
        relPath = calculated;
      }
    } else if (boardRoot && ticket.path) {
      const boardDirName = path5.basename(boardRoot);
      const fromBoard = path5.relative(boardRoot, ticket.path).replace(/\\/g, "/");
      relPath = `${boardDirName}/${fromBoard}`;
    }
    let completedPath = "Tickets/Completed/";
    if (boardRoot && workspaceRoot) {
      const relBoard = path5.relative(workspaceRoot, boardRoot).replace(/\\/g, "/");
      completedPath = relBoard && relBoard !== "." ? `${relBoard}/Completed/` : "Completed/";
    } else if (ticket.column) {
      const colSubstr = "/" + ticket.column + "/";
      const colIdx = relPath.indexOf(colSubstr);
      if (colIdx !== -1) {
        completedPath = `${relPath.slice(0, colIdx)}/Completed/`;
      } else if (relPath.startsWith(ticket.column + "/")) {
        completedPath = "Completed/";
      }
    }
    let criteriaText = "";
    if (ticket.acceptanceCriteria && ticket.acceptanceCriteria.length > 0) {
      criteriaText = ticket.acceptanceCriteria.map((c) => `- [${c.done ? "x" : " "}] ${c.text}`).join("\n");
    } else {
      criteriaText = "- [ ] Implement requirements as specified in ticket.";
    }
    const template = boardConfig?.agentPromptTemplate && boardConfig.agentPromptTemplate.trim() ? boardConfig.agentPromptTemplate.trim() : this.DEFAULT_TEMPLATE;
    const summaryText = ticket.summary || ticket.title;
    const descriptionText = ticket.description || ticket.summary || ticket.title;
    let blockerWarning = "";
    if (ticket.unresolvedDependencies && ticket.unresolvedDependencies.length > 0) {
      blockerWarning = `

> \u26A0\uFE0F **DEPENDENCY WARNING**: This ticket is currently blocked by unfinished prerequisite tickets: ${ticket.unresolvedDependencies.join(", ")}. Please verify their status before proceeding or focus on prerequisite work.`;
    }
    const replacements = {
      "{id}": ticket.id || "",
      "{ticket_id}": ticket.id || "",
      "{title}": ticket.title || "",
      "{ticket_title}": ticket.title || "",
      "{relative_path}": relPath,
      "{ticket_rel_path}": relPath,
      "{path}": ticket.path || "",
      "{ticket_path}": ticket.path || "",
      "{summary}": summaryText,
      "{ticket_summary}": summaryText,
      "{description}": descriptionText,
      "{ticket_description}": descriptionText,
      "{acceptance_criteria}": criteriaText,
      "{criteria}": criteriaText,
      "{key_acceptance_criteria}": criteriaText,
      "{column}": ticket.column || "",
      "{ticket_column}": ticket.column || "",
      "{subfolder}": ticket.subfolder || "",
      "{priority}": ticket.priority || "Normal",
      "{assignee}": ticket.assignee || "Unassigned",
      "{epic}": ticket.epic || "",
      "{estimate}": ticket.estimate || "",
      "{completed_path}": completedPath,
      "{depends_on}": (ticket.dependsOn || []).join(", "),
      "{unresolved_dependencies}": (ticket.unresolvedDependencies || []).join(", "),
      "{blocker_warning}": blockerWarning
    };
    let result = template;
    for (const [placeholder, value] of Object.entries(replacements)) {
      result = result.split(placeholder).join(value);
    }
    if (blockerWarning && !template.includes("{blocker_warning}")) {
      result += blockerWarning;
    }
    return result;
  }
};

// src/webviewPanel.ts
var KanbanWebviewManager = class _KanbanWebviewManager {
  static currentPanel;
  panel;
  extensionUri;
  disposables = [];
  currentBoardId = null;
  isOverviewMode = false;
  static createOrShow(extensionUri, initialBoardId, isOverview = false) {
    const column = vscode5.window.activeTextEditor ? vscode5.window.activeTextEditor.viewColumn : void 0;
    if (_KanbanWebviewManager.currentPanel) {
      _KanbanWebviewManager.currentPanel.panel.reveal(column);
      if (isOverview) {
        _KanbanWebviewManager.currentPanel.showOverview();
      } else if (initialBoardId) {
        _KanbanWebviewManager.currentPanel.showBoard(initialBoardId);
      }
      return _KanbanWebviewManager.currentPanel;
    }
    const panel = vscode5.window.createWebviewPanel(
      "agenticKanban",
      "Agentic Kanban",
      column || vscode5.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode5.Uri.joinPath(extensionUri, "dist", "webview"),
          vscode5.Uri.joinPath(extensionUri, "src", "webview"),
          vscode5.Uri.joinPath(extensionUri, "media")
        ]
      }
    );
    _KanbanWebviewManager.currentPanel = new _KanbanWebviewManager(panel, extensionUri, initialBoardId, isOverview);
    return _KanbanWebviewManager.currentPanel;
  }
  constructor(panel, extensionUri, initialBoardId, isOverview = false) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.currentBoardId = initialBoardId || null;
    this.isOverviewMode = isOverview;
    this.panel.iconPath = vscode5.Uri.joinPath(this.extensionUri, "media", "kanban-icon.svg");
    this.panel.webview.html = this.getHtmlForWebview(this.panel.webview);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        await this.handleWebviewMessage(message);
      },
      null,
      this.disposables
    );
    const boardManager = BoardManager.getInstance();
    boardManager.onDidChangeBoard((changedBoard) => {
      this.broadcastCurrentState();
    });
  }
  showBoard(boardId) {
    this.currentBoardId = boardId;
    this.isOverviewMode = false;
    this.broadcastCurrentState();
  }
  showOverview() {
    this.isOverviewMode = true;
    this.broadcastCurrentState();
  }
  async handleWebviewMessage(message) {
    const boardManager = BoardManager.getInstance();
    switch (message.type) {
      case "ready":
        this.broadcastCurrentState();
        break;
      case "switchBoard":
        this.currentBoardId = message.boardId;
        this.isOverviewMode = false;
        this.broadcastCurrentState();
        break;
      case "showOverview":
        this.isOverviewMode = true;
        this.broadcastCurrentState();
        break;
      case "moveTicket":
        await boardManager.moveTicket(
          message.boardId,
          message.ticketPath,
          message.targetColumn,
          message.targetSubfolder || null
        );
        this.broadcastCurrentState();
        break;
      case "openTicketFile":
        try {
          const doc = await vscode5.workspace.openTextDocument(vscode5.Uri.file(message.filePath));
          const editor = await vscode5.window.showTextDocument(doc, { viewColumn: vscode5.ViewColumn.Beside });
          if (message.line && typeof message.line === "number" && message.line > 0) {
            const pos = new vscode5.Position(message.line - 1, 0);
            editor.selection = new vscode5.Selection(pos, pos);
            editor.revealRange(new vscode5.Range(pos, pos), vscode5.TextEditorRevealType.InCenter);
          }
        } catch (err) {
          vscode5.window.showErrorMessage(`Failed to open ticket: ${err?.message || err}`);
        }
        break;
      case "toggleCriterion":
        await boardManager.toggleTicketCriterion(message.ticketPath, message.index, message.done);
        break;
      case "generateAgentRules":
        await vscode5.commands.executeCommand("agenticKanban.generateAgentRules", {
          board: boardManager.getBoard(message.boardId)
        });
        break;
      case "initTemplates":
        await vscode5.commands.executeCommand("agenticKanban.initTemplates", {
          board: boardManager.getBoard(message.boardId)
        });
        break;
      case "openPlan":
        try {
          const doc = await vscode5.workspace.openTextDocument(vscode5.Uri.file(message.filePath));
          await vscode5.window.showTextDocument(doc, { viewColumn: vscode5.ViewColumn.Beside });
        } catch (err) {
          vscode5.window.showErrorMessage(`Failed to open plan document: ${err?.message || err}`);
        }
        break;
      case "openConfig":
        try {
          const board = boardManager.getBoard(message.boardId);
          if (board) {
            const configPath = path6.join(board.rootPath, "config.md");
            if (fs4.existsSync(configPath)) {
              const doc = await vscode5.workspace.openTextDocument(vscode5.Uri.file(configPath));
              await vscode5.window.showTextDocument(doc, { viewColumn: vscode5.ViewColumn.Beside });
            } else {
              vscode5.window.showInformationMessage(`No config.md found at board root.`);
            }
          }
        } catch (err) {
          vscode5.window.showErrorMessage(`Failed to open config: ${err?.message || err}`);
        }
        break;
      case "createTicket":
        const createdPath = await boardManager.createTicket(
          message.boardId,
          message.targetColumn,
          message.targetSubfolder || null,
          message.title,
          message.content
        );
        if (createdPath && message.openImmediately) {
          const doc = await vscode5.workspace.openTextDocument(vscode5.Uri.file(createdPath));
          await vscode5.window.showTextDocument(doc, { viewColumn: vscode5.ViewColumn.Beside });
        }
        break;
      case "dispatchAgent":
        const targetBoard = boardManager.getBoard(message.boardId);
        if (targetBoard) {
          const assignee = targetBoard.config.assignees.find((a) => a.id === message.agentId);
          if (assignee) {
            await AgentRunner.dispatch(message.ticket, assignee, targetBoard.rootPath);
          } else {
            vscode5.window.showErrorMessage(`Agent with ID "${message.agentId}" not found in board config.`);
          }
        }
        break;
      case "runInChat":
        try {
          const t = message.ticket;
          let prompt = `Please review and work on ticket "${t.id ? t.id + " \u2014 " : ""}${t.title}" located at: ${t.path}`;
          if (t.summary) {
            prompt += `

Summary:
${t.summary}`;
          }
          if (t.acceptanceCriteria && t.acceptanceCriteria.length > 0) {
            prompt += `

Acceptance Criteria:
` + t.acceptanceCriteria.map((c) => `- [${c.done ? "x" : " "}] ${c.text}`).join("\n");
          }
          prompt += `

Instructions:
1. Implement the requested changes.
2. Verify tests pass.
3. Update the ticket's Work Log and move to Completed when finished.`;
          await vscode5.env.clipboard.writeText(prompt);
          vscode5.window.showInformationMessage(`Copied ticket prompt to clipboard. Opening IDE Chat...`);
          try {
            await vscode5.commands.executeCommand("workbench.action.chat.open");
          } catch {
            try {
              await vscode5.commands.executeCommand("aichat.opensidebar");
            } catch {
            }
          }
        } catch (err) {
          vscode5.window.showErrorMessage(`Failed to open IDE chat: ${err?.message || err}`);
        }
        break;
      case "copyAgentPrompt":
        try {
          const t = message.ticket;
          let targetBoard2 = boardManager.getBoard(message.boardId);
          const allBoards = boardManager.getAllBoards();
          if (t && t.path) {
            const foundBoard = allBoards.find(
              (b) => path6.resolve(t.path).toLowerCase().startsWith(path6.resolve(b.rootPath).toLowerCase())
            );
            if (foundBoard)
              targetBoard2 = foundBoard;
          }
          if (!targetBoard2 && this.currentBoardId) {
            targetBoard2 = boardManager.getBoard(this.currentBoardId);
          }
          if (!targetBoard2 && allBoards.length > 0) {
            targetBoard2 = allBoards[0];
          }
          const workspaceFolder = vscode5.workspace.workspaceFolders?.[0]?.uri.fsPath;
          const prompt = PromptFormatter.formatPrompt(
            t,
            targetBoard2 ? targetBoard2.config : null,
            workspaceFolder,
            targetBoard2 ? targetBoard2.rootPath : void 0
          );
          await vscode5.env.clipboard.writeText(prompt);
          vscode5.window.showInformationMessage(
            `Copied Agent Task Prompt for "${t.id ? t.id + ": " : ""}${t.title}" to clipboard!`
          );
        } catch (err) {
          vscode5.window.showErrorMessage(`Failed to copy agent prompt: ${err?.message || err}`);
        }
        break;
      case "assignTicket":
        try {
          let targetBoard2 = boardManager.getBoard(message.boardId);
          const allBoards = boardManager.getAllBoards();
          if (message.ticketPath) {
            const foundBoard = allBoards.find(
              (b) => path6.resolve(message.ticketPath).toLowerCase().startsWith(path6.resolve(b.rootPath).toLowerCase())
            );
            if (foundBoard)
              targetBoard2 = foundBoard;
          }
          if (!targetBoard2 && allBoards.length > 0) {
            targetBoard2 = allBoards[0];
          }
          if (!targetBoard2) {
            vscode5.window.showErrorMessage("No board found to assign ticket.");
            break;
          }
          this.currentBoardId = targetBoard2.id;
          const targetName = message.assigneeName ? message.assigneeName.trim() : "";
          const assigneeId = message.assigneeId ? message.assigneeId.trim() : "";
          const assigned = await boardManager.assignTicket(targetBoard2.id, message.ticketPath, targetName);
          if (!assigned) {
            vscode5.window.showErrorMessage(`Failed to assign ticket at ${message.ticketPath}`);
            break;
          }
          this.broadcastCurrentState();
          if (message.runCli && targetName) {
            const assignee = targetBoard2.config.assignees.find(
              (a) => assigneeId && a.id === assigneeId || a.name.toLowerCase() === targetName.toLowerCase()
            );
            if (assignee && assignee.type === "agent") {
              const reloadedBoard = boardManager.getBoard(targetBoard2.id) || targetBoard2;
              let ticketObj = null;
              for (const col of reloadedBoard.columns) {
                const found = col.tickets.find(
                  (t) => path6.resolve(t.path).toLowerCase() === path6.resolve(message.ticketPath).toLowerCase() || message.ticketId && t.id === message.ticketId || t.filename.toLowerCase() === path6.basename(message.ticketPath).toLowerCase()
                );
                if (found) {
                  ticketObj = found;
                  break;
                }
              }
              if (!ticketObj) {
                const sourcePath = boardManager.resolveTicketPathOnDisk(targetBoard2, message.ticketPath) || message.ticketPath;
                const fileContent = await fs4.promises.readFile(sourcePath, "utf8");
                ticketObj = TicketParser.parse(sourcePath, fileContent, targetBoard2.rootPath, "", null);
                if (ticketObj) {
                  ticketObj.assignee = assignee.name;
                }
              }
              if (ticketObj) {
                await AgentRunner.dispatch(ticketObj, assignee, targetBoard2.rootPath);
              }
            } else {
              vscode5.window.showInformationMessage(`Assigned ticket to ${targetName}.`);
            }
          } else if (targetName) {
            vscode5.window.showInformationMessage(`Assigned ticket to ${targetName}.`);
          } else {
            vscode5.window.showInformationMessage("Unassigned ticket.");
          }
        } catch (err) {
          vscode5.window.showErrorMessage(`Failed to assign ticket: ${err?.message || err}`);
        }
        break;
      case "log":
        console.log(`[Webview ${message.level || "info"}] ${message.text}`);
        if (message.level === "error") {
          vscode5.window.showErrorMessage(`[Agentic Kanban UI Error] ${message.text}`);
        }
        break;
      case "refresh":
        await boardManager.reloadBoards();
        this.broadcastCurrentState();
        break;
    }
  }
  broadcastCurrentState() {
    const boardManager = BoardManager.getInstance();
    const boards = boardManager.getAllBoards();
    if (boards.length === 0) {
      this.panel.webview.postMessage({
        type: "state",
        isOverview: false,
        boards: [],
        currentBoard: null,
        overview: null
      });
      return;
    }
    if (this.isOverviewMode) {
      const overview = boardManager.getMultiBoardOverview();
      this.panel.title = `Kanban: Workspace Overview`;
      this.panel.webview.postMessage({
        type: "state",
        isOverview: true,
        boards: boards.map((b) => ({ id: b.id, name: b.name, rootPath: b.rootPath })),
        currentBoard: null,
        overview
      });
      return;
    }
    let currentBoard = this.currentBoardId ? boardManager.getBoard(this.currentBoardId) : void 0;
    if (!currentBoard) {
      currentBoard = boards[0];
      this.currentBoardId = currentBoard.id;
    }
    this.panel.title = `Kanban: ${currentBoard.name}`;
    this.panel.webview.postMessage({
      type: "state",
      isOverview: false,
      boards: boards.map((b) => ({ id: b.id, name: b.name, rootPath: b.rootPath })),
      currentBoard,
      overview: null
    });
  }
  getHtmlForWebview(webview) {
    let webviewDir = vscode5.Uri.joinPath(this.extensionUri, "dist", "webview");
    if (!fs4.existsSync(webviewDir.fsPath)) {
      webviewDir = vscode5.Uri.joinPath(this.extensionUri, "src", "webview");
    }
    const v = Date.now();
    const scriptUri = webview.asWebviewUri(vscode5.Uri.joinPath(webviewDir, "app.js")).with({ query: `v=${v}` });
    const stylesUri = webview.asWebviewUri(vscode5.Uri.joinPath(webviewDir, "styles.css")).with({ query: `v=${v}` });
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data: https:;">
  <title>Agentic Kanban</title>
  <link rel="stylesheet" href="${stylesUri}">
</head>
<body>
  <div id="app">
    <!-- Header bar -->
    <header class="top-nav">
      <div class="nav-left">
        <div class="board-selector-wrap">
          <svg class="nav-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="9" y1="3" x2="9" y2="21"/>
            <line x1="15" y1="3" x2="15" y2="21"/>
          </svg>
          <select id="boardSelect" class="select-input"></select>
        </div>

        <div class="view-toggles">
          <button id="btnBoardView" class="toggle-btn active" title="Kanban Board View">Board</button>
          <button id="btnOverviewView" class="toggle-btn" title="Multi-Board Overview">Overview</button>
        </div>

        <button id="btnPlanDoc" class="nav-action-btn secondary" style="display:none;" title="Open Board Plan / Architecture">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          <span>Plan</span>
        </button>

        <button id="btnAgentRules" class="nav-action-btn secondary" title="Generate or Update AGENT.md System Rules">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
          </svg>
          <span>Rules</span>
        </button>
      </div>

      <div class="nav-center">
        <div class="search-box">
          <svg class="search-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" id="searchInput" placeholder="Search tickets, tags, epics..." autocomplete="off"/>
          <button id="clearSearchBtn" class="clear-search-btn" style="display:none;">&times;</button>
        </div>

        <div class="filter-controls">
          <select id="tagFilter" class="select-input small">
            <option value="">All Tags</option>
          </select>
          <select id="assigneeFilter" class="select-input small">
            <option value="">All Assignees</option>
          </select>
          <select id="priorityFilter" class="select-input small">
            <option value="">All Priorities</option>
            <option value="P0">P0 / Critical</option>
            <option value="P1">P1 / Core</option>
            <option value="P2">P2</option>
            <option value="P3">P3</option>
            <option value="Normal">Normal</option>
          </select>
        </div>
      </div>

      <div class="nav-right">
        <button id="btnNewTicket" class="nav-action-btn primary" title="Create New Ticket">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>New Ticket</span>
        </button>

        <button id="btnConfig" class="icon-btn" title="Open Board Configuration">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>

        <button id="btnRefresh" class="icon-btn" title="Refresh Board">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
        </button>
      </div>
    </header>

    <!-- Main Container -->
    <main id="mainContainer" class="main-content">
      <!-- Kanban Board View -->
      <div id="boardView" class="board-view">
        <div id="columnsContainer" class="columns-container"></div>
      </div>

      <!-- Multi-Board Overview Dashboard -->
      <div id="overviewView" class="overview-view" style="display:none;">
        <div class="overview-header-stats">
          <div class="stat-card">
            <div class="stat-number" id="statTotalBoards">0</div>
            <div class="stat-label">Active Boards</div>
          </div>
          <div class="stat-card">
            <div class="stat-number" id="statTotalTickets">0</div>
            <div class="stat-label">Total Tickets</div>
          </div>
          <div class="stat-card highlight-ongoing">
            <div class="stat-number" id="statOngoingTickets">0</div>
            <div class="stat-label">Ongoing Work</div>
          </div>
          <div class="stat-card highlight-assist">
            <div class="stat-number" id="statAssistanceTickets">0</div>
            <div class="stat-label">Needs Assistance</div>
          </div>
          <div class="stat-card highlight-blocked">
            <div class="stat-number" id="statBlockedTickets">0</div>
            <div class="stat-label">Blocked</div>
          </div>
          <div class="stat-card highlight-blocked">
            <div class="stat-number" id="statBlockedDependencies">0</div>
            <div class="stat-label">Blocked by Dep</div>
          </div>
        </div>

        <section class="overview-section">
          <div class="section-title">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <h2>Parallel Active Work (All Boards)</h2>
          </div>
          <div id="parallelWorkContainer" class="parallel-cards-grid"></div>
        </section>

        <section class="overview-section">
          <div class="section-title">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
            <h2>Project Boards</h2>
          </div>
          <div id="projectBoardsGrid" class="project-boards-grid"></div>
        </section>

        <section class="overview-section">
          <div class="section-title" style="display:flex;justify-content:space-between;align-items:center;width:100%;">
            <div style="display:flex;align-items:center;gap:8px;">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <h2>Workspace Activity Feed (Work Log Timeline)</h2>
            </div>
            <div class="feed-filters" style="display:flex;gap:8px;">
              <select id="feedDateFilter" class="select-input small">
                <option value="all">All Dates</option>
                <option value="today">Today</option>
                <option value="week">Past 7 Days</option>
              </select>
              <select id="feedBoardFilter" class="select-input small">
                <option value="">All Boards</option>
              </select>
            </div>
          </div>
          <div id="activityFeedContainer" class="activity-feed-container"></div>
        </section>
      </div>
    </main>

    <!-- Modal: New Ticket -->
    <div id="newTicketModal" class="modal-backdrop" style="display:none;">
      <div class="modal-card">
        <div class="modal-header">
          <h3 class="modal-title">Create New Ticket</h3>
          <button class="modal-close-btn" id="closeNewTicketModal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group" id="templateGroup">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <label for="newTicketTemplate" style="margin-bottom:0;">Template</label>
              <button type="button" id="btnInitTemplates" class="link-btn" title="Initialize default templates in .templates/">+ Init Templates</button>
            </div>
            <select id="newTicketTemplate" class="select-input full">
              <option value="">(Default Ticket Format)</option>
            </select>
          </div>
          <div class="form-group">
            <label for="newTicketTitle">Title *</label>
            <input type="text" id="newTicketTitle" class="text-input" placeholder="e.g. Implement real-time cache layer" required />
          </div>
          <div class="form-row">
            <div class="form-group half">
              <label for="newTicketColumn">Column *</label>
              <select id="newTicketColumn" class="select-input full"></select>
            </div>
            <div class="form-group half">
              <label for="newTicketSubfolder">Subfolder</label>
              <select id="newTicketSubfolder" class="select-input full">
                <option value="">(None - Column Root)</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group half">
              <label for="newTicketPriority">Priority</label>
              <select id="newTicketPriority" class="select-input full">
                <option value="Normal">Normal</option>
                <option value="P0">P0 \u2014 Critical</option>
                <option value="P1">P1 \u2014 Core</option>
                <option value="P2">P2</option>
                <option value="P3">P3</option>
              </select>
            </div>
            <div class="form-group half">
              <label for="newTicketAssignee">Assignee</label>
              <select id="newTicketAssignee" class="select-input full">
                <option value="">(Unassigned)</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label for="newTicketSummary">Summary</label>
            <textarea id="newTicketSummary" class="textarea-input" rows="3" placeholder="Brief 1-2 sentence description of goal and context..."></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button id="btnCancelTicket" class="modal-btn secondary">Cancel</button>
          <button id="btnSubmitTicket" class="modal-btn primary">Create Ticket</button>
        </div>
      </div>
    </div>

    <!-- Modal: Ticket Quick View / Dispatch -->
    <div id="ticketDetailModal" class="modal-backdrop" style="display:none;">
      <div class="modal-card large">
        <div class="modal-header">
          <div class="ticket-modal-badges" id="modalBadges"></div>
          <button class="modal-close-btn" id="closeDetailModal">&times;</button>
        </div>
        <div class="modal-body" id="modalDetailBody"></div>
        <div class="modal-footer">
          <button id="btnOpenInEditor" class="modal-btn secondary">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
            <span>Open in Editor</span>
          </button>
          <button id="btnCopyPromptModal" class="modal-btn secondary" title="Copy Agent Task Prompt to clipboard">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
            </svg>
            <span>Copy Prompt</span>
          </button>
          <button id="btnAssignModal" class="modal-btn secondary">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <line x1="19" y1="8" x2="19" y2="14"></line>
              <line x1="22" y1="11" x2="16" y2="11"></line>
            </svg>
            <span id="assignModalBtnText">Assign...</span>
          </button>
          <button id="btnRunInChatModal" class="modal-btn primary">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <span>Run in IDE Chat</span>
          </button>
        </div>
      </div>
    </div>
  </div>

  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
  dispose() {
    _KanbanWebviewManager.currentPanel = void 0;
    this.panel.dispose();
    while (this.disposables.length) {
      const x = this.disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }
};

// src/extension.ts
async function activate(context) {
  console.log("[Agentic Kanban] Extension activating...");
  const boardManager = BoardManager.getInstance();
  await boardManager.reloadBoards();
  boardManager.setupWatchers(context);
  const treeProvider = new BoardsTreeProvider(boardManager);
  vscode6.window.registerTreeDataProvider("agenticKanban.boardsView", treeProvider);
  context.subscriptions.push(
    vscode6.commands.registerCommand("agenticKanban.openBoard", (boardId) => {
      KanbanWebviewManager.createOrShow(context.extensionUri, boardId, false);
    }),
    vscode6.commands.registerCommand("agenticKanban.openOverview", () => {
      KanbanWebviewManager.createOrShow(context.extensionUri, void 0, true);
    }),
    vscode6.commands.registerCommand("agenticKanban.refreshBoards", async () => {
      await boardManager.reloadBoards();
      vscode6.window.showInformationMessage("Agentic Kanban: Boards refreshed.");
    }),
    vscode6.commands.registerCommand("agenticKanban.createTicket", async () => {
      const boards = boardManager.getAllBoards();
      if (boards.length === 0) {
        vscode6.window.showWarningMessage("No Kanban boards discovered in the workspace.");
        return;
      }
      let selectedBoard = boards[0];
      if (boards.length > 1) {
        const boardPick = await vscode6.window.showQuickPick(
          boards.map((b) => ({ label: b.name, description: b.rootPath, board: b })),
          { placeHolder: "Select target board" }
        );
        if (!boardPick)
          return;
        selectedBoard = boardPick.board;
      }
      const columnPick = await vscode6.window.showQuickPick(
        selectedBoard.columns.map((c) => ({ label: c.name, description: `${c.tickets.length} tickets`, column: c })),
        { placeHolder: "Select destination column" }
      );
      if (!columnPick)
        return;
      let subfolder = null;
      if (columnPick.column.subfolders.length > 0) {
        const subfolderPick = await vscode6.window.showQuickPick(
          [
            { label: "(Column Root)", subfolder: null },
            ...columnPick.column.subfolders.map((s) => ({ label: s.name, subfolder: s.name }))
          ],
          { placeHolder: "Select subfolder filter (optional)" }
        );
        if (subfolderPick && subfolderPick.subfolder) {
          subfolder = subfolderPick.subfolder;
        }
      }
      const title = await vscode6.window.showInputBox({
        prompt: "Enter ticket title",
        placeHolder: "e.g. Implement resilient retry loop"
      });
      if (!title || !title.trim())
        return;
      const createdPath = await boardManager.createTicket(
        selectedBoard.id,
        columnPick.column.name,
        subfolder,
        title.trim()
      );
      if (createdPath) {
        const doc = await vscode6.workspace.openTextDocument(vscode6.Uri.file(createdPath));
        await vscode6.window.showTextDocument(doc);
      }
    }),
    vscode6.commands.registerCommand("agenticKanban.openConfig", async (item) => {
      const boards = boardManager.getAllBoards();
      if (boards.length === 0)
        return;
      let board = boards[0];
      if (item && item.board) {
        board = item.board;
      } else if (boards.length > 1) {
        const pick = await vscode6.window.showQuickPick(
          boards.map((b) => ({ label: b.name, description: b.rootPath, board: b })),
          { placeHolder: "Select board" }
        );
        if (!pick)
          return;
        board = pick.board;
      }
      const configPath = path7.join(board.rootPath, "config.md");
      if (!fs5.existsSync(configPath)) {
        const defaultConfig = ConfigParser.generateDefaultConfig(board.name);
        await fs5.promises.writeFile(configPath, defaultConfig, "utf8");
      }
      const doc = await vscode6.workspace.openTextDocument(vscode6.Uri.file(configPath));
      await vscode6.window.showTextDocument(doc);
    }),
    vscode6.commands.registerCommand("agenticKanban.generateAgentRules", async (item) => {
      const boards = boardManager.getAllBoards();
      if (boards.length === 0) {
        vscode6.window.showWarningMessage("No active Kanban boards found.");
        return;
      }
      let board = boards[0];
      if (item && item.board) {
        board = item.board;
      } else if (boards.length > 1) {
        const pick = await vscode6.window.showQuickPick(
          boards.map((b) => ({ label: b.name, description: b.rootPath, board: b })),
          { placeHolder: "Select board to generate agent rules for" }
        );
        if (!pick)
          return;
        board = pick.board;
      }
      const res = await boardManager.generateAgentRules(board.id);
      if (!res)
        return;
      if (fs5.existsSync(res.targetPath)) {
        const choice = await vscode6.window.showQuickPick(
          [
            { label: "Overwrite", description: `Replace entire ${path7.basename(res.targetPath)}` },
            { label: "Append", description: `Append Kanban rules to existing ${path7.basename(res.targetPath)}` },
            { label: "Cancel", description: "Keep existing file unchanged" }
          ],
          { placeHolder: `${path7.basename(res.targetPath)} already exists. What would you like to do?` }
        );
        if (!choice || choice.label === "Cancel")
          return;
        if (choice.label === "Append") {
          const existing = await fs5.promises.readFile(res.targetPath, "utf8");
          await fs5.promises.writeFile(res.targetPath, `${existing}

${res.content}`, "utf8");
        } else {
          await fs5.promises.writeFile(res.targetPath, res.content, "utf8");
        }
      } else {
        await fs5.promises.writeFile(res.targetPath, res.content, "utf8");
      }
      vscode6.window.showInformationMessage(`Agent rules generated at ${path7.basename(res.targetPath)}`);
      const doc = await vscode6.workspace.openTextDocument(vscode6.Uri.file(res.targetPath));
      await vscode6.window.showTextDocument(doc);
    }),
    vscode6.commands.registerCommand("agenticKanban.initTemplates", async (item) => {
      const boards = boardManager.getAllBoards();
      if (boards.length === 0) {
        vscode6.window.showWarningMessage("No active Kanban boards found.");
        return;
      }
      let board = boards[0];
      if (item && item.board) {
        board = item.board;
      } else if (boards.length > 1) {
        const pick = await vscode6.window.showQuickPick(
          boards.map((b) => ({ label: b.name, description: b.rootPath, board: b })),
          { placeHolder: "Select board to initialize templates in" }
        );
        if (!pick)
          return;
        board = pick.board;
      }
      const created = await boardManager.initTemplates(board.id);
      if (created && created.length > 0) {
        vscode6.window.showInformationMessage(`Initialized templates: ${created.join(", ")} in ${board.name}/.templates/`);
        const firstTemplate = path7.join(board.rootPath, ".templates", created[0]);
        if (fs5.existsSync(firstTemplate)) {
          const doc = await vscode6.workspace.openTextDocument(vscode6.Uri.file(firstTemplate));
          await vscode6.window.showTextDocument(doc);
        }
      } else {
        vscode6.window.showInformationMessage(`.templates/ already contains templates for ${board.name}.`);
      }
    })
  );
  console.log("[Agentic Kanban] Activated successfully.");
}
function deactivate() {
  console.log("[Agentic Kanban] Deactivated.");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
