import * as cp from 'child_process';
import { AdapterCapabilities, ExecutionTier } from './types';

export interface KnownToolSpec {
  id: string;
  name: string;
  command: string;
  versionArgs: string[];
  defaultTier: ExecutionTier;
  supportsStructuredOutput: boolean;
  supportsResumableSessions: boolean;
  supportsTokenReporting: boolean;
  supportsCostLimits: boolean;
  supportsModelSelection: boolean;
  supportsNetworkRestrictions: boolean;
  supportsToolWhitelisting: boolean;
}

export const KNOWN_RUNNERS: KnownToolSpec[] = [
  {
    id: 'cline',
    name: 'Cline CLI',
    command: 'cline',
    versionArgs: ['--version'],
    defaultTier: 'managed',
    supportsStructuredOutput: true,
    supportsResumableSessions: false,
    supportsTokenReporting: true,
    supportsCostLimits: true,
    supportsModelSelection: true,
    supportsNetworkRestrictions: false,
    supportsToolWhitelisting: true
  },
  {
    id: 'copilot-cli',
    name: 'GitHub Copilot CLI',
    command: 'copilot',
    versionArgs: ['--version'],
    defaultTier: 'assisted',
    supportsStructuredOutput: false,
    supportsResumableSessions: false,
    supportsTokenReporting: false,
    supportsCostLimits: false,
    supportsModelSelection: false,
    supportsNetworkRestrictions: false,
    supportsToolWhitelisting: false
  },
  {
    id: 'devin-cli',
    name: 'Devin CLI',
    command: 'devin',
    versionArgs: ['--version'],
    defaultTier: 'managed',
    supportsStructuredOutput: true,
    supportsResumableSessions: true,
    supportsTokenReporting: true,
    supportsCostLimits: true,
    supportsModelSelection: true,
    supportsNetworkRestrictions: false,
    supportsToolWhitelisting: true
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    command: 'claude',
    versionArgs: ['--version'],
    defaultTier: 'assisted',
    supportsStructuredOutput: false,
    supportsResumableSessions: true,
    supportsTokenReporting: false,
    supportsCostLimits: false,
    supportsModelSelection: true,
    supportsNetworkRestrictions: false,
    supportsToolWhitelisting: false
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    command: 'gemini',
    versionArgs: ['--version'],
    defaultTier: 'assisted',
    supportsStructuredOutput: false,
    supportsResumableSessions: false,
    supportsTokenReporting: false,
    supportsCostLimits: false,
    supportsModelSelection: true,
    supportsNetworkRestrictions: false,
    supportsToolWhitelisting: false
  },
  {
    id: 'aider',
    name: 'Aider',
    command: 'aider',
    versionArgs: ['--version'],
    defaultTier: 'assisted',
    supportsStructuredOutput: false,
    supportsResumableSessions: false,
    supportsTokenReporting: true,
    supportsCostLimits: false,
    supportsModelSelection: true,
    supportsNetworkRestrictions: false,
    supportsToolWhitelisting: false
  }
];

export class CapabilityProbe {
  /**
   * Probes the local environment for a specific runner executable.
   */
  public static async probeRunner(spec: KnownToolSpec): Promise<AdapterCapabilities> {
    const isWindows = process.platform === 'win32';
    const checkCmd = isWindows ? `where ${spec.command}` : `which ${spec.command}`;

    try {
      const detectedPath = await this.execWithTimeout(checkCmd, 2000);
      const versionOutput = await this.execWithTimeout(`${spec.command} ${spec.versionArgs.join(' ')}`, 3000);
      const cleanVersion = versionOutput.trim().split(/\r?\n/)[0] || undefined;

      return {
        tier: spec.defaultTier,
        installed: true,
        version: cleanVersion,
        detectedPath: detectedPath.trim().split(/\r?\n/)[0],
        supportsStructuredOutput: spec.supportsStructuredOutput,
        supportsResumableSessions: spec.supportsResumableSessions,
        supportsTokenReporting: spec.supportsTokenReporting,
        supportsCostLimits: spec.supportsCostLimits,
        supportsModelSelection: spec.supportsModelSelection,
        supportsNetworkRestrictions: spec.supportsNetworkRestrictions,
        supportsToolWhitelisting: spec.supportsToolWhitelisting,
        notes: `Detected at ${detectedPath.trim().split(/\r?\n/)[0]}`
      };
    } catch {
      return {
        tier: 'assisted',
        installed: false,
        supportsStructuredOutput: false,
        supportsResumableSessions: false,
        supportsTokenReporting: false,
        supportsCostLimits: false,
        supportsModelSelection: false,
        supportsNetworkRestrictions: false,
        supportsToolWhitelisting: false,
        notes: `Executable "${spec.command}" not found in PATH.`
      };
    }
  }

  /**
   * Probes all known runners and returns a capability map.
   */
  public static async probeAllRunners(): Promise<Record<string, AdapterCapabilities>> {
    const results: Record<string, AdapterCapabilities> = {};
    for (const spec of KNOWN_RUNNERS) {
      results[spec.id] = await this.probeRunner(spec);
    }
    return results;
  }

  private static execWithTimeout(cmd: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      cp.exec(cmd, { timeout: timeoutMs }, (err, stdout) => {
        if (err) {
          reject(err);
        } else {
          resolve(stdout);
        }
      });
    });
  }
}
