import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { BoardManager } from './boardManager';
import { BoardsTreeProvider } from './sidebarProvider';
import { KanbanWebviewManager } from './webviewPanel';
import { ConfigParser } from './configParser';

export async function activate(context: vscode.ExtensionContext) {
  console.log('[Agentic Kanban] Extension activating...');

  const boardManager = BoardManager.getInstance();

  // 1. Initial scan of boards
  await boardManager.reloadBoards();

  // 2. Setup filesystem watcher for markdown files
  boardManager.setupWatchers(context);

  // 3. Register Sidebar Tree Provider
  const treeProvider = new BoardsTreeProvider(boardManager);
  vscode.window.registerTreeDataProvider('agenticKanban.boardsView', treeProvider);

  // 4. Register Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('agenticKanban.openBoard', (boardId?: string) => {
      KanbanWebviewManager.createOrShow(context.extensionUri, boardId, false);
    }),

    vscode.commands.registerCommand('agenticKanban.openOverview', () => {
      KanbanWebviewManager.createOrShow(context.extensionUri, undefined, true);
    }),

    vscode.commands.registerCommand('agenticKanban.refreshBoards', async () => {
      await boardManager.reloadBoards();
      vscode.window.showInformationMessage('Agentic Kanban: Boards refreshed.');
    }),

    vscode.commands.registerCommand('agenticKanban.createTicket', async () => {
      const boards = boardManager.getAllBoards();
      if (boards.length === 0) {
        vscode.window.showWarningMessage('No Kanban boards discovered in the workspace.');
        return;
      }

      let selectedBoard = boards[0];
      if (boards.length > 1) {
        const boardPick = await vscode.window.showQuickPick(
          boards.map(b => ({ label: b.name, description: b.rootPath, board: b })),
          { placeHolder: 'Select target board' }
        );
        if (!boardPick) return;
        selectedBoard = boardPick.board;
      }

      const columnPick = await vscode.window.showQuickPick(
        selectedBoard.columns.map(c => ({ label: c.name, description: `${c.tickets.length} tickets`, column: c })),
        { placeHolder: 'Select destination column' }
      );
      if (!columnPick) return;

      let subfolder: string | null = null;
      if (columnPick.column.subfolders.length > 0) {
        const subfolderPick = await vscode.window.showQuickPick(
          [
            { label: '(Column Root)', subfolder: null },
            ...columnPick.column.subfolders.map(s => ({ label: s.name, subfolder: s.name }))
          ],
          { placeHolder: 'Select subfolder filter (optional)' }
        );
        if (subfolderPick && subfolderPick.subfolder) {
          subfolder = subfolderPick.subfolder;
        }
      }

      const title = await vscode.window.showInputBox({
        prompt: 'Enter ticket title',
        placeHolder: 'e.g. Implement resilient retry loop'
      });
      if (!title || !title.trim()) return;

      const createdPath = await boardManager.createTicket(
        selectedBoard.id,
        columnPick.column.name,
        subfolder,
        title.trim()
      );

      if (createdPath) {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(createdPath));
        await vscode.window.showTextDocument(doc);
      }
    }),

    vscode.commands.registerCommand('agenticKanban.openConfig', async (item?: any) => {
      const boards = boardManager.getAllBoards();
      if (boards.length === 0) return;

      let board = boards[0];
      if (item && item.board) {
        board = item.board;
      } else if (boards.length > 1) {
        const pick = await vscode.window.showQuickPick(
          boards.map(b => ({ label: b.name, description: b.rootPath, board: b })),
          { placeHolder: 'Select board' }
        );
        if (!pick) return;
        board = pick.board;
      }

      const configPath = path.join(board.rootPath, 'config.md');
      if (!fs.existsSync(configPath)) {
        // Create default config.md
        const defaultConfig = ConfigParser.generateDefaultConfig(board.name);
        await fs.promises.writeFile(configPath, defaultConfig, 'utf8');
      }

      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(configPath));
      await vscode.window.showTextDocument(doc);
    })
  );

  console.log('[Agentic Kanban] Activated successfully.');
}

export function deactivate() {
  console.log('[Agentic Kanban] Deactivated.');
}
