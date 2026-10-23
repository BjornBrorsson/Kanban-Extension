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

// test/messageBoardTests.ts
var fs2 = __toESM(require("fs"));
var os = __toESM(require("os"));
var path2 = __toESM(require("path"));
var import_child_process = require("child_process");

// src/fleet/messageBoard.ts
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
function isMessageBoardDir(dir) {
  try {
    return fs.statSync(dir).isDirectory() && (fs.existsSync(path.join(dir, "ACTIVE_AGENTS.md")) || fs.existsSync(path.join(dir, "THREADS")) || fs.existsSync(path.join(dir, "LOCKS")));
  } catch {
    return false;
  }
}
function findMessageBoard(roots) {
  for (const r of roots) {
    let dir = path.resolve(r);
    for (let i = 0; i < 4; i++) {
      const candidate = path.join(dir, "MessageBoard");
      if (isMessageBoardDir(candidate))
        return candidate;
      const parent = path.dirname(dir);
      if (parent === dir)
        break;
      dir = parent;
    }
  }
  return void 0;
}
function read(file) {
  try {
    return fs.readFileSync(file, "utf8");
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
  const title = (text.match(/^#\s+(.+)$/m)?.[1] || path.basename(file, ".md")).trim();
  const headings = [...text.matchAll(/^###\s+(.+)$/gm)].map((m) => m[1].trim());
  return {
    file: path.basename(file),
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
  const dir = path.join(boardDir, "LOCKS");
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".lock"));
  } catch {
    return [];
  }
  const out = [];
  for (const f of files) {
    try {
      const l = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
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
  const threadsDir = path.join(boardDir, "THREADS");
  let threadFiles = [];
  try {
    threadFiles = fs.readdirSync(threadsDir).filter((f) => /\.md$/i.test(f)).sort().reverse();
  } catch {
  }
  const threads = threadFiles.map((f) => parseThread(path.join(threadsDir, f), read(path.join(threadsDir, f))));
  const dms = [];
  const dmDir = path.join(boardDir, "DIRECT_MESSAGES");
  try {
    for (const to of fs.readdirSync(dmDir, { withFileTypes: true }).filter((d) => d.isDirectory())) {
      for (const f of fs.readdirSync(path.join(dmDir, to.name)).filter((x) => /\.md$/i.test(x)).sort().reverse()) {
        const p = path.join(dmDir, to.name, f);
        dms.push({ file: f, path: p, to: to.name, title: (read(p).match(/^#\s+(.+)$/m)?.[1] || f).trim() });
      }
    }
  } catch {
  }
  let archived = 0;
  try {
    archived = fs.readdirSync(path.join(boardDir, "ARCHIVE")).filter((f) => /\.md$/i.test(f)).length;
  } catch {
  }
  const log = read(path.join(boardDir, "LOCKS", "CLAIMS_LOG.md")).split(/\r?\n/).filter((l) => l.trim()).slice(-12).reverse();
  return { root: boardDir, agents: parseActiveAgents(read(path.join(boardDir, "ACTIVE_AGENTS.md"))), claims: readClaims(boardDir, now), threads, dms, archived, claimsLog: log };
}
var slug = (s) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
var stamp = (d = /* @__PURE__ */ new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
function replyToThread(threadPath, author, client, text, now = /* @__PURE__ */ new Date()) {
  const body = `
---

### ${stamp(now)} \u2014 ${author} (${client})
${text.trim()}
`;
  fs.appendFileSync(threadPath, body, "utf8");
}
function createThread(boardDir, title, author, client, firstMessage, ticket = "", now = /* @__PURE__ */ new Date()) {
  const dir = path.join(boardDir, "THREADS");
  fs.mkdirSync(dir, { recursive: true });
  const used = [...fs.readdirSync(dir), ...fs.existsSync(path.join(boardDir, "ARCHIVE")) ? fs.readdirSync(path.join(boardDir, "ARCHIVE")) : []].map((f) => Number(f.match(/THREAD_(\d+)/i)?.[1])).filter((n) => Number.isFinite(n));
  const next = String((used.length ? Math.max(...used) : 0) + 1).padStart(3, "0");
  const file = path.join(dir, `THREAD_${next}_${slug(title).slice(0, 40) || "topic"}.md`);
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
  fs.writeFileSync(file, content, "utf8");
  return file;
}
var lockSlug = (key) => key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function logClaim(boardDir, line) {
  try {
    fs.mkdirSync(path.join(boardDir, "LOCKS"), { recursive: true });
    fs.appendFileSync(path.join(boardDir, "LOCKS", "CLAIMS_LOG.md"), `- ${(/* @__PURE__ */ new Date()).toISOString()} ${line}
`, "utf8");
  } catch {
  }
}
function claim(boardDir, key, agent, reason, ticket = "", minutes = 60, now = Date.now()) {
  const dir = path.join(boardDir, "LOCKS");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${lockSlug(key)}.lock`);
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
    fs.writeFileSync(file, lock(), { flag: "wx" });
    logClaim(boardDir, `CLAIM ${key} by ${agent} (${minutes} min) - ${reason}`);
    return { ok: true };
  } catch (e) {
    if (e?.code !== "EEXIST")
      throw e;
  }
  let cur = {};
  try {
    cur = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    cur = { agent: "?", expires: "9999-12-31T00:00:00Z" };
  }
  if (cur.agent === agent) {
    fs.writeFileSync(file, lock(cur.claimed), "utf8");
    logClaim(boardDir, `RENEW ${key} by ${agent}`);
    return { ok: true, renewed: true };
  }
  if (Date.parse(cur.expires) > now)
    return { ok: false, heldBy: cur.agent, expires: cur.expires };
  fs.writeFileSync(file, lock(), "utf8");
  logClaim(boardDir, `TAKEOVER ${key} by ${agent} from ${cur.agent} (expired ${cur.expires}) - ${reason}`);
  return { ok: true };
}
function release(boardDir, key, agent, force = false) {
  const file = path.join(boardDir, "LOCKS", `${lockSlug(key)}.lock`);
  let cur;
  try {
    cur = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return false;
  }
  if (cur.agent !== agent && !force)
    return false;
  try {
    fs.unlinkSync(file);
  } catch {
    return false;
  }
  logClaim(boardDir, `RELEASE ${key} by ${agent}${cur.agent !== agent ? ` (forced; holder was ${cur.agent})` : ""}`);
  return true;
}

// test/messageBoardTests.ts
var failures = 0;
function check(cond, msg) {
  if (!cond) {
    failures++;
    console.error("  \u2718 " + msg);
  } else {
    console.log("  \u2714 " + msg);
  }
}
var AGENTS = `# Active Agents

| Agent Name | Client / Environment | Current Focus | Claimed Areas | Active Ticket | Last Check-in |
|---|---|---|---|---|---|
| **Bj\xF6rn** | Project Lead (Human) | Direction | All | All | Active |
| **Devin** | Devin Desktop | Feature waves | \`UI\` | SKTY-127 | 2026-10-21 |

---
## Claim protocol
`;
var THREAD = `# THREAD-001: Welcome

| Metadata | Details |
|---|---|
| **Author** | Bj\xF6rn |
| **Status** | Active / Open |
| **Related Ticket** | N/A |
| **Created** | 2026-10-17 01:37 |

## Conversation Log

### 2026-10-17 01:43 \u2014 Devin (IDE)
Hello.

### 2026-10-17 02:30 \u2014 Claude Code (CLI)
Hi.
`;
async function main() {
  console.log("\n=== Message Board integration ===");
  const root = fs2.mkdtempSync(path2.join(os.tmpdir(), "mb-"));
  const project = path2.join(root, "proj");
  const mb = path2.join(project, "MessageBoard");
  fs2.mkdirSync(path2.join(mb, "THREADS"), { recursive: true });
  fs2.mkdirSync(path2.join(mb, "DIRECT_MESSAGES", "DEVIN"), { recursive: true });
  fs2.mkdirSync(path2.join(mb, "ARCHIVE"), { recursive: true });
  fs2.writeFileSync(path2.join(mb, "ACTIVE_AGENTS.md"), AGENTS);
  fs2.writeFileSync(path2.join(mb, "THREADS", "THREAD_001_welcome.md"), THREAD);
  fs2.writeFileSync(path2.join(mb, "DIRECT_MESSAGES", "DEVIN", "2026-10-17_note.md"), "# From Claude Code \u2014 hi\n");
  fs2.writeFileSync(path2.join(mb, "ARCHIVE", "THREAD_000_old.md"), "# old\n");
  console.log("\n--- discovery & reading ---");
  check(findMessageBoard([path2.join(project, "Tickets")]) === mb, "finds MessageBoard/ in a parent of the board folder");
  check(findMessageBoard([path2.join(root, "nothing")]) === void 0, "returns nothing when the add-on is not installed");
  const agents = parseActiveAgents(AGENTS);
  check(agents.length === 2 && agents[1].name === "Devin" && agents[1].claimed === "UI" && agents[1].ticket === "SKTY-127", "parses the ACTIVE_AGENTS.md roster");
  const state = readMessageBoard(mb);
  check(state.threads.length === 1 && state.threads[0].title === "THREAD-001: Welcome" && state.threads[0].status === "Active / Open" && state.threads[0].messages === 2, "reads thread title, status and message count");
  check(state.threads[0].lastMessage.includes("Claude Code"), "shows who spoke last");
  check(state.dms.length === 1 && state.dms[0].to === "DEVIN" && state.archived === 1, "lists direct messages and archived threads");
  console.log("\n--- claims (same lease rules as claim.py) ---");
  const now = Date.UTC(2026, 9, 23, 12, 0, 0);
  const r1 = claim(mb, "SKTY-1", "Claude Code", "work", "SKTY-1", 60, now);
  check(r1.ok === true, "first claim wins");
  const r2 = claim(mb, "SKTY-1", "Devin", "work", "SKTY-1", 60, now + 1e3);
  check(r2.ok === false && r2.heldBy === "Claude Code", "a second agent is told who holds it");
  const r3 = claim(mb, "SKTY-1", "Claude Code", "still working", "SKTY-1", 60, now + 10 * 6e4);
  check(r3.ok === true && r3.renewed === true, "the holder renews its own claim");
  const claims = readClaims(mb, now + 20 * 6e4);
  check(claims.length === 1 && !claims[0].expired && claims[0].minutesLeft === 50, "readClaims reports time left on the lease");
  const r4 = claim(mb, "SKTY-1", "Devin", "takeover", "SKTY-1", 60, now + 3 * 36e5);
  check(r4.ok === true && readClaims(mb, now + 3 * 36e5)[0].agent === "Devin", "an expired claim is taken over");
  check(release(mb, "SKTY-1", "Claude Code") === false && release(mb, "SKTY-1", "Claude Code", true) === true, "only the holder (or a forced release) can release");
  check(readClaims(mb).length === 0, "released claims disappear");
  const log = fs2.readFileSync(path2.join(mb, "LOCKS", "CLAIMS_LOG.md"), "utf8");
  check(/CLAIM SKTY-1/.test(log) && /TAKEOVER/.test(log) && /RELEASE/.test(log), "every claim action is logged to CLAIMS_LOG.md");
  console.log("\n--- threads ---");
  const file = createThread(mb, "Who owns the auth refactor?", "Bj\xF6rn", "Agentic Kanban UI", "Please claim before editing.");
  check(path2.basename(file).startsWith("THREAD_002_who-owns-the-auth-refactor") && /THREAD-002/.test(fs2.readFileSync(file, "utf8")), "new threads get the next number and a slug");
  replyToThread(file, "Bj\xF6rn", "Agentic Kanban UI", "Thanks all.", new Date(2026, 9, 23, 14, 5));
  const t2 = readMessageBoard(mb).threads.find((t) => t.file.startsWith("THREAD_002"));
  check(t2.messages === 1 && t2.lastMessage.includes("2026-10-23 14:05") && t2.status === "Open", "replies are appended and signed with a timestamp");
  console.log("\n--- interoperates with claim.py ---");
  const py = [process.env.BOARD_PYTHON, path2.join(process.env.LOCALAPPDATA || "", "Microsoft", "WindowsApps", "python.exe"), "python3", "python"].filter(Boolean);
  const script = path2.join(__dirname, "..", "..", "BearsAgenticCodeFramework", "Add-ons", "MessageBoard", "MessageBoard", "tools", "claim.py");
  let ran = false;
  if (fs2.existsSync(script)) {
    const toolsDir = path2.join(mb, "tools");
    fs2.mkdirSync(toolsDir, { recursive: true });
    fs2.copyFileSync(script, path2.join(toolsDir, "claim.py"));
    claim(mb, "INTEROP-1", "Devin", "from the UI", "INTEROP-1", 60);
    for (const exe of py) {
      const r = (0, import_child_process.spawnSync)(exe, [path2.join(toolsDir, "claim.py"), "status"], { encoding: "utf8" });
      if (r.status === 0 && r.stdout) {
        ran = true;
        check(/INTEROP-1/.test(r.stdout) && /held by Devin/.test(r.stdout), "claim.py sees a claim made by the extension");
        const rel = (0, import_child_process.spawnSync)(exe, [path2.join(toolsDir, "claim.py"), "release", "INTEROP-1", "--agent", "Devin"], { encoding: "utf8" });
        check(rel.status === 0 && readClaims(mb).length === 0, "claim.py can release it, and the extension sees that");
        break;
      }
    }
  }
  if (!ran)
    console.log("  (skipped: BACF claim.py or Python not available here)");
  fs2.rmSync(root, { recursive: true, force: true });
  if (failures) {
    console.error(`
${failures} message board check(s) FAILED`);
    process.exit(1);
  }
  console.log("\n=== All message board tests passed ===");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
//# sourceMappingURL=messageBoardTests.js.map
