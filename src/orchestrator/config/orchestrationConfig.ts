import { OrchestrationConfig, PolicyConfig, BudgetConfig, RoleBindings, OrchestrationSettings } from '../types';

export class OrchestrationConfigParser {
  /**
   * Extracts and parses the versioned fenced YAML block from config.md content.
   * Returns undefined if no orchestration YAML block is found or if it is disabled.
   */
  public static extractFromMarkdown(content: string): OrchestrationConfig | undefined {
    if (!content || !content.trim()) {
      return undefined;
    }

    // Match ```yaml or ```yml code block containing schemaVersion
    const yamlBlockMatch = content.match(/```(?:yaml|yml)\s*\r?\n([\s\S]*?)\r?\n```/i);
    if (!yamlBlockMatch) {
      return undefined;
    }

    const yamlText = yamlBlockMatch[1].trim();
    if (!yamlText.includes('schemaVersion')) {
      return undefined;
    }

    return this.parseYaml(yamlText);
  }

  /**
   * Parses the YAML text into a validated OrchestrationConfig structure.
   */
  public static parseYaml(yamlText: string): OrchestrationConfig {
    const raw = this.parseSimpleYaml(yamlText);

    const schemaVersion = Number(raw.schemaVersion) || 1;
    if (schemaVersion !== 1) {
      throw new Error(`Unsupported orchestration schemaVersion: ${raw.schemaVersion}. Supported versions: 1`);
    }

    const orchestrationRaw = (typeof raw.orchestration === 'object' && raw.orchestration !== null) ? raw.orchestration : {};
    const orchestration: OrchestrationSettings = {
      enabled: Boolean(orchestrationRaw.enabled === true || orchestrationRaw.enabled === 'true'),
      profile: typeof orchestrationRaw.profile === 'string' ? orchestrationRaw.profile : undefined,
      maxConcurrentWorkers: typeof orchestrationRaw.maxConcurrentWorkers === 'number'
        ? orchestrationRaw.maxConcurrentWorkers
        : (orchestrationRaw.maxConcurrentWorkers ? parseInt(String(orchestrationRaw.maxConcurrentWorkers), 10) : 1),
      completionTarget: (orchestrationRaw.completionTarget === 'reviewed-patch' || orchestrationRaw.completionTarget === 'local-build' || orchestrationRaw.completionTarget === 'pr')
        ? orchestrationRaw.completionTarget
        : 'reviewed-patch',
      retryLimit: typeof orchestrationRaw.retryLimit === 'number' ? orchestrationRaw.retryLimit : 1
    };

    let roles: RoleBindings | undefined;
    if (raw.roles && typeof raw.roles === 'object') {
      roles = {
        lead: typeof raw.roles.lead === 'string' ? raw.roles.lead : undefined,
        worker: typeof raw.roles.worker === 'string' ? raw.roles.worker : undefined,
        reviewer: typeof raw.roles.reviewer === 'string' ? raw.roles.reviewer : undefined
      };
    }

    let policies: Record<string, PolicyConfig> | undefined;
    if (raw.policies && typeof raw.policies === 'object') {
      policies = {};
      for (const [pName, pVal] of Object.entries(raw.policies)) {
        if (typeof pVal === 'object' && pVal !== null) {
          const pObj = pVal as any;
          const allowedExecRaw = Array.isArray(pObj.allowedExecution)
            ? pObj.allowedExecution
            : (typeof pObj.allowedExecution === 'string' ? pObj.allowedExecution.split(',').map((s: string) => s.trim()) : ['local']);

          policies[pName] = {
            allowedExecution: allowedExecRaw,
            unknownDestination: pObj.unknownDestination === 'allow' ? 'allow' : 'deny',
            allowedDataClasses: Array.isArray(pObj.allowedDataClasses) ? pObj.allowedDataClasses : undefined,
            allowedEndpoints: Array.isArray(pObj.allowedEndpoints) ? pObj.allowedEndpoints : undefined
          };
        }
      }
    }

    let budgets: BudgetConfig | undefined;
    if (raw.budgets && typeof raw.budgets === 'object') {
      const bObj = raw.budgets as any;
      budgets = {
        dailyCurrency: typeof bObj.dailyCurrency === 'string' ? bObj.dailyCurrency : 'EUR',
        dailyLimit: typeof bObj.dailyLimit === 'number' ? bObj.dailyLimit : parseFloat(bObj.dailyLimit) || undefined,
        reserveForReview: typeof bObj.reserveForReview === 'number' ? bObj.reserveForReview : parseFloat(bObj.reserveForReview) || 1,
        batchCeiling: typeof bObj.batchCeiling === 'number' ? bObj.batchCeiling : parseFloat(bObj.batchCeiling) || undefined,
        maxPerTicketSpend: typeof bObj.maxPerTicketSpend === 'number' ? bObj.maxPerTicketSpend : parseFloat(bObj.maxPerTicketSpend) || undefined
      };
    }

    return {
      schemaVersion: 1,
      orchestration,
      roles,
      policies,
      budgets
    };
  }

  /**
   * Lightweight indent-based YAML parser supporting objects, scalars, inline arrays [a, b], and list items.
   */
  public static parseSimpleYaml(yaml: string): Record<string, any> {
    const lines = yaml.split(/\r?\n/);
    const root: Record<string, any> = {};
    const stack: { indent: number; target: Record<string, any> | any[] }[] = [
      { indent: -1, target: root }
    ];

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const originalLine = lines[lineIndex];
      // Ignore comment lines or empty lines
      if (!originalLine.trim() || originalLine.trim().startsWith('#')) {
        continue;
      }

      const indent = originalLine.search(/\S/);
      const trimmed = originalLine.trim();

      // Pop stack to current indent level
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }

      const currentContext = stack[stack.length - 1].target;

      // Handle Key: Value or Key:
      const kvMatch = trimmed.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
      if (kvMatch) {
        const key = kvMatch[1];
        const valStr = kvMatch[2].trim();

        if (valStr === '') {
          // New nested object or list
          const newObj: Record<string, any> = {};
          if (Array.isArray(currentContext)) {
            currentContext.push({ [key]: newObj });
          } else {
            currentContext[key] = newObj;
          }
          stack.push({ indent, target: newObj });
        } else {
          // Parse value (scalar or inline array)
          const parsedVal = this.parseScalarOrInlineArray(valStr);
          if (Array.isArray(currentContext)) {
            currentContext.push({ [key]: parsedVal });
          } else {
            currentContext[key] = parsedVal;
          }
        }
        continue;
      }

      // Handle list item: - value or - key: value
      const listMatch = trimmed.match(/^-\s+(.*)$/);
      if (listMatch) {
        const itemContent = listMatch[1].trim();
        const subKv = itemContent.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
        if (subKv) {
          const itemKey = subKv[1];
          const itemVal = this.parseScalarOrInlineArray(subKv[2].trim());
          const itemObj = { [itemKey]: itemVal };
          if (Array.isArray(currentContext)) {
            currentContext.push(itemObj);
          }
        } else {
          const val = this.parseScalarOrInlineArray(itemContent);
          if (Array.isArray(currentContext)) {
            currentContext.push(val);
          }
        }
      }
    }

    return root;
  }

  private static parseScalarOrInlineArray(val: string): any {
    if (!val) return '';

    // Inline array: [a, b, c]
    if (val.startsWith('[') && val.endsWith(']')) {
      const inner = val.slice(1, -1).trim();
      if (!inner) return [];
      return inner.split(',').map(s => this.parseScalarOrInlineArray(s.trim()));
    }

    // Stripped quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      return val.slice(1, -1);
    }

    // Booleans
    if (val.toLowerCase() === 'true') return true;
    if (val.toLowerCase() === 'false') return false;

    // Numbers
    if (/^-?\d+(\.\d+)?$/.test(val)) {
      const num = Number(val);
      if (!isNaN(num)) return num;
    }

    return val;
  }
}
