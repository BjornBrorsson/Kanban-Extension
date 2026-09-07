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

// test/runParserTests.ts
var runParserTests_exports = {};
__export(runParserTests_exports, {
  ConfigParser: () => ConfigParser,
  PromptFormatter: () => PromptFormatter,
  TicketParser: () => TicketParser
});
module.exports = __toCommonJS(runParserTests_exports);
var fs = __toESM(require("fs"));
var path3 = __toESM(require("path"));

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

// src/promptFormatter.ts
var path2 = __toESM(require("path"));
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
      const calculated = path2.relative(workspaceRoot, ticket.path).replace(/\\/g, "/");
      if (!calculated.startsWith("..")) {
        relPath = calculated;
      }
    } else if (boardRoot && ticket.path) {
      const boardDirName = path2.basename(boardRoot);
      const fromBoard = path2.relative(boardRoot, ticket.path).replace(/\\/g, "/");
      relPath = `${boardDirName}/${fromBoard}`;
    }
    let completedPath = "Tickets/Completed/";
    if (boardRoot && workspaceRoot) {
      const relBoard = path2.relative(workspaceRoot, boardRoot).replace(/\\/g, "/");
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

// test/runParserTests.ts
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}
async function runTests() {
  console.log("=== Running Parser Unit Tests ===");
  const root = path3.join(__dirname, "..");
  const ticketsRoot = path3.join(root, "Example Structure", "Tickets");
  const configPath = path3.join(ticketsRoot, "config.md");
  const configContent = fs.readFileSync(configPath, "utf8");
  const config = ConfigParser.parse(configContent, "Example Project Board");
  console.log("Testing ConfigParser...");
  assert(config.name === "Example Project Board", `Config name expected 'Example Project Board', got '${config.name}'`);
  assert(config.columnsOrder.length === 5, `Expected 5 columns in order, got ${config.columnsOrder.length}`);
  assert(config.autoUpdateStatus === true, "Expected autoUpdateStatus to be true");
  assert(config.assignees.length >= 4, `Expected at least 4 assignees, got ${config.assignees.length}`);
  const bjorn = config.assignees.find((a) => a.id === "bjorn");
  assert(bjorn !== void 0 && bjorn.type === "human", "Bjorn should be parsed as a human assignee");
  const claude = config.assignees.find((a) => a.id === "claude-code");
  assert(claude !== void 0 && claude.type === "agent", "Claude Code should be parsed as an agent assignee");
  assert(claude?.agentConfig?.type === "cli", "Claude Code runner type should be cli");
  const ideChat = config.assignees.find((a) => a.id === "ide-chat");
  assert(ideChat !== void 0 && ideChat.agentConfig?.type === "vscode-command", "ide-chat should be parsed as vscode-command");
  console.log("\u2713 ConfigParser tests passed!");
  console.log("\nTesting TicketParser on table ticket (ticket-019)...");
  const ticket019Path = path3.join(ticketsRoot, "Ongoing", "Example_ticket-019_cleanup-audit-trail.md");
  const ticket019Content = fs.readFileSync(ticket019Path, "utf8");
  const ticket019 = TicketParser.parse(ticket019Path, ticket019Content, ticketsRoot, "Ongoing", null);
  assert(ticket019.id === "ATF-019", `Expected ID ATF-019, got '${ticket019.id}'`);
  assert(ticket019.title.includes("Cleanup + audit-trail framework"), `Expected title to contain cleanup, got '${ticket019.title}'`);
  assert(ticket019.priority === "P0 \u2014 Critical", `Expected P0, got '${ticket019.priority}'`);
  assert(ticket019.epic?.includes("Test Data") === true, `Expected Epic C, got '${ticket019.epic}'`);
  assert(ticket019.labels.includes("cleanup"), "Expected label cleanup");
  assert(ticket019.labels.includes("audit"), "Expected label audit");
  assert(ticket019.acceptanceCriteria.length === 5, `Expected 5 criteria, got ${ticket019.acceptanceCriteria.length}`);
  assert(ticket019.progress.done === 0, `Expected 0 done, got ${ticket019.progress.done}`);
  assert(ticket019.hasWorkLog === true, "Expected hasWorkLog to be true");
  console.log("\u2713 Ticket-019 table parser tests passed!");
  console.log("\nTesting TicketParser on checklist progress (ticket-001)...");
  const ticket001Path = path3.join(ticketsRoot, "Assistance Required", "Example_ticket-001_local-gpu-model-host.md");
  const ticket001Content = fs.readFileSync(ticket001Path, "utf8");
  const ticket001 = TicketParser.parse(ticket001Path, ticket001Content, ticketsRoot, "Assistance Required", null);
  assert(ticket001.id === "ACM-001", `Expected ID ACM-001, got '${ticket001.id}'`);
  assert(ticket001.progress.total === 5, `Expected 5 total criteria, got ${ticket001.progress.total}`);
  assert(ticket001.progress.done === 2, `Expected 2 done criteria, got ${ticket001.progress.done}`);
  assert(ticket001.labels.includes("llm") && ticket001.labels.includes("gpu"), "Expected llm and gpu labels");
  console.log("\u2713 Ticket-001 checklist tests passed!");
  console.log("\nTesting TicketParser on freeform ticket (ticket-092)...");
  const ticket092Path = path3.join(ticketsRoot, "Backlog", "Needs further specification", "Example_ticket-092-Pathfix.md");
  const ticket092Content = fs.readFileSync(ticket092Path, "utf8");
  const ticket092 = TicketParser.parse(ticket092Path, ticket092Content, ticketsRoot, "Backlog", "Needs further specification");
  assert(ticket092.id.includes("092"), `Expected ID to contain 092, got '${ticket092.id}'`);
  assert(ticket092.subfolder === "Needs further specification", "Subfolder should be Needs further specification");
  assert(ticket092.column === "Backlog", "Column should be Backlog");
  assert(ticket092.summary.length > 20, "Expected non-empty summary from freeform text");
  console.log("\u2713 Ticket-092 freeform parser tests passed!");
  console.log("\nTesting updateTicketStatus...");
  const updated019 = TicketParser.updateTicketStatus(ticket019Content, "Completed");
  assert(updated019.includes("| **Status** | Completed |"), "Expected Status row to be updated to Completed");
  console.log("\u2713 updateTicketStatus tests passed!");
  console.log("\nTesting updateTicketAssignee...");
  const assignedAgent = TicketParser.updateTicketAssignee(ticket019Content, "Cline (Ollama / Gemma 4)");
  assert(assignedAgent.includes("| **Assignee** | Cline (Ollama / Gemma 4) |"), "Expected Assignee row to be updated to agent");
  const unassigned = TicketParser.updateTicketAssignee(assignedAgent, "");
  assert(unassigned.includes("| **Assignee** | \u2014 |"), "Expected Assignee row to be set to em-dash when unassigned");
  const parsedUnassigned = TicketParser.parse(ticket019Path, unassigned, ticketsRoot, "Completed", null);
  assert(parsedUnassigned.assignee === null, `Expected parsed assignee to be null, got: ${parsedUnassigned.assignee}`);
  console.log("\nTesting updateTicketAssignee on freeform ticket (ticket-092)...");
  const assigned092 = TicketParser.updateTicketAssignee(ticket092Content, "Bj\xF6rn");
  assert(assigned092.includes("| **Assignee** | Bj\xF6rn |"), "Expected Assignee table to be inserted into freeform ticket");
  const parsed092Assigned = TicketParser.parse(ticket092Path, assigned092, ticketsRoot, "Backlog", "Needs further specification");
  assert(parsed092Assigned.assignee === "Bj\xF6rn", `Expected parsed assignee to be 'Bj\xF6rn', got: ${parsed092Assigned.assignee}`);
  console.log("\u2713 Freeform ticket assignment tests passed!");
  console.log("\nTesting CRLF preservation...");
  const crlfContent = "# Test Ticket\r\n\r\n| Field | Value |\r\n|---|---|\r\n| **Status** | Ongoing |\r\n";
  const crlfAssigned = TicketParser.updateTicketAssignee(crlfContent, "Devin");
  assert(crlfAssigned.includes("\r\n| **Assignee** | Devin |"), "Expected CRLF line ending before inserted Assignee row");
  assert(!crlfAssigned.includes("\n| **Assignee** | Devin |") || crlfAssigned.includes("\r\n"), "Expected consistent CRLF");
  console.log("\u2713 CRLF preservation tests passed!");
  console.log("\nTesting YAML frontmatter assignee update...");
  const yamlContent = "---\ntitle: Feature X\nstatus: Ongoing\n---\n\n## Content";
  const yamlAssigned = TicketParser.updateTicketAssignee(yamlContent, "Copilot");
  assert(yamlAssigned.includes("assignee: Copilot"), "Expected assignee to be inserted in YAML frontmatter");
  console.log("\u2713 YAML frontmatter assignment tests passed!");
  console.log("\nTesting Assignee insertion on EXT-001 format...");
  const ext001Path = fs.existsSync(path3.join(root, "Tickets", "Completed", "EXT-001_copy-agent-task-prompt.md")) ? path3.join(root, "Tickets", "Completed", "EXT-001_copy-agent-task-prompt.md") : path3.join(root, "Tickets", "Ongoing", "EXT-001_copy-agent-task-prompt.md");
  if (fs.existsSync(ext001Path)) {
    const ext001Content = fs.readFileSync(ext001Path, "utf8");
    const ext001Assigned = TicketParser.updateTicketAssignee(ext001Content, "Cline CLI (Ollama - Gemma 4 E4B)");
    assert(ext001Assigned.includes("| **Assignee** | Cline CLI (Ollama - Gemma 4 E4B) |"), "Expected Assignee row inserted into EXT-001");
    const parsedExt001 = TicketParser.parse(ext001Path, ext001Assigned, path3.join(root, "Tickets"), "Ongoing", null);
    assert(parsedExt001.assignee === "Cline CLI (Ollama - Gemma 4 E4B)", `Expected parsed assignee to be Cline CLI, got: ${parsedExt001.assignee}`);
    const ext001Reassigned = TicketParser.updateTicketAssignee(ext001Assigned, "Bj\xF6rn");
    assert(ext001Reassigned.includes("| **Assignee** | Bj\xF6rn |"), "Expected Assignee row updated to Bj\xF6rn");
    assert(!ext001Reassigned.includes("Cline CLI"), "Expected Cline CLI to be replaced");
    console.log("\u2713 EXT-001 assignment and re-assignment tests passed!");
  }
  console.log("\nTesting ConfigParser prompt template parsing...");
  const inlineTemplateConfig = ConfigParser.parse(`
## Settings
- **Board Name**: Custom Prompt Board
- **Agent Prompt Template**: Work on {id} located at {relative_path}
  `, "Test Board");
  assert(
    inlineTemplateConfig.agentPromptTemplate === "Work on {id} located at {relative_path}",
    `Expected parsed inline template, got: '${inlineTemplateConfig.agentPromptTemplate}'`
  );
  const sectionTemplateConfig = ConfigParser.parse(`
## Settings
- **Board Name**: Custom Prompt Board

## Prompt Template
\`\`\`markdown
Special instructions for **{id}: {title}** at {relative_path}:
Summary: {summary}
Acceptance Criteria:
{acceptance_criteria}
\`\`\`
  `, "Test Board");
  assert(
    sectionTemplateConfig.agentPromptTemplate !== void 0 && sectionTemplateConfig.agentPromptTemplate.includes("Special instructions for **{id}: {title}**"),
    `Expected parsed block template, got: '${sectionTemplateConfig.agentPromptTemplate}'`
  );
  console.log("\u2713 ConfigParser prompt template tests passed!");
  console.log("\nTesting PromptFormatter default template...");
  const defaultPrompt = PromptFormatter.formatPrompt(ticket019, null, root, ticketsRoot);
  assert(
    defaultPrompt.includes("Please review and work on ticket **ATF-019:"),
    `Expected prompt to include 'Please review and work on ticket **ATF-019:', got:
${defaultPrompt}`
  );
  assert(
    defaultPrompt.includes("located at `Example Structure/Tickets/Ongoing/Example_ticket-019_cleanup-audit-trail.md`"),
    `Expected relative path to be computed relative to workspace root, got:
${defaultPrompt}`
  );
  assert(defaultPrompt.includes("### Summary"), "Expected prompt to contain ### Summary");
  assert(defaultPrompt.includes("### Key Acceptance Criteria"), "Expected prompt to contain Key Acceptance Criteria");
  assert(
    defaultPrompt.includes("- [ ] Mutations captured with before/after"),
    "Expected criteria to be formatted with checklist bullets"
  );
  assert(defaultPrompt.includes("### Instructions"), "Expected prompt to contain Instructions");
  assert(
    defaultPrompt.includes("Move the ticket to `Example Structure/Tickets/Completed/` once done."),
    `Expected completed path to be correctly derived, got:
${defaultPrompt}`
  );
  console.log("\u2713 PromptFormatter default template tests passed!");
  console.log("\nTesting PromptFormatter with custom template...");
  const customPrompt = PromptFormatter.formatPrompt(ticket001, sectionTemplateConfig, root, ticketsRoot);
  assert(
    customPrompt.includes("Special instructions for **ACM-001:"),
    `Expected custom template prefix, got:
${customPrompt}`
  );
  assert(
    customPrompt.includes("- [x] Ollama installed and running locally.") && customPrompt.includes("- [ ] Backend `.env` model endpoint"),
    "Expected done/undone checkboxes to reflect criterion state"
  );
  const noCriteriaTicket = { ...ticket092, acceptanceCriteria: [] };
  const fallbackPrompt = PromptFormatter.formatPrompt(noCriteriaTicket, null, root, ticketsRoot);
  assert(
    fallbackPrompt.includes("- [ ] Implement requirements as specified in ticket."),
    "Expected fallback criterion text when no criteria present"
  );
  console.log("\u2713 PromptFormatter custom template & edge cases tests passed!");
  console.log("\nTesting TicketParser.toggleCriterion (EXT-003)...");
  const checklistSample = `# Ticket With Criteria

## Acceptance Criteria
- [ ] Task 1: Initialize DB
- [ ] Task 2: Setup routes
- [x] Task 3: Write tests
`;
  const toggled0 = TicketParser.toggleCriterion(checklistSample, 0, true);
  assert(toggled0.includes("- [x] Task 1: Initialize DB"), "Expected task 1 to be checked");
  assert(toggled0.includes("- [ ] Task 2: Setup routes"), "Expected task 2 to remain unchecked");
  const toggled2 = TicketParser.toggleCriterion(toggled0, 2, false);
  assert(toggled2.includes("- [ ] Task 3: Write tests"), "Expected task 3 to be unchecked");
  const crlfChecklist = "# Title\r\n\r\n## Criteria\r\n- [ ] Task 1\r\n- [ ] Task 2\r\n";
  const crlfToggled = TicketParser.toggleCriterion(crlfChecklist, 1, true);
  assert(crlfToggled.includes("\r\n- [x] Task 2\r\n"), "Expected CRLF preserved when toggling checkbox");
  console.log("\u2713 TicketParser.toggleCriterion tests passed!");
  console.log("\nTesting TicketParser.extractWorkLogEntries (EXT-005)...");
  const workLogSample = `# Ticket With Log

## Summary
Ticket summary

## Work Log
- **2026-09-04**: Started implementation of core algorithm
- **2026-09-05**: Added regression tests and benchmark suite

## Next Steps
Ship it
`;
  const entries = TicketParser.extractWorkLogEntries(workLogSample, "EXT-005", "Live Timeline", "Tickets/EXT-005.md", "board-1", "Main Board");
  assert(entries.length === 2, `Expected 2 work log entries, got ${entries.length}`);
  assert(entries[0].date === "2026-09-04", `Expected date 2026-09-04, got '${entries[0].date}'`);
  assert(entries[0].text.includes("Started implementation"), `Expected text to include 'Started implementation', got '${entries[0].text}'`);
  assert(entries[0].line === 7, `Expected line 7, got ${entries[0].line}`);
  assert(entries[1].date === "2026-09-05", `Expected date 2026-09-05, got '${entries[1].date}'`);
  assert(entries[1].line === 8, `Expected line 8, got ${entries[1].line}`);
  console.log("\u2713 TicketParser.extractWorkLogEntries tests passed!");
  console.log("\nTesting PromptFormatter dependency blocker warning (EXT-004)...");
  const blockedTicket = {
    ...ticket019,
    dependsOn: ["EXT-000", "EXT-001"],
    unresolvedDependencies: ["EXT-000", "EXT-001 (Ongoing)"]
  };
  const blockedPrompt = PromptFormatter.formatPrompt(blockedTicket, null, root, ticketsRoot);
  assert(blockedPrompt.includes("\u26A0\uFE0F **DEPENDENCY WARNING**:"), "Expected prompt to include dependency blocker warning");
  assert(blockedPrompt.includes("EXT-000, EXT-001 (Ongoing)"), "Expected prompt to list unfinished dependencies");
  console.log("\u2713 PromptFormatter dependency blocker warning tests passed!");
  console.log("\nTesting ticket template interpolation (EXT-006)...");
  const templateSample = `# {id} \u2014 Fix: {title}

| Field | Value |
|---|---|
| **Status** | {column} |

## Work Log
- **{date}**: Created ticket.
`;
  const dateStr = "2026-09-07";
  const interpolated = templateSample.split("{id}").join("T-FIX-BUG").split("{title}").join("Fix memory leak").split("{column}").join("Backlog").split("{date}").join(dateStr);
  assert(interpolated.includes("# T-FIX-BUG \u2014 Fix: Fix memory leak"), "Expected title interpolated");
  assert(interpolated.includes("| **Status** | Backlog |"), "Expected status column interpolated");
  assert(interpolated.includes(`- **${dateStr}**: Created ticket.`), "Expected date interpolated");
  console.log("\u2713 Ticket template interpolation tests passed!");
  console.log("\n=== ALL UNIT TESTS PASSED SUCCESSFULLY! ===");
}
runTests().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ConfigParser,
  PromptFormatter,
  TicketParser
});
//# sourceMappingURL=test.js.map
