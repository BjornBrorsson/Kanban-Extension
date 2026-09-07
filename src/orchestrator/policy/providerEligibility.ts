export type DataResidencyRegion = 'EU' | 'US' | 'LOCAL' | 'GLOBAL';

export interface ProviderMetadata {
  id: string;
  displayName: string;
  region: DataResidencyRegion;
  endpointHost: string;
  isLocalOnly: boolean;
  isAuditable: boolean;
  subprocessors: string[];
  dataRetentionDays: number;
}

export class ProviderRegistry {
  private static readonly registry: Map<string, ProviderMetadata> = new Map([
    [
      'ollama',
      {
        id: 'ollama',
        displayName: 'Ollama (Local Models)',
        region: 'LOCAL',
        endpointHost: 'localhost',
        isLocalOnly: true,
        isAuditable: true,
        subprocessors: [],
        dataRetentionDays: 0
      }
    ],
    [
      'llama.cpp',
      {
        id: 'llama.cpp',
        displayName: 'llama.cpp (Local Server)',
        region: 'LOCAL',
        endpointHost: 'localhost',
        isLocalOnly: true,
        isAuditable: true,
        subprocessors: [],
        dataRetentionDays: 0
      }
    ],
    [
      'fake-deterministic',
      {
        id: 'fake-deterministic',
        displayName: 'Fake Deterministic Test Runner',
        region: 'LOCAL',
        endpointHost: 'localhost',
        isLocalOnly: true,
        isAuditable: true,
        subprocessors: [],
        dataRetentionDays: 0
      }
    ],
    [
      'mistral-eu',
      {
        id: 'mistral-eu',
        displayName: 'Mistral AI (EU Endpoint)',
        region: 'EU',
        endpointHost: 'api.mistral.ai',
        isLocalOnly: false,
        isAuditable: true,
        subprocessors: ['Mistral AI SAS (France)'],
        dataRetentionDays: 30
      }
    ],
    [
      'claude-eu',
      {
        id: 'claude-eu',
        displayName: 'Anthropic Claude (EU Residency)',
        region: 'EU',
        endpointHost: 'api.anthropic.com',
        isLocalOnly: false,
        isAuditable: true,
        subprocessors: ['AWS Europe (Frankfurt)', 'GCP Europe (Belgium)'],
        dataRetentionDays: 30
      }
    ],
    [
      'claude-global',
      {
        id: 'claude-global',
        displayName: 'Anthropic Claude (Global)',
        region: 'GLOBAL',
        endpointHost: 'api.anthropic.com',
        isLocalOnly: false,
        isAuditable: true,
        subprocessors: ['Anthropic PBC (US)'],
        dataRetentionDays: 30
      }
    ],
    [
      'openai-global',
      {
        id: 'openai-global',
        displayName: 'OpenAI GPT-4o (Global)',
        region: 'GLOBAL',
        endpointHost: 'api.openai.com',
        isLocalOnly: false,
        isAuditable: true,
        subprocessors: ['OpenAI LLC (US)'],
        dataRetentionDays: 30
      }
    ],
    [
      'opaque-cli',
      {
        id: 'opaque-cli',
        displayName: 'Unspecified Remote CLI (Opaque Routing)',
        region: 'GLOBAL',
        endpointHost: 'unknown',
        isLocalOnly: false,
        isAuditable: false,
        subprocessors: ['Unknown'],
        dataRetentionDays: -1
      }
    ]
  ]);

  public static getProvider(providerId: string): ProviderMetadata | undefined {
    return this.registry.get(providerId.toLowerCase());
  }

  public static registerProvider(metadata: ProviderMetadata): void {
    this.registry.set(metadata.id.toLowerCase(), metadata);
  }

  public static getAllProviders(): ProviderMetadata[] {
    return Array.from(this.registry.values());
  }
}
