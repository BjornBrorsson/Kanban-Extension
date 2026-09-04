import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Board, Ticket, MultiBoardOverview } from './types';
import { BoardDiscovery } from './boardDiscovery';
import { TicketParser } from './ticketParser';

export class BoardManager {
  private static instance: BoardManager;
  private boards: Map<string, Board> = new Map();
  private watchers: vscode.FileSystemWatcher[] = [];
  private changeEmitter = new vscode.EventEmitter<Board | null>();
  public readonly onDidChangeBoard = this.changeEmitter.event;

  private debounceTimer: NodeJS.Timeout | null = null;

  public static getInstance(): BoardManager {
    if (!this.instance) {
      this.instance = new BoardManager();
    }
    return this.instance;
  }

  public async reloadBoards(): Promise<Board[]> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      this.boards.clear();
      return [];
    }

    const discovered = await BoardDiscovery.discoverBoards(folders);
    this.boards.clear();
    for (const b of discovered) {
      this.boards.set(b.id, b);
    }

    return discovered;
  }

  public getAllBoards(): Board[] {
    return Array.from(this.boards.values());
  }

  public getBoard(idOrRoot: string): Board | undefined {
    if (!idOrRoot) return undefined;
    if (this.boards.has(idOrRoot)) {
      return this.boards.get(idOrRoot);
    }
    try {
      const normalizedKey = Buffer.from(path.resolve(idOrRoot).toLowerCase()).toString('base64url');
      if (this.boards.has(normalizedKey)) {
        return this.boards.get(normalizedKey);
      }
    } catch {}
    // Search by rootPath
    for (const b of this.boards.values()) {
      if (
        b.id === idOrRoot ||
        b.rootPath.toLowerCase() === idOrRoot.toLowerCase() ||
        path.resolve(b.rootPath).toLowerCase() === path.resolve(idOrRoot).toLowerCase()
      ) {
        return b;
      }
    }
    return undefined;
  }

  public getMultiBoardOverview(): MultiBoardOverview {
    const boardsList = this.getAllBoards();
    let totalTickets = 0;
    let ongoingTicketsCount = 0;
    let blockedTicketsCount = 0;
    let assistanceRequiredCount = 0;

    const activeTickets: { ticket: Ticket; boardId: string; boardName: string }[] = [];
    const boardsSummary = boardsList.map(b => {
      const colSummary: { [col: string]: number } = {};
      let bTicketCount = 0;

      for (const col of b.columns) {
        const count = col.tickets.length;
        colSummary[col.name] = count;
        bTicketCount += count;
        totalTickets += count;

        const colLower = col.name.toLowerCase();
        if (colLower.includes('ongoing') || colLower.includes('in progress')) {
          ongoingTicketsCount += count;
          col.tickets.forEach(t => activeTickets.push({ ticket: t, boardId: b.id, boardName: b.name }));
        } else if (colLower.includes('blocked')) {
          blockedTicketsCount += count;
        } else if (colLower.includes('assistance')) {
          assistanceRequiredCount += count;
          col.tickets.forEach(t => activeTickets.push({ ticket: t, boardId: b.id, boardName: b.name }));
        }
      }

      return {
        id: b.id,
        name: b.name,
        rootPath: b.rootPath,
        ticketCount: bTicketCount,
        columnsSummary: colSummary
      };
    });

    return {
      totalBoards: boardsList.length,
      totalTickets,
      ongoingTicketsCount,
      blockedTicketsCount,
      assistanceRequiredCount,
      boards: boardsSummary,
      activeTickets
    };
  }

  public findBoardForTicketPath(ticketPath: string): Board | undefined {
    if (!ticketPath) return undefined;
    const resolved = path.resolve(ticketPath).toLowerCase();
    for (const board of this.boards.values()) {
      const boardRoot = path.resolve(board.rootPath).toLowerCase();
      if (resolved.startsWith(boardRoot)) {
        return board;
      }
    }
    // Search all boards by filename if path might have moved
    for (const board of this.boards.values()) {
      const source = this.resolveTicketPathOnDisk(board, ticketPath);
      if (source) {
        return board;
      }
    }
    return undefined;
  }

  public resolveTicketPathOnDisk(board: Board, ticketPath: string): string | null {
    if (!ticketPath) return null;
    const resolved = path.resolve(ticketPath);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
    // Also try resolving relative to board.rootPath
    const relToBoard = path.resolve(board.rootPath, ticketPath);
    if (fs.existsSync(relToBoard)) {
      return relToBoard;
    }
    // Search board root for matching filename
    const targetFilename = path.basename(ticketPath).toLowerCase();
    const searchInDir = (dir: string): string | null => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
              const res = searchInDir(full);
              if (res) return res;
            }
          } else if (entry.name.toLowerCase() === targetFilename) {
            return full;
          }
        }
      } catch {}
      return null;
    };
    return searchInDir(board.rootPath);
  }

  public async moveTicket(
    boardId: string,
    ticketPath: string,
    targetColumn: string,
    targetSubfolder: string | null
  ): Promise<boolean> {
    let board = this.getBoard(boardId);
    if (!board || (ticketPath && !path.resolve(ticketPath).toLowerCase().startsWith(path.resolve(board.rootPath).toLowerCase()))) {
      const candidate = this.findBoardForTicketPath(ticketPath);
      if (candidate) {
        board = candidate;
      }
    }
    if (!board) {
      vscode.window.showErrorMessage(`Board not found: ${boardId}`);
      return false;
    }

    const sourcePath = this.resolveTicketPathOnDisk(board, ticketPath);
    if (!sourcePath) {
      vscode.window.showErrorMessage(`Ticket file not found on disk: ${ticketPath}`);
      return false;
    }

    const filename = path.basename(sourcePath);
    let targetDir = path.join(board.rootPath, targetColumn);
    if (targetSubfolder) {
      targetDir = path.join(targetDir, targetSubfolder);
    }

    if (!fs.existsSync(targetDir)) {
      await fs.promises.mkdir(targetDir, { recursive: true });
    }

    const targetPath = path.join(targetDir, filename);
    if (path.resolve(targetPath).toLowerCase() === path.resolve(sourcePath).toLowerCase()) {
      return true; // Already in destination
    }

    try {
      // 1. Move file with fallback
      try {
        await vscode.workspace.fs.rename(vscode.Uri.file(sourcePath), vscode.Uri.file(targetPath), { overwrite: true });
      } catch (fsErr) {
        await fs.promises.rename(sourcePath, targetPath);
      }
      console.log(`[Agentic Kanban] Successfully moved ticket "${filename}" to "${targetColumn}${targetSubfolder ? '/' + targetSubfolder : ''}"`);

      // 2. Optionally update internal status
      const autoUpdate = board.config.autoUpdateStatus;
      if (autoUpdate) {
        try {
          const content = await fs.promises.readFile(targetPath, 'utf8');
          const updated = TicketParser.updateTicketStatus(content, targetColumn);
          if (updated !== content) {
            await fs.promises.writeFile(targetPath, updated, 'utf8');
          }
        } catch (e) {
          console.warn('Could not update status field in ticket content:', e);
        }
      }

      // Reload board to reflect change
      await this.reloadSingleBoard(board.rootPath);
      return true;
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to move ticket: ${err?.message || err}`);
      return false;
    }
  }

  public async assignTicket(
    boardId: string,
    ticketPath: string,
    assigneeName: string
  ): Promise<boolean> {
    let board = this.getBoard(boardId);
    if (!board || (ticketPath && !path.resolve(ticketPath).toLowerCase().startsWith(path.resolve(board.rootPath).toLowerCase()))) {
      const candidate = this.findBoardForTicketPath(ticketPath);
      if (candidate) {
        board = candidate;
      }
    }
    if (!board) {
      vscode.window.showErrorMessage(`Board not found: ${boardId}`);
      return false;
    }

    const sourcePath = this.resolveTicketPathOnDisk(board, ticketPath);
    if (!sourcePath) {
      vscode.window.showErrorMessage(`Ticket file not found on disk: ${ticketPath}`);
      return false;
    }

    try {
      const content = await fs.promises.readFile(sourcePath, 'utf8');
      const updated = TicketParser.updateTicketAssignee(content, assigneeName);
      if (updated !== content) {
        await fs.promises.writeFile(sourcePath, updated, 'utf8');
        console.log(`[Agentic Kanban] Successfully wrote assignment "${assigneeName}" to ${sourcePath}`);
      }
      await this.reloadSingleBoard(board.rootPath);
      return true;
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to assign ticket: ${err?.message || err}`);
      return false;
    }
  }

  public async createTicket(
    boardId: string,
    targetColumn: string,
    targetSubfolder: string | null,
    title: string,
    initialContent?: string
  ): Promise<string | null> {
    const board = this.getBoard(boardId);
    if (!board) return null;

    let targetDir = path.join(board.rootPath, targetColumn);
    if (targetSubfolder) {
      targetDir = path.join(targetDir, targetSubfolder);
    }

    if (!fs.existsSync(targetDir)) {
      await fs.promises.mkdir(targetDir, { recursive: true });
    }

    // Generate clean filename
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 40);
    const dateStr = new Date().toISOString().slice(0, 10);
    let filename = `ticket-${dateStr}-${slug}.md`;
    let fullPath = path.join(targetDir, filename);

    // Deduplicate filename if exists
    let counter = 1;
    while (fs.existsSync(fullPath)) {
      filename = `ticket-${dateStr}-${slug}-${counter}.md`;
      fullPath = path.join(targetDir, filename);
      counter++;
    }

    const defaultContent = initialContent || `# ${title}

| Field | Value |
|-------|-------|
| **Priority** | Normal |
| **Status** | ${targetColumn} |
| **Labels** | |

## Summary
Describe what this ticket is about.

## Acceptance Criteria
- [ ] Requirements defined
- [ ] Implementation completed
- [ ] Tests verified
`;

    await fs.promises.writeFile(fullPath, defaultContent, 'utf8');
    await this.reloadSingleBoard(board.rootPath);
    return fullPath;
  }

  public async reloadSingleBoard(rootPath: string): Promise<Board | null> {
    const config = vscode.workspace.getConfiguration('agenticKanban');
    const ignoredFiles = config.get<string[]>('ignoredFiles', []).map(f => f.toLowerCase());
    const updated = await BoardDiscovery.buildBoard(rootPath, ignoredFiles);
    if (updated) {
      this.boards.set(updated.id, updated);
      this.changeEmitter.fire(updated);
      return updated;
    }
    return null;
  }

  public setupWatchers(context: vscode.ExtensionContext): void {
    // Watch markdown files across the workspace
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.md');

    const handleFileChange = (uri: vscode.Uri) => {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
      this.debounceTimer = setTimeout(async () => {
        // Find which board this file belongs to
        const filePath = uri.fsPath;
        for (const board of this.boards.values()) {
          if (filePath.startsWith(board.rootPath)) {
            await this.reloadSingleBoard(board.rootPath);
            return;
          }
        }
        // If not in known boards, maybe a new board or file was added, reload all
        await this.reloadBoards();
        this.changeEmitter.fire(null);
      }, 300);
    };

    watcher.onDidCreate(handleFileChange);
    watcher.onDidChange(handleFileChange);
    watcher.onDidDelete(handleFileChange);

    this.watchers.push(watcher);
    context.subscriptions.push(watcher);
  }
}
