import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface SourceFileRef {
  relativePath: string;
  mtimeMs: number;
  sha256?: string;
}

export interface KnowledgeNoteMeta {
  noteName: string;
  generatedAt: number;
  sourceFiles: SourceFileRef[];
}

export interface CompletedTicketOutcome {
  ticketId: string;
  attemptId: string;
  timestamp: number;
  summary: string;
  filesModified: string[];
  testPassed: boolean;
  costReported: number;
}

export class KnowledgeStore {
  private readonly contextRootDir: string;

  constructor(private readonly workspaceRoot: string) {
    this.contextRootDir = path.join(this.workspaceRoot, '.agentic-kanban', 'context');
    if (!fs.existsSync(this.contextRootDir)) {
      fs.mkdirSync(this.contextRootDir, { recursive: true });
    }
  }

  public getBoardDir(boardId: string): string {
    const dir = path.join(this.contextRootDir, boardId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  /**
   * Saves a curated knowledge note along with its source file references for invalidation tracking.
   */
  public saveNote(boardId: string, noteName: string, content: string, sourceFiles: string[] = []): void {
    const boardDir = this.getBoardDir(boardId);
    const notePath = path.join(boardDir, noteName);
    const metaPath = path.join(boardDir, `${noteName}.meta.json`);

    fs.writeFileSync(notePath, content, 'utf8');

    const refs: SourceFileRef[] = sourceFiles.map(file => {
      const absPath = path.isAbsolute(file) ? file : path.join(this.workspaceRoot, file);
      const rel = path.relative(this.workspaceRoot, absPath);
      let mtime = 0;
      let sha = '';
      if (fs.existsSync(absPath)) {
        const stat = fs.statSync(absPath);
        mtime = stat.mtimeMs;
        const buf = fs.readFileSync(absPath);
        sha = crypto.createHash('sha256').update(buf).digest('hex');
      }
      return { relativePath: rel, mtimeMs: mtime, sha256: sha };
    });

    const meta: KnowledgeNoteMeta = {
      noteName,
      generatedAt: Date.now(),
      sourceFiles: refs
    };

    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  }

  /**
   * Retrieves note content if cache is valid. Returns null if note does not exist or cache is invalidated.
   */
  public getNote(boardId: string, noteName: string): string | null {
    if (!this.isCacheValid(boardId, noteName)) {
      return null;
    }
    const notePath = path.join(this.getBoardDir(boardId), noteName);
    return fs.readFileSync(notePath, 'utf8');
  }

  /**
   * Checks whether the note's cached content is still valid against source files on disk.
   */
  public isCacheValid(boardId: string, noteName: string): boolean {
    const boardDir = this.getBoardDir(boardId);
    const notePath = path.join(boardDir, noteName);
    const metaPath = path.join(boardDir, `${noteName}.meta.json`);

    if (!fs.existsSync(notePath) || !fs.existsSync(metaPath)) {
      return false;
    }

    try {
      const meta: KnowledgeNoteMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      for (const ref of meta.sourceFiles) {
        const absPath = path.join(this.workspaceRoot, ref.relativePath);
        if (!fs.existsSync(absPath)) {
          return false; // Source file was deleted -> invalid
        }
        const currentStat = fs.statSync(absPath);
        if (currentStat.mtimeMs > ref.mtimeMs) {
          // Verify with hash to avoid false invalidation on timestamp-only touches
          if (ref.sha256) {
            const currentHash = crypto.createHash('sha256').update(fs.readFileSync(absPath)).digest('hex');
            if (currentHash !== ref.sha256) {
              return false;
            }
          } else {
            return false;
          }
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Records a completed ticket outcome into the board's outcomes log.
   */
  public appendTicketOutcome(boardId: string, outcome: CompletedTicketOutcome): void {
    const boardDir = this.getBoardDir(boardId);
    const outcomesPath = path.join(boardDir, 'completed-ticket-outcomes.jsonl');
    fs.appendFileSync(outcomesPath, JSON.stringify(outcome) + '\n', 'utf8');
  }

  /**
   * Retrieves all completed ticket outcomes for a board.
   */
  public getTicketOutcomes(boardId: string): CompletedTicketOutcome[] {
    const outcomesPath = path.join(this.getBoardDir(boardId), 'completed-ticket-outcomes.jsonl');
    if (!fs.existsSync(outcomesPath)) {
      return [];
    }

    const lines = fs.readFileSync(outcomesPath, 'utf8').split('\n').filter(l => l.trim().length > 0);
    return lines.map(line => {
      try {
        return JSON.parse(line) as CompletedTicketOutcome;
      } catch {
        return null;
      }
    }).filter(Boolean) as CompletedTicketOutcome[];
  }
}
