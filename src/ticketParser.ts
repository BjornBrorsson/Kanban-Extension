import * as path from 'path';
import { Ticket, AcceptanceCriterion, WorkLogEntry } from './types';

export class TicketParser {
  public static parse(
    filePath: string,
    content: string,
    boardRoot: string,
    column: string,
    subfolder: string | null,
    mtime: number = Date.now()
  ): Ticket {
    const filename = path.basename(filePath);
    const relativePath = path.relative(boardRoot, filePath).replace(/\\/g, '/');

    // 1. Extract YAML frontmatter if present
    const { frontmatter, bodyWithoutFrontmatter } = this.extractFrontmatter(content);

    // 2. Extract Table Fields if present
    const tableFields = this.extractMarkdownTable(bodyWithoutFrontmatter);

    // 3. Extract Title and ID
    const { id, title } = this.extractIdAndTitle(filename, bodyWithoutFrontmatter, frontmatter, tableFields);

    // 4. Resolve Fields with cascading priority: Frontmatter -> Table -> Freeform Heuristics
    const status = frontmatter.status || tableFields['status'] || column;
    const priority = frontmatter.priority || tableFields['priority'] || 'Normal';
    const epic = frontmatter.epic || tableFields['epic'] || null;
    const type = frontmatter.type || tableFields['type'] || null;
    const estimate = frontmatter.estimate || tableFields['estimate'] || null;
    const milestone = frontmatter.milestone || tableFields['milestone'] || null;
    let assignee = frontmatter.assignee || tableFields['assignee'] || null;
    if (assignee && (assignee === '—' || assignee === '-' || assignee.toLowerCase() === 'unassigned' || assignee.toLowerCase() === 'none')) {
      assignee = null;
    }

    // 5. Parse Labels / Tags
    const labels = this.extractLabels(frontmatter, tableFields, bodyWithoutFrontmatter);

    // 6. Dependencies & Blocks
    const dependsOn = this.parseListField(frontmatter.dependsOn || tableFields['depends on'] || tableFields['dependson']);
    const blocks = this.parseListField(frontmatter.blocks || tableFields['blocks']);

    // 7. Extract Summary and Description
    const { summary, description } = this.extractSummaryAndDescription(bodyWithoutFrontmatter);

    // 8. Extract Acceptance Criteria / Checklist
    const acceptanceCriteria = this.extractAcceptanceCriteria(bodyWithoutFrontmatter);
    const doneCount = acceptanceCriteria.filter(a => a.done).length;

    // 9. Check for Work Log
    const hasWorkLog = /##\s+Work\s+Log/i.test(bodyWithoutFrontmatter);

    return {
      id,
      filename,
      path: filePath,
      relativePath,
      column,
      subfolder,
      title,
      summary,
      description,
      status,
      priority,
      epic,
      type,
      estimate,
      milestone,
      assignee,
      dependsOn,
      blocks,
      labels,
      acceptanceCriteria,
      progress: {
        done: doneCount,
        total: acceptanceCriteria.length
      },
      mtime,
      hasWorkLog
    };
  }

  private static extractFrontmatter(content: string): { frontmatter: Record<string, any>; bodyWithoutFrontmatter: string } {
    const trimmed = content.trim();
    if (!trimmed.startsWith('---')) {
      return { frontmatter: {}, bodyWithoutFrontmatter: content };
    }

    const secondIndex = trimmed.indexOf('---', 3);
    if (secondIndex === -1) {
      return { frontmatter: {}, bodyWithoutFrontmatter: content };
    }

    const yamlBlock = trimmed.slice(3, secondIndex).trim();
    const bodyWithoutFrontmatter = trimmed.slice(secondIndex + 3).trim();

    const frontmatter: Record<string, any> = {};
    const lines = yamlBlock.split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        let val = match[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        frontmatter[key] = val;
      }
    }

    return { frontmatter, bodyWithoutFrontmatter };
  }

  private static extractIdAndTitle(
    filename: string,
    body: string,
    frontmatter: Record<string, any>,
    tableFields: Record<string, string> = {}
  ): { id: string; title: string } {
    if (frontmatter.title) {
      const id = frontmatter.id || this.guessIdFromFilename(filename);
      return { id, title: frontmatter.title };
    }

    // Check if ID is in table
    const tableId = tableFields['id'] || tableFields['ticket id'];
    if (tableId) {
      const h1Match = body.match(/^#\s+(.+)$/m);
      return {
        id: tableId,
        title: h1Match ? h1Match[1].trim() : filename.replace(/\.md$/i, '')
      };
    }

    // Look for top H1 header: e.g. "# ATF-019 — Cleanup + audit-trail framework" or "# Title"
    const h1Match = body.match(/^#\s+(.+)$/m);
    if (h1Match) {
      const line = h1Match[1].trim();
      // Match pattern like "ATF-019 — Title" or "ACM-001 - Title" or "[TICK-123] Title"
      const dashMatch = line.match(/^([A-Za-z0-9_-]+)\s*(?:[—–\-\:]|\])\s*(.+)$/);
      if (dashMatch) {
        return {
          id: dashMatch[1].replace(/\[|\]/g, '').trim(),
          title: dashMatch[2].trim()
        };
      }
      return {
        id: this.guessIdFromFilename(filename),
        title: line
      };
    }

    // Fallback: format filename cleanly
    const id = this.guessIdFromFilename(filename);
    const cleanTitle = filename
      .replace(/\.md$/i, '')
      .replace(/^example[_-]ticket[_-]/i, '')
      .replace(/[_-]+/g, ' ')
      .trim();

    return {
      id,
      title: cleanTitle ? cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1) : filename
    };
  }

  private static guessIdFromFilename(filename: string): string {
    const match = filename.match(/^([A-Za-z]+[-_]\d+)/i);
    if (match) {
      return match[1].toUpperCase().replace('_', '-');
    }
    const numMatch = filename.match(/^(\d+)/);
    if (numMatch) {
      return `T-${numMatch[1]}`;
    }
    return filename.replace(/\.md$/i, '');
  }

  private static extractMarkdownTable(body: string): Record<string, string> {
    const result: Record<string, string> = {};
    const lines = body.split(/\r?\n/);
    let inTable = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        const cells = trimmed
          .slice(1, -1)
          .split('|')
          .map(c => c.trim());

        if (cells.length >= 2) {
          if (cells[0].includes('---') || cells[1].includes('---')) {
            inTable = true;
            continue;
          }
          if (inTable || trimmed.toLowerCase().includes('field') || trimmed.toLowerCase().includes('value')) {
            inTable = true;
            // Key is in cells[0], Value is in cells[1]
            const rawKey = cells[0].replace(/\*\*/g, '').replace(/__/g, '').trim().toLowerCase();
            const rawVal = cells[1].trim();
            if (rawKey && rawVal && rawKey !== 'field') {
              result[rawKey] = rawVal;
            }
          }
        }
      } else if (inTable && trimmed === '') {
        // Table ended
        break;
      }
    }

    return result;
  }

  private static extractLabels(
    frontmatter: Record<string, any>,
    tableFields: Record<string, string>,
    body: string
  ): string[] {
    const labels = new Set<string>();

    if (frontmatter.labels || frontmatter.tags) {
      const raw = frontmatter.labels || frontmatter.tags;
      if (Array.isArray(raw)) {
        raw.forEach(r => labels.add(String(r).trim()));
      } else if (typeof raw === 'string') {
        raw.split(/[,;\s]+/).forEach(r => r && labels.add(r.trim()));
      }
    }

    const tableLabelStr = tableFields['labels'] || tableFields['tags'] || tableFields['label'] || tableFields['tag'];
    if (tableLabelStr) {
      // Handles: `cleanup`, `audit`, `data-integrity` or cleanup, audit
      const extracted = tableLabelStr.match(/`([^`]+)`/g);
      if (extracted) {
        extracted.forEach(item => labels.add(item.replace(/`/g, '').trim()));
      } else {
        tableLabelStr.split(',').forEach(item => {
          const clean = item.replace(/[`"']/g, '').trim();
          if (clean && clean !== '—') labels.add(clean);
        });
      }
    }

    // Also look for hashtag labels like #bug, #refactor in the document
    const hashtags = body.match(/(?<=^|\s)#[a-zA-Z][a-zA-Z0-9_-]{2,}/g);
    if (hashtags) {
      hashtags.slice(0, 5).forEach(h => labels.add(h.trim()));
    }

    return Array.from(labels);
  }

  private static parseListField(raw: string | undefined): string[] {
    if (!raw || raw === '—' || raw === '-' || raw.toLowerCase() === 'none') {
      return [];
    }
    return raw
      .split(/[,;]+/)
      .map(s => s.replace(/[`"']/g, '').trim())
      .filter(s => s.length > 0 && s !== '—');
  }

  private static extractSummaryAndDescription(body: string): { summary: string; description: string } {
    let summary = '';
    let description = '';

    // Check for "## Summary" section
    const summaryMatch = body.match(/##\s+Summary\s*\r?\n([\s\S]*?)(?=\r?\n##\s+|$)/i);
    if (summaryMatch) {
      summary = summaryMatch[1].trim();
    }

    // Check for "## Description" section
    const descMatch = body.match(/##\s+Description\s*\r?\n([\s\S]*?)(?=\r?\n##\s+|$)/i);
    if (descMatch) {
      description = descMatch[1].trim();
    }

    // If no explicit summary section, extract first non-heading, non-table paragraph
    if (!summary) {
      const paragraphs = body.split(/\r?\n\r?\n/);
      for (const p of paragraphs) {
        const trimmed = p.trim();
        if (
          trimmed &&
          !trimmed.startsWith('#') &&
          !trimmed.startsWith('|') &&
          !trimmed.startsWith('---') &&
          !trimmed.startsWith('```')
        ) {
          summary = trimmed.replace(/\r?\n/g, ' ').slice(0, 240);
          break;
        }
      }
    }

    return { summary, description };
  }

  private static extractAcceptanceCriteria(body: string): AcceptanceCriterion[] {
    const results: AcceptanceCriterion[] = [];
    const checklistRegex = /^[\s>]*-\s*\[([ xX])\]\s+(.+)$/gm;
    let match: RegExpExecArray | null;

    while ((match = checklistRegex.exec(body)) !== null) {
      const isDone = match[1].toLowerCase() === 'x';
      const text = match[2].trim();
      results.push({
        text,
        done: isDone
      });
    }

    return results;
  }

  public static updateTicketStatus(content: string, newStatus: string): string {
    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    let updated = content;

    // Update markdown table row: e.g. `| **Status** | Backlog |` or `| Status | Backlog |`
    const tableRegex = /^(\|\s*\*{0,2}Status\*{0,2}\s*\|\s*)([^|\r\n]+?)(\s*\|.*)$/im;
    if (tableRegex.test(updated)) {
      updated = updated.replace(tableRegex, `$1${newStatus} |`);
      return updated;
    }

    // Update YAML frontmatter: `status: Backlog`
    const frontmatterRegex = /^(status\s*:\s*)([^\r\n]+)$/im;
    if (frontmatterRegex.test(updated)) {
      updated = updated.replace(frontmatterRegex, `$1${newStatus}`);
      return updated;
    }

    return updated;
  }

  public static updateTicketAssignee(content: string, newAssignee: string): string {
    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    let updated = content;
    const val = newAssignee && newAssignee.trim() ? newAssignee.trim() : '—';

    // 1. Update existing markdown table row: e.g. `| **Assignee** | Björn |` or `| Assignee | ... |`
    const tableAssigneeRegex = /^(\|\s*\*{0,2}Assignee\*{0,2}\s*\|\s*)([^|\r\n]+?)(\s*\|.*)$/im;
    if (tableAssigneeRegex.test(updated)) {
      updated = updated.replace(tableAssigneeRegex, `$1${val} |`);
      return updated;
    }

    // 2. If table exists with Status row, insert Assignee row after Status
    const statusRowRegex = /^(\|\s*\*{0,2}Status\*{0,2}\s*\|.*)$/im;
    if (statusRowRegex.test(updated)) {
      updated = updated.replace(statusRowRegex, `$1${eol}| **Assignee** | ${val} |`);
      return updated;
    }

    // 3. If table has other rows (Priority, Type, Epic, Field/Value divider), insert after the divider or row
    const dividerRegex = /^(\|[-:\s|]+[-:]+\|)$/im;
    if (dividerRegex.test(updated)) {
      updated = updated.replace(dividerRegex, `$1${eol}| **Assignee** | ${val} |`);
      return updated;
    }

    const anyTableRowRegex = /^(\|\s*\*{0,2}(?:Priority|Type|Epic|Estimate|Milestone)\*{0,2}\s*\|.*)$/im;
    if (anyTableRowRegex.test(updated)) {
      updated = updated.replace(anyTableRowRegex, `$1${eol}| **Assignee** | ${val} |`);
      return updated;
    }

    // 4. Update or insert into YAML frontmatter
    const frontmatterAssigneeRegex = /^(assignee\s*:\s*)([^\r\n]+)$/im;
    if (frontmatterAssigneeRegex.test(updated)) {
      updated = updated.replace(frontmatterAssigneeRegex, `$1${val === '—' ? '' : val}`);
      return updated;
    }

    // Check if YAML frontmatter exists without assignee
    const frontmatterBlockRegex = /^---\r?\n([\s\S]*?)\r?\n---/;
    const fmMatch = updated.match(frontmatterBlockRegex);
    if (fmMatch) {
      const fmContent = fmMatch[1];
      const newFm = `---${eol}${fmContent}${eol}assignee: ${val === '—' ? '' : val}${eol}---`;
      return updated.replace(frontmatterBlockRegex, newFm);
    }

    // 5. Freeform markdown: insert metadata table
    // If ticket starts with a # Heading, insert right after heading
    const headingRegex = /^(#\s+[^\r\n]+(?:\r?\n)+)/;
    const headingMatch = updated.match(headingRegex);
    const tableBlock = `| Field | Value |${eol}|-------|-------|${eol}| **Assignee** | ${val} |${eol}${eol}`;
    if (headingMatch) {
      return updated.replace(headingRegex, `${headingMatch[1]}${tableBlock}`);
    }

    // Otherwise prepend at top of document
    return `${tableBlock}${updated}`;
  }

  /**
   * Toggles the Nth acceptance criterion checkbox in the document.
   * Matches both `- [ ]` and `- [x]`, preserving indentation, prefix, and line endings.
   */
  public static toggleCriterion(content: string, index: number, done: boolean): string {
    if (index < 0) return content;
    const checklistRegex = /^([\s>]*-\s*\[)([ xX])(\]\s+.*)$/gm;
    let matchCount = 0;
    let match: RegExpExecArray | null;

    while ((match = checklistRegex.exec(content)) !== null) {
      if (matchCount === index) {
        const fullMatch = match[0];
        const matchIndex = match.index;
        const prefix = match[1];
        const suffix = match[3];
        const newChar = done ? 'x' : ' ';
        const updatedLine = `${prefix}${newChar}${suffix}`;
        return content.slice(0, matchIndex) + updatedLine + content.slice(matchIndex + fullMatch.length);
      }
      matchCount++;
    }

    return content;
  }

  /**
   * Scans ## Work Log in the ticket markdown content and extracts dated log entries.
   */
  public static extractWorkLogEntries(
    content: string,
    ticketId: string,
    ticketTitle: string,
    ticketPath: string,
    boardId: string,
    boardName: string
  ): WorkLogEntry[] {
    const entries: WorkLogEntry[] = [];
    const lines = content.split(/\r?\n/);
    let inWorkLog = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (/^##\s+Work\s+Log/i.test(trimmed)) {
        inWorkLog = true;
        continue;
      }

      if (inWorkLog) {
        if (/^##\s+[^#]/i.test(trimmed)) {
          break; // Another H2 section began
        }

        // Match dated entries: e.g. - **2026-09-04**: ... or * **2026-09-04** - ... or - 2026-09-04: ...
        const dateMatch = trimmed.match(/^[-*]\s+(?:\*\*)?(\d{4}[-/]\d{2}[-/]\d{2}(?:\s+\d{2}:\d{2})?)(?:\*\*)?[\s:\-—–]+(.*)$/);
        if (dateMatch) {
          const dateStr = dateMatch[1].trim();
          const text = dateMatch[2].trim();
          entries.push({
            date: dateStr,
            timestamp: Date.parse(dateStr) || undefined,
            boardId,
            boardName,
            ticketId,
            ticketTitle,
            ticketPath,
            text,
            line: i + 1
          });
        } else if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
          const text = trimmed.replace(/^[-*]\s+/, '').trim();
          if (text) {
            entries.push({
              date: 'Recent',
              boardId,
              boardName,
              ticketId,
              ticketTitle,
              ticketPath,
              text,
              line: i + 1
            });
          }
        }
      }
    }

    return entries;
  }
}
