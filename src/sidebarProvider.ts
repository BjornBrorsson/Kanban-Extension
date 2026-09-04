import * as vscode from 'vscode';
import * as path from 'path';
import { BoardManager } from './boardManager';
import { Board, Column } from './types';

export class BoardsTreeProvider implements vscode.TreeDataProvider<TreeItemNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeItemNode | undefined | void> = new vscode.EventEmitter<TreeItemNode | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<TreeItemNode | undefined | void> = this._onDidChangeTreeData.event;

  constructor(private boardManager: BoardManager) {
    this.boardManager.onDidChangeBoard(() => {
      this.refresh();
    });
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeItemNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeItemNode): Promise<TreeItemNode[]> {
    if (!element) {
      // Root level items
      const boards = this.boardManager.getAllBoards();
      const nodes: TreeItemNode[] = [];

      // Add Multi-Board Overview item
      const overviewNode = new TreeItemNode(
        'Workspace Overview',
        vscode.TreeItemCollapsibleState.None,
        'overview',
        {
          command: 'agenticKanban.openOverview',
          title: 'Open Multi-Board Overview'
        }
      );
      overviewNode.iconPath = new vscode.ThemeIcon('dashboard');
      overviewNode.description = `${boards.length} boards`;
      nodes.push(overviewNode);

      // Add each board
      for (const board of boards) {
        const totalTickets = board.columns.reduce((acc, col) => acc + col.tickets.length, 0);
        const boardNode = new TreeItemNode(
          board.name,
          vscode.TreeItemCollapsibleState.Expanded,
          'board',
          {
            command: 'agenticKanban.openBoard',
            title: 'Open Board',
            arguments: [board.id]
          },
          board
        );
        boardNode.iconPath = new vscode.ThemeIcon('layout-kanban');
        boardNode.description = `${totalTickets} tickets`;
        boardNode.tooltip = `${board.name}\n${board.rootPath}`;
        nodes.push(boardNode);
      }

      return nodes;
    }

    if (element.contextValue === 'board' && element.board) {
      // Return columns for this board
      const colNodes: TreeItemNode[] = [];
      for (const col of element.board.columns) {
        const colNode = new TreeItemNode(
          col.name,
          vscode.TreeItemCollapsibleState.None,
          'column',
          {
            command: 'agenticKanban.openBoard',
            title: 'Open Board Column',
            arguments: [element.board.id, col.name]
          },
          element.board,
          col
        );
        colNode.iconPath = this.getColumnIcon(col.name);
        colNode.description = `${col.tickets.length}`;
        colNodes.push(colNode);
      }
      return colNodes;
    }

    return [];
  }

  private getColumnIcon(colName: string): vscode.ThemeIcon {
    const lower = colName.toLowerCase();
    if (lower.includes('backlog') || lower.includes('todo')) return new vscode.ThemeIcon('inbox');
    if (lower.includes('ongoing') || lower.includes('progress')) return new vscode.ThemeIcon('play');
    if (lower.includes('assist') || lower.includes('help')) return new vscode.ThemeIcon('question');
    if (lower.includes('block')) return new vscode.ThemeIcon('circle-slash');
    if (lower.includes('done') || lower.includes('completed')) return new vscode.ThemeIcon('check');
    return new vscode.ThemeIcon('folder');
  }
}

class TreeItemNode extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue: string,
    public readonly command?: vscode.Command,
    public readonly board?: Board,
    public readonly column?: Column
  ) {
    super(label, collapsibleState);
  }
}
