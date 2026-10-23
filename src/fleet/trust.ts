import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { isInside } from '../pathUtils';

/** True when `cwd` is (inside) one of the workspaces the user marked as trusted in the extension. */
export function isTrusted(trustedRoots: string[], cwd: string): boolean {
  return trustedRoots.some(r => isInside(r, cwd));
}

const same = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

interface CopilotConfig { header: string; json: any; file: string }

/** ~/.copilot/config.json starts with "//" comment lines followed by JSON: keep the comments when rewriting. */
function readCopilotConfig(home: string): CopilotConfig {
  const file = path.join(home, '.copilot', 'config.json');
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { /* new file */ }
  const lines = text.split(/\r?\n/);
  const header: string[] = [];
  while (lines.length && /^\s*\/\//.test(lines[0])) header.push(lines.shift()!);
  let json: any = {};
  try { json = JSON.parse(lines.join('\n') || '{}'); } catch { throw new Error(`Could not parse ${file}; not changing it.`); }
  return { header: header.join('\n'), json, file };
}

function writeCopilotConfig(c: CopilotConfig): void {
  fs.mkdirSync(path.dirname(c.file), { recursive: true });
  const body = JSON.stringify(c.json, null, 2);
  const tmp = c.file + '.tmp';
  fs.writeFileSync(tmp, (c.header ? c.header + '\n' : '') + body + '\n', 'utf8');
  fs.renameSync(tmp, c.file);
}

/** Copilot CLI's own trust list. Returns whether the file changed. */
export function addCopilotTrustedFolder(folder: string, home: string = os.homedir()): { changed: boolean; file: string } {
  const c = readCopilotConfig(home);
  const list: string[] = Array.isArray(c.json.trustedFolders) ? c.json.trustedFolders : [];
  if (list.some(f => same(f, folder))) return { changed: false, file: c.file };
  c.json.trustedFolders = [...list, folder];
  writeCopilotConfig(c);
  return { changed: true, file: c.file };
}

export function removeCopilotTrustedFolder(folder: string, home: string = os.homedir()): { changed: boolean; file: string } {
  const c = readCopilotConfig(home);
  const list: string[] = Array.isArray(c.json.trustedFolders) ? c.json.trustedFolders : [];
  const next = list.filter(f => !same(f, folder));
  if (next.length === list.length) return { changed: false, file: c.file };
  c.json.trustedFolders = next;
  writeCopilotConfig(c);
  return { changed: true, file: c.file };
}

export function copilotTrusts(folder: string, home: string = os.homedir()): boolean {
  try {
    const c = readCopilotConfig(home);
    return Array.isArray(c.json.trustedFolders) && c.json.trustedFolders.some((f: string) => same(f, folder));
  } catch { return false; }
}
