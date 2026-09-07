import * as path from 'path';
import { DelegationPackage } from '../context/contextPackager';

export interface ScopeValidationResult {
  valid: boolean;
  violatedFiles: string[];
  reason?: string;
}

export class DelegationProtocol {
  /**
   * Matches a normalized relative file path against an allowed scope pattern.
   * Supports:
   * - Exact matches: "src/Feature.ts"
   * - Directory prefixes: "src/**" or "src/"
   * - Extension wildcards: "*.ts" or "**\/*.ts"
   */
  public static matchesScope(filePath: string, pattern: string): boolean {
    const normPath = filePath.replace(/\\/g, '/');
    const normPattern = pattern.replace(/\\/g, '/');

    if (normPattern === '*' || normPattern === '**' || normPattern === '**/*') {
      return true;
    }

    if (normPath === normPattern) {
      return true;
    }

    // Directory prefix match: e.g. "src/" or "src/**"
    if (normPattern.endsWith('/**')) {
      const prefix = normPattern.slice(0, -3);
      return normPath.startsWith(prefix + '/');
    }
    if (normPattern.endsWith('/')) {
      return normPath.startsWith(normPattern);
    }

    // Extension match: e.g. "*.ts" or "**/*.ts"
    if (normPattern.startsWith('*.') || normPattern.startsWith('**/*.')) {
      const ext = normPattern.split('.').pop();
      return normPath.endsWith(`.${ext}`);
    }

    // Simple filename match: e.g. "Feature.ts" matches any "*/Feature.ts"
    if (!normPattern.includes('/')) {
      const baseName = path.basename(normPath);
      return baseName === normPattern;
    }

    return false;
  }

  /**
   * Validates that all modified files in a worker's attempt strictly conform to the allowedScope.
   */
  public static validateScope(
    modifiedFiles: string[],
    allowedScope: string[],
    workspaceRoot?: string
  ): ScopeValidationResult {
    if (!allowedScope || allowedScope.length === 0) {
      // Empty scope means unconstrained
      return { valid: true, violatedFiles: [] };
    }

    const violatedFiles: string[] = [];

    for (const file of modifiedFiles) {
      let relPath = file;
      if (workspaceRoot && path.isAbsolute(file)) {
        relPath = path.relative(workspaceRoot, file);
      }
      relPath = relPath.replace(/\\/g, '/');

      const matchesAny = allowedScope.some(pattern => this.matchesScope(relPath, pattern));
      if (!matchesAny) {
        violatedFiles.push(relPath);
      }
    }

    if (violatedFiles.length > 0) {
      return {
        valid: false,
        violatedFiles,
        reason: `Scope expansion detected: Worker modified file(s) outside allowedScope [${allowedScope.join(', ')}]: ${violatedFiles.join(', ')}`
      };
    }

    return { valid: true, violatedFiles: [] };
  }

  /**
   * Extracts list of changed files from a unified diff string.
   */
  public static extractFilesFromDiff(diff: string): string[] {
    const files = new Set<string>();
    const lines = diff.split('\n');

    for (const line of lines) {
      if (line.startsWith('--- a/') || line.startsWith('+++ b/')) {
        const file = line.substring(6).trim();
        if (file && file !== '/dev/null') {
          files.add(file);
        }
      }
    }

    return Array.from(files);
  }
}
