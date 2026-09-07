export interface OutcomeReportTicketItem {
  ticketId: string;
  title: string;
  status: string;
  filesModified: string[];
  testPassed: boolean;
  replayPassed?: boolean;
}

export interface OutcomeReportParams {
  boardId: string;
  runId: string;
  startTime: number;
  endTime: number;
  tickets: OutcomeReportTicketItem[];
  cashSpent: number;
  cashCurrency: string;
  subscriptionUnitsSpent: number;
  blockers: string[];
}

export class OutcomeReporter {
  public static generateReport(params: OutcomeReportParams): string {
    const durationSec = Math.max(1, Math.round((params.endTime - params.startTime) / 1000));
    const totalFiles = new Set<string>();
    params.tickets.forEach(t => t.filesModified.forEach(f => totalFiles.add(f)));

    const lines: string[] = [
      `# Run Outcome Report — ${params.boardId}`,
      ``,
      `| Field | Value |`,
      `|---|---|`,
      `| **Run ID** | \`${params.runId}\` |`,
      `| **Board** | ${params.boardId} |`,
      `| **Completed At** | ${new Date(params.endTime).toISOString()} |`,
      `| **Duration** | ${durationSec}s |`,
      `| **Tickets Executed** | ${params.tickets.length} |`,
      `| **Total Files Modified** | ${totalFiles.size} |`,
      `| **Cash Spent** | ${params.cashCurrency} ${params.cashSpent.toFixed(2)} |`,
      `| **Subscription Units** | ${params.subscriptionUnitsSpent} |`,
      ``,
      `## Executed Tickets`,
      ``,
      `| Ticket | Title | Status | Tests | Replay | Files Modified |`,
      `|---|---|---|---|---|---|`
    ];

    for (const t of params.tickets) {
      const testsStr = t.testPassed ? '✓ Passed' : '✗ Failed';
      const replayStr = t.replayPassed !== undefined ? (t.replayPassed ? '✓ Passed' : '✗ Failed') : 'N/A';
      const filesStr = t.filesModified.length > 0 ? t.filesModified.join(', ') : '*(none)*';
      lines.push(`| **${t.ticketId}** | ${t.title} | \`${t.status}\` | ${testsStr} | ${replayStr} | ${filesStr} |`);
    }

    lines.push(``);
    lines.push(`## Financial Summary`);
    lines.push(`- **Cash Expenditure**: ${params.cashCurrency} ${params.cashSpent.toFixed(2)}`);
    lines.push(`- **Subscription Allowance Spent**: ${params.subscriptionUnitsSpent} units`);

    if (params.blockers.length > 0) {
      lines.push(``);
      lines.push(`## Outstanding Blockers & Interventions`);
      for (const b of params.blockers) {
        lines.push(`- ⚠️ ${b}`);
      }
    } else {
      lines.push(``);
      lines.push(`> [!NOTE]`);
      lines.push(`> Zero outstanding blockers or policy violations during this execution.`);
    }

    return lines.join('\n');
  }
}
