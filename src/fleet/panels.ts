import * as vscode from 'vscode';
import * as fs from 'fs';
import { BoardManager } from '../boardManager';
import { FleetController } from './fleetController';
import { PROVIDER_PRESETS, ProviderKind } from './providers';
import { createThread, readMessageBoard, release, replyToThread } from './messageBoard';

type PanelKind = 'providers' | 'orchestrator' | 'messageboard';

const TITLES: Record<PanelKind, string> = {
  providers: 'Agent Providers',
  orchestrator: 'Orchestrator',
  messageboard: 'Message Board'
};

/** One webview panel class for both fleet screens; the script file decides what is rendered. */
export class FleetPanel {
  private static panels = new Map<PanelKind, FleetPanel>();
  private readonly disposables: vscode.Disposable[] = [];

  public static show(extensionUri: vscode.Uri, kind: PanelKind): void {
    const existing = FleetPanel.panels.get(kind);
    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.Active);
      existing.push();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      `agenticKanban.${kind}`,
      TITLES[kind],
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [extensionUri] }
    );
    FleetPanel.panels.set(kind, new FleetPanel(panel, extensionUri, kind));
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly kind: PanelKind
  ) {
    this.panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'kanban-icon.svg');
    this.panel.webview.html = this.html();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(m => this.onMessage(m), null, this.disposables);

    const fleet = FleetController.get();
    if (fleet) this.disposables.push(fleet.onDidChange(() => this.push()));
    if (kind === 'messageboard') {
      // The board is plain files other agents edit at any time: poll while the panel is open.
      const timer = setInterval(() => this.push(), 5000);
      this.disposables.push({ dispose: () => clearInterval(timer) });
    }
    this.disposables.push(BoardManager.getInstance().onDidChangeBoard(() => this.push()));
  }

  private dispose(): void {
    FleetPanel.panels.delete(this.kind);
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }

  private async onMessage(m: any): Promise<void> {
    const fleet = FleetController.get();
    if (!fleet) return;
    try {
      switch (m.type) {
        case 'ready':
        case 'refresh':
          break;

        // ---- providers
        case 'saveProvider':
          fleet.registry.upsert(m.provider);
          vscode.window.setStatusBarMessage(`Saved ${m.provider?.name || 'provider'}`, 2500);
          break;
        case 'addProvider':
          fleet.registry.add(m.kindId as ProviderKind);
          break;
        case 'openFile': {
          if (m.path && fs.existsSync(m.path)) {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(m.path));
            await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
          }
          return;
        }
        case 'newThread': {
          const dir = fleet.messageBoardDir();
          if (!dir) break;
          const title = await vscode.window.showInputBox({ prompt: 'Thread title', placeHolder: 'e.g. Who owns the auth refactor?' });
          if (!title?.trim()) return;
          const msg = await vscode.window.showInputBox({ prompt: 'First message (what do you want the agents to know or decide?)' });
          if (msg === undefined) return;
          const file = createThread(dir, title, 'Björn', 'Agentic Kanban UI', msg || title);
          const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
          await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
          break;
        }
        case 'reply': {
          const text = await vscode.window.showInputBox({ prompt: 'Your reply (signed as Björn, Agentic Kanban UI)' });
          if (text?.trim() && m.path && fs.existsSync(m.path)) replyToThread(m.path, 'Björn', 'Agentic Kanban UI', text);
          break;
        }
        case 'releaseClaim': {
          const dir = fleet.messageBoardDir();
          if (dir && m.key) release(dir, m.key, 'Agentic Kanban UI', true);
          break;
        }
        case 'openMessageBoard':
          FleetPanel.show(this.extensionUri, 'messageboard');
          return;
        case 'importModels': {
          const text = await vscode.env.clipboard.readText();
          vscode.window.showInformationMessage(await fleet.importModels(m.id, text));
          break;
        }
        case 'refreshModels': {
          vscode.window.setStatusBarMessage('Agentic Kanban: refreshing model lists...', 8000);
          vscode.window.showInformationMessage(await fleet.refreshCatalog(!!m.apply));
          break;
        }
        case 'detectAll': {
          const r = await fleet.autoDetect();
          vscode.window.showInformationMessage(r.summary);
          break;
        }
        case 'detectProvider': {
          const r = await fleet.detectFor(m.id);
          vscode.window.showInformationMessage(r);
          break;
        }
        case 'duplicateProvider':
          fleet.registry.duplicate(m.id);
          break;
        case 'deleteProvider': {
          const p = fleet.registry.get(m.id);
          const pick = await vscode.window.showWarningMessage(
            `Delete provider "${p?.name || m.id}"? Running sessions are not affected.`, { modal: true }, 'Delete'
          );
          if (pick === 'Delete') fleet.registry.remove(m.id);
          break;
        }

        // ---- orchestrator
        case 'saveSettings':
          fleet.saveSettings(m.settings || {});
          break;
        case 'runPlan': {
          const n = await fleet.runPlan();
          vscode.window.showInformationMessage(n ? `Orchestrator started ${n} session(s).` : 'Nothing to start right now (no Ready tickets or no free capacity).');
          break;
        }
        case 'startDecision': {
          const d = fleet.plan().find(x => x.ticketPath === m.ticketPath);
          if (d) await fleet.execute(d);
          break;
        }
        case 'askOrchestrator':
          await fleet.askOrchestrator();
          break;
        case 'focusSession':
          fleet.sessions.show(m.id);
          break;
        case 'cancelSession':
          fleet.sessions.cancel(m.id);
          break;
        case 'resumeSession':
          await fleet.resumeSession(m.id, m.mode === 'restart' ? 'restart' : 'resume');
          break;
        case 'resumeAll': {
          const n = await fleet.resumeAll();
          vscode.window.showInformationMessage(n ? `Resumed ${n} session(s).` : 'Nothing to resume.');
          break;
        }
        case 'dismissSession':
          fleet.sessions.dismiss(m.id);
          break;
        case 'markFinished':
          fleet.sessions.markFinished(m.id);
          break;
        case 'requestReview':
          await fleet.requestReview(m.id);
          break;
        case 'openTicket': {
          if (m.path && fs.existsSync(m.path)) {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(m.path));
            await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
          }
          break;
        }
        case 'openProviders':
          FleetPanel.show(this.extensionUri, 'providers');
          return;
        case 'openOrchestrator':
          FleetPanel.show(this.extensionUri, 'orchestrator');
          return;
      }
    } catch (e: any) {
      vscode.window.showErrorMessage(`Agentic Kanban: ${e?.message || e}`);
    }
    this.push();
  }

  private push(): void {
    const fleet = FleetController.get();
    if (!fleet) return;
    if (this.kind === 'messageboard') {
      const dir = fleet.messageBoardDir();
      this.panel.webview.postMessage({ type: 'state', board: dir ? readMessageBoard(dir) : null });
      return;
    }
    const providers = fleet.registry.list();
    const base = {
      type: 'state',
      now: Date.now(),
      providers,
      usage: fleet.usage(),
      presets: PROVIDER_PRESETS.map(p => ({ kind: p.kind, label: p.label })),
      catalog: fleet.catalogSummary()
    };
    if (this.kind === 'providers') {
      this.panel.webview.postMessage(base);
      return;
    }
    this.panel.webview.postMessage({
      ...base,
      settings: fleet.settings,
      sessions: fleet.sessions.list().sort((a, b) => (b.startedAt || b.queuedAt) - (a.startedAt || a.queuedAt)),
      plan: fleet.plan()
    });
  }

  private html(): string {
    const webview = this.panel.webview;
    let dir = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
    if (!fs.existsSync(dir.fsPath)) dir = vscode.Uri.joinPath(this.extensionUri, 'src', 'webview');
    const v = Date.now();
    const css = webview.asWebviewUri(vscode.Uri.joinPath(dir, 'fleet.css')).with({ query: `v=${v}` });
    const js = webview.asWebviewUri(vscode.Uri.joinPath(dir, `${this.kind}.js`)).with({ query: `v=${v}` });
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource};">
<title>${TITLES[this.kind]}</title>
<link rel="stylesheet" href="${css}">
</head><body><div id="root" class="fleet-root"></div><script src="${js}"></script></body></html>`;
  }
}
