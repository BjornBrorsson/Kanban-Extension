import * as fs from 'fs';
import * as path from 'path';

export interface PlannedSubtask {
  id: string;
  title: string;
  type?: string;
  priority: 'P0 — Critical' | 'P1 — Core' | 'P2 — Important' | 'P3 — Minor';
  estimate?: string;
  dependsOn?: string[];
  blocks?: string[];
  allowedScope: string[];
  objective: string;
  acceptanceCriteria: string[];
  verificationCommand?: string;
}

export interface PlanningDecompositionResult {
  epicOrGoal: string;
  summary: string;
  subtasks: PlannedSubtask[];
  dependencyGraph: { [ticketId: string]: string[] }; // ticketId -> dependencies
}

export interface PlanningOptions {
  maxSubtasks?: number;
  maxDepth?: number;
}

export class LeadPlanningEngine {
  public static readonly DEFAULT_MAX_SUBTASKS = 20;

  /**
   * Validates a set of planned subtasks for circular dependencies using depth-first search.
   */
  public static validateDependencyGraph(subtasks: PlannedSubtask[]): { valid: boolean; cycle?: string[] } {
    const adjList = new Map<string, string[]>();
    const taskIds = new Set(subtasks.map(s => s.id));

    for (const task of subtasks) {
      const deps = (task.dependsOn || []).filter(d => taskIds.has(d));
      adjList.set(task.id, deps);
    }

    const visited = new Set<string>();
    const recStack = new Set<string>();
    const currentPath: string[] = [];

    function dfs(node: string): string[] | null {
      visited.add(node);
      recStack.add(node);
      currentPath.push(node);

      const neighbors = adjList.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          const cycle = dfs(neighbor);
          if (cycle) return cycle;
        } else if (recStack.has(neighbor)) {
          const cycleStart = currentPath.indexOf(neighbor);
          return [...currentPath.slice(cycleStart), neighbor];
        }
      }

      recStack.delete(node);
      currentPath.pop();
      return null;
    }

    for (const task of subtasks) {
      if (!visited.has(task.id)) {
        const cycle = dfs(task.id);
        if (cycle) {
          return { valid: false, cycle };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Plans and decomposes a goal into bounded subtasks with safeguards.
   */
  public static planGoal(
    goalDescription: string,
    proposedSubtasks: PlannedSubtask[],
    options: PlanningOptions = {}
  ): PlanningDecompositionResult {
    const maxSubtasks = options.maxSubtasks || this.DEFAULT_MAX_SUBTASKS;
    if (proposedSubtasks.length > maxSubtasks) {
      throw new Error(`Planning error: Decomposed subtask count (${proposedSubtasks.length}) exceeds safety limit (${maxSubtasks}).`);
    }

    const validation = this.validateDependencyGraph(proposedSubtasks);
    if (!validation.valid) {
      throw new Error(`Planning error: Circular dependency detected in plan: ${validation.cycle?.join(' -> ')}`);
    }

    // Populate cross-linking Blocks fields
    const taskMap = new Map<string, PlannedSubtask>();
    for (const task of proposedSubtasks) {
      taskMap.set(task.id, task);
    }

    for (const task of proposedSubtasks) {
      if (task.dependsOn) {
        for (const depId of task.dependsOn) {
          const parent = taskMap.get(depId);
          if (parent) {
            parent.blocks = parent.blocks || [];
            if (!parent.blocks.includes(task.id)) {
              parent.blocks.push(task.id);
            }
          }
        }
      }
    }

    const dependencyGraph: { [ticketId: string]: string[] } = {};
    for (const task of proposedSubtasks) {
      dependencyGraph[task.id] = task.dependsOn || [];
    }

    return {
      epicOrGoal: goalDescription,
      summary: `Decomposed goal into ${proposedSubtasks.length} bounded subtasks with verified dependency ordering.`,
      subtasks: proposedSubtasks,
      dependencyGraph
    };
  }

  /**
   * Generates a standard markdown ticket file content adhering to TicketParser conventions.
   */
  public static formatTicketMarkdown(subtask: PlannedSubtask, epicName?: string): string {
    const lines: string[] = [];
    lines.push(`# ${subtask.id} — ${subtask.title}`);
    lines.push('');
    lines.push('| Field | Value |');
    lines.push('|-------|-------|');
    if (epicName) {
      lines.push(`| **Epic** | ${epicName} |`);
    }
    lines.push(`| **Type** | ${subtask.type || 'Feature'} |`);
    lines.push(`| **Priority** | ${subtask.priority} |`);
    if (subtask.estimate) {
      lines.push(`| **Estimate** | ${subtask.estimate} |`);
    }
    lines.push('| **Status** | Backlog |');
    lines.push('| **Assignee** | — |');
    if (subtask.dependsOn && subtask.dependsOn.length > 0) {
      lines.push(`| **Depends on** | ${subtask.dependsOn.join(', ')} |`);
    }
    if (subtask.blocks && subtask.blocks.length > 0) {
      lines.push(`| **Blocks** | ${subtask.blocks.join(', ')} |`);
    }
    if (subtask.allowedScope && subtask.allowedScope.length > 0) {
      lines.push(`| **Scope** | \`${subtask.allowedScope.join('`, `')}\` |`);
    }
    lines.push('');
    lines.push('## Summary');
    lines.push(subtask.objective);
    lines.push('');
    lines.push('## Acceptance Criteria');
    for (const criterion of subtask.acceptanceCriteria) {
      lines.push(`- [ ] ${criterion}`);
    }
    lines.push('');
    if (subtask.verificationCommand) {
      lines.push('## Verification');
      lines.push(`Run: \`${subtask.verificationCommand}\``);
      lines.push('');
    }
    lines.push('## Work Log');
    lines.push(`- **${new Date().toISOString().split('T')[0]}**: Created via Lead Agent Planning Session.`);
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Materializes planned subtasks as markdown cards in the board's Backlog folder.
   */
  public static writeSubtasksToBoard(
    boardBacklogDir: string,
    result: PlanningDecompositionResult
  ): string[] {
    if (!fs.existsSync(boardBacklogDir)) {
      fs.mkdirSync(boardBacklogDir, { recursive: true });
    }

    const createdFiles: string[] = [];
    for (const subtask of result.subtasks) {
      const sanitizedTitle = subtask.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      const filename = `${subtask.id}_${sanitizedTitle}.md`;
      const filePath = path.join(boardBacklogDir, filename);

      const content = this.formatTicketMarkdown(subtask, result.epicOrGoal);
      fs.writeFileSync(filePath, content, 'utf8');
      createdFiles.push(filePath);
    }

    return createdFiles;
  }
}
