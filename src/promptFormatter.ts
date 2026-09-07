import * as path from 'path';
import { Ticket, BoardConfig } from './types';

export class PromptFormatter {
  public static readonly DEFAULT_TEMPLATE = `Please review and work on ticket **{id}: {title}** located at \`{relative_path}\`.

### Summary
{summary}

### Key Acceptance Criteria
{acceptance_criteria}

### Instructions
1. Inspect the codebase and execute the necessary changes.
2. Verify that all acceptance criteria are met and pass tests.
3. Record your timestamped progress under \`## Work Log\` in the ticket file.
4. Move the ticket to \`{completed_path}\` once done.`;

  /**
   * Formats a structured agent prompt for a ticket based on board config or default template.
   */
  public static formatPrompt(
    ticket: Ticket,
    boardConfig?: BoardConfig | null,
    workspaceRoot?: string,
    boardRoot?: string
  ): string {
    // 1. Determine relative path
    let relPath = ticket.relativePath || ticket.filename;
    if (workspaceRoot && ticket.path) {
      const calculated = path.relative(workspaceRoot, ticket.path).replace(/\\/g, '/');
      if (!calculated.startsWith('..')) {
        relPath = calculated;
      }
    } else if (boardRoot && ticket.path) {
      const boardDirName = path.basename(boardRoot);
      const fromBoard = path.relative(boardRoot, ticket.path).replace(/\\/g, '/');
      relPath = `${boardDirName}/${fromBoard}`;
    }

    // 2. Determine completed column path for instruction
    let completedPath = 'Tickets/Completed/';
    if (boardRoot && workspaceRoot) {
      const relBoard = path.relative(workspaceRoot, boardRoot).replace(/\\/g, '/');
      completedPath = (relBoard && relBoard !== '.') ? `${relBoard}/Completed/` : 'Completed/';
    } else if (ticket.column) {
      const colSubstr = '/' + ticket.column + '/';
      const colIdx = relPath.indexOf(colSubstr);
      if (colIdx !== -1) {
        completedPath = `${relPath.slice(0, colIdx)}/Completed/`;
      } else if (relPath.startsWith(ticket.column + '/')) {
        completedPath = 'Completed/';
      }
    }

    // 3. Format acceptance criteria
    let criteriaText = '';
    if (ticket.acceptanceCriteria && ticket.acceptanceCriteria.length > 0) {
      criteriaText = ticket.acceptanceCriteria
        .map(c => `- [${c.done ? 'x' : ' '}] ${c.text}`)
        .join('\n');
    } else {
      criteriaText = '- [ ] Implement requirements as specified in ticket.';
    }

    // 4. Determine template to use
    const template = (boardConfig?.agentPromptTemplate && boardConfig.agentPromptTemplate.trim())
      ? boardConfig.agentPromptTemplate.trim()
      : this.DEFAULT_TEMPLATE;

    const summaryText = ticket.summary || ticket.title;
    const descriptionText = ticket.description || ticket.summary || ticket.title;

    // 5. Build replacement dictionary
    const replacements: Record<string, string> = {
      '{id}': ticket.id || '',
      '{ticket_id}': ticket.id || '',
      '{title}': ticket.title || '',
      '{ticket_title}': ticket.title || '',
      '{relative_path}': relPath,
      '{ticket_rel_path}': relPath,
      '{path}': ticket.path || '',
      '{ticket_path}': ticket.path || '',
      '{summary}': summaryText,
      '{ticket_summary}': summaryText,
      '{description}': descriptionText,
      '{ticket_description}': descriptionText,
      '{acceptance_criteria}': criteriaText,
      '{criteria}': criteriaText,
      '{key_acceptance_criteria}': criteriaText,
      '{column}': ticket.column || '',
      '{ticket_column}': ticket.column || '',
      '{subfolder}': ticket.subfolder || '',
      '{priority}': ticket.priority || 'Normal',
      '{assignee}': ticket.assignee || 'Unassigned',
      '{epic}': ticket.epic || '',
      '{estimate}': ticket.estimate || '',
      '{completed_path}': completedPath
    };

    let result = template;
    for (const [placeholder, value] of Object.entries(replacements)) {
      result = result.split(placeholder).join(value);
    }

    return result;
  }
}
