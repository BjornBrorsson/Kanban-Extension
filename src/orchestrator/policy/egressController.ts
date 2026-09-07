import * as fs from 'fs';
import * as path from 'path';

export interface AuditLogEntry {
  timestamp: number;
  ticketId: string;
  attemptId: string;
  providerId: string;
  action: string;
  targetEndpoint: string;
  allowed: boolean;
  policyRule: string;
  payloadHash?: string;
}

export class EgressController {
  private readonly auditLogPath: string;

  constructor(public readonly workspaceRoot: string) {
    this.auditLogPath = path.join(workspaceRoot, '.agentic-kanban', 'runtime', 'audit.log');
  }

  /**
   * Validates whether outbound communication to an endpoint host is allowed by active policies.
   */
  public isEgressAllowed(params: {
    endpointHost: string;
    localOnly: boolean;
    euOnly: boolean;
    allowedDomains?: string[];
  }): { allowed: boolean; reason: string } {
    const { endpointHost, localOnly, euOnly, allowedDomains = [] } = params;
    const host = endpointHost.toLowerCase();

    // 1. Local-only checks: only localhost / 127.0.0.1 permitted
    if (localOnly) {
      if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
        return { allowed: true, reason: 'Allowed by local-only policy (loopback).' };
      }
      return { allowed: false, reason: `Egress blocked: Local-only policy prohibits external host '${endpointHost}'.` };
    }

    // 2. Explicit domain whitelist check
    if (allowedDomains.length > 0) {
      const match = allowedDomains.some(d => host === d.toLowerCase() || host.endsWith('.' + d.toLowerCase()));
      if (!match) {
        return { allowed: false, reason: `Egress blocked: Host '${endpointHost}' not in allowed domain whitelist.` };
      }
    }

    // 3. EU-only checks: block known non-EU regions if specified
    if (euOnly) {
      if (host.includes('us-') || host.endsWith('.us') || host.includes('global')) {
        return { allowed: false, reason: `Egress blocked: Non-EU regional endpoint '${endpointHost}' forbidden.` };
      }
    }

    return { allowed: true, reason: 'Endpoint egress allowed by policy.' };
  }

  /**
   * Generates environment variables for subprocess execution based on policy.
   * If localOnly, injects offline flags.
   */
  public getEnvironmentOverrides(localOnly: boolean): Record<string, string> {
    if (localOnly) {
      return {
        OFFLINE: '1',
        HF_HUB_OFFLINE: '1',
        TRANSFORMERS_OFFLINE: '1',
        NO_PROXY: '*',
        CURL_CA_BUNDLE: ''
      };
    }
    return {};
  }

  /**
   * Appends an audit entry to the local append-only audit.log.
   */
  public logAudit(entry: AuditLogEntry): void {
    try {
      const dir = path.dirname(this.auditLogPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const line = `[${new Date(entry.timestamp).toISOString()}] [${entry.allowed ? 'ALLOW' : 'DENY'}] ticket=${entry.ticketId} attempt=${entry.attemptId} provider=${entry.providerId} host=${entry.targetEndpoint} action=${entry.action} rule="${entry.policyRule}"\n`;
      fs.appendFileSync(this.auditLogPath, line, 'utf8');
    } catch {}
  }
}
