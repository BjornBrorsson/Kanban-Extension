import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { ProviderKind } from './providers';

/** Executable names to look for, per provider kind (first match wins). */
export const EXECUTABLE_NAMES: Partial<Record<ProviderKind, string[]>> = {
  'claude-code': ['claude'],
  devin: ['devin', 'devin-desktop'],
  antigravity: ['agy'],
  gemini: ['gemini'],
  codex: ['codex'],
  aider: ['aider'],
  'copilot-cli': ['copilot'],
  cline: ['cline'],
  ollama: ['ollama']
};

const isWin = () => process.platform === 'win32';

function pathExts(): string[] {
  if (!isWin()) return [''];
  return ['', ...(process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').map(e => e.toLowerCase())];
}

function isFile(p: string): boolean {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

/** Directories worth checking beyond PATH (PATH is often incomplete for GUI-launched editors). */
export function extraSearchDirs(env: NodeJS.ProcessEnv = process.env): string[] {
  const home = env.USERPROFILE || env.HOME || os.homedir();
  const dirs: string[] = [];
  if (isWin()) {
    const local = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    const roaming = env.APPDATA || path.join(home, 'AppData', 'Roaming');
    dirs.push(
      path.join(roaming, 'npm'),
      path.join(local, 'Programs', 'Ollama'),
      path.join(local, 'Programs', 'Devin', 'bin'),
      path.join(local, 'Programs', 'Devin Next', 'bin'),
      path.join(local, 'agy', 'bin'),
      path.join(local, 'Microsoft', 'WindowsApps'),
      path.join(home, '.local', 'bin'),
      path.join(home, '.claude', 'local'),
      path.join(env.ProgramFiles || 'C:\\Program Files', 'Ollama'),
      path.join(env.ProgramFiles || 'C:\\Program Files', 'agy', 'bin')
    );
    // fnm / nvm managed Node installs keep global CLIs here
    for (const root of [path.join(local, 'fnm_multishells'), env.FNM_DIR ? path.join(env.FNM_DIR, 'node-versions') : '', 'C:\\fnm\\node-versions']) {
      if (!root || !fs.existsSync(root)) continue;
      try {
        for (const v of fs.readdirSync(root)) dirs.push(path.join(root, v, 'installation'), path.join(root, v));
      } catch { /* unreadable */ }
    }
  } else {
    dirs.push(
      path.join(home, '.local', 'bin'), path.join(home, '.claude', 'local'), path.join(home, '.agy', 'bin'),
      path.join(home, '.npm-global', 'bin'), path.join(home, '.cargo', 'bin'),
      '/usr/local/bin', '/opt/homebrew/bin', '/usr/bin'
    );
  }
  return dirs;
}

/** Finds an executable on PATH or in well-known install folders. Returns the absolute path or undefined. */
export function findExecutable(names: string[], env: NodeJS.ProcessEnv = process.env, extraDirs: string[] = extraSearchDirs(env)): string | undefined {
  const pathDirs = (env.PATH || env.Path || '').split(path.delimiter).filter(Boolean);
  const dirs = [...pathDirs, ...extraDirs];
  const exts = pathExts();
  for (const name of names) {
    for (const dir of dirs) {
      for (const ext of exts) {
        const candidate = path.join(dir, name + ext);
        if (isFile(candidate)) return candidate;
      }
    }
  }
  return undefined;
}

export function findForKind(kind: ProviderKind, env: NodeJS.ProcessEnv = process.env, extraDirs?: string[]): string | undefined {
  const names = EXECUTABLE_NAMES[kind];
  if (!names) return undefined;
  // Honour explicit overrides first (same ones the antigravity resolver already knows).
  if (kind === 'antigravity') {
    // `agy` on PATH is often the Antigravity IDE launcher; the agent CLI lives under LOCALAPPDATA/agy/bin.
    const local = env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'agy', 'bin', 'agy.exe') : '';
    if (local && isFile(local)) return local;
    for (const key of ['AGY_PATH', 'ANTIGRAVITY_PATH']) {
      const v = env[key];
      if (v && isFile(v)) return v;
    }
  }
  return findExecutable(names, env, extraDirs);
}

/** Parses `ollama list` output (table with a NAME column). */
export function parseOllamaList(text: string): string[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length && /^name\s+/i.test(lines[0])) lines.shift();
  return lines.map(l => l.split(/\s+/)[0]).filter(Boolean);
}

function httpGetJson(url: string, timeoutMs: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', d => (body += d));
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

/** Models installed in a local Ollama: HTTP API first, `ollama list` as a fallback. */
export async function detectOllamaModels(host = '127.0.0.1:11434', exePath?: string): Promise<string[]> {
  try {
    const data = await httpGetJson(`http://${host}/api/tags`, 1500);
    const names = (data?.models || []).map((m: any) => String(m.name || m.model || '')).filter(Boolean);
    if (names.length) return names;
  } catch { /* server not reachable: try the CLI */ }
  const exe = exePath || findExecutable(['ollama']);
  if (!exe) return [];
  return new Promise(resolve => {
    execFile(exe, ['list'], { timeout: 4000, windowsHide: true, shell: isWin() && /\.(cmd|bat)$/i.test(exe) }, (err, stdout) => {
      resolve(err ? [] : parseOllamaList(String(stdout)));
    });
  });
}

export interface Detection {
  kind: ProviderKind;
  path?: string;
  models?: string[];
}

/** Scans the machine for every known agent CLI (and Ollama models). Never throws. */
export async function detectAll(env: NodeJS.ProcessEnv = process.env): Promise<Detection[]> {
  const out: Detection[] = [];
  for (const kind of Object.keys(EXECUTABLE_NAMES) as ProviderKind[]) {
    const p = findForKind(kind, env);
    if (!p) continue;
    const d: Detection = { kind, path: p };
    if (kind === 'ollama') d.models = await detectOllamaModels(undefined, p);
    out.push(d);
  }
  return out;
}

/** Detection for a single provider (path + models when the kind supports it). */
export async function detectOne(kind: ProviderKind, env: NodeJS.ProcessEnv = process.env): Promise<Detection> {
  const p = findForKind(kind, env);
  const d: Detection = { kind, path: p };
  if (kind === 'ollama') d.models = await detectOllamaModels(undefined, p);
  return d;
}
