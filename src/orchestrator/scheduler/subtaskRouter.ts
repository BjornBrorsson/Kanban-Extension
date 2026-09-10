import { TaskCategory, ModelTierProfile, SubtaskRoutingConfig, BoardPoliciesConfig } from '../types';
import { PlannedSubtask } from '../lead/planningSession';

export interface ModelResolutionResult {
  profile: ModelTierProfile;
  category: TaskCategory;
  requestedTierId: string;
  effectiveTierId: string;
  isFallback: boolean;
  reason?: string;
}

export class SubtaskRouter {
  public static readonly DEFAULT_PROFILES: ModelTierProfile[] = [
    {
      id: 'fast-discovery',
      name: 'Gemma 4 E4B (Local / Fast)',
      model: 'gemma4:e4b',
      provider: 'ollama',
      costTier: 'free',
      recommendedFor: ['discovery', 'quick-fix']
    },
    {
      id: 'deep-reasoner',
      name: 'Fable / Astra (Deep Reasoning)',
      model: 'astra-reasoning-v1',
      provider: 'openai-compatible',
      costTier: 'high',
      recommendedFor: ['architecture', 'escalation']
    },
    {
      id: 'standard-coder',
      name: 'Claude 3.7 Sonnet / Copilot',
      model: 'claude-3-7-sonnet',
      provider: 'anthropic',
      costTier: 'medium',
      recommendedFor: ['implementation', 'verification', 'refactor']
    }
  ];

  public static readonly DEFAULT_ROUTING: SubtaskRoutingConfig = {
    defaultTier: 'standard-coder',
    categoryRoutes: {
      discovery: 'fast-discovery',
      'quick-fix': 'fast-discovery',
      architecture: 'deep-reasoner',
      escalation: 'deep-reasoner',
      implementation: 'standard-coder',
      verification: 'standard-coder',
      refactor: 'standard-coder'
    },
    fallbackTier: 'standard-coder'
  };

  /**
   * Classifies a planned subtask, ticket, or task description into a TaskCategory.
   */
  public static classify(task: {
    title?: string;
    objective?: string;
    summary?: string;
    labels?: string[];
    allowedScope?: string[];
  }): TaskCategory {
    const labels = (task.labels || []).map(l => l.toLowerCase());

    // 1. Explicit label matching
    if (labels.some(l => l.includes('discover') || l.includes('search') || l.includes('research') || l.includes('probe'))) {
      return 'discovery';
    }
    if (labels.some(l => l.includes('architect') || l.includes('design') || l.includes('spec') || l.includes('plan'))) {
      return 'architecture';
    }
    if (labels.some(l => l.includes('verify') || l.includes('test') || l.includes('qa') || l.includes('audit'))) {
      return 'verification';
    }
    if (labels.some(l => l.includes('quick-fix') || l.includes('typo') || l.includes('lint') || l.includes('whitespace'))) {
      return 'quick-fix';
    }
    if (labels.some(l => l.includes('refactor') || l.includes('cleanup'))) {
      return 'refactor';
    }
    if (labels.some(l => l.includes('escalat'))) {
      return 'escalation';
    }

    // 2. Text heuristics from title + objective + summary
    const combinedText = [
      task.title || '',
      task.objective || '',
      task.summary || ''
    ].join(' ').toLowerCase();

    if (/\b(discover|discovery|search|find|locate|inspect|explore|investigate|probe|survey|file listing)\b/i.test(combinedText)) {
      return 'discovery';
    }
    if (/\b(architect|architecture|decomposition|decompose|blueprint|high-level design|schema design|cycle resolution)\b/i.test(combinedText)) {
      return 'architecture';
    }
    if (/\b(verify|verification|assert|validate|validation|smoke test|unit test|integration test|regression|benchmark)\b/i.test(combinedText)) {
      return 'verification';
    }
    if (/\b(typo|lint|formatting|whitespace|rename symbol|docstring|comment fix)\b/i.test(combinedText)) {
      return 'quick-fix';
    }
    if (/\b(refactor|restructure|decouple|cleanup|clean up|migrate|migration)\b/i.test(combinedText)) {
      return 'refactor';
    }
    if (/\b(escalat|checkpoint takeover|lead resolution)\b/i.test(combinedText)) {
      return 'escalation';
    }

    // Default to standard implementation
    return 'implementation';
  }

  /**
   * Resolves the optimal ModelTierProfile for a given TaskCategory, taking into account:
   * - Configured subtask routing table
   * - Registered model tier profiles
   * - Policy constraints (local-only, EU-only)
   * - Automatic fallback handling
   */
  public static resolveModel(
    category: TaskCategory,
    routingConfig?: SubtaskRoutingConfig,
    availableTiers?: ModelTierProfile[],
    policies?: BoardPoliciesConfig
  ): ModelResolutionResult {
    const routing = routingConfig || this.DEFAULT_ROUTING;
    const profiles = (availableTiers && availableTiers.length > 0) ? availableTiers : this.DEFAULT_PROFILES;

    // 1. Determine requested tier ID
    const requestedTierId = routing.categoryRoutes?.[category] || routing.defaultTier || 'standard-coder';

    // 2. Locate preferred profile
    let profile = profiles.find(p => p.id.toLowerCase() === requestedTierId.toLowerCase());
    let isFallback = false;
    let reason: string | undefined;

    if (!profile) {
      // Fallback to defaultTier or first available profile
      profile = profiles.find(p => p.id.toLowerCase() === (routing.fallbackTier || routing.defaultTier).toLowerCase()) || profiles[0];
      isFallback = true;
      reason = `Preferred tier "${requestedTierId}" not found; fell back to "${profile.id}".`;
    }

    // 3. Policy Gating
    if (policies) {
      if (policies.localOnly) {
        const isLocal = profile.provider === 'ollama' || profile.provider === 'cli-bridge' || profile.costTier === 'free';
        if (!isLocal) {
          // Find a local profile
          const localProfile = profiles.find(p => p.provider === 'ollama' || p.provider === 'cli-bridge' || p.costTier === 'free');
          if (localProfile && localProfile.id !== profile.id) {
            reason = `Policy "localOnly" active; rerouted from cloud tier "${profile.id}" to local tier "${localProfile.id}".`;
            profile = localProfile;
            isFallback = true;
          }
        }
      }
    }

    return {
      profile,
      category,
      requestedTierId,
      effectiveTierId: profile.id,
      isFallback,
      reason
    };
  }
}
