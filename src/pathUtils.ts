import * as path from 'path';

const CASE_INSENSITIVE = process.platform === 'win32' || process.platform === 'darwin';

function norm(p: string): string {
  const resolved = path.resolve(p);
  return CASE_INSENSITIVE ? resolved.toLowerCase() : resolved;
}

/** True if `candidate` is `root` itself or lives under it (separator-aware, case-insensitive on Windows/macOS). */
export function isInside(root: string, candidate: string): boolean {
  if (!root || !candidate) return false;
  const r = norm(root);
  const c = norm(candidate);
  if (c === r) return true;
  const prefix = r.endsWith(path.sep) ? r : r + path.sep;
  return c.startsWith(prefix);
}

/**
 * Joins path segments under `root`, returning null when any segment would escape it
 * (`..`, absolute paths, drive letters). Used for webview-supplied column/subfolder names.
 */
export function safeJoin(root: string, ...segments: (string | null | undefined)[]): string | null {
  let current = path.resolve(root);
  for (const seg of segments) {
    if (seg === null || seg === undefined || seg === '') continue;
    if (path.isAbsolute(seg) || /^[a-zA-Z]:/.test(seg)) return null;
    current = path.resolve(current, seg);
  }
  return isInside(root, current) ? current : null;
}

/** Lowercase ASCII slug; folds accents (å→a, é→e) so non-English titles keep a readable name. */
export function slugify(title: string, maxLen = 40): string {
  const slug = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLen)
    .replace(/-$/, '');
  return slug || 'untitled';
}
