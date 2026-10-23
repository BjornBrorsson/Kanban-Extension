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
var vscode7 = __toESM(require("vscode"));
var path15 = __toESM(require("path"));
var fs13 = __toESM(require("fs"));

// src/boardManager.ts
var vscode2 = __toESM(require("vscode"));
var path4 = __toESM(require("path"));
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
          const clean2 = item.replace(/[`"']/g, "").trim();
          if (clean2 && clean2 !== "\u2014")
            labels.add(clean2);
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
  const slug2 = title.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, maxLen).replace(/-$/, "");
  return slug2 || "untitled";
}

// src/boardManager.ts
var BoardManager = class _BoardManager {
  static instance;
  boards = /* @__PURE__ */ new Map();
  watchers = [];
  changeEmitter = new vscode2.EventEmitter();
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
                const fileContent = fs2.readFileSync(t.path, "utf8");
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
    if (fs2.existsSync(resolved)) {
      return resolved;
    }
    const relToBoard = path4.resolve(board.rootPath, ticketPath);
    if (fs2.existsSync(relToBoard)) {
      return relToBoard;
    }
    const targetFilename = path4.basename(ticketPath).toLowerCase();
    const searchInDir = (dir) => {
      try {
        const entries = fs2.readdirSync(dir, { withFileTypes: true });
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
      vscode2.window.showErrorMessage(`Board not found: ${boardId}`);
      return false;
    }
    const sourcePath = this.resolveTicketPathOnDisk(board, ticketPath);
    if (!sourcePath) {
      vscode2.window.showErrorMessage(`Ticket file not found on disk: ${ticketPath}`);
      return false;
    }
    const filename = path4.basename(sourcePath);
    const targetDir = safeJoin(board.rootPath, targetColumn, targetSubfolder);
    if (!targetDir || path4.resolve(targetDir) === path4.resolve(board.rootPath)) {
      vscode2.window.showErrorMessage(`Invalid target column: ${targetColumn}`);
      return false;
    }
    if (!fs2.existsSync(targetDir)) {
      await fs2.promises.mkdir(targetDir, { recursive: true });
    }
    const targetPath = path4.join(targetDir, filename);
    if (path4.resolve(targetPath).toLowerCase() === path4.resolve(sourcePath).toLowerCase()) {
      return true;
    }
    if (fs2.existsSync(targetPath)) {
      vscode2.window.showErrorMessage(`Cannot move "${filename}": a ticket with that name already exists in ${targetColumn}${targetSubfolder ? "/" + targetSubfolder : ""}.`);
      return false;
    }
    try {
      try {
        await vscode2.workspace.fs.rename(vscode2.Uri.file(sourcePath), vscode2.Uri.file(targetPath), { overwrite: false });
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
    if (!board || ticketPath && !isInside(board.rootPath, ticketPath)) {
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
    const targetDir = safeJoin(board.rootPath, targetColumn, targetSubfolder);
    if (!targetDir || path4.resolve(targetDir) === path4.resolve(board.rootPath)) {
      vscode2.window.showErrorMessage(`Invalid target column: ${targetColumn}`);
      return null;
    }
    if (!fs2.existsSync(targetDir)) {
      await fs2.promises.mkdir(targetDir, { recursive: true });
    }
    const slug2 = slugify(title);
    const dateStr = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    let filename = `ticket-${dateStr}-${slug2}.md`;
    let fullPath = path4.join(targetDir, filename);
    let counter = 1;
    let idSuffix = "";
    while (fs2.existsSync(fullPath)) {
      filename = `ticket-${dateStr}-${slug2}-${counter}.md`;
      idSuffix = `-${counter}`;
      fullPath = path4.join(targetDir, filename);
      counter++;
    }
    let defaultContent = initialContent;
    if (defaultContent) {
      const generatedId = `T-${slug2.toUpperCase()}${idSuffix}`;
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
    const wsFolder = vscode2.workspace.workspaceFolders?.[0]?.uri.fsPath || path4.dirname(board.rootPath);
    const agentsDir = path4.join(wsFolder, ".agents");
    let targetPath = path4.join(wsFolder, "AGENTS.md");
    if (fs2.existsSync(agentsDir)) {
      const rulesDir = path4.join(agentsDir, "rules");
      if (!fs2.existsSync(rulesDir)) {
        await fs2.promises.mkdir(rulesDir, { recursive: true });
      }
      targetPath = path4.join(rulesDir, "kanban.md");
    } else if (fs2.existsSync(path4.join(wsFolder, "AGENT.md")) && !fs2.existsSync(path4.join(wsFolder, "AGENTS.md"))) {
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
    return { targetPath, created: !fs2.existsSync(targetPath), content };
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
    const templatesDir = path4.join(board.rootPath, ".templates");
    if (!fs2.existsSync(templatesDir)) {
      await fs2.promises.mkdir(templatesDir, { recursive: true });
    }
    const created = [];
    const featurePath = path4.join(templatesDir, "feature.md");
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
    const bugPath = path4.join(templatesDir, "bug.md");
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
var path14 = __toESM(require("path"));
var fs11 = __toESM(require("fs"));

// src/agentRunner.ts
var path5 = __toESM(require("path"));
var fs3 = __toESM(require("fs"));

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
      const vscode8 = getVsCode();
      const vscodeConfig = vscode8?.workspace?.getConfiguration?.("agenticKanban")?.get("antigravityPath");
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
    const vscode8 = getVsCode();
    const shell = options.shell || detectShellKind(vscode8?.env?.shell);
    const esc = (v) => escapeForDoubleQuotes(v, shell);
    const workspaceFolder = vscode8?.workspace?.workspaceFolders?.[0]?.uri.fsPath || path5.dirname(boardRoot);
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
    const vscode8 = getVsCode();
    if (assignee.type !== "agent" || !assignee.agentConfig) {
      vscode8?.window.showWarningMessage(`Assignee "${assignee.name}" is not configured as an executable agent.`);
      return null;
    }
    const config = assignee.agentConfig;
    const workspaceFolder = vscode8?.workspace?.workspaceFolders?.[0]?.uri.fsPath || path5.dirname(boardRoot);
    let ticketContent = "";
    try {
      ticketContent = await fs3.promises.readFile(ticket.path, "utf8");
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
    const vscode8 = getVsCode();
    if (req.kind === "cli") {
      const base = `Agent: ${req.assignee.name} \xB7 ${req.ticket.id || req.ticket.filename}`;
      let name = base;
      let n = 2;
      while (vscode8?.window.terminals?.some((t) => t.name === name))
        name = `${base} #${n++}`;
      const terminal = vscode8?.window.createTerminal({ name, cwd: req.cwd });
      if (!terminal)
        return false;
      terminal.show(false);
      await new Promise((r) => setTimeout(r, 600));
      terminal.sendText(req.command);
      vscode8?.window.showInformationMessage(`Dispatched ticket "${req.ticket.title}" to ${req.assignee.name}.`);
      return true;
    }
    await vscode8?.env.clipboard.writeText(req.prompt || "");
    vscode8?.window.showInformationMessage(`Copied ticket context to clipboard! Triggering ${req.assignee.name} (${req.command})...`);
    try {
      await vscode8?.commands.executeCommand(req.command);
    } catch (err) {
      vscode8?.window.showErrorMessage(`Failed to execute command "${req.command}": ${err?.message || err}`);
    }
    return true;
  }
};

// src/promptFormatter.ts
var path6 = __toESM(require("path"));
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
      const calculated = path6.relative(workspaceRoot, ticket.path).replace(/\\/g, "/");
      if (!calculated.startsWith("..")) {
        relPath = calculated;
      }
    } else if (boardRoot && ticket.path) {
      const boardDirName = path6.basename(boardRoot);
      const fromBoard = path6.relative(boardRoot, ticket.path).replace(/\\/g, "/");
      relPath = `${boardDirName}/${fromBoard}`;
    }
    let completedPath = "Tickets/Completed/";
    if (boardRoot && workspaceRoot) {
      const relBoard = path6.relative(workspaceRoot, boardRoot).replace(/\\/g, "/");
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

// src/fleet/fleetController.ts
var vscode4 = __toESM(require("vscode"));
var fs10 = __toESM(require("fs"));
var path13 = __toESM(require("path"));
var import_crypto = require("crypto");

// src/fleet/providers.ts
var fs4 = __toESM(require("fs"));
var path7 = __toESM(require("path"));
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
    this.filePath = path7.join(workspaceRoot, ".agentic-kanban", "providers.json");
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
    fs4.mkdirSync(path7.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs4.writeFileSync(tmp, JSON.stringify({ version: 1, providers: this.providers }, null, 2), "utf8");
    fs4.renameSync(tmp, this.filePath);
    this.listeners.forEach((fn) => fn());
  }
};

// src/fleet/sessions.ts
var fs5 = __toESM(require("fs"));
var path8 = __toESM(require("path"));

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
      fs5.mkdirSync(path8.dirname(this.file), { recursive: true });
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
    const key = path8.resolve(ticketPath).toLowerCase();
    return this.active().find((s) => path8.resolve(s.ticketPath).toLowerCase() === key);
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
    const check = this.canStart(p, now);
    const recent = this.startsInWindow(p, now).length;
    return {
      providerId: p.id,
      state: check.state,
      reason: check.reason,
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
      retryAt: check.retryAt,
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
      points: req.points,
      estCost: req.estCost,
      estMinutes: req.estMinutes
    };
    this.sessions.push(session);
    this.payloads.set(session.id, { req });
    const check = this.canStart(req.provider, now, req.estCost || 0);
    if (check.ok) {
      await this.start(session);
    } else if (req.queueIfBusy === false) {
      session.status = "cancelled";
      session.endedAt = now;
      session.note = `Not started: ${check.reason}`;
      this.payloads.delete(session.id);
    } else {
      session.note = `Queued: ${check.reason}`;
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
      const check = this.canStart(p, now);
      if (check.ok) {
        await this.start(s);
      } else {
        const note = `Queued: ${check.reason}`;
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

// src/fleet/detect.ts
var fs6 = __toESM(require("fs"));
var http = __toESM(require("http"));
var os = __toESM(require("os"));
var path9 = __toESM(require("path"));
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
    return fs6.statSync(p).isFile();
  } catch {
    return false;
  }
}
function extraSearchDirs(env3 = process.env) {
  const home = env3.USERPROFILE || env3.HOME || os.homedir();
  const dirs = [];
  if (isWin()) {
    const local = env3.LOCALAPPDATA || path9.join(home, "AppData", "Local");
    const roaming = env3.APPDATA || path9.join(home, "AppData", "Roaming");
    dirs.push(
      path9.join(roaming, "npm"),
      path9.join(local, "Programs", "Ollama"),
      path9.join(local, "Programs", "Devin", "bin"),
      path9.join(local, "Programs", "Devin Next", "bin"),
      path9.join(local, "agy", "bin"),
      path9.join(local, "Microsoft", "WindowsApps"),
      path9.join(home, ".local", "bin"),
      path9.join(home, ".claude", "local"),
      path9.join(env3.ProgramFiles || "C:\\Program Files", "Ollama"),
      path9.join(env3.ProgramFiles || "C:\\Program Files", "agy", "bin")
    );
    for (const root of [path9.join(local, "fnm_multishells"), env3.FNM_DIR ? path9.join(env3.FNM_DIR, "node-versions") : "", "C:\\fnm\\node-versions"]) {
      if (!root || !fs6.existsSync(root))
        continue;
      try {
        for (const v of fs6.readdirSync(root))
          dirs.push(path9.join(root, v, "installation"), path9.join(root, v));
      } catch {
      }
    }
  } else {
    dirs.push(
      path9.join(home, ".local", "bin"),
      path9.join(home, ".claude", "local"),
      path9.join(home, ".agy", "bin"),
      path9.join(home, ".npm-global", "bin"),
      path9.join(home, ".cargo", "bin"),
      "/usr/local/bin",
      "/opt/homebrew/bin",
      "/usr/bin"
    );
  }
  return dirs;
}
function findExecutable(names, env3 = process.env, extraDirs = extraSearchDirs(env3)) {
  const pathDirs = (env3.PATH || env3.Path || "").split(path9.delimiter).filter(Boolean);
  const dirs = [...pathDirs, ...extraDirs];
  const exts = pathExts();
  for (const name of names) {
    for (const dir of dirs) {
      for (const ext of exts) {
        const candidate = path9.join(dir, name + ext);
        if (isFile(candidate))
          return candidate;
      }
    }
  }
  return void 0;
}
function findForKind(kind, env3 = process.env, extraDirs) {
  const names = EXECUTABLE_NAMES[kind];
  if (!names)
    return void 0;
  if (kind === "antigravity") {
    const local = env3.LOCALAPPDATA ? path9.join(env3.LOCALAPPDATA, "agy", "bin", "agy.exe") : "";
    if (local && isFile(local))
      return local;
    for (const key of ["AGY_PATH", "ANTIGRAVITY_PATH"]) {
      const v = env3[key];
      if (v && isFile(v))
        return v;
    }
  }
  return findExecutable(names, env3, extraDirs);
}
function parseOllamaList(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length && /^name\s+/i.test(lines[0]))
    lines.shift();
  return lines.map((l) => l.split(/\s+/)[0]).filter(Boolean);
}
function httpGetJson(url, timeoutMs) {
  return new Promise((resolve8, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (d) => body += d);
      res.on("end", () => {
        try {
          resolve8(JSON.parse(body));
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
  return new Promise((resolve8) => {
    (0, import_child_process.execFile)(exe, ["list"], { timeout: 4e3, windowsHide: true, shell: isWin() && /\.(cmd|bat)$/i.test(exe) }, (err, stdout) => {
      resolve8(err ? [] : parseOllamaList(String(stdout)));
    });
  });
}
async function detectAll(env3 = process.env) {
  const out = [];
  for (const kind of Object.keys(EXECUTABLE_NAMES)) {
    const p = findForKind(kind, env3);
    if (!p)
      continue;
    const d = { kind, path: p };
    if (kind === "ollama")
      d.models = await detectOllamaModels(void 0, p);
    out.push(d);
  }
  return out;
}
async function detectOne(kind, env3 = process.env) {
  const p = findForKind(kind, env3);
  const d = { kind, path: p };
  if (kind === "ollama")
    d.models = await detectOllamaModels(void 0, p);
  return d;
}

// src/fleet/messageBoard.ts
var fs7 = __toESM(require("fs"));
var path10 = __toESM(require("path"));
function isMessageBoardDir(dir) {
  try {
    return fs7.statSync(dir).isDirectory() && (fs7.existsSync(path10.join(dir, "ACTIVE_AGENTS.md")) || fs7.existsSync(path10.join(dir, "THREADS")) || fs7.existsSync(path10.join(dir, "LOCKS")));
  } catch {
    return false;
  }
}
function findMessageBoard(roots) {
  for (const r of roots) {
    let dir = path10.resolve(r);
    for (let i = 0; i < 4; i++) {
      const candidate = path10.join(dir, "MessageBoard");
      if (isMessageBoardDir(candidate))
        return candidate;
      const parent = path10.dirname(dir);
      if (parent === dir)
        break;
      dir = parent;
    }
  }
  return void 0;
}
function read(file) {
  try {
    return fs7.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}
var clean = (s) => s.replace(/\*\*/g, "").replace(/`/g, "").trim();
function parseActiveAgents(md) {
  const out = [];
  let inTable = false;
  for (const line of md.split(/\r?\n/)) {
    if (/^\|\s*Agent Name\s*\|/i.test(line)) {
      inTable = true;
      continue;
    }
    if (!inTable)
      continue;
    if (!line.trim().startsWith("|")) {
      if (out.length)
        break;
      continue;
    }
    if (/^\|\s*-{2,}/.test(line))
      continue;
    const cells = line.trim().replace(/^\||\|$/g, "").split("|").map(clean);
    if (cells.length < 2 || !cells[0])
      continue;
    out.push({ name: cells[0], client: cells[1] || "", focus: cells[2] || "", claimed: cells[3] || "", ticket: cells[4] || "", lastCheckin: cells[5] || "" });
  }
  return out;
}
function field(md, name) {
  const m = md.match(new RegExp(`^\\|\\s*\\*{0,2}${name}\\*{0,2}\\s*\\|\\s*(.+?)\\s*\\|\\s*$`, "im"));
  return m ? clean(m[1]) : "";
}
function parseThread(file, text) {
  const title = (text.match(/^#\s+(.+)$/m)?.[1] || path10.basename(file, ".md")).trim();
  const headings = [...text.matchAll(/^###\s+(.+)$/gm)].map((m) => m[1].trim());
  return {
    file: path10.basename(file),
    path: file,
    title,
    status: field(text, "Status"),
    author: field(text, "Author"),
    created: field(text, "Created"),
    ticket: field(text, "Related Ticket"),
    messages: headings.length,
    lastMessage: headings[headings.length - 1] || ""
  };
}
function readClaims(boardDir, now = Date.now()) {
  const dir = path10.join(boardDir, "LOCKS");
  let files = [];
  try {
    files = fs7.readdirSync(dir).filter((f) => f.endsWith(".lock"));
  } catch {
    return [];
  }
  const out = [];
  for (const f of files) {
    try {
      const l = JSON.parse(fs7.readFileSync(path10.join(dir, f), "utf8"));
      const exp = Date.parse(l.expires);
      out.push({
        key: l.key || f.replace(/\.lock$/, ""),
        agent: l.agent || "?",
        ticket: l.ticket || "",
        reason: l.reason || "",
        claimed: l.claimed || "",
        expires: l.expires || "",
        expired: Number.isFinite(exp) ? exp <= now : false,
        minutesLeft: Number.isFinite(exp) ? Math.round((exp - now) / 6e4) : 0
      });
    } catch {
    }
  }
  return out.sort((a, b) => Number(a.expired) - Number(b.expired) || a.key.localeCompare(b.key));
}
function readMessageBoard(boardDir, now = Date.now()) {
  const threadsDir = path10.join(boardDir, "THREADS");
  let threadFiles = [];
  try {
    threadFiles = fs7.readdirSync(threadsDir).filter((f) => /\.md$/i.test(f)).sort().reverse();
  } catch {
  }
  const threads = threadFiles.map((f) => parseThread(path10.join(threadsDir, f), read(path10.join(threadsDir, f))));
  const dms = [];
  const dmDir = path10.join(boardDir, "DIRECT_MESSAGES");
  try {
    for (const to of fs7.readdirSync(dmDir, { withFileTypes: true }).filter((d) => d.isDirectory())) {
      for (const f of fs7.readdirSync(path10.join(dmDir, to.name)).filter((x) => /\.md$/i.test(x)).sort().reverse()) {
        const p = path10.join(dmDir, to.name, f);
        dms.push({ file: f, path: p, to: to.name, title: (read(p).match(/^#\s+(.+)$/m)?.[1] || f).trim() });
      }
    }
  } catch {
  }
  let archived = 0;
  try {
    archived = fs7.readdirSync(path10.join(boardDir, "ARCHIVE")).filter((f) => /\.md$/i.test(f)).length;
  } catch {
  }
  const log = read(path10.join(boardDir, "LOCKS", "CLAIMS_LOG.md")).split(/\r?\n/).filter((l) => l.trim()).slice(-12).reverse();
  return { root: boardDir, agents: parseActiveAgents(read(path10.join(boardDir, "ACTIVE_AGENTS.md"))), claims: readClaims(boardDir, now), threads, dms, archived, claimsLog: log };
}
var slug = (s) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
var stamp = (d = /* @__PURE__ */ new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
function replyToThread(threadPath, author, client, text, now = /* @__PURE__ */ new Date()) {
  const body = `
---

### ${stamp(now)} \u2014 ${author} (${client})
${text.trim()}
`;
  fs7.appendFileSync(threadPath, body, "utf8");
}
function createThread(boardDir, title, author, client, firstMessage, ticket = "", now = /* @__PURE__ */ new Date()) {
  const dir = path10.join(boardDir, "THREADS");
  fs7.mkdirSync(dir, { recursive: true });
  const used = [...fs7.readdirSync(dir), ...fs7.existsSync(path10.join(boardDir, "ARCHIVE")) ? fs7.readdirSync(path10.join(boardDir, "ARCHIVE")) : []].map((f) => Number(f.match(/THREAD_(\d+)/i)?.[1])).filter((n) => Number.isFinite(n));
  const next = String((used.length ? Math.max(...used) : 0) + 1).padStart(3, "0");
  const file = path10.join(dir, `THREAD_${next}_${slug(title).slice(0, 40) || "topic"}.md`);
  const content = `# THREAD-${next}: ${title.trim()}

| Metadata | Details |
|---|---|
| **Author** | ${author} |
| **Environment** | ${client} |
| **Status** | Open |
| **Related Ticket** | ${ticket || "None"} |
| **Created** | ${stamp(now)} |

---

## Topic Overview
${firstMessage.trim()}

---

## Conversation Log
`;
  fs7.writeFileSync(file, content, "utf8");
  return file;
}
var lockSlug = (key) => key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function logClaim(boardDir, line) {
  try {
    fs7.mkdirSync(path10.join(boardDir, "LOCKS"), { recursive: true });
    fs7.appendFileSync(path10.join(boardDir, "LOCKS", "CLAIMS_LOG.md"), `- ${(/* @__PURE__ */ new Date()).toISOString()} ${line}
`, "utf8");
  } catch {
  }
}
function claim(boardDir, key, agent, reason, ticket = "", minutes = 60, now = Date.now()) {
  const dir = path10.join(boardDir, "LOCKS");
  fs7.mkdirSync(dir, { recursive: true });
  const file = path10.join(dir, `${lockSlug(key)}.lock`);
  const lock = (claimed) => JSON.stringify({
    key,
    agent,
    ticket,
    reason,
    claimed: claimed || new Date(now).toISOString(),
    renewed: new Date(now).toISOString(),
    expires: new Date(now + minutes * 6e4).toISOString()
  }, null, 2);
  try {
    fs7.writeFileSync(file, lock(), { flag: "wx" });
    logClaim(boardDir, `CLAIM ${key} by ${agent} (${minutes} min) - ${reason}`);
    return { ok: true };
  } catch (e) {
    if (e?.code !== "EEXIST")
      throw e;
  }
  let cur = {};
  try {
    cur = JSON.parse(fs7.readFileSync(file, "utf8"));
  } catch {
    cur = { agent: "?", expires: "9999-12-31T00:00:00Z" };
  }
  if (cur.agent === agent) {
    fs7.writeFileSync(file, lock(cur.claimed), "utf8");
    logClaim(boardDir, `RENEW ${key} by ${agent}`);
    return { ok: true, renewed: true };
  }
  if (Date.parse(cur.expires) > now)
    return { ok: false, heldBy: cur.agent, expires: cur.expires };
  fs7.writeFileSync(file, lock(), "utf8");
  logClaim(boardDir, `TAKEOVER ${key} by ${agent} from ${cur.agent} (expired ${cur.expires}) - ${reason}`);
  return { ok: true };
}
function release(boardDir, key, agent, force = false) {
  const file = path10.join(boardDir, "LOCKS", `${lockSlug(key)}.lock`);
  let cur;
  try {
    cur = JSON.parse(fs7.readFileSync(file, "utf8"));
  } catch {
    return false;
  }
  if (cur.agent !== agent && !force)
    return false;
  try {
    fs7.unlinkSync(file);
  } catch {
    return false;
  }
  logClaim(boardDir, `RELEASE ${key} by ${agent}${cur.agent !== agent ? ` (forced; holder was ${cur.agent})` : ""}`);
  return true;
}

// src/fleet/catalog.ts
var fs8 = __toESM(require("fs"));
var http2 = __toESM(require("http"));
var os2 = __toESM(require("os"));
var path11 = __toESM(require("path"));
var import_child_process2 = require("child_process");
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
  return new Promise((resolve8, reject) => {
    const req = http2.get(url, { timeout: timeoutMs }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (d) => body += d);
      res.on("end", () => {
        try {
          resolve8(JSON.parse(body));
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
function listCopilotLearned(home = os2.homedir()) {
  const ids = /* @__PURE__ */ new Set();
  const dir = path11.join(home, ".copilot");
  try {
    const cfg = JSON.parse(fs8.readFileSync(path11.join(dir, "config.json"), "utf8").replace(/^\s*\/\/.*$/gm, ""));
    for (const id of cfg.recentModelIds || [])
      ids.add(String(id));
  } catch {
  }
  try {
    const st = JSON.parse(fs8.readFileSync(path11.join(dir, "settings.json"), "utf8"));
    if (st.model)
      ids.add(String(st.model));
  } catch {
  }
  try {
    const logs = fs8.readdirSync(path11.join(dir, "logs")).filter((f) => f.endsWith(".log")).sort().slice(-40);
    for (const f of logs) {
      const text = fs8.readFileSync(path11.join(dir, "logs", f), "utf8");
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
  return new Promise((resolve8, reject) => {
    (0, import_child_process2.execFile)(exe, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024, shell: isShim(exe) }, (err, stdout, stderr) => {
      if (err && !String(stdout).trim())
        reject(new Error(String(stderr || err.message).trim().slice(0, 300)));
      else
        resolve8(String(stdout));
    });
  });
}
async function listProviderModels(p, env3 = process.env, importsDir) {
  const base = { providerId: p.id, providerName: p.name, kind: p.kind, fetchedAt: Date.now() };
  if (importsDir) {
    try {
      const text = fs8.readFileSync(path11.join(importsDir, `${p.id}.txt`), "utf8");
      const policy = parseCopilotPolicy(text);
      const models = policy.length ? policy : parseGenericModels(text);
      if (models.length)
        return { ...base, source: "import", command: `imports/${p.id}.txt`, ok: true, models };
    } catch {
    }
  }
  const exe = p.path || findForKind(p.kind, env3);
  const fail = (command, error) => ({ ...base, source: "command", command, ok: false, error, models: [] });
  try {
    if (p.listCommand) {
      const parts = p.listCommand.trim().split(/\s+/);
      const bin = parts[0] === p.kind || !path11.isAbsolute(parts[0]) ? findExecutable([parts[0]], env3) || parts[0] : parts[0];
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
    this.dir = path11.join(workspaceRoot, ".agentic-kanban", "models");
  }
  get rawDir() {
    return path11.join(this.dir, "raw");
  }
  get catalogPath() {
    return path11.join(this.dir, "catalog.json");
  }
  get overridesPath() {
    return path11.join(this.dir, "pricing.overrides.json");
  }
  get importsDir() {
    return path11.join(this.dir, "imports");
  }
  /** Saves a pasted model list for a provider (used by the next refresh). */
  saveImport(providerId, text) {
    const file = path11.join(this.importsDir, `${providerId}.txt`);
    fs8.mkdirSync(path11.dirname(file), { recursive: true });
    fs8.writeFileSync(file, text, "utf8");
    return file;
  }
  get benchPath() {
    return path11.join(this.dir, "bench.json");
  }
  writeJson(file, data) {
    fs8.mkdirSync(path11.dirname(file), { recursive: true });
    const tmp = file + ".tmp";
    fs8.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs8.renameSync(tmp, file);
  }
  saveRaw(raw) {
    const file = path11.join(this.rawDir, `${raw.providerId}.json`);
    this.writeJson(file, raw);
    return file;
  }
  loadRaws() {
    try {
      return fs8.readdirSync(this.rawDir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs8.readFileSync(path11.join(this.rawDir, f), "utf8")));
    } catch {
      return [];
    }
  }
  loadOverrides() {
    try {
      return JSON.parse(fs8.readFileSync(this.overridesPath, "utf8"));
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
      return JSON.parse(fs8.readFileSync(this.catalogPath, "utf8"));
    } catch {
      return void 0;
    }
  }
  loadBench() {
    try {
      return JSON.parse(fs8.readFileSync(this.benchPath, "utf8"));
    } catch {
      return {};
    }
  }
  saveBench(b) {
    this.writeJson(this.benchPath, b);
  }
  /** Step 1: ask every provider for its models and save the raw results. */
  async refreshRaw(providers, env3 = process.env) {
    const out = [];
    for (const p of providers) {
      if (!p.enabled)
        continue;
      const raw = await listProviderModels(p, env3, this.importsDir);
      this.saveRaw(raw);
      out.push(raw);
    }
    return out;
  }
  /** Writes catalog.md (cleaned) and full/<provider>.md (complete raw lists) for human review. */
  exportDocs() {
    const files = [];
    const catalog = this.loadCatalog();
    fs8.mkdirSync(path11.join(this.dir, "full"), { recursive: true });
    if (catalog) {
      const f = path11.join(this.dir, "catalog.md");
      fs8.writeFileSync(f, renderCatalogMarkdown(catalog), "utf8");
      files.push(f);
    }
    for (const raw of this.loadRaws()) {
      const f = path11.join(this.dir, "full", `${raw.providerId}.md`);
      fs8.writeFileSync(f, renderRawMarkdown(raw), "utf8");
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
  visible(providerId) {
    return (this.catalog?.models || []).filter((m) => m.providerId === providerId && !m.hidden);
  }
  hasData() {
    return !!this.catalog?.models.length;
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

// src/fleet/speed.ts
var fs9 = __toESM(require("fs"));
var path12 = __toESM(require("path"));
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
var JsonSpeedStore = class {
  constructor(file) {
    this.file = file;
  }
  load() {
    try {
      return JSON.parse(fs9.readFileSync(this.file, "utf8"));
    } catch {
      return {};
    }
  }
  save(data) {
    try {
      fs9.mkdirSync(path12.dirname(this.file), { recursive: true });
      fs9.writeFileSync(this.file, JSON.stringify(data), "utf8");
    } catch {
    }
  }
};
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
function estimateRun(ticket, p, model, ctx) {
  const points = ticketPoints(ticket);
  const entry = ctx.catalog.get(p.id, model);
  const local = entry ? entry.local : p.kind === "ollama" || p.kind === "ollama-aider";
  const hasOverride = parseTierOverrides(p.modelTiers)[model.toLowerCase()] !== void 0;
  const tier = entry && !hasOverride ? entry.tier : modelTier(p, model);
  const pricing = entry?.pricing || estimatePricing(tier, local);
  const tps = priorTps(tier, local, entry?.sizeB, ctx.bench?.[`${p.id}::${model}`]?.tps);
  return {
    points,
    tier,
    local,
    estCost: estimateCost(pricing, points),
    estMinutes: ctx.speed.predict(p.id, model, points, priorMinutes(points, tps))
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
      const run = estimateRun(ticket, p, model, ctx);
      const { tier, estCost, estMinutes } = run;
      if (tier < needed)
        continue;
      const check = sessions.canStart(p, now, estCost);
      const virtual = ctx.virtualSpent?.get(p.id) || 0;
      let waitMinutes = 0;
      if (!check.ok) {
        waitMinutes = check.retryAt ? Math.max(0, (check.retryAt - now) / 6e4) : estMinutes / 2;
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
        model,
        tier,
        points,
        estMinutes,
        estCost,
        waitMinutes,
        lambda,
        score,
        startsNow,
        summary: `${p.name}${model ? " \xB7 " + model : ""}: ~${Math.round(estMinutes)} min${estCost > 0 ? `, ~$${estCost.toFixed(2)}` : ", free"}${waitMinutes > 0 ? `, starts in ~${Math.round(waitMinutes)} min` : ""}${lambda > 0.5 ? `, quota ${lambda >= 2 ? "scarce" : "tight"}` : ""}`
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
function parseReset(window6, now) {
  const epoch = window6.match(/limit reached\|(\d{10})/i);
  if (epoch)
    return Number(epoch[1]) * 1e3;
  const phrase = /\b(?:in|after|retry[- ]after:?)\s+(\d[^.\n]{0,40})/gi;
  let pm;
  while ((pm = phrase.exec(window6)) !== null) {
    const p = pm[1];
    const h = p.match(/(\d+(?:\.\d+)?)\s*(?:h|hrs?|hours?)\b/i);
    const mi = p.match(/(\d+)\s*(?:m|mins?|minutes?)\b/i);
    const se = p.match(/(\d+)\s*(?:s|secs?|seconds?)\b/i);
    const ms = ((h ? Number(h[1]) * 3600 : 0) + (mi ? Number(mi[1]) * 60 : 0) + (se ? Number(se[1]) : 0)) * 1e3;
    if (ms > 0)
      return now + ms;
  }
  const clock = window6.match(/resets?(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (clock && (clock[3] || clock[2] || Number(clock[1]) > 12)) {
    return nextClockTime(Number(clock[1]), Number(clock[2] || 0), clock[3], now);
  }
  return void 0;
}
function detectLimit(text, models = [], now = Date.now()) {
  const clean2 = stripAnsi(text);
  const m = LIMIT_RE.exec(clean2);
  if (!m)
    return null;
  const start = Math.max(0, m.index - 120);
  const around = clean2.slice(start, m.index + 260);
  const lower = around.toLowerCase();
  const model = [...models].sort((a, b) => b.length - a.length).find((x) => x && lower.includes(x.toLowerCase()));
  return {
    resetAt: parseReset(clean2.slice(m.index, m.index + 260), now),
    model,
    excerpt: clean2.slice(Math.max(0, m.index - 20), m.index + 140).replace(/\s+/g, " ").trim()
  };
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

// src/fleet/fleetController.ts
var DEFAULT_SETTINGS = {
  autopilot: false,
  autoReview: false,
  orchestratorProviderId: "",
  orchestratorModel: "",
  intervalSeconds: 30,
  maxNewPerTick: 3,
  autoResume: false,
  maxAutoRetries: 2,
  autoFailover: true,
  backgroundTerminals: true,
  idleMinutes: 10,
  objective: "balanced",
  keepModelVersions: 2
};
var RESUME_TASK = "You were interrupted while working on ticket {ticket_path}: {ticket_title} (network error, crash, or the editor/PC closed). Check the ticket Work Log and the git status/diff to see what is already done, then continue from where you stopped. Do not redo finished work. If everything is already complete, verify it and say so in the Work Log.";
var REVIEW_TASK = "Code-review the work done for ticket {ticket_path}: {ticket_title}. Check every acceptance criterion, run the tests, and record findings under the ticket Work Log. Do not start new features. If the work passes, say so in the Work Log.";
var TerminalLauncher = class {
  terminals = /* @__PURE__ */ new Map();
  manager;
  /** Set while the editor is closing so vanishing terminals are not mistaken for user action. */
  shuttingDown = false;
  onLimit;
  onAttention;
  modelsFor;
  lastOutput = /* @__PURE__ */ new Map();
  lastOutputAt(id) {
    return this.lastOutput.get(id);
  }
  hasTerminal(id) {
    return this.terminals.has(id);
  }
  constructor(disposables) {
    disposables.push(
      vscode4.window.onDidCloseTerminal((t) => {
        for (const [id, term] of this.terminals) {
          if (term === t) {
            this.terminals.delete(id);
            if (!this.shuttingDown)
              this.manager.ended(id, t.exitStatus?.code, "Terminal closed", true);
          }
        }
      })
    );
    const onEnd = vscode4.window.onDidEndTerminalShellExecution;
    if (typeof onEnd === "function") {
      disposables.push(
        onEnd((e) => {
          for (const [id, term] of this.terminals) {
            if (term === e.terminal) {
              this.manager.ended(id, typeof e.exitCode === "number" ? e.exitCode : void 0);
            }
          }
        })
      );
    }
  }
  async launch(session, payload) {
    if (payload.kind === "vscode-command") {
      await AgentRunner.launchDefault(payload);
      setTimeout(() => this.manager.ended(session.id, 0, "Handed to IDE chat"), 0);
      return true;
    }
    const base = `Agent: ${session.providerName} \xB7 ${session.ticketId || path13.basename(session.ticketPath)}`;
    let name = base;
    let n = 2;
    while (vscode4.window.terminals.some((t) => t.name === name))
      name = `${base} #${n++}`;
    const hidden = !!session.hidden;
    const terminal = vscode4.window.createTerminal({ name, cwd: payload.cwd, hideFromUser: hidden });
    this.terminals.set(session.id, terminal);
    if (!hidden)
      terminal.show(true);
    const deadline = Date.now() + 3e3;
    while (!terminal.shellIntegration && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
    const si = terminal.shellIntegration;
    if (si && typeof si.executeCommand === "function") {
      const exec = si.executeCommand(payload.command);
      void this.watch(session, exec);
    } else {
      terminal.sendText(payload.command);
    }
    return true;
  }
  /** Reads the agent's output (shell integration) to spot usage limits and prompts that need a human. */
  async watch(session, exec) {
    if (!exec || typeof exec.read !== "function")
      return;
    let buf = "";
    let limitFired = false;
    try {
      for await (const chunk of exec.read()) {
        this.lastOutput.set(session.id, Date.now());
        buf = (buf + chunk).slice(-8e3);
        if (!limitFired) {
          const models = this.modelsFor?.(session.providerId) || [];
          const info = detectLimit(buf.slice(-2500), models.length ? models : [session.model]);
          if (info) {
            limitFired = true;
            this.onLimit?.(session, info);
          }
        }
        const attention = detectAttention(buf.slice(-800));
        if (attention)
          this.onAttention?.(session, attention);
        else if (chunk.length > 40)
          this.onAttention?.(session, void 0);
      }
    } catch {
    }
  }
  show(session) {
    const t = this.terminals.get(session.id);
    if (t)
      t.show(false);
    else
      vscode4.window.showInformationMessage(`No live terminal for this session (${session.status}). Use Resume to continue it in a new terminal.`);
  }
  kill(session) {
    const t = this.terminals.get(session.id);
    if (t) {
      this.terminals.delete(session.id);
      t.dispose();
    }
  }
};
var FleetController = class _FleetController {
  static instance;
  registry;
  sessions;
  settings;
  settingsPath;
  briefPath;
  timer;
  reviewed = /* @__PURE__ */ new Set();
  autoHandled = /* @__PURE__ */ new Set();
  limitResolved = /* @__PURE__ */ new Set();
  attentionNotified = /* @__PURE__ */ new Map();
  resumeTimers = [];
  launcher;
  catalogStore;
  catalog;
  speed;
  speedRecorded = /* @__PURE__ */ new Set();
  changeEmitter = new vscode4.EventEmitter();
  onDidChange = this.changeEmitter.event;
  static get() {
    return _FleetController.instance;
  }
  /** The BACF Message Board folder for this workspace, if the add-on is installed. */
  messageBoardDir() {
    const roots = [
      ...(vscode4.workspace.workspaceFolders || []).map((f) => f.uri.fsPath),
      ...BoardManager.getInstance().getAllBoards().map((b) => b.rootPath)
    ];
    return findMessageBoard(roots);
  }
  sessionClaims = /* @__PURE__ */ new Map();
  /**
   * Message Board Rule 0: an agent session claims its ticket (lease lock, same format as claim.py) so other
   * agents see it, renews it while running and releases it when the session ends.
   */
  syncClaims() {
    const dir = this.messageBoardDir();
    if (!dir)
      return;
    for (const s of this.sessions.list()) {
      const key = s.ticketId || path13.basename(s.ticketPath, ".md");
      const tracked = this.sessionClaims.get(s.id);
      if (s.status === "running" && !tracked) {
        const agent = s.providerName;
        const r = claim(dir, key, agent, `Orchestrator session (${s.model || "default model"}): ${s.ticketTitle}`, s.ticketId, 60);
        if (r.ok)
          this.sessionClaims.set(s.id, { key, agent });
      } else if (tracked && s.status !== "running") {
        release(dir, tracked.key, tracked.agent);
        this.sessionClaims.delete(s.id);
      }
    }
  }
  renewClaims() {
    const dir = this.messageBoardDir();
    if (!dir)
      return;
    for (const [id, c] of this.sessionClaims) {
      const s = this.sessions.get(id);
      if (s && s.status === "running")
        claim(dir, c.key, c.agent, `Orchestrator session: ${s.ticketTitle}`, s.ticketId, 60);
    }
  }
  /** Is another agent already working on this ticket according to the board? (Never blocks your own provider.) */
  claimedByOther(ticket, agent) {
    const dir = this.messageBoardDir();
    if (!dir)
      return void 0;
    const key = ticket.id || path13.basename(ticket.path, ".md");
    const held = readClaims(dir).find((c) => !c.expired && c.key.toLowerCase() === key.toLowerCase() && c.agent !== agent);
    return held?.agent;
  }
  static init(context) {
    if (!_FleetController.instance) {
      _FleetController.instance = new _FleetController(context);
    }
    return _FleetController.instance;
  }
  constructor(context) {
    const root = vscode4.workspace.workspaceFolders?.[0]?.uri.fsPath || context.globalStorageUri.fsPath;
    const dir = path13.join(root, ".agentic-kanban");
    this.settingsPath = path13.join(dir, "fleet.json");
    this.briefPath = path13.join(dir, "runtime", "orchestrator-brief.md");
    this.registry = new ProviderRegistry(root);
    this.settings = this.loadSettings();
    this.catalogStore = new CatalogStore(root);
    this.catalog = new CatalogIndex(this.catalogStore.loadCatalog());
    this.speed = new SpeedBook(new JsonSpeedStore(path13.join(dir, "runtime", "speed.json")));
    const launcher = new TerminalLauncher(context.subscriptions);
    this.sessions = new SessionManager(
      (id) => this.registry.list().find((p) => p.id === id),
      launcher,
      new JsonFleetStore(path13.join(dir, "runtime", "fleet-usage.json"))
    );
    launcher.manager = this.sessions;
    this.launcher = launcher;
    launcher.modelsFor = (id) => this.registry.get(id)?.models || [];
    launcher.onLimit = (s, info) => {
      void this.handleLimit(s.id, info);
    };
    launcher.onAttention = (s, text) => this.handleAttention(s.id, text);
    AgentRunner.launcher = async (req) => {
      const provider = this.registry.get(req.assignee.id);
      if (!provider)
        return AgentRunner.launchDefault(req);
      const board = BoardManager.getInstance().findBoardForTicketPath(req.ticket.path);
      await this.startSession(provider, req.model || provider.defaultModel, "worker", req.ticket, board?.id || "");
      return true;
    };
    this.sessions.onChange(() => {
      this.syncClaims();
      this.learnSpeeds();
      this.maybeAutoReview();
      this.scheduleAutoResumes();
      this.changeEmitter.fire();
    });
    this.registry.onChange(() => this.changeEmitter.fire());
    this.restartTimer();
    context.subscriptions.push({
      dispose: () => {
        if (this.timer)
          clearInterval(this.timer);
        this.resumeTimers.forEach(clearTimeout);
        launcher.shuttingDown = true;
        this.sessions.shutdown();
      }
    });
    setTimeout(() => this.recoverOnStartup(), 3e3);
  }
  // ---------------------------------------------------------------- settings
  loadSettings() {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(fs10.readFileSync(this.settingsPath, "utf8")) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }
  saveSettings(patch) {
    const next = { ...this.settings, ...patch };
    next.intervalSeconds = Math.min(3600, Math.max(10, Math.round(Number(next.intervalSeconds)) || 30));
    next.maxNewPerTick = Math.min(20, Math.max(1, Math.round(Number(next.maxNewPerTick)) || 3));
    this.settings = next;
    try {
      fs10.mkdirSync(path13.dirname(this.settingsPath), { recursive: true });
      fs10.writeFileSync(this.settingsPath, JSON.stringify(next, null, 2), "utf8");
    } catch (e) {
      console.warn("[Agentic Kanban] Could not save fleet settings:", e);
    }
    this.restartTimer();
    this.changeEmitter.fire();
    return next;
  }
  restartTimer() {
    if (this.timer)
      clearInterval(this.timer);
    this.timer = setInterval(() => {
      void this.tick();
    }, this.settings.intervalSeconds * 1e3);
  }
  /** Seeds the registry from legacy config.md agents the first time (so existing boards keep working). */
  seedFromBoards(boards) {
    for (const b of boards) {
      this.registry.seedFromAssignees(b.config.assignees);
    }
  }
  // ---------------------------------------------------------------- auto-detection
  /** Finds installed agent CLIs and Ollama models; adds missing providers and fills empty paths. */
  async autoDetect(addMissing = true) {
    const found = await detectAll();
    const before = this.registry.list();
    const added = addMissing ? this.registry.addDetected(found) : [];
    let updated = 0;
    for (const p of before) {
      const d = found.find((x) => x.kind === p.kind);
      if (!d)
        continue;
      const needsPath = !!d.path && !p.path;
      const needsModels = !!d.models?.length && JSON.stringify(d.models) !== JSON.stringify(p.models);
      if (needsPath || needsModels) {
        this.registry.applyDetection(p.id, d);
        updated++;
      }
    }
    const names = found.map((d) => d.kind).join(", ") || "nothing";
    return {
      added: added.length,
      updated,
      summary: `Auto-detect found: ${names}. Added ${added.length} provider(s), updated ${updated}.`
    };
  }
  async detectFor(id) {
    const p = this.registry.get(id);
    if (!p)
      return "Provider not found.";
    const d = await detectOne(p.kind);
    if (!d.path && !d.models?.length)
      return `Could not find ${p.name} on this machine (looked on PATH and common install folders).`;
    this.registry.applyDetection(p.id, d);
    return `${p.name}: ${d.path ? `found at ${d.path}` : "no executable found"}${d.models?.length ? `, ${d.models.length} model(s) detected` : ""}.`;
  }
  // ---------------------------------------------------------------- starting sessions
  async startSession(provider, model, role, ticket, boardId, prebuilt, task, queueIfBusy = true, extra = {}) {
    const agentSessionId = extra.agentSessionId || (0, import_crypto.randomUUID)();
    const holder = this.claimedByOther(ticket, provider.name);
    if (holder && holder !== provider.name) {
      vscode4.window.showWarningMessage(`"${ticket.title}" is claimed by ${holder} on the Message Board. Release the claim there (or pick another ticket) before starting ${provider.name}.`);
      return void 0;
    }
    if (model && this.sessions.modelBlock(provider.id, model)) {
      const alt = provider.models.find((m) => !this.sessions.modelBlock(provider.id, m));
      if (!alt) {
        vscode4.window.showWarningMessage(`${provider.name} \xB7 ${model} is at its usage limit and no other model of this provider is available right now.`);
        return void 0;
      }
      vscode4.window.showInformationMessage(`${model} is at its usage limit; using ${alt} instead.`);
      model = alt;
    }
    const board = boardId && BoardManager.getInstance().getBoard(boardId) || BoardManager.getInstance().findBoardForTicketPath(ticket.path);
    const boardRoot = board?.rootPath || path13.dirname(ticket.path);
    let payload = prebuilt;
    if (!payload || task || extra.assignee) {
      if (role !== "worker" && !provider.command.includes("{task}")) {
        vscode4.window.showWarningMessage(
          `${provider.name} uses a custom command without {task}, so it cannot act as ${role}. Add {task} to its command in Agent Providers.`
        );
        return void 0;
      }
      payload = await AgentRunner.prepareLaunch(ticket, extra.assignee || providerToAssignee(provider), boardRoot, board?.config, {
        model,
        modelFlag: provider.modelFlag,
        task,
        sessionId: agentSessionId
      }) || void 0;
    }
    if (!payload)
      return void 0;
    const run = estimateRun(ticket, provider, model, this.optimizerBase());
    const session = await this.sessions.request({
      provider,
      model,
      role,
      points: run.points,
      estCost: run.estCost,
      estMinutes: Math.round(run.estMinutes),
      ticketPath: ticket.path,
      ticketId: ticket.id,
      ticketTitle: ticket.title,
      boardId: board?.id || boardId,
      payload,
      queueIfBusy,
      agentSessionId,
      attempt: extra.attempt,
      resumedFrom: extra.resumedFrom,
      hidden: extra.hidden
    });
    if (session.status === "queued") {
      vscode4.window.showInformationMessage(`${provider.name} is at capacity \u2014 "${ticket.title}" queued. ${session.note || ""}`.trim());
    } else if (session.status === "cancelled") {
      vscode4.window.showWarningMessage(session.note || `${provider.name} could not start the session.`);
    } else if (session.status === "running") {
      vscode4.window.showInformationMessage(`Dispatched "${ticket.title}" to ${provider.name}${model ? ` (${model})` : ""}.`);
    }
    return session;
  }
  /** Assign menu / card action: run a ticket on a specific provider + model. */
  async dispatchTicket(boardId, ticket, providerId, model) {
    const provider = this.registry.get(providerId);
    if (!provider) {
      vscode4.window.showErrorMessage(`Agent provider "${providerId}" not found. Open Agent Providers to configure it.`);
      return false;
    }
    if (!provider.enabled) {
      vscode4.window.showWarningMessage(`${provider.name} is disabled in Agent Providers.`);
      return false;
    }
    const chosen = model && (provider.models.length === 0 || provider.models.includes(model)) ? model : provider.defaultModel;
    return !!await this.startSession(provider, chosen, "worker", ticket, boardId);
  }
  // ---------------------------------------------------------------- planning
  candidates() {
    const out = [];
    for (const board of BoardManager.getInstance().getAllBoards()) {
      for (const col of board.columns) {
        if (!/^backlog$/i.test(col.name))
          continue;
        for (const t of col.tickets) {
          if (t.subfolder && /^ready$/i.test(t.subfolder)) {
            out.push({ ticket: t, boardId: board.id, boardRoot: board.rootPath });
          }
        }
      }
    }
    return out;
  }
  plan() {
    return planWork(this.candidates(), this.registry.list(), this.sessions, {
      maxNew: this.settings.maxNewPerTick * 3,
      optimizer: this.optimizerBase()
    });
  }
  optimizerBase() {
    return { catalog: this.catalog, speed: this.speed, bench: this.catalogStore.loadBench(), objective: this.settings.objective };
  }
  /** Feeds finished sessions into the speed book so duration predictions improve with use. */
  learnSpeeds() {
    for (const s of this.sessions.list()) {
      if (s.status !== "finished" || s.role !== "worker" || this.speedRecorded.has(s.id))
        continue;
      this.speedRecorded.add(s.id);
      if (!s.startedAt || !s.endedAt || !s.points || s.exitCode !== void 0 && s.exitCode !== 0 || /dismissed|manually/i.test(s.note || ""))
        continue;
      const minutes = (s.endedAt - s.startedAt) / 6e4;
      if (minutes >= 1)
        this.speed.record(s.providerId, s.model, s.points, minutes);
    }
  }
  /**
   * Re-reads every provider's models (CLI / API), curates them into the catalog (categories, prices, hides superseded
   * versions) and optionally writes the result into the providers' model lists.
   */
  async refreshCatalog(applyToProviders = false) {
    const raws = await this.catalogStore.refreshRaw(this.registry.list());
    const catalog = this.catalogStore.curateSaved(this.settings.keepModelVersions);
    this.catalog = new CatalogIndex(catalog);
    let applied = 0;
    if (applyToProviders) {
      for (const patch of providerPatches(this.registry.list(), catalog)) {
        const p = this.registry.get(patch.id);
        if (p) {
          this.registry.upsert({ ...p, models: patch.models, defaultModel: patch.defaultModel, modelTiers: patch.modelTiers });
          applied++;
        }
      }
    }
    const hidden = catalog.models.filter((m) => m.hidden).length;
    const failed = raws.filter((r) => !r.ok).map((r) => r.providerName);
    this.changeEmitter.fire();
    return `Model catalog updated: ${catalog.models.length - hidden} shown, ${hidden} hidden${applied ? `; applied to ${applied} provider(s)` : ""}${failed.length ? `. Could not list: ${failed.join(", ")}` : ""}.`;
  }
  /** Saves a pasted model list (e.g. Copilot's model-policy page) for a provider and re-curates. */
  async importModels(providerId, text) {
    const p = this.registry.get(providerId);
    if (!p)
      return "Provider not found.";
    const probe = parseCopilotPolicy(text);
    const n = probe.length || text.split(/\r?\n/).filter((l) => l.trim()).length;
    if (!text.trim() || !n)
      return "The clipboard has no model list to import.";
    this.catalogStore.saveImport(p.id, text);
    const summary = await this.refreshCatalog(false);
    const on = probe.filter((m) => m.enabled).length;
    return `Imported ${probe.length ? `${probe.length} models for ${p.name} (${on} enabled)` : `a model list for ${p.name}`}. ${summary}`;
  }
  /** Compact view of the catalog for the UI. */
  catalogSummary() {
    const c = this.catalog.catalog;
    if (!c)
      return { generatedAt: 0, models: [] };
    return {
      generatedAt: c.generatedAt,
      keep: c.keepVersionsPerFamily,
      models: c.models.map((m) => ({
        providerId: m.providerId,
        id: m.id,
        label: m.label,
        tier: m.tier,
        category: m.category,
        hidden: m.hidden,
        reason: m.hiddenReason,
        inPerM: m.pricing?.inPerM,
        outPerM: m.pricing?.outPerM,
        free: !!m.pricing?.free,
        priceSource: m.pricing?.source,
        efforts: Object.keys(m.effortVariants)
      }))
    };
  }
  usage() {
    return this.registry.list().map((p) => this.sessions.usage(p));
  }
  findTicket(ticketPath) {
    const key = path13.resolve(ticketPath).toLowerCase();
    for (const board of BoardManager.getInstance().getAllBoards()) {
      for (const col of board.columns) {
        const t = col.tickets.find((x) => path13.resolve(x.path).toLowerCase() === key);
        if (t)
          return { ticket: t, board };
      }
    }
    return void 0;
  }
  /** Executes one plan decision: assign, move to Ongoing when a slot is free, and start (or queue) the session. */
  async execute(decision) {
    const found = this.findTicket(decision.ticketPath);
    const provider = this.registry.get(decision.providerId);
    if (!found || !provider)
      return false;
    const bm = BoardManager.getInstance();
    await bm.assignTicket(found.board.id, found.ticket.path, provider.name);
    let ticket = found.ticket;
    if (decision.startsNow) {
      const ongoing = found.board.columns.find((c) => /ongoing|in progress/i.test(c.name));
      if (ongoing && await bm.moveTicket(found.board.id, found.ticket.path, ongoing.name, null)) {
        ticket = this.findTicket(path13.join(found.board.rootPath, ongoing.name, path13.basename(found.ticket.path)))?.ticket || ticket;
      }
    }
    return !!await this.startSession(provider, decision.model, "worker", ticket, found.board.id, void 0, void 0, true, { hidden: this.settings.backgroundTerminals });
  }
  async runPlan() {
    let started = 0;
    for (const d of this.plan().slice(0, this.settings.maxNewPerTick)) {
      if (await this.execute(d))
        started++;
    }
    return started;
  }
  async tick() {
    await this.sessions.tick();
    this.sessions.prune();
    this.checkIdle();
    this.renewClaims();
    if (this.settings.autopilot) {
      await this.runPlan();
    }
    this.changeEmitter.fire();
  }
  // ---------------------------------------------------------------- usage limits & needing a human
  /**
   * A model hit its usage limit. Find another model that is free, has capacity and is capable enough for this
   * ticket and carry on there; otherwise wait for the reset (if the message gave one) or tell the user.
   */
  async handleLimit(sessionId, info) {
    const s = this.sessions.get(sessionId);
    if (!s || s.status !== "running")
      return;
    const model = info.model || s.model;
    const label = `${s.providerName}${model ? " \xB7 " + model : ""}`;
    const found = this.findTicket(s.ticketPath) || this.findTicketById(s.ticketId);
    this.sessions.limitHit(sessionId, info);
    const cur = this.sessions.get(sessionId);
    const resetText = info.resetAt ? ` Usage resets around ${new Date(info.resetAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.` : "";
    if (this.settings.autoFailover && found && s.role !== "orchestrator") {
      const fb = pickFallback(this.registry.list(), this.sessions, { providerId: s.providerId, model, role: s.role }, found.ticket);
      if (fb) {
        this.limitResolved.add(sessionId);
        vscode4.window.showInformationMessage(
          `${label} hit its usage limit. Continuing "${s.ticketTitle}" on ${fb.provider.name} \xB7 ${fb.model || "default"} (capable enough: tier ${fb.tier}).`
        );
        this.launcher.kill(cur);
        await this.resumeSession(sessionId, "resume", { provider: fb.provider, model: fb.model, background: s.hidden });
        return;
      }
    }
    this.limitResolved.add(sessionId);
    if (this.settings.autoFailover && info.resetAt) {
      this.sessions.setAttention(sessionId, void 0);
      vscode4.window.showInformationMessage(
        `${label} hit its usage limit and no other model is capable enough right now.${resetText} The orchestrator will continue "${s.ticketTitle}" after the reset.`
      );
      this.scheduleAutoResumes();
      return;
    }
    this.escalate(sessionId, `${label} hit its usage limit on "${s.ticketTitle}". ` + (this.settings.autoFailover ? "No other model is capable enough and no reset time was reported." : "Auto-failover is off.") + " Resume it when usage is available, or switch it to another agent.");
  }
  /** The orchestrator cannot fix this: flag the session and tell the user how to get into it. */
  escalate(sessionId, message) {
    this.sessions.setAttention(sessionId, message);
    const buttons = this.launcher.hasTerminal(sessionId) ? ["Open terminal", "Open Orchestrator"] : ["Open Orchestrator"];
    void vscode4.window.showWarningMessage(message, ...buttons).then((pick) => {
      if (pick === "Open terminal")
        this.sessions.show(sessionId);
      else if (pick === "Open Orchestrator")
        void vscode4.commands.executeCommand("agenticKanban.openOrchestrator");
    });
  }
  handleAttention(sessionId, text) {
    const s = this.sessions.get(sessionId);
    if (!s || s.status !== "running")
      return;
    this.sessions.setAttention(sessionId, text);
    if (!text)
      return;
    const last = this.attentionNotified.get(sessionId) || 0;
    if (Date.now() - last < 5 * 6e4)
      return;
    this.attentionNotified.set(sessionId, Date.now());
    void vscode4.window.showWarningMessage(`${s.providerName} needs you on "${s.ticketTitle}": ${text}`, "Open terminal").then((pick) => {
      if (pick === "Open terminal")
        this.sessions.show(sessionId);
    });
  }
  checkIdle() {
    const limitMs = this.settings.idleMinutes * 6e4;
    if (limitMs <= 0)
      return;
    for (const s of this.sessions.list().filter((x) => x.status === "running")) {
      const last = this.launcher.lastOutputAt(s.id);
      if (last && Date.now() - last > limitMs && !s.attention) {
        this.handleAttention(s.id, `No output for ${this.settings.idleMinutes} min \u2014 it may be waiting for you or stuck.`);
      }
    }
  }
  // ---------------------------------------------------------------- recovery
  findTicketById(ticketId) {
    if (!ticketId)
      return void 0;
    for (const board of BoardManager.getInstance().getAllBoards()) {
      for (const col of board.columns) {
        const t = col.tickets.find((x) => x.id === ticketId);
        if (t)
          return { ticket: t, board };
      }
    }
    return void 0;
  }
  /**
   * Continues interrupted/failed work. "resume" keeps the agent's conversation when the provider has a
   * resumeCommand ({session_id}); otherwise (or for "restart") the agent is re-run and told to check the
   * ticket Work Log and git state first, so progress on disk is never thrown away.
   */
  async resumeSession(id, mode = "resume", opts = {}) {
    const s = this.sessions.get(id);
    if (!s || s.resumedBy)
      return false;
    const provider = opts.provider || this.registry.get(s.providerId);
    if (!provider) {
      vscode4.window.showWarningMessage("That provider no longer exists. Re-create it in Agent Providers to resume.");
      return false;
    }
    if (s.role === "orchestrator") {
      this.sessions.dismiss(id);
      return this.askOrchestrator();
    }
    const found = this.findTicket(s.ticketPath) || this.findTicketById(s.ticketId);
    if (!found) {
      vscode4.window.showWarningMessage(`Ticket "${s.ticketTitle}" was not found on any board (moved or deleted?), so it cannot be resumed.`);
      return false;
    }
    if (s.status === "running") {
      this.sessions.interrupt(id, "user-closed", "Interrupted by you to resume");
      this.launcher.kill(s);
    }
    const handoff = !!opts.provider && opts.provider.id !== s.providerId;
    const effective = mode === "resume" && s.startedAt && !handoff ? "resume" : "restart";
    const agentSessionId = effective === "resume" && s.agentSessionId ? s.agentSessionId : (0, import_crypto.randomUUID)();
    const base = providerToAssignee(provider);
    let assignee = base;
    let task;
    if (effective === "resume") {
      task = RESUME_TASK;
      if (provider.resumeCommand) {
        assignee = { ...base, agentConfig: { ...base.agentConfig, command: provider.resumeCommand } };
      }
    } else if (handoff && s.startedAt) {
      task = RESUME_TASK;
    } else if (s.role === "reviewer") {
      task = REVIEW_TASK;
    }
    const next = await this.startSession(provider, opts.model || (handoff ? provider.defaultModel : s.model) || provider.defaultModel, s.role, found.ticket, found.board.id, void 0, task, true, {
      agentSessionId,
      attempt: (s.attempt || 1) + 1,
      resumedFrom: s.id,
      assignee,
      hidden: opts.background ?? s.hidden
    });
    if (next)
      this.sessions.markResumed(s.id, next.id);
    return !!next;
  }
  async resumeAll() {
    let n = 0;
    for (const s of this.sessions.resumable()) {
      if (await this.resumeSession(s.id))
        n++;
    }
    return n;
  }
  /** Is it safe to resume this one without asking? (crash/PC/editor close, or an error exit — never a user closing the terminal.) */
  autoResumable(s) {
    if (!this.settings.autoResume || s.resumedBy || this.autoHandled.has(s.id))
      return false;
    if ((s.attempt || 1) > this.settings.maxAutoRetries)
      return false;
    const crashed = s.status === "interrupted" && (s.interruptKind === "host-closed" || s.interruptKind === "queued-lost");
    const errored = s.status === "failed" && s.exitCode !== void 0;
    if (!crashed && !errored)
      return false;
    const found = this.findTicket(s.ticketPath) || this.findTicketById(s.ticketId);
    return !!found && !/completed|done/i.test(found.ticket.column);
  }
  /** Auto-resume with a growing delay so a flaky network is not hammered (and rate limits are respected). */
  scheduleAutoResumes() {
    for (const s of this.sessions.resumable()) {
      if (s.interruptKind === "usage-limit") {
        if (this.settings.autoFailover && s.resumeAfter && this.limitResolved.has(s.id) && !this.autoHandled.has(s.id)) {
          this.autoHandled.add(s.id);
          const wait = Math.max(0, s.resumeAfter + 3e4 - Date.now());
          this.resumeTimers.push(setTimeout(() => {
            const cur = this.sessions.get(s.id);
            if (cur && !cur.resumedBy)
              void this.resumeSession(s.id, "resume", { background: this.settings.backgroundTerminals });
          }, wait));
        }
        continue;
      }
      if (!this.autoResumable(s))
        continue;
      this.autoHandled.add(s.id);
      const delayMs = s.status === "interrupted" ? 2e3 : Math.min(10, 2 * (s.attempt || 1)) * 6e4;
      const t = setTimeout(() => {
        const cur = this.sessions.get(s.id);
        if (cur && !cur.resumedBy)
          void this.resumeSession(s.id, "resume", { background: this.settings.backgroundTerminals });
      }, delayMs);
      this.resumeTimers.push(t);
    }
  }
  /** On editor start: tell the user what was interrupted (and resume it if auto-resume is on). */
  recoverOnStartup() {
    for (const s of this.sessions.resumable()) {
      if (s.interruptKind === "usage-limit")
        this.limitResolved.add(s.id);
    }
    this.scheduleAutoResumes();
    const pending = this.sessions.resumable().filter((s) => s.status === "interrupted" && s.interruptKind !== "usage-limit");
    if (!pending.length)
      return;
    if (this.settings.autoResume) {
      this.scheduleAutoResumes();
      vscode4.window.showInformationMessage(`Resuming ${pending.length} agent session(s) interrupted by the last shutdown.`);
      return;
    }
    void vscode4.window.showWarningMessage(
      `${pending.length} agent session(s) were interrupted when the editor or PC closed.`,
      "Resume all",
      "Open Orchestrator"
    ).then((pick) => {
      if (pick === "Resume all")
        void this.resumeAll();
      else if (pick === "Open Orchestrator")
        void vscode4.commands.executeCommand("agenticKanban.openOrchestrator");
    });
  }
  // ---------------------------------------------------------------- reviews & orchestrator agent
  async requestReview(sessionId, background = false) {
    const s = this.sessions.get(sessionId);
    if (!s)
      return false;
    const found = this.findTicket(s.ticketPath);
    if (!found) {
      vscode4.window.showWarningMessage("Ticket for this session was not found on the board (it may have moved or been deleted).");
      return false;
    }
    const reviewer = pickReviewer(this.registry.list(), this.sessions, s.providerId);
    if (!reviewer) {
      vscode4.window.showWarningMessage('No reviewer-capable provider is available. Enable the "reviewer" role on a provider with a {task} command.');
      return false;
    }
    return !!await this.startSession(reviewer, reviewer.defaultModel, "reviewer", found.ticket, found.board.id, void 0, REVIEW_TASK, true, { hidden: background });
  }
  maybeAutoReview() {
    if (!this.settings.autoReview)
      return;
    for (const s of this.sessions.list()) {
      if (s.role === "worker" && s.status === "finished" && !this.reviewed.has(s.id)) {
        this.reviewed.add(s.id);
        void this.requestReview(s.id, this.settings.backgroundTerminals);
      }
    }
  }
  /** Writes a capacity/board brief and asks the chosen orchestrator provider to set assignees on Ready tickets. */
  async askOrchestrator() {
    const provider = this.registry.get(this.settings.orchestratorProviderId);
    if (!provider) {
      vscode4.window.showWarningMessage("Pick an orchestrator agent first (Orchestrator view \u2192 Orchestrator agent).");
      return false;
    }
    const boards = BoardManager.getInstance().getAllBoards();
    const board = boards[0];
    if (!board)
      return false;
    const providers = this.registry.list();
    const usage = this.usage();
    const lines = [
      "# Orchestrator brief",
      "",
      "You are the orchestrator for this Agentic Kanban workspace. Your job: decide which agent should take each Ready ticket.",
      "",
      "## Rules",
      "- Only edit the `| **Assignee** |` row (and optionally add a `model:<name>` label) of tickets in `Backlog/Ready/`.",
      "- Assign to a provider by its exact name from the table below. Never exceed a provider's free capacity.",
      "- Prefer cheaper/faster models for small tickets and stronger models for architecture or risky changes.",
      "- Leave tickets you are unsure about unassigned and say why in `00_Plan.md`. Do not start implementing anything yourself.",
      '- The autopilot / "Run plan" button will start the sessions; do not launch other agents.',
      "",
      "## Provider capacity",
      "| Provider | Account | State | Running | Window usage | Models | Roles |",
      "|---|---|---|---|---|---|---|"
    ];
    for (const p of providers) {
      const u = usage.find((x) => x.providerId === p.id);
      lines.push(
        `| ${p.name} | ${p.account || "-"} | ${u.state} | ${u.running}/${u.maxParallel} | ${u.pct === null ? "unlimited" : `${u.startsInWindow}/${u.maxSessionsPerWindow} per ${u.windowMinutes}m`} | ${p.models.join(", ") || "-"} | ${p.roles.join(", ")} |`
      );
    }
    lines.push("", "## Ready tickets");
    const cands = this.candidates();
    if (!cands.length)
      lines.push("(none)");
    for (const c of cands) {
      lines.push(`- ${c.ticket.id || path13.basename(c.ticket.path)} \u2014 ${c.ticket.title} [${c.ticket.priority}] (${c.ticket.path}) assignee: ${c.ticket.assignee || "unassigned"}`);
    }
    fs10.mkdirSync(path13.dirname(this.briefPath), { recursive: true });
    fs10.writeFileSync(this.briefPath, lines.join("\n"), "utf8");
    const planTicket = {
      id: "ORCHESTRATE",
      filename: path13.basename(this.briefPath),
      path: this.briefPath,
      relativePath: path13.relative(board.rootPath, this.briefPath),
      column: "Backlog",
      subfolder: null,
      title: "Orchestration planning",
      summary: "Assign Ready tickets to agents",
      description: "",
      status: "Ongoing",
      priority: "P1",
      epic: null,
      type: "Architecture",
      estimate: null,
      milestone: null,
      assignee: provider.name,
      dependsOn: [],
      blocks: [],
      labels: [],
      acceptanceCriteria: [],
      progress: { done: 0, total: 0 },
      mtime: Date.now(),
      hasWorkLog: false
    };
    const task = `Read ${this.briefPath} and follow its instructions to assign the Ready tickets.`;
    const model = this.settings.orchestratorModel || provider.defaultModel;
    return !!await this.startSession(provider, model, "orchestrator", planTicket, board.id, void 0, task);
  }
  providerForAssignee(name) {
    return matchProvider(this.registry.list(), name);
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
            const configPath = path14.join(board.rootPath, "config.md");
            if (fs11.existsSync(configPath)) {
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
            await AgentRunner.dispatch(message.ticket, assignee, targetBoard.rootPath, targetBoard.config);
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
              (b) => path14.resolve(t.path).toLowerCase().startsWith(path14.resolve(b.rootPath).toLowerCase())
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
              (b) => path14.resolve(message.ticketPath).toLowerCase().startsWith(path14.resolve(b.rootPath).toLowerCase())
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
            const fleetCtl = FleetController.get();
            const provider = fleetCtl ? fleetCtl.registry.get(message.providerId || assigneeId) || fleetCtl.registry.get(targetName) : void 0;
            const assignee = targetBoard2.config.assignees.find(
              (a) => assigneeId && a.id === assigneeId || a.name.toLowerCase() === targetName.toLowerCase()
            );
            if (provider || assignee && assignee.type === "agent") {
              const reloadedBoard = boardManager.getBoard(targetBoard2.id) || targetBoard2;
              let ticketObj = null;
              for (const col of reloadedBoard.columns) {
                const found = col.tickets.find(
                  (t) => path14.resolve(t.path).toLowerCase() === path14.resolve(message.ticketPath).toLowerCase() || message.ticketId && t.id === message.ticketId || t.filename.toLowerCase() === path14.basename(message.ticketPath).toLowerCase()
                );
                if (found) {
                  ticketObj = found;
                  break;
                }
              }
              if (!ticketObj) {
                const sourcePath = boardManager.resolveTicketPathOnDisk(targetBoard2, message.ticketPath) || message.ticketPath;
                const fileContent = await fs11.promises.readFile(sourcePath, "utf8");
                ticketObj = TicketParser.parse(sourcePath, fileContent, targetBoard2.rootPath, "", null);
                if (ticketObj) {
                  ticketObj.assignee = targetName;
                }
              }
              if (!ticketObj) {
                vscode5.window.showErrorMessage(`Assigned, but could not locate the ticket to start the agent: ${message.ticketPath}`);
              } else if (provider && fleetCtl) {
                await fleetCtl.dispatchTicket(targetBoard2.id, ticketObj, provider.id, message.model);
              } else if (assignee) {
                await AgentRunner.dispatch(ticketObj, assignee, targetBoard2.rootPath, targetBoard2.config);
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
      case "openProviders":
        await vscode5.commands.executeCommand("agenticKanban.openProviders");
        break;
      case "openMessageBoard":
        await vscode5.commands.executeCommand("agenticKanban.openMessageBoard");
        break;
      case "openOrchestrator":
        await vscode5.commands.executeCommand("agenticKanban.openOrchestrator");
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
        overview: null,
        providers: this.providerSummaries(),
        hasMessageBoard: this.hasMessageBoard()
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
        overview,
        providers: this.providerSummaries(),
        hasMessageBoard: this.hasMessageBoard()
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
      overview: null,
      providers: this.providerSummaries(),
      hasMessageBoard: this.hasMessageBoard()
    });
  }
  hasMessageBoard() {
    return !!FleetController.get()?.messageBoardDir();
  }
  /** Enabled agent providers for the assign menu (id/name never change together: rename-safe). */
  providerSummaries() {
    const fleet = FleetController.get();
    if (!fleet)
      return [];
    return fleet.registry.list().filter((p) => p.enabled).map((p) => {
      const u = fleet.sessions.usage(p);
      return {
        id: p.id,
        name: p.name,
        account: p.account || "",
        kind: p.kind,
        models: p.models,
        defaultModel: p.defaultModel,
        type: p.type,
        state: u.state,
        running: u.running,
        maxParallel: u.maxParallel
      };
    });
  }
  getHtmlForWebview(webview) {
    let webviewDir = vscode5.Uri.joinPath(this.extensionUri, "dist", "webview");
    if (!fs11.existsSync(webviewDir.fsPath)) {
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

        <button id="btnAgentRules" class="nav-action-btn secondary" title="Generate or Update AGENTS.md System Rules">
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

        <button id="btnOrchestrator" class="nav-action-btn secondary" title="Orchestrator: usage, plan and running sub-agents"><span>Orchestrator</span></button>
        <button id="btnProviders" class="nav-action-btn secondary" title="Configure agent providers, models and limits"><span>Agents</span></button>
        <button id="btnMessageBoard" class="nav-action-btn secondary" style="display:none;" title="Message Board: agent roster, claims and threads"><span>Message Board</span></button>
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

// src/fleet/panels.ts
var vscode6 = __toESM(require("vscode"));
var fs12 = __toESM(require("fs"));
var TITLES = {
  providers: "Agent Providers",
  orchestrator: "Orchestrator",
  messageboard: "Message Board"
};
var FleetPanel = class _FleetPanel {
  constructor(panel, extensionUri, kind) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.kind = kind;
    this.panel.iconPath = vscode6.Uri.joinPath(extensionUri, "media", "kanban-icon.svg");
    this.panel.webview.html = this.html();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage((m) => this.onMessage(m), null, this.disposables);
    const fleet = FleetController.get();
    if (fleet)
      this.disposables.push(fleet.onDidChange(() => this.push()));
    if (kind === "messageboard") {
      const timer = setInterval(() => this.push(), 5e3);
      this.disposables.push({ dispose: () => clearInterval(timer) });
    }
    this.disposables.push(BoardManager.getInstance().onDidChangeBoard(() => this.push()));
  }
  static panels = /* @__PURE__ */ new Map();
  disposables = [];
  static show(extensionUri, kind) {
    const existing = _FleetPanel.panels.get(kind);
    if (existing) {
      existing.panel.reveal(vscode6.ViewColumn.Active);
      existing.push();
      return;
    }
    const panel = vscode6.window.createWebviewPanel(
      `agenticKanban.${kind}`,
      TITLES[kind],
      vscode6.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [extensionUri] }
    );
    _FleetPanel.panels.set(kind, new _FleetPanel(panel, extensionUri, kind));
  }
  dispose() {
    _FleetPanel.panels.delete(this.kind);
    while (this.disposables.length)
      this.disposables.pop()?.dispose();
  }
  async onMessage(m) {
    const fleet = FleetController.get();
    if (!fleet)
      return;
    try {
      switch (m.type) {
        case "ready":
        case "refresh":
          break;
        case "saveProvider":
          fleet.registry.upsert(m.provider);
          vscode6.window.setStatusBarMessage(`Saved ${m.provider?.name || "provider"}`, 2500);
          break;
        case "addProvider":
          fleet.registry.add(m.kindId);
          break;
        case "openFile": {
          if (m.path && fs12.existsSync(m.path)) {
            const doc = await vscode6.workspace.openTextDocument(vscode6.Uri.file(m.path));
            await vscode6.window.showTextDocument(doc, { viewColumn: vscode6.ViewColumn.Beside });
          }
          return;
        }
        case "newThread": {
          const dir = fleet.messageBoardDir();
          if (!dir)
            break;
          const title = await vscode6.window.showInputBox({ prompt: "Thread title", placeHolder: "e.g. Who owns the auth refactor?" });
          if (!title?.trim())
            return;
          const msg = await vscode6.window.showInputBox({ prompt: "First message (what do you want the agents to know or decide?)" });
          if (msg === void 0)
            return;
          const file = createThread(dir, title, "Bj\xF6rn", "Agentic Kanban UI", msg || title);
          const doc = await vscode6.workspace.openTextDocument(vscode6.Uri.file(file));
          await vscode6.window.showTextDocument(doc, { viewColumn: vscode6.ViewColumn.Beside });
          break;
        }
        case "reply": {
          const text = await vscode6.window.showInputBox({ prompt: "Your reply (signed as Bj\xF6rn, Agentic Kanban UI)" });
          if (text?.trim() && m.path && fs12.existsSync(m.path))
            replyToThread(m.path, "Bj\xF6rn", "Agentic Kanban UI", text);
          break;
        }
        case "releaseClaim": {
          const dir = fleet.messageBoardDir();
          if (dir && m.key)
            release(dir, m.key, "Agentic Kanban UI", true);
          break;
        }
        case "openMessageBoard":
          _FleetPanel.show(this.extensionUri, "messageboard");
          return;
        case "importModels": {
          const text = await vscode6.env.clipboard.readText();
          vscode6.window.showInformationMessage(await fleet.importModels(m.id, text));
          break;
        }
        case "refreshModels": {
          vscode6.window.setStatusBarMessage("Agentic Kanban: refreshing model lists...", 8e3);
          vscode6.window.showInformationMessage(await fleet.refreshCatalog(!!m.apply));
          break;
        }
        case "detectAll": {
          const r = await fleet.autoDetect();
          vscode6.window.showInformationMessage(r.summary);
          break;
        }
        case "detectProvider": {
          const r = await fleet.detectFor(m.id);
          vscode6.window.showInformationMessage(r);
          break;
        }
        case "duplicateProvider":
          fleet.registry.duplicate(m.id);
          break;
        case "deleteProvider": {
          const p = fleet.registry.get(m.id);
          const pick = await vscode6.window.showWarningMessage(
            `Delete provider "${p?.name || m.id}"? Running sessions are not affected.`,
            { modal: true },
            "Delete"
          );
          if (pick === "Delete")
            fleet.registry.remove(m.id);
          break;
        }
        case "saveSettings":
          fleet.saveSettings(m.settings || {});
          break;
        case "runPlan": {
          const n = await fleet.runPlan();
          vscode6.window.showInformationMessage(n ? `Orchestrator started ${n} session(s).` : "Nothing to start right now (no Ready tickets or no free capacity).");
          break;
        }
        case "startDecision": {
          const d = fleet.plan().find((x) => x.ticketPath === m.ticketPath);
          if (d)
            await fleet.execute(d);
          break;
        }
        case "askOrchestrator":
          await fleet.askOrchestrator();
          break;
        case "focusSession":
          fleet.sessions.show(m.id);
          break;
        case "cancelSession":
          fleet.sessions.cancel(m.id);
          break;
        case "resumeSession":
          await fleet.resumeSession(m.id, m.mode === "restart" ? "restart" : "resume");
          break;
        case "resumeAll": {
          const n = await fleet.resumeAll();
          vscode6.window.showInformationMessage(n ? `Resumed ${n} session(s).` : "Nothing to resume.");
          break;
        }
        case "dismissSession":
          fleet.sessions.dismiss(m.id);
          break;
        case "markFinished":
          fleet.sessions.markFinished(m.id);
          break;
        case "requestReview":
          await fleet.requestReview(m.id);
          break;
        case "openTicket": {
          if (m.path && fs12.existsSync(m.path)) {
            const doc = await vscode6.workspace.openTextDocument(vscode6.Uri.file(m.path));
            await vscode6.window.showTextDocument(doc, { viewColumn: vscode6.ViewColumn.Beside });
          }
          break;
        }
        case "openProviders":
          _FleetPanel.show(this.extensionUri, "providers");
          return;
        case "openOrchestrator":
          _FleetPanel.show(this.extensionUri, "orchestrator");
          return;
      }
    } catch (e) {
      vscode6.window.showErrorMessage(`Agentic Kanban: ${e?.message || e}`);
    }
    this.push();
  }
  push() {
    const fleet = FleetController.get();
    if (!fleet)
      return;
    if (this.kind === "messageboard") {
      const dir = fleet.messageBoardDir();
      this.panel.webview.postMessage({ type: "state", board: dir ? readMessageBoard(dir) : null });
      return;
    }
    const providers = fleet.registry.list();
    const base = {
      type: "state",
      now: Date.now(),
      providers,
      usage: fleet.usage(),
      presets: PROVIDER_PRESETS.map((p) => ({ kind: p.kind, label: p.label })),
      catalog: fleet.catalogSummary()
    };
    if (this.kind === "providers") {
      this.panel.webview.postMessage(base);
      return;
    }
    this.panel.webview.postMessage({
      ...base,
      settings: fleet.settings,
      sessions: fleet.sessions.list().sort((a, b) => (b.startedAt || b.queuedAt) - (a.startedAt || a.queuedAt)),
      plan: fleet.plan()
    });
  }
  html() {
    const webview = this.panel.webview;
    let dir = vscode6.Uri.joinPath(this.extensionUri, "dist", "webview");
    if (!fs12.existsSync(dir.fsPath))
      dir = vscode6.Uri.joinPath(this.extensionUri, "src", "webview");
    const v = Date.now();
    const css = webview.asWebviewUri(vscode6.Uri.joinPath(dir, "fleet.css")).with({ query: `v=${v}` });
    const js = webview.asWebviewUri(vscode6.Uri.joinPath(dir, `${this.kind}.js`)).with({ query: `v=${v}` });
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource};">
<title>${TITLES[this.kind]}</title>
<link rel="stylesheet" href="${css}">
</head><body><div id="root" class="fleet-root"></div><script src="${js}"></script></body></html>`;
  }
};

// src/extension.ts
async function activate(context) {
  console.log("[Agentic Kanban] Extension activating...");
  const boardManager = BoardManager.getInstance();
  await boardManager.reloadBoards();
  const fleet = FleetController.init(context);
  fleet.seedFromBoards(boardManager.getAllBoards());
  void fleet.autoDetect(fleet.registry.isEmpty()).then((r) => {
    if (r.added)
      vscode7.window.showInformationMessage(r.summary + ' Open "Agents" to review.');
  }).catch(() => void 0);
  boardManager.setupWatchers(context);
  const treeProvider = new BoardsTreeProvider(boardManager);
  vscode7.window.registerTreeDataProvider("agenticKanban.boardsView", treeProvider);
  context.subscriptions.push(
    vscode7.commands.registerCommand("agenticKanban.openBoard", (boardId) => {
      KanbanWebviewManager.createOrShow(context.extensionUri, boardId, false);
    }),
    vscode7.commands.registerCommand("agenticKanban.openOverview", () => {
      KanbanWebviewManager.createOrShow(context.extensionUri, void 0, true);
    }),
    vscode7.commands.registerCommand("agenticKanban.openProviders", () => {
      FleetPanel.show(context.extensionUri, "providers");
    }),
    vscode7.commands.registerCommand("agenticKanban.openMessageBoard", () => {
      FleetPanel.show(context.extensionUri, "messageboard");
    }),
    vscode7.commands.registerCommand("agenticKanban.openOrchestrator", () => {
      FleetPanel.show(context.extensionUri, "orchestrator");
    }),
    vscode7.commands.registerCommand("agenticKanban.refreshBoards", async () => {
      await boardManager.reloadBoards();
      vscode7.window.showInformationMessage("Agentic Kanban: Boards refreshed.");
    }),
    vscode7.commands.registerCommand("agenticKanban.createTicket", async () => {
      const boards = boardManager.getAllBoards();
      if (boards.length === 0) {
        vscode7.window.showWarningMessage("No Kanban boards discovered in the workspace.");
        return;
      }
      let selectedBoard = boards[0];
      if (boards.length > 1) {
        const boardPick = await vscode7.window.showQuickPick(
          boards.map((b) => ({ label: b.name, description: b.rootPath, board: b })),
          { placeHolder: "Select target board" }
        );
        if (!boardPick)
          return;
        selectedBoard = boardPick.board;
      }
      const columnPick = await vscode7.window.showQuickPick(
        selectedBoard.columns.map((c) => ({ label: c.name, description: `${c.tickets.length} tickets`, column: c })),
        { placeHolder: "Select destination column" }
      );
      if (!columnPick)
        return;
      let subfolder = null;
      if (columnPick.column.subfolders.length > 0) {
        const subfolderPick = await vscode7.window.showQuickPick(
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
      const title = await vscode7.window.showInputBox({
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
        const doc = await vscode7.workspace.openTextDocument(vscode7.Uri.file(createdPath));
        await vscode7.window.showTextDocument(doc);
      }
    }),
    vscode7.commands.registerCommand("agenticKanban.openConfig", async (item) => {
      const boards = boardManager.getAllBoards();
      if (boards.length === 0)
        return;
      let board = boards[0];
      if (item && item.board) {
        board = item.board;
      } else if (boards.length > 1) {
        const pick = await vscode7.window.showQuickPick(
          boards.map((b) => ({ label: b.name, description: b.rootPath, board: b })),
          { placeHolder: "Select board" }
        );
        if (!pick)
          return;
        board = pick.board;
      }
      const configPath = path15.join(board.rootPath, "config.md");
      if (!fs13.existsSync(configPath)) {
        const defaultConfig = ConfigParser.generateDefaultConfig(board.name);
        await fs13.promises.writeFile(configPath, defaultConfig, "utf8");
      }
      const doc = await vscode7.workspace.openTextDocument(vscode7.Uri.file(configPath));
      await vscode7.window.showTextDocument(doc);
    }),
    vscode7.commands.registerCommand("agenticKanban.generateAgentRules", async (item) => {
      const boards = boardManager.getAllBoards();
      if (boards.length === 0) {
        vscode7.window.showWarningMessage("No active Kanban boards found.");
        return;
      }
      let board = boards[0];
      if (item && item.board) {
        board = item.board;
      } else if (boards.length > 1) {
        const pick = await vscode7.window.showQuickPick(
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
      if (fs13.existsSync(res.targetPath)) {
        const choice = await vscode7.window.showQuickPick(
          [
            { label: "Overwrite", description: `Replace entire ${path15.basename(res.targetPath)}` },
            { label: "Append", description: `Append Kanban rules to existing ${path15.basename(res.targetPath)}` },
            { label: "Cancel", description: "Keep existing file unchanged" }
          ],
          { placeHolder: `${path15.basename(res.targetPath)} already exists. What would you like to do?` }
        );
        if (!choice || choice.label === "Cancel")
          return;
        if (choice.label === "Append") {
          const existing = await fs13.promises.readFile(res.targetPath, "utf8");
          await fs13.promises.writeFile(res.targetPath, `${existing}

${res.content}`, "utf8");
        } else {
          await fs13.promises.writeFile(res.targetPath, res.content, "utf8");
        }
      } else {
        await fs13.promises.writeFile(res.targetPath, res.content, "utf8");
      }
      vscode7.window.showInformationMessage(`Agent rules generated at ${path15.basename(res.targetPath)}`);
      const doc = await vscode7.workspace.openTextDocument(vscode7.Uri.file(res.targetPath));
      await vscode7.window.showTextDocument(doc);
    }),
    vscode7.commands.registerCommand("agenticKanban.initTemplates", async (item) => {
      const boards = boardManager.getAllBoards();
      if (boards.length === 0) {
        vscode7.window.showWarningMessage("No active Kanban boards found.");
        return;
      }
      let board = boards[0];
      if (item && item.board) {
        board = item.board;
      } else if (boards.length > 1) {
        const pick = await vscode7.window.showQuickPick(
          boards.map((b) => ({ label: b.name, description: b.rootPath, board: b })),
          { placeHolder: "Select board to initialize templates in" }
        );
        if (!pick)
          return;
        board = pick.board;
      }
      const created = await boardManager.initTemplates(board.id);
      if (created && created.length > 0) {
        vscode7.window.showInformationMessage(`Initialized templates: ${created.join(", ")} in ${board.name}/.templates/`);
        const firstTemplate = path15.join(board.rootPath, ".templates", created[0]);
        if (fs13.existsSync(firstTemplate)) {
          const doc = await vscode7.workspace.openTextDocument(vscode7.Uri.file(firstTemplate));
          await vscode7.window.showTextDocument(doc);
        }
      } else {
        vscode7.window.showInformationMessage(`.templates/ already contains templates for ${board.name}.`);
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
