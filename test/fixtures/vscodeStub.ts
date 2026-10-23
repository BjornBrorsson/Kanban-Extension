// Minimal `vscode` stand-in so BoardManager can run under plain node in tests.
import * as fs from 'fs';

export const messages: { level: string; text: string }[] = [];

export class EventEmitter<T> {
  private fns: ((e: T) => void)[] = [];
  public event = (fn: (e: T) => void) => { this.fns.push(fn); return { dispose() {} }; };
  public fire(e: T) { this.fns.forEach(f => f(e)); }
}

export const Uri = { file: (p: string) => ({ fsPath: p, scheme: 'file' }) };

export const workspace = {
  workspaceFolders: undefined as any,
  getConfiguration: () => ({ get: (_k: string, d: any) => d }),
  fs: {
    rename: async (a: { fsPath: string }, b: { fsPath: string }, opts?: { overwrite?: boolean }) => {
      if (!opts?.overwrite && fs.existsSync(b.fsPath)) throw new Error('exists');
      fs.renameSync(a.fsPath, b.fsPath);
    }
  },
  createFileSystemWatcher: () => ({ onDidCreate() {}, onDidChange() {}, onDidDelete() {}, dispose() {} })
};

export const window = {
  showErrorMessage: (text: string) => { messages.push({ level: 'error', text }); },
  showWarningMessage: (text: string) => { messages.push({ level: 'warn', text }); },
  showInformationMessage: (text: string) => { messages.push({ level: 'info', text }); }
};

export const env = { shell: '' };
export class RelativePattern { constructor(public base: any, public pattern: string) {} }
export const FileType = { Directory: 2, File: 1 };
