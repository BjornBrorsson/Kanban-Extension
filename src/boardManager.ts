import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Board, Ticket, MultiBoardOverview, WorkLogEntry } from './types';
import { BoardDiscovery } from './boardDiscovery';
import { TicketParser } from './ticketParser';
import { isInside, safeJoin, slugify } from './pathUtils';

export class BoardManager {
  private static instance: BoardManager;
  private boards: Map<string, Board> = new Map();
  private watchers: vscode.FileSystemWatcher[] = [];
  private changeEmitter = new vscode.EventEmitter<Board | null>();
  public readonly onDidChangeBoard = this.changeEmitter.event;

  private debounceTimer: NodeJS.Timeout | null = null;
  private pendingFiles: Set<string> = new Set();
  private workLogCache: Map<string, { mtime: number; logs: WorkLogEntry[] }> = new Map();

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
    let blockedByDependencyCount = 0;

    const recentWorkLogs: WorkLogEntry[] = [];
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

        // Check blockers and work logs on all tickets
        for (const t of col.tickets) {
          if (t.unresolvedDependencies && t.unresolvedDependencies.length > 0) {
            blockedByDependencyCount++;
          }

          if (t.hasWorkLog) {
            const cached = this.workLogCache.get(t.path);
            if (cached && cached.mtime === t.mtime) {
              recentWorkLogs.push(...cached.logs);
            } else {
              try {
                const fileContent = fs.readFileSync(t.path, 'utf8');
                const logs = TicketParser.extractWorkLogEntries(fileContent, t.id, t.title, t.path, b.id, b.name);
                this.workLogCache.set(t.path, { mtime: t.mtime, logs });
                recentWorkLogs.push(...logs);
              } catch {}
            }
          }
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

    // Sort work logs newest first
    recentWorkLogs.sort((a, b) => {
      const timeA = a.timestamp || (a.date ? Date.parse(a.date) : 0) || 0;
      const timeB = b.timestamp || (b.date ? Date.parse(b.date) : 0) || 0;
      return timeB - timeA;
    });

    return {
      totalBoards: boardsList.length,
      totalTickets,
      ongoingTicketsCount,
      blockedTicketsCount,
      assistanceRequiredCount,
      blockedByDependencyCount,
      recentWorkLogs,
      boards: boardsSummary,
      activeTickets
    };
  }

  public findBoardForTicketPath(ticketPath: string): Board | undefined {
    if (!ticketPath) return undefined;
    for (const board of this.boards.values()) {
      if (isInside(board.rootPath, ticketPath)) {
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
    if (!board || (ticketPath && !isInside(board.rootPath, ticketPath))) {
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
    // Column/subfolder names come from the webview: never let them escape the board root.
    const targetDir = safeJoin(board.rootPath, targetColumn, targetSubfolder);
    if (!targetDir || path.resolve(targetDir) === path.resolve(board.rootPath)) {
      vscode.window.showErrorMessage(`Invalid target column: ${targetColumn}`);
      return false;
    }

    if (!fs.existsSync(targetDir)) {
      await fs.promises.mkdir(targetDir, { recursive: true });
    }

    const targetPath = path.join(targetDir, filename);
    if (path.resolve(targetPath).toLowerCase() === path.resolve(sourcePath).toLowerCase()) {
      return true; // Already in destination
    }
    if (fs.existsSync(targetPath)) {
      vscode.window.showErrorMessage(`Cannot move "${filename}": a ticket with that name already exists in ${targetColumn}${targetSubfolder ? '/' + targetSubfolder : ''}.`);
      return false;
    }

    try {
      // 1. Move file with fallback (never overwrite an existing ticket)
      try {
        await vscode.workspace.fs.rename(vscode.Uri.file(sourcePath), vscode.Uri.file(targetPath), { overwrite: false });
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
    if (!board || (ticketPath && !isInside(board.rootPath, ticketPath))) {
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

  public async toggleTicketCriterion(
    ticketPath: string,
    index: number,
    done: boolean
  ): Promise<boolean> {
    const board = this.findBoardForTicketPath(ticketPath);
    const resolvedPath = board
      ? this.resolveTicketPathOnDisk(board, ticketPath)
      : (fs.existsSync(ticketPath) ? ticketPath : null);

    if (!resolvedPath) {
      vscode.window.showErrorMessage(`Ticket file not found: ${ticketPath}`);
      return false;
    }

    try {
      const content = await fs.promises.readFile(resolvedPath, 'utf8');
      const updated = TicketParser.toggleCriterion(content, index, done);
      if (updated !== content) {
        await fs.promises.writeFile(resolvedPath, updated, 'utf8');
      }
      if (board) {
        await this.reloadSingleBoard(board.rootPath);
      }
      return true;
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to update acceptance criterion: ${err?.message || err}`);
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

    const targetDir = safeJoin(board.rootPath, targetColumn, targetSubfolder);
    if (!targetDir || path.resolve(targetDir) === path.resolve(board.rootPath)) {
      vscode.window.showErrorMessage(`Invalid target column: ${targetColumn}`);
      return null;
    }

    if (!fs.existsSync(targetDir)) {
      await fs.promises.mkdir(targetDir, { recursive: true });
    }

    // Generate clean filename (accent-folded so non-English titles stay readable)
    const slug = slugify(title);
    const dateStr = new Date().toISOString().slice(0, 10);
    let filename = `ticket-${dateStr}-${slug}.md`;
    let fullPath = path.join(targetDir, filename);

    // Deduplicate filename if exists
    let counter = 1;
    let idSuffix = '';
    while (fs.existsSync(fullPath)) {
      filename = `ticket-${dateStr}-${slug}-${counter}.md`;
      idSuffix = `-${counter}`;
      fullPath = path.join(targetDir, filename);
      counter++;
    }

    let defaultContent = initialContent;
    if (defaultContent) {
      const generatedId = `T-${slug.toUpperCase()}${idSuffix}`;
      defaultContent = defaultContent
        .split('{id}').join(generatedId)
        .split('{title}').join(title)
        .split('{column}').join(targetColumn)
        .split('{date}').join(dateStr)
        .split('{user}').join('Unassigned')
        .split('{assignee}').join('Unassigned');
    } else {
      defaultContent = `# ${title}

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
    }

    await fs.promises.writeFile(fullPath, defaultContent, 'utf8');
    await this.reloadSingleBoard(board.rootPath);
    return fullPath;
  }

  public async generateAgentRules(boardId?: string): Promise<{ targetPath: string; created: boolean; content: string } | null> {
    let board = boardId ? this.getBoard(boardId) : undefined;
    if (!board) {
      const boards = this.getAllBoards();
      if (boards.length > 0) board = boards[0];
    }
    if (!board) {
      vscode.window.showWarningMessage('No active Kanban board found to generate agent rules.');
      return null;
    }

    const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || path.dirname(board.rootPath);
    const agentsDir = path.join(wsFolder, '.agents');
    let targetPath = path.join(wsFolder, 'AGENTS.md');
    if (fs.existsSync(agentsDir)) {
      const rulesDir = path.join(agentsDir, 'rules');
      if (!fs.existsSync(rulesDir)) {
        await fs.promises.mkdir(rulesDir, { recursive: true });
      }
      targetPath = path.join(rulesDir, 'kanban.md');
    } else if (fs.existsSync(path.join(wsFolder, 'AGENT.md')) && !fs.existsSync(path.join(wsFolder, 'AGENTS.md'))) {
      targetPath = path.join(wsFolder, 'AGENT.md');
    }

    const relBoardPath = path.relative(wsFolder, board.rootPath).replace(/\\/g, '/') || 'Tickets';
    const colsList = board.columns.map(c => `- \`${relBoardPath}/${c.name}/\``).join('\n');
    const content = `# Project Operating Rules: Agentic Kanban

This project uses **Agentic Kanban** for task management. All tasks, features, and defects are tracked as Markdown files inside the board directory: \`${relBoardPath}/\`.

## Board Structure & Columns
${colsList}

## Agent Operating Workflow
1. **Discover & Inspect**:
   - Look in \`${relBoardPath}/Backlog/\` (or \`${relBoardPath}/Backlog/Ready/\`) for assigned or available tasks.
   - Check \`| **Depends on** |\` field: do not proceed if prerequisite tickets are not yet in \`${relBoardPath}/Completed/\`.
2. **Claim a Ticket**:
   - Move the ticket file into \`${relBoardPath}/Ongoing/\` (prefer \`git mv\` to preserve history).
   - Set the \`| **Assignee** | <YourName> |\` and \`| **Status** | Ongoing |\` in the ticket metadata table.
   - Add an initial timestamped entry under \`## Work Log\`.
3. **Specify Requirements (if needed)**:
   - Ensure the ticket has a clear summary, technical specification, and structured acceptance criteria with checkboxes (\`- [ ]\`).
4. **Log Progress in Real-Time**:
   - In the ticket file under \`## Work Log\`, append timestamped entries for key steps, investigations, and decisions:
     \`\`\`markdown
     - **YYYY-MM-DD**: Started investigation of ...
     \`\`\`
   - Work logs are append-only; never delete previous entries.
5. **Complete Criteria & Verify**:
   - Check off each criterion under \`## Acceptance Criteria\` by toggling \`- [ ]\` to \`- [x]\`.
   - Run tests, builds, and static analysis to guarantee zero regressions.
6. **Finalize**:
   - Move the ticket file to \`${relBoardPath}/Completed/\`.
   - Update the status field to \`Completed\`.
   - Record a final verification log in \`## Work Log\`.
7. **Blockers & Assistance**:
   - If blocked by human review, credentials, or questions, move ticket to \`${relBoardPath}/Assistance Required/\`.
   - If blocked by dependencies or external factors, move ticket to \`${relBoardPath}/Blocked/\`.
   - Clearly document the blocking factor in \`## Work Log\`.
`;

    return { targetPath, created: !fs.existsSync(targetPath), content };
  }

  public async initTemplates(boardId?: string): Promise<string[] | null> {
    let board = boardId ? this.getBoard(boardId) : undefined;
    if (!board) {
      const boards = this.getAllBoards();
      if (boards.length > 0) board = boards[0];
    }
    if (!board) {
      vscode.window.showWarningMessage('No Kanban board found to initialize templates.');
      return null;
    }

    const templatesDir = path.join(board.rootPath, '.templates');
    if (!fs.existsSync(templatesDir)) {
      await fs.promises.mkdir(templatesDir, { recursive: true });
    }

    const created: string[] = [];

    const featurePath = path.join(templatesDir, 'feature.md');
    if (!fs.existsSync(featurePath)) {
      const featureContent = `# {id} — {title}

| Field | Value |
|-------|-------|
| **Epic** | |
| **Type** | Feature |
| **Priority** | P1 — Core |
| **Estimate** | M (2–3 days) |
| **Status** | {column} |
| **Depends on** | — |
| **Blocks** | — |
| **Labels** | |
| **Milestone** | |

## Summary
Brief description of the feature and what user problem it solves.

## Description
Detailed background, UX requirements, architecture decisions, and implementation outline.

## Acceptance Criteria
- [ ] Requirements defined and reviewed
- [ ] Core implementation complete
- [ ] Unit & integration tests added and passing
- [ ] Documentation updated

## Technical Notes
- Implementation details and architectural guidelines.

## Work Log
- **{date}**: Created ticket.
`;
      await fs.promises.writeFile(featurePath, featureContent, 'utf8');
      created.push('feature.md');
    }

    const bugPath = path.join(templatesDir, 'bug.md');
    if (!fs.existsSync(bugPath)) {
      const bugContent = `# {id} — Fix: {title}

| Field | Value |
|-------|-------|
| **Epic** | |
| **Type** | Defect / Bug |
| **Priority** | P0 — Critical |
| **Estimate** | S (1 day) |
| **Status** | {column} |
| **Depends on** | — |
| **Blocks** | — |
| **Labels** | \`bug\`, \`fix\` |
| **Milestone** | |

## Summary
Brief description of the bug and its impact.

## Steps to Reproduce
1. Step 1
2. Step 2
3. Observe unexpected behavior

## Expected vs Actual Behavior
- **Expected**: Describe expected behavior.
- **Actual**: Describe actual observed error or failure.

## Acceptance Criteria
- [ ] Root cause diagnosed and resolved
- [ ] Regression test added
- [ ] Verified fix passes all existing test suites

## Work Log
- **{date}**: Logged bug.
`;
      await fs.promises.writeFile(bugPath, bugContent, 'utf8');
      created.push('bug.md');
    }

    await this.reloadSingleBoard(board.rootPath);
    return created;
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
      if (/[\\/](node_modules|\.git)[\\/]/.test(uri.fsPath)) return;
      // Collect every changed file in the debounce window: a single shared timer must not drop other boards' events.
      this.pendingFiles.add(uri.fsPath);
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
      this.debounceTimer = setTimeout(async () => {
        const files = Array.from(this.pendingFiles);
        this.pendingFiles.clear();
        const boardRoots = new Set<string>();
        let unknown = false;
        for (const filePath of files) {
          const owner = Array.from(this.boards.values()).find(b => isInside(b.rootPath, filePath));
          if (owner) boardRoots.add(owner.rootPath);
          else unknown = true;
        }
        for (const root of boardRoots) {
          await this.reloadSingleBoard(root);
        }
        if (unknown) {
          // A new board or a file outside known boards: rediscover everything
          await this.reloadBoards();
          this.changeEmitter.fire(null);
        }
      }, 300);
    };

    watcher.onDidCreate(handleFileChange);
    watcher.onDidChange(handleFileChange);
    watcher.onDidDelete(handleFileChange);

    this.watchers.push(watcher);
    context.subscriptions.push(watcher);
  }
}
