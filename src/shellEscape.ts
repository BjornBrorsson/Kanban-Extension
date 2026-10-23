export type ShellKind = 'powershell' | 'cmd' | 'posix';

/** Picks the escaping dialect from a shell executable path/name (e.g. vscode.env.shell). */
export function detectShellKind(shellPath?: string, platform: string = process.platform): ShellKind {
  const name = (shellPath || '').split(/[\\/]/).pop()?.toLowerCase() || '';
  if (name.includes('pwsh') || name.includes('powershell')) return 'powershell';
  if (name === 'cmd.exe' || name === 'cmd') return 'cmd';
  if (name) return 'posix';
  return platform === 'win32' ? 'powershell' : 'posix';
}

/**
 * Escapes arbitrary text for safe embedding INSIDE a double-quoted string in the given shell.
 * Newlines/control characters are flattened so a ticket cannot terminate the command line.
 */
export function escapeForDoubleQuotes(value: string, shell: ShellKind): string {
  const flat = String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '');
  switch (shell) {
    case 'powershell':
      // In PowerShell double quotes the escape char is the backtick; `$` starts expansion/subexpressions.
      return flat.replace(/[`$"“”„]/g, ch => '`' + ch);
    case 'cmd':
      return flat.replace(/"/g, '""').replace(/%/g, '%%');
    default:
      return flat.replace(/[\\"$`!]/g, ch => '\\' + ch);
  }
}
