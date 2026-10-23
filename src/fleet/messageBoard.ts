import * as fs from 'fs';
import * as path from 'path';

/**
 * Reader/writer for the BACF "Message Board" add-on (MessageBoard/ folder: ACTIVE_AGENTS.md, LOCKS/, THREADS/,
 * DIRECT_MESSAGES/, ARCHIVE/). The claim lock format is shared with MessageBoard/tools/claim.py.
 */

export interface BoardAgent { name: string; client: string; focus: string; claimed: string; ticket: string; lastCheckin: string }
export interface BoardClaim { key: string; agent: string; ticket: string; reason: string; claimed: string; expires: string; expired: boolean; minutesLeft: number }
export interface BoardThread { file: string; path: string; title: string; status: string; author: string; created: string; ticket: string; messages: number; lastMessage: string }
export interface BoardDm { file: string; path: string; to: string; title: string }

export interface MessageBoardState {
  root: string;
  agents: BoardAgent[];
  claims: BoardClaim[];
  threads: BoardThread[];
  dms: BoardDm[];
  archived: number;
  claimsLog: string[];
}

export function isMessageBoardDir(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory() &&
      (fs.existsSync(path.join(dir, 'ACTIVE_AGENTS.md')) || fs.existsSync(path.join(dir, 'THREADS')) || fs.existsSync(path.join(dir, 'LOCKS')));
  } catch { return false; }
}

/** Finds a MessageBoard/ folder in (or just above) the given roots, nearest first. */
export function findMessageBoard(roots: string[]): string | undefined {
  for (const r of roots) {
    let dir = path.resolve(r);
    for (let i = 0; i < 4; i++) {
      const candidate = path.join(dir, 'MessageBoard');
      if (isMessageBoardDir(candidate)) return candidate;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return undefined;
}

function read(file: string): string {
  try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
}

const clean = (s: string) => s.replace(/\*\*/g, '').replace(/`/g, '').trim();

export function parseActiveAgents(md: string): BoardAgent[] {
  const out: BoardAgent[] = [];
  let inTable = false;
  for (const line of md.split(/\r?\n/)) {
    if (/^\|\s*Agent Name\s*\|/i.test(line)) { inTable = true; continue; }
    if (!inTable) continue;
    if (!line.trim().startsWith('|')) { if (out.length) break; continue; }
    if (/^\|\s*-{2,}/.test(line)) continue;
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map(clean);
    if (cells.length < 2 || !cells[0]) continue;
    out.push({ name: cells[0], client: cells[1] || '', focus: cells[2] || '', claimed: cells[3] || '', ticket: cells[4] || '', lastCheckin: cells[5] || '' });
  }
  return out;
}

function field(md: string, name: string): string {
  const m = md.match(new RegExp(`^\\|\\s*\\*{0,2}${name}\\*{0,2}\\s*\\|\\s*(.+?)\\s*\\|\\s*$`, 'im'));
  return m ? clean(m[1]) : '';
}

export function parseThread(file: string, text: string): BoardThread {
  const title = (text.match(/^#\s+(.+)$/m)?.[1] || path.basename(file, '.md')).trim();
  const headings = [...text.matchAll(/^###\s+(.+)$/gm)].map(m => m[1].trim());
  return {
    file: path.basename(file),
    path: file,
    title,
    status: field(text, 'Status'),
    author: field(text, 'Author'),
    created: field(text, 'Created'),
    ticket: field(text, 'Related Ticket'),
    messages: headings.length,
    lastMessage: headings[headings.length - 1] || ''
  };
}

export function readClaims(boardDir: string, now: number = Date.now()): BoardClaim[] {
  const dir = path.join(boardDir, 'LOCKS');
  let files: string[] = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.lock')); } catch { return []; }
  const out: BoardClaim[] = [];
  for (const f of files) {
    try {
      const l = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const exp = Date.parse(l.expires);
      out.push({
        key: l.key || f.replace(/\.lock$/, ''), agent: l.agent || '?', ticket: l.ticket || '', reason: l.reason || '',
        claimed: l.claimed || '', expires: l.expires || '', expired: Number.isFinite(exp) ? exp <= now : false,
        minutesLeft: Number.isFinite(exp) ? Math.round((exp - now) / 60000) : 0
      });
    } catch { /* half-written lock */ }
  }
  return out.sort((a, b) => Number(a.expired) - Number(b.expired) || a.key.localeCompare(b.key));
}

export function readMessageBoard(boardDir: string, now: number = Date.now()): MessageBoardState {
  const threadsDir = path.join(boardDir, 'THREADS');
  let threadFiles: string[] = [];
  try { threadFiles = fs.readdirSync(threadsDir).filter(f => /\.md$/i.test(f)).sort().reverse(); } catch { /* none */ }
  const threads = threadFiles.map(f => parseThread(path.join(threadsDir, f), read(path.join(threadsDir, f))));

  const dms: BoardDm[] = [];
  const dmDir = path.join(boardDir, 'DIRECT_MESSAGES');
  try {
    for (const to of fs.readdirSync(dmDir, { withFileTypes: true }).filter(d => d.isDirectory())) {
      for (const f of fs.readdirSync(path.join(dmDir, to.name)).filter(x => /\.md$/i.test(x)).sort().reverse()) {
        const p = path.join(dmDir, to.name, f);
        dms.push({ file: f, path: p, to: to.name, title: (read(p).match(/^#\s+(.+)$/m)?.[1] || f).trim() });
      }
    }
  } catch { /* none */ }

  let archived = 0;
  try { archived = fs.readdirSync(path.join(boardDir, 'ARCHIVE')).filter(f => /\.md$/i.test(f)).length; } catch { /* none */ }

  const log = read(path.join(boardDir, 'LOCKS', 'CLAIMS_LOG.md')).split(/\r?\n/).filter(l => l.trim()).slice(-12).reverse();
  return { root: boardDir, agents: parseActiveAgents(read(path.join(boardDir, 'ACTIVE_AGENTS.md'))), claims: readClaims(boardDir, now), threads, dms, archived, claimsLog: log };
}

// ---------------------------------------------------------------- writing

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const stamp = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Appends a signed message to a thread (threads are append-only). */
export function replyToThread(threadPath: string, author: string, client: string, text: string, now: Date = new Date()): void {
  const body = `\n---\n\n### ${stamp(now)} — ${author} (${client})\n${text.trim()}\n`;
  fs.appendFileSync(threadPath, body, 'utf8');
}

/** Creates THREADS/THREAD_NNN_<slug>.md from the template (or a minimal one) and returns its path. */
export function createThread(boardDir: string, title: string, author: string, client: string, firstMessage: string, ticket = '', now: Date = new Date()): string {
  const dir = path.join(boardDir, 'THREADS');
  fs.mkdirSync(dir, { recursive: true });
  const used = [...fs.readdirSync(dir), ...(fs.existsSync(path.join(boardDir, 'ARCHIVE')) ? fs.readdirSync(path.join(boardDir, 'ARCHIVE')) : [])]
    .map(f => Number(f.match(/THREAD_(\d+)/i)?.[1])).filter(n => Number.isFinite(n));
  const next = String((used.length ? Math.max(...used) : 0) + 1).padStart(3, '0');
  const file = path.join(dir, `THREAD_${next}_${slug(title).slice(0, 40) || 'topic'}.md`);
  const content = `# THREAD-${next}: ${title.trim()}

| Metadata | Details |
|---|---|
| **Author** | ${author} |
| **Environment** | ${client} |
| **Status** | Open |
| **Related Ticket** | ${ticket || 'None'} |
| **Created** | ${stamp(now)} |

---

## Topic Overview
${firstMessage.trim()}

---

## Conversation Log
`;
  fs.writeFileSync(file, content, 'utf8');
  return file;
}

const lockSlug = (key: string) => key.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function logClaim(boardDir: string, line: string): void {
  try {
    fs.mkdirSync(path.join(boardDir, 'LOCKS'), { recursive: true });
    fs.appendFileSync(path.join(boardDir, 'LOCKS', 'CLAIMS_LOG.md'), `- ${new Date().toISOString()} ${line}\n`, 'utf8');
  } catch { /* log is best-effort */ }
}

export type ClaimResult = { ok: true; renewed?: boolean } | { ok: false; heldBy: string; expires: string };

/** Same lease semantics as claim.py: create-only-if-absent, renew your own, take over expired ones. */
export function claim(boardDir: string, key: string, agent: string, reason: string, ticket = '', minutes = 60, now: number = Date.now()): ClaimResult {
  const dir = path.join(boardDir, 'LOCKS');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${lockSlug(key)}.lock`);
  const lock = (claimed?: string) => JSON.stringify({
    key, agent, ticket, reason,
    claimed: claimed || new Date(now).toISOString(), renewed: new Date(now).toISOString(), expires: new Date(now + minutes * 60_000).toISOString()
  }, null, 2);
  try {
    fs.writeFileSync(file, lock(), { flag: 'wx' });
    logClaim(boardDir, `CLAIM ${key} by ${agent} (${minutes} min) - ${reason}`);
    return { ok: true };
  } catch (e: any) {
    if (e?.code !== 'EEXIST') throw e;
  }
  let cur: any = {};
  try { cur = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { cur = { agent: '?', expires: '9999-12-31T00:00:00Z' }; }
  if (cur.agent === agent) {
    fs.writeFileSync(file, lock(cur.claimed), 'utf8');
    logClaim(boardDir, `RENEW ${key} by ${agent}`);
    return { ok: true, renewed: true };
  }
  if (Date.parse(cur.expires) > now) return { ok: false, heldBy: cur.agent, expires: cur.expires };
  fs.writeFileSync(file, lock(), 'utf8');
  logClaim(boardDir, `TAKEOVER ${key} by ${agent} from ${cur.agent} (expired ${cur.expires}) - ${reason}`);
  return { ok: true };
}

/** Releases your own claim, or any claim with force (the UI only forces expired ones). */
export function release(boardDir: string, key: string, agent: string, force = false): boolean {
  const file = path.join(boardDir, 'LOCKS', `${lockSlug(key)}.lock`);
  let cur: any;
  try { cur = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return false; }
  if (cur.agent !== agent && !force) return false;
  try { fs.unlinkSync(file); } catch { return false; }
  logClaim(boardDir, `RELEASE ${key} by ${agent}${cur.agent !== agent ? ` (forced; holder was ${cur.agent})` : ''}`);
  return true;
}
