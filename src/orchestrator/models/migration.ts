import * as fs from 'fs';
import * as path from 'path';

export interface MigrationResult {
  migrated: boolean;
  assignedId?: string;
  newFilename?: string;
  content: string;
}

export class TicketMigrationUtility {
  /**
   * Assigns a stable ID to a ticket if it lacks one, updating the file content
   * and optionally renaming the file to include the ID.
   */
  public static migrateTicketContent(
    content: string,
    existingId: string | null,
    generatedId: string
  ): MigrationResult {
    // If ticket already has a stable ID, do not modify
    if (existingId && existingId !== '—' && existingId !== '-') {
      return { migrated: false, assignedId: existingId, content };
    }

    let updatedContent = content;

    // Check if YAML frontmatter is present
    if (updatedContent.trim().startsWith('---')) {
      const secondIndex = updatedContent.indexOf('---', 3);
      if (secondIndex !== -1) {
        const frontmatter = updatedContent.slice(3, secondIndex);
        if (!/^\s*id\s*:/im.test(frontmatter)) {
          const newFrontmatter = `\nid: ${generatedId}` + frontmatter;
          updatedContent = `---${newFrontmatter}---` + updatedContent.slice(secondIndex + 3);
          return { migrated: true, assignedId: generatedId, content: updatedContent };
        }
      }
    }

    // Check if Markdown Table is present with ID row
    const idTableMatch = updatedContent.match(/(\|\s*\*\*ID\*\*\s*\|\s*)(.*?)(\s*\|)/i);
    if (idTableMatch) {
      const currentVal = idTableMatch[2].trim();
      if (!currentVal || currentVal === '—' || currentVal === '-') {
        updatedContent = updatedContent.replace(
          /(\|\s*\*\*ID\*\*\s*\|\s*)(.*?)(\s*\|)/i,
          `$1${generatedId}$3`
        );
        return { migrated: true, assignedId: generatedId, content: updatedContent };
      }
    }

    // Update Heading 1 if it lacks an ID prefix: e.g. "# Feature Title" -> "# TASK-001 — Feature Title"
    const h1Match = updatedContent.match(/^#\s+(.+)$/m);
    if (h1Match) {
      const title = h1Match[1].trim();
      if (!/^[A-Z0-9_-]+\s*—/i.test(title) && !/^[A-Z0-9_-]+\s*:\s*/i.test(title)) {
        updatedContent = updatedContent.replace(/^#\s+(.+)$/m, `# ${generatedId} — $1`);
        return { migrated: true, assignedId: generatedId, content: updatedContent };
      }
    }

    return { migrated: false, content };
  }

  /**
   * Scans existing tickets in a board directory and discovers the next available numeric sequence for a prefix.
   */
  public static getNextSequenceNumber(ticketFiles: string[], prefix: string): number {
    let maxSeq = 0;
    const regex = new RegExp(`^${prefix}-(\\d+)`, 'i');

    for (const f of ticketFiles) {
      const base = path.basename(f);
      const match = base.match(regex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxSeq) {
          maxSeq = num;
        }
      }
    }

    return maxSeq + 1;
  }
}
