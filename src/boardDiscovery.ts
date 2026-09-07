import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Board, Column, SubfolderInfo, Ticket, BoardConfig, BoardPlanDocument, TicketTemplate } from './types';
import { TicketParser } from './ticketParser';
import { ConfigParser } from './configParser';

export class BoardDiscovery {
  public static async discoverBoards(workspaceFolders: readonly vscode.WorkspaceFolder[]): Promise<Board[]> {
    const boards: Board[] = [];
    const config = vscode.workspace.getConfiguration('agenticKanban');
    const boardPatterns = config.get<string[]>('boardPatterns', ['**/Tickets', '**/tickets', '**/.kanban']);
    const ignoredFiles = config.get<string[]>('ignoredFiles', []).map(f => f.toLowerCase());

    const discoveredRoots = new Set<string>();

    for (const folder of workspaceFolders) {
      // Find candidate directories using glob patterns
      for (const pattern of boardPatterns) {
        const relativePattern = new vscode.RelativePattern(folder, pattern);
        const uris = await vscode.workspace.findFiles(relativePattern, '**/node_modules/**');
        for (const uri of uris) {
          const stat = await vscode.workspace.fs.stat(uri);
          if (stat.type === vscode.FileType.Directory) {
            discoveredRoots.add(uri.fsPath);
          }
        }
      }

      // Also traverse the workspace to find any directory named "Tickets" or containing "config.md"
      await this.scanDirectoryForBoards(folder.uri.fsPath, discoveredRoots, 0);
    }

    // Build Board object for each discovered root
    for (const rootPath of discoveredRoots) {
      try {
        const board = await this.buildBoard(rootPath, ignoredFiles);
        if (board) {
          boards.push(board);
        }
      } catch (err) {
        console.error(`Error building board at ${rootPath}:`, err);
      }
    }

    // Sort boards so that top-level root 'Tickets' boards come first before nested/example boards
    boards.sort((a, b) => {
      const aDepth = a.rootPath.split(/[\\/]/).length;
      const bDepth = b.rootPath.split(/[\\/]/).length;
      if (aDepth !== bDepth) return aDepth - bDepth;
      const aIsExample = a.rootPath.toLowerCase().includes('example');
      const bIsExample = b.rootPath.toLowerCase().includes('example');
      if (aIsExample !== bIsExample) return aIsExample ? 1 : -1;
      return a.name.localeCompare(b.name);
    });

    return boards;
  }

  private static async scanDirectoryForBoards(dirPath: string, discoveredRoots: Set<string>, depth: number): Promise<void> {
    if (depth > 5) return; // Prevent traversing too deep
    if (path.basename(dirPath).startsWith('.') || dirPath.includes('node_modules') || dirPath.includes('dist') || dirPath.includes('out')) {
      return;
    }

    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subPath = path.join(dirPath, entry.name);
          if (entry.name.toLowerCase() === 'tickets') {
            discoveredRoots.add(subPath);
          } else {
            // Check if directory contains config.md with board markers
            const configPath = path.join(subPath, 'config.md');
            if (fs.existsSync(configPath)) {
              discoveredRoots.add(subPath);
            } else {
              await this.scanDirectoryForBoards(subPath, discoveredRoots, depth + 1);
            }
          }
        }
      }
    } catch {
      // Ignore unreadable dirs
    }
  }

  public static async buildBoard(rootPath: string, ignoredFiles: string[]): Promise<Board | null> {
    if (!fs.existsSync(rootPath)) return null;

    const folderName = path.basename(rootPath);
    const parentFolder = path.basename(path.dirname(rootPath));
    const defaultBoardName = parentFolder && parentFolder !== '.' ? `${parentFolder} (${folderName})` : folderName;
    const boardId = Buffer.from(path.resolve(rootPath).toLowerCase()).toString('base64url');

    // 1. Read Board Config
    let boardConfig: BoardConfig = {
      name: defaultBoardName,
      columnsOrder: [],
      autoUpdateStatus: true,
      defaultAgent: null,
      assignees: []
    };

    const configPath = path.join(rootPath, 'config.md');
    if (fs.existsSync(configPath)) {
      try {
        const configContent = await fs.promises.readFile(configPath, 'utf8');
        boardConfig = ConfigParser.parse(configContent, defaultBoardName);
      } catch (e) {
        console.warn(`Could not parse config.md at ${configPath}:`, e);
      }
    }

    // 2. Read 00_Plan.md or project architecture doc if present
    let planDocument: BoardPlanDocument | null = null;
    try {
      const rootFiles = await fs.promises.readdir(rootPath, { withFileTypes: true });
      for (const file of rootFiles) {
        if (!file.isDirectory() && (file.name.startsWith('00_') || file.name.toLowerCase() === 'plan.md')) {
          const filePath = path.join(rootPath, file.name);
          const content = await fs.promises.readFile(filePath, 'utf8');
          planDocument = {
            path: filePath,
            title: file.name.replace(/\.md$/i, ''),
            content
          };
          break;
        }
      }
    } catch {
      // Ignore
    }

    // 3. Discover Columns & Tickets
    const columns: Column[] = [];
    const entries = await fs.promises.readdir(rootPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

      const columnPath = path.join(rootPath, entry.name);
      const columnName = entry.name;
      const columnId = columnName.toLowerCase().replace(/[^a-z0-9_-]/g, '-');

      // Check for Whatwhy.md or README.md in column folder
      let columnGuide: string | null = null;
      const columnWhatwhy = path.join(columnPath, 'Whatwhy.md');
      const columnReadme = path.join(columnPath, 'README.md');
      if (fs.existsSync(columnWhatwhy)) {
        columnGuide = await fs.promises.readFile(columnWhatwhy, 'utf8');
      } else if (fs.existsSync(columnReadme)) {
        columnGuide = await fs.promises.readFile(columnReadme, 'utf8');
      }

      const subfolders: SubfolderInfo[] = [];
      const tickets: Ticket[] = [];

      // Read entries in column
      const colChildren = await fs.promises.readdir(columnPath, { withFileTypes: true });

      for (const child of colChildren) {
        const childPath = path.join(columnPath, child.name);

        if (child.isDirectory()) {
          // Subfolder (e.g. "Needs further specification", "Ready")
          if (child.name.startsWith('.')) continue;

          let subGuide: string | null = null;
          const subWhatwhy = path.join(childPath, 'Whatwhy.md');
          if (fs.existsSync(subWhatwhy)) {
            subGuide = await fs.promises.readFile(subWhatwhy, 'utf8');
          }

          let subTicketCount = 0;
          const subEntries = await fs.promises.readdir(childPath, { withFileTypes: true });
          for (const subChild of subEntries) {
            if (!subChild.isDirectory() && subChild.name.endsWith('.md')) {
              if (this.isIgnoredFile(subChild.name, ignoredFiles)) continue;

              const ticketPath = path.join(childPath, subChild.name);
              const stat = await fs.promises.stat(ticketPath);
              const content = await fs.promises.readFile(ticketPath, 'utf8');
              const ticket = TicketParser.parse(ticketPath, content, rootPath, columnName, child.name, stat.mtimeMs);
              tickets.push(ticket);
              subTicketCount++;
            }
          }

          subfolders.push({
            name: child.name,
            path: childPath,
            whatWhyGuide: subGuide ? subGuide.trim() : null,
            ticketCount: subTicketCount
          });
        } else if (child.name.endsWith('.md')) {
          // Direct ticket in column root
          if (this.isIgnoredFile(child.name, ignoredFiles)) continue;

          const ticketPath = childPath;
          const stat = await fs.promises.stat(ticketPath);
          const content = await fs.promises.readFile(ticketPath, 'utf8');
          const ticket = TicketParser.parse(ticketPath, content, rootPath, columnName, null, stat.mtimeMs);
          tickets.push(ticket);
        }
      }

      columns.push({
        id: columnId,
        name: columnName,
        path: columnPath,
        subfolders,
        tickets,
        whatWhyGuide: columnGuide ? columnGuide.trim() : null
      });
    }

    // Sort columns according to config if specified, or standard kanban order
    this.sortColumns(columns, boardConfig.columnsOrder);

    // 4. Discover custom ticket templates in .templates/
    const templates: TicketTemplate[] = [];
    const templatesDir = path.join(rootPath, '.templates');
    if (fs.existsSync(templatesDir)) {
      try {
        const templateEntries = await fs.promises.readdir(templatesDir, { withFileTypes: true });
        for (const te of templateEntries) {
          if (!te.isDirectory() && te.name.endsWith('.md')) {
            const tPath = path.join(templatesDir, te.name);
            const content = await fs.promises.readFile(tPath, 'utf8');
            const id = te.name.replace(/\.md$/i, '').toLowerCase();
            const h1Match = content.match(/^#\s+(.+)$/m);
            const rawName = h1Match
              ? h1Match[1].replace(/\{id\}\s*[—–\-:]*\s*/i, '').trim()
              : id.charAt(0).toUpperCase() + id.slice(1);
            templates.push({
              id,
              name: rawName || id,
              filename: te.name,
              content
            });
          }
        }
      } catch (e) {
        console.warn(`Could not read .templates at ${templatesDir}:`, e);
      }
    }

    // 5. Build lookup map and resolve dependencies across all tickets
    const ticketMap = new Map<string, { column: string; ticket: Ticket }>();
    for (const col of columns) {
      for (const t of col.tickets) {
        if (t.id) {
          ticketMap.set(t.id.toUpperCase(), { column: col.name, ticket: t });
        }
      }
    }

    for (const col of columns) {
      for (const t of col.tickets) {
        if (t.dependsOn && t.dependsOn.length > 0) {
          const unresolved: string[] = [];
          for (const dep of t.dependsOn) {
            const depKey = dep.toUpperCase();
            const found = ticketMap.get(depKey);
            if (!found) {
              unresolved.push(dep);
            } else {
              const colLower = found.column.toLowerCase();
              const isCompleted = colLower.includes('complete') || colLower.includes('done');
              if (!isCompleted) {
                unresolved.push(`${dep} (${found.column})`);
              }
            }
          }
          if (unresolved.length > 0) {
            t.unresolvedDependencies = unresolved;
          }
        }
      }
    }

    return {
      id: boardId,
      name: boardConfig.name,
      rootPath,
      columns,
      config: boardConfig,
      planDocument,
      templates: templates.length > 0 ? templates : undefined,
      lastScanned: Date.now()
    };
  }

  private static isIgnoredFile(filename: string, ignoredFiles: string[]): boolean {
    const lower = filename.toLowerCase();
    if (lower.startsWith('00_') || lower.startsWith('_')) return true;
    return ignoredFiles.includes(lower);
  }

  private static sortColumns(columns: Column[], preferredOrder: string[]): void {
    if (preferredOrder && preferredOrder.length > 0) {
      const orderMap = new Map<string, number>();
      preferredOrder.forEach((name, index) => {
        orderMap.set(name.toLowerCase(), index);
      });

      columns.sort((a, b) => {
        const orderA = orderMap.has(a.name.toLowerCase()) ? orderMap.get(a.name.toLowerCase())! : 999;
        const orderB = orderMap.has(b.name.toLowerCase()) ? orderMap.get(b.name.toLowerCase())! : 999;
        if (orderA !== orderB) return orderA - orderB;
        return a.name.localeCompare(b.name);
      });
      return;
    }

    // Default canonical progression
    const defaultOrder = ['backlog', 'ready', 'todo', 'to do', 'ongoing', 'in progress', 'assistance required', 'blocked', 'review', 'done', 'completed'];
    columns.sort((a, b) => {
      const idxA = defaultOrder.indexOf(a.name.toLowerCase());
      const idxB = defaultOrder.indexOf(b.name.toLowerCase());
      const scoreA = idxA !== -1 ? idxA : 100;
      const scoreB = idxB !== -1 ? idxB : 100;
      if (scoreA !== scoreB) return scoreA - scoreB;
      return a.name.localeCompare(b.name);
    });
  }
}
