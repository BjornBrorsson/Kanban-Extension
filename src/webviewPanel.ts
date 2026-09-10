import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { BoardManager } from './boardManager';
import { AgentRunner } from './agentRunner';
import { Board, Ticket, Assignee } from './types';
import { PromptFormatter } from './promptFormatter';
import { TicketParser } from './ticketParser';

export class KanbanWebviewManager {
  public static currentPanel: KanbanWebviewManager | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];

  private currentBoardId: string | null = null;
  private isOverviewMode: boolean = false;

  public static createOrShow(extensionUri: vscode.Uri, initialBoardId?: string, isOverview: boolean = false): KanbanWebviewManager {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (KanbanWebviewManager.currentPanel) {
      KanbanWebviewManager.currentPanel.panel.reveal(column);
      if (isOverview) {
        KanbanWebviewManager.currentPanel.showOverview();
      } else if (initialBoardId) {
        KanbanWebviewManager.currentPanel.showBoard(initialBoardId);
      }
      return KanbanWebviewManager.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'agenticKanban',
      'Agentic Kanban',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'dist', 'webview'),
          vscode.Uri.joinPath(extensionUri, 'src', 'webview'),
          vscode.Uri.joinPath(extensionUri, 'media')
        ]
      }
    );

    KanbanWebviewManager.currentPanel = new KanbanWebviewManager(panel, extensionUri, initialBoardId, isOverview);
    return KanbanWebviewManager.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    initialBoardId?: string,
    isOverview: boolean = false
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.currentBoardId = initialBoardId || null;
    this.isOverviewMode = isOverview;

    // Set panel icon
    this.panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'kanban-icon.svg');

    // Set webview content
    this.panel.webview.html = this.getHtmlForWebview(this.panel.webview);

    // Listen for panel disposal
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Handle messages from Webview
    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        await this.handleWebviewMessage(message);
      },
      null,
      this.disposables
    );

    // Listen for board changes from BoardManager
    const boardManager = BoardManager.getInstance();
    boardManager.onDidChangeBoard((changedBoard) => {
      this.broadcastCurrentState();
    });
  }

  public showBoard(boardId: string): void {
    this.currentBoardId = boardId;
    this.isOverviewMode = false;
    this.broadcastCurrentState();
  }

  public showOverview(): void {
    this.isOverviewMode = true;
    this.broadcastCurrentState();
  }

  private async handleWebviewMessage(message: any): Promise<void> {
    const boardManager = BoardManager.getInstance();

    switch (message.type) {
      case 'ready':
        this.broadcastCurrentState();
        break;

      case 'switchBoard':
        this.currentBoardId = message.boardId;
        this.isOverviewMode = false;
        this.broadcastCurrentState();
        break;

      case 'showOverview':
        this.isOverviewMode = true;
        this.broadcastCurrentState();
        break;

      case 'moveTicket':
        await boardManager.moveTicket(
          message.boardId,
          message.ticketPath,
          message.targetColumn,
          message.targetSubfolder || null
        );
        this.broadcastCurrentState();
        break;

      case 'openTicketFile':
        try {
          const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(message.filePath));
          const editor = await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
          if (message.line && typeof message.line === 'number' && message.line > 0) {
            const pos = new vscode.Position(message.line - 1, 0);
            editor.selection = new vscode.Selection(pos, pos);
            editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
          }
        } catch (err: any) {
          vscode.window.showErrorMessage(`Failed to open ticket: ${err?.message || err}`);
        }
        break;

      case 'toggleCriterion':
        await boardManager.toggleTicketCriterion(message.ticketPath, message.index, message.done);
        break;

      case 'generateAgentRules':
        await vscode.commands.executeCommand('agenticKanban.generateAgentRules', {
          board: boardManager.getBoard(message.boardId)
        });
        break;

      case 'initTemplates':
        await vscode.commands.executeCommand('agenticKanban.initTemplates', {
          board: boardManager.getBoard(message.boardId)
        });
        break;

      case 'openPlan':
        try {
          const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(message.filePath));
          await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
        } catch (err: any) {
          vscode.window.showErrorMessage(`Failed to open plan document: ${err?.message || err}`);
        }
        break;

      case 'openConfig':
        try {
          const board = boardManager.getBoard(message.boardId);
          if (board) {
            const configPath = path.join(board.rootPath, 'config.md');
            if (fs.existsSync(configPath)) {
              const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(configPath));
              await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
            } else {
              vscode.window.showInformationMessage(`No config.md found at board root.`);
            }
          }
        } catch (err: any) {
          vscode.window.showErrorMessage(`Failed to open config: ${err?.message || err}`);
        }
        break;

      case 'createTicket':
        const createdPath = await boardManager.createTicket(
          message.boardId,
          message.targetColumn,
          message.targetSubfolder || null,
          message.title,
          message.content
        );
        if (createdPath && message.openImmediately) {
          const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(createdPath));
          await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
        }
        break;

      case 'dispatchAgent':
        const targetBoard = boardManager.getBoard(message.boardId);
        if (targetBoard) {
          const assignee = targetBoard.config.assignees.find(a => a.id === message.agentId);
          if (assignee) {
            await AgentRunner.dispatch(message.ticket, assignee, targetBoard.rootPath, targetBoard.config);
          } else {
            vscode.window.showErrorMessage(`Agent with ID "${message.agentId}" not found in board config.`);
          }
        }
        break;

      case 'runInChat':
        try {
          const t = message.ticket;
          let prompt = `Please review and work on ticket "${t.id ? t.id + ' — ' : ''}${t.title}" located at: ${t.path}`;
          if (t.summary) {
            prompt += `\n\nSummary:\n${t.summary}`;
          }
          if (t.acceptanceCriteria && t.acceptanceCriteria.length > 0) {
            prompt += `\n\nAcceptance Criteria:\n` + t.acceptanceCriteria.map((c: any) => `- [${c.done ? 'x' : ' '}] ${c.text}`).join('\n');
          }
          prompt += `\n\nInstructions:\n1. Implement the requested changes.\n2. Verify tests pass.\n3. Update the ticket's Work Log and move to Completed when finished.`;

          await vscode.env.clipboard.writeText(prompt);
          vscode.window.showInformationMessage(`Copied ticket prompt to clipboard. Opening IDE Chat...`);

          // Attempt opening IDE chat commands
          try {
            await vscode.commands.executeCommand('workbench.action.chat.open');
          } catch {
            try {
              await vscode.commands.executeCommand('aichat.opensidebar');
            } catch {}
          }
        } catch (err: any) {
          vscode.window.showErrorMessage(`Failed to open IDE chat: ${err?.message || err}`);
        }
        break;

      case 'copyAgentPrompt':
        try {
          const t = message.ticket;
          let targetBoard = boardManager.getBoard(message.boardId);
          const allBoards = boardManager.getAllBoards();
          if (t && t.path) {
            const foundBoard = allBoards.find(b =>
              path.resolve(t.path).toLowerCase().startsWith(path.resolve(b.rootPath).toLowerCase())
            );
            if (foundBoard) targetBoard = foundBoard;
          }
          if (!targetBoard && this.currentBoardId) {
            targetBoard = boardManager.getBoard(this.currentBoardId);
          }
          if (!targetBoard && allBoards.length > 0) {
            targetBoard = allBoards[0];
          }

          const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          const prompt = PromptFormatter.formatPrompt(
            t,
            targetBoard ? targetBoard.config : null,
            workspaceFolder,
            targetBoard ? targetBoard.rootPath : undefined
          );

          await vscode.env.clipboard.writeText(prompt);
          vscode.window.showInformationMessage(
            `Copied Agent Task Prompt for "${t.id ? t.id + ': ' : ''}${t.title}" to clipboard!`
          );
        } catch (err: any) {
          vscode.window.showErrorMessage(`Failed to copy agent prompt: ${err?.message || err}`);
        }
        break;

      case 'assignTicket':
        try {
          // 1. Locate the board that actually owns this ticket
          let targetBoard = boardManager.getBoard(message.boardId);
          const allBoards = boardManager.getAllBoards();
          if (message.ticketPath) {
            const foundBoard = allBoards.find(b =>
              path.resolve(message.ticketPath).toLowerCase().startsWith(path.resolve(b.rootPath).toLowerCase())
            );
            if (foundBoard) targetBoard = foundBoard;
          }
          if (!targetBoard && allBoards.length > 0) {
            targetBoard = allBoards[0];
          }

          if (!targetBoard) {
            vscode.window.showErrorMessage('No board found to assign ticket.');
            break;
          }

          this.currentBoardId = targetBoard.id;
          const targetName = message.assigneeName ? message.assigneeName.trim() : '';
          const assigneeId = message.assigneeId ? message.assigneeId.trim() : '';

          // 2. Perform disk assignment
          const assigned = await boardManager.assignTicket(targetBoard.id, message.ticketPath, targetName);
          if (!assigned) {
            vscode.window.showErrorMessage(`Failed to assign ticket at ${message.ticketPath}`);
            break;
          }

          // 3. Immediately broadcast refreshed state so UI stays in sync
          this.broadcastCurrentState();

          // 4. If agent was selected, dispatch CLI or chat
          if (message.runCli && targetName) {
            const assignee = targetBoard.config.assignees.find(
              a => (assigneeId && a.id === assigneeId) || a.name.toLowerCase() === targetName.toLowerCase()
            );

            if (assignee && assignee.type === 'agent') {
              // Locate ticket object from reloaded board or parse from disk
              const reloadedBoard = boardManager.getBoard(targetBoard.id) || targetBoard;
              let ticketObj: Ticket | null = null;
              for (const col of reloadedBoard.columns) {
                const found = col.tickets.find(t =>
                  path.resolve(t.path).toLowerCase() === path.resolve(message.ticketPath).toLowerCase() ||
                  (message.ticketId && t.id === message.ticketId) ||
                  t.filename.toLowerCase() === path.basename(message.ticketPath).toLowerCase()
                );
                if (found) {
                  ticketObj = found;
                  break;
                }
              }

              if (!ticketObj) {
                const sourcePath = boardManager.resolveTicketPathOnDisk(targetBoard, message.ticketPath) || message.ticketPath;
                const fileContent = await fs.promises.readFile(sourcePath, 'utf8');
                ticketObj = TicketParser.parse(sourcePath, fileContent, targetBoard.rootPath, '', null);
                if (ticketObj) {
                  ticketObj.assignee = assignee.name;
                }
              }

              if (ticketObj) {
                await AgentRunner.dispatch(ticketObj, assignee, targetBoard.rootPath, targetBoard.config);
              }
            } else {
              vscode.window.showInformationMessage(`Assigned ticket to ${targetName}.`);
            }
          } else if (targetName) {
            vscode.window.showInformationMessage(`Assigned ticket to ${targetName}.`);
          } else {
            vscode.window.showInformationMessage('Unassigned ticket.');
          }
        } catch (err: any) {
          vscode.window.showErrorMessage(`Failed to assign ticket: ${err?.message || err}`);
        }
        break;

      case 'log':
        console.log(`[Webview ${message.level || 'info'}] ${message.text}`);
        if (message.level === 'error') {
          vscode.window.showErrorMessage(`[Agentic Kanban UI Error] ${message.text}`);
        }
        break;

      case 'refresh':
        await boardManager.reloadBoards();
        this.broadcastCurrentState();
        break;
    }
  }

  private broadcastCurrentState(): void {
    const boardManager = BoardManager.getInstance();
    const boards = boardManager.getAllBoards();

    if (boards.length === 0) {
      this.panel.webview.postMessage({
        type: 'state',
        isOverview: false,
        boards: [],
        currentBoard: null,
        overview: null
      });
      return;
    }

    if (this.isOverviewMode) {
      const overview = boardManager.getMultiBoardOverview();
      this.panel.title = `Kanban: Workspace Overview`;
      this.panel.webview.postMessage({
        type: 'state',
        isOverview: true,
        boards: boards.map(b => ({ id: b.id, name: b.name, rootPath: b.rootPath })),
        currentBoard: null,
        overview
      });
      return;
    }

    // Default to first board if none selected or not found
    let currentBoard = this.currentBoardId ? boardManager.getBoard(this.currentBoardId) : undefined;
    if (!currentBoard) {
      currentBoard = boards[0];
      this.currentBoardId = currentBoard.id;
    }

    this.panel.title = `Kanban: ${currentBoard.name}`;
    this.panel.webview.postMessage({
      type: 'state',
      isOverview: false,
      boards: boards.map(b => ({ id: b.id, name: b.name, rootPath: b.rootPath })),
      currentBoard,
      overview: null
    });
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    // Prefer dist/webview, fallback to src/webview
    let webviewDir = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
    if (!fs.existsSync(webviewDir.fsPath)) {
      webviewDir = vscode.Uri.joinPath(this.extensionUri, 'src', 'webview');
    }

    const v = Date.now();
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewDir, 'app.js')).with({ query: `v=${v}` });
    const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewDir, 'styles.css')).with({ query: `v=${v}` });

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data: https:;">
  <title>Agentic Kanban</title>
  <link rel="stylesheet" href="${stylesUri}">
</head>
<body>
  <div id="app">
    <!-- Header bar -->
    <header class="top-nav">
      <div class="nav-left">
        <div class="board-selector-wrap">
          <svg class="nav-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="9" y1="3" x2="9" y2="21"/>
            <line x1="15" y1="3" x2="15" y2="21"/>
          </svg>
          <select id="boardSelect" class="select-input"></select>
        </div>

        <div class="view-toggles">
          <button id="btnBoardView" class="toggle-btn active" title="Kanban Board View">Board</button>
          <button id="btnOverviewView" class="toggle-btn" title="Multi-Board Overview">Overview</button>
        </div>

        <button id="btnPlanDoc" class="nav-action-btn secondary" style="display:none;" title="Open Board Plan / Architecture">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          <span>Plan</span>
        </button>

        <button id="btnAgentRules" class="nav-action-btn secondary" title="Generate or Update AGENTS.md System Rules">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
          </svg>
          <span>Rules</span>
        </button>
      </div>

      <div class="nav-center">
        <div class="search-box">
          <svg class="search-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" id="searchInput" placeholder="Search tickets, tags, epics..." autocomplete="off"/>
          <button id="clearSearchBtn" class="clear-search-btn" style="display:none;">&times;</button>
        </div>

        <div class="filter-controls">
          <select id="tagFilter" class="select-input small">
            <option value="">All Tags</option>
          </select>
          <select id="assigneeFilter" class="select-input small">
            <option value="">All Assignees</option>
          </select>
          <select id="priorityFilter" class="select-input small">
            <option value="">All Priorities</option>
            <option value="P0">P0 / Critical</option>
            <option value="P1">P1 / Core</option>
            <option value="P2">P2</option>
            <option value="P3">P3</option>
            <option value="Normal">Normal</option>
          </select>
        </div>
      </div>

      <div class="nav-right">
        <button id="btnNewTicket" class="nav-action-btn primary" title="Create New Ticket">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>New Ticket</span>
        </button>

        <button id="btnConfig" class="icon-btn" title="Open Board Configuration">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>

        <button id="btnRefresh" class="icon-btn" title="Refresh Board">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
        </button>
      </div>
    </header>

    <!-- Main Container -->
    <main id="mainContainer" class="main-content">
      <!-- Kanban Board View -->
      <div id="boardView" class="board-view">
        <div id="columnsContainer" class="columns-container"></div>
      </div>

      <!-- Multi-Board Overview Dashboard -->
      <div id="overviewView" class="overview-view" style="display:none;">
        <div class="overview-header-stats">
          <div class="stat-card">
            <div class="stat-number" id="statTotalBoards">0</div>
            <div class="stat-label">Active Boards</div>
          </div>
          <div class="stat-card">
            <div class="stat-number" id="statTotalTickets">0</div>
            <div class="stat-label">Total Tickets</div>
          </div>
          <div class="stat-card highlight-ongoing">
            <div class="stat-number" id="statOngoingTickets">0</div>
            <div class="stat-label">Ongoing Work</div>
          </div>
          <div class="stat-card highlight-assist">
            <div class="stat-number" id="statAssistanceTickets">0</div>
            <div class="stat-label">Needs Assistance</div>
          </div>
          <div class="stat-card highlight-blocked">
            <div class="stat-number" id="statBlockedTickets">0</div>
            <div class="stat-label">Blocked</div>
          </div>
          <div class="stat-card highlight-blocked">
            <div class="stat-number" id="statBlockedDependencies">0</div>
            <div class="stat-label">Blocked by Dep</div>
          </div>
        </div>

        <section class="overview-section">
          <div class="section-title">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <h2>Parallel Active Work (All Boards)</h2>
          </div>
          <div id="parallelWorkContainer" class="parallel-cards-grid"></div>
        </section>

        <section class="overview-section">
          <div class="section-title">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
            <h2>Project Boards</h2>
          </div>
          <div id="projectBoardsGrid" class="project-boards-grid"></div>
        </section>

        <section class="overview-section">
          <div class="section-title" style="display:flex;justify-content:space-between;align-items:center;width:100%;">
            <div style="display:flex;align-items:center;gap:8px;">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <h2>Workspace Activity Feed (Work Log Timeline)</h2>
            </div>
            <div class="feed-filters" style="display:flex;gap:8px;">
              <select id="feedDateFilter" class="select-input small">
                <option value="all">All Dates</option>
                <option value="today">Today</option>
                <option value="week">Past 7 Days</option>
              </select>
              <select id="feedBoardFilter" class="select-input small">
                <option value="">All Boards</option>
              </select>
            </div>
          </div>
          <div id="activityFeedContainer" class="activity-feed-container"></div>
        </section>
      </div>
    </main>

    <!-- Modal: New Ticket -->
    <div id="newTicketModal" class="modal-backdrop" style="display:none;">
      <div class="modal-card">
        <div class="modal-header">
          <h3 class="modal-title">Create New Ticket</h3>
          <button class="modal-close-btn" id="closeNewTicketModal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group" id="templateGroup">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <label for="newTicketTemplate" style="margin-bottom:0;">Template</label>
              <button type="button" id="btnInitTemplates" class="link-btn" title="Initialize default templates in .templates/">+ Init Templates</button>
            </div>
            <select id="newTicketTemplate" class="select-input full">
              <option value="">(Default Ticket Format)</option>
            </select>
          </div>
          <div class="form-group">
            <label for="newTicketTitle">Title *</label>
            <input type="text" id="newTicketTitle" class="text-input" placeholder="e.g. Implement real-time cache layer" required />
          </div>
          <div class="form-row">
            <div class="form-group half">
              <label for="newTicketColumn">Column *</label>
              <select id="newTicketColumn" class="select-input full"></select>
            </div>
            <div class="form-group half">
              <label for="newTicketSubfolder">Subfolder</label>
              <select id="newTicketSubfolder" class="select-input full">
                <option value="">(None - Column Root)</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group half">
              <label for="newTicketPriority">Priority</label>
              <select id="newTicketPriority" class="select-input full">
                <option value="Normal">Normal</option>
                <option value="P0">P0 — Critical</option>
                <option value="P1">P1 — Core</option>
                <option value="P2">P2</option>
                <option value="P3">P3</option>
              </select>
            </div>
            <div class="form-group half">
              <label for="newTicketAssignee">Assignee</label>
              <select id="newTicketAssignee" class="select-input full">
                <option value="">(Unassigned)</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label for="newTicketSummary">Summary</label>
            <textarea id="newTicketSummary" class="textarea-input" rows="3" placeholder="Brief 1-2 sentence description of goal and context..."></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button id="btnCancelTicket" class="modal-btn secondary">Cancel</button>
          <button id="btnSubmitTicket" class="modal-btn primary">Create Ticket</button>
        </div>
      </div>
    </div>

    <!-- Modal: Ticket Quick View / Dispatch -->
    <div id="ticketDetailModal" class="modal-backdrop" style="display:none;">
      <div class="modal-card large">
        <div class="modal-header">
          <div class="ticket-modal-badges" id="modalBadges"></div>
          <button class="modal-close-btn" id="closeDetailModal">&times;</button>
        </div>
        <div class="modal-body" id="modalDetailBody"></div>
        <div class="modal-footer">
          <button id="btnOpenInEditor" class="modal-btn secondary">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
            <span>Open in Editor</span>
          </button>
          <button id="btnCopyPromptModal" class="modal-btn secondary" title="Copy Agent Task Prompt to clipboard">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
            </svg>
            <span>Copy Prompt</span>
          </button>
          <button id="btnAssignModal" class="modal-btn secondary">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <line x1="19" y1="8" x2="19" y2="14"></line>
              <line x1="22" y1="11" x2="16" y2="11"></line>
            </svg>
            <span id="assignModalBtnText">Assign...</span>
          </button>
          <button id="btnRunInChatModal" class="modal-btn primary">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <span>Run in IDE Chat</span>
          </button>
        </div>
      </div>
    </div>
  </div>

  <script src="${scriptUri}"></script>
</body>
</html>`;
  }

  public dispose(): void {
    KanbanWebviewManager.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const x = this.disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }
}
