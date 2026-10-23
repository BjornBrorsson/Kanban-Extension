import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';

/** Last meaningful lines of an agent's output, as one readable paragraph (used for the Work Log and the UI). */
export function summarizeOutput(text: string, maxChars = 700): string {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.replace(/\s+$/, ''))
    .filter(l => l.trim().length > 0 && !/^[\s─━═\-=_*│|>╭╰╮╯┌└┐┘]+$/.test(l));
  if (!lines.length) return '';
  // The agent's closing message is at the end: take lines from the bottom until the budget is used.
  const picked: string[] = [];
  let used = 0;
  for (let i = lines.length - 1; i >= 0 && picked.length < 14; i--) {
    const l = lines[i].trim();
    if (used + l.length > maxChars && picked.length) break;
    picked.unshift(l.length > maxChars ? l.slice(0, maxChars) : l);
    used += l.length + 1;
  }
  return picked.join(' ').replace(/\s+/g, ' ').trim();
}

/** `git status --porcelain` paths (best effort: empty set when not a repo or git is missing). */
export function gitStatusSet(cwd: string | undefined, timeoutMs = 4000): Promise<Set<string> | undefined> {
  return new Promise(resolve => {
    if (!cwd) return resolve(undefined);
    execFile('git', ['status', '--porcelain'], { cwd, timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve(undefined);
      resolve(new Set(String(stdout).split(/\r?\n/).filter(Boolean).map(l => l.trim())));
    });
  });
}

/** Files whose status line is new or different after the session (approximate when sessions share a folder). */
export function changedSince(before: Set<string> | undefined, after: Set<string> | undefined): string[] {
  if (!after) return [];
  return [...after].filter(l => !before || !before.has(l)).map(l => l.replace(/^\S+\s+/, ''));
}

export interface WorkLogInput {
  at: Date;
  provider: string;
  model: string;
  reasoning?: string;
  role: string;
  status: string;
  minutes?: number;
  exitCode?: number;
  summary: string;
  files: string[];
  logFile?: string;
  note?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function formatWorkLogEntry(i: WorkLogInput): string[] {
  const stamp = `${i.at.getFullYear()}-${pad(i.at.getMonth() + 1)}-${pad(i.at.getDate())} ${pad(i.at.getHours())}:${pad(i.at.getMinutes())}`;
  const dur = i.minutes !== undefined ? ` in ${i.minutes < 1 ? '<1' : Math.round(i.minutes)} min` : '';
  const model = `${i.model || 'default model'}${i.reasoning ? ` (${i.reasoning})` : ''}`;
  const lines = [`- **${stamp}**: [Orchestrator] ${i.provider} · ${model} (${i.role}) ${i.status}${dur}${i.exitCode !== undefined && i.exitCode !== 0 ? `, exit code ${i.exitCode}` : ''}.`];
  if (i.note) lines.push(`  - Note: ${i.note.replace(/\s+/g, ' ').slice(0, 300)}`);
  lines.push(`  - Result: ${i.summary || '(no output captured — terminal shell integration was not available)'}`);
  if (i.files.length) {
    const shown = i.files.slice(0, 8).join(', ');
    lines.push(`  - Files touched in the workspace during the session: ${shown}${i.files.length > 8 ? ` (+${i.files.length - 8} more)` : ''}`);
  }
  if (i.logFile) lines.push(`  - Full output: ${i.logFile}`);
  return lines;
}

/**
 * Appends entry lines to the ticket's "## Work Log" section (created if missing). Append-only: existing lines are
 * never changed, and the file's line endings are kept.
 */
export function appendWorkLog(ticketPath: string, entry: string[]): boolean {
  let text: string;
  try { text = fs.readFileSync(ticketPath, 'utf8'); } catch { return false; }
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const body = text.replace(/\r\n/g, '\n');
  const head = /^##\s+Work Log\s*$/im.exec(body);
  const block = entry.join('\n');
  let out: string;
  if (head) {
    const from = head.index + head[0].length;
    const next = /^##\s+\S/m.exec(body.slice(from));
    const end = next ? from + next.index : body.length;
    const section = body.slice(from, end).replace(/\s+$/, '');
    out = body.slice(0, from) + section + '\n' + block + '\n' + (next ? '\n' : '') + body.slice(end);
  } else {
    out = body.replace(/\s+$/, '') + '\n\n## Work Log\n' + block + '\n';
  }
  try {
    fs.writeFileSync(ticketPath, eol === '\r\n' ? out.replace(/\n/g, '\r\n') : out, 'utf8');
    return true;
  } catch { return false; }
}

export function writeSessionLog(dir: string, sessionId: string, header: string, output: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${sessionId}.log`);
  fs.writeFileSync(file, `${header}\n\n${output}\n`, 'utf8');
  return file;
}
