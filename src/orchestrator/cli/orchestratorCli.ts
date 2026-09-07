import * as path from 'path';
import { DaemonClient } from '../daemon/daemonClient';
import { OrchestratorDaemon } from '../daemon/orchestratorDaemon';

export interface CliResult {
  exitCode: number;
  output: string;
}

export async function runCli(args: string[], workspaceRoot: string = process.cwd()): Promise<CliResult> {
  const client = new DaemonClient(workspaceRoot);
  const command = args[0] || 'help';

  try {
    switch (command) {
      case 'status': {
        const isJson = args.includes('--json');
        const isRunning = await client.isDaemonRunning();
        if (!isRunning) {
          const out = isJson
            ? JSON.stringify({ running: false, workspaceRoot }, null, 2)
            : `Orchestrator daemon is not running in ${workspaceRoot}`;
          return { exitCode: 0, output: out };
        }

        const status = await client.getStatus();
        if (isJson) {
          return { exitCode: 0, output: JSON.stringify(status, null, 2) };
        }

        const lines = [
          `=== Kanban Orchestrator Status ===`,
          `Daemon PID:      ${status.pid}`,
          `Started At:      ${new Date(status.startedAt).toISOString()}`,
          `Queue Paused:    ${status.scheduler.paused ? 'YES' : 'NO'}`,
          `Active Global:   ${status.scheduler.activeGlobal} / ${status.scheduler.maxGlobal}`,
          `Profile:         ${status.profile.profile}`,
          `Consecutive Fails: ${status.profile.consecutiveFailures}`,
          `Total Spent:     €${status.profile.totalSpent.toFixed(2)}`,
          `Active Leases:   ${status.leases.length}`,
          `Interventions:   ${status.interventions.length}`
        ];
        return { exitCode: 0, output: lines.join('\n') };
      }

      case 'pause': {
        const res = await client.pause();
        return { exitCode: 0, output: `Orchestrator queue paused.` };
      }

      case 'resume': {
        const res = await client.resume();
        return { exitCode: 0, output: `Orchestrator queue resumed.` };
      }

      case 'run': {
        const boardIndex = args.indexOf('--board');
        const boardId = boardIndex !== -1 && args[boardIndex + 1] ? args[boardIndex + 1] : undefined;
        const res = await client.run({ boardId });
        return { exitCode: 0, output: `Run completed: Dispatched ${res.dispatched} task(s). Status: ${res.status || 'ok'}` };
      }

      case 'cancel': {
        const ticketId = args[1];
        const attemptId = args[2] || 'active';
        if (!ticketId) {
          return { exitCode: 1, output: 'Usage: kanban-orch cancel <ticketId> [attemptId]' };
        }
        const res = await client.cancel(ticketId, attemptId);
        return { exitCode: 0, output: `Cancelled attempt for ticket ${ticketId}: ${JSON.stringify(res)}` };
      }

      case 'review': {
        const ticketId = args[1];
        if (!ticketId) {
          return { exitCode: 1, output: 'Usage: kanban-orch review <ticketId>' };
        }
        const review = await client.getReview(ticketId);
        const lines = [
          `=== Review for Ticket: ${review.ticketId} ===`,
          `Status: ${review.status}`,
          `--- Patch Unified ---`,
          review.diff || '(No patch generated)'
        ];
        return { exitCode: 0, output: lines.join('\n') };
      }

      case 'stop': {
        const res = await client.stop();
        return { exitCode: 0, output: `Daemon stopping: ${res.message || 'ok'}` };
      }

      case 'start': {
        const portIndex = args.indexOf('--port');
        const desiredPort = portIndex !== -1 && args[portIndex + 1] ? parseInt(args[portIndex + 1], 10) : 0;
        const daemon = new OrchestratorDaemon({ workspaceRoot });
        const info = await daemon.start(desiredPort);
        return { exitCode: 0, output: `Daemon started on port ${info.port} (PID: ${info.pid})` };
      }

      case 'help':
      default: {
        const helpText = [
          `Usage: kanban-orch <command> [options]`,
          ``,
          `Commands:`,
          `  status [--json]          Display daemon status, queue state, and active leases`,
          `  run [--board <path>]     Trigger scheduler loop for ready tasks`,
          `  pause                    Pause queue dispatch`,
          `  resume                   Resume queue dispatch`,
          `  cancel <ticket> [att]    Cancel active attempt`,
          `  review <ticketId>        Display verification evidence and patch diff`,
          `  start [--port <port>]    Start daemon process`,
          `  stop                     Stop running daemon`
        ].join('\n');
        return { exitCode: 0, output: helpText };
      }
    }
  } catch (err: any) {
    return { exitCode: 1, output: `Error: ${err.message}` };
  }
}

// Direct execution entrypoint
const isDirectCliInvocation = typeof process !== 'undefined' && Boolean(process.argv[1]) && (
  path.basename(process.argv[1]) === 'cli.js' ||
  path.basename(process.argv[1]) === 'orchestratorCli.js' ||
  path.basename(process.argv[1]) === 'kanban-orch'
);

if (isDirectCliInvocation) {
  const args = process.argv.slice(2);
  runCli(args).then(result => {
    console.log(result.output);
    process.exit(result.exitCode);
  });
}
