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
  TicketParser: () => TicketParser
});
module.exports = __toCommonJS(runParserTests_exports);
var fs = __toESM(require("fs"));
var path2 = __toESM(require("path"));

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
          }
        }
      }
    }
    const assigneesMatch = content.match(/##\s+Assignees\s*\r?\n([\s\S]*?)(?=\r?\n##\s+|$)/i);
    if (assigneesMatch) {
      const assigneesBlock = assigneesMatch[1];
      this.parseAssignees(assigneesBlock, config);
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

// test/runParserTests.ts
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}
async function runTests() {
  console.log("=== Running Parser Unit Tests ===");
  const root = path2.join(__dirname, "..");
  const ticketsRoot = path2.join(root, "Example Structure", "Tickets");
  const configPath = path2.join(ticketsRoot, "config.md");
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
  const ticket019Path = path2.join(ticketsRoot, "Ongoing", "Example_ticket-019_cleanup-audit-trail.md");
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
  const ticket001Path = path2.join(ticketsRoot, "Assistance Required", "Example_ticket-001_local-gpu-model-host.md");
  const ticket001Content = fs.readFileSync(ticket001Path, "utf8");
  const ticket001 = TicketParser.parse(ticket001Path, ticket001Content, ticketsRoot, "Assistance Required", null);
  assert(ticket001.id === "ACM-001", `Expected ID ACM-001, got '${ticket001.id}'`);
  assert(ticket001.progress.total === 5, `Expected 5 total criteria, got ${ticket001.progress.total}`);
  assert(ticket001.progress.done === 2, `Expected 2 done criteria, got ${ticket001.progress.done}`);
  assert(ticket001.labels.includes("llm") && ticket001.labels.includes("gpu"), "Expected llm and gpu labels");
  console.log("\u2713 Ticket-001 checklist tests passed!");
  console.log("\nTesting TicketParser on freeform ticket (ticket-092)...");
  const ticket092Path = path2.join(ticketsRoot, "Backlog", "Needs further specification", "Example_ticket-092-Pathfix.md");
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
  const ext001Path = path2.join(root, "Tickets", "Ongoing", "EXT-001_copy-agent-task-prompt.md");
  if (fs.existsSync(ext001Path)) {
    const ext001Content = fs.readFileSync(ext001Path, "utf8");
    const ext001Assigned = TicketParser.updateTicketAssignee(ext001Content, "Cline CLI (Ollama - Gemma 4 E4B)");
    assert(ext001Assigned.includes("| **Assignee** | Cline CLI (Ollama - Gemma 4 E4B) |"), "Expected Assignee row inserted into EXT-001");
    const parsedExt001 = TicketParser.parse(ext001Path, ext001Assigned, path2.join(root, "Tickets"), "Ongoing", null);
    assert(parsedExt001.assignee === "Cline CLI (Ollama - Gemma 4 E4B)", `Expected parsed assignee to be Cline CLI, got: ${parsedExt001.assignee}`);
    const ext001Reassigned = TicketParser.updateTicketAssignee(ext001Assigned, "Bj\xF6rn");
    assert(ext001Reassigned.includes("| **Assignee** | Bj\xF6rn |"), "Expected Assignee row updated to Bj\xF6rn");
    assert(!ext001Reassigned.includes("Cline CLI"), "Expected Cline CLI to be replaced");
    console.log("\u2713 EXT-001 assignment and re-assignment tests passed!");
  }
  console.log("\n=== ALL UNIT TESTS PASSED SUCCESSFULLY! ===");
}
runTests().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ConfigParser,
  TicketParser
});
//# sourceMappingURL=test.js.map
