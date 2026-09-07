import { ProviderRegistry, ProviderMetadata } from './providerEligibility';
import { BoardPoliciesConfig } from '../types';

export interface PolicyEvaluationInput {
  providerId: string;
  policies: BoardPoliciesConfig;
  role?: 'lead' | 'worker' | 'review';
}

export interface PolicyEvaluationResult {
  eligible: boolean;
  provider: ProviderMetadata;
  violations: string[];
  reasons: string[];
}

export class PolicyEngine {
  /**
   * Evaluates provider eligibility strictly against board configuration policies.
   * Order of evaluation: Policy Eligibility is checked first before capabilities or budget.
   */
  public static evaluateEligibility(input: PolicyEvaluationInput): PolicyEvaluationResult {
    const { providerId, policies } = input;
    const provider = ProviderRegistry.getProvider(providerId) || {
      id: providerId,
      displayName: providerId,
      region: 'GLOBAL',
      endpointHost: 'unknown',
      isLocalOnly: false,
      isAuditable: false,
      subprocessors: ['Unknown'],
      dataRetentionDays: -1
    };

    const violations: string[] = [];
    const reasons: string[] = [];

    // 1. Check Local-Only Policy
    if (policies.localOnly) {
      if (!provider.isLocalOnly) {
        violations.push(
          `Local-only policy violation: Provider '${provider.displayName}' connects to non-local host '${provider.endpointHost}'.`
        );
      } else {
        reasons.push(`Satisfies local-only policy (runs strictly on localhost).`);
      }
    }

    // 2. Check EU-Only Policy
    if (policies.euOnly) {
      const isEuOrLocal = provider.region === 'EU' || provider.region === 'LOCAL';
      if (!isEuOrLocal) {
        violations.push(
          `EU-only policy violation: Provider '${provider.displayName}' operates in region '${provider.region}' (must be EU or LOCAL).`
        );
      } else {
        reasons.push(`Satisfies EU-only policy (residency region: ${provider.region}).`);
      }
    }

    // 3. Check Strict Mode / Auditable Requirements
    if (policies.strictMode) {
      if (!provider.isAuditable) {
        violations.push(
          `Strict compliance violation: Provider '${provider.displayName}' has opaque routing or unknown network telemetry.`
        );
      }
      if (provider.endpointHost === 'unknown') {
        violations.push(
          `Strict compliance violation: Unknown endpoint destination for '${provider.displayName}'.`
        );
      }
    }

    const eligible = violations.length === 0;

    return {
      eligible,
      provider,
      violations,
      reasons: eligible ? reasons : violations
    };
  }

  /**
   * Filters a list of candidate providers to only those that pass policy eligibility.
   * Never falls back to an ineligible provider regardless of cost!
   */
  public static filterEligibleProviders(
    candidateIds: string[],
    policies: BoardPoliciesConfig
  ): { eligible: string[]; rejected: { providerId: string; violations: string[] }[] } {
    const eligible: string[] = [];
    const rejected: { providerId: string; violations: string[] }[] = [];

    for (const id of candidateIds) {
      const evalResult = this.evaluateEligibility({ providerId: id, policies });
      if (evalResult.eligible) {
        eligible.push(id);
      } else {
        rejected.push({ providerId: id, violations: evalResult.violations });
      }
    }

    return { eligible, rejected };
  }
}
